'use strict';
function openLocalRepository(options){
  const store=require('./storage').openStore(options),{db}=store;
  const read=id=>{const x=db.prepare('SELECT revision,body FROM companies WHERE id=?').get(id);return x?{revision:x.revision,state:JSON.parse(x.body),companyId:id}:null;};
  return {...store,cloud:false,read,
    list:()=>db.prepare('SELECT id,revision,body FROM companies ORDER BY rowid').all().map(x=>{const s=JSON.parse(x.body);return {id:x.id,revision:x.revision,name:s.company,floorCount:s.floors.length};}),
    create:(id,state)=>db.prepare('INSERT INTO companies VALUES(?,?,?)').run(id,0,JSON.stringify(state)),
    save:(id,state,revision)=>{
      db.exec('BEGIN IMMEDIATE');
      try{const current=read(id);if(current.revision!==revision){db.exec('ROLLBACK');return {conflict:true,revision:current.revision};}
        db.prepare('INSERT INTO company_history VALUES(?,?,?,?)').run(id,current.revision,new Date().toISOString(),JSON.stringify(current.state));
        db.prepare('DELETE FROM company_history WHERE company_id=? AND revision < ?').run(id,current.revision-49);
        db.prepare('UPDATE companies SET revision=?,body=? WHERE id=?').run(revision+1,JSON.stringify(state),id);
        db.exec('COMMIT');return {revision:revision+1};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    history:id=>db.prepare('SELECT revision,saved_at FROM company_history WHERE company_id=? ORDER BY revision DESC').all(id),
    version:(id,revision)=>{const x=db.prepare('SELECT body FROM company_history WHERE company_id=? AND revision=?').get(id,revision);return x?{state:JSON.parse(x.body)}:null;},
    pinAttempt:key=>{const now=Date.now();db.prepare('DELETE FROM pin_attempts WHERE started_at < ?').run(now-900000);return db.prepare('INSERT INTO pin_attempts(key,attempts,started_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').get(key,now).attempts;},
    pinReset:key=>db.prepare('DELETE FROM pin_attempts WHERE key=?').run(key),
    close:()=>db.close()
  };
}
module.exports={openLocalRepository};
