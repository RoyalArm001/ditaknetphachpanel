'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const D=require('../shared/domain');
const SCHEMA_VERSION=3;
function snapshot(db,destination){
  const pending=destination+'.pending';
  db.prepare('VACUUM INTO ?').run(pending);
  const check=new DatabaseSync(pending,{readOnly:true});
  try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}finally{check.close();}
  fs.renameSync(pending,destination);
  return destination;
}
function openStore(options={}){
  const directory=path.resolve(options.dataDir||process.env.RACKMAP_DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'RackMap'));
  const database=path.join(directory,'rackmap.sqlite'),backups=path.join(directory,'backups');
  fs.mkdirSync(backups,{recursive:true});
  const legacy=options.legacyPath||(!options.dataDir?path.join(__dirname,'../../data','rackmap.sqlite'):null);
  if(!fs.existsSync(database)&&legacy&&path.resolve(legacy)!==database&&fs.existsSync(legacy)){
    const source=new DatabaseSync(legacy,{readOnly:true});
    try{snapshot(source,database);}finally{source.close();}
  }
  const db=new DatabaseSync(database);
  try{
    db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed; original files were not reset');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if(version>SCHEMA_VERSION)throw new Error('Database was created by a newer RackMap version. Use the newer application.');
    const timestamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
    if(version<SCHEMA_VERSION){
      snapshot(db,path.join(backups,`before-schema-${SCHEMA_VERSION}-${timestamp()}.sqlite`));
      db.exec('BEGIN IMMEDIATE');
      try{
        db.exec('CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (revision INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, body TEXT NOT NULL);');
        db.prepare('INSERT OR IGNORE INTO project VALUES(1,0,?)').run(JSON.stringify(D.empty()));
        db.exec("CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS company_history (company_id TEXT NOT NULL, revision INTEGER NOT NULL, saved_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(company_id,revision)); INSERT OR IGNORE INTO companies SELECT 'default',revision,body FROM project WHERE id=1; INSERT OR IGNORE INTO company_history SELECT 'default',revision,saved_at,body FROM history;");
        for(const row of db.prepare('SELECT body FROM companies').all())D.validate(JSON.parse(row.body));
        db.exec('CREATE TABLE IF NOT EXISTS pin_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, started_at INTEGER NOT NULL)');
        db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT`);
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    db.exec('PRAGMA journal_mode=WAL;');
    const backup=()=>snapshot(db,path.join(backups,`rackmap-${timestamp()}.sqlite`));
    backup();
    return {db,directory,database,backups,backup};
  }catch(e){db.close();throw e;}
}
module.exports={openStore,snapshot,SCHEMA_VERSION};
