(function(root,factory){if(typeof module==='object')module.exports=factory(require('../../shared/domain'));else root.Rack3D=factory(root.RackDomain);})(typeof globalThis!=='undefined'?globalThis:this,function(D){
  'use strict';
  const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  const U=.18;

  function faceLayout(device){
    if(device.type!=='panel')return D.portLayout(device);
    const count=device.portList.length,columns=Math.min(24,count),rows=Math.ceil(count/24);
    return device.portList.map((p,i)=>({p,column:i%24,row:Math.floor(i/24),columns,rows}));
  }

  function parseRgb(color){
    if(!color)return [57,124,120];
    const s=String(color).trim();
    if(s.startsWith('#')){
      const hex=s.slice(1);
      if(hex.length===3)return [parseInt(hex[0]+hex[0],16),parseInt(hex[1]+hex[1],16),parseInt(hex[2]+hex[2],16)];
      const m=hex.match(/../g);
      if(m&&m.length>=3)return [parseInt(m[0],16),parseInt(m[1],16),parseInt(m[2],16)];
    }
    const m=s.match(/\d+/g);
    if(m&&m.length>=3)return [+m[0],+m[1],+m[2]];
    return [57,124,120];
  }

  function shade(hex,amount){
    const rgb=parseRgb(hex);
    return '#'+rgb.map(c=>Math.max(0,Math.min(255,Math.round(c+(amount<0?c:255-c)*amount))).toString(16).padStart(2,'0')).join('');
  }

  function litColor(base,normal,ambient=0.38,spec=0){
    const dot=normal[0]*0.35+normal[1]*0.75+normal[2]*0.56;
    const diff=ambient+(1-ambient)*Math.max(0,dot);
    const rgb=parseRgb(base);
    const r=Math.min(255,Math.max(0,Math.round(rgb[0]*diff+spec)));
    const g=Math.min(255,Math.max(0,Math.round(rgb[1]*diff+spec)));
    const b=Math.min(255,Math.max(0,Math.round(rgb[2]*diff+spec)));
    return `rgb(${r},${g},${b})`;
  }

  function buildScene(state,rackId){
    const rack=state.floors.flatMap(f=>f.racks).find(r=>r.id===rackId);if(!rack)throw new Error(tr('Ռաքը չի գտնվել'));
    const all=D.ports(state),byId=new Map(all.map(x=>[x.p.id,x]));
    const linked=all.filter(x=>x.p.switchPortId&&byId.has(x.p.switchPortId)).map(x=>({from:x,to:byId.get(x.p.switchPortId)})).filter(x=>x.from.r.id===rackId||x.to.r.id===rackId);
    const remote=[...new Map(linked.flatMap(x=>[x.from,x.to]).filter(x=>x.r.id!==rackId).map(x=>[x.d.id,x])).values()];
    const boxes=rack.devices.map(d=>({id:d.id,label:d.name,color:D.effectiveDeviceColor(d,rack.devices),min:[-1,(d.pos-1)*U+.008,d.type==='panel'?.12:-.32],max:[1,(d.pos-1+d.height)*U-.008,.32],d,remote:false}));
    remote.forEach((x,i)=>{const y=rack.u*U*(i+1)/(remote.length+1);boxes.push({id:x.d.id,label:`${x.r.name} / ${x.d.name}`,color:D.effectiveDeviceColor(x.d,x.r.devices),min:[1.8,y,-.1],max:[3.3,y+.22,.32],d:x.d,remote:true});});
    const boxById=new Map(boxes.map(x=>[x.id,x]));
    const layouts=new Map(boxes.map(b=>[b.d.id,new Map(faceLayout(b.d).map(x=>[x.p.id,x]))]));
    const socket=x=>{
      const box=boxById.get(x.d.id),layout=layouts.get(x.d.id).get(x.p.id),panel=x.d.type==='panel';
      const usable=box.max[0]-box.min[0]-.22,groups=panel?Math.ceil(layout.columns/6):1,gap=panel?.025:0;
      const cell=(usable-(groups-1)*gap)/layout.columns,rowHeight=(box.max[1]-box.min[1]-.055)/layout.rows;
      return {point:[box.min[0]+.11+(layout.column+.5)*cell+(panel?Math.floor(layout.column/6)*gap:0),box.max[1]-.045-(layout.row+.5)*rowHeight,.34],width:Math.min(layout.optical?.075:.065,cell*.78),height:Math.min(.047,rowHeight*.52),panel,switch:x.d.type==='switch',optical:!!layout.optical};
    };
    const anchor=x=>socket(x).point;
    const points=boxes.flatMap(b=>b.d.portList.map(p=>({id:p.id,label:`${b.label} / ${p.number}`,number:p.number,status:p.status,service:p.status==='fault'?'':(p.service||''),color:p.status==='fault'?'#d35352':(p.service?D.serviceColor(state,p.service):''),...socket({d:b.d,p}),deviceId:b.id})));
    const links=linked.map(({from,to},i)=>({id:from.p.id,fromId:from.p.id,toId:to.p.id,a:anchor(from),b:anchor(to),depth:.65+(i%7)*.09,color:D.serviceColor(state,from.p.service||''),label:`${from.r.name} / ${from.d.name}:${from.p.number} → ${to.r.name} / ${to.d.name}:${to.p.number}`,cable:from.p.cable,vlan:from.p.vlan||'',service:from.p.service||'',external:from.r.id!==to.r.id}));
    const connected=new Set(links.flatMap(link=>[link.fromId,link.toId]));
    for(const p of points)p.connected=connected.has(p.id);
    const pointById=new Map(points.map(p=>[p.id,p]));
    for(const link of links)link.fault=pointById.get(link.fromId).status==='fault'||pointById.get(link.toId).status==='fault';
    return {rackId,name:rack.name,height:rack.u*U,boxes,points,links,remote:remote.length>0};
  }

  function curve(link,t){
    const a=link.a,b=link.b,q=1-t;
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const dist=Math.hypot(dx,dy);
    const fwd=Math.min(0.16,Math.max(0.06,0.05+dist*0.08+((link.depth%0.08)||0.02)));
    const sag=Math.min(0.08,0.02+dist*0.04)*(dy>0?0.5:1.0);
    return [
      a[0]*q+b[0]*t,
      a[1]*q+b[1]*t-4*q*t*sag,
      a[2]*q+b[2]*t+4*q*t*fwd
    ];
  }

  function mount(canvas,scene,onSelect,{onAnimationChange=()=>{}}={}){
    const ctx=canvas.getContext('2d');let yaw=-.35,pitch=.10,zoom=1,panX=0,panY=0,selected='',drag=null,moved=false,hit=[],disposed=false;
    if(!ctx)return {destroy(){},select(){},rotate(){},tilt(){},zoom(){},front(){},reset(){},toggleAnimation(){return false;}};
    const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)'),doc=globalThis.document;
    let animation=!motion?.matches,frame=null,lastFrame=-Infinity,phase=0,inView=true;
    const motionEnabled=()=>animation&&!motion?.matches;
    const hasAnimation=scene.links.some(link=>!link.fault)||scene.points.some(p=>p.switch&&(p.connected||p.status==='used')&&p.status!=='fault');
    const canAnimate=()=>!disposed&&hasAnimation&&motionEnabled()&&!doc?.hidden&&inView;
    const stopAnimation=()=>{if(frame!==null)window.cancelAnimationFrame?.(frame);frame=null;};
    const tick=time=>{frame=null;if(!canAnimate())return;if(time-lastFrame>=50){phase=time/1000;lastFrame=time;draw();}frame=window.requestAnimationFrame?.(tick)??null;};
    const syncAnimation=()=>{if(disposed)return;stopAnimation();onAnimationChange(motionEnabled());draw();if(canAnimate())frame=window.requestAnimationFrame?.(tick)??null;};

    const project=p=>{
      const x=p[0]-(scene.remote ? .8 : 0),y=p[1]-scene.height/2,z=p[2];
      const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);
      const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=y*Math.sin(pitch)+rz*Math.cos(pitch);
      const scale=Math.min(canvas.clientWidth/(scene.remote?6:3.6),canvas.clientHeight/(scene.height+1.2))*zoom;
      const perspective=14/(14-depth);
      return {x:canvas.clientWidth/2+rx*scale*perspective+panX,y:canvas.clientHeight/2-ry*scale*perspective+panY,z:depth};
    };

    function line(points,color,width=1){
      ctx.beginPath();
      points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
    }

    function polygon(points,color,stroke='#4c616b',strokeWidth=0.6){
      ctx.beginPath();
      points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
      if(strokeWidth>0){ctx.strokeStyle=stroke;ctx.lineWidth=strokeWidth;ctx.stroke();}
    }

    function quad(p0,p1,p2,p3,color,normal,ambient=0.38,spec=0,stroke='#4c616b',strokeWidth=0.5){
      const isGrad=typeof color!=='string';
      const fillColor=(normal&&!isGrad)?litColor(color,normal,ambient,spec):color;
      polygon([p0,p1,p2,p3],fillColor,stroke,strokeWidth);
    }

    function drawBox(min,max,color,ambient=0.35,spec=0,stroke='#42555e',strokeWidth=0.5){
      const [x,y,z]=min,[xx,yy,zz]=max;
      quad([x,y,z],[xx,y,z],[xx,y,zz],[x,y,zz],color,[0,-1,0],ambient*0.7,0,stroke,strokeWidth);
      quad([xx,y,z],[x,y,z],[x,yy,z],[xx,yy,z],color,[0,0,-1],ambient*0.8,0,stroke,strokeWidth);
      quad([x,y,z],[x,y,zz],[x,yy,zz],[x,yy,z],color,[-1,0,0],ambient,0,stroke,strokeWidth);
      quad([xx,y,zz],[xx,y,z],[xx,yy,z],[xx,yy,zz],color,[1,0,0],ambient,spec*0.5,stroke,strokeWidth);
      quad([x,yy,zz],[xx,yy,zz],[xx,yy,z],[x,yy,z],color,[0,1,0],ambient,spec,stroke,strokeWidth);
      quad([x,y,zz],[xx,y,zz],[xx,yy,zz],[x,yy,zz],color,[0,0,1],ambient,spec,stroke,strokeWidth);
    }

    function lamp(point,color,brightness=1){
      const q=project(point),edge=project([point[0]+.004,point[1],point[2]]),radius=Math.max(.8,Math.min(2.2,Math.abs(edge.x-q.x)));
      ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);ctx.globalAlpha=brightness;ctx.fillStyle=color;
      ctx.shadowColor=color;ctx.shadowBlur=brightness>.7?4:0;ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
    }

    function draw(){
      if(disposed)return;
      const width=canvas.clientWidth||700,height=canvas.clientHeight||600,dpr=window.devicePixelRatio||1;
      if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
      if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);

      // Datacenter Studio Backdrop
      const backdrop=typeof ctx.createLinearGradient==='function'?ctx.createLinearGradient(0,0,0,height):null;
      if(backdrop&&typeof backdrop.addColorStop==='function'){
        backdrop.addColorStop(0,'#0e1c22');
        backdrop.addColorStop(0.55,'#182e36');
        backdrop.addColorStop(1,'#223b42');
        ctx.fillStyle=backdrop;
      }else{
        ctx.fillStyle='#182e36';
      }
      ctx.fillRect(0,0,width,height);
      hit=[];

      // 1. Perspective Floor Grid & Contact Shadow
      const floorY=-0.14;
      for(let x=-4;x<=4;x+=0.5)line([[x,floorY,-3],[x,floorY,3]],'rgba(194,218,211,.075)',0.7);
      for(let z=-3;z<=3;z+=0.5)line([[-4,floorY,z],[4,floorY,z]],'rgba(194,218,211,.075)',0.7);

      const footCenter=project([0,floorY,0]);
      const shadowW=Math.abs(project([1.35,floorY,0]).x-footCenter.x);
      const shadowH=Math.max(6,shadowW*0.35);
      const groundShadow=typeof ctx.createRadialGradient==='function'?ctx.createRadialGradient(footCenter.x,footCenter.y,shadowW*0.15,footCenter.x,footCenter.y,shadowW):null;
      if(groundShadow&&typeof groundShadow.addColorStop==='function'){
        groundShadow.addColorStop(0,'rgba(4,10,14,0.7)');
        groundShadow.addColorStop(0.6,'rgba(6,14,18,0.3)');
        groundShadow.addColorStop(1,'rgba(8,18,22,0)');
        ctx.fillStyle=groundShadow;
      }else{
        ctx.fillStyle='rgba(6,14,18,0.35)';
      }
      ctx.beginPath();
      if(typeof ctx.ellipse==='function'){
        ctx.ellipse(footCenter.x,footCenter.y,shadowW,shadowH,0,0,Math.PI*2);
      }else{
        ctx.arc(footCenter.x,footCenter.y,shadowW,0,Math.PI*2);
      }
      ctx.fill();

      // 2. 4 Leveling Feet
      for(const [fx,fz] of [[-1.10,-0.42],[1.10,-0.42],[-1.10,0.42],[1.10,0.42]]){
        drawBox([fx-0.05,floorY,fz-0.05],[fx+0.05,floorY+0.035,fz+0.05],'#1b272c',0.3,0,'#354850',0.5);
        drawBox([fx-0.02,floorY+0.035,fz-0.02],[fx+0.02,-0.05,fz+0.02],'#8ea0a8',0.5,35,'#b4c4cc',0.5);
      }

      // 3. Solid Plinth Base Frame
      drawBox([-1.18,-0.05,-0.48],[1.18,0,0.48],'#162126',0.35,15,'#3e545d',0.8);

      // 4. Structural Corner Pillars (4 Main Posts)
      const postW=0.07,postD=0.07;
      const cornerPosts=[
        [-1.15,-0.45], // Rear Left
        [1.08,-0.45],  // Rear Right
        [-1.15,0.38],  // Front Left
        [1.08,0.38]    // Front Right
      ];
      for(const [px,pz] of cornerPosts){
        drawBox([px,0,pz],[px+postW,scene.height,pz+postD],'#1a262c',0.35,20,'#4c626c',0.6);
      }

      // 5. Side Depth Cross-Members / Braces
      for(const by of [0.03,scene.height/2,scene.height-0.04]){
        drawBox([-1.15,by,-0.38],[-1.08,by+0.03,0.38],'#202e35',0.35,15,'#435761',0.5);
        drawBox([1.08,by,-0.38],[1.15,by+0.03,0.38],'#202e35',0.35,15,'#435761',0.5);
      }

      // 6. Smoked & Perforated Side Panels
      quad([-1.145,0.04,-0.38],[-1.145,0.04,0.38],[-1.145,scene.height-0.04,0.38],[-1.145,scene.height-0.04,-0.38],'rgba(20,34,40,0.35)',[-1,0,0],0.4,0,'rgba(72,96,105,0.35)',0.6);
      quad([1.145,0.04,-0.38],[1.145,0.04,0.38],[1.145,scene.height-0.04,0.38],[1.145,scene.height-0.04,-0.38],'rgba(20,34,40,0.35)',[1,0,0],0.4,0,'rgba(72,96,105,0.35)',0.6);
      quad([-1.08,0.04,-0.44],[1.08,0.04,-0.44],[1.08,scene.height-0.04,-0.44],[-1.08,scene.height-0.04,-0.44],'rgba(12,20,25,0.45)',[0,0,-1],0.3,0,'rgba(58,78,86,0.3)',0.6);

      // 7. Top Roof Cap Enclosure
      drawBox([-1.18,scene.height,-0.48],[1.18,scene.height+0.05,0.48],'#1c282e',0.38,25,'#526974',0.8);
      quad([-0.4,scene.height+0.051,-0.15],[0.4,scene.height+0.051,-0.15],[0.4,scene.height+0.051,0.15],[-0.4,scene.height+0.051,0.15],'#0d1418',[0,1,0],0.2,0,'#3a4d56',0.8);
      for(let bx=-0.36;bx<=0.36;bx+=0.04){
        line([[bx,scene.height+0.052,-0.13],[bx,scene.height+0.052,0.13]],'#25373f',0.8);
      }

      // 8. 19" Vertical Equipment Mounting Rails (EIA-310)
      drawBox([-1.05,0,0.33],[-0.97,scene.height,0.355],'#24333b',0.4,25,'#536b77',0.7);
      drawBox([0.97,0,0.33],[1.05,scene.height,0.355],'#24333b',0.4,25,'#536b77',0.7);
      drawBox([-1.05,0,-0.32],[-0.97,scene.height,-0.295],'#182329',0.3,10,'#3c4e57',0.5);
      drawBox([0.97,0,-0.32],[1.05,scene.height,-0.295],'#182329',0.3,10,'#3c4e57',0.5);

      const units=Math.max(1,Math.round(scene.height/U));
      for(let u=0;u<units;u++){
        const y=u*U;
        line([[-1.05,y,0.356],[-0.97,y,0.356]],'rgba(180,205,215,0.4)',0.6);
        line([[0.97,y,0.356],[1.05,y,0.356]],'rgba(180,205,215,0.4)',0.6);

        for(const hy of [y+U*0.16,y+U*0.50,y+U*0.84]){
          for(const rx of [-1.01,1.01]){
            const center=project([rx,hy,0.357]);
            const sz=Math.max(1.5,Math.min(3.2,canvas.clientWidth/260));
            ctx.fillStyle='#091216';ctx.fillRect(center.x-sz/2,center.y-sz/2,sz,sz);
            ctx.strokeStyle='rgba(145,175,188,0.55)';ctx.lineWidth=0.5;ctx.strokeRect(center.x-sz/2,center.y-sz/2,sz,sz);
          }
        }
      }

      // U numbers on rails
      for(let i=0;i<units;i++){
        if(i%2!==0&&i!==units-1)continue;
        const y=i*U+U/2,q=project([-1.06,y,0.358]);
        ctx.fillStyle='rgba(215,235,242,0.85)';ctx.font='bold 9px Segoe UI,sans-serif';
        ctx.textAlign='right';ctx.fillText(String(i+1).padStart(2,'0'),q.x-4,q.y+3);
      }
      ctx.textAlign='start';

      // 9. Installed Devices (Chassis & Faceplates)
      for(const b of [...scene.boxes].sort((a,b)=>project(a.min).z-project(b.min).z)){
        const [x,y,z]=b.min,[xx,yy,zz]=b.max;
        const type=b.d.type;
        const isPanel=type==='panel';
        const isSwitch=type==='switch';
        const isRouter=type==='router';
        const isServer=type==='server';
        const isUps=type==='ups';

        const chassisColor=b.color||'#26353d';

        // Chassis Bottom, Rear & Sides
        quad([x,y,z],[xx,y,z],[xx,y,zz],[x,y,zz],'#0e161a',[0,-1,0],0.25,0,'#2c3d45',0.5);
        quad([xx,y,z],[x,y,z],[x,yy,z],[xx,yy,z],'#141e24',[0,0,-1],0.28,0,'#2c3d45',0.5);
        quad([x,y,z],[x,y,zz],[x,yy,zz],[x,yy,z],shade(chassisColor,-0.3),[-1,0,0],0.35,0,'#384c56',0.5);
        quad([xx,y,zz],[xx,y,z],[xx,yy,z],[xx,yy,zz],shade(chassisColor,-0.2),[1,0,0],0.38,10,'#384c56',0.5);

        // Side cooling vents on right chassis wall
        if(!isPanel&&xx-x>1.5){
          for(let vi=0;vi<6;vi++){
            const vz=z+0.12+vi*0.06;
            line([[xx+0.001,y+0.04,vz],[xx+0.001,yy-0.04,vz]],'#10171b',1.2);
          }
        }

        // Top cover with specular lighting and sheet metal seam
        quad([x,yy,zz],[xx,yy,zz],[xx,yy,z],[x,yy,z],shade(chassisColor,-0.1),[0,1,0],0.45,30,'#4d6470',0.6);
        line([[x+0.08,yy+0.001,zz-0.04],[xx-0.08,yy+0.001,zz-0.04]],'rgba(255,255,255,0.18)',0.8);

        // 19" Mounting Ears on Left & Right
        quad([x-0.04,y,zz+0.002],[x,y,zz+0.002],[x,yy,zz+0.002],[x-0.04,yy,zz+0.002],'#222f36',[0,0,1],0.4,15,'#4c616b',0.6);
        quad([xx,y,zz+0.002],[xx+0.04,y,zz+0.002],[xx+0.04,yy,zz+0.002],[xx,yy,zz+0.002],'#222f36',[0,0,1],0.4,15,'#4c616b',0.6);

        // Silver rack mounting screws
        for(const [sx,sy] of [[x-0.02,y+(yy-y)*0.25],[x-0.02,y+(yy-y)*0.75],[xx+0.02,y+(yy-y)*0.25],[xx+0.02,y+(yy-y)*0.75]]){
          const scr=project([sx,sy,zz+0.005]);
          ctx.beginPath();ctx.arc(scr.x,scr.y,2.2,0,Math.PI*2);ctx.fillStyle='#9ab0b8';ctx.fill();
          ctx.strokeStyle='#e4edf0';ctx.lineWidth=0.6;ctx.stroke();
          ctx.beginPath();ctx.arc(scr.x,scr.y,1.1,0,Math.PI*2);ctx.fillStyle='#36474f';ctx.fill();
        }

        // Front Faceplate / Bezel
        const topFace=project([x,yy,zz]),botFace=project([x,y,zz]);
        const faceGrad=typeof ctx.createLinearGradient==='function'?ctx.createLinearGradient(topFace.x,topFace.y,botFace.x,botFace.y):null;
        const hasFaceGrad=faceGrad&&typeof faceGrad.addColorStop==='function';
        if(hasFaceGrad){
          if(isSwitch){
            faceGrad.addColorStop(0,'#465862');faceGrad.addColorStop(0.35,'#2b3941');faceGrad.addColorStop(1,'#1f2a30');
          }else if(isPanel){
            faceGrad.addColorStop(0,'#2a353b');faceGrad.addColorStop(0.4,'#192226');faceGrad.addColorStop(1,'#12191c');
          }else if(isRouter){
            faceGrad.addColorStop(0,'#3a4d57');faceGrad.addColorStop(0.35,'#23323a');faceGrad.addColorStop(1,'#182329');
          }else if(isServer){
            faceGrad.addColorStop(0,'#4d5d65');faceGrad.addColorStop(0.3,'#2c3940');faceGrad.addColorStop(1,'#1a2429');
          }else if(isUps){
            faceGrad.addColorStop(0,'#354247');faceGrad.addColorStop(0.4,'#212b30');faceGrad.addColorStop(1,'#161d21');
          }else{
            faceGrad.addColorStop(0,shade(chassisColor,0.2));faceGrad.addColorStop(0.4,shade(chassisColor,0.0));faceGrad.addColorStop(1,shade(chassisColor,-0.2));
          }
        }
        const faceFill=hasFaceGrad?faceGrad:(isSwitch?'#2b3941':isPanel?'#192226':isRouter?'#23323a':isServer?'#2c3940':isUps?'#212b30':chassisColor);
        quad([x,y,zz],[xx,y,zz],[xx,yy,zz],[x,yy,zz],faceFill,[0,0,1],0.5,20,'#4d646f',0.7);

        // Faceplate specular edge lines
        line([[x+0.01,yy-0.008,zz+0.003],[xx-0.01,yy-0.008,zz+0.003]],'rgba(255,255,255,0.45)',0.8);
        line([[x+0.01,y+0.008,zz+0.003],[xx-0.01,y+0.008,zz+0.003]],'rgba(0,0,0,0.5)',0.8);

        if(isPanel){
          // White designation label strip across the faceplate
          quad([x+0.10,yy-0.038,zz+0.003],[xx-0.10,yy-0.038,zz+0.003],[xx-0.10,yy-0.022,zz+0.003],[x+0.10,yy-0.022,zz+0.003],'#eef4f7',[0,0,1],0.9,0,'#b8c8cf',0.5);
        }else if(isServer){
          const bayCount=Math.min(8,Math.max(4,Math.round((xx-x)*3)));
          const bayW=(xx-x-0.4)/bayCount;
          for(let bi=0;bi<bayCount;bi++){
            const bx=x+0.15+bi*bayW;
            quad([bx,y+0.02,zz+0.003],[bx+bayW-0.02,y+0.02,zz+0.003],[bx+bayW-0.02,yy-0.03,zz+0.003],[bx,yy-0.03,zz+0.003],'#152026',[0,0,1],0.4,0,'#3c4e56',0.6);
            lamp([bx+bayW-0.04,yy-0.045,zz+0.005],'#39e07b',0.85);
          }
        }else if(isUps){
          quad([x+0.15,y+0.03,zz+0.003],[x+0.65,y+0.03,zz+0.003],[x+0.65,yy-0.03,zz+0.003],[x+0.15,yy-0.03,zz+0.003],'#0a2e33',[0,0,1],0.6,0,'#27747e',1);
          lamp([x+0.22,(y+yy)/2,zz+0.005],'#41f3d0',1);
        }

        // Silkscreen brand / model text
        const lblStart=project([x+0.08,yy-0.020,zz+0.006]),lblEnd=project([xx-0.08,yy-0.020,zz+0.006]);
        const lblWidth=Math.hypot(lblEnd.x-lblStart.x,lblEnd.y-lblStart.y);
        ctx.font=`bold ${Math.min(10,Math.max(6,lblWidth/40))}px Segoe UI,sans-serif`;
        ctx.fillStyle=isPanel?'#1b2d35':'#d5e4eb';
        ctx.fillText(b.label+(b.d.model?' · '+b.d.model:''),lblStart.x,lblStart.y-2,Math.max(1,lblWidth));

        if(!isPanel){
          lamp([xx-0.065,yy-0.025,zz+0.008],'#38e388',0.9);
        }
      }

      // 10. Modular RJ45 / Optical SFP Sockets
      for(const p of scene.points){
        const [x,y,z]=p.point,w=p.width/2,h=p.height/2;

        quad([x-w*1.15,y-h*1.15,z],[x+w*1.15,y-h*1.15,z],[x+w*1.15,y+h*1.15,z],[x-w*1.15,y+h*1.15,z],p.optical?'#b0c3cc':'#7d9098',[0,0,1],0.6,20,'#9ab0b8',0.6);
        quad([x-w,y-h,z+0.001],[x+w,y-h,z+0.001],[x+w,y+h,z+0.001],[x-w,y+h,z+0.001],'#060e11',[0,0,1],0.2,0,'#16252b',0.4);

        if(p.optical){
          quad([x-w*0.75,y-h*0.65,z+0.002],[x-w*0.05,y-h*0.65,z+0.002],[x-w*0.05,y+h*0.65,z+0.002],[x-w*0.75,y+h*0.65,z+0.002],'#1a333f',[0,0,1],0.4,0,'#3d677a',0.6);
          quad([x+w*0.05,y-h*0.65,z+0.002],[x+w*0.75,y-h*0.65,z+0.002],[x+w*0.75,y+h*0.65,z+0.002],[x+w*0.05,y+h*0.65,z+0.002],'#1a333f',[0,0,1],0.4,0,'#3d677a',0.6);
        }else{
          quad([x-w*0.4,y-h*1.2,z+0.002],[x+w*0.4,y-h*1.2,z+0.002],[x+w*0.4,y-h*0.6,z+0.002],[x-w*0.4,y-h*0.6,z+0.002],'#030708');
          const pix=Math.abs(project([x+w,y,z]).x-project([x-w,y,z]).x);
          if(pix>8){
            for(let pin=0;pin<8;pin++){
              const px=x-w*0.72+pin*w*1.44/7;
              line([[px,y+h*0.65,z+0.002],[px,y+h*0.05,z+0.002]],'#e5c158',0.75);
            }
          }
        }

        // Port Status Indicator LED
        const occupied=p.connected||p.status==='used';
        const ledColor=p.status==='fault'?'#ff4e4e':occupied?'#32e882':p.color||'#3e545c';
        const ledBright=motionEnabled()&&occupied&&p.status!=='fault' ? 0.65+0.35*Math.pow(Math.sin(phase*2.4+p.number*1.5),2) : occupied ? 0.85 : 0.25;
        lamp([x,y+h*1.45,z+0.003],ledColor,ledBright);

        // Silk-screen Port Number
        const numP=project([x,y-h*1.55,z+0.003]);
        const szPx=Math.hypot(project([x+w,y,z]).x-project([x-w,y,z]).x,project([x+w,y,z]).y-project([x-w,y,z]).y);
        if(szPx>=6){
          ctx.font=`bold ${Math.min(9,Math.max(5.5,szPx*0.65))}px Segoe UI,sans-serif`;
          ctx.fillStyle='#b8ced8';
          ctx.textAlign='center';
          ctx.fillText(String(p.number),numP.x,numP.y);
          ctx.textAlign='start';
        }
      }

      // 11. Cylindrical Patch Cables & RJ45 Boots
      for(const link of [...scene.links].sort((a,b)=>(a.id===selected?1:0)-(b.id===selected?1:0))){
        const isSelected=link.id===selected;
        const points=Array.from({length:33},(_,i)=>curve(link,i/32));
        hit.push({id:link.id,points:points.map(project)});

        // Molded RJ45 boot connectors at both ends
        for(const pt of [link.a, link.b]){
          const bootEnd=[pt[0],pt[1],pt[2]+0.028];
          line([pt,bootEnd],link.color,isSelected?7:4.5);
          line([pt,bootEnd],'rgba(255,255,255,0.4)',1);
        }

        ctx.globalAlpha=selected&&!isSelected ? 0.18 : 0.95;
        // Outer dark depth boundary
        line(points,'#071317',isSelected ? 8.5 : 4.8);
        // Vibrant cable jacket
        line(points,link.color,isSelected ? 5.5 : 2.8);
        // Glossy highlight spine
        ctx.globalAlpha=selected&&!isSelected ? 0.1 : 0.55;
        line(points,'#ffffff',isSelected ? 1.4 : 0.75);
        ctx.globalAlpha=1;

        if(motionEnabled()&&!link.fault&&(!selected||isSelected)){
          const t=(phase*0.25+(scene.links.indexOf(link)%9)/9)%1;
          const pulse=Array.from({length:5},(_,i)=>curve(link,Math.max(0,t-i*0.008)));
          ctx.globalAlpha=isSelected?0.95:0.75;
          line(pulse,'#f0fffa',isSelected?3.2:1.8);
          ctx.globalAlpha=1;
        }

        if(isSelected){
          for(const [point,label] of [[link.a,scene.points.find(x=>x.id===link.fromId)?.number],[link.b,scene.points.find(x=>x.id===link.toId)?.number]]){
            const q=project(point);
            ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.fillStyle='#f8dc74';ctx.fill();
            ctx.strokeStyle='#142e34';ctx.lineWidth=1.5;ctx.stroke();
            ctx.font='bold 11px Segoe UI,sans-serif';ctx.fillStyle='#142e34';ctx.textAlign='center';
            ctx.fillText(String(label),q.x,q.y+4);
            ctx.textAlign='start';
          }
        }
      }

      if(!scene.links.length){
        ctx.fillStyle='#bdd3cf';ctx.font='14px Segoe UI';ctx.fillText(tr('Գրանցված միացումներ դեռ չկան'),20,height-24);
      }
    }

    const pointers=new Map();
    canvas.onpointerdown=e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,mode:e.button===2||e.button===1||e.shiftKey?'pan':'rotate'};moved=false;canvas.setPointerCapture?.(e.pointerId);};
    canvas.onpointermove=e=>{
      if(!drag)return;
      const previous=pointers.get(e.pointerId)||drag;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size>1){
        const [a,b]=[...pointers.values()];
        const distance=Math.hypot(a.x-b.x,a.y-b.y);
        if(canvas._pinchDistance){zoomAt((a.x+b.x)/2,(a.y+b.y)/2,distance/canvas._pinchDistance);}
        canvas._pinchDistance=distance;moved=true;draw();return;
      }
      const dx=e.clientX-previous.x,dy=e.clientY-previous.y;
      if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
      if(drag.mode==='pan'){panX+=dx;panY+=dy;}
      else{yaw+=dx*.008;pitch=Math.max(-.95,Math.min(.95,pitch+dy*.006));}
      drag={...drag,x:e.clientX,y:e.clientY};draw();
    };
    canvas.onpointerup=e=>{
      pointers.delete(e.pointerId);canvas._pinchDistance=0;drag=null;
      if(moved)return;
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      let nearest=null,distance=14;
      for(const h of hit)for(const p of h.points){
        const d=Math.hypot(p.x-x,p.y-y);
        if(d<distance){distance=d;nearest=h.id;}
      }
      if(nearest){selected=nearest;draw();onSelect?.(nearest);}
    };
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
    const zoomAt=(clientX,clientY,factor)=>{
      const rect=canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top,cx=canvas.clientWidth/2,cy=canvas.clientHeight/2,old=zoom,next=Math.max(.45,Math.min(4,zoom*factor));
      if(next===old)return;
      panX=x-cx-(x-cx-panX)*next/old;panY=y-cy-(y-cy-panY)*next/old;zoom=next;
    };
    canvas.onwheel=e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));draw();};
    canvas.oncontextmenu=e=>e.preventDefault();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;observer?.observe(canvas);draw();
    const visibility=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{inView=entries.some(entry=>entry.isIntersecting);syncAnimation();}):null;visibility?.observe(canvas);
    doc?.addEventListener?.('visibilitychange',syncAnimation);motion?.addEventListener?.('change',syncAnimation);syncAnimation();

    return {
      toggleAnimation(){animation=!motionEnabled();syncAnimation();return motionEnabled();},
      select(id){selected=id;draw();},
      rotate(delta){yaw+=delta;draw();},
      tilt(delta){pitch=Math.max(-.95,Math.min(.95,pitch+delta));draw();},
      zoom(factor){zoomAt(canvas.clientWidth/2,canvas.clientHeight/2,factor);draw();},
      front(){yaw=0;pitch=0;panX=0;panY=0;zoom=1;draw();},
      reset(){yaw=-.35;pitch=.10;zoom=1;panX=0;panY=0;selected='';draw();},
      destroy(){disposed=true;stopAnimation();observer?.disconnect();visibility?.disconnect();doc?.removeEventListener?.('visibilitychange',syncAnimation);motion?.removeEventListener?.('change',syncAnimation);canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onwheel=canvas.oncontextmenu=canvas.onkeydown=null;pointers.clear();}
    };
  }

  return {buildScene,curve,mount};
});
