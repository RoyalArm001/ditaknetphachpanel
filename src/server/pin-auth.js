'use strict';
const {randomBytes,scrypt,timingSafeEqual,createHmac,createHash}=require('node:crypto');
const derive=require('node:util').promisify(scrypt);
async function hashPin(pin){
  if(!/^\d{8,12}$/.test(pin))throw new Error('PIN must contain 8–12 digits');
  const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(pin,salt,32)).toString('hex');
}
async function verifyPin(pin,stored){
  if(typeof pin!=='string'||!/^\d{8,12}$/.test(pin)||typeof stored!=='string')return false;
  const [salt,digest]=stored.split(':');
  if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(digest))return false;
  const actual=await derive(pin,salt,32);
  return equalHex(actual.toString('hex'),digest);
}
function equalHex(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function createPinAuth(store,{env=process.env,secure=true,now=()=>Date.now(),cookieName='rackmap_pin'}={}){
  const secret=env.RACKMAP_SESSION_SECRET;
  const hashes=env.RACKMAP_PIN_HASHES?JSON.parse(env.RACKMAP_PIN_HASHES):{};
  if(!hashes||typeof hashes!=='object'||Array.isArray(hashes))throw new Error('Invalid PIN server configuration');
  if(env.RACKMAP_PIN_HASH)hashes['staff-pin']=env.RACKMAP_PIN_HASH;
  const entries=Object.entries(hashes);
  if(!entries.length)return null;
  if(entries.length>20||!entries.every(([id,hash])=>/^[a-zA-Z0-9_-]{1,64}$/.test(id)&&typeof hash==='string'&&/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash))||!secret||secret.length<32)throw new Error('Invalid PIN server configuration');
  const fingerprint=hash=>createHash('sha256').update(hash).digest('hex').slice(0,16);
  const signature=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
  function cookie(res,value,age){const previous=res.getHeader?.('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),`${cookieName}=${value}; Path=/api; HttpOnly; ${secure?'Secure; ':''}SameSite=Strict; Max-Age=${age}`]);}
  return {
    enabled:async()=>true,
    authenticate(req){
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      if(!token||token.length>500)return null;
      const [payload,mac]=token.split('.');if(!payload||!mac||!equal(signature(payload),mac))return null;
      try{const data=JSON.parse(Buffer.from(payload,'base64url')),id=data.id||'staff-pin';return Object.hasOwn(hashes,id)&&data.version===fingerprint(hashes[id])&&data.exp>now()&&data.exp<=now()+8*60*60*1000?{id,method:'pin'}:null;}catch{return null;}
    },
    async login(req,res,pin){
      const ip=env.VERCEL==='1'?req.headers['x-real-ip']||'unknown':req.socket?.remoteAddress||'unknown';
      const key=createHmac('sha256',secret).update('pin:'+ip).digest('hex');
      if(await store.pinAttempt(key)>5)return {limited:true};
      if(typeof pin!=='string'||!/^\d{8,12}$/.test(pin))return null;
      const matches=await Promise.all(entries.map(async([id,hash])=>{const [salt,digest]=hash.split(':');return equal((await derive(pin,salt,32)).toString('hex'),digest)?id:null;}));
      const id=matches.find(Boolean);if(!id)return null;
      await store.pinReset(key);
      const payload=Buffer.from(JSON.stringify({id,exp:now()+8*60*60*1000,version:fingerprint(hashes[id]),nonce:randomBytes(12).toString('hex')})).toString('base64url');
      cookie(res,payload+'.'+signature(payload),28800);return {id,method:'pin'};
    },
    clear:res=>cookie(res,'',0)
  };
}
function createDatabasePinAuth(store,options={}){
  const resolve=async()=>{const config=await store.pinConfiguration();return config?createPinAuth(store,{...options,env:config}):null;};
  return {
    enabled:()=>store.pinEnabled(),
    authenticate:async req=>{if(!/(?:^|;\s*)rackmap_pin=/.test(req.headers.cookie||''))return null;return (await resolve())?.authenticate(req)||null;},
    login:async(req,res,pin)=>(await resolve())?.login(req,res,pin)||null,
    clear:res=>{const previous=res.getHeader?.('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),`rackmap_pin=; Path=/api; HttpOnly; ${options.secure===false?'':'Secure; '}SameSite=Strict; Max-Age=0`]);}
  };
}
module.exports={hashPin,verifyPin,createPinAuth,createDatabasePinAuth};
