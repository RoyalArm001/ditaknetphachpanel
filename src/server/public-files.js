'use strict';
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'../..');

// Keep browser URLs stable while sources live in folders by responsibility.
// Only these files may be served locally or copied to the public build.
const sources={
  'index.html':'src/client/index.html',
  'share.html':'src/client/share.html',
  'share-view.js':'src/client/js/share-view.js',
  'share.css':'src/client/css/share.css',
  'robots.txt':'src/client/robots.txt',
  'sitemap.xml':'src/client/sitemap.xml',
  'open-local.js':'src/client/open-local.js',
  'merge-state.js':'src/shared/merge-state.js',
  'map-label-layout.js':'src/shared/map-label-layout.js',
  'handover-pdf.js':'src/shared/handover-pdf.js',
  'maps.js':'src/client/js/maps.js',
  'maps.css':'src/client/css/maps.css',
  'pdfkit.js':'node_modules/pdfkit/js/pdfkit.standalone.js',
  'pdfjs/pdf.mjs':'node_modules/pdfjs-dist/legacy/build/pdf.mjs',
  'pdfjs/pdf.worker.mjs':'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  ...Object.fromEntries(['cmaps','standard_fonts'].flatMap(dir=>fs.readdirSync(path.join(root,'node_modules/pdfjs-dist',dir)).map(name=>[`pdfjs/${dir}/${name}`,`node_modules/pdfjs-dist/${dir}/${name}`]))),
  'release.json':'src/client/release.json',
  'manifest.webmanifest':'src/client/manifest.webmanifest',
  'sw.js':'src/client/sw.js',
  'styles.css':'src/client/css/styles.css',
  'theme.css':'src/client/css/theme.css',
  ...Object.fromEntries(['live','app-reset','project-file','app','personal-store','pwa','rack3d','theme'].map(name=>[name+'.js','src/client/js/'+name+'.js'])),
  ...Object.fromEntries(['domain','i18n','locales'].map(name=>[name+'.js','src/shared/'+name+'.js'])),
  ...Object.fromEntries(['favicon.ico','icon-192.png','icon-512.png'].map(name=>[name,'assets/icons/'+name])),
  'assets/DejaVuSans.ttf':'assets/fonts/DejaVuSans.ttf',
  'assets/LICENSE_DEJAVU':'assets/fonts/LICENSE_DEJAVU',
  'exceljs.min.js':'node_modules/exceljs/dist/exceljs.min.js'
};
const publicFiles=Object.freeze(Object.fromEntries(Object.entries(sources).map(([url,file])=>['/'+url,path.join(root,file)])));
module.exports={root,publicFiles};
