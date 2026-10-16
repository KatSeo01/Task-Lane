import { readFile } from 'node:fs/promises';
import { openPool } from './db.ts';
const pool=openPool();
try {await pool.query(await readFile(new URL('../migrations/001_jobs.sql',import.meta.url),'utf8'));console.log('Migration complete');}finally{await pool.end();}
