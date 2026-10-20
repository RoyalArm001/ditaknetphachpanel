'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function exporter(previewBlob){
  const source=fs.readFileSync(require.resolve('../src/client/js/maps'),'utf8');
  const modal=source.search(/modal\s*\(\s*tr\s*\(\s*sharing\s*\?/);
  assert.ok(modal>=0,'PDF export dialog exists');
  const callback=source.slice(modal).search(/async\s+fd\s*=>\s*\{/);
  assert.ok(callback>=0,'PDF export submit handler exists');
  const start=modal+callback;
  const end=source.indexOf('      });',start);
  assert.ok(end>start,'PDF export submit handler ends');
  const downloads=[];
  const context={sharing:false,previewBlob,previewName:'preview.pdf',tr:x=>x,toast(){},download:(...args)=>downloads.push(args),getState(){throw new Error('Downloading a preview must not read newer project data');}};
  const submit=vm.runInNewContext('('+source.slice(start,end)+'})',context);
  return {submit,downloads};
}

test('PDF download uses the exact preview blob even if live project data has changed',async()=>{
  const blob=new Blob(['preview snapshot'],{type:'application/pdf'}),{submit,downloads}=exporter(blob);
  await submit(new FormData());
  assert.equal(downloads.length,1);assert.equal(downloads[0][0],blob);assert.equal(downloads[0][1],'preview.pdf');
});

test('PDF download is blocked until a valid preview is ready',async()=>{
  const {submit,downloads}=exporter(null);
  await assert.rejects(submit(new FormData()),/PDF/);assert.equal(downloads.length,0);
});
