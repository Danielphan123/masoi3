'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const content=require('../content.seed.json');const {ROLE_META,SPECIAL_ROLES}=require('../roles');
const {roomView}=require('../game');
function bootApp(){
 const noop=()=>{};const el={innerHTML:'',scrollTop:0,scrollHeight:200,focus:noop,classList:{add:noop,remove:noop,toggle:noop},style:{setProperty:noop}};
 const fakeDocument={querySelector:()=>el,addEventListener:noop,activeElement:null};
 const ctx={document:fakeDocument,window:{scrollTo:noop},navigator:{clipboard:{writeText:noop}},console,
  localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},setInterval:noop,setTimeout:noop,clearTimeout:noop,EventSource:function(){},
  fetch:()=>new Promise(()=>{}),alert:noop,confirm:()=>true};
 vm.createContext(ctx);const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
 vm.runInContext(source+'\n;globalThis.TEST_API={s,landing,dashboard,lobby,gamePage,modal,render,showToast};',ctx);
 const api=ctx.TEST_API;api.s.content=JSON.parse(JSON.stringify(content));api.s.roles=ROLE_META;api.s.specialRoles=SPECIAL_ROLES;
 return api;
}
function setupRoom(app,phase='lobby'){
 const ps=['wolf','seer','guard','villager','witch'].map((r,i)=>({id:'p'+i,name:'Bạn '+i,avatar:null,role:r,alive:true,ready:true,spectate:false,privateInfo:[],used:{},cannotVote:false}));
 const r={code:'WOLF99',name:'Đêm trăng K65',hostId:'p0',capacity:16,players:ps,phase,round:1,deadline:Date.now()+60000,
  enabledRoles:SPECIAL_ROLES,nightSeconds:90,daySeconds:150,voteSeconds:90,actions:{},votes:{},lovers:[],silenced:[],voteBonus:{},messages:[],winner:null};
 app.s.viewer={id:'p0',name:'Bạn 0',avatar:null,guest:false,admin:true};app.s.room=roomView(r,'p0',content);
 return {ps,r};
}
test('landing renders sign-in and the role teaser without runtime errors',()=>{
 const app=bootApp();const html=app.landing();
 assert.match(html,/TRONG LỚP MÌNH, AI LÀ SÓI/);
 assert.match(html,/Đăng nhập/);
 assert.match(html,/Ma Sói/);
});
test('dashboard renders 3 panels for registered player',()=>{
 const app=bootApp();app.s.viewer={id:'p0',name:'Bạn 0',guest:false,admin:true};
 const html=app.dashboard();assert.match(html,/Tạo phòng mới/);assert.match(html,/Tham gia phòng/);assert.match(html,/Ảnh đại diện/);
});
test('lobby renders friends, room code and real-time chat panel',()=>{
 const app=bootApp();setupRoom(app);
 const html=app.lobby();assert.match(html,/WOLF99/);assert.match(html,/Bạn 4/);assert.match(html,/BẮT ĐẦU VÁN/);
});
test('game renders night, day, vote and final screens',()=>{
 const app=bootApp();const {r}=setupRoom(app,'night');
 for(const phase of ['night','day','vote','ended']){
  r.phase=phase;if(phase==='ended'){r.winner='Phe Sói 🐺';r.deadline=null;}
  app.s.room=roomView(r,'p0',content);
  const html=app.gamePage();assert.match(html,/BÀN TRÒN THẢO LUẬN/);
  assert.match(html,/LÁ BÀI BÍ MẬT CỦA BẠN/);
 }
});
test('all three admin, roles and settings modals render',()=>{
 const app=bootApp();setupRoom(app);
 for(const modal of ['admin','roles','settings','rules']){
  app.s.modal=modal;const html=app.modal();assert.ok(html.length>300,modal);
 }
});
