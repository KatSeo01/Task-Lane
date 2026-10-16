import type { WorkStore, ClaimedJob } from './domain.ts';
import { processReport } from './domain.ts';
export async function runOne(store: WorkStore, processor: (job: ClaimedJob,signal:AbortSignal)=>Promise<unknown> = j=>processReport(j.request), timeoutMs=5000): Promise<boolean> {
 const job=await store.claim(timeoutMs+5000); if(!job)return false;
 const controller=new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 let result:unknown; let failure:string|undefined;
 try {
   result=await Promise.race([Promise.resolve().then(()=>processor(job,controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Job timed out'));},timeoutMs);})]);
 } catch(e) { failure=(e instanceof Error?e.message:String(e)).slice(0,2000); }
 finally {clearTimeout(timer);}
 await store.finish(job,result,failure);return true;
}
