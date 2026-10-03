(function(root,factory){if(typeof module==='object')module.exports=factory(require('./domain'));else root.RackHandover=factory(root.RackDomain);})(globalThis,function(D){
  'use strict';
  // Shared by the browser exporter and local PDF previews. No credentials are exported.
  async function create(PDFDocument,state,{font,tr=x=>x,kind='maps',planId='',date=new Date()}={}){
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+tr(kind==='panels'?'Փաչ պանելի սխեմա':'Քարտեզ'),Author:'My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font);pdf.font('Project');
    const ink='#173e43',muted='#597176',accent='#127d75',W=778,bottom=548,byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
    let pageNumber=0;
    function text(value,x,y,width,size=10,color=ink,height=30,align='left'){pdf.font('Project').fontSize(size).fillColor(color).text(String(value??''),x,y,{width,height,ellipsis:true,lineGap:2,align});}
    function page(title,subtitle){
      pdf.addPage();pageNumber++;
      pdf.rect(0,0,pdf.page.width,7).fill(accent);
      text(state.company||'My Patch',32,24,650,20,ink,32);
      text(title,32,61,W,13,accent,22);text(subtitle||'',32,84,W,9,muted,20);
      pdf.moveTo(32,109).lineTo(810,109).strokeColor('#d8e4e2').stroke();
    }
    function table(title,subtitle,items){
      page(title,subtitle);let y=121;
      const cols=[{key:'number',name:'#',w:32},{key:'port',name:tr('Սարք / պորտ'),w:190},{key:'location',name:tr('Նպատակակետ'),w:155},{key:'cable',name:tr('Մալուխ'),w:110},{key:'connection',name:tr('Կապ'),w:191},{key:'status',name:tr('Վիճակ'),w:100}];
      function head(){let x=32;pdf.rect(x,y,W,28).fill('#e9f2ef');for(const c of cols){text(c.name,x+6,y+7,c.w-12,8,ink,18);x+=c.w;}y+=28;}
      head();
      for(const item of items){
        const row=byId.get(item.portId);if(!row)continue;
        const values={number:item.number,port:row.device+' / '+row.port+'\n'+row.floor+' / '+row.rack,location:[row.destination,row.room,row.door,row.side].filter(Boolean).join(' / ')||'—',cable:row.cable||'—',connection:(row.connection||'—')+(row.vlan?'\nVLAN '+row.vlan:''),status:D.statusLabel(state,row.status,tr)};
        let size=9;const height=()=>Math.max(42,...cols.map(c=>pdf.font('Project').fontSize(size).heightOfString(String(values[c.key]),{width:c.w-12,lineGap:2})+16));
        while(height()>370&&size>6)size-=.5;const h=height();
        if(y+h>bottom){page(title,subtitle);y=121;head();}
        if(Number(item.number)%2===0)pdf.rect(32,y,W,h).fill('#f6f9f8');
        let x=32;for(const c of cols){text(values[c.key],x+6,y+8,c.w-12,size,ink,h-12);x+=c.w;}
        y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#dce7e4').stroke();
      }
      if(!items.length)text(tr('Պորտեր դեռ տեղադրված չեն'),40,y+16,W-16,11,muted);
    }
    if(kind==='maps'){
      const plans=(state.floorPlans||[]).filter(p=>!planId||p.id===planId);
      for(const plan of plans){
        const floor=state.floors.find(f=>f.id===plan.floorId)?.name||'';
        page(tr('Քարտեզ')+' · '+plan.name,floor);
        const scale=Math.min((W-24)/plan.width,410/plan.height),w=plan.width*scale,h=plan.height*scale,x=32+(W-w)/2,y=121+(410-h)/2;
        pdf.image(plan.image,x,y,{width:w,height:h});
        plan.markers.forEach((m,i)=>{const px=x+m.x*w,py=y+m.y*h;pdf.circle(px,py,9).fillAndStroke(accent,'#ffffff');text(i+1,px-8,py-5.5,16,8,'#ffffff',14,'center');});
        table(tr('Քարտեզի պորտերի ցանկ'),plan.name+' · '+floor,plan.markers.map((m,i)=>({portId:m.portId,number:i+1})));
      }
    }else{
      for(const {f,r,d} of D.devices(state).filter(x=>x.d.type==='panel')){
        page(tr('Փաչ պանելի սխեմա')+' · '+d.name,f.name+' / '+r.name+' · U'+d.pos+' · '+d.portList.length+' '+tr('պորտ'));
        pdf.roundedRect(32,130,W,180,10).fill('#20383e');
        text(d.name,48,145,W-32,14,'#ffffff',24);
        const columns=Math.min(24,d.portList.length),cell=(W-32)/columns;
        d.portList.forEach((p,i)=>{const row=byId.get(p.id),x=48+(i%columns)*cell,y=183+Math.floor(i/columns)*53;
          const color=D.serviceColor(state,row.service),rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
          pdf.roundedRect(x+1,y,cell-3,32,3).fill(color);
          text(p.number,x+1,y+8,cell-3,9,rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>155?ink:'#ffffff',20,'center');
          pdf.rect(x+3,y+35,cell-7,3).fill(D.statusColor(state,row.status));
        });
        text(tr('Վիճակ'),32,328,120,10,muted);
        Object.keys(D.statuses).forEach((key,i)=>{const x=32+i*230;pdf.circle(x+5,359,4).fill(D.statusColor(state,key));text(D.statusLabel(state,key,tr),x+17,352,210,10,ink,24);});
        const services=[...new Set(d.portList.map(p=>byId.get(p.id).service))];
        services.slice(0,12).forEach((key,i)=>{const x=32+(i%3)*259,y=397+Math.floor(i/3)*27;pdf.roundedRect(x,y,10,10,2).fill(D.serviceColor(state,key));text(D.serviceLabel(state,key,tr),x+17,y-2,230,9,ink,24);});
        table(tr('Պորտերի միացումներ'),d.name+' · '+f.name+' / '+r.name,d.portList.map(p=>({portId:p.id,number:p.number})));
      }
    }
    if(!pageNumber){page(tr(kind==='maps'?'Քարտեզ':'Փաչ պանելի սխեմա'),'');text(tr('Տվյալներ չկան'),32,140,W,13,muted);}
    for(let i=0;i<pageNumber;i++){pdf.switchToPage(i);pdf.moveTo(32,562).lineTo(810,562).strokeColor('#d8e4e2').stroke();text('My Patch · '+date.toISOString().slice(0,10),32,572,650,8,muted,15);text((i+1)+' / '+pageNumber,756,572,54,8,muted,15);}
    pdf.end();return done;
  }
  return {create};
});
