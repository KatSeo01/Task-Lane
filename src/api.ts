import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ConflictError } from './domain.ts';
import type { Store, JobRequest } from './domain.ts';
const uuid={type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'};
export function buildApi(store: Store, logger = false) {
 const app=Fastify({logger,bodyLimit:64*1024});
 app.setErrorHandler<FastifyError>((error,request,reply)=>{
   if(error instanceof ConflictError) return reply.code(409).send({error:error.message});
   if(error.validation || (error.statusCode && error.statusCode<500)) return reply.code(error.statusCode??400).send({error:error.message});
   request.log.error(error); return reply.code(503).send({error:'Service temporarily unavailable'});
 });
 app.get('/health/live',async()=>({status:'ok'}));
 app.get('/health/ready',async()=>{await store.ready();return {status:'ok'};});
 app.post<{Body:JobRequest;Headers:{'idempotency-key':string}}>('/jobs',{schema:{headers:{type:'object',required:['idempotency-key'],properties:{'idempotency-key':{type:'string',minLength:1,maxLength:128}}},body:{type:'object',additionalProperties:false,required:['type','payload'],properties:{type:{const:'report'},maxAttempts:{type:'integer',minimum:1,maximum:5,default:3},payload:{type:'object',additionalProperties:false,required:['values'],properties:{values:{type:'array',maxItems:1000,items:{type:'number'}}}}}}}},async(req,reply)=>{
   const correlationId=randomUUID();
   const {job,created}=await store.submit(req.headers['idempotency-key'],req.body,correlationId);
   reply.header('location',`/jobs/${job.id}`).header('x-correlation-id',String(job.correlation_id??correlationId));
   return reply.code(created?201:200).send(job);
 });
 app.get<{Params:{id:string}}>('/jobs/:id',{schema:{params:{type:'object',required:['id'],properties:{id:uuid}}}},async(req,reply)=>{
   const job=await store.get(req.params.id);return job??reply.code(404).send({error:'Job not found'});
 });
 app.get<{Params:{id:string}}>('/jobs/:id/attempts',{schema:{params:{type:'object',required:['id'],properties:{id:uuid}}}},async(req,reply)=>{
   if(!await store.get(req.params.id))return reply.code(404).send({error:'Job not found'});
   return store.history(req.params.id);
 });
 return app;
}
