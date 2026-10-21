(function(root,factory){
  if(typeof module==='object')module.exports=factory();
  else root.RackWorkspaceLinks=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const editorOrigin='https://editor.ditaknet.com';
  const isEditor=url=>new URL(url).hostname==='editor.ditaknet.com';
  const defaultView=url=>isEditor(url)?'drawing':'overview';
  function drawingEntry(url,{demo=false,companyId=''}={}){
    // Local installations, previews and demos keep their own project storage.
    if(new URL(url).hostname!=='patch.ditaknet.com'||demo)return {href:'#drawing',external:false};
    const target=new URL('/',editorOrigin);
    if(companyId)target.searchParams.set('company',companyId);
    return {href:target.href,external:true};
  }
  return {editorOrigin,isEditor,defaultView,drawingEntry};
});
