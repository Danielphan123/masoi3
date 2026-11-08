'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const game=require('../game');
const {SPECIAL_ROLES,ROLE_META}=require('../roles');
function mock(roles){
 const players=roles.map((role,i)=>({id:`p${i}`,name:`Người ${i}`,role,alive:true,ready:true,spectate:false,used:{},privateInfo:[],lastGuard:null,foxDisabled:false,cannotVote:false,hunterTarget:null}));
 return {code:'TEST01',name:'Test',hostId:'p0',players,capacity:24,enabledRoles:SPECIAL_ROLES,phase:'night',round:1,nightSeconds:90,daySeconds:150,voteSeconds:90,deadline:Date.now()+90000,actions:{},votes:{},messages:[],silenced:[],voteBonus:{},lovers:[],wolfBonus:false,wolfBonusNext:false,winner:null};
}
test('16 special roles, all in a 24-player deck, and balanced wolves',()=>{
 assert.equal(SPECIAL_ROLES.length,16);
 for(let n=5;n<=60;n++){
  const deck=game.makeDeck(n,SPECIAL_ROLES);assert.equal(deck.length,n);
  assert.ok(deck.some(k=>k==='wolf'));
  const wolves=deck.filter(r=>ROLE_META[r].faction==='wolf');assert.equal(wolves.length,Math.max(1,Math.floor(n/4)));
 }
 const deck=game.makeDeck(24,SPECIAL_ROLES);for(const k of SPECIAL_ROLES)assert.ok(deck.includes(k),k);
});
test('role privacy does not leak living players roles',()=>{
 const r=mock(['wolf','seer','villager','guard','witch']);
 const a=game.roomView(r,'p1',{});
 assert.equal(a.currentPlayer.role,'seer');
 assert.ok(a.players.every(p=>p.role===null));
 assert.equal(a.currentPlayer.wolfMates.length,0);
});
test('seer can inspect faction, guard protects victim',()=>{
 const r=mock(['wolf','seer','guard','villager','villager']);
 game.submitAction(r,r.players[0],'kill',['p3']);
 game.submitAction(r,r.players[1],'seer',['p0']);
 game.submitAction(r,r.players[2],'guard',['p3']);
 assert.match(r.players[1].privateInfo[0],/PHE SÓI/);
 game.advance(r);
 assert.equal(r.phase,'day');assert.equal(r.players[3].alive,true);
});
test('witch protection and poison are one-time abilities',()=>{
 const r=mock(['wolf','witch','villager','villager','villager']);
 game.submitAction(r,r.players[0],'kill',['p2']);
 game.submitAction(r,r.players[1],'witch_save',['p2']);
 game.submitAction(r,r.players[1],'witch_poison',['p3']);
 game.advance(r);
 assert.equal(r.players[2].alive,true);assert.equal(r.players[3].alive,false);
 assert.equal(r.players[1].used.witch_save,true);assert.equal(r.players[1].used.witch_poison,true);
 r.phase='night';r.round++;
 const actions=game.roomView(r,'p1',{}).currentPlayer.actions;
 assert.equal(actions.length,0);
});
test('lovers die together, hunter revenge works',()=>{
 const r=mock(['wolf','cupid','hunter','villager','villager','villager']);
 game.submitAction(r,r.players[1],'cupid',['p2','p3']);
 game.submitAction(r,r.players[2],'hunter',['p5']);
 game.submitAction(r,r.players[0],'kill',['p2']);
 game.advance(r);
 assert.equal(r.players[2].alive,false,'hunter killed');
 assert.equal(r.players[3].alive,false,'lover killed');
 assert.equal(r.players[5].alive,false,'hunter revenge');
});
test('idiot survives first village vote and loses vote',()=>{
 const r=mock(['wolf','idiot','villager','villager','villager']);r.phase='vote';
 for(const id of ['p0','p2','p3','p4'])r.votes[id]='p1';
 game.advance(r);
 assert.equal(r.players[1].alive,true);assert.equal(r.players[1].cannotVote,true);assert.equal(r.players[1].revealed,true);
 assert.equal(r.phase,'night');
 r.phase='vote';assert.throws(()=>game.castVote(r,r.players[1],'p0'),/không có quyền/);
});
test('prince survives first elimination and is revealed',()=>{
 const r=mock(['wolf','prince','villager','villager','villager']);r.phase='vote';
 for(const id of ['p0','p2','p3','p4'])r.votes[id]='p1';
 game.advance(r);assert.equal(r.players[1].alive,true);assert.equal(r.players[1].revealed,true);
});
test('raven grants two extra votes',()=>{
 const r=mock(['wolf','raven','villager','villager','villager']);
 game.submitAction(r,r.players[1],'raven',['p3']);game.advance(r);
 assert.equal(r.voteBonus['p3'],2);
 game.advance(r);assert.equal(r.phase,'vote');
 game.castVote(r,r.players[0],'p2');game.castVote(r,r.players[1],'p2');game.castVote(r,r.players[4],'p3');
 game.advance(r);assert.equal(r.players[3].alive,false,'extra two votes defeated p2');
});
test('wolf cub dying during vote gives wolves an extra kill next night',()=>{
 const r=mock(['wolf','wolf_cub','villager','villager','villager','villager','villager','villager']);r.phase='vote';
 for(const id of ['p0','p2','p3','p4','p5','p6','p7'])r.votes[id]='p1';
 game.advance(r);assert.equal(r.phase,'night');assert.equal(r.wolfBonus,true);
 const choices=game.roomView(r,'p0',{}).currentPlayer.actions.map(a=>a.id);
 assert.ok(choices.includes('kill2'));
});
test('fox loses skill when neighboring 3 contain no wolf',()=>{
 const r=mock(['wolf','villager','fox','villager','villager','villager']);
 game.submitAction(r,r.players[2],'fox',['p4']);
 assert.equal(r.players[2].foxDisabled,true);
 assert.equal(game.roomView(r,'p2',{}).currentPlayer.actions.length,0);
});
test('white wolf has a single-use assassination of another wolf',()=>{
 const r=mock(['wolf','white_wolf','villager','villager','villager']);
 game.submitAction(r,r.players[1],'whitewolf',['p0']);
 game.advance(r);assert.equal(r.players[0].alive,false);assert.equal(r.players[1].used.whitewolf,true);
});
