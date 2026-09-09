'use strict';
(function(root){
  const messages=typeof module==='object'?require('./locales'):root.RackMessages;
  const languages=['hy','en','ru'],locales={hy:'hy-AM',en:'en-US',ru:'ru-RU'};
  let language='hy';
  try{const saved=root.localStorage?.getItem('rackmap-language');if(languages.includes(saved))language=saved;}catch{}
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(Object.keys(messages).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
  function translate(text,lang=language){
    if(typeof text!=='string'||lang==='hy'||!languages.includes(lang))return text;
    return text.replace(pattern,key=>messages[key][lang==='en'?0:1]);
  }
  // Only source template segments are translated. Interpolated user data stays intact.
  function translator(lang){return function(text,...values){return Array.isArray(text)?text.reduce((out,part,i)=>out+translate(part,lang)+(i<values.length?values[i]:''),''):translate(text,lang);};}
  function t(text,...values){return translator(language)(text,...values);}
  const shell=[];
  function updateShell(){
    if(!root.document)return;
    document.documentElement.lang=language;
    for(const item of shell){if(item.node.isConnected){if(item.attr)item.node.setAttribute(item.attr,t(item.source));else item.node.nodeValue=t(item.source);}}
    document.querySelectorAll('[data-language]').forEach(select=>{select.value=language;select.setAttribute('aria-label',t('Լեզու'));});
  }
  function setLanguage(value){
    if(!languages.includes(value))return false;
    language=value;try{root.localStorage?.setItem('rackmap-language',value);}catch{}
    updateShell();return true;
  }
  if(root.document){
    const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement.closest('script,style')&&/[\u0531-\u0587]/.test(node.nodeValue))shell.push({node,source:node.nodeValue});}
    document.querySelectorAll('[title],[aria-label],[placeholder],meta[content]').forEach(node=>{for(const attr of ['title','aria-label','placeholder','content']){const source=node.getAttribute(attr);if(source&&/[\u0531-\u0587]/.test(source))shell.push({node,attr,source});}});
    updateShell();
  }
  const api={t,translate,forLanguage:translator,setLanguage,languages,get language(){return language;},get locale(){return locales[language];}};
  if(typeof module==='object')module.exports=api;else root.RackI18n=api;
})(globalThis);
