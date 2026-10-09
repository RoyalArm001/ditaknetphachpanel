(function(root,factory){if(typeof module==='object')module.exports=factory(require('./domain'));else root.RackConnections=factory(root.RackDomain);})(globalThis,function(D){
  'use strict';
  function inspect(state,rackId=''){
    const ports=D.ports(state),byId=new Map(ports.map(entry=>[entry.p.id,entry]));
    const incoming=new Map();
    for(const entry of ports)if(entry.p.switchPortId){const list=incoming.get(entry.p.switchPortId)||[];list.push(entry);incoming.set(entry.p.switchPortId,list);}
    const records=[];
    for(const from of ports){
      const target=byId.get(from.p.switchPortId);
      const linked=!!from.p.switchPortId;
      // A linked network port is already represented by its patch-panel source.
      if(!linked&&D.isNetworkDevice(from.d)&&incoming.has(from.p.id))continue;
      if(!linked&&from.p.status!=='used')continue;
      if(rackId&&from.r.id!==rackId&&target?.r.id!==rackId)continue;
      const issues=[];
      if(linked){
        if(from.d.type!=='panel'||!target||!D.isNetworkDevice(target.d)||target.p.id===from.p.id)issues.push('wrong');
        if((incoming.get(from.p.switchPortId)||[]).length>1)issues.push('duplicate');
      }else issues.push('unlinked');
      records.push({id:from.p.id,from,to:target||null,issues});
    }
    const summary={linked:0,unlinked:0,duplicate:0,wrong:0};
    for(const record of records){if(!record.issues.length)summary.linked++;else for(const issue of record.issues)summary[issue]++;}
    return {records,issues:records.filter(record=>record.issues.length),summary};
  }
  return {inspect};
});
