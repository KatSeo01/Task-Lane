import test from 'node:test';import assert from 'node:assert/strict';
import { buildApi } from '../src/api.ts';import { ConflictError } from '../src/domain.ts';import type { Store } from '../src/domain.ts';
const store:Store={ready:async()=>{},submit:async(key,request,c)=>({created:true,job:{id:'00000000-0000-4000-8000-000000000001',request,correlation_id:c}}),get:async()=>undefined,history:async()=>[]};
test('API validates input and applies bounded retry default',async()=>{
 const app=buildApi(store);try{
 assert.equal((await app.inject({method:'POST',url:'/jobs',payload:{type:'report',payload:{values:[1]}}})).statusCode,400);
 const r=await app.inject({method:'POST',url:'/jobs',headers:{'idempotency-key':'x'},payload:{type:'report',payload:{values:[1,2]}}});assert.equal(r.statusCode,201);assert.equal(r.json().request.maxAttempts,3);
 assert.equal((await app.inject({method:'POST',url:'/jobs',headers:{'idempotency-key':'x'},payload:{type:'report',payload:{values:[]},maxAttempts:9}})).statusCode,400);
 }finally{await app.close();}
});
test('API maps missing jobs, malformed ids, conflicts and readiness errors',async()=>{
 const app=buildApi({...store,ready:async()=>{throw new Error('offline');},submit:async()=>{throw new ConflictError('different input');}});try{
 assert.equal((await app.inject('/jobs/not-a-uuid')).statusCode,400);
 assert.equal((await app.inject('/jobs/00000000-0000-4000-8000-000000000001')).statusCode,404);
 assert.equal((await app.inject('/health/ready')).statusCode,503);
 assert.equal((await app.inject('/health/live')).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:'/jobs',headers:{'idempotency-key':'x'},payload:{type:'report',payload:{values:[]}}})).statusCode,409);
 }finally{await app.close();}
});
