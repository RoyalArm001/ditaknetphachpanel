const test=require('node:test'),assert=require('node:assert/strict'),H=require('../src/shared/editor-handoff');
const id='abcd1234-abcd-1234-abcd-abcd12345678';
test('handoff requires the exact origin, popup source, nonce and message type',()=>{
  const source={},data={protocol:H.protocol,id,type:'ready'},event={source,origin:H.editorOrigin,data};
  assert.equal(H.accepts(event,source,H.editorOrigin,id,'ready'),true);
  for(const bad of [{...event,source:{}},{...event,origin:'https://editor.ditaknet.com.evil.test'},{...event,data:{...data,id:'wrong'}},{...event,data:{...data,type:'clone'}},{...event,data:{...data,protocol:'other'}}])assert.equal(H.accepts(bad,source,H.editorOrigin,id,'ready'),false);
});
test('parent sends one snapshot, ignores other windows and detaches after acknowledgement',async()=>{
  let listener;const sent=[],popup={postMessage:(...args)=>sent.push(args)},snapshot={state:{company:'Original'},readOnly:false};
  const win={crypto:{randomUUID:()=>id},addEventListener:(name,fn)=>listener=fn,removeEventListener:()=>listener=null,open:url=>{assert.equal(url,H.editorOrigin+'/#handoff='+id);return popup;},setTimeout,clearTimeout};
  const done=H.open(win,snapshot);snapshot.state.company='Changed later';
  listener({source:{},origin:H.editorOrigin,data:{protocol:H.protocol,id,type:'ready'}});assert.equal(sent.length,0);
  listener({source:popup,origin:H.editorOrigin,data:{protocol:H.protocol,id,type:'ready'}});
  assert.equal(sent[0][0].snapshot.state.company,'Original');assert.equal(sent[0][1],H.editorOrigin);
  listener({source:popup,origin:H.editorOrigin,data:{protocol:H.protocol,id,type:'accepted'}});await done;assert.equal(listener,null);
});
test('direct editor entry has no handoff and blocked popup reports a clear failure',async()=>{
  assert.equal(await H.receive({location:{hash:''},opener:null},()=>assert.fail()),null);
  await assert.rejects(H.open({crypto:{randomUUID:()=>id},addEventListener(){},removeEventListener(){},open:()=>null,clearTimeout},{}));
});

function receiver(){
  let listener,timeout;const sent=[],source={postMessage:(...args)=>sent.push(args)};
  const win={location:{hash:'#handoff='+id},opener:source,addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>listener=null,setInterval:()=>1,clearInterval(){},setTimeout:fn=>{timeout=fn;return 2;},clearTimeout(){}};
  return {win,sent,message:snapshot=>listener({source,origin:H.mainOrigin,data:{protocol:H.protocol,id,type:'clone',snapshot}}),timeout:()=>timeout(),listening:()=>!!listener};
}
test('receiver validates and persists before acknowledging, then disconnects its opener',async()=>{
  const r=receiver(),snapshot={state:{company:'Source'},readOnly:false};
  const result=H.receive(r.win,async (copy,nonce)=>{assert.equal(nonce,id);assert.notEqual(copy,snapshot);copy.state.company='Independent';return copy;});
  assert.equal(r.sent[0][0].type,'ready');await r.message(snapshot);
  assert.equal((await result).state.company,'Independent');assert.equal(snapshot.state.company,'Source');assert.equal(r.sent.at(-1)[0].type,'accepted');assert.equal(r.win.opener,null);assert.equal(r.listening(),false);
});
test('a failed or stalled clone never acknowledges successful handoff',async()=>{
  const failed=receiver(),done=H.receive(failed.win,async()=>{throw new Error('Storage unavailable');});
  const rejected=assert.rejects(done,/Storage unavailable/);await failed.message({});await rejected;assert.equal(failed.sent.at(-1)[0].type,'rejected');assert.equal(failed.listening(),false);
  const stalled=receiver();let finish;
  const pending=H.receive(stalled.win,()=>new Promise(resolve=>finish=resolve)),timedOut=assert.rejects(pending);
  const delivering=stalled.message({});stalled.timeout();await timedOut;finish({});await delivering;
  assert.equal(stalled.listening(),false);assert.equal(stalled.sent.some(([m])=>m.type==='accepted'),false);
});
test('editor host cannot access any main database API, including config and authentication',async()=>{
  const {blockEditorApi}=require('../src/server/editor-isolation');
  for(const url of ['/api/config','/api/state?company=default','/api/auth/pin','/api','/api/backup']){
    let status,body;const res={writeHead:s=>status=s,end:b=>body=b};
    assert.equal(blockEditorApi({headers:{host:'editor.ditaknet.com'},url},res),true);assert.equal(status,403);assert.ok(JSON.parse(body).error);
  }
  assert.equal(blockEditorApi({headers:{host:'patch.ditaknet.com'},url:'/api/state'},{}),false);
  assert.equal(blockEditorApi({headers:{host:'editor.ditaknet.com'},url:'/release.json'},{}),false);
  const handler=require('../api/index');let status;
  await handler({headers:{host:'editor.ditaknet.com'},url:'/api/config'},{writeHead:s=>status=s,end(){}});assert.equal(status,403);
});
