import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ConflictError, backoff } from './domain.ts';
import type { JobRequest, ClaimedJob, Store, WorkStore } from './domain.ts';
export class PgStore implements Store, WorkStore {
  pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  async ready() { await this.pool.query('SELECT 1'); }
  async submit(key: string, request: JobRequest, correlationId: string) {
    const inserted = await this.pool.query(`INSERT INTO jobs(id,idempotency_key,request,correlation_id,max_attempts) VALUES($1,$2,$3,$4,$5) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,[randomUUID(),key,request,correlationId,request.maxAttempts]);
    if (inserted.rows[0]) return {job:inserted.rows[0],created:true};
    const existing = await this.pool.query('SELECT *, request = $2::jsonb AS same FROM jobs WHERE idempotency_key=$1',[key,request]);
    if (!existing.rows[0]?.same) throw new ConflictError('Idempotency key already used with different input');
    const {same, ...job} = existing.rows[0]; return {job,created:false};
  }
  async get(id: string) { return (await this.pool.query('SELECT * FROM jobs WHERE id=$1',[id])).rows[0]; }
  async history(id: string) { return (await this.pool.query('SELECT * FROM attempts WHERE job_id=$1 ORDER BY number',[id])).rows; }
  async claim(leaseMs: number): Promise<ClaimedJob | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query(`SELECT * FROM jobs WHERE (status IN ('queued','retry_wait') AND available_at<=clock_timestamp()) OR (status='running' AND lease_until<=clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) { await client.query('COMMIT'); return; }
      if (row.status === 'running') {
        await client.query("UPDATE attempts SET finished_at=clock_timestamp(),outcome='lease_expired',error='Worker lease expired' WHERE job_id=$1 AND number=$2 AND finished_at IS NULL",[row.id,row.attempts]);
      }
      if (row.attempts >= row.max_attempts) {
        await client.query("UPDATE jobs SET status='dead',error='Attempt limit reached after lease expiry',claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",[row.id]);
        await client.query('COMMIT'); return;
      }
      const token=randomUUID();
      const job=(await client.query(`UPDATE jobs SET status='running',attempts=attempts+1,claim_token=$2,lease_until=clock_timestamp()+$3*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[row.id,token,leaseMs])).rows[0];
      await client.query('INSERT INTO attempts(job_id,number,claim_token) VALUES($1,$2,$3)',[row.id,job.attempts,token]);
      await client.query('COMMIT'); return job;
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async finish(job: ClaimedJob, result: unknown, error?: string): Promise<boolean> {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const status=error !== undefined ? (job.attempts>=job.max_attempts?'dead':'retry_wait'):'succeeded';
      const updated=await client.query(`UPDATE jobs SET status=$3,result=$4,error=$5,claim_token=NULL,lease_until=NULL,available_at=clock_timestamp()+$6*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1 AND status='running' AND claim_token=$2 AND lease_until>clock_timestamp() RETURNING id`,[job.id,job.claim_token,status,error !== undefined?null:JSON.stringify(result ?? null),error??null,backoff(job.attempts)]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query('UPDATE attempts SET finished_at=clock_timestamp(),outcome=$3,error=$4 WHERE job_id=$1 AND number=$2',[job.id,job.attempts,error !== undefined?'failed':'succeeded',error??null]);
      await client.query('COMMIT'); return true;
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
}
