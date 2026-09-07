'use strict';
const fs=require('node:fs'),path=require('node:path');
const D=require('../domain');
const {createPool,openCloudStore}=require('../cloud-store');
async function importArchive(pool,archive){
  if(archive.format!=='ditaknet-rackmap-cloud'||archive.version!==1||!Array.isArray(archive.companies)||!Array.isArray(archive.history))throw new Error('Invalid archive');
  const ids=new Set();for(const x of archive.companies){D.validate(x.body);if(Buffer.byteLength(JSON.stringify(x.body))>4*1024*1024-2048)throw new Error('Company exceeds cloud request size; reduce photos before import');if(typeof x.id!=='string'||!/^[\w-]{1,80}$/.test(x.id)||ids.has(x.id)||!Number.isInteger(x.revision)||x.revision<0)throw new Error('Invalid company');ids.add(x.id);}
  for(const x of archive.history){D.validate(x.body);if(!ids.has(x.company_id)||!Number.isInteger(x.revision)||x.revision<0||!Number.isFinite(Date.parse(x.saved_at)))throw new Error('Invalid history');}
  const client=await pool.connect();let inserted=0;
  try{await client.query('BEGIN');await client.query('LOCK TABLE rackmap.companies IN EXCLUSIVE MODE');
    for(const x of archive.companies){const {rows}=await client.query('SELECT revision,body FROM rackmap.companies WHERE id=$1',[x.id]);
      if(rows.length){
        const same=Number(rows[0].revision)===x.revision&&require('node:util').isDeepStrictEqual(rows[0].body,x.body);
        if(!same)throw new Error('Destination contains different company data; import rolled back');
      }else{await client.query('INSERT INTO rackmap.companies(id,revision,body) VALUES($1,$2,$3)',[x.id,x.revision,JSON.stringify(x.body)]);inserted++;}
    }
    for(const x of archive.history){const {rows}=await client.query('SELECT body FROM rackmap.company_history WHERE company_id=$1 AND revision=$2',[x.company_id,x.revision]);
      if(rows.length){if(!require('node:util').isDeepStrictEqual(rows[0].body,x.body))throw new Error('Destination history differs; import rolled back');}
      else await client.query('INSERT INTO rackmap.company_history(company_id,revision,saved_at,body) VALUES($1,$2,$3,$4)',[x.company_id,x.revision,x.saved_at,JSON.stringify(x.body)]);
    }
    // Compare server-decoded JSON before committing: no silent partial migration.
    for(const x of archive.companies){const {rows}=await client.query('SELECT revision,body FROM rackmap.companies WHERE id=$1',[x.id]);if(Number(rows[0].revision)!==x.revision||!require('node:util').isDeepStrictEqual(rows[0].body,x.body))throw new Error('Verification failed');}
    await client.query('COMMIT');return inserted;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
function sqliteArchive(filename){
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.resolve(filename),{readOnly:true});
  try{db.exec('BEGIN');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Source integrity check failed');
    const companies=db.prepare('SELECT id,revision,body FROM companies ORDER BY id').all().map(x=>({...x,body:JSON.parse(x.body)}));
    const history=db.prepare('SELECT company_id,revision,saved_at,body FROM company_history ORDER BY company_id,revision').all().map(x=>({...x,body:JSON.parse(x.body)}));
    db.exec('COMMIT');return {format:'ditaknet-rackmap-cloud',version:1,exportedAt:new Date().toISOString(),companies,history};
  }finally{db.close();}
}
async function main(){
  const [command,file]=process.argv.slice(2);const pool=createPool();
  try{
    if(command==='migrate'){const exists=await pool.query("SELECT to_regclass('rackmap.schema_version') AS name");let version=0;if(exists.rows[0].name)version=(await pool.query('SELECT max(version) AS version FROM rackmap.schema_version')).rows[0].version||0;if(version>2)throw new Error('Newer cloud schema');for(const [n,file] of [[1,'001-cloud.sql'],[2,'002-pin.sql']])if(version<n)await pool.query(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8'));console.log('Cloud schema ready. Existing company data unchanged.');}
    else if(command==='init'){await pool.query('INSERT INTO rackmap.companies(id,revision,body) SELECT $1,0,$2 WHERE NOT EXISTS(SELECT 1 FROM rackmap.companies)',['default',JSON.stringify(D.empty())]);console.log('Empty cloud initialized if needed.');}
    else if(command==='import-sqlite'||command==='restore'){
      if(!file)throw new Error('Source file required');const archive=command==='import-sqlite'?sqliteArchive(file):JSON.parse(fs.readFileSync(file,'utf8'));
      const backupDir=process.env.RACKMAP_CLOUD_BACKUP_DIR||path.join(process.env.LOCALAPPDATA||require('node:os').homedir(),'RackMap','cloud-backups');fs.mkdirSync(backupDir,{recursive:true});
      const snapshot=path.join(backupDir,'before-cloud-import-'+Date.now()+'.json');fs.writeFileSync(snapshot,JSON.stringify(archive),{flag:'wx',mode:0o600});
      const n=await importArchive(pool,archive);console.log('Import verified. New companies: '+n+'. Source snapshot: '+snapshot);
    }else if(command==='export'){
      if(!file)throw new Error('Output file required');fs.writeFileSync(path.resolve(file),JSON.stringify(await openCloudStore({pool}).backup()),{flag:'wx',mode:0o600});console.log('Cloud archive exported.');
    }else throw new Error('Commands: migrate | init | import-sqlite FILE | restore FILE | export FILE');
  }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error('Cloud operation failed:',e.code||e.message);process.exitCode=1;});
module.exports={importArchive,sqliteArchive};
