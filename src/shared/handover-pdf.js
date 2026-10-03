(function(root,factory){if(typeof module==='object')module.exports=factory(require('./domain'));else root.RackHandover=factory(root.RackDomain);})(globalThis,function(D){
  'use strict';
  function select(state,{planId='',floorId='',deviceType='all',deviceId=''}={}){
    const all=D.ports(state),byPort=new Map(all.map(x=>[x.p.id,x]));
    const matches=d=>(deviceType==='all'||d.type===deviceType)&&(!deviceId||d.id===deviceId);
    const plans=(state.floorPlans||[]).filter(p=>(!planId||p.id===planId)&&(!floorId||p.floorId===floorId)).map(plan=>({...plan,selectedMarkers:D.mapDevices(state,plan).markers.filter(m=>matches(m.row.d)||(byPort.get(m.row.p.switchPortId)&&matches(byPort.get(m.row.p.switchPortId).d)))}));
    const devices=D.devices(state).filter(x=>(!floorId||x.f.id===floorId)&&matches(x.d));
    return {plans,devices};
  }
  // Shared by the browser exporter and local PDF previews. No credentials are exported.
  async function create(PDFDocument,state,{font,tr=x=>x,kind='maps',planId='',floorId='',deviceType=kind==='panels'?'panel':'all',deviceId='',date=new Date()}={}){
    const selection=select(state,{planId,floorId,deviceType,deviceId});
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),Author:'My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font);pdf.font('Project');
    const ink='#173e43',muted='#597176',accent='#127d75',W=778,bottom=548,byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
    let pageNumber=0;
    function text(value,x,y,width,size=10,color=ink,height=30,align='left'){pdf.font('Project').fontSize(size).fillColor(color).text(String(value??''),x,y,{width,height,ellipsis:true,lineGap:2,align});}
    function serviceSymbol(service,x,y,size,color){pdf.save().translate(x,y).scale(size/24).path(D.serviceIcon(service)).lineWidth(2).strokeColor(color).stroke().restore();}
    function page(title,subtitle){
      pdf.addPage();pageNumber++;
      pdf.rect(0,0,pdf.page.width,7).fill(accent);
      text(state.company||'My Patch',32,24,650,20,ink,32);
      text(title,32,61,W,13,accent,22);text(subtitle||'',32,84,W,9,muted,20);
      pdf.moveTo(32,109).lineTo(810,109).strokeColor('#d8e4e2').stroke();
    }
    function table(title,subtitle,items){
      page(title,subtitle);let y=121;
      const cols=[{key:'number',name:'#',w:32},{key:'service',name:tr('Սարքի նշանակություն'),w:120},{key:'port',name:tr('Սարք / պորտ'),w:160},{key:'location',name:tr('Նպատակակետ'),w:130},{key:'cable',name:tr('Մալուխ'),w:90},{key:'connection',name:tr('Կապ'),w:166},{key:'status',name:tr('Վիճակ'),w:80}];
      function head(){let x=32;pdf.rect(x,y,W,28).fill('#e9f2ef');for(const c of cols){text(c.name,x+6,y+7,c.w-12,8,ink,18);x+=c.w;}y+=28;}
      head();
      for(const item of items){
        const row=byId.get(item.portId);if(!row)continue;
        const values={number:item.number,service:D.serviceLabel(state,row.service,tr),port:row.device+' / '+row.port+'\n'+row.floor+' / '+row.rack,location:[row.destination,row.room,row.door,row.side].filter(Boolean).join(' / ')||'—',cable:row.cable||'—',connection:(row.connection||'—')+(row.vlan?'\nVLAN '+row.vlan:''),status:D.statusLabel(state,row.status,tr)};
        let size=9;const height=()=>Math.max(42,...cols.map(c=>pdf.font('Project').fontSize(size).heightOfString(String(values[c.key]),{width:c.w-12,lineGap:2})+16));
        while(height()>370&&size>6)size-=.5;const h=height();
        if(y+h>bottom){page(title,subtitle);y=121;head();}
        if(Number(item.number)%2===0)pdf.rect(32,y,W,h).fill('#f6f9f8');
        let x=32;for(const c of cols){text(values[c.key],x+6,y+8,c.w-12,size,ink,h-12);x+=c.w;}
        y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#dce7e4').stroke();
      }
      if(!items.length)text(tr('Պորտեր դեռ տեղադրված չեն'),40,y+16,W-16,11,muted);
    }
    if(kind==='maps'||kind==='all'){
      const plans=selection.plans;
      for(const plan of plans){
        const floor=state.floors.find(f=>f.id===plan.floorId)?.name||'';
        page(tr('Քարտեզ')+' · '+plan.name,floor);
        const scale=Math.min((W-24)/plan.width,410/plan.height),w=plan.width*scale,h=plan.height*scale,x=32+(W-w)/2,y=121+(410-h)/2;
        pdf.image(plan.image,x,y,{width:w,height:h});
        const markers=plan.selectedMarkers;
        for(const m of markers){const px=x+m.x*w,py=y+m.y*h,color=D.serviceColor(state,m.row.service);pdf.circle(px,py,12).fillAndStroke('#ffffff',color);serviceSymbol(m.row.service,px-8,py-8,16,ink);pdf.roundedRect(px+7,py+6,18,12,3).fill(ink);text(m.number,px+7,py+6,18,7,'#ffffff',12,'center');}
        const groups=new Map();for(const marker of markers){const key=marker.row.service;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(marker);}
        page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);let index=0;
        for(const [service,items] of groups){const count=items.filter(m=>m.row.status!=='free').length;if(!count)continue;if(index&&index%18===0)page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);const at=index%18,gx=32+(at%3)*259,gy=126+Math.floor(at/3)*66;pdf.roundedRect(gx,gy,247,56,5).fill('#edf4f1');serviceSymbol(service,gx+10,gy+14,25,D.serviceColor(state,service));text(D.serviceLabel(state,service,tr),gx+46,gy+10,160,10,ink,30);text(count,gx+211,gy+17,28,14,ink,22,'center');index++;}
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),32,140,W,12,muted);
        const inactive=markers.filter(m=>m.row.status==='free').length;if(inactive)text(tr('Նախկին նշումներ')+': '+inactive,32,532,W,9,muted,16);
        table(tr('Քարտեզի սարքերի ցանկ'),plan.name+' · '+floor,[...groups.values()].flat().map(m=>({portId:m.portId,number:m.number})));
      }
    }
    if(kind!=='maps'){
      for(const {f,r,d} of selection.devices){
        const title=tr(d.type==='panel'?'Փաչ պանելի սխեմա':d.type==='switch'?'Սվիչի սխեմա':d.type==='router'?'Ռաուտերի սխեմա':'Սարքի սխեմա');
        page(title+' · '+d.name,f.name+' / '+r.name+' · U'+d.pos+' · '+d.portList.length+' '+tr('պորտ'));
        const layout=D.portLayout(d),columns=d.type==='panel'?Math.min(24,d.portList.length):layout[0]?.columns||1,cell=Math.min(38,(W-32)/columns),faceHeight=65+(layout[0]?.rows||1)*53;
        pdf.roundedRect(32,130,W,faceHeight,10).fill('#20383e');
        text(d.name,48,145,W-32,14,'#ffffff',24);
        layout.forEach(({p,column,row:portRow,optical})=>{const row=byId.get(p.id),x=48+column*cell,y=183+portRow*53;
          const color=D.serviceColor(state,row.service),rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
          pdf.roundedRect(x+1,y,cell-3,32,3).fill(color);
          text(p.number,x+1,y+8,cell-3,9,rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?ink:'#ffffff',20,'center');
          pdf.rect(x+3,y+35,cell-7,3).fill(D.statusColor(state,row.status));
          if(optical)text('SFP',x+1,y-11,cell-3,6,'#ffffff',11,'center');
        });
        const legendY=130+faceHeight+18;
        text(tr('Վիճակ'),32,legendY,120,10,muted);
        Object.keys(D.statuses).forEach((key,i)=>{const x=32+i*230;pdf.circle(x+5,legendY+31,4).fill(D.statusColor(state,key));text(D.statusLabel(state,key,tr),x+17,legendY+24,210,10,ink,24);});
        const services=[...new Set(d.portList.map(p=>byId.get(p.id).service))];
        services.forEach((key,i)=>{const rowsPerPage=Math.max(1,Math.floor((bottom-(legendY+60))/27)),perPage=rowsPerPage*3;if(i&&i%perPage===0)page(title+' · '+d.name,tr('Նշանակություն'));const at=i%perPage,x=32+(at%3)*259,y=(i<perPage?legendY+60:126)+Math.floor(at/3)*27;pdf.roundedRect(x,y,10,10,2).fill(D.serviceColor(state,key));text(D.serviceLabel(state,key,tr),x+17,y-2,230,9,ink,24);});
        table(tr('Պորտերի միացումներ'),d.name+' · '+f.name+' / '+r.name,d.portList.map(p=>({portId:p.id,number:p.number})));
      }
    }
    if(!pageNumber){page(tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),'');text(tr('Տվյալներ չկան'),32,140,W,13,muted);}
    for(let i=0;i<pageNumber;i++){pdf.switchToPage(i);pdf.moveTo(32,562).lineTo(810,562).strokeColor('#d8e4e2').stroke();text('My Patch · '+date.toISOString().slice(0,10),32,572,650,8,muted,15);text((i+1)+' / '+pageNumber,756,572,54,8,muted,15);}
    pdf.end();return done;
  }
  return {create,select};
});
