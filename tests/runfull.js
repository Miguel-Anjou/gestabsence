const { JSDOM } = require(require('path').resolve('node_modules/jsdom'));
const fs=require('fs'),vm=require('vm');
const dom=new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>',{runScripts:"outside-only",pretendToBeVisual:true,url:"https://x.github.io/g/"});
const {window}=dom;

// Données simulées renvoyées par Supabase REST
const USERS=[
  {id:"u0",name:"Admin RH",email:"admin",password:"x",role:"admin",department:"Chef d'équipe",avatar:"AR",solde_conges:25,solde_rtt:10,solde_heures:0,horaire:{L:7,M:7,Me:7,J:7,V:7,S:0,D:0},managed_depts:[],managed_user_ids:[],archived:false},
  {id:"u3",name:"Jean Vendeur",email:"jean.vendeur",password:"x",role:"employee",department:"Vente",avatar:"JV",solde_conges:20,solde_rtt:8,solde_heures:3,horaire:{L:7,M:7,Me:7,J:7,V:7,S:0,D:0},managed_depts:[],managed_user_ids:[],archived:false},
];
const REQS=[{id:"r1",user_id:"u3",type:"conge",start_date:"2026-06-10",end_date:"2026-06-12",days:3,status:"pending",reason:"x",comment:"",created_at:"2026-06-01"}];

// Mock fetch qui route selon l'URL
function mockFetch(url, opts){
  const u=String(url);
  let body=[];
  if(u.includes("/users")) body=USERS;
  else if(u.includes("/requests")) body=REQS;
  else if(u.includes("login_user")) body=[USERS[0]]; // login admin OK
  else if(u.includes("/overtime")||u.includes("/closures")||u.includes("/notifications")||u.includes("/settings")) body=[];
  return Promise.resolve({ ok:true, status:200, headers:{get:()=>"application/json"},
    json:()=>Promise.resolve(body), text:()=>Promise.resolve(JSON.stringify(body)) });
}
window.fetch=mockFetch; global.fetch=mockFetch;
window.Headers=function(){this.append=()=>{};this.get=()=>null;};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
window.scrollTo=()=>{};window.confirm=()=>true;window.alert=()=>{};window.WebSocket=function(){this.close=()=>{};this.send=()=>{};};

const errs=[];
const ctx=dom.getInternalVMContext();
ctx.fetch=mockFetch; ctx.WebSocket=window.WebSocket;
ctx.console={log:()=>{},warn:()=>{},error:(...a)=>{const s=a.map(x=>x&&x.stack?x.stack:String(x)).join(' ');if(s.match(/not defined|Cannot read|is not a function/))errs.push(s);},info:()=>{}};
try{ vm.runInContext(fs.readFileSync('/tmp/appfull.js','utf8'),ctx,{filename:'appfull.js'}); }catch(e){ console.log('INIT:',(e.stack||e.message).split('\n').slice(0,3).join('\n'));}

function click(t){const b=[...window.document.querySelectorAll('button')].find(x=>x.textContent.includes(t));if(b){b.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));return true;}return false;}
function setI(type,val){const i=[...window.document.querySelectorAll('input')].find(x=>x.type===type);if(i){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(i,val);i.dispatchEvent(new window.Event('input',{bubbles:true}));}}

setTimeout(()=>{
  setI('text','admin'); setI('password','admin123');
  click('Se connecter')||click('onnect');
  setTimeout(()=>{
    const root=window.document.getElementById('root');
    console.log('Après login admin:', root.innerHTML.length,'car.');
    ['Calendrier','Statistiques','Équipe','récupérables','Admin','Absences'].forEach(t=>{try{click(t);}catch(e){errs.push('['+t+'] '+e.message);}});
    setTimeout(()=>{
      const uniq=[...new Set(errs)];
      if(uniq.length){console.log('\n=== ERREURS ADMIN ===');uniq.slice(0,5).forEach(e=>console.log(e.split('\n').slice(0,5).join('\n'),'\n--'));}
      else console.log('✅ ADMIN : tous les onglets OK, aucun crash');
      process.exit(0);
    },1500);
  },1200);
},1000);
