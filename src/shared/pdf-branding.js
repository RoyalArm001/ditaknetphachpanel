(function(root,factory){
  if(typeof module==='object')module.exports=factory(()=>require('node:fs').readFileSync(require('node:path').join(__dirname,'../../assets/branding/smart-tech.png')));
  else root.RackPdfBranding=factory(async()=>{
    const response=await fetch('/assets/smart-tech.png');
    if(!response.ok)throw new Error('PDF logo could not be loaded');
    return response.arrayBuffer();
  });
})(globalThis,function(readLogo){
  'use strict';
  const director='Տնօրեն Վ․ Խաչատրայան',specialist='ՏՏ Սիփան Դանիելյան';
  const bottomMargin=76;
  let logoPromise;
  function loadLogo(){
    if(!logoPromise)logoPromise=Promise.resolve().then(readLogo).catch(error=>{logoPromise=null;throw error;});
    return logoPromise;
  }
  function contentBottom(pdf){return pdf.page.height-bottomMargin;}
  // All exporters reserve this area before laying out content and stamp buffered pages once.
  function stamp(pdf,logo,{font='Project',date=new Date(),margin=32,showItSpecialist=false}={}){
    const attribution=director+(showItSpecialist===true?' / '+specialist:'');
    const range=pdf.bufferedPageRange(),logoImage=pdf.openImage(logo);
    for(let i=0;i<range.count;i++){
      pdf.switchToPage(range.start+i);
      const oldBottom=pdf.page.margins.bottom,top=pdf.page.height-66,right=pdf.page.width-margin,left=margin+78;
      // Footer text must not make PDFKit create another page below the content margin.
      pdf.page.margins.bottom=0;
      pdf.save();
      pdf.moveTo(margin,top).lineTo(right,top).lineWidth(.7).strokeColor('#d8e4e2').stroke();
      pdf.image(logoImage,margin,top+8,{fit:[64,40],align:'center',valign:'center'});
      pdf.font(font).fontSize(9).fillColor('#173e43').text(attribution,left,top+13,{width:right-left,height:16,lineBreak:false});
      pdf.fontSize(7.5).fillColor('#597176').text('My Patch · '+date.toISOString().slice(0,10),left,top+33,{width:right-left-60,height:14,lineBreak:false});
      pdf.text((i+1)+' / '+range.count,right-54,top+33,{width:54,height:14,align:'right',lineBreak:false});
      pdf.restore();
      pdf.page.margins.bottom=oldBottom;
    }
  }
  return {loadLogo,stamp,contentBottom,bottomMargin};
});
