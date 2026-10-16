import { setTimeout } from 'node:timers/promises';
import { openPool } from './db.ts';
import { PgStore } from './store.ts';
import { runOne } from './worker.ts';
const pool=openPool();const store=new PgStore(pool);
const concurrency=Number(process.env.WORKER_CONCURRENCY??2);
if(!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>32)throw new Error('WORKER_CONCURRENCY must be 1..32');
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;});
try{await Promise.all(Array.from({length:concurrency},async()=>{while(!stopping){try{if(!await runOne(store))await setTimeout(250);}catch(e){console.error(JSON.stringify({event:'worker_error',message:e instanceof Error?e.message:String(e)}));await setTimeout(1000);}}}));}finally{await pool.end();}
