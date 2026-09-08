'use strict';
const fs=require('node:fs');
const D=require('./domain');
function createPool(env=process.env){
  env=require('./env-config').normalizeEnv(env);
  const raw=env.POSTGRES_URL||env.POSTGRES_URL_NON_POOLING;
  if(!raw)throw new Error('POSTGRES_URL is required for cloud storage');
  const url=new URL(raw);for(const k of ['sslmode','sslcert','sslkey','sslrootcert','pgbouncer','supa'])url.searchParams.delete(k);
  return new (require('pg').Pool)({connectionString:url.toString(),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,statement_timeout:20000,ssl:{rejectUnauthorized:true,...(env.POSTGRES_SSL_CA_PEM?{ca:env.POSTGRES_SSL_CA_PEM.replace(/\\n/g,'\n')}:(env.POSTGRES_SSL_CA?{ca:fs.readFileSync(env.POSTGRES_SSL_CA,'utf8')}:{}))}});
}
function openCloudStore(options={}){
  const pool=options.pool||createPool();
  const read=async id=>{const {rows}=await pool.query('SELECT revision,body FROM rackmap.companies WHERE id=$1',[id]);return rows[0]?{revision:Number(rows[0].revision),state:rows[0].body,companyId:id}:null;};
  return {cloud:true,pool,read,directory:'Supabase',database:'Supabase PostgreSQL · rackmap',backups:'Վերջին 50 փոփոխությունները և JSON արտահանում',
    list:async()=>{const {rows}=await pool.query("SELECT id,revision,body->>'company' AS name,jsonb_array_length(body->'floors') AS count FROM rackmap.companies ORDER BY created_at,id");return rows.map(x=>({id:x.id,revision:Number(x.revision),name:x.name,floorCount:Number(x.count)}));},
    create:async(id,state)=>{D.validate(state);await pool.query('INSERT INTO rackmap.companies(id,revision,body) VALUES($1,0,$2)',[id,JSON.stringify(state)]);},
    save:async(id,state,revision)=>{
      D.validate(state);const client=await pool.connect();
      try{await client.query('BEGIN');const {rows}=await client.query('SELECT revision,body FROM rackmap.companies WHERE id=$1 FOR UPDATE',[id]);const current=rows[0];
        if(!current)throw new Error('Company not found');
        if(Number(current.revision)!==revision){await client.query('ROLLBACK');return {conflict:true,revision:Number(current.revision)};}
        await client.query('INSERT INTO rackmap.company_history(company_id,revision,body) VALUES($1,$2,$3)',[id,revision,JSON.stringify(current.body)]);
        await client.query('DELETE FROM rackmap.company_history WHERE company_id=$1 AND revision < $2',[id,revision-49]);
        await client.query('UPDATE rackmap.companies SET revision=$2,body=$3 WHERE id=$1',[id,revision+1,JSON.stringify(state)]);
        await client.query('COMMIT');return {revision:revision+1};
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    history:async id=>(await pool.query('SELECT revision,saved_at FROM rackmap.company_history WHERE company_id=$1 ORDER BY revision DESC',[id])).rows.map(x=>({revision:Number(x.revision),saved_at:x.saved_at})),
    version:async(id,revision)=>{const {rows}=await pool.query('SELECT body FROM rackmap.company_history WHERE company_id=$1 AND revision=$2',[id,revision]);return rows[0]?{state:rows[0].body}:null;},
    backup:async()=>{const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const companies=(await client.query('SELECT id,revision,body FROM rackmap.companies ORDER BY id')).rows;const history=(await client.query('SELECT company_id,revision,saved_at,body FROM rackmap.company_history ORDER BY company_id,revision')).rows;await client.query('COMMIT');return {format:'ditaknet-rackmap-cloud',version:1,exportedAt:new Date().toISOString(),companies,history};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
    pinAttempt:async key=>{await pool.query("DELETE FROM rackmap.pin_attempts WHERE started_at < now()-interval '15 minutes'");return (await pool.query('INSERT INTO rackmap.pin_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=rackmap.pin_attempts.attempts+1 RETURNING attempts',[key])).rows[0].attempts;},
    pinReset:key=>pool.query('DELETE FROM rackmap.pin_attempts WHERE key=$1',[key]),
    close:()=>pool.end()
  };
}
module.exports={createPool,openCloudStore};
