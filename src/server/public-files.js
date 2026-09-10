'use strict';
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

// Keep browser URLs stable while sources live in folders by responsibility.
// Only these files may be served locally or copied to the public build.
const sources={
  'index.html':'src/client/index.html',
  'open-local.js':'src/client/open-local.js',
  'release.json':'src/client/release.json',
  'manifest.webmanifest':'src/client/manifest.webmanifest',
  'sw.js':'src/client/sw.js',
  'styles.css':'src/client/css/styles.css',
  'theme.css':'src/client/css/theme.css',
  ...Object.fromEntries(['project-file','app','drive-store','personal-store','pwa','rack3d','theme'].map(name=>[name+'.js','src/client/js/'+name+'.js'])),
  ...Object.fromEntries(['domain','i18n','locales'].map(name=>[name+'.js','src/shared/'+name+'.js'])),
  ...Object.fromEntries(['favicon.ico','icon-192.png','icon-512.png'].map(name=>[name,'assets/icons/'+name])),
  'assets/DejaVuSans.ttf':'assets/fonts/DejaVuSans.ttf',
  'assets/LICENSE_DEJAVU':'assets/fonts/LICENSE_DEJAVU',
  'exceljs.min.js':'node_modules/exceljs/dist/exceljs.min.js'
};
const publicFiles=Object.freeze(Object.fromEntries(Object.entries(sources).map(([url,file])=>['/'+url,path.join(root,file)])));
module.exports={root,publicFiles};
