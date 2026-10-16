import test from 'node:test';import assert from 'node:assert/strict';import {runOne} from '../src/worker.ts';import {backoff,processReport} from '../src/domain.ts';import type {ClaimedJob,WorkStore} from '../src/domain.ts';
const job:ClaimedJob={id:'x',claim_token:'token',attempts:1,max_attempts:3,correlation_id:'c',request:{type:'report',payload:{values:[1,2,3]},maxAttempts:3}};
test('report output and bounded exponential backoff',async()=>{assert.deepEqual(await processReport(job.request),{count:3,sum:6,average:2});assert.equal(backoff(1),1000);assert.equal(backoff(100),60000);});
test('worker settles success and failure exactly once',async()=>{
 const finishes:unknown[][]=[];const s:WorkStore={claim:async()=>job,finish:async(...args)=>{finishes.push(args);return true;}};
 assert.equal(await runOne(s),true);assert.deepEqual(finishes[0]?.[1],{count:3,sum:6,average:2});
 await runOne(s,async()=>{throw new Error('broken');});assert.equal(finishes[1]?.[2],'broken');assert.equal(finishes.length,2);
});
test('timeout aborts cooperative work and records failure',async()=>{
 let aborted=false;let error:string|undefined;
 const s:WorkStore={claim:async()=>job,finish:async(_j,_r,e)=>{error=e;return true;}};
 await runOne(s,async(_j,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve(null);})),10);
 assert.ok(aborted);assert.equal(error,'Job timed out');
});
test('no work does not settle anything; persistence errors propagate',async()=>{
 assert.equal(await runOne({claim:async()=>undefined,finish:async()=>{throw new Error('unexpected');}}),false);
 await assert.rejects(runOne({claim:async()=>job,finish:async()=>{throw new Error('db down');}}),/db down/);
});
