(function(root,factory){if(typeof module==='object')module.exports=factory();else root.RackMapMarkerGroups=factory();})(globalThis,function(){
  'use strict';
  // Work in rendered pixels: centers within 70% of the icon diameter share one SVG.
  // Every pair must be close, so a chain of sockets cannot join distant locations.
  function group(items,{width,height,diameter=20}={}){
    const groups=[],limit=Math.max(0,diameter)*.7;
    const distance=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
    for(const item of [...items].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
      let best=null,bestDistance=Infinity;
      for(const candidate of groups){
        if(candidate.kind!==item.kind||!candidate.members.every(other=>distance(item,other)<=limit+1e-7))continue;
        const d=distance(item,candidate);if(d<bestDistance){best=candidate;bestDistance=d;}
      }
      if(!best){groups.push({id:item.id,kind:item.kind,x:item.x,y:item.y,members:[item]});continue;}
      const count=best.members.length;best.x=(best.x*count+item.x)/(count+1);best.y=(best.y*count+item.y)/(count+1);best.members.push(item);
    }
    return groups;
  }
  function decorate(root,groups){
    const elements=new Map([...root.querySelectorAll('[data-map-marker]')].map(el=>[el.dataset.mapMarker,el]));
    for(const el of elements.values()){
      el.classList.remove('map-group-member','map-group-leader','group-selected');
      el.querySelector('.map-marker-count')?.remove();delete el.dataset.mapGroup;
    }
    for(const group of groups){
      const leader=elements.get(group.members[0].id);
      for(const [i,item] of group.members.entries()){
        const el=elements.get(item.id);if(!el)continue;
        el.style.left=group.x*100+'%';el.style.top=group.y*100+'%';
        if(group.members.length>1){el.classList.add(i?'map-group-member':'map-group-leader');el.dataset.mapGroup=group.id;}
        const anchorLine=root.querySelector('[data-map-line="'+CSS.escape(item.id)+'"]');
        if(anchorLine){anchorLine.setAttribute('x2',group.x*100);anchorLine.setAttribute('y2',group.y*100);}
      }
      if(leader&&group.members.length>1){
        const badge=root.ownerDocument.createElement('span');badge.className='map-marker-count';badge.textContent=group.members.length;badge.setAttribute('aria-hidden','true');leader.append(badge);
        leader.classList.toggle('group-selected',group.members.some(item=>elements.get(item.id)?.classList.contains('selected')));
      }
    }
  }
  return {group,decorate};
});
