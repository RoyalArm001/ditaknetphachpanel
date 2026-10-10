(function (root, factory) {
  if (typeof module === 'object') module.exports = factory();
  else root.RackDomain = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  const statuses = {get free(){return tr('Ազատ');}, get used(){return tr('Զբաղված');}, get fault(){return tr('Անսարք');}};
  const services = {
    '':{get label(){return tr('Չնշված');},color:'#64748b'},
    camera:{get label(){return tr('Տեսախցիկ');},color:'#a65d08'},
    wifi:{label:'Wi-Fi',color:'#2563b0'},
    access:{get label(){return tr('Մուտքի վերահսկում');},color:'#7c3daf'},
    phone:{get label(){return tr('Հեռախոս');},color:'#b83878'},
    internet:{get label(){return tr('Ինտերնետ');},color:'#08796b'}
  };
  const serviceEntries = s => [...Object.entries(services).filter(([key])=>!s.hiddenServices?.includes(key)),...(s.serviceTypes||[]).map(type=>[type.id,{label:type.name,color:type.color}])];
  const hasService = (s,key) => key==='' || serviceEntries(s).some(([id])=>id===key);
  const serviceInUse = (s,key) => ports(s).some(({p})=>p.service===key)||networks(s).some(n=>n.name===key);
  const applyProjectStyle = (s,style) => {
    for(const [key] of serviceEntries(s))if(key&&!hasService(style,key)&&serviceInUse(s,key))throw new Error(tr('Օգտագործվող տեսակը ջնջելուց առաջ փոխեք այն ցանցերում և պորտերում։'));
    Object.assign(s,style);
  };
  const standardDeviceTypes = Object.freeze([
    ['panel', tr('Փաչ պանել')],
    ['switch', tr('Սվիչ')],
    ['router', tr('Ռաուտեր')],
    ['server', tr('Սերվեր')],
    ['nvr', tr('NVR / DVR')],
    ['ups', tr('UPS')],
    ['organizer', tr('Կաբել մենեջմենթ')],
    ['shelf', tr('Դարակ')]
  ]);
  const deviceTypes = s => {
    const custom = Array.isArray(s?.deviceTypes) ? s.deviceTypes : [];
    const customMap = new Map(custom.filter(x => x && x.id).map(x => [x.id, x.name]));
    const standard = standardDeviceTypes.map(([id, defaultLabel]) => [id, customMap.get(id) || defaultLabel]);
    const extraCustom = custom.filter(x => x && x.id && !standardDeviceTypes.some(([stdId]) => stdId === x.id)).map(x => [x.id, x.name]);
    return [...standard, ...extraCustom];
  };
  const isNetworkDevice = d => ['switch','router','server','nvr'].includes(d?.type);
  // Port counts below are copper ports; SFP ports are additional.
  const defaultModels=Object.freeze([
    ['panel','Cat6 UTP 24-Port 1U',24,1,0,false],
    ['panel','Cat6 UTP 48-Port 2U',48,2,0,false],
    ['panel','Cat6A FTP Shielded 24-Port 1U',24,1,0,false],
    ['panel','Cat5e Compact 12-Port 1U',12,1,0,false],
    ['panel','Optical ODF 24-Port LC/SC 1U',24,1,24,false],
    ['panel','Optical ODF 48-Port LC/SC 2U',48,2,48,false],
    ['switch','Cisco Catalyst 2960-24TT',24,1,2,false],
    ['switch','Cisco Catalyst 2960-48TT',48,1,2,false],
    ['switch','Cisco Catalyst 2960-24PC-L (PoE)',24,1,2,true],
    ['switch','Cisco Catalyst 3850-48P (PoE+)',48,1,4,true],
    ['switch','MikroTik CRS326-24G-2S+RM',24,1,2,false],
    ['switch','MikroTik CRS328-24P-4S+RM (PoE+)',24,1,4,true],
    ['switch','MikroTik CRS354-48G-4S+2Q+RM',48,1,6,false],
    ['switch','Ubiquiti UniFi USW-24-PoE',24,1,2,true],
    ['switch','Ubiquiti UniFi USW-48-PoE',48,1,4,true],
    ['switch','HPE Aruba 2530-24G',24,1,4,false],
    ['switch','HPE Aruba 2930F-48G PoE+',48,1,4,true],
    ['switch','D-Link DGS-1210-28',24,1,4,false],
    ['router','MikroTik CCR2004-16G-2S+',16,1,2,false],
    ['router','MikroTik CCR2116-12G-4S+',12,1,4,false],
    ['router','MikroTik RB5009UG+S+IN',8,1,1,false],
    ['router','MikroTik hEX S 5-Port',5,1,1,false],
    ['router','Cisco ISR 4331',3,1,2,false],
    ['router','Ubiquiti EdgeRouter 12',10,1,2,false],
    ['router','Ubiquiti Dream Machine Pro',8,1,2,false],
    ['server','1U Rack Server (Dell PowerEdge R640)',4,1,2,false],
    ['server','2U Rack Server (Dell PowerEdge R740)',4,2,2,false],
    ['nvr','NVR 16-Channel 1U (Hikvision / Dahua)',16,1,0,true],
    ['nvr','NVR 32-Channel 2U (Hikvision / Dahua)',32,2,0,true],
    ['ups','UPS 1500VA 2U (APC Smart-UPS)',1,2,0,false],
    ['ups','UPS 3000VA 3U (APC Smart-UPS)',1,3,0,false],
    ['organizer','1U Horizontal Cable Manager',0,1,0,false],
    ['organizer','2U Horizontal Cable Manager',0,2,0,false],
    ['shelf','1U 19" Cantilever Shelf',0,1,0,false]
  ].map(([type,name,ports,height,sfp,poe])=>Object.freeze({type,name,ports,height,sfp,poe})));
  const deviceModels=(type,s)=>{
    const defaults=defaultModels.filter(model=>model.type===type);
    const customType=s?.deviceTypes?.find(t=>t.id===type);
    const customModels=Array.isArray(customType?.models)?customType.models.map(m=>({type,name:m.name,ports:m.ports||m.portCount||24,height:m.height||1,sfp:m.sfp||m.sfpCount||0,poe:!!m.poe})):[];
    const extraModels=Array.isArray(s?.deviceModels)?s.deviceModels.filter(m=>m.type===type).map(m=>({type,name:m.name,ports:m.ports||m.portCount||24,height:m.height||1,sfp:m.sfp||m.sfpCount||0,poe:!!m.poe})):[];
    return [...defaults,...customModels,...extraModels];
  };
  const allCatalogModels=s=>{
    const typeMap=new Map(deviceTypes(s));
    const standardLabels={
      panel:tr('Փաչ պանել'),
      switch:tr('Սվիչ'),
      router:tr('Ռաուտեր'),
      server:tr('Սերվեր'),
      nvr:tr('NVR / DVR'),
      ups:tr('UPS'),
      organizer:tr('Կաբել մենեջմենթ'),
      shelf:tr('Դարակ')
    };
    for(const [type,label] of Object.entries(standardLabels)){
      if(!typeMap.has(type))typeMap.set(type,label);
    }
    const allTypeIds=[...typeMap.keys()];
    return allTypeIds.flatMap(id=>{
      const label=typeMap.get(id)||id;
      const models=deviceModels(id,s);
      return models.map(m=>({...m,typeId:id,typeLabel:label}));
    });
  };
  function modelDefaults(type,name,s){
    const model=deviceModels(type,s).find(m=>m.name.toLowerCase()===String(name||'').trim().toLowerCase());
    return model?{ports:model.ports,height:model.height,sfpCount:model.sfp,modelType:type==='switch'?(model.poe?(model.name.includes('PoE+')?'poe-plus':'poe'):'none'):''}:null;
  }
  function portLayout(d){
    const sfpCount=d.sfpCount||0,copper=d.portList.length-sfpCount;
    const columns=Math.ceil(copper/2),opticalColumns=Math.ceil(sfpCount/2);
    return d.portList.map((p,i)=>{
      const optical=i>=copper,index=optical?i-copper:i;
      return {p,optical,row:isNetworkDevice(d)?index%2:Math.floor(i/24),column:isNetworkDevice(d)?Math.floor(index/2)+(optical?columns+1:0):i%24,columns:isNetworkDevice(d)?columns+(sfpCount?1+opticalColumns:0):24,rows:isNetworkDevice(d)?2:Math.ceil(d.portList.length/24)};
    });
  }
  const serviceColor = (s,key) => s.serviceColors?.[key] || s.serviceTypes?.find(type=>type.id===key)?.color || services[key]?.color || services[''].color;
  const serviceLabel = (s,key,translate=tr) => s.serviceLabels?.[key] || s.serviceTypes?.find(type=>type.id===key)?.name || translate(({'':'Չնշված',camera:'Տեսախցիկ',wifi:'Wi-Fi',access:'Մուտքի վերահսկում',phone:'Հեռախոս',internet:'Ինտերնետ'})[key]||'');
  const statusLabel = (s,key,translate=tr) => s.statusLabels?.[key] || translate(({free:'Ազատ',used:'Զբաղված',fault:'Անսարք'})[key]||'');
  const statusColor = (s,key) => s.statusColors?.[key] || ({free:'#299c72',used:'#397cc4',fault:'#d35352'})[key];
  const projectStyle = s => Object.fromEntries(['backupFormat','serviceIcons','serviceTypes','hiddenServices','serviceColors','serviceLabels','statusColors','statusLabels'].filter(key=>s?.[key]!==undefined).map(key=>[key,s[key]]));
  const empty = () => ({schema:2, company:'', floors:[], networks:[],deviceTypes:[]});
  const devices = s => s.floors.flatMap(f => f.racks.flatMap(r => r.devices.map(d => ({f,r,d}))));
  const ports = s => devices(s).flatMap(x => x.d.portList.map(p => ({...x,p})));
  const networks = s => Array.isArray(s.networks)?s.networks:[];
  const hostsForDevice = (s,deviceId) => networks(s).flatMap(n=>n.hosts.filter(h=>h.deviceId===deviceId).map(h=>({n,h})));
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
  const vlanIp = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/(?:3[0-2]|[12]?\d))?$/;
  const port = (number, id) => ({id,number,status:'free',endpointName:'',cable:'',floorId:'',room:'',door:'',side:'',notes:'',switchPortId:'',service:'',vlan:''});
  const assert = (v,m) => {if (!v) throw new Error(m);};
  function validate(s) {
    assert(s && s.schema===2 && typeof s.company==='string' && s.company.length<=200 && Array.isArray(s.floors), tr('Տվյալների ձևաչափը սխալ է'));
    if(s.backupFormat!==undefined)assert(['json','xlsx'].includes(s.backupFormat),tr('Պահուստային ֆայլի տեսակը սխալ է'));
    if(s.serviceTypes!==undefined){
      assert(Array.isArray(s.serviceTypes)&&s.serviceTypes.length<=100,tr('Ցանցերի տեսակների ցանկը սխալ է'));
      const keys=new Set(Object.keys(services));
      for(const type of s.serviceTypes){
        assert(type&&typeof type==='object'&&typeof type.id==='string'&&/^custom-[a-z0-9-]{1,64}$/.test(type.id)&&!keys.has(type.id),tr('Ցանցի տեսակի ID-ն սխալ է'));keys.add(type.id);
        assert(typeof type.name==='string'&&type.name.trim().length>0&&type.name.length<=80,tr('Ցանցի տեսակի անվանումը պարտադիր է'));
        assert(typeof type.color==='string'&&/^#[0-9a-f]{6}$/i.test(type.color),tr('Գույնը պետք է լինի HEX ձևաչափով'));
      }
    }
    if(s.serviceIcons!==undefined){assert(s.serviceIcons&&typeof s.serviceIcons==='object'&&!Array.isArray(s.serviceIcons),'Invalid service icons');for(const [key,icon] of Object.entries(s.serviceIcons))assert(hasService(s,key)&&typeof icon==='string'&&Object.hasOwn(serviceIconPaths,icon),'Invalid service icon');}
    if(s.hiddenServices!==undefined)assert(Array.isArray(s.hiddenServices)&&s.hiddenServices.every(key=>typeof key==='string'&&key!==''&&Object.hasOwn(services,key))&&new Set(s.hiddenServices).size===s.hiddenServices.length,tr('Ցանցերի տեսակների ցանկը սխալ է'));
    // Validate stored custom names independently of the current interface language.
    const serviceNames=(s.serviceTypes||[]).map(type=>type.name.trim().toLowerCase());
    assert(new Set(serviceNames).size===serviceNames.length,tr('Ցանցերի տեսակների անվանումները պետք է տարբեր լինեն'));
    if(s.serviceColors!==undefined){
      assert(s.serviceColors && typeof s.serviceColors==='object' && !Array.isArray(s.serviceColors),tr('Գույների ձևաչափը սխալ է'));
      for(const [key,value] of Object.entries(s.serviceColors))assert(hasService(s,key)&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value),tr('Գույնը պետք է լինի HEX ձևաչափով'));
    }
    assert(s.floors.length<=200,tr('Առավելագույնը 200 հարկ'));
    if(s.deviceTypes!==undefined){
      assert(Array.isArray(s.deviceTypes)&&s.deviceTypes.length<=100,tr('Սարքերի տեսակների ցանկը սխալ է'));
      const typeIds=new Set(['panel','switch']);
      for(const type of s.deviceTypes){
        assert(type&&typeof type==='object',tr('Սարքի տեսակի ձևաչափը սխալ է'));
        assert(typeof type.id==='string'&&/^[a-z][\w-]{1,39}$/.test(type.id)&&!typeIds.has(type.id),tr('Սարքի տեսակի ID-ն սխալ է'));
        assert(typeof type.name==='string'&&type.name.trim().length>0&&type.name.length<=80,tr('Սարքի տեսակի անվանումը սխալ է'));
        if(type.models!==undefined){
          assert(Array.isArray(type.models)&&type.models.length<=50,tr('Մոդելների ցանկը սխալ է'));
          for(const m of type.models){
            assert(m&&typeof m==='object',tr('Մոդելի ձևաչափը սխալ է'));
            assert(typeof m.name==='string'&&m.name.trim().length>0&&m.name.length<=80,tr('Մոդելի անվանումը սխալ է'));
            if(m.ports!==undefined)assert(Number.isInteger(m.ports)&&m.ports>=1&&m.ports<=96,tr('Պորտերի քանակը սխալ է'));
            if(m.height!==undefined)assert(Number.isInteger(m.height)&&m.height>=1&&m.height<=60,tr('Բարձրությունը սխալ է'));
            if(m.sfp!==undefined)assert(Number.isInteger(m.sfp)&&m.sfp>=0&&m.sfp<=16,tr('SFP քանակը սխալ է'));
          }
        }
        typeIds.add(type.id);
      }
    }
    if(s.deviceModels!==undefined){
      assert(Array.isArray(s.deviceModels)&&s.deviceModels.length<=200,tr('Մոդելների ցանկը սխալ է'));
      for(const m of s.deviceModels){
        assert(m&&typeof m==='object',tr('Մոդելի ձևաչափը սխալ է'));
        assert(typeof m.name==='string'&&m.name.trim().length>0&&m.name.length<=80,tr('Մոդելի անվանումը սխալ է'));
        assert(typeof m.type==='string'&&deviceTypes(s).some(([key])=>key===m.type),tr('Սարքի տեսակը սխալ է'));
      }
    }
    for(const field of ['serviceLabels','statusLabels','statusColors'])if(s[field]!==undefined){
      assert(s[field]&&typeof s[field]==='object'&&!Array.isArray(s[field]),tr('Տվյալների ձևաչափը սխալ է'));
      for(const [key,value]of Object.entries(s[field])){
        assert(field==='serviceLabels'?hasService(s,key):Object.hasOwn(statuses,key),tr('Տվյալների ձևաչափը սխալ է'));
        assert(typeof value==='string'&&(field==='statusColors'?/^#[0-9a-f]{6}$/i.test(value):value.trim().length>0&&value.length<=80),tr('Տվյալների ձևաչափը սխալ է'));
      }
    }
    const ids=new Set();
    const id=x=>{assert(typeof x==='string' && /^[\w-]{1,80}$/.test(x) && !ids.has(x),tr('Կրկնվող կամ սխալ ID'));ids.add(x);};
    const text=(x,max=200)=>assert(typeof x==='string' && x.length<=max,tr('Տեքստային դաշտը սխալ է կամ չափազանց երկար'));
    const name=x=>{text(x);assert(x.trim(),tr('Անվանումը պարտադիր է'));};
    const integer=(x,min,max)=>assert(Number.isInteger(x)&&x>=min&&x<=max,tr('Չափը կամ պորտի համարը սխալ է'));
    const normalizeName=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
    const uniqueNames=xs=>{const names=xs.map(x=>normalizeName(x.name));assert(new Set(names).size===names.length,tr('Անվանումները պետք է տարբեր լինեն'));};
    const allDevices=[],allEndpoints=[];
    uniqueNames(s.floors);
    for (const f of s.floors) {
      id(f.id); name(f.name); assert(Array.isArray(f.racks)&&f.racks.length<=100,tr('Ռաքերի ցանկը սխալ է'));uniqueNames(f.racks);
      for(const r of f.racks) {
        id(r.id);name(r.name);integer(r.u,1,60);text(r.location);text(r.photo,3000000);
        assert(!r.photo || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo),tr('Լուսանկարի ձևաչափը սխալ է'));
        assert(Array.isArray(r.devices)&&r.devices.length<=60,tr('Սարքերի ցանկը սխալ է'));uniqueNames(r.devices);allDevices.push(...r.devices);
        const used=new Set();
        for(const d of r.devices) {
          id(d.id);name(d.name);assert(deviceTypes(s).some(([key])=>key===d.type),tr('Սարքի տեսակը սխալ է'));text(d.model);if(d.modelType!==undefined)assert(typeof d.modelType==='string'&&['','poe','poe-plus','none'].includes(d.modelType),tr('Սվիչի մոդելի տեսակը սխալ է'));text(d.color,7);assert(/^#[0-9a-f]{6}$/i.test(d.color),tr('Սարքի գույնը սխալ է'));
          integer(d.pos,1,r.u);integer(d.height,1,r.u);assert(d.pos+d.height-1<=r.u,tr('Սարքը դուրս է գալիս ռաքի սահմաններից'));
          for(let u=d.pos;u<d.pos+d.height;u++){assert(!used.has(u),tr`U${u} դիրքն արդեն զբաղված է`);used.add(u);}
          assert(Array.isArray(d.portList),tr('Պորտերի ցանկը սխալ է'));integer(d.portList.length,1,96);
          if(d.sfpCount!==undefined){integer(d.sfpCount,0,Math.min(16,d.portList.length));assert(!d.sfpCount||isNetworkDevice(d),tr('Օպտիկական պորտերը հասանելի են սվիչի և ռաուտերի համար'));}
          d.portList.forEach((p,i)=>{
            id(p.id);assert(p.number===i+1,tr('Պորտերի համարակալումը սխալ է'));assert(Object.hasOwn(statuses,p.status),tr('Պորտի վիճակը սխալ է'));
            for(const k of ['cable','floorId','room','door','side','switchPortId'])text(p[k]);text(p.notes,2000);
            // Missing fields remain valid for existing databases and older backups.
            if(p.endpointName!==undefined){text(p.endpointName);if(normalizeName(p.endpointName))allEndpoints.push({name:p.endpointName});}
            if(p.service!==undefined)assert(typeof p.service==='string'&&hasService(s,p.service),tr('Պորտի նշանակությունը սխալ է'));
            if(p.vlan!==undefined)assert(typeof p.vlan==='string'&&(p.vlan===''||(/^\d{1,4}$/.test(p.vlan)&&Number(p.vlan)>=1&&Number(p.vlan)<=4094)),tr('VLAN-ը պետք է լինի 1–4094 ամբողջ թիվ կամ դատարկ'));
            assert(!p.floorId||s.floors.some(x=>x.id===p.floorId),tr('Մալուխի հարկը չի գտնվել'));
            assert(p.status!=='free'||(!p.cable&&!p.switchPortId),tr('Մալուխով կամ կապով պորտը չի կարող ազատ լինել'));
            assert(d.type==='panel'||!p.switchPortId,tr('Կապը լրացվում է փաչ պանելի պորտում'));
          });
        }
      }
    }
    // Device and endpoint names identify physical items on the map, so they
    // must stay unique across the whole project even across floors/racks.
    uniqueNames(allDevices);
    uniqueNames(allEndpoints);
    if(s.networks!==undefined){
      assert(Array.isArray(s.networks)&&s.networks.length<=400,tr('Ցանցերի ցանկը սխալ է'));
      uniqueNames(s.networks);
      const vlans=new Set();
      for(const n of s.networks){
        id(n.id);name(n.name);
        assert(typeof n.vlan==='string'&&/^\d{1,4}$/.test(n.vlan)&&Number(n.vlan)>=1&&Number(n.vlan)<=4094,tr('VLAN-ը պետք է լինի 1–4094 ամբողջ թիվ կամ դատարկ'));
        assert(!vlans.has(n.vlan),tr('VLAN համարները պետք է տարբեր լինեն'));vlans.add(n.vlan);
        if(Array.isArray(n.ip)){assert(n.ip.length<=16&&new Set(n.ip).size===n.ip.length,tr('VLAN IP-ները պետք է տարբեր լինեն'));n.ip.forEach(ip=>{text(ip);if(ip)assert(vlanIp.test(ip),tr('VLAN IP-ն պետք է լինի IPv4 հասցե կամ CIDR, կամ դատարկ'));});}else{text(n.ip);if(n.ip)assert(vlanIp.test(n.ip),tr('VLAN IP-ն պետք է լինի IPv4 հասցե կամ CIDR, կամ դատարկ'));}
        if(n.deviceTypes!==undefined){assert(Array.isArray(n.deviceTypes)&&n.deviceTypes.every(type=>deviceTypes(s).some(([key])=>key===type)),tr('VLAN-ի սարքերի տեսակները սխալ են'));assert(new Set(n.deviceTypes).size===n.deviceTypes.length,tr('VLAN-ի սարքերի տեսակները չպետք է կրկնվեն'));}
        assert(Array.isArray(n.hosts)&&n.hosts.length<=400,tr('Սարքերի IP ցանկը սխալ է'));uniqueNames(n.hosts);
        const hostIps=new Set();
        for(const h of n.hosts){
          id(h.id);name(h.name);text(h.ip);assert(ipv4.test(h.ip),tr('Սարքի IP-ն պետք է լինի IPv4 հասցե'));
          assert(!hostIps.has(h.ip),tr('Նույն ցանցում IP հասցեները պետք է տարբեր լինեն'));hostIps.add(h.ip);
          text(h.username);text(h.password);
          if(h.deviceId!==undefined){text(h.deviceId);assert(!h.deviceId||s.floors.some(f=>f.racks.some(r=>r.devices.some(d=>d.id===h.deviceId))),tr('Սարքը չի գտնվել'));}
        }
      }
    }
    const all=ports(s), byId=new Map(all.map(x=>[x.p.id,x])), taken=new Set();
    if(s.floorPlans!==undefined){
      assert(Array.isArray(s.floorPlans)&&s.floorPlans.length<=30,tr('Հատակագծի տվյալները սխալ են'));
      for(const plan of s.floorPlans){
        id(plan.id);name(plan.name);text(plan.floorId);
        assert(!plan.floorId||s.floors.some(f=>f.id===plan.floorId),tr('Հատակագծի տվյալները սխալ են'));
        integer(plan.width,1,3000);integer(plan.height,1,3000);text(plan.image,2500000);
        assert(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(plan.image),tr('Հատակագծի տվյալները սխալ են'));
        assert(Array.isArray(plan.markers)&&plan.markers.length<=10000,tr('Հատակագծի տվյալները սխալ են'));
        const placed=new Set();
        for(const marker of plan.markers){id(marker.id);assert(byId.has(marker.portId)&&!placed.has(marker.portId),tr('Հատակագծի տվյալները սխալ են'));placed.add(marker.portId);assert([marker.x,marker.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1),tr('Հատակագծի տվյալները սխալ են'));if(marker.iconX!==undefined||marker.iconY!==undefined)assert([marker.iconX,marker.iconY].every(v=>Number.isFinite(v)&&v>=0&&v<=1),tr('Հատակագծի տվյալները սխալ են'));}
      }
    }
    for(const {d,p} of all) if(p.switchPortId){
      const to=byId.get(p.switchPortId);
      assert(d.type==='panel'&&to&&isNetworkDevice(to.d),tr('Սվիչի պորտը չի գտնվել'));
      assert(!taken.has(p.switchPortId),tr('Սվիչի պորտն արդեն կապված է այլ փաչ պորտի հետ'));taken.add(p.switchPortId);
    }
    return s;
  }
  function effectiveStatus(s,p){return p.status==='fault'?'fault':p.status==='used'||!!p.switchPortId||ports(s).some(x=>x.p.switchPortId===p.id)?'used':'free';}
  function rows(s,filter={}) {
    const all=ports(s), byId=new Map(all.map(x=>[x.p.id,x]));
    const incoming=new Map(all.filter(x=>x.p.switchPortId).map(x=>[x.p.switchPortId,x]));
    return all.map(x=>{
      const {f,r,d,p}=x, source=isNetworkDevice(d)?incoming.get(p.id):x;
      const info=source?.p||p, peer=byId.get(p.switchPortId)||incoming.get(p.id);
      const switchEnd=d.type==='switch'?x:peer?.d.type==='switch'?peer:null;
      const status=p.status==='fault'?'fault':p.status==='used'||p.switchPortId||incoming.has(p.id)?'used':'free';
      return {floor:f.name,rack:r.name,device:d.name,type:d.type,port:p.number,status, cable:info.cable,
        destination:s.floors.find(f=>f.id===info.floorId)?.name||'', endpointName:info.endpointName||'',room:info.room,door:info.door,side:info.side,notes:info.notes,service:info.service||'',vlan:info.vlan||'',
        switchName:switchEnd?.d.name||'',switchPort:switchEnd?.p.number??'',switchRack:switchEnd?.r.name||'',
        connection:peer?`${peer.r.name} / ${peer.d.name} / ${peer.p.number}`:'',...x};
    }).filter(x=>(!filter.floor||x.f.id===filter.floor||x.p.floorId===filter.floor||x.destination===s.floors.find(f=>f.id===filter.floor)?.name)&&(!filter.rack||x.r.id===filter.rack)&&(!filter.status||x.status===filter.status)&&(!filter.query||[x.floor,x.rack,x.device,x.port,x.endpointName,x.cable,x.destination,x.room,x.door,x.side,x.notes,x.connection,x.vlan,serviceLabel(s,x.service),statusLabel(s,x.status),x.service,...hostsForDevice(s,x.d.id).flatMap(y=>[y.n.name,y.n.vlan,y.n.ip,y.h.ip,y.h.username,y.h.name])].join(' ').toLocaleLowerCase().includes(filter.query.toLocaleLowerCase())));
  }
  const endpointLabel=(s,row,translate=tr)=>row.endpointName||row.room||row.cable||serviceLabel(s,row.service,translate);
  // x/y remains the exact floor-plan point. The icon can move independently.
  const mapMarkerLayout=marker=>{
    const legacyIconX=marker.x+(marker.x>.92?-.04:.04),legacyIconY=marker.y+(marker.y<.08?.05:-.05);
    const hadDefaultOffset=Number.isFinite(marker.iconX)&&Number.isFinite(marker.iconY)&&Math.abs(marker.iconX-legacyIconX)<1e-8&&Math.abs(marker.iconY-legacyIconY)<1e-8;
    return {x:marker.x,y:marker.y,iconX:hadDefaultOffset?marker.x:marker.iconX??marker.x,iconY:hadDefaultOffset?marker.y:marker.iconY??marker.y};
  };
  // A panel port and its linked switch port represent one installed endpoint.
  function mapDevices(s,plan){
    const all=rows(s),byId=new Map(all.map(row=>[row.p.id,row]));
    const incoming=new Map(all.filter(row=>row.p.switchPortId).map(row=>[row.p.switchPortId,row.p.id]));
    const canonical=id=>incoming.get(id)||id;
    const onFloor=row=>!plan?.floorId||(row.p.floorId||row.f.id)===plan.floorId;
    const devices=all.filter(row=>canonical(row.p.id)===row.p.id&&row.status!=='free'&&onFloor(row));
    const placed=new Map();
    for(const marker of plan?.markers||[]){const portId=canonical(marker.portId),row=byId.get(portId);if(!row)continue;const previous=placed.get(portId);if(!previous||marker.portId===portId)placed.set(portId,{...marker,portId,row});}
    const serviceCounts=new Map();
    const markers=[...placed.values()].filter(marker=>onFloor(marker.row)).map(marker=>{
      const service=marker.row.service||'other';
      const seq=(serviceCounts.get(service)||0)+1;
      serviceCounts.set(service,seq);
      return {...marker,number:seq};
    });
    return {devices,markers,canonical};
  }
  const serviceIconPaths={
    lan:'M3 3h18v18H3Z M6 7h12v7h-3v3H9v-3H6Z M9 7v4 M12 7v4 M15 7v4',
    computer:'M2 3h20v14H2Z M12 17v4 M7 21h10 M5 6h14',
    laptop:'M5 3h14v13H5Z M5 16l-3 5h20l-3-5 M10 18h4',
    cameraIndoor:'M3 11a9 9 0 0 1 18 0Z M5 11a7 7 0 0 0 14 0 M9 12a3 3 0 0 0 6 0',
    cameraOutdoor:'M3 5l14 2-2 8-14-2Z M17 8l5 1-1 5-5-1 M8 14v5h8 M16 16v6',
    cameraPtz:'M5 3h14v5H5Z M7 8v8a5 5 0 0 0 10 0V8 M9 14h6v4H9Z M12 1v2',
    socket:'M3 3h18v18H3Z M8 8v5 M16 8v5 M10 17h4',
    fiber:'M8 2v8 M16 2v8 M5 10h6v8H5Z M13 10h6v8h-6Z M8 18v4 M16 18v4',
    switch:'M2 7h20v12H2Z M5 11h3v4H5Z M10 11h3v4h-3Z M15 11h3v4h-3Z M5 4h14',
    router:'M3 12h18v8H3Z M6 12V3 M18 12V3 M6 16h2 M11 16h2 M16 16h2',
    server:'M5 2h14v20H5Z M5 8h14 M5 15h14 M8 5h1 M8 11h1 M8 18h1',
    printer:'M6 8V2h12v6 M6 18H2V8h20v10h-4 M6 14h12v8H6Z M17 11h2',
    tv:'M2 6h20v14H2Z M7 2l5 4 5-4 M8 23h8',
    intercom:'M5 2h14v20H5Z M8 5h8v7H8Z M8 16h2 M14 16h2 M8 19h8',
    alarm:'M5 15V9a7 7 0 0 1 14 0v6l2 3H3Z M9 21h6 M12 5v6',
    sensor:'M8 8h8v8H8Z M3 6a10 10 0 0 0 0 12 M21 6a10 10 0 0 1 0 12 M6 9a5 5 0 0 0 0 6 M18 9a5 5 0 0 1 0 6',
    ups:'M5 2h14v20H5Z M8 5h8v4H8Z M13 11l-4 5h4l-2 4 M8 6h1',
    cable:'M3 2h6v6H3Z M5 2V0 M7 2V0 M6 8v8a5 5 0 0 0 10 0v-2 M13 8h6v6h-6Z M15 8V5 M17 8V5',
    camera:'M3 7h12v10H3Z M15 10l6-3v10l-6-3Z',
    wifi:'M2 8Q12 -1 22 8 M5 12Q12 5 19 12 M8 16Q12 12 16 16 M11 20h2',
    access:'M5 21V3h13v18 M2 21h20 M14 12h1',
    phone:'M6 3l4 4-3 3q2 5 7 7l3-3 4 4q-2 5-7 2Q3 16 3 7Z',
    internet:'M3 12h18 M12 3C5 8 5 16 12 21 M12 3c7 5 7 13 0 18 M12 3C0 3 0 21 12 21C24 21 24 3 12 3Z',
    other:'M4 4h16v13H4Z M8 21h8 M12 17v4'
  };
  const serviceIconNames={lan:'LAN վարդակ',computer:'Համակարգիչ',laptop:'Նոթբուք',cameraIndoor:'Ներքին տեսախցիկ',cameraOutdoor:'Արտաքին տեսախցիկ',cameraPtz:'PTZ տեսախցիկ',camera:'Տեսախցիկ',wifi:'Wi-Fi',access:'Մուտքի վերահսկում',phone:'Հեռախոս',internet:'Ինտերնետ',socket:'Էլեկտրական վարդակ',fiber:'Օպտիկական միացում',switch:'Սվիչ',router:'Ռաուտեր',server:'Սերվեր',printer:'Տպիչ',tv:'Հեռուստացույց',intercom:'Դոմոֆոն',alarm:'Ազդանշանային սարք',sensor:'Սենսոր',ups:'UPS',cable:'Մալուխի միացում',other:'Այլ սարք'};
  const serviceIcon = (key,state) => serviceIconPaths[state?.serviceIcons?.[key]]||serviceIconPaths[key]||serviceIconPaths.other;
  function disconnect(s,removedIds){
    for(const {p} of ports(s)) if(removedIds.has(p.switchPortId))p.switchPortId='';
    for(const plan of s.floorPlans||[]){plan.markers=plan.markers.filter(m=>!removedIds.has(m.portId));if(plan.floorId&&!s.floors.some(f=>f.id===plan.floorId))plan.floorId='';}
  }
  return {defaultModels,deviceModels,modelDefaults,allCatalogModels,empty,validate,serviceEntries,hasService,serviceInUse,applyProjectStyle,devices,deviceTypes,isNetworkDevice,portLayout,ports,port,rows,endpointLabel,mapMarkerLayout,mapDevices,serviceIcon,serviceIconNames,networks,hostsForDevice,statuses,services,serviceColor,serviceLabel,statusLabel,statusColor,projectStyle,effectiveStatus,disconnect};
});
