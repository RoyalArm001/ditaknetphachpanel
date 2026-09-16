'use strict';
globalThis.RackLive={connect(url,onSnapshot,onStatus){
  if(!globalThis.EventSource){onStatus(false);return {close(){}};}
  const source=new EventSource(url);
  source.onopen=()=>onStatus(true);
  source.onerror=()=>onStatus(false);
  source.onmessage=event=>{try{const data=JSON.parse(event.data);if(Array.isArray(data.companies)&&Number.isInteger(data.online))onSnapshot(data);}catch{onStatus(false);}};
  return {close(){source.close();}};
}};
