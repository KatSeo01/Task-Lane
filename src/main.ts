import { buildApi } from './api.ts';
import { openPool } from './db.ts';
import { PgStore } from './store.ts';
const pool=openPool();const app=buildApi(new PgStore(pool),true);
app.addHook('onClose',async()=>{await pool.end();});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void app.close();});
await app.listen({port:Number(process.env.PORT??3000),host:'127.0.0.1'});
