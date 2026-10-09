'use strict';
const D=require('../../src/shared/domain');
function fixture(){
  const device=(id,type,model)=>({id,name:id,type,model,color:'#397c78',pos:type==='panel'?1:3,height:1,portList:Array.from({length:24},(_,i)=>({...D.port(i+1,`${id}-${i+1}`),status:i<3?'used':'free',service:i<3?'wifi':''}))});
  const state={...D.empty(),company:'PDF Test Project',deviceTypes:[{id:'ups',name:'UPS'}],floors:[
    {id:'minus-one',name:'-1',racks:[{id:'rack-a',name:'Rack A',u:42,devices:[device('Panel A','panel','CAT6-A'),device('Switch A','switch','SW-24-PoE')]},{id:'rack-b',name:'Rack B',u:42,devices:[device('Panel B','panel','CAT6-B'),device('UPS B','ups','UPS-1500')]}]},
    {id:'plus-one',name:'1',racks:[{id:'rack-c',name:'Rack C',u:42,devices:[device('Panel C','panel','CAT6-C')]}]}
  ],networks:[{id:'net',hosts:[{deviceId:'Switch A',ip:'192.168.1.2',password:'NEVER-EXPORT-THIS'}]}]};
  state.floors[0].racks[0].devices[0].portList[0].switchPortId='Switch A-1';
  state.floors[0].racks[0].devices[0].portList[0].endpointName='WiFi B zone';
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAAVSURBVAiZY/z///9/BgYGBiYGKAAAPfgEANl8gEYAAAAASUVORK5CYII=';
  const plan=(id,floorId,ports)=>({id,name:id,floorId,image,width:1000,height:600,markers:ports.map((portId,i)=>({id:`${id}-${i}`,portId,x:.2+i*.15,y:.4,iconX:.2+i*.15,iconY:.4}))});
  state.floorPlans=[plan('Gym','minus-one',['Panel A-1','Panel A-2']),plan('Office','minus-one',['Panel B-1']),plan('Upper','plus-one',['Panel C-1'])];
  return state;
}
module.exports={fixture};
