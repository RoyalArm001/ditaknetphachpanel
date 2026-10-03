import * as pdfjs from '/pdfjs/pdf.mjs';
const tr=globalThis.RackI18n?.t||((x)=>x),$=id=>document.getElementById(id);
pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
$('viewOnly').textContent=tr('Միայն դիտում');
const token=location.hash.slice(1);
let doc,pageNumber=1,zoom=1,renderTask,sequence=0;
async function render(){
  const current=++sequence;
  if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}}
  const page=await doc.getPage(pageNumber);if(current!==sequence)return;
  const width=$('viewport').clientWidth-(innerWidth<=600?16:36),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.max(.1,width/base.width)*zoom});
  const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(6000000/(viewport.width*viewport.height))),canvas=$('pdf');
  canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  $('pageNumber').textContent=pageNumber+' / '+doc.numPages;$('fit').textContent=Math.round(zoom*100)+'%';$('previous').disabled=pageNumber<=1;$('next').disabled=pageNumber>=doc.numPages;$('smaller').disabled=zoom<=.5;$('larger').disabled=zoom>=3;
  renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0],background:'#ffffff'});
  try{await renderTask.promise;}catch(e){if(e.name!=='RenderingCancelledException')throw e;}
}
const showError=e=>{$('message').hidden=false;$('message').textContent=e.message||tr('Չհաջողվեց կատարել գործողությունը');};
async function open(){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error(tr('Հղումը չի գտնվել կամ այլևս հասանելի չէ'));
  const url='/api/shared/'+token,response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(tr('Հղումը չի գտնվել կամ այլևս հասանելի չէ'));
  doc=await pdfjs.getDocument({data:new Uint8Array(await response.arrayBuffer()),isEvalSupported:false,useWasm:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'}).promise;
  const metadata=await doc.getMetadata();$('title').textContent=metadata.info.Title||'My Patch';document.title=$('title').textContent;
  $('download').href=url;$('download').target='_blank';$('download').rel='noopener noreferrer';$('download').hidden=false;$('tools').hidden=false;$('viewport').hidden=false;$('message').hidden=true;
  await render();
  for(const [id,action] of Object.entries({previous:()=>pageNumber=Math.max(1,pageNumber-1),next:()=>pageNumber=Math.min(doc.numPages,pageNumber+1),smaller:()=>zoom=Math.max(.5,zoom-.25),larger:()=>zoom=Math.min(3,zoom+.25),fit:()=>zoom=1}))$(id).onclick=()=>{action();$('viewport').scrollTo(0,0);render().catch(showError);};
  let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>render().catch(showError),150);});
}
open().catch(showError);
