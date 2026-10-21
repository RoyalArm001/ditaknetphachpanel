'use strict';
function blockEditorApi(req,res){
  const host=String(req.headers.host||'').split(':')[0].toLowerCase();
  if(host!=='editor.ditaknet.com'||!/^\/api(?:[/?]|$)/.test(req.url))return false;
  res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:'The editor works on an independent local copy. Open it from My Patch.'}));
  return true;
}
module.exports={blockEditorApi};
