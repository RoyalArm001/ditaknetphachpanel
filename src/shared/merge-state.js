'use strict';
(function(root){
  const missing=Symbol('missing');
  const equal=(a,b)=>a===b||(a!==missing&&b!==missing&&JSON.stringify(a)===JSON.stringify(b));
  function merge(base,local,remote){
    if(equal(local,base))return remote;
    if(equal(remote,base)||equal(local,remote))return local;
    if([base,local,remote].every(x=>x&&x!==missing&&typeof x==='object'&&!Array.isArray(x))){
      const result={};
      for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
        const get=x=>Object.hasOwn(x,key)?x[key]:missing;
        const value=merge(get(base),get(local),get(remote));
        if(value!==missing)Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
      }
      return result;
    }
    if([base,local,remote].every(Array.isArray)&&[...base,...local,...remote].every(x=>x&&typeof x.id==='string')){
      const maps=[base,local,remote].map(xs=>new Map(xs.map(x=>[x.id,x])));
      if(maps.some((map,i)=>map.size!==[base,local,remote][i].length))throw conflict();
      const result=[];
      for(const id of new Set([...remote.map(x=>x.id),...local.map(x=>x.id),...base.map(x=>x.id)])){
        const value=merge(...maps.map(map=>map.has(id)?map.get(id):missing));
        if(value!==missing)result.push(value);
      }
      return result;
    }
    throw conflict();
  }
  function conflict(){const error=new Error('Concurrent changes conflict');error.code=409;return error;}
  const api={merge};if(typeof module==='object')module.exports=api;else root.RackMerge=api;
})(globalThis);
