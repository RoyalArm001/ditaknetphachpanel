'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomInt,randomBytes}=require('node:crypto');
const {hashPin}=require('../pin-auth');
(async()=>{
  const directory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'RackMap');fs.mkdirSync(directory,{recursive:true});
  const config=path.join(directory,'access.env'),privateFile=path.join(directory,'staff-pin.txt');
  if((fs.existsSync(config)||fs.existsSync(privateFile))&&!process.argv.includes('--rotate'))throw new Error('PIN already configured. Use --rotate to replace it and invalidate sessions.');
  const pin=String(randomInt(10000000,100000000)),hash=await hashPin(pin),secret=randomBytes(32).toString('hex');
  fs.writeFileSync(config,`RACKMAP_PIN_HASH=${hash}\nRACKMAP_SESSION_SECRET=${secret}\n`,{mode:0o600});
  fs.writeFileSync(privateFile,`Ditaknet փաչ պանել · Աշխատակիցների PIN\n\n${pin}\n\nԱյս ֆայլը մի հրապարակեք GitHub-ում։ PIN-ը տրամադրեք միայն աշխատակիցներին։\nVercel-ում տեղադրեք access.env-ի երկու փոփոխականները։\n`,{mode:0o600});
  console.log('PIN configured. Private code: '+privateFile+'\nServer environment: '+config);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
