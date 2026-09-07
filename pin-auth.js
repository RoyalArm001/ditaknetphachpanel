'use strict';
const {randomBytes,scrypt,timingSafeEqual,createHmac,createHash}=require('node:crypto');
const derive=require('node:util').promisify(scrypt);
async function hashPin(pin){
  if(!/^\d{8,12}$/.test(pin))throw new Error('PIN must contain 8–12 digits');
  const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(pin,salt,32)).toString('hex');
}
function createPinAuth(store,{env=process.env,secure=true,now=()=>Date.now()}={}){
  const hash=env.RACKMAP_PIN_HASH,secret=env.RACKMAP_SESSION_SECRET;
  if(!hash)return null;
  if(!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash)||!secret||secret.length<32)throw new Error('Invalid PIN server configuration');
  const fingerprint=createHash('sha256').update(hash).digest('hex').slice(0,16);
  const signature=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
  function cookie(res,value,age){const previous=res.getHeader?.('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),`rackmap_pin=${value}; Path=/api; HttpOnly; ${secure?'Secure; ':''}SameSite=Strict; Max-Age=${age}`]);}
  return {
    authenticate(req){
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('rackmap_pin='))?.slice(12);
      if(!token||token.length>500)return null;
      const [payload,mac]=token.split('.');if(!payload||!mac||!equal(signature(payload),mac))return null;
      try{const data=JSON.parse(Buffer.from(payload,'base64url'));return data.version===fingerprint&&data.exp>now()&&data.exp<=now()+8*60*60*1000?{id:'staff-pin',method:'pin'}:null;}catch{return null;}
    },
    async login(req,res,pin){
      const ip=env.VERCEL==='1'?req.headers['x-real-ip']||'unknown':req.socket?.remoteAddress||'unknown';
      const key=createHmac('sha256',secret).update('pin:'+ip).digest('hex');
      if(await store.pinAttempt(key)>5)return {limited:true};
      if(typeof pin!=='string'||!/^\d{8,12}$/.test(pin))return null;
      const [salt,digest]=hash.split(':');const candidate=(await derive(pin,salt,32)).toString('hex');
      if(!equal(candidate,digest))return null;
      await store.pinReset(key);
      const payload=Buffer.from(JSON.stringify({exp:now()+8*60*60*1000,version:fingerprint,nonce:randomBytes(12).toString('hex')})).toString('base64url');
      cookie(res,payload+'.'+signature(payload),28800);return {id:'staff-pin',method:'pin'};
    },
    clear:res=>cookie(res,'',0)
  };
}
module.exports={hashPin,createPinAuth};
