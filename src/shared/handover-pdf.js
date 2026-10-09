(function(root,factory){if(typeof module==='object')module.exports=factory(require('./domain'),require('./map-label-layout'));else root.RackHandover=factory(root.RackDomain,root.RackMapLabels);})(globalThis,function(D,Labels){
  'use strict';
  function select(state,{planId='',floorId='',rackId='',deviceType='all',deviceId=''}={}){
    const all=D.ports(state),byPort=new Map(all.map(x=>[x.p.id,x]));
    const matches=x=>x&&(!rackId||x.r.id===rackId)&&(deviceType==='all'||x.d.type===deviceType)&&(!deviceId||x.d.id===deviceId);
    const ends=m=>[m.row,byPort.get(m.row.p.switchPortId)].filter(Boolean);
    const plans=(state.floorPlans||[]).filter(p=>(!planId||p.id===planId)&&(!floorId||p.floorId===floorId)).map(plan=>({...plan,selectedMarkers:D.mapDevices(state,plan).markers.filter(m=>ends(m).some(matches))})).filter(plan=>planId||(!rackId&&!deviceId&&deviceType==='all')||plan.selectedMarkers.length);
    // A selected area includes only equipment represented by its placed endpoints.
    const areaDevices=new Set(plans.flatMap(p=>p.selectedMarkers.flatMap(m=>ends(m).map(x=>x.d.id))));
    const devices=D.devices(state).filter(x=>matches(x)&&(planId?areaDevices.has(x.d.id):!floorId||x.f.id===floorId));
    return {plans,devices};
  }
  // Shared by the browser exporter and local PDF previews. No credentials are exported.
  async function create(PDFDocument,state,{font,tr=x=>x,kind='maps',planId='',floorId='',rackId='',deviceType=kind==='panels'?'panel':'all',deviceId='',date=new Date(),imageOpacity=0}={}){
    const selection=select(state,{planId,floorId,rackId,deviceType,deviceId});
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),Author:'My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font);pdf.font('Project');
    const ink='#173e43',muted='#597176',accent='#127d75',W=778,bottom=548,byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
    let pageNumber=0;
    const typeName=d=>tr({panel:'Փաչ պանել',switch:'Սվիչ',router:'Ռաուտեր'}[d.type]||state.deviceTypes?.find(t=>t.id===d.type)?.name||d.type);
    function text(value,x,y,width,size=10,color=ink,height=30,align='left'){pdf.font('Project').fontSize(size).fillColor(color).text(String(value??''),x,y,{width,height,ellipsis:true,lineGap:2,align});}
    function serviceSymbol(service,x,y,size,color){pdf.save().translate(x,y).scale(size/24).path(D.serviceIcon(service,state)).lineWidth(2).strokeColor(color).stroke().restore();}
    function page(title,subtitle){
      pdf.addPage();pageNumber++;
      pdf.rect(0,0,pdf.page.width,7).fill(accent);
      text(state.company||'My Patch',32,24,650,20,ink,32);
      text(title,32,61,W,13,accent,22);text(subtitle||'',32,84,W,9,muted,20);
      pdf.moveTo(32,109).lineTo(810,109).strokeColor('#d8e4e2').stroke();
    }
    function table(title,subtitle,items){
      page(title,subtitle);let y=121;
      const cols=[{key:'number',name:'#',w:28},{key:'service',name:tr('Սարքի նշանակություն'),w:114},{key:'port',name:tr('Սարք / պորտ'),w:166},{key:'location',name:tr('Նպատակակետ'),w:112},{key:'cable',name:tr('Մալուխ'),w:80},{key:'connection',name:tr('Կապ'),w:198},{key:'status',name:tr('Վիճակ'),w:80}];
      function head(){let x=32;pdf.rect(x,y,W,28).fill('#e9f2ef');for(const c of cols){text(c.name,x+6,y+7,c.w-12,8,ink,18);x+=c.w;}y+=28;}
      head();
      for(const item of items){
        const row=byId.get(item.portId);if(!row)continue;
        const service=D.serviceLabel(state,row.service,tr),name=D.endpointLabel(state,row,tr);
        const peer=byId.get(row.p.switchPortId);
        const values={number:item.number,service:name===service?service:name+'\n'+service,port:row.device+' / '+row.port+'\n'+typeName(row.d)+' · '+(row.d.model||tr('Չնշված'))+'\n'+row.floor+' / '+row.rack,location:[row.destination,row.room,row.door,row.side].filter(Boolean).join(' / ')||'—',cable:row.cable||'—',connection:(row.connection||'—')+(peer?'\n'+typeName(peer.d)+' · '+(peer.d.model||tr('Չնշված')):'')+(row.vlan?'\nVLAN '+row.vlan:''),status:D.statusLabel(state,row.status,tr)};
        let size=9;const height=()=>Math.max(42,...cols.map(c=>pdf.font('Project').fontSize(size).heightOfString(String(values[c.key]),{width:c.w-12,lineGap:2})+16));
        while(height()>370&&size>6)size-=.5;const h=Math.min(390,height());
        if(y+h>bottom){page(title,subtitle);y=121;head();}
        if(Number(item.number)%2===0)pdf.rect(32,y,W,h).fill('#f6f9f8');
        let x=32;for(const c of cols){text(values[c.key],x+6,y+8,c.w-12,size,ink,h-12);x+=c.w;}
        y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#dce7e4').stroke();
      }
      if(!items.length)text(tr('Պորտեր դեռ տեղադրված չեն'),40,y+16,W-16,11,muted);
    }
    const scopeFloor=floorId||(planId?selection.plans.find(p=>p.id===planId)?.floorId:'');
    const scope=[scopeFloor?state.floors.find(f=>f.id===scopeFloor)?.name:tr('Բոլոր հարկերը'),planId?selection.plans.find(p=>p.id===planId)?.name:'',rackId?state.floors.flatMap(f=>f.racks).find(r=>r.id===rackId)?.name:'',deviceType==='all'?'':typeName({type:deviceType}),deviceId?selection.devices.find(x=>x.d.id===deviceId)?.d.name:''].filter(Boolean).join(' / ');
    const mapEquipment=new Map();for(const plan of selection.plans)for(const marker of plan.selectedMarkers){for(const row of [marker.row,byId.get(marker.row.p.switchPortId)].filter(Boolean))mapEquipment.set(row.d.id,row);}
    const equipment=kind==='maps'?[...mapEquipment.values()].filter(x=>(!rackId||x.r.id===rackId)&&(deviceType==='all'||x.d.type===deviceType)&&(!deviceId||x.d.id===deviceId)):selection.devices;
    page(tr('Նախագծի PDF հաշվետվություն'),scope);
    text(tr('Բովանդակություն'),32,137,W,16,accent,30);
    const details=[tr(kind==='maps'?'Քարտեզ':kind==='all'?'Քարտեզ և սարքերի սխեմաներ':'Սարքերի սխեմաներ'),tr('Ամսաթիվ')+': '+date.toISOString().slice(0,10),tr('Հատակագծեր')+': '+(kind==='maps'||kind==='all'?selection.plans.length:0),tr('Սարքեր')+': '+equipment.length];
    details.forEach((value,i)=>text(value,32,187+i*40,W,13,ink,34));
    function equipmentTable(){
      page(tr('Սարքերի ամփոփում'),scope);let y=121;
      const cols=[['Անվանում',140],['Սարքի տեսակ',100],['Սարքի մոդել',140],['Հարկ',95],['Ռաք',95],['Սարքի IP',140],['Պորտեր',68]];
      const head=()=>{pdf.rect(32,y,W,29).fill('#e9f2ef');let x=32;for(const [name,width] of cols){text(tr(name),x+6,y+7,width-12,8,ink,20);x+=width;}y+=29;};head();
      for(const {f,r,d} of equipment){const values=[d.name,typeName(d),d.model||tr('Չնշված'),f.name,r.name,D.hostsForDevice(state,d.id).map(x=>x.h.ip).filter(Boolean).join('\n')||'—',d.portList.length];const h=Math.min(380,Math.max(40,...values.map((value,i)=>pdf.font('Project').fontSize(8).heightOfString(String(value),{width:cols[i][1]-12,lineGap:2})+16)));if(y+h>bottom){page(tr('Սարքերի ամփոփում'),scope);y=121;head();}let x=32;for(let i=0;i<values.length;i++){text(values[i],x+6,y+8,cols[i][1]-12,8,ink,h-12);x+=cols[i][1];}y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#d8e4e2').stroke();}
      if(!equipment.length)text(tr('Տվյալներ չկան'),32,y+16,W,11,muted);
    }
    if(kind==='maps'||kind==='all'){
      const plans=selection.plans;
      for(const plan of plans){
        const floor=state.floors.find(f=>f.id===plan.floorId)?.name||'';
        page(tr('Քարտեզ')+' · '+plan.name,floor);
        const scale=Math.min((W-24)/plan.width,410/plan.height),w=plan.width*scale,h=plan.height*scale,x=32+(W-w)/2,y=121+(410-h)/2;
        pdf.image(plan.image,x,y,{width:w,height:h});
        if(imageOpacity>0)pdf.save().fillOpacity(Math.min(90,imageOpacity)/100).rect(x,y,w,h).fill('#ffffff').restore();
        const markers=plan.selectedMarkers;
        for(const m of markers){
          if(!m.anchorVisible)continue;
          const p=D.mapMarkerLayout(m),color=m.row.status==='fault'?'#d35352':D.serviceColor(state,m.row.service);
          const ax=x+p.x*w,ay=y+p.y*h,ix=x+p.iconX*w,iy=y+p.iconY*h;
          if(Math.hypot(ax-ix,ay-iy)>3){
            pdf.moveTo(ax,ay).lineTo(ix,iy).lineWidth(1).strokeColor(color).stroke();
            pdf.circle(ax,ay,2.5).fillAndStroke(color,'#ffffff');
          }
        }
        const markerLabels=markers.map(m=>{
          const p=D.mapMarkerLayout(m),px=x+p.iconX*w,py=y+p.iconY*h,color=m.row.status==='fault'?'#d35352':D.serviceColor(state,m.row.service);
          pdf.circle(px,py,8).fillAndStroke('#ffffff',color);serviceSymbol(m.row.service,px-5,py-5,10,ink);pdf.roundedRect(px+3,py-9,12,8,2).fill(ink);text(m.number,px+3,py-8.5,12,6,'#ffffff',8,'center');
          const name=D.endpointLabel(state,m.row,tr),size=7;
          const textW=pdf.font('Project').fontSize(size).widthOfString(name);
          const width=Math.min(104,Math.max(22,Math.ceil(textW+8)));
          const height=Math.max(13,Math.ceil(pdf.font('Project').fontSize(size).heightOfString(name,{width:width-6,lineGap:2}))+5);
          return {m,px,py,color,name,size,width,height};
        });
        const obstacles=markerLabels.flatMap(({px,py})=>[{x:px-9,y:py-9,width:18,height:18},{x:px+2,y:py-10,width:14,height:10}]);
        const boxes=Labels.layout(markerLabels.map(item=>({id:item.m.id,x:item.px,y:item.py,width:item.width,height:item.height,radius:10})),{x:33,y:122,width:776,height:408},obstacles,2);
        for(const item of markerLabels){
          const box=boxes.get(item.m.id);if(!box)continue; // Full names remain in the numbered device table.
          const end=Labels.connector({x:item.px,y:item.py},box),length=Math.hypot(end.x-item.px,end.y-item.py);
          if(length>12){const ratio=9/length;pdf.moveTo(item.px+(end.x-item.px)*ratio,item.py+(end.y-item.py)*ratio).lineTo(end.x,end.y).lineWidth(.5).strokeColor('#647a83').stroke();}
        }
        // Draw label backgrounds last so connectors cannot cross the text.
        for(const item of markerLabels){
          const box=boxes.get(item.m.id);if(!box)continue;
          pdf.roundedRect(box.x,box.y,box.width,box.height,2).fill(ink);
          text(item.name,box.x+3,box.y+2,box.width-6,item.size,'#ffffff',box.height-3,'center');
        }
        const groups=new Map();for(const marker of markers){const key=marker.row.service;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(marker);}
        page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);let index=0;
        for(const [service,items] of groups){const count=items.filter(m=>m.row.status!=='free').length;if(!count)continue;if(index&&index%18===0)page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);const at=index%18,gx=32+(at%3)*259,gy=126+Math.floor(at/3)*66;pdf.roundedRect(gx,gy,247,56,5).fill('#edf4f1');serviceSymbol(service,gx+10,gy+14,25,D.serviceColor(state,service));text(D.serviceLabel(state,service,tr),gx+46,gy+10,160,10,ink,30);text(count,gx+211,gy+17,28,14,ink,22,'center');index++;}
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),32,140,W,12,muted);
        const inactive=markers.filter(m=>m.row.status==='free').length;if(inactive)text(tr('Նախկին նշումներ')+': '+inactive,32,532,W,9,muted,16);
        table(tr('Քարտեզի սարքերի ցանկ'),plan.name+' · '+floor,[...groups.values()].flat().map(m=>({portId:m.portId,number:m.number})));
      }
    }
    equipmentTable();
    if(kind!=='maps'){
      for(const {f,r,d} of selection.devices){
        const title=tr(d.type==='panel'?'Փաչ պանելի սխեմա':d.type==='switch'?'Սվիչի սխեմա':d.type==='router'?'Ռաուտերի սխեմա':'Սարքի սխեմա');
        const layout=D.portLayout(d),totalRows=Math.max(1,...layout.map(p=>p.row+1));
        for(let startRow=0;startRow<totalRows;startRow+=4){
        page(title+' · '+d.name,f.name+' / '+r.name+' · '+typeName(d)+' · '+(d.model||tr('Չնշված'))+' · U'+d.pos+' · '+d.portList.length+' '+tr('պորտ'));
        const columns=D.isNetworkDevice(d)?layout[0]?.columns||1:Math.min(24,d.portList.length),cell=Math.min(38,(W-32)/columns),faceHeight=65+Math.min(4,totalRows-startRow)*53;
        pdf.roundedRect(32,130,W,faceHeight,10).fill('#20383e');
        text(d.name,48,145,W-32,14,'#ffffff',24);
        layout.filter(p=>p.row>=startRow&&p.row<startRow+4).forEach(({p,column,row:portRow,optical})=>{const row=byId.get(p.id),x=48+column*cell,y=183+(portRow-startRow)*53;
          const color=row.status==='fault'?'#d35352':D.serviceColor(state,row.service),rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
          pdf.roundedRect(x+1,y,cell-3,32,3).fill(color);
          text(p.number,x+1,y+8,cell-3,9,rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?ink:'#ffffff',20,'center');
          pdf.rect(x+3,y+35,cell-7,3).fill(D.statusColor(state,row.status));
          if(optical)text('SFP',x+1,y-11,cell-3,6,'#ffffff',11,'center');
        });
        const legendY=130+faceHeight+18;
        text(tr('Վիճակ'),32,legendY,120,10,muted);
        Object.keys(D.statuses).forEach((key,i)=>{const x=32+i*230;pdf.circle(x+5,legendY+31,4).fill(D.statusColor(state,key));text(D.statusLabel(state,key,tr),x+17,legendY+24,210,10,ink,24);});
        const services=[...new Set(d.portList.map(p=>byId.get(p.id)).filter(r=>r.status!=='fault').map(r=>r.service))];
        services.forEach((key,i)=>{const rowsPerPage=Math.max(1,Math.floor((bottom-(legendY+60))/27)),perPage=rowsPerPage*3;if(i&&i%perPage===0)page(title+' · '+d.name,tr('Նշանակություն'));const at=i%perPage,x=32+(at%3)*259,y=(i<perPage?legendY+60:126)+Math.floor(at/3)*27;pdf.roundedRect(x,y,10,10,2).fill(D.serviceColor(state,key));text(D.serviceLabel(state,key,tr),x+17,y-2,230,9,ink,24);});
        }
        table(tr('Պորտերի միացումներ'),d.name+' · '+f.name+' / '+r.name,d.portList.map(p=>({portId:p.id,number:p.number})));
      }
    }
    if(!pageNumber){page(tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),'');text(tr('Տվյալներ չկան'),32,140,W,13,muted);}
    for(let i=0;i<pageNumber;i++){pdf.switchToPage(i);pdf.moveTo(32,562).lineTo(810,562).strokeColor('#d8e4e2').stroke();text('My Patch · '+date.toISOString().slice(0,10),32,572,650,8,muted,15);text((i+1)+' / '+pageNumber,756,572,54,8,muted,15);}
    pdf.end();return done;
  }
  return {create,select};
});
