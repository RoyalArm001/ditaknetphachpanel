(function (root, factory) {
  if (typeof module === 'object') module.exports = factory();
  else root.RackDomain = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const statuses = {free:'Ազատ', used:'Զբաղված', fault:'Անսարք'};
  const services = {
    '':{label:'Չնշված',color:'#64748b'},
    camera:{label:'Տեսախցիկ',color:'#a65d08'},
    wifi:{label:'Wi-Fi',color:'#2563b0'},
    access:{label:'Access control',color:'#7c3daf'},
    phone:{label:'Հեռախոս',color:'#b83878'},
    internet:{label:'Internet',color:'#08796b'}
  };
  const serviceColor = (s,key) => s.serviceColors?.[key] || services[key]?.color || services[''].color;
  const empty = () => ({schema:2, company:'', floors:[]});
  const devices = s => s.floors.flatMap(f => f.racks.flatMap(r => r.devices.map(d => ({f,r,d}))));
  const ports = s => devices(s).flatMap(x => x.d.portList.map(p => ({...x,p})));
  const port = (number, id) => ({id,number,status:'free',cable:'',floorId:'',room:'',door:'',side:'',notes:'',switchPortId:'',service:'',vlan:''});
  const assert = (v,m) => {if (!v) throw new Error(m);};
  function validate(s) {
    assert(s && s.schema===2 && typeof s.company==='string' && s.company.length<=200 && Array.isArray(s.floors), 'Տվյալների ձևաչափը սխալ է');
    if(s.serviceColors!==undefined){
      assert(s.serviceColors && typeof s.serviceColors==='object' && !Array.isArray(s.serviceColors),'Գույների ձևաչափը սխալ է');
      for(const [key,value] of Object.entries(s.serviceColors))assert(Object.hasOwn(services,key)&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value),'Գույնը պետք է լինի HEX ձևաչափով');
    }
    assert(s.floors.length<=200,'Առավելագույնը 200 հարկ');
    const ids=new Set();
    const id=x=>{assert(typeof x==='string' && /^[\w-]{1,80}$/.test(x) && !ids.has(x),'Կրկնվող կամ սխալ ID');ids.add(x);};
    const text=(x,max=200)=>assert(typeof x==='string' && x.length<=max,'Տեքստային դաշտը սխալ է կամ չափազանց երկար');
    const name=x=>{text(x);assert(x.trim(),'Անվանումը պարտադիր է');};
    const integer=(x,min,max)=>assert(Number.isInteger(x)&&x>=min&&x<=max,'Չափը կամ պորտի համարը սխալ է');
    const uniqueNames=xs=>assert(new Set(xs.map(x=>x.name.trim().toLowerCase())).size===xs.length,'Անվանումները պետք է տարբեր լինեն');
    uniqueNames(s.floors);
    for (const f of s.floors) {
      id(f.id); name(f.name); assert(Array.isArray(f.racks)&&f.racks.length<=100,'Ռաքերի ցանկը սխալ է');uniqueNames(f.racks);
      for(const r of f.racks) {
        id(r.id);name(r.name);integer(r.u,1,60);text(r.location);text(r.photo,3000000);
        assert(!r.photo || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo),'Լուսանկարի ձևաչափը սխալ է');
        assert(Array.isArray(r.devices)&&r.devices.length<=60,'Սարքերի ցանկը սխալ է');uniqueNames(r.devices);
        const used=new Set();
        for(const d of r.devices) {
          id(d.id);name(d.name);assert(['panel','switch'].includes(d.type),'Սարքի տեսակը սխալ է');text(d.model);text(d.color,7);assert(/^#[0-9a-f]{6}$/i.test(d.color),'Սարքի գույնը սխալ է');
          integer(d.pos,1,r.u);integer(d.height,1,r.u);assert(d.pos+d.height-1<=r.u,'Սարքը դուրս է գալիս ռաքի սահմաններից');
          for(let u=d.pos;u<d.pos+d.height;u++){assert(!used.has(u),`U${u} դիրքն արդեն զբաղված է`);used.add(u);}
          assert(Array.isArray(d.portList),'Պորտերի ցանկը սխալ է');integer(d.portList.length,1,96);
          if(d.type==='panel') assert([12,24,48].includes(d.portList.length),'Փաչ պանելը պետք է ունենա 12, 24 կամ 48 պորտ');
          d.portList.forEach((p,i)=>{
            id(p.id);assert(p.number===i+1,'Պորտերի համարակալումը սխալ է');assert(Object.hasOwn(statuses,p.status),'Պորտի վիճակը սխալ է');
            for(const k of ['cable','floorId','room','door','side','switchPortId'])text(p[k]);text(p.notes,2000);
            // Missing fields remain valid for existing databases and older backups.
            if(p.service!==undefined)assert(typeof p.service==='string'&&Object.hasOwn(services,p.service),'Պորտի նշանակությունը սխալ է');
            if(p.vlan!==undefined)assert(typeof p.vlan==='string'&&(p.vlan===''||(/^\d{1,4}$/.test(p.vlan)&&Number(p.vlan)>=1&&Number(p.vlan)<=4094)),'VLAN-ը պետք է լինի 1–4094 ամբողջ թիվ կամ դատարկ');
            assert(!p.floorId||s.floors.some(x=>x.id===p.floorId),'Մալուխի հարկը չի գտնվել');
            assert(p.status!=='free'||(!p.cable&&!p.switchPortId),'Մալուխով կամ կապով պորտը չի կարող ազատ լինել');
            assert(d.type==='panel'||!p.switchPortId,'Կապը լրացվում է փաչ պանելի պորտում');
          });
        }
      }
    }
    const all=ports(s), byId=new Map(all.map(x=>[x.p.id,x])), taken=new Set();
    for(const {d,p} of all) if(p.switchPortId){
      const to=byId.get(p.switchPortId);
      assert(d.type==='panel'&&to&&to.d.type==='switch','Սվիչի պորտը չի գտնվել');
      assert(!taken.has(p.switchPortId),'Սվիչի պորտն արդեն կապված է այլ փաչ պորտի հետ');taken.add(p.switchPortId);
    }
    return s;
  }
  function effectiveStatus(s,p){return p.status==='fault'?'fault':p.status==='used'||!!p.switchPortId||ports(s).some(x=>x.p.switchPortId===p.id)?'used':'free';}
  function rows(s,filter={}) {
    const all=ports(s), byId=new Map(all.map(x=>[x.p.id,x]));
    const incoming=new Map(all.filter(x=>x.p.switchPortId).map(x=>[x.p.switchPortId,x]));
    return all.map(x=>{
      const {f,r,d,p}=x, source=d.type==='switch'?incoming.get(p.id):x;
      const info=source?.p||p, peer=byId.get(p.switchPortId)||incoming.get(p.id);
      const status=p.status==='fault'?'fault':p.status==='used'||p.switchPortId||incoming.has(p.id)?'used':'free';
      return {floor:f.name,rack:r.name,device:d.name,type:d.type,port:p.number,status, cable:info.cable,
        destination:s.floors.find(f=>f.id===info.floorId)?.name||'', room:info.room,door:info.door,side:info.side,notes:info.notes,service:info.service||'',vlan:info.vlan||'',
        connection:peer?`${peer.r.name} / ${peer.d.name} / ${peer.p.number}`:'',...x};
    }).filter(x=>(!filter.floor||x.f.id===filter.floor||x.p.floorId===filter.floor||x.destination===s.floors.find(f=>f.id===filter.floor)?.name)&&(!filter.rack||x.r.id===filter.rack)&&(!filter.status||x.status===filter.status)&&(!filter.query||[x.floor,x.rack,x.device,x.port,x.cable,x.destination,x.room,x.door,x.side,x.notes,x.connection,x.vlan,services[x.service]?.label,x.service].join(' ').toLocaleLowerCase().includes(filter.query.toLocaleLowerCase())));
  }
  function disconnect(s,removedIds){
    for(const {p} of ports(s)) if(removedIds.has(p.switchPortId))p.switchPortId='';
  }
  return {empty,validate,devices,ports,port,rows,statuses,services,serviceColor,effectiveStatus,disconnect};
});
