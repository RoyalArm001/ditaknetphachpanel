'use strict';
// Run with server credentials loaded into the environment. Never prints PIN values.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomInt,randomBytes,randomUUID}=require('node:crypto');
const {hashPin}=require('../src/server/pin-auth');
async function main(){
  const at=process.argv.indexOf('--count'),count=at<0?3:Number(process.argv[at+1]);
  if(!Number.isInteger(count)||count<1||count>10)throw new Error('Use --count between 1 and 10');
  const pool=require('../src/server/cloud-store').createPool();let client;
  try{
    const existing=await pool.query('SELECT count(*)::int AS count FROM rackmap.pin_keys WHERE enabled');
    if(existing.rows[0].count+count>20)throw new Error('At most 20 active PINs. Disable unused keys first.');
    const values=new Set();while(values.size<count)values.add(String(randomInt(1000000000,10000000000)));
    const keys=await Promise.all([...values].map(async(pin,i)=>({id:'pin-'+randomUUID(),label:'PIN '+(i+1),pin,hash:await hashPin(pin)})));
    const directory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'RackMap');fs.mkdirSync(directory,{recursive:true});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-'),file=path.join(directory,'MyPatch-cloud-PINs-'+stamp+'.json'),textFile=file.replace(/\.json$/,'.txt');
    const record={site:'https://mypro.smarttechllc.am/',activated:false,createdAt:new Date().toISOString(),keys:keys.map(({id,label,pin})=>({id,label,pin}))};
    fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
    client=await pool.connect();await client.query('BEGIN');
    await client.query('INSERT INTO rackmap.pin_session_config(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING',[randomBytes(32).toString('hex')]);
    await client.query('SELECT singleton FROM rackmap.pin_session_config FOR UPDATE');
    if((await client.query('SELECT count(*)::int AS count FROM rackmap.pin_keys WHERE enabled')).rows[0].count+count>20)throw new Error('Too many active PINs');
    for(const key of keys)await client.query('INSERT INTO rackmap.pin_keys(id,label,pin_hash) VALUES($1,$2,$3)',[key.id,key.label,key.hash]);
    await client.query('COMMIT');record.activated=true;fs.writeFileSync(file,JSON.stringify(record,null,2),{mode:0o600});
    fs.writeFileSync(textFile,'Իմ փաչ — Սիփան Դանիելյանի ամպային բազա\n\n'+record.site+'\n\n'+keys.map(x=>x.label+': '+x.pin+'\nID: '+x.id).join('\n\n')+'\n\nՄեկնարկային էջ → Միանալ թիմի տարածքին → PIN կոդ։\nԱյս կոդերը բացում են նույն ընդհանուր բազան՝ խմբագրման իրավունքով։\nՄի տեղադրեք այս ֆայլը GitHub-ում և մի տրամադրեք պատահական մարդկանց։\n',{flag:'wx',mode:0o600});
    console.log('Cloud PINs activated: '+count+'\nPrivate codes: '+textFile+'\nPrivate record: '+file);
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client?.release();await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error('Cloud PIN setup failed:',error.code||error.message);process.exitCode=1;});
