'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const Domain=require('./domain');
const ExcelJS=require('exceljs');
const PDFDocument=require('pdfkit');
const columns=[['floor','Հարկ'],['rack','Ռաք'],['device','Սարք'],['port','Պորտ'],['status','Վիճակ'],['cable','Մալուխ'],['destination','Նպատակակետի հարկ'],['room','Սենյակ'],['door','Դուռ'],['side','Կողմ'],['connection','Կապ'],['notes','Նշումներ'],['service','Նշանակություն'],['vlan','VLAN']];
const exportValue=(r,k,tr=x=>x)=>k==='status'?tr(Domain.statuses[r[k]]):k==='service'?tr(Domain.services[r[k]].label):r[k];
function createApp(options={}) {
  const cloud=options.cloud??(process.env.RACKMAP_STORAGE==='supabase'||process.env.VERCEL==='1');
  const store=options.store||(cloud?require('./cloud-store').openCloudStore():require('./local-repository').openLocalRepository(options));
  const pinAuth=require('./pin-auth').createPinAuth(store,{secure:cloud});
  const accountAuth=cloud?(options.auth||require('./cloud-auth').createAuth()):null;
  const authRequired=cloud||!!pinAuth;
  const auth=authRequired?{authenticate:async(req,res)=>pinAuth?.authenticate(req)||await accountAuth?.authenticate(req,res),login:async(...args)=>accountAuth?.login(...args),clear:res=>{accountAuth?.clear(res);pinAuth?.clear(res);}}:null;
  const read=id=>store.read(id),listCompanies=()=>store.list();
  const readBody=async req=>{if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):JSON.stringify(req.body);if(Buffer.byteLength(raw)>(cloud?4*1024*1024:24*1024*1024)){const e=new Error('Հարցումը չափազանց մեծ է');e.code=413;throw e;}return JSON.parse(raw);}let size=0,parts=[];for await(const part of req){size+=part.length;if(size>(cloud?4*1024*1024:24*1024*1024)){const e=new Error(cloud?'Ամպային պահպանման մեկ հարցումը պետք է լինի մինչև 4 ՄԲ։ Նվազեցրեք լուսանկարների չափը։':'Տվյալները գերազանցում են 24 ՄԲ սահմանը');e.code=413;throw e;}parts.push(part);}return JSON.parse(Buffer.concat(parts).toString());};
  const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      const url=new URL(req.url,'http://localhost');
      const lang=['en','ru'].includes(url.searchParams.get('lang'))?url.searchParams.get('lang'):'hy';
      const tr=require('./i18n').forLanguage(lang);
      if(url.pathname.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
      if(url.pathname==='/api/config')return json(res,200,{cloud,authRequired,pinEnabled:!!pinAuth,accountEnabled:!!accountAuth,maxStateBytes:cloud?4*1024*1024:24*1024*1024});
      if(authRequired&&url.pathname.startsWith('/api/')){
        if(['POST','PUT','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${cloud?'https':'http'}://${req.headers.host}`)return json(res,403,{error:tr('Օտար էջից փոփոխությունն արգելված է')});
        if(url.pathname==='/api/auth/pin'&&req.method==='POST'&&pinAuth){
          if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:tr('Պահանջվում է JSON')});
          const body=await readBody(req),user=await pinAuth.login(req,res,body.pin);
          if(user?.limited){res.setHeader('Retry-After','900');return json(res,429,{error:tr('Շատ փորձեր։ Կրկին փորձեք 15 րոպեից։')});}
          return user?json(res,200,{user}):json(res,401,{error:tr('PIN կոդը սխալ է')});
        }
        if(url.pathname==='/api/auth/login'&&req.method==='POST'){
          if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:tr('Պահանջվում է JSON')});
          const credentials=await readBody(req);const user=await auth.login(res,credentials.email,credentials.password);
          return user?json(res,200,{user}):json(res,401,{error:tr('Մուտքը չհաջողվեց կամ RackMap-ի թույլտվությունը բացակայում է')});
        }
        if(url.pathname==='/api/auth/logout'&&req.method==='POST'){auth.clear(res);return json(res,200,{ok:true});}
        const user=await auth.authenticate(req,res);
        if(!user)return json(res,401,{error:tr('Մուտք գործեք Իմ փաչ-ի ձեր հաշվով')});
        if(url.pathname==='/api/auth/session')return json(res,200,{user});
      }

      const companyId=url.searchParams.get('company')||'default';
      if(req.method==='GET'&&url.pathname==='/api/storage')return json(res,200,{directory:store.directory,database:store.database,backups:store.backups,cloud});
      if(req.method==='GET'&&url.pathname==='/api/companies')return json(res,200,await listCompanies());
      if(req.method==='POST'||req.method==='PUT'){
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:tr('Օտար էջից փոփոխությունն արգելված է')});
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:tr('Պահանջվում է JSON')});
      }
      if(req.method==='POST'&&url.pathname==='/api/backup'){
        if(cloud){const data=Buffer.from(JSON.stringify(await store.backup()));if(data.length>4*1024*1024)return json(res,413,{error:tr('Ամբողջական պատճենը մեծ է։ Օգտագործեք cloud:export հրամանը։')});res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="MyPatch-all.json"'});return res.end(data);}
        const file=await store.backup();res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="RackMap-all-companies.sqlite"'});return fs.createReadStream(file).pipe(res);
      }
      if(req.method==='POST'&&url.pathname==='/api/companies'){
        let body;try{body=await readBody(req);}catch(e){return json(res,e.code||400,{error:tr('Հարցման ձևաչափը սխալ է')});}
        const name=typeof body.name==='string'?body.name.trim():'';
        if(!name||name.length>200||!Number.isInteger(body.floorCount)||body.floorCount<1||body.floorCount>200)return json(res,400,{error:tr('Նշեք ընկերության անունը և 1–200 հարկ')});
        if((await listCompanies()).some(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return json(res,400,{error:tr('Այս անունով ընկերություն արդեն կա')});
        const state={...Domain.empty(),company:name,floors:Array.from({length:body.floorCount},(_,i)=>({id:randomUUID(),name:tr`${i+1}-րդ հարկ`,racks:[]}))};
        Domain.validate(state);const id=randomUUID();await store.create(id,state);
        return json(res,201,{id,revision:0,state});
      }
      const scoped=['/api/state','/api/revision','/api/history','/api/export.xlsx','/api/export.pdf'].includes(url.pathname)||url.pathname.startsWith('/api/history/');
      const current=scoped?await read(companyId):null;
      if(scoped&&!current)return json(res,404,{error:tr('Ընկերությունը չի գտնվել')});
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,200,current);
      if(req.method==='GET'&&url.pathname==='/api/revision')return json(res,200,{revision:current.revision});
      if(req.method==='PUT'&&url.pathname==='/api/state'){
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:tr('Օտար էջից փոփոխությունն արգելված է')});
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:tr('Պահանջվում է JSON')});
        let body;try{body=await readBody(req);Domain.validate(body.state);}catch(e){return json(res,e.code||400,{error:e.message});}
        if(body.state.company&&(await listCompanies()).some(x=>x.id!==companyId&&x.name.toLocaleLowerCase()===body.state.company.trim().toLocaleLowerCase()))return json(res,400,{error:tr('Այս անունով ընկերություն արդեն կա')});
        const result=await store.save(companyId,body.state,body.revision);
        return result.conflict?json(res,409,{error:tr('Տվյալները փոփոխվել են այլ աշխատակցի կողմից։ Թարմացրեք էջը։'),revision:result.revision}):json(res,200,result);
      }
      if(req.method==='GET'&&url.pathname==='/api/history')return json(res,200,await store.history(companyId));
      if(req.method==='GET'&&url.pathname.startsWith('/api/history/')){
        const h=await store.version(companyId,Number(url.pathname.split('/').pop()));
        return h?json(res,200,h):json(res,404,{error:tr('Տարբերակը չի գտնվել')});
      }
      if(req.method==='GET'&&url.pathname==='/api/network')return json(res,200,{urls:cloud?[`https://${req.headers.host}`]:Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${server.address().port}`)});
      if(req.method==='GET'&&['/api/export.xlsx','/api/export.pdf'].includes(url.pathname)){
        const {state}=current, rows=Domain.rows(state,Object.fromEntries(url.searchParams));
        if(url.pathname.endsWith('xlsx')){
          const book=new ExcelJS.Workbook();book.creator=tr('Սիփան Դանիելյան · royalarm.uk · Իմ փաչ');
          const sheet=book.addWorksheet(tr('Միացումներ'),{views:[{state:'frozen',ySplit:1}]});
          sheet.columns=columns.map(([key,header])=>({header:tr(header),key,width:key==='notes'?45:key==='connection'?36:22}));
          for(const row of rows)sheet.addRow(Object.fromEntries(columns.map(([k])=>[k,exportValue(row,k,tr)])));
          sheet.getRow(1).height=30;sheet.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF174E50'}};c.font={color:{argb:'FFFFFFFF'},bold:true};});
          sheet.eachRow(r=>{r.alignment={vertical:'middle',wrapText:true};});sheet.autoFilter={from:'A1',to:'N1'};
          const inventory=book.addWorksheet(tr('Ռաքեր և սարքեր'));inventory.columns=[{header:tr('Հարկ'),key:'floor',width:24},{header:tr('Ռաք'),key:'rack',width:24},{header:tr('Ռաք U'),key:'u',width:12},{header:tr('Սարք'),key:'device',width:24},{header:tr('U դիրք'),key:'pos',width:12},{header:tr('Բարձրություն U'),key:'height',width:18},{header:tr('Պորտեր'),key:'ports',width:12}];
          for(const f of state.floors)for(const r of f.racks)if((!url.searchParams.get('floor')||url.searchParams.get('floor')===f.id)&&(!url.searchParams.get('rack')||url.searchParams.get('rack')===r.id)){
            if(!r.devices.length)inventory.addRow({floor:f.name,rack:r.name,u:r.u});
            for(const d of r.devices)inventory.addRow({floor:f.name,rack:r.name,u:r.u,device:d.name,pos:d.pos,height:d.height,ports:d.portList.length});
          }
          const buffer=await book.xlsx.writeBuffer();if(cloud&&buffer.length>4*1024*1024)return json(res,413,{error:tr('Հաշվետվությունը մեծ է։ Արտահանեք առանձին հարկերով կամ ռաքերով։')});res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="RackMap.xlsx"'});return res.end(buffer);
        }
        const font=options.font||process.env.RACKMAP_FONT||(fs.existsSync(path.join(__dirname,'assets','DejaVuSans.ttf'))?path.join(__dirname,'assets','DejaVuSans.ttf'):'C:/Windows/Fonts/sylfaen.ttf');
        if(!fs.existsSync(font))return json(res,503,{error:tr('Հայերեն PDF-ի համար նշեք RACKMAP_FONT տառատեսակի ֆայլը')});
        const pdf=new PDFDocument({size:'A4',margin:40,bufferPages:true,info:{Title:'RackMap '+state.company,Author:tr('Սիփան Դանիելյան · royalarm.uk'),Subject:tr('Սպասարկող՝ ditaknet.com')}});
        const chunks=[];pdf.on('data',b=>chunks.push(b));
        pdf.on('end',()=>{if(cloud&&chunks.reduce((n,b)=>n+b.length,0)>4*1024*1024)return json(res,413,{error:tr('Հաշվետվությունը մեծ է։ Արտահանեք առանձին հարկերով կամ ռաքերով։')});res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="RackMap.pdf"'});res.end(Buffer.concat(chunks));});
        pdf.font(font).fontSize(21).fillColor('#174E50').text(state.company||'RackMap');
        pdf.fontSize(12).fillColor('#333333').text(tr('Ցանցային միացումների հաշվետվություն'));pdf.fontSize(9).text(new Date().toLocaleString({hy:'hy-AM',en:'en-US',ru:'ru-RU'}[lang]));pdf.moveDown();
        const filterLabels=[url.searchParams.get('query'),state.floors.find(x=>x.id===url.searchParams.get('floor'))?.name,Domain.devices(state).find(x=>x.r.id===url.searchParams.get('rack'))?.r.name,tr(Domain.statuses[url.searchParams.get('status')])].filter(Boolean);
        if(filterLabels.length)pdf.text(filterLabels.join(' / '));pdf.text(tr`Պորտերի քանակ՝ ${rows.length}`).moveDown();
        for(const row of rows){
          const lines=[`${row.floor} / ${row.rack} / ${row.device} / ${row.port}`,tr`Վիճակ՝ ${tr(Domain.statuses[row.status])}    Մալուխ՝ ${row.cable||'—'}`,tr`Նշանակություն՝ ${tr(Domain.services[row.service].label)}    VLAN՝ ${row.vlan||'—'}`,tr`Տեղադրություն՝ ${[row.destination,row.room,row.door,row.side].filter(Boolean).join(' / ')||'—'}`,tr`Կապ՝ ${row.connection||'—'}`,row.notes?tr`Նշումներ՝ ${row.notes}`:''].filter(Boolean);
          for(let i=0;i<lines.length;i++){
            pdf.fontSize(i===0?11:9);const h=pdf.heightOfString(lines[i],{width:515});
            if(pdf.y+h>785)pdf.addPage();pdf.fillColor(i===0?'#174E50':'#333333').text(lines[i],{width:515});
          }
          pdf.moveDown(.7);
        }
        if(!rows.length)pdf.text(tr('Ընտրված ֆիլտրերով պորտեր չկան։'));
        const range=pdf.bufferedPageRange();for(let i=0;i<range.count;i++){pdf.switchToPage(i);pdf.fontSize(8).fillColor('#777777').text(`${i+1} / ${range.count}`,40,810,{lineBreak:false});}
        pdf.end();return;
      }
      const files={'/locales.js':'locales.js','/i18n.js':'i18n.js','/favicon.ico':'favicon.ico','/':'index.html','/index.html':'index.html','/app.js':'app.js','/domain.js':'domain.js','/rack3d.js':'rack3d.js','/styles.css':'styles.css','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/pwa.js':'pwa.js','/personal-store.js':'personal-store.js','/exceljs.min.js':'node_modules/exceljs/dist/exceljs.min.js','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
      if(req.method==='GET'&&files[url.pathname]){
        const file=files[url.pathname],mime=file.endsWith('.ico')?'image/x-icon':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
        res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'});return fs.createReadStream(path.join(__dirname,file)).pipe(res);
      }
      json(res,404,{error:tr('Չի գտնվել')});
    }catch(e){console.error('RackMap request failed:',e.code||e.name);if(!res.headersSent)json(res,e.code==='23505'?400:500,{error:tr('Չհաջողվեց կատարել գործողությունը')});else res.end();}
  });
  let backupDay=new Date().toISOString().slice(0,10);
  const dailyBackup=cloud?null:setInterval(()=>{const today=new Date().toISOString().slice(0,10);if(today!==backupDay){try{store.backup();backupDay=today;}catch(e){console.error('Automatic backup failed:',e.message);}}},60*60*1000);
  dailyBackup?.unref();
  server.on('close',()=>{clearInterval(dailyBackup);store.close();});return server;
}
if(require.main===module){const accessFile=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'RackMap','access.env');if(fs.existsSync(accessFile)&&!process.env.VERCEL)process.loadEnvFile(accessFile);const port=Number(process.env.PORT||3000);createApp().listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`RackMap: http://localhost:${port}\nKeep this process running to use RackMap.`));}
module.exports={createApp};
