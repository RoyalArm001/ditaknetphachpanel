'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../src/shared/domain'),{fixture}=require('./fixtures/handover');
const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
function setup(){
  let submit,body;const calls=[];
  const context=vm.createContext({state:fixture(),D,filters:{rack:'rack-a'},activeCompanyId:'company',URLSearchParams,
    tr:x=>x,esc:x=>x,$:()=>null,select:()=>'',modal:(title,html,fn)=>{body=html;submit=fn;},
    personal:()=>true,save:async()=>true,exportPersonal:async(...args)=>calls.push(args),exportConnections:async(...args)=>calls.push(args),
    companyUrl:x=>x,fetch:async url=>{calls.push(url);return {ok:true,blob:async()=>new Blob()};},download(){},toast(){},
  });
  for(const [start,end] of [['function pdfSpecialistOption(','function devicePorts('],['function openPdfExportOptions(','async function exportReport('],['function openConnectionPdfOptions(','async function exportConnections(']]){
    vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);
  }
  return {context,calls,get body(){return body;},submit:fd=>submit(fd)};
}
function checkDefault(html){
  const field=html.match(/<input[^>]*name="showItSpecialist"[^>]*>/)?.[0];
  assert.ok(field);assert.doesNotMatch(field,/checked|disabled/);assert.match(html,/Ցուցադրել ՏՏ մասնագետին/);
}
test('search PDF option defaults off and forwards each explicit choice to personal and server exports',async()=>{
  for(const personal of [true,false])for(const enabled of [false,true]){
    const harness=setup();harness.context.personal=()=>personal;harness.context.openPdfExportOptions();checkDefault(harness.body);
    const fd=new FormData();fd.set('pdfScope','services');fd.set('pdfService','wifi');if(enabled)fd.set('showItSpecialist','on');
    await harness.submit(fd);
    if(personal){assert.equal(harness.calls[0][2].showItSpecialist,enabled);assert.equal(harness.calls[0][1].services,'wifi');}
    else{const url=new URL(harness.calls[0],'http://localhost');assert.equal(url.searchParams.get('showItSpecialist'),enabled?'1':'0');assert.equal(url.searchParams.get('services'),'wifi');}
  }
});
test('selective and connection PDF dialogs expose an unchecked specialist option',async()=>{
  const harness=setup();await harness.context.openSelectivePdfModal();checkDefault(harness.body);
  for(const enabled of [false,true]){
    harness.context.openConnectionPdfOptions('rack-a');checkDefault(harness.body);
    const fd=new FormData();if(enabled)fd.set('showItSpecialist','on');await harness.submit(fd);
    assert.equal(harness.calls.at(-1)[2].showItSpecialist,enabled);
  }
});
