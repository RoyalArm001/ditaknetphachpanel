'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const PDFDocument=require('pdfkit');
const H=require('../src/shared/handover-pdf');
const D=require('../src/shared/domain');
const I18n=require('../src/shared/i18n');
const {fixture}=require('./fixtures/handover');
const font=path.join(__dirname,'../assets/fonts/DejaVuSans.ttf');
const logo=fs.readFileSync(path.join(__dirname,'../assets/branding/smart-tech.png'));
const director='Տնօրեն Վ․ Խաչատրայան',specialist='ՏՏ Սիփան Դանիելյան';

async function inspectFooter(bytes,{multiple=false,showItSpecialist=false}={}){
  const attribution=director+(showItSpecialist?' / '+specialist:'');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(bytes)}),doc=await task.promise;
  let allText='';
  try{
    if(multiple)assert.ok(doc.numPages>1,'Exercise continuation pages');
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),items=(await page.getTextContent()).items;
      allText+=items.map(item=>item.str).join(' ')+'\n';
      assert.equal(items.some(item=>item.str.includes(specialist)),showItSpecialist,'IT attribution follows the export choice on every page');
      const footer=items.filter(item=>item.str===attribution);
      assert.equal(footer.length,1,'Exact Armenian attribution appears once per page');
      assert.ok(footer[0].transform[5]>35&&footer[0].transform[5]<60,'Attribution stays in the footer');
      assert.ok(footer[0].transform[4]+footer[0].width<=page.view[2]-30,'No clipped attribution');
      assert.ok(items.some(item=>item.str===`${i} / ${doc.numPages}`),'Page count includes no blank overflow pages');
      const ops=await page.getOperatorList();
      assert.ok(ops.fnArray.some((op,index)=>op===pdfjs.OPS.paintImageXObject&&ops.argsArray[index][1]===logo.readUInt32BE(16)&&ops.argsArray[index][2]===logo.readUInt32BE(20)),'Original logo is embedded on every page');
      for(const item of items.filter(item=>item.str.trim()&&item.str!==attribution&&!item.str.startsWith('My Patch · ')&&!/^\d+ \/ \d+$/.test(item.str))){
        assert.ok(item.transform[5]>=70,'Content stays above the reserved footer: '+item.str);
      }
    }
    return allText;
  }finally{await task.destroy();}
}

test('map and equipment pages retain branding and only show IT attribution when requested in HY, EN and RU',async()=>{
  for(const language of ['hy','en','ru']){
    for(const showItSpecialist of [false,true]){
    const state=fixture();state.floorPlans[0].height=1200;
    const chunks=await H.create(PDFDocument,state,{font,tr:I18n.forLanguage(language),kind:'all',planId:'Gym',detailed:true,mapPageSize:'A3',showItSpecialist});
    await inspectFooter(Buffer.concat(chunks),{multiple:true,showItSpecialist});
    }
  }
});

function browserContext(state){
  const downloads=[],requests=[];
  const context=vm.createContext({state,D,RackDomain:D,RackMapLabels:require('../src/shared/map-label-layout'),RackMapMarkerGroups:require('../src/shared/map-marker-groups'),PDFDocument,Uint8Array,Blob,Promise,Date,window:{PDFDocument},RackI18n:{language:'hy'},tr:I18n.forLanguage('hy'),filters:{},save:async()=>true,toast(){},
    fetch:async url=>{requests.push(url);const bytes=url.endsWith('.ttf')?fs.readFileSync(font):logo;return {ok:true,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};},
    download:(blob,name)=>downloads.push({blob,name}),RackConnections:require('../src/shared/connection-report'),
    findRack:id=>{for(const f of state.floors){const r=f.racks.find(r=>r.id===id);if(r)return {f,r};}}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/shared/pdf-branding'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../src/shared/handover-pdf'),'utf8'),context);
  return {context,downloads,requests};
}

test('browser connection report embeds branding on every continued page',async()=>{
  const state=fixture();state.floors[0].racks[0].devices[0].portList.forEach(port=>{port.status='used';});
  const {context,downloads,requests}=browserContext(state);
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  vm.runInContext(source.slice(source.indexOf('async function exportConnections('),source.indexOf('\nconst actions=')),context);
  await context.exportConnections('pdf','rack-a');
  assert.equal(downloads.length,1);assert.ok(requests.includes('/assets/smart-tech.png'));
  await inspectFooter(await downloads[0].blob.arrayBuffer(),{multiple:true});
  await context.exportConnections('pdf','rack-a',{showItSpecialist:true});
  await inspectFooter(await downloads[1].blob.arrayBuffer(),{multiple:true,showItSpecialist:true});
});

test('personal PDF downloads a branded, filtered report without opening browser print',async()=>{
  const state=fixture(),{context,downloads}=browserContext(state);
  state.floors[0].racks[0].devices.forEach(device=>device.portList.forEach(port=>{port.cable='Cable '+port.number;}));
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  vm.runInContext(source.slice(source.indexOf('async function exportPersonal('),source.indexOf('\nasync function exportConnections(')),context);
  await context.exportPersonal('pdf',{rack:'rack-a'});
  assert.equal(downloads[0].name,'MyPatch-personal.pdf');
  const text=await inspectFooter(await downloads[0].blob.arrayBuffer(),{multiple:true});
  assert.match(text,/Panel A/);assert.doesNotMatch(text,/Panel B|UPS B|Panel C/);
  await context.exportPersonal('pdf',{rack:'rack-a'},{showItSpecialist:true});
  await inspectFooter(await downloads[1].blob.arrayBuffer(),{multiple:true,showItSpecialist:true});
});

test('server search PDF reserves footer space and serves the original logo asset',async()=>{
  const {DatabaseSync}=require('node:sqlite'),{createApp}=require('../src/server/server');
  const db=new DatabaseSync(':memory:'),state=fixture();
  state.floors[0].racks[0].devices.forEach(device=>device.portList.forEach(port=>{port.cable='Cable '+port.number;}));
  const server=createApp({cloud:true,auth:{authenticate:async()=>({id:'test-user'})},store:{db,read:async()=>({state,revision:1}),close(){}},font});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/api/export.pdf?rack=rack-a');
    assert.equal(response.status,200,await response.clone().text());
    const text=await inspectFooter(await response.arrayBuffer(),{multiple:true});
    assert.match(text,/Panel A/);assert.doesNotMatch(text,/Panel B|UPS B|Panel C/);
    const optedIn=await fetch(base+'/api/export.pdf?rack=rack-a&showItSpecialist=1');
    assert.equal(optedIn.status,200);await inspectFooter(await optedIn.arrayBuffer(),{multiple:true,showItSpecialist:true});
    const optedOut=await fetch(base+'/api/export.pdf?rack=rack-a&showItSpecialist=0');
    assert.equal(optedOut.status,200);await inspectFooter(await optedOut.arrayBuffer(),{multiple:true});
    const image=await fetch(base+'/assets/smart-tech.png');assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),logo);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
