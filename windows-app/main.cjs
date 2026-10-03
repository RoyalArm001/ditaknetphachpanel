'use strict';
const {app,BrowserWindow,Menu,shell,dialog,session}=require('electron');
const path=require('node:path');
const SITE='https://patch.ditaknet.com';
const preview=app.commandLine.hasSwitch('hidden-preview');
if(preview)app.setPath('userData',path.join(app.getPath('temp'),'MyPatch-preview-'+process.pid));
let mainWindow;
const trusted=url=>{try{return new URL(url).origin===SITE;}catch{return false;}};
function external(url){try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol))void shell.openExternal(parsed.href);}catch{}}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.setAppUserModelId('com.ditaknet.mypatch.windows');
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
  app.whenReady().then(()=>{
    // The cloud UI never receives Node, filesystem, or IPC access.
    const profile=session.fromPartition('persist:mypatch-workspace');
    profile.setPermissionCheckHandler((_contents,permission,origin)=>trusted(origin)&&['persistent-storage','clipboard-sanitized-write','fullscreen'].includes(permission));
    profile.setPermissionRequestHandler((contents,permission,callback)=>{
      if(!trusted(contents.getURL()))return callback(false);
      if(['persistent-storage','clipboard-sanitized-write','fullscreen'].includes(permission))return callback(true);
      callback(false);
    });
    app.on('web-contents-created',(_event,contents)=>{
      contents.on('will-attach-webview',event=>event.preventDefault());
      contents.on('will-navigate',(event,url)=>{if(!trusted(url)){event.preventDefault();external(url);}});
      contents.setWindowOpenHandler(({url})=>{
        if(trusted(url))return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'persist:mypatch-workspace'}}};
        external(url);return {action:'deny'};
      });
    });
    mainWindow=new BrowserWindow({width:1440,height:960,minWidth:800,minHeight:600,title:'My Patch',icon:path.join(__dirname,'icon.ico'),backgroundColor:'#10282e',show:false,webPreferences:{partition:'persist:mypatch-workspace',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
    mainWindow.once('ready-to-show',()=>{if(!preview)mainWindow.show();});
    mainWindow.on('closed',()=>{mainWindow=null;});
    mainWindow.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{if(isMainFrame&&code!==-3&&trusted(url))void mainWindow.loadFile('offline.html');});
    mainWindow.webContents.on('will-prevent-unload',async event=>{
      const result=dialog.showMessageBoxSync(mainWindow,{type:'question',message:'Պահե՞լ բացված աշխատանքը։ / Keep your current work?',detail:'Փակելու դեպքում չպահված փոփոխությունները կարող են կորչել։ / Unsaved changes may be lost if you close.',buttons:['Մնալ / Stay','Փակել / Close'],defaultId:0,cancelId:0});
      if(result===1)event.preventDefault();
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'My Patch',submenu:[{label:'Թարմացումների ստուգում / Check updates',click:()=>{if(mainWindow&&trusted(mainWindow.webContents.getURL()))void mainWindow.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");}},{type:'separator'},{role:'quit',label:'Ելք / Exit'}]},
      {label:'Խմբագրել / Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'Դիտում / View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
      {label:'Օգնություն / Help',submenu:[{label:'My Patch '+app.getVersion(),click:()=>dialog.showMessageBox(mainWindow,{type:'info',message:'My Patch · Windows',detail:'Windows '+app.getVersion()+'\n'+SITE+'\n\nՖունկցիոնալ թարմացումները գալիս են կայքից։\nFeature updates are delivered from the website.'})}]}
    ]));
    void mainWindow.loadURL(SITE).catch(()=>{});
  });
  app.on('window-all-closed',()=>app.quit());
}
