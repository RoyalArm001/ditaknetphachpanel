'use strict';
const fs=require('node:fs');const path=require('node:path');
const {root,publicFiles}=require('../src/server/public-files');
const out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const [url,source] of Object.entries(publicFiles)){
  const destination=path.join(out,url.slice(1));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(source,destination);
}
const hash=require('node:crypto').createHash('sha256');
for(const name of fs.readdirSync(out,{recursive:true}).sort())if(name!=='sw.js'&&fs.statSync(path.join(out,name)).isFile())hash.update(fs.readFileSync(path.join(out,name)));
fs.writeFileSync(path.join(out,'sw.js'),fs.readFileSync(publicFiles['/sw.js'],'utf8').replace('__BUILD_ID__',hash.digest('hex').slice(0,12)));
console.log('Built public app assets; no environment files or database files included.');
