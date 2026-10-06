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
    const layouts=new Map(boxes.map(b=>[b.d.id,new Map(D.portLayout(b.d).map(x=>[x.p.id,x]))]));
    const anchor=x=>{const box=boxById.get(x.d.id),layout=layouts.get(x.d.id).get(x.p.id);return [box.min[0]+.06+(layout.column+.5)*(box.max[0]-box.min[0]-.12)/layout.columns,box.max[1]-.025-(layout.row+.5)*(box.max[1]-box.min[1]-.04)/layout.rows,.34];};
    const points=boxes.flatMap(b=>b.d.portList.map(p=>({id:p.id,label:`${b.label} / ${p.number}`,number:p.number,status:p.status,service:p.status==='fault'?'':(p.service||''),color:p.status==='fault'?'#d35352':(p.service?D.serviceColor(state,p.service):''),point:anchor({d:b.d,p}),deviceId:b.id})));
    const links=linked.map(({from,to},i)=>({id:from.p.id,fromId:from.p.id,toId:to.p.id,a:anchor(from),b:anchor(to),depth:.65+(i%7)*.09,color:D.serviceColor(state,from.p.service||''),label:`${from.r.name} / ${from.d.name}:${from.p.number} → ${to.r.name} / ${to.d.name}:${to.p.number}`,cable:from.p.cable,vlan:from.p.vlan||'',service:from.p.service||'',external:from.r.id!==to.r.id}));
    return {rackId,name:rack.name,height:rack.u*U,boxes,points,links,remote:remote.length>0};
  }
  function curve(link,t){const a=link.a,b=link.b,q=1-t;return [a[0]*q+b[0]*t,a[1]*q+b[1]*t,.34+3*q*t*link.depth];}
  function mount(canvas,scene,onSelect){
    const ctx=canvas.getContext('2d');let yaw=-.35,pitch=.10,zoom=1,panX=0,panY=0,selected='',drag=null,moved=false,hit=[],disposed=false;
    if(!ctx)return {destroy(){},select(){},rotate(){},tilt(){},zoom(){},front(){},reset(){}};
    const project=p=>{const x=p[0]-(scene.remote ? .8 : 0),y=p[1]-scene.height/2,z=p[2];const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=y*Math.sin(pitch)+rz*Math.cos(pitch);const scale=Math.min(canvas.clientWidth/(scene.remote?6:3.6),canvas.clientHeight/(scene.height+1.2))*zoom;const perspective=14/(14-depth);return {x:canvas.clientWidth/2+rx*scale*perspective+panX,y:canvas.clientHeight/2-ry*scale*perspective+panY,z:depth};};
    function line(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
    function polygon(points,color){ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#758d91';ctx.lineWidth=.6;ctx.stroke();}
    function draw(){
      if(disposed)return;const width=canvas.clientWidth||700,height=canvas.clientHeight||600,dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
      const backdrop=ctx.createLinearGradient(0,0,0,height);backdrop.addColorStop(0,'#152d35');backdrop.addColorStop(.64,'#203d43');backdrop.addColorStop(1,'#304d50');ctx.fillStyle=backdrop;ctx.fillRect(0,0,width,height);hit=[];
      const floorY=-.12;
      for(let x=-4;x<=4;x+=.5)line([[x,floorY,-3],[x,floorY,3]],'rgba(194,218,211,.075)',.7);
      for(let z=-3;z<=3;z+=.5)line([[-4,floorY,z],[4,floorY,z]],'rgba(194,218,211,.075)',.7);
      polygon([[-1.18,-.04,-.48],[1.18,-.04,-.48],[1.18,-.04,.48],[-1.18,-.04,.48]],'rgba(4,14,18,.22)');
      polygon([[-1.12,0,-.43],[1.12,0,-.43],[1.12,scene.height,-.43],[-1.12,scene.height,-.43]],'rgba(50,70,77,.27)');
      polygon([[-1.12,0,-.43],[-1.12,scene.height,-.43],[-1.12,scene.height,.43],[-1.12,0,.43]],'rgba(152,177,177,.13)');
      polygon([[1.12,0,-.43],[1.12,scene.height,-.43],[1.12,scene.height,.43],[1.12,0,.43]],'rgba(7,20,26,.28)');
      for(const x of [-1.08,1.08]){line([[x,0,-.4],[x,scene.height,-.4],[x,scene.height,.4],[x,0,.4],[x,0,-.4]],'#789095',2.2);line([[x,0,.4],[x,scene.height,.4]],'rgba(207,225,221,.55)',.8);}
      for(const y of [0,scene.height]){line([[-1.08,y,-.4],[1.08,y,-.4],[1.08,y,.4],[-1.08,y,.4],[-1.08,y,-.4]],'#91a6a4',2);line([[-1.08,y,.4],[1.08,y,.4]],'#b2c4bf',1.1);}
      const units=Math.max(1,Math.round(scene.height/U));
      for(let u=0;u<units;u++){
        const y=u*U;
        line([[-1.075,y,.414],[1.075,y,.414]],'rgba(177,196,194,.19)',.55);
        for(const x of [-1.045,1.045]){
          const center=project([x,y+U/2,.418]),size=Math.max(1.5,Math.min(3.2,canvas.clientWidth/220));
          ctx.fillStyle='#17282d';ctx.fillRect(center.x-size/2,center.y-size/2,size,size);
          ctx.strokeStyle='rgba(191,211,206,.55)';ctx.lineWidth=.55;ctx.strokeRect(center.x-size/2,center.y-size/2,size,size);
        }
      }
      for(let i=0;i<units;i++){if(i%5!==0&&i!==units-1)continue;const y=i*U,q=project([-1.13,y,.42]);ctx.fillStyle='rgba(214,229,223,.67)';ctx.font='9px Segoe UI,sans-serif';ctx.textAlign='right';ctx.fillText(String(i+1).padStart(2,'0'),q.x-5,q.y+3);}ctx.textAlign='start';
      for(const b of [...scene.boxes].sort((a,b)=>project(a.min).z-project(b.min).z)){
        const [x,y,z]=b.min,[xx,yy,zz]=b.max;
        polygon([[x,y,z],[xx,y,z],[xx,yy,z],[x,yy,z]],'rgba(102,126,130,.16)');
        polygon([[x,yy,z],[xx,yy,z],[xx,yy,zz],[x,yy,zz]],'rgba(190,208,205,.22)');
        polygon([[xx,y,z],[xx,yy,z],[xx,yy,zz],[xx,y,zz]],shade(b.color,-.05));
        polygon([[x,y,zz],[xx,y,zz],[xx,yy,zz],[x,yy,zz]],shade(b.color,.72));
        line([[x+.025,y+.018,zz+.006],[xx-.025,y+.018,zz+.006],[xx-.025,yy-.018,zz+.006],[x+.025,yy-.018,zz+.006],[x+.025,y+.018,zz+.006]],'rgba(255,255,255,.68)',.8);
        for(const [sx,sy] of [[x+.045,y+.04],[xx-.045,y+.04],[x+.045,yy-.04],[xx-.045,yy-.04]]){
          const screw=project([sx,sy,zz+.01]);ctx.beginPath();ctx.arc(screw.x,screw.y,1.6,0,Math.PI*2);ctx.fillStyle='#6d7c80';ctx.fill();ctx.strokeStyle='#e0e7e4';ctx.lineWidth=.55;ctx.stroke();
        }
        const label=project([x+.07,yy-.035,zz+.012]);ctx.font='bold 9px Segoe UI, sans-serif';ctx.fillStyle='#21333a';ctx.fillText(b.label,label.x,label.y-3);
        const led=project([xx-.075,yy-.045,zz+.012]);ctx.beginPath();ctx.arc(led.x,led.y,2,0,Math.PI*2);ctx.fillStyle='#7ce0a3';ctx.shadowColor='#7ce0a3';ctx.shadowBlur=5;ctx.fill();ctx.shadowBlur=0;
      }
      for(const p of scene.points){
        const v=project(p.point),compact=scene.points.length>48,width=compact?8:12,height=compact?5:7;
        ctx.fillStyle='#13262c';ctx.fillRect(v.x-width/2-2,v.y-height/2-2,width+4,height+4);ctx.strokeStyle='rgba(255,255,255,.34)';ctx.lineWidth=.6;ctx.strokeRect(v.x-width/2-2,v.y-height/2-2,width+4,height+4);
        ctx.fillStyle=p.color|| (p.status==='fault'?'#e15b5b':p.status==='used'?'#4b9ee8':'#8ed3b1');ctx.fillRect(v.x-width/2,v.y-height/2,width,height);
        ctx.strokeStyle='#d9e9e4';ctx.lineWidth=.65;ctx.strokeRect(v.x-width/2+.5,v.y-height/2+.5,width-1,height-1);
        ctx.fillStyle=p.status==='fault'?'#e15b5b':p.status==='used'?'#4b9ee8':'#8ed3b1';ctx.fillRect(v.x-width/2,v.y+height/2-1,width,1);
        if(p.service){ctx.fillStyle='#fff';ctx.fillRect(v.x-1,v.y-1,2,2);}
        if(!compact){ctx.font='bold 7px Segoe UI,sans-serif';ctx.fillStyle='#102b31';ctx.textAlign='center';ctx.fillText(String(p.number),v.x,v.y+2.5);ctx.textAlign='start';}
      }
      for(const link of [...scene.links].sort((a,b)=>(a.id===selected?1:0)-(b.id===selected?1:0))){
        const isSelected=link.id===selected,points=Array.from({length:33},(_,i)=>curve(link,i/32));ctx.globalAlpha=selected&&!isSelected ? .15 : .9;line(points,'#08191e',isSelected?8:5);line(points,link.color,isSelected?4.5:2.5);ctx.globalAlpha=.4;line(points,'#ffffff',.65);ctx.globalAlpha=1;
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
    canvas.onkeydown=e=>{
      if(e.key==='ArrowLeft')yaw-=.12;
      else if(e.key==='ArrowRight')yaw+=.12;
      else if(e.key==='ArrowUp')pitch=Math.max(-.95,pitch-.12);
      else if(e.key==='ArrowDown')pitch=Math.min(.95,pitch+.12);
      else if(e.key==='+'||e.key==='=')zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1.2);
      else if(e.key==='-')zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,1/1.2);
      else if(e.key==='Home'){yaw=-.35;pitch=.10;zoom=1;panX=0;panY=0;selected='';onSelect?.('');}
      else if(e.key==='Escape'){selected='';onSelect?.('');}
      else return;
      e.preventDefault();draw();
    };
    const zoomAt=(clientX,clientY,factor)=>{const rect=canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top,cx=canvas.clientWidth/2,cy=canvas.clientHeight/2,old=zoom,next=Math.max(.45,Math.min(4,zoom*factor));if(next===old)return;panX=x-cx-(x-cx-panX)*next/old;panY=y-cy-(y-cy-panY)*next/old;zoom=next;};
    canvas.onwheel=e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));draw();};
    canvas.oncontextmenu=e=>e.preventDefault();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;observer?.observe(canvas);draw();
    return {select(id){selected=id;draw();},rotate(delta){yaw+=delta;draw();},tilt(delta){pitch=Math.max(-.95,Math.min(.95,pitch+delta));draw();},zoom(factor){zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,factor);draw();},front(){yaw=0;pitch=0;panX=0;panY=0;zoom=1;draw();},reset(){yaw=-.35;pitch=.10;zoom=1;panX=0;panY=0;selected='';draw();},destroy(){disposed=true;observer?.disconnect();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onwheel=canvas.oncontextmenu=canvas.onkeydown=null;pointers.clear();}};
  }
  return {buildScene,curve,mount};
});
