import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';import {PgStore} from '../../src/store.ts';import type {JobRequest} from '../../src/domain.ts';
test('Postgres lifecycle, idempotency, competing claims, retries and stale completion fencing',async()=>{
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; integration tests do not silently skip');
 const schema='test_'+randomUUID().replaceAll('-','');const admin=new Pool({connectionString:process.env.DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`});const s=new PgStore(pool);
 try{
 await pool.query(await readFile(new URL('../../migrations/001_jobs.sql',import.meta.url),'utf8'));
 const request:JobRequest={type:'report',payload:{values:[1,2]},maxAttempts:2};
 const first=await s.submit('key',request,randomUUID());assert.equal(first.created,true);
 const duplicates=await Promise.all(Array.from({length:4},()=>s.submit('key',request,randomUUID())));assert.ok(duplicates.every(r=>!r.created&&r.job.id===first.job.id));
 await assert.rejects(s.submit('key',{...request,maxAttempts:3},randomUUID()),/different input/);
 const claims=await Promise.all([s.claim(10000),s.claim(10000)]);assert.equal(claims.filter(Boolean).length,1);const a=claims.find(Boolean)!;
 assert.equal(await s.finish(a,null,'retry'),true);assert.equal((await s.get(a.id))?.status,'retry_wait');assert.equal(await s.claim(10000),undefined);
 await pool.query("UPDATE jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.id]);
 const b=(await s.claim(10000))!;assert.equal(b.attempts,2);assert.equal(await s.finish(a,{}),false);assert.equal(await s.finish(b,null,'exhausted'),true);assert.equal((await s.get(a.id))?.status,'dead');assert.equal((await s.history(a.id)).length,2);
 const next=await s.submit('next',request,randomUUID());const expired=(await s.claim(10000))!;assert.equal(expired.id,next.job.id);
 await pool.query("UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.id]);
 assert.equal(await s.finish(expired,{}),false);const recovered=(await s.claim(10000))!;assert.notEqual(recovered.claim_token,expired.claim_token);assert.equal(await s.finish(recovered,{sum:3}),true);assert.equal((await s.get(recovered.id))?.status,'succeeded');
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
