'use strict';
// Excel is a portable backup container; the database remains transactional.
globalThis.ProjectFile=(()=>{
  let loading;
  async function excel(){
    if(globalThis.ExcelJS)return globalThis.ExcelJS;
    if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/exceljs.min.js';script.onload=()=>resolve(globalThis.ExcelJS);script.onerror=()=>{loading=null;script.remove();reject(new Error('Excel could not be loaded. Please try again.'));};document.head.append(script);});
    return loading;
  }
  async function encode(data,tr=x=>x){
    const Excel=await excel(),book=new Excel.Workbook(),state=data.state;
    const overview=book.addWorksheet('Project');
    overview.addRows([['My Patch',state.company],[tr('Հարկեր'),state.floors.length],[tr('Վերականգնում'),tr('Աղյուսակը դիտելու համար է։ Վերականգնումն օգտագործում է ֆայլում պահված ամբողջական պատճենը։')]]);
    overview.columns=[{width:24},{width:100}];
    const sheet=book.addWorksheet('Connections');
    const fields=['floor','rack','device','port','status','cable','destination','room','door','side','connection','service','vlan','notes'];
    sheet.addRow(fields.map(k=>k));
    for(const row of RackDomain.rows(state))sheet.addRow(fields.map(k=>k==='status'?RackDomain.statusLabel(state,row[k],tr):k==='service'?RackDomain.serviceLabel(state,row[k],tr):row[k]));
    sheet.columns.forEach(c=>c.width=24);sheet.views=[{state:'frozen',ySplit:1}];
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF167D8D'}};
    const recovery=book.addWorksheet('MyPatch Recovery');recovery.state='veryHidden';
    recovery.addRow(['mypatch-backup',1]);const text=JSON.stringify(data);
    for(let at=0;at<text.length;){let end=Math.min(at+16000,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;recovery.addRow([text.slice(at,end)]);at=end;}
    return book.xlsx.writeBuffer();
  }
  async function decode(file){
    const Excel=await excel(),book=new Excel.Workbook();await book.xlsx.load(await file.arrayBuffer());
    const sheet=book.getWorksheet('MyPatch Recovery');
    if(!sheet||sheet.getCell('A1').value!=='mypatch-backup'||sheet.getCell('B1').value!==1)throw new Error('This Excel file is not a My Patch backup.');
    const parts=[];let size=0;
    for(let row=2;row<=sheet.rowCount;row++){const value=sheet.getCell(row,1).value;if(typeof value!=='string'||(size+=value.length)>24*1024*1024)throw new Error('Invalid My Patch backup.');parts.push(value);}
    return JSON.parse(parts.join(''));
  }
  return {encode,decode};
})();
