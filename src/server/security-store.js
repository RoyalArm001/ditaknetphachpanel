'use strict';
const {createHash}=require('node:crypto');
const ready=new WeakMap();
function securityStore(store){
  const {pool,db}=store;
  async function ensure(){
    const key=pool||db;if(!key)throw new Error('Persistent security storage required');
    if(!ready.has(key)){
      const setup=pool?pool.query(require('node:fs').readFileSync(require('node:path').join(__dirname,'../../migrations/011-session-audit.sql'),'utf8')):Promise.resolve().then(()=>db.exec(`CREATE TABLE IF NOT EXISTS active_pin_sessions(namespace TEXT NOT NULL,actor TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(namespace,actor));
        CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,space TEXT NOT NULL,owner TEXT NOT NULL,actor TEXT NOT NULL,ip TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL);`));
      ready.set(key,setup.catch(error=>{ready.delete(key);throw error;}));
    }
    await ready.get(key);
  }
  const digest=nonce=>createHash('sha256').update(nonce).digest('hex');
  return {
    async claim(namespace,actor,nonce){await ensure();const hash=digest(nonce);if(pool)await pool.query('INSERT INTO rackmap.active_pin_sessions(namespace,actor,digest) VALUES($1,$2,$3) ON CONFLICT(namespace,actor) DO UPDATE SET digest=excluded.digest',[namespace,actor,hash]);else db.prepare('INSERT INTO active_pin_sessions VALUES(?,?,?) ON CONFLICT(namespace,actor) DO UPDATE SET digest=excluded.digest').run(namespace,actor,hash);},
    async valid(namespace,actor,nonce){if(typeof nonce!=='string'||!nonce)return false;await ensure();const hash=digest(nonce);return pool?!!(await pool.query('SELECT 1 FROM rackmap.active_pin_sessions WHERE namespace=$1 AND actor=$2 AND digest=$3',[namespace,actor,hash])).rows.length:!!db.prepare('SELECT 1 FROM active_pin_sessions WHERE namespace=? AND actor=? AND digest=?').get(namespace,actor,hash);},
    async append({space,owner='',actor,ip='',action,target=''}){await ensure();const values=[new Date().toISOString(),space,owner,String(actor).slice(0,200),String(ip).slice(0,100),String(action).slice(0,100),String(target).slice(0,200)];if(pool)await pool.query('INSERT INTO rackmap.audit_log(created_at,space,owner,actor,ip,action,target) VALUES($1,$2,$3,$4,$5,$6,$7)',values);else db.prepare('INSERT INTO audit_log(created_at,space,owner,actor,ip,action,target) VALUES(?,?,?,?,?,?,?)').run(...values);},
    async list(space,owner='',before=Number.MAX_SAFE_INTEGER){await ensure();const cursor=Number(before);if(!Number.isSafeInteger(cursor)||cursor<1)throw new Error('Invalid audit cursor');return pool?(await pool.query('SELECT * FROM rackmap.audit_log WHERE space=$1 AND owner=$2 AND id<$3 ORDER BY id DESC LIMIT 100',[space,owner,cursor])).rows:db.prepare('SELECT * FROM audit_log WHERE space=? AND owner=? AND id<? ORDER BY id DESC LIMIT 100').all(space,owner,cursor);}
  };
}
module.exports={securityStore};
