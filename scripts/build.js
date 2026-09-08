'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
for(const name of ['index.html','app.js','domain.js','rack3d.js','styles.css','manifest.webmanifest','pwa.js','personal-store.js','sw.js','icon-192.png','icon-512.png'])fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.copyFileSync(path.join(root,'node_modules/exceljs/dist/exceljs.min.js'),path.join(out,'exceljs.min.js'));
console.log('Built public app assets; no environment files or database files included.');
