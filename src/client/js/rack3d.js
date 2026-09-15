(function(root,factory){if(typeof module==='object')module.exports=factory(require('../../shared/domain'));else root.Rack3D=factory(root.RackDomain);})(typeof globalThis!=='undefined'?globalThis:this,function(D){
  'use strict';
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  const U=.18;
  function shade(hex,amount){
    const value=String(hex||'#397c78').replace('#',''),rgb=value.match(/../g)?.map(x=>parseInt(x,16))||[57,124,120];
    return '#'+rgb.map(channel=>Math.max(0,Math.min(255,Math.round(channel+(amount<0?channel:255-channel)*amount))).toString(16).padStart(2,'0')).join('');
  }
  function buildScene(state,rackId){
    const rack=state.floors.flatMap(f=>f.racks).find(r=>r.id===rackId);if(!rack)throw new Error(tr('Ռաքը չի գտնվել'));
    const all=D.ports(state),byId=new Map(all.map(x=>[x.p.id,x]));
    const linked=all.filter(x=>x.p.switchPortId&&byId.has(x.p.switchPortId)).map(x=>({from:x,to:byId.get(x.p.switchPortId)})).filter(x=>x.from.r.id===rackId||x.to.r.id===rackId);
    const remote=[...new Map(linked.flatMap(x=>[x.from,x.to]).filter(x=>x.r.id!==rackId).map(x=>[x.d.id,x])).values()];
    const boxes=rack.devices.map(d=>({id:d.id,label:d.name,color:d.color,min:[-1,(d.pos-1)*U+.008,-.32],max:[1,(d.pos-1+d.height)*U-.008,.32],d,remote:false}));
    remote.forEach((x,i)=>{const y=rack.u*U*(i+1)/(remote.length+1);boxes.push({id:x.d.id,label:`${x.r.name} / ${x.d.name}`,color:x.d.color,min:[1.8,y,-.1],max:[3.3,y+.22,.32],d:x.d,remote:true});});
    const boxById=new Map(boxes.map(x=>[x.id,x]));
    const anchor=x=>{const box=boxById.get(x.d.id),rows=Math.ceil(x.d.portList.length/24);return [box.min[0]+.06+((x.p.number-1)%24+.5)*(box.max[0]-box.min[0]-.12)/24,box.max[1]-.025-(Math.floor((x.p.number-1)/24)+.5)*(box.max[1]-box.min[1]-.04)/rows,.34];};
    const points=boxes.flatMap(b=>b.d.portList.map(p=>({id:p.id,label:`${b.label} / ${p.number}`,number:p.number,status:p.status,service:p.service||'',point:anchor({d:b.d,p}),deviceId:b.id})));
    const links=linked.map(({from,to},i)=>({id:from.p.id,fromId:from.p.id,toId:to.p.id,a:anchor(from),b:anchor(to),depth:.65+(i%7)*.09,color:D.serviceColor(state,from.p.service||''),label:`${from.r.name} / ${from.d.name}:${from.p.number} → ${to.r.name} / ${to.d.name}:${to.p.number}`,cable:from.p.cable,vlan:from.p.vlan||'',service:from.p.service||'',external:from.r.id!==to.r.id}));
    return {rackId,name:rack.name,height:rack.u*U,boxes,points,links,remote:remote.length>0};
  }
  function curve(link,t){const a=link.a,b=link.b,q=1-t;return [a[0]*q+b[0]*t,a[1]*q+b[1]*t,.34+3*q*t*link.depth];}
  function mount(canvas,scene,onSelect){
    const ctx=canvas.getContext('2d');let yaw=-.35,pitch=.10,zoom=1,panX=0,panY=0,selected='',drag=null,moved=false,hit=[],disposed=false;
    if(!ctx)return {destroy(){},select(){},rotate(){},zoom(){},reset(){}};
    const project=p=>{const x=p[0]-(scene.remote ? .8 : 0),y=p[1]-scene.height/2,z=p[2];const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=y*Math.sin(pitch)+rz*Math.cos(pitch);const scale=Math.min(canvas.clientWidth/(scene.remote?6:3.6),canvas.clientHeight/(scene.height+1.2))*zoom;const perspective=14/(14-depth);return {x:canvas.clientWidth/2+rx*scale*perspective+panX,y:canvas.clientHeight/2-ry*scale*perspective+panY,z:depth};};
    function line(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
    function polygon(points,color){ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#758d91';ctx.lineWidth=.6;ctx.stroke();}
    function draw(){
      if(disposed)return;const width=canvas.clientWidth||700,height=canvas.clientHeight||600,dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#142e34';ctx.fillRect(0,0,width,height);hit=[];
      for(const x of [-1.08,1.08]){line([[x,0,-.4],[x,scene.height,-.4],[x,scene.height,.4],[x,0,.4],[x,0,-.4]],'#547277',2);}
      for(const y of [0,scene.height])line([[-1.08,y,.4],[1.08,y,.4]],'#91a6a4',2);
      for(const b of [...scene.boxes].sort((a,b)=>project(a.min).z-project(b.min).z)){
        const [x,y,z]=b.min,[xx,yy,zz]=b.max;
        polygon([[x,y,z],[xx,y,z],[xx,yy,z],[x,yy,z]],'rgba(102,126,130,.16)');
        polygon([[x,yy,z],[xx,yy,z],[xx,yy,zz],[x,yy,zz]],'rgba(190,208,205,.22)');
        polygon([[xx,y,z],[xx,yy,z],[xx,yy,zz],[xx,y,zz]],shade(b.color,-.05));
        polygon([[x,y,zz],[xx,y,zz],[xx,yy,zz],[x,yy,zz]],'rgba(218,230,226,.2)');
        const label=project([x,yy+.035,zz]);ctx.font='bold 11px Segoe UI, sans-serif';ctx.fillStyle='#fff';ctx.fillText(b.label,label.x,label.y-4);
      }
      for(const p of scene.points){
        const v=project(p.point),compact=scene.points.length>48,width=compact?8:12,height=compact?5:7;
        ctx.fillStyle='#102b31';ctx.fillRect(v.x-width/2-1,v.y-height/2-1,width+2,height+2);
        ctx.fillStyle=p.status==='fault'?'#e15b5b':p.status==='used'?'#4b9ee8':'#8ed3b1';ctx.fillRect(v.x-width/2,v.y-height/2,width,height);
        ctx.strokeStyle='#d9e9e4';ctx.lineWidth=.65;ctx.strokeRect(v.x-width/2+.5,v.y-height/2+.5,width-1,height-1);
        if(p.service){ctx.fillStyle='#fff';ctx.fillRect(v.x-1,v.y-1,2,2);}
        if(!compact){ctx.font='bold 7px Segoe UI,sans-serif';ctx.fillStyle='#102b31';ctx.textAlign='center';ctx.fillText(String(p.number),v.x,v.y+2.5);ctx.textAlign='start';}
      }
      for(const link of [...scene.links].sort((a,b)=>(a.id===selected?1:0)-(b.id===selected?1:0))){
        const isSelected=link.id===selected,points=Array.from({length:33},(_,i)=>curve(link,i/32));ctx.globalAlpha=selected&&!isSelected ? .17 : 1;line(points,link.color,isSelected?5:2.5);ctx.globalAlpha=1;
        hit.push({id:link.id,points:points.map(project)});
        if(isSelected){for(const [point,label] of [[link.a,scene.points.find(x=>x.id===link.fromId)?.number],[link.b,scene.points.find(x=>x.id===link.toId)?.number]]){const q=project(point);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#f5d879';ctx.fill();ctx.font='bold 12px Segoe UI';ctx.fillStyle='#142e34';ctx.fillText(String(label),q.x+10,q.y+4);}}
      }
      if(!scene.links.length){ctx.fillStyle='#bdd3cf';ctx.font='14px Segoe UI';ctx.fillText(tr('Գրանցված միացումներ դեռ չկան'),20,height-24);}
    }
    const pointers=new Map();
    canvas.onpointerdown=e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,mode:e.button===2||e.button===1||e.shiftKey?'pan':'rotate'};moved=false;canvas.setPointerCapture?.(e.pointerId);};
    canvas.onpointermove=e=>{if(!drag)return;const previous=pointers.get(e.pointerId)||drag;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>1){const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(canvas._pinchDistance){zoomAt((a.x+b.x)/2,(a.y+b.y)/2,distance/canvas._pinchDistance);}canvas._pinchDistance=distance;moved=true;draw();return;}const dx=e.clientX-previous.x,dy=e.clientY-previous.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;if(drag.mode==='pan'){panX+=dx;panY+=dy;}else{yaw+=dx*.008;pitch=Math.max(-.95,Math.min(.95,pitch+dy*.006));}drag={...drag,x:e.clientX,y:e.clientY};draw();};
    canvas.onpointerup=e=>{pointers.delete(e.pointerId);canvas._pinchDistance=0;drag=null;if(moved)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let nearest=null,distance=14;for(const h of hit)for(const p of h.points){const d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;nearest=h.id;}}if(nearest){selected=nearest;draw();onSelect?.(nearest);}};
    canvas.onpointercancel=e=>{pointers.delete(e.pointerId);canvas._pinchDistance=0;drag=null;};
    const zoomAt=(clientX,clientY,factor)=>{const rect=canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top,cx=canvas.clientWidth/2,cy=canvas.clientHeight/2,old=zoom,next=Math.max(.45,Math.min(4,zoom*factor));if(next===old)return;panX=x-cx-(x-cx-panX)*next/old;panY=y-cy-(y-cy-panY)*next/old;zoom=next;};
    canvas.onwheel=e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));draw();};
    canvas.oncontextmenu=e=>e.preventDefault();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;observer?.observe(canvas);draw();
    return {select(id){selected=id;draw();},rotate(delta){yaw+=delta;draw();},tilt(delta){pitch=Math.max(-.95,Math.min(.95,pitch+delta));draw();},zoom(factor){zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,factor);draw();},reset(){yaw=-.35;pitch=.10;zoom=1;panX=0;panY=0;selected='';draw();},destroy(){disposed=true;observer?.disconnect();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onwheel=canvas.oncontextmenu=null;pointers.clear();}};
  }
  return {buildScene,curve,mount};
});
