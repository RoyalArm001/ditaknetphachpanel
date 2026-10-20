(function(root,factory){
  if(typeof module==='object')module.exports=factory();
  else root.RackDrawingGeometry=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=v=>Math.max(0,Math.min(1,v));
  const point=p=>({x:clamp(p.x),y:clamp(p.y)});
  const distance=(a,b,s)=>Math.hypot((b.x-a.x)*s.width,(b.y-a.y)*s.height);
  function metersPerPixel(sheet){
    const c=sheet.calibration;if(!c)return null;
    const span=distance(c.a,c.b,sheet);
    return Number.isFinite(span)&&span>1e-8&&Number.isFinite(c.meters)&&c.meters>0?c.meters/span:null;
  }
  function length(points,sheet){
    const scale=metersPerPixel(sheet);if(scale===null)return null;
    return points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p,sheet)*scale,0);
  }
  function orthogonal(points){
    const result=[];
    const add=p=>{const last=result[result.length-1];if(!last||Math.abs(last.x-p.x)>1e-10||Math.abs(last.y-p.y)>1e-10)result.push({...p});};
    for(const p of points){
      const last=result[result.length-1];
      if(last&&Math.abs(last.x-p.x)>1e-10&&Math.abs(last.y-p.y)>1e-10)add({x:p.x,y:last.y});
      add(p);
    }
    return result;
  }
  function gridPixels(sheet,step=.5){const scale=metersPerPixel(sheet);return scale?step/scale:20;}
  function nearestSegment(p,points,sheet,ortho=false){
    let best={distance:Infinity,index:0,point:point(p)};
    for(let i=0;i<points.length-1;i++){
      const path=ortho?orthogonal([points[i],points[i+1]]):[points[i],points[i+1]];
      for(let j=0;j<path.length-1;j++){
        const a=path[j],b=path[j+1],dx=(b.x-a.x)*sheet.width,dy=(b.y-a.y)*sheet.height;
        const t=Math.max(0,Math.min(1,((p.x-a.x)*sheet.width*dx+(p.y-a.y)*sheet.height*dy)/(dx*dx+dy*dy||1)));
        const q={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)},d=distance(p,q,sheet);
        if(d<best.distance)best={distance:d,index:i,point:q};
      }
    }
    return best;
  }
  // Distances are measured on paper, not in normalized square coordinates.
  function snap(raw,sheet,{zoom=1,enabled=true,grid=false,step=.5,exclude='',origin=null,ortho=false}={}){
    let p=point(raw),kind='';
    if(enabled){
      const tolerance=8/zoom,candidates=[
        ...sheet.nodes.filter(n=>n.id!==exclude).map(n=>({...n,kind:'node'})),
        ...sheet.routes.flatMap(r=>r.points).map(p=>({...p,kind:'bend'}))
      ];
      let best=tolerance,target;
      for(const candidate of candidates){const d=distance(p,candidate,sheet);if(d<=best){best=d;target=candidate;}}
      if(target){p=point(target);kind=target.kind;}
      else if(grid){
        const size=gridPixels(sheet,step);
        p=point({x:Math.round(p.x*sheet.width/size)*size/sheet.width,y:Math.round(p.y*sheet.height/size)*size/sheet.height});kind='grid';
      }
    }
    // A snapped endpoint must remain exact; orthogonal routing inserts its elbow.
    if(origin&&ortho&&kind!=='node'){
      if(Math.abs(p.x-origin.x)*sheet.width>=Math.abs(p.y-origin.y)*sheet.height)p.y=origin.y;
      else p.x=origin.x;
      kind='axis';
    }
    return {point:point(p),kind};
  }
  return {point,distance,metersPerPixel,length,orthogonal,gridPixels,snap,nearestSegment};
});
