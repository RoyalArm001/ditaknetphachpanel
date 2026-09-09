'use strict';
const D=require('../shared/domain'),{randomInt,randomBytes,createHash}=require('node:crypto');
const {hashPin,verifyPin,createPinAuth}=require('./pin-auth');
// A separate set of tables keeps personal records out of team lists and exports.
function accountStore(pool,userId){
  if(!userId)throw new Error('Account identity required');
  const query=(sql,args=[])=>pool.query(sql,[userId,...args]);
  return {
    cloud:true,directory:'My Patch',database:'Personal cloud',backups:'JSON',
    list:async()=>(await query("SELECT id,revision,body->>'company' AS name,jsonb_array_length(body->'floors') AS \"floorCount\" FROM rackmap.personal_companies WHERE user_id=$1 ORDER BY id")).rows,
    read:async id=>{const row=(await query('SELECT revision,body FROM rackmap.personal_companies WHERE user_id=$1 AND id=$2',[id])).rows[0];return row?{revision:row.revision,state:row.body,companyId:id}:null;},
    create:async(id,state)=>{D.validate(state);await query('INSERT INTO rackmap.personal_companies(user_id,id,body) VALUES($1,$2,$3)',[id,JSON.stringify(state)]);},
    save:async(id,state,revision)=>{
      D.validate(state);const client=await pool.connect();
      try{await client.query('BEGIN');
        const current=(await client.query('SELECT revision,body FROM rackmap.personal_companies WHERE user_id=$1 AND id=$2 FOR UPDATE',[userId,id])).rows[0];
        if(!current)throw new Error('Company not found');
        if(current.revision!==revision){await client.query('ROLLBACK');return {conflict:true,revision:current.revision};}
        await client.query('INSERT INTO rackmap.personal_history(user_id,company_id,revision,body) VALUES($1,$2,$3,$4)',[userId,id,revision,JSON.stringify(current.body)]);
        await client.query('DELETE FROM rackmap.personal_history WHERE user_id=$1 AND company_id=$2 AND revision<$3',[userId,id,revision-49]);
        await client.query('UPDATE rackmap.personal_companies SET body=$3,revision=$4 WHERE user_id=$1 AND id=$2',[userId,id,JSON.stringify(state),revision+1]);
        await client.query('COMMIT');return {revision:revision+1};
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },
    history:async id=>(await query('SELECT revision,saved_at FROM rackmap.personal_history WHERE user_id=$1 AND company_id=$2 ORDER BY revision DESC',[id])).rows,
    version:async(id,revision)=>{const row=(await query('SELECT body FROM rackmap.personal_history WHERE user_id=$1 AND company_id=$2 AND revision=$3',[id,revision])).rows[0];return row?{state:row.body}:null;},
    backup:async()=>{const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const companies=(await client.query('SELECT id,revision,body FROM rackmap.personal_companies WHERE user_id=$1',[userId])).rows;const history=(await client.query('SELECT company_id,revision,saved_at,body FROM rackmap.personal_history WHERE user_id=$1',[userId])).rows;await client.query('COMMIT');return {format:'ditaknet-rackmap-cloud',version:1,companies,history};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  };
}
function createAccounts(store){
  const pool=store.pool,cookieName='mypatch_recovery';
  const configure=async row=>{if(!row)return null;const secret=(await pool.query('SELECT secret FROM rackmap.pin_session_config')).rows[0]?.secret;if(!secret)return null;return createPinAuth(store,{cookieName,env:{RACKMAP_SESSION_SECRET:secret,RACKMAP_PIN_HASHES:JSON.stringify({[row.user_id]:row.pin_hash})}});};
  return {
    async provision(user,rotate=false){
      if(!rotate&&(await pool.query('SELECT 1 FROM rackmap.personal_accounts WHERE user_id=$1',[user.id])).rows.length)return null;
      await pool.query('INSERT INTO rackmap.pin_session_config(singleton,secret) VALUES(true,$1) ON CONFLICT DO NOTHING',[randomBytes(32).toString('hex')]);
      const pin=String(randomInt(100000000000,1000000000000)),hash=await hashPin(pin);
      const profile=[user.full_name||user.fullName||'',user.phone||'',user.username||''];
      const result=rotate?await pool.query('UPDATE rackmap.personal_accounts SET pin_hash=$2,email=$3,full_name=$4,phone=$5,username=$6 WHERE user_id=$1 RETURNING user_id',[user.id,hash,user.email.toLowerCase(),...profile]):await pool.query('INSERT INTO rackmap.personal_accounts(user_id,email,pin_hash,full_name,phone,username) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO NOTHING RETURNING user_id',[user.id,user.email.toLowerCase(),hash,...profile]);
      await pool.query('INSERT INTO rackmap.personal_companies(user_id,id,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,'default',JSON.stringify(D.empty())]);
      return result.rows.length?pin:null;
    },
    async emailForLogin(identifier){
      if(typeof identifier!=='string')return null;
      const row=(await pool.query('SELECT email FROM rackmap.personal_accounts WHERE lower(email)=lower($1) OR lower(username)=lower($1) LIMIT 1',[identifier.trim()])).rows[0];
      return row?.email||null;
    },
    async login(req,res,email,pin){
      const ip=process.env.VERCEL==='1'?req.headers['x-real-ip']||'unknown':req.socket?.remoteAddress||'unknown';
      const key=createHash('sha256').update('personal-recovery:'+ip).digest('hex');
      if(await store.pinAttempt(key)>5)return {limited:true};
      if(typeof pin!=='string'||!/^\d{8,12}$/.test(pin))return null;
      const rows=(await pool.query('SELECT user_id,pin_hash FROM rackmap.personal_accounts')).rows;
      let row=null;
      for(const candidate of rows)if(await verifyPin(pin,candidate.pin_hash)){row=candidate;break;}
      const auth=await configure(row),result=await auth?.login(req,res,pin);
      if(result&&!result.limited){await store.pinReset(key);return {...result,method:'recovery'};}return result||null;
    },
    async authenticate(req){
      const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if(!token||token.length>500)return null;
      let id;try{id=JSON.parse(Buffer.from(token.split('.')[0],'base64url')).id;}catch{return null;}
      if(typeof id!=='string'||id.length>64)return null;
      const row=(await pool.query('SELECT user_id,pin_hash FROM rackmap.personal_accounts WHERE user_id=$1',[id])).rows[0];
      const user=(await configure(row))?.authenticate(req);return user?{...user,method:'recovery'}:null;
    },
    clear(res){const current=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...current,`${cookieName}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`]);},
    scope:userId=>accountStore(pool,userId)
  };
}
module.exports={accountStore,createAccounts};
