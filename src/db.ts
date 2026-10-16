import { Pool } from 'pg';
export function openPool(){
 if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL (copy .env.example to .env for local development)');
 return new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:3000});
}
