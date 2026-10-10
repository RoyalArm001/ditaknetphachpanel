'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createPool}=require('../src/server/cloud-store');
async function verify(pool){
  const {rows}=await pool.query("SELECT schedule,command,active FROM cron.job WHERE jobname='rackmap-hourly-backup'");
  if(rows.length!==1||!rows[0].active||rows[0].schedule!=='0 * * * *'||rows[0].command!=='SELECT rackmap.capture_automatic_backup();')throw new Error('Hourly backup job verification failed');
  const definition=(await pool.query("SELECT pg_get_functiondef('rackmap.capture_automatic_backup()'::regprocedure) AS source")).rows[0].source;
  if(!definition.includes("pg_try_advisory_xact_lock(hashtext('hourly_cloud_backup'))"))throw new Error('Backup advisory lock missing');
  const a=await pool.connect();let b;
  try{
    b=await pool.connect();
    await a.query('BEGIN');await b.query('BEGIN');
    const sql="SELECT pg_try_advisory_xact_lock(hashtext('hourly_cloud_backup')) AS acquired";
    if(!(await a.query(sql)).rows[0].acquired||(await b.query(sql)).rows[0].acquired)throw new Error('Advisory lock contention check failed');
  }finally{await Promise.allSettled([a.query('ROLLBACK'),b?.query('ROLLBACK')]);a.release();b?.release();}
  return {cron:true,advisoryLock:true};
}
async function apply(pool){
  const version=(await pool.query('SELECT max(version) AS version FROM rackmap.schema_version')).rows[0].version;
  if(Number(version)<9)throw new Error('Apply migrations 001–009 first');
  // The migration owns its transaction; failures roll back the snapshot and cron changes.
  const client=await pool.connect();
  try{await client.query("SET statement_timeout='120s'");await client.query(fs.readFileSync(path.join(__dirname,'../migrations/010-automatic-backups.sql'),'utf8'));await client.query(fs.readFileSync(path.join(__dirname,'../migrations/011-session-audit.sql'),'utf8'));}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return verify(pool);
}
async function e2e(pool,env=process.env){
  if(!env.CLOUD_VERIFY_URL||!env.CLOUD_VERIFY_COOKIE)throw new Error('Set CLOUD_VERIFY_URL and CLOUD_VERIFY_COOKIE for authenticated cloud API verification');
  const base=new URL(env.CLOUD_VERIFY_URL);if(base.protocol!=='https:'||base.username||base.password)throw new Error('CLOUD_VERIFY_URL must be an HTTPS origin');
  const id=(await pool.query('SELECT rackmap.capture_automatic_backup() AS id')).rows[0].id;
  if(!id)throw new Error('Snapshot capture is busy; retry later');
  const get=async route=>{const url=new URL(route,base);url.searchParams.set('company',env.CLOUD_VERIFY_COMPANY||'default');if(env.CLOUD_VERIFY_SPACE==='account')url.searchParams.set('space','account');const response=await fetch(url,{headers:{Cookie:env.CLOUD_VERIFY_COOKIE},redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Cloud API ${route} returned ${response.status}`);return response.json();};
  const status=await get('/api/backup/status'),list=await get('/api/backup/list');
  if(!status.enabled||!status.healthy)throw new Error('Cloud backup status is not healthy');
  if(!Array.isArray(list)||!list.some(row=>String(row.id)===String(id)))throw new Error('New snapshot is missing from authenticated list');
  return {snapshotCreated:true,statusHealthy:true,snapshotListed:true};
}
async function main(){
  const raw=process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_URL_NON_POOLING||(/^postgres(?:ql)?:/.test(process.env.SUPABASE_URL||'')?process.env.SUPABASE_URL:'');
  if(!raw)throw new Error('Set DATABASE_URL to the Supabase PostgreSQL connection URI; an HTTPS project URL is insufficient');
  const pool=createPool({...process.env,POSTGRES_URL:raw});
  try{const result=process.argv.includes('--verify-only')?await verify(pool):await apply(pool);if(process.argv.includes('--e2e'))Object.assign(result,await e2e(pool));console.log(JSON.stringify({verifiedAt:new Date().toISOString(),...result}));}
  finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error('Backup verification failed:',error.code||error.message);process.exitCode=1;});
module.exports={apply,verify,e2e};
