'use strict';
(function(root){
  class MinHeap {
    constructor(){this.data=[];}
    push(idx,prio){
      this.data.push({idx,prio});
      let i=this.data.length-1;
      while(i>0){
        let p=(i-1)>>1;
        if(this.data[p].prio<=this.data[i].prio)break;
        const tmp=this.data[p];this.data[p]=this.data[i];this.data[i]=tmp;
        i=p;
      }
    }
    pop(){
      if(!this.data.length)return -1;
      const top=this.data[0];
      const bottom=this.data.pop();
      if(this.data.length){
        this.data[0]=bottom;
        let i=0,len=this.data.length;
        while(true){
          let l=2*i+1,r=2*i+2,sm=i;
          if(l<len&&this.data[l].prio<this.data[sm].prio)sm=l;
          if(r<len&&this.data[r].prio<this.data[sm].prio)sm=r;
          if(sm===i)break;
          const tmp=this.data[i];this.data[i]=this.data[sm];this.data[sm]=tmp;
          i=sm;
        }
      }
      return top.idx;
    }
    get length(){return this.data.length;}
  }

  function createCollisionGrid(data,width,height,cols=120,rows=80){
    const size=cols*rows;
    const isWall=new Uint8Array(size);
    const cost=new Float32Array(size);
    const scaleX=width/cols,scaleY=height/rows;

    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const cell=y*cols+x;
        // Sample a small cross instead of one pixel so thin PDF wall strokes
        // survive downscaling and don't disappear between grid-cell centers.
        let darkSamples=0;
        for(const [ox,oy] of [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){
          const px=Math.min(width-1,Math.floor((x+ox)*scaleX));
          const py=Math.min(height-1,Math.floor((y+oy)*scaleY));
          const idx=(py*width+px)*4,lum=.299*data[idx]+.587*data[idx+1]+.114*data[idx+2];
          if(data[idx+3]>=50&&lum<110)darkSamples++;
        }
        isWall[cell]=darkSamples>=2?1:0;
        cost[cell]=isWall[cell]?Infinity:1;
      }
    }

    // Add slight clearance cost to cells adjacent to walls
    // so paths naturally prefer middle of corridors/hallways
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const cell=y*cols+x;
        if(isWall[cell])continue;
        let nearWall=false;
        for(let dy=-1;dy<=1;dy++){
          for(let dx=-1;dx<=1;dx++){
            if(!dx&&!dy)continue;
            const nx=x+dx,ny=y+dy;
            if(nx>=0&&nx<cols&&ny>=0&&ny<rows&&isWall[ny*cols+nx]){
              nearWall=true;break;
            }
          }
          if(nearWall)break;
        }
        if(nearWall)cost[cell]=4;
      }
    }

    return {cols,rows,isWall,cost};
  }

  function hasLineOfSight(x0,y0,x1,y1,isWall,cols,rows){
    let gx0=Math.round(x0*(cols-1)),gy0=Math.round(y0*(rows-1));
    const gx1=Math.round(x1*(cols-1)),gy1=Math.round(y1*(rows-1));
    const startX=gx0,startY=gy0,endX=gx1,endY=gy1;
    const dx=Math.abs(gx1-gx0),dy=Math.abs(gy1-gy0);
    const sx=gx0<gx1?1:-1,sy=gy0<gy1?1:-1;
    let err=dx-dy;

    while(true){
      // If cell is a wall (ignoring immediate start and end cells in case devices sit on wall edge)
      const isStart=gx0===startX&&gy0===startY;
      const isEnd=gx0===endX&&gy0===endY;
      if(!isStart&&!isEnd&&isWall[gy0*cols+gx0])return false;

      if(gx0===gx1&&gy0===gy1)break;
      const e2=2*err;
      if(e2>-dy){err-=dy;gx0+=sx;}
      if(e2<dx){err+=dx;gy0+=sy;}
    }
    return true;
  }

  function nearestOpenCell(grid,x,y,maxRadius=8){
    const {cols,rows,isWall}=grid;
    const gx=Math.max(0,Math.min(cols-1,Math.round(x*(cols-1))));
    const gy=Math.max(0,Math.min(rows-1,Math.round(y*(rows-1))));
    if(!isWall[gy*cols+gx])return gy*cols+gx;
    for(let radius=1;radius<=maxRadius;radius++){
      let best=-1,bestDistance=Infinity;
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
        const nx=gx+dx,ny=gy+dy;
        if(nx<0||nx>=cols||ny<0||ny>=rows)continue;
        const idx=ny*cols+nx;if(isWall[idx])continue;
        const distance=dx*dx+dy*dy;if(distance<bestDistance){best=idx;bestDistance=distance;}
      }
      if(best!==-1)return best;
    }
    return -1;
  }

  function computeShortestPathTree(grid,targetNormX,targetNormY){
    const {cols,rows,cost}=grid;
    const size=cols*rows;
    const dist=new Float32Array(size).fill(Infinity);
    const parent=new Int32Array(size).fill(-1);

    const startIdx=nearestOpenCell(grid,targetNormX,targetNormY);
    if(startIdx<0)return null;

    dist[startIdx]=0;
    const heap=new MinHeap();
    heap.push(startIdx,0);

    const dirs=[
      [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
      [1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414]
    ];

    while(heap.length>0){
      const curr=heap.pop();
      if(curr<0)break;
      const currDist=dist[curr];
      const cx=curr%cols,cy=(curr/cols)|0;

      for(let i=0;i<8;i++){
        const nx=cx+dirs[i][0],ny=cy+dirs[i][1],weight=dirs[i][2];
        if(nx<0||nx>=cols||ny<0||ny>=rows)continue;
        const nIdx=ny*cols+nx;
        if(grid.isWall[nIdx])continue;
        // Prevent diagonal steps through the corner of two touching walls.
        if(dirs[i][0]&&dirs[i][1]&&(grid.isWall[cy*cols+nx]||grid.isWall[ny*cols+cx]))continue;
        const alt=currDist+weight*cost[nIdx];
        if(alt<dist[nIdx]){
          dist[nIdx]=alt;
          parent[nIdx]=curr;
          heap.push(nIdx,alt);
        }
      }
    }

    return {cols,rows,dist,parent,isWall,targetNormX,targetNormY,startIdx};
  }

  function routeDeviceToRack(tree,devNormX,devNormY,isWall){
    const {cols,rows,parent,startIdx,targetNormX,targetNormY}=tree;
    const devIdx=nearestOpenCell(tree,devNormX,devNormY);
    if(devIdx<0)return null;

    // Check direct line of sight first
    if(hasLineOfSight(devNormX,devNormY,targetNormX,targetNormY,isWall,cols,rows)){
      return [{x:devNormX,y:devNormY},{x:targetNormX,y:targetNormY}];
    }

    // Follow parent pointers towards rack
    const rawPath=[{x:devNormX,y:devNormY}];
    let curr=devIdx;
    let guard=0;
    while(curr!==-1&&curr!==startIdx&&guard++<cols*rows){
      const gx=curr%cols,gy=(curr/cols)|0;
      rawPath.push({x:gx/(cols-1),y:gy/(rows-1)});
      curr=parent[curr];
    }
    rawPath.push({x:targetNormX,y:targetNormY});

    // Simplify path using line-of-sight shortcutting
    if(rawPath.length<=2)return rawPath;
    const simplified=[rawPath[0]];
    let curIdx=0;
    while(curIdx<rawPath.length-1){
      let furthest=curIdx+1;
      for(let j=rawPath.length-1;j>curIdx+1;j--){
        if(hasLineOfSight(rawPath[curIdx].x,rawPath[curIdx].y,rawPath[j].x,rawPath[j].y,isWall,cols,rows)){
          furthest=j;
          break;
        }
      }
      simplified.push(rawPath[furthest]);
      curIdx=furthest;
    }

    return simplified;
  }

  function formatSvgPoints(points){
    return points.map(p=>`${(p.x*100).toFixed(2)},${(p.y*100).toFixed(2)}`).join(' ');
  }

  const api={createCollisionGrid,hasLineOfSight,computeShortestPathTree,routeDeviceToRack,formatSvgPoints};
  if(typeof module==='object')module.exports=api;
  else root.RackMapRouting=api;
})(globalThis);
