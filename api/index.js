'use strict';
let server;
module.exports=async(req,res)=>{
  try{
    if(!server)server=require('../server').createApp({cloud:true});
    server.emit('request',req,res);
  }catch{
    res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'Ամպային միջավայրը կարգավորված չէ։ Ստուգեք սերվերի կարգավորումները։'}));
  }
};
