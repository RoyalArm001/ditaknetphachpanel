'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {publicFiles}=require('./public-files');
function assetManifest(){
  const section=url=>/^\/(maps\.|pdfjs\/)/.test(url)?'maps':/^\/(share|handover-pdf|pdfkit|exceljs)/.test(url)?'reports':url.includes('rack3d')?'racks':/\/(live|merge-state|personal-store|app-reset)\./.test(url)?'data':'core';
  const files=Object.fromEntries(Object.entries(publicFiles).filter(([url])=>url!=='/sw.js').map(([url,file])=>[url,{sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),section:section(url)}]));
  const version=JSON.parse(fs.readFileSync(publicFiles['/release.json'],'utf8')).version;
  return {version,files};
}
module.exports={assetManifest};
