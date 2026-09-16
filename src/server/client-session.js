'use strict';
// Only expire this browser's cookies. Never touch accounts, PINs, files or databases.
function clearClientSession(req,res){
  if(new URL(req.url,'http://localhost').pathname!=='/api/auth/reset-device')return false;
  const origin=req.headers.origin,host=req.headers.host;
  const forbidden=req.headers['sec-fetch-site']==='cross-site'||origin&&!['http://'+host,'https://'+host].includes(origin);
  const status=req.method!=='POST'?405:forbidden?403:!req.headers['content-type']?.startsWith('application/json')?415:200;
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(status===200){
    const secure=req.headers['x-forwarded-proto']==='https'||req.socket?.encrypted||origin?.startsWith('https:');
    headers['Set-Cookie']=['rackmap_access','rackmap_refresh','rackmap_pin','mypatch_access','mypatch_refresh','mypatch_recovery'].map(name=>`${name}=; Path=/api; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=0`);
  }
  res.writeHead(status,headers);res.end(JSON.stringify({ok:status===200}));return true;
}
module.exports={clearClientSession};
