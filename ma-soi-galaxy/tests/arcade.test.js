'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const chess=require('../chess-engine');const {sow,caroMove,oanMove}=require('../arcade');

test('chess starts with 20 legal moves, correct king and queen squares',()=>{
 const s=chess.init(),v=chess.view(s);assert.equal(chess.legal(s).length,20);assert.equal(v[59],'Q');assert.equal(v[60],'K');assert.equal(v[3],'q');assert.equal(v[4],'k');
});
test('chess rejects illegal moves and detects Fool’s mate',()=>{
 const hist=[chess.init()];assert.throws(()=>chess.move(hist,'e2e5'),/không hợp lệ/);
 for(const u of ['f2f3','e7e5','g2g4','d8h4'])hist.push(chess.move(hist,u).state);
 const status=chess.status(hist);assert.equal(status.ended,true);assert.equal(status.winner,-1);assert.match(status.reason,/Chiếu hết/);
});
test('chess supports castling, en passant and four promotion choices',()=>{
 const seq=['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','e1g1'];let h=[chess.init()];for(const m of seq)h.push(chess.move(h,m).state);
 assert.equal(chess.view(h.at(-1))[62],'K');assert.equal(chess.view(h.at(-1))[61],'R');
 let ep=[chess.init()];for(const u of ['e2e4','a7a6','e4e5','d7d5','e5d6'])ep.push(chess.move(ep,u).state);
 assert.equal(chess.view(ep.at(-1))[19],'P');assert.equal(chess.view(ep.at(-1))[27],'.');
 const custom=chess.init();custom.b.fill('.');custom.b[4]='k';custom.b[116]='K';custom.b[16]='P';custom.t=1;custom.c=0;
 const promotions=chess.legal(custom).filter(m=>chess.key(m).startsWith('a7a8')).map(chess.key).sort();assert.deepEqual(promotions,['a7a8b','a7a8n','a7a8q','a7a8r']);
});
test('caro detects 5-in-a-row and rejects occupied cells',()=>{
 const room={type:'caro',board:Array(225).fill(''),phase:'active',turn:0,moveLog:[],moveNumber:0,players:[],last:null};
 for(let col=0;col<5;col++)caroMove(room,0,{index:3*15+col});assert.equal(room.phase,'ended');assert.equal(room.winner,0);assert.throws(()=>caroMove(room,1,{index:3*15}),/Ô cờ/);
});
test('ô ăn quan sowing conserves stones, and side ownership enforced',()=>{
 const start=Array.from({length:12},(_,i)=>i===5||i===11?10:5);const out=sow(start,6,1);assert.equal(out.board.reduce((a,b)=>a+b,0)+out.score,70);
 const room={type:'oanquan',phase:'active',board:start.slice(),score:[0,0],moveLog:[],moveNumber:0,turn:0,players:[{name:'A'},{name:'B'}]};
 assert.throws(()=>oanMove(room,0,{index:0,direction:1}),/thuộc phía/);oanMove(room,0,{index:6,direction:1});assert.equal(room.turn,1);assert.equal(room.board.reduce((a,b)=>a+b,0)+room.score.reduce((a,b)=>a+b,0),70);
});
