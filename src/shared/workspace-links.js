(function(root,factory){
  if(typeof module==='object')module.exports=factory();
  else root.RackWorkspaceLinks=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const editorOrigin='https://editor.ditaknet.com';
  const isEditor=url=>new URL(url).hostname==='editor.ditaknet.com';
  const defaultView=url=>isEditor(url)?'drawing':'overview';
  function drawingEntry(url){
    // Local installations and previews keep their own project storage.
    if(new URL(url).hostname!=='patch.ditaknet.com')return {href:'#drawing',external:false};
    const target=new URL('/',editorOrigin);
    // The project is transferred once through the verified popup handshake.
    // No project or authorization information is placed in the URL.
    return {href:target.href,external:true};
  }
  return {editorOrigin,isEditor,defaultView,drawingEntry};
});
