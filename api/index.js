'use strict';
let server,pinStore;
module.exports=async(req,res)=>{
  const config=require('../src/server/env-config').publicConfig();
  if(new URL(req.url,'https://localhost').pathname==='/api/config'){
    if(!config.pinEnabled&&!config.setupRequired){
      try{pinStore||=require('../src/server/cloud-store').openCloudStore();config.pinEnabled=await pinStore.pinEnabled();}
      catch{config.pinConfigUnavailable=true;}
    }
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify(config));
  }
  try{
    if(!server)server=require('../src/server/server').createApp({cloud:true});
    await new Promise((resolve,reject)=>{
      res.once('finish',resolve);res.once('close',resolve);res.once('error',reject);
      server.emit('request',req,res);
    });
  }catch(error){
    console.error('RackMap initialization failed:',error.code||error.name);
    if(res.headersSent)return res.end();
    res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'Ամպային կարգավորումը թերի է։ Ստուգեք Vercel-ի սերվերային փոփոխականները և Supabase կապը։',missing:config.missing}));
  }
};
