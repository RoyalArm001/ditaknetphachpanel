'use strict';
const {randomBytes}=require('node:crypto');
function createViewLinks(store){
  const pool=store.pool,db=store.db;
  if(!pool&&db)db.exec('CREATE TABLE IF NOT EXISTS view_links(token TEXT PRIMARY KEY,scope TEXT NOT NULL,company_id TEXT NOT NULL,title TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,pdf BLOB NOT NULL)');
  return {
    async create(scope,company,title,pdf,days){
      const token=randomBytes(32).toString('hex'),now=Date.now(),expires=now+days*86400000;
      // Expired copies have no remaining viewers; discard them on the next creation.
      if(pool){
        await pool.query('DELETE FROM rackmap.view_links WHERE expires_at <= $1',[now]);
        await pool.query('INSERT INTO rackmap.view_links VALUES($1,$2,$3,$4,$5,$6,$7)',[token,scope,company,title,now,expires,pdf]);
      }else{
        db.prepare('DELETE FROM view_links WHERE expires_at <= ?').run(now);
        db.prepare('INSERT INTO view_links VALUES(?,?,?,?,?,?,?)').run(token,scope,company,title,now,expires,pdf);
      }
      return {token,title,createdAt:now,expiresAt:expires};
    },
    async list(scope,company){
      const rows=pool?(await pool.query('SELECT token,title,created_at,expires_at FROM rackmap.view_links WHERE scope=$1 AND company_id=$2 AND expires_at>$3 ORDER BY created_at DESC',[scope,company,Date.now()])).rows:db.prepare('SELECT token,title,created_at,expires_at FROM view_links WHERE scope=? AND company_id=? AND expires_at>? ORDER BY created_at DESC').all(scope,company,Date.now());
      return rows.map(r=>({token:r.token,title:r.title,createdAt:Number(r.created_at),expiresAt:Number(r.expires_at)}));
    },
    async get(token){
      const row=pool?(await pool.query('SELECT pdf FROM rackmap.view_links WHERE token=$1 AND expires_at>$2',[token,Date.now()])).rows[0]:db.prepare('SELECT pdf FROM view_links WHERE token=? AND expires_at>?').get(token,Date.now());
      return row?Buffer.from(row.pdf):null;
    },
    async revoke(scope,company,token){
      if(pool)await pool.query('DELETE FROM rackmap.view_links WHERE scope=$1 AND company_id=$2 AND token=$3',[scope,company,token]);
      else db.prepare('DELETE FROM view_links WHERE scope=? AND company_id=? AND token=?').run(scope,company,token);
    }
  };
}
module.exports={createViewLinks};
