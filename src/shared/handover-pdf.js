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
    plans.sort((a,b)=>state.floors.findIndex(f=>f.id===a.floorId)-state.floors.findIndex(f=>f.id===b.floorId)||a.name.localeCompare(b.name,undefined,{numeric:true}));
    return {plans,devices};
  }
  // Shared by the browser exporter and local PDF previews. No credentials are exported.
  async function create(PDFDocument,state,{font,tr=x=>x,kind='maps',planId='',floorId='',rackId='',deviceType=kind==='panels'?'panel':'all',deviceId='',date=new Date(),imageOpacity=0,detailed=false,mapPageSize='auto'}={}){
    const selection=select(state,{planId,floorId,rackId,deviceType,deviceId});
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),Author:'My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font);pdf.font('Project');
    const ink='#173e43',muted='#597176',accent='#127d75',W=778,bottom=548,byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
    let pageNumber=0;
    const typeName=d=>tr({panel:'Փաչ պանել',switch:'Սվիչ',router:'Ռաուտեր'}[d.type]||state.deviceTypes?.find(t=>t.id===d.type)?.name||d.type);
    function text(value,x,y,width,size=10,color=ink,height=30,align='left'){pdf.font('Project').fontSize(size).fillColor(color).text(String(value??''),x,y,{width,height,ellipsis:true,lineGap:2,align});}
    function serviceSymbol(service,x,y,size,color){pdf.save().translate(x,y).scale(size/24).path(D.serviceIcon(service,state)).lineWidth(2).strokeColor(color).stroke().restore();}
    function page(title,subtitle,size='A4'){
      pdf.addPage({size,layout:'landscape'});pageNumber++;
      pdf.rect(0,0,pdf.page.width,7).fill(accent);
      text(state.company||'My Patch',32,24,pdf.page.width-280,20,ink,32);
      text(title,32,61,pdf.page.width-64,13,accent,22);text(subtitle||'',32,84,pdf.page.width-64,9,muted,20);
      pdf.moveTo(32,109).lineTo(pdf.page.width-32,109).lineWidth(.7).strokeColor('#d8e4e2').stroke();
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
    if(detailed){
    page(tr('Նախագծի PDF հաշվետվություն'),scope);
    text(tr('Բովանդակություն'),32,137,W,16,accent,30);
    const details=[tr(kind==='maps'?'Քարտեզ':kind==='all'?'Քարտեզ և սարքերի սխեմաներ':'Սարքերի սխեմաներ'),tr('Ամսաթիվ')+': '+date.toISOString().slice(0,10),tr('Հատակագծեր')+': '+(kind==='maps'||kind==='all'?selection.plans.length:0),tr('Սարքեր')+': '+equipment.length];
    details.forEach((value,i)=>text(value,32,187+i*40,W,13,ink,34));
    }
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
        const markers=plan.selectedMarkers,size=mapPageSize==='A3'||mapPageSize==='auto'&&markers.length>60?'A3':'A4';
        page(tr('Քարտեզ')+' · '+plan.name,tr('Հարկ')+' · '+floor,size);
        const mapW=pdf.page.width-64,mapH=pdf.page.height-211;
        text(markers.length+' '+tr('սարք')+' · '+size,pdf.page.width-212,30,180,10,muted,20,'right');
        pdf.roundedRect(32,121,mapW,mapH,6).fillAndStroke('#f7f9fa','#d8e4e2');
        const scale=Math.min((mapW-24)/plan.width,(mapH-24)/plan.height),w=plan.width*scale,h=plan.height*scale,x=32+(mapW-w)/2,y=121+(mapH-h)/2;
        pdf.image(plan.image,x,y,{width:w,height:h});
        if(imageOpacity>0)pdf.save().fillOpacity(Math.min(90,imageOpacity)/100).rect(x,y,w,h).fill('#ffffff').restore();
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
          pdf.circle(px,py,8).fillAndStroke('#ffffff',color);serviceSymbol(m.row.service,px-5,py-5,10,ink);
          const name=D.endpointLabel(state,m.row,tr),size=mapW>900?8:7;
          const textW=pdf.font('Project').fontSize(size).widthOfString(name);
          const width=Math.min(104,Math.max(22,Math.ceil(textW+8)));
          const height=Math.max(13,Math.ceil(pdf.font('Project').fontSize(size).heightOfString(name,{width:width-6,lineGap:2}))+5);
          return {m,px,py,color,name,size,width,height};
        });
        const obstacles=markerLabels.map(({px,py})=>({x:px-9,y:py-9,width:18,height:18}));
        const boxes=Labels.layout(markerLabels.map(item=>({id:item.m.id,x:item.px,y:item.py,width:item.width,height:item.height,radius:10})),{x:36,y:125,width:mapW-8,height:mapH-8},obstacles,2);
        for(const item of markerLabels){
          const box=boxes.get(item.m.id);if(!box)continue;
          const end=Labels.connector({x:item.px,y:item.py},box),length=Math.hypot(end.x-item.px,end.y-item.py);
          if(length>12){const ratio=9/length;pdf.moveTo(item.px+(end.x-item.px)*ratio,item.py+(end.y-item.py)*ratio).lineTo(end.x,end.y).lineWidth(.5).strokeColor('#647a83').stroke();}
        }
        // Draw label backgrounds last so connectors cannot cross the text.
        for(const item of markerLabels){
          const box=boxes.get(item.m.id);if(!box)continue;
          pdf.roundedRect(box.x,box.y,box.width,box.height,2).fill(ink);
          text(item.name,box.x+3,box.y+2,box.width-6,item.size,'#ffffff',box.height-3,'center');
        }
        const legendGroups=new Map();for(const m of markers)legendGroups.set(m.row.service,(legendGroups.get(m.row.service)||0)+1);
        const entries=[...legendGroups];
        const legend=entries.length>8?[...entries.slice(0,7),[null,entries.slice(7).reduce((sum,x)=>sum+x[1],0)]]:entries;
        legend.forEach(([service,count],i)=>{const lx=36+(i%4)*(mapW/4),ly=pdf.page.height-79+Math.floor(i/4)*18;if(service!==null)serviceSymbol(service,lx,ly,12,D.serviceColor(state,service));text((service===null?tr('Այլ'):D.serviceLabel(state,service,tr))+' · '+count,lx+18,ly+1,mapW/4-26,8,muted,16);});
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),36,pdf.page.height-78,mapW-8,9,muted,18);
        if(!detailed)continue;
        const groups=new Map();for(const marker of markers){const key=marker.row.service;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(marker);}
        page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);let index=0;
        for(const [service,items] of groups){const count=items.filter(m=>m.row.status!=='free').length;if(!count)continue;if(index&&index%18===0)page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);const at=index%18,gx=32+(at%3)*259,gy=126+Math.floor(at/3)*66;pdf.roundedRect(gx,gy,247,56,5).fill('#edf4f1');serviceSymbol(service,gx+10,gy+14,25,D.serviceColor(state,service));text(D.serviceLabel(state,service,tr),gx+46,gy+10,160,10,ink,30);text(count,gx+211,gy+17,28,14,ink,22,'center');index++;}
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),32,140,W,12,muted);
        const inactive=markers.filter(m=>m.row.status==='free').length;if(inactive)text(tr('Նախկին նշումներ')+': '+inactive,32,532,W,9,muted,16);
        table(tr('Քարտեզի սարքերի ցանկ'),plan.name+' · '+floor,[...groups.values()].flat().map(m=>({portId:m.portId,number:m.number})));
      }
    }
    if(detailed)equipmentTable();
    if(kind!=='maps'){
      let y=bottom,currentRack='';
      const devices=[...selection.devices].sort((a,b)=>state.floors.indexOf(a.f)-state.floors.indexOf(b.f)||a.f.racks.indexOf(a.r)-b.f.racks.indexOf(b.r)||b.d.pos-a.d.pos);
      for(const {f,r,d} of devices){
        const original=D.portLayout(d),bankRows=Math.max(1,...original.map(p=>p.row+1));
        // Allow two extra columns for uplinks without giving them a mostly empty bank.
        const layout=D.isNetworkDevice(d)?original.map(p=>({...p,column:p.column%14,row:Math.floor(p.column/14)*bankRows+p.row})):original.map((p,i)=>({...p,column:i%12,row:Math.floor(i/12)}));
        const totalRows=Math.max(1,...layout.map(p=>p.row+1)),columns=Math.max(1,...layout.map(p=>p.column+1)),cell=(W-24)/Math.max(12,columns);
        const title=tr(d.type==='panel'?'Փաչ պանելի սխեմա':d.type==='switch'?'Սվիչի սխեմա':d.type==='router'?'Ռաուտերի սխեմա':'Սարքի սխեմա');
        for(let first=0;first<totalRows;first+=6){
          const rows=Math.min(6,totalRows-first),height=52+rows*51;
          if(currentRack!==r.id||y+height>bottom){page(tr('Սարքերի սխեմաներ'),f.name+' / '+r.name);currentRack=r.id;y=121;}
          // Rack ears, recessed face and socket contacts distinguish equipment from a table.
          pdf.roundedRect(32,y,W,height,7).fill('#dfe7e9');
          pdf.roundedRect(42,y+4,W-20,40,4).fill(ink);
          for(const sx of [36,806])for(const sy of [y+12,y+height-12]){pdf.circle(sx,sy,2).fill('#61777e');pdf.moveTo(sx-1,sy).lineTo(sx+1,sy).lineWidth(.5).strokeColor('#c9d7da').stroke();}
          text(title+' · '+d.name,49,y+9,W-122,11,'#ffffff',18);
          text('U'+d.pos+(d.height>1?'–'+(d.pos+d.height-1):''),735,y+9,58,9,'#c9dadd',18,'right');
          const ip=D.hostsForDevice(state,d.id).map(x=>x.h.ip).filter(Boolean).join(' · ');
          const ports=(d.portList.length-(d.sfpCount||0))+' '+tr('պորտ')+(d.sfpCount?' + '+d.sfpCount+' SFP':'');
          const power=d.type==='switch'?(d.modelType==='poe-plus'?'PoE+':d.modelType==='poe'?'PoE':tr('Առանց PoE')):'';
          text([typeName(d),d.model,ports,power,ip].filter(Boolean).join(' · '),49,y+28,W-34,7,'#dbe7e9',16);
          if(columns<10){const vx=44+columns*cell+(W-24-columns*cell-80)/2,vy=y+(height+44)/2;for(let slit=0;slit<10;slit++)pdf.moveTo(vx+slit*8,vy-16).lineTo(vx+slit*8,vy+16).lineWidth(2).strokeColor('#a9bcc1').stroke();}
          for(const {p,column,row:portRow,optical} of layout.filter(p=>p.row>=first&&p.row<first+rows)){
            const row=byId.get(p.id),peer=byId.get(p.switchPortId),px=44+column*cell,py=y+49+(portRow-first)*51;
            const name=row.cable||row.endpointName||row.room||peer?.cable||peer?.endpointName||'—';
            pdf.roundedRect(px+2,py,cell-5,32,3).fillAndStroke('#10262c','#71898e');
            if(!optical){for(let pin=0;pin<8;pin++)pdf.rect(px+cell/2-9+pin*2.5,py+2,1.2,3).fill('#c9ac70');}
            else pdf.rect(px+cell/2-8,py+2,16,3).fill('#8eabb4');
            pdf.circle(px+cell-8,py+7,1.6).fill(D.statusColor(state,row.status));
            let size=8;while(size>6&&pdf.fontSize(size).heightOfString(name,{width:cell-15,lineGap:2})>23)size-=.5;
            text(name,px+7,py+8,cell-15,size,'#ffffff',23,'center');
            text(String(p.number)+(optical?' · SFP':''),px+2,py+34,cell-5,7,muted,14,'center');
          }
          y+=height+12;
        }
      }
    }
    if(kind!=='maps'&&detailed){
      const devices=[...selection.devices].sort((a,b)=>state.floors.indexOf(a.f)-state.floors.indexOf(b.f)||a.f.racks.indexOf(a.r)-b.f.racks.indexOf(b.r)||b.d.pos-a.d.pos);
      for(const {f,r,d} of devices)table(tr('Պորտերի միացումներ'),d.name+' · '+f.name+' / '+r.name,d.portList.map(p=>({portId:p.id,number:p.number})));
    }
    if(!pageNumber){page(tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),'');text(tr('Տվյալներ չկան'),32,140,W,13,muted);}
    // Footer text is below the content margin. Prevent PDFKit from adding overflow pages.
    for(let i=0;i<pageNumber;i++){pdf.switchToPage(i);pdf.page.margins.bottom=0;const right=pdf.page.width-32,foot=pdf.page.height-33;pdf.moveTo(32,foot).lineTo(right,foot).lineWidth(.7).strokeColor('#d8e4e2').stroke();text('My Patch · '+date.toISOString().slice(0,10),32,foot+10,650,8,muted,15);text((i+1)+' / '+pageNumber,right-54,foot+10,54,8,muted,15);}
    pdf.end();return done;
  }
  return {create,select};
});
