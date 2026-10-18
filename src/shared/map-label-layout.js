(function(root,factory){if(typeof module==='object')module.exports=factory();else root.RackMapLabels=factory();})(globalThis,function(){
  'use strict';
  // Screen pixels or PDF points. Only labels move; the supplied device positions stay intact.
  function layout(items,bounds,obstacles=[],gap=3,maxDistance=Infinity){
    const result=new Map(),cells=new Map(),cellSize=64;
    const overlaps=(a,b)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
    function keys(box){const out=[];for(let x=Math.floor((box.x-gap)/cellSize);x<=Math.floor((box.x+box.width+gap)/cellSize);x++)for(let y=Math.floor((box.y-gap)/cellSize);y<=Math.floor((box.y+box.height+gap)/cellSize);y++)out.push(x+':'+y);return out;}
    function insert(box){for(const key of keys(box)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);}}
    const free=box=>keys(box).every(key=>(cells.get(key)||[]).every(other=>!overlaps(box,other)));
    for(const box of obstacles)insert(box);
    const ordered=[...items].sort((a,b)=>(b.priority||0)-(a.priority||0)||a.y-b.y||a.x-b.x||String(a.id).localeCompare(String(b.id)));
    for(const item of ordered){
      if(item.width>bounds.width||item.height>bounds.height){result.set(item.id,null);continue;}
      const clamp=(x,y)=>({x:Math.max(bounds.x,Math.min(bounds.x+bounds.width-item.width,x)),y:Math.max(bounds.y,Math.min(bounds.y+bounds.height-item.height,y)),width:item.width,height:item.height});
      const radius=(item.radius||10)+gap,step=Math.max(8,item.height+gap);
      const distance=box=>Math.hypot(box.x+box.width/2-item.x,box.y+box.height/2-item.y);
      let found=null,nearby=null,nearbyScore=Infinity;
      // Search progressively farther from the device, with a stable preferred order.
      const searchLimit=Math.min(Math.max(bounds.width,bounds.height),maxDistance);
      for(let d=radius;d<searchLimit+step;d+=step){
        const choices=[clamp(item.x-item.width/2,item.y+d),clamp(item.x-item.width/2,item.y-d-item.height),clamp(item.x+d,item.y-item.height/2),clamp(item.x-d-item.width,item.y-item.height/2),clamp(item.x+d,item.y+d),clamp(item.x-d-item.width,item.y+d),clamp(item.x+d,item.y-d-item.height),clamp(item.x-d-item.width,item.y-d-item.height)];
        const local=choices.filter(box=>distance(box)<=maxDistance);
        found=local.filter(free).sort((a,b)=>distance(a)-distance(b))[0];if(found)break;
        if(Number.isFinite(maxDistance))for(const box of local){
          const blockers=new Set(keys(box).flatMap(key=>cells.get(key)||[]).filter(other=>overlaps(box,other)));
          const score=blockers.size*100000+distance(box);
          if(score<nearbyScore){nearby=box;nearbyScore=score;}
        }
      }
      // Dense clusters can fill the radial positions while leaving other gaps available.
      if(!found&&Number.isFinite(maxDistance))found=nearby;
      if(!found&&!Number.isFinite(maxDistance)){let best=Infinity;for(let y=bounds.y;y<=bounds.y+bounds.height-item.height;y+=Math.max(4,item.height/2))for(let x=bounds.x;x<=bounds.x+bounds.width-item.width;x+=Math.max(4,item.height/2)){const box=clamp(x,y),dist=distance(box);if(dist<best&&free(box)){found=box;best=dist;}}}
      result.set(item.id,found||null);if(found)insert(found);
    }
    return result;
  }
  function connector(point,box){return {x:Math.max(box.x,Math.min(box.x+box.width,point.x)),y:Math.max(box.y,Math.min(box.y+box.height,point.y))};}
  return {layout,connector};
});
