'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const chess=require('./chess-engine');
const TYPES=['gold','bubble','oanquan','chess','caro'];
const ONLINE=['oanquan','chess','caro'];
const rooms=new Map(),clients=new Set(),lobbyChat=[];
const soloSessions=new Map(),lastMessage=new Map();
const SCORES_FILE=path.join(process.env.DATA_DIR||path.join(__dirname,'data'),'arcade-scores.json');
let records=[];try{records=JSON.parse(fs.readFileSync(SCORES_FILE,'utf8'));if(!Array.isArray(records))records=[];}catch{}
const now=()=>new Date().toISOString();
const err=(message,code=400)=>Object.assign(new Error(message),{code});
function persist(){fs.mkdirSync(path.dirname(SCORES_FILE),{recursive:true});const file=SCORES_FILE+'.tmp';fs.writeFileSync(file,JSON.stringify(records,null,2));fs.renameSync(file,SCORES_FILE);}
const stamp=()=>crypto.randomUUID();
const sanitize=s=>String(s||'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,400);
function scoreboard(){return TYPES.map(type=>({type,entries:records.filter(x=>x.type===type).sort((a,b)=>b.score-a.score).slice(0,10)}));}
function summaries(){return [...rooms.values()].map(r=>({code:r.code,name:r.name,type:r.type,people:r.players.length,watching:r.spectators.length,phase:r.phase,at:r.at})).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,70);}
function send(res,event,data){try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{}}
function publicLobby(){return {rooms:summaries(),chat:lobbyChat.slice(-100),scoreboard:scoreboard(),online:clients.size};}
function broadcastLobby(){const data=publicLobby();for(const client of clients)send(client.res,'lobby',data);}
function view(r,id){const player=r.players.find(p=>p.id===id),observe=r.spectators.find(p=>p.id===id),participant=player||observe;
if(!participant)return null;return {code:r.code,name:r.name,type:r.type,phase:r.phase,hostId:r.hostId,players:r.players.map(({id,name,avatar})=>({id,name,avatar})),spectators:r.spectators.map(({id,name,avatar})=>({id,name,avatar})),you:{id,side:player?r.players.indexOf(player):null,spectator:!player},turn:r.turn,board:r.type==='chess'?chess.view(r.history.at(-1)):r.board,moveNumber:r.moveNumber,moveLog:r.moveLog.slice(-36),last:r.last,winner:r.winner,reason:r.reason,score:r.type==='oanquan'?r.score:null,chat:r.chat.slice(-160),legal:r.type==='chess'&&r.phase==='active'&&player&&r.players.indexOf(player)===r.turn?chess.legal(r.history.at(-1)).map(chess.key):[],statusText:r.type==='chess'&&r.phase==='active'&&chess.checked(r.history.at(-1))?'Chiếu tướng!':'',updatedAt:r.updatedAt};}
function broadcastRoom(r){for(const c of clients)if(c.room===r.code)send(c.res,'room',view(r,c.id));broadcastLobby();}
function record(type,id,name,score){const existing=records.find(r=>r.type===type&&r.id===id);if(existing){if(score>existing.score){existing.score=score;existing.name=name;existing.at=now();}}else records.push({type,id,name,score,at:now()});if(records.length>5000)records=records.slice(-5000);persist();}
function endGame(r,winner,reason){if(r.phase==='ended')return;r.phase='ended';r.winner=winner;r.reason=reason;if(winner!==null&&winner!==undefined&&r.players[winner])record(r.type,r.players[winner].id,r.players[winner].name,1+(records.find(x=>x.type===r.type&&x.id===r.players[winner].id)?.score||0));}
function createBoard(r){r.phase=r.players.length===2?'active':'waiting';r.turn=0;r.moveNumber=0;r.moveLog=[];r.last=null;r.winner=null;r.reason='';r.history=[];r.score=[0,0];
if(r.type==='caro')r.board=Array(225).fill('');
if(r.type==='chess'){r.history=[chess.init()];r.board=null;}
if(r.type==='oanquan')r.board=Array.from({length:12},(_,i)=>i===5||i===11?10:5);
r.updatedAt=now();}
function validateRoom(r,s,ctx){if(!r)throw err('Không tìm thấy phòng mini game.',404);const id=ctx.uid(s);if(!r.players.some(p=>p.id===id)&&!r.spectators.some(p=>p.id===id))throw err('Bạn chưa tham gia phòng này.',403);return id;}
function getRoom(b){return rooms.get(String(b.code||'').trim().toUpperCase());}
function removeMember(r,id){let index=r.players.findIndex(p=>p.id===id);if(index>=0){const forfait=r.phase==='active'&&r.players.length===2;if(forfait)endGame(r,1-index,'Đối thủ đã rời phòng.');r.players.splice(index,1);if(forfait)r.winner=0;else if(r.phase==='ended'&&r.winner!==null){if(r.winner===index)r.winner=null;else if(r.winner>index)r.winner--;}}
else r.spectators=r.spectators.filter(p=>p.id!==id);
if(r.hostId===id)r.hostId=r.players[0]?.id||r.spectators[0]?.id||null;
if(!r.players.length&&!r.spectators.length)rooms.delete(r.code);else broadcastRoom(r);broadcastLobby();}
function leaveAll(id){for(const r of [...rooms.values()])if(r.players.some(p=>p.id===id)||r.spectators.some(p=>p.id===id))removeMember(r,id);}
function makeCode(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(c));return c;}
function countDir(b,r,c,dx,dy,who){let n=0;for(let y=r+dy,x=c+dx;y>=0&&y<15&&x>=0&&x<15&&b[y*15+x]===who;y+=dy,x+=dx)n++;return n;}
function caroMove(r,side,b){const i=Number(b.index);if(!Number.isInteger(i)||i<0||i>=225||r.board[i]!=='')throw err('Ô cờ không hợp lệ hoặc đã có quân.');
const mark=side===0?'X':'O';r.board[i]=mark;r.last=i;r.moveNumber++;r.moveLog.push(`${r.moveNumber}. ${mark}: ${String.fromCharCode(65+i%15)}${Math.floor(i/15)+1}`);
const y=Math.floor(i/15),x=i%15;let win=false;for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]])if(1+countDir(r.board,y,x,dx,dy,mark)+countDir(r.board,y,x,-dx,-dy,mark)>=5)win=true;
if(win)endGame(r,side,`Năm quân liên tiếp — ${mark} thắng!`);else if(r.moveNumber===225)endGame(r,null,'Hòa — hết ô trống.');else r.turn=1-r.turn;}
function sow(b,start,dir){let board=b.slice();let hand=board[start],steps=0,t=(start+dir+12)%12,extra=0;board[start]=0;
while(steps++<400){while(hand>0){board[t]++;hand--;t=(t+dir+12)%12;if(++steps>400)throw err('Nước đi quá dài, hãy thử ô khác.');}
// t points at next pit after the last distribution
if((t===5||t===11)&&board[t]>0)break;
if(board[t]===0){let captured=false;while(board[t]===0){const next=(t+dir+12)%12;if(board[next]===0)break;extra+=board[next];board[next]=0;captured=true;t=(next+dir+12)%12;
if(board[t]!==0)break;}if(!captured||board[t]!==0)break;continue;}
if(t===5||t===11)break;
hand=board[t];board[t]=0;t=(t+dir+12)%12;
}
return {board,score:extra};}
function oanMove(r,side,b){const index=Number(b.index),dir=Number(b.direction);
if(!Number.isInteger(index)||(side===0?(index<6||index>10):(index<0||index>4))||r.board[index]<=0||![-1,1].includes(dir))throw err('Hãy chọn ô quân thuộc phía mình còn sỏi, và chiều rải hợp lệ.');
const result=sow(r.board,index,dir);r.board=result.board;r.score[side]+=result.score;r.moveNumber++;r.last=index;
r.moveLog.push(`${r.moveNumber}. ${side===0?'Nam':'Bắc'} ô ${index} ${dir===1?'→':'←'} +${result.score}`);
if(r.board[5]===0&&r.board[11]===0){for(let i=0;i<12;i++)if(i!==5&&i!==11){r.score[i<=4?1:0]+=r.board[i];r.board[i]=0;}endGame(r,r.score[0]===r.score[1]?null:r.score[0]>r.score[1]?0:1,`Kết thúc: Nam ${r.score[0]} - Bắc ${r.score[1]}.`);return;}
r.turn=1-side;
const own=r.turn===0?[6,7,8,9,10]:[0,1,2,3,4];if(own.every(i=>r.board[i]===0)){
if(r.score[r.turn]>=5){r.score[r.turn]-=5;for(const i of own)r.board[i]=1;r.moveLog.push('Đã dùng 5 điểm rải lại quân.');}
else{for(let i=0;i<12;i++)if(i!==5&&i!==11){r.score[i<=4?1:0]+=r.board[i];r.board[i]=0;}endGame(r,r.score[0]===r.score[1]?null:r.score[0]>r.score[1]?0:1,'Không đủ quân để rải lại — tính điểm kết thúc.');}}
}
async function handle(req,res,url,ctx){const endpoint=url.pathname,session=ctx.getSession(req),id=session?ctx.uid(session):null,viewer=ctx.publicViewer(session);
if(req.method==='GET'&&endpoint==='/api/arcade/bootstrap')return ctx.json(res,{viewer,content:ctx.getContent(),lobby:publicLobby(),types:TYPES});
if(!session)throw err('Đăng nhập hoặc chọn chế độ khách để tham gia trò chơi.',401);
if(req.method==='GET'&&endpoint==='/api/arcade/room'){const r=rooms.get(String(url.searchParams.get('code')||'').toUpperCase());validateRoom(r,session,ctx);return ctx.json(res,{room:view(r,id)});}
if(req.method==='GET'&&endpoint==='/api/arcade/stream'){
const room=String(url.searchParams.get('code')||'').toUpperCase(),r=room?rooms.get(room):null;if(room)validateRoom(r,session,ctx);
res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': arcade connected\n\n');const c={res,id,room};clients.add(c);
send(res,'lobby',publicLobby());if(r)send(res,'room',view(r,id));req.on('close',()=>clients.delete(c));return;
}
if(req.method!=='POST')throw err('API không tồn tại.',404);
const b=await ctx.read(req);
if(endpoint==='/api/arcade/create'){const type=String(b.type||'');if(!ONLINE.includes(type))throw err('Chỉ các game đối kháng mới cần phòng.');const n=sanitize(b.name||'');if(n.length<2||n.length>48)throw err('Tên phòng cần 2–48 ký tự.');leaveAll(id);const code=makeCode();const r={code,type,name:n,players:[{id,name:viewer.name,avatar:viewer.avatar}],spectators:[],hostId:id,chat:[],at:now()};createBoard(r);rooms.set(code,r);broadcastLobby();return ctx.json(res,{room:view(r,id)});}
if(endpoint==='/api/arcade/join'){const r=getRoom(b);if(!r)throw err('Mã phòng không tồn tại.',404);const inRoom=r.players.some(p=>p.id===id)||r.spectators.some(p=>p.id===id);if(!inRoom){leaveAll(id);const person={id,name:viewer.name,avatar:viewer.avatar};if(!b.spectate&&r.players.length<2&&r.phase==='waiting'){r.players.push(person);if(r.players.length===2)r.phase='active';}
else {if(r.spectators.length>=40)throw err('Phòng đã đủ người xem.');r.spectators.push(person);}r.updatedAt=now();}
broadcastRoom(r);return ctx.json(res,{room:view(r,id)});}
if(endpoint==='/api/arcade/leave'){const r=getRoom(b);validateRoom(r,session,ctx);removeMember(r,id);return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/move'){const r=getRoom(b);validateRoom(r,session,ctx);const side=r.players.findIndex(p=>p.id===id);if(side<0)throw err('Người xem không thể đánh cờ.',403);if(r.phase!=='active')throw err('Phòng chưa đủ hai người hoặc ván đã kết thúc.');if(side!==r.turn)throw err('Chưa đến lượt bạn.');
if(r.type==='caro')caroMove(r,side,b);else if(r.type==='oanquan')oanMove(r,side,b);else if(r.type==='chess'){
const m=chess.move(r.history,String(b.uci||''));r.history.push(m.state);r.moveNumber++;r.last=b.uci;r.moveLog.push(`${m.state.t===-1?Math.ceil(r.moveNumber/2)+'.':'...'} ${m.notation}`);
const status=chess.status(r.history);if(status.ended)endGame(r,status.winner===null?null:status.winner===1?0:status.winner===-1?1:null,status.reason);else r.turn=m.state.t===1?0:1;
}else throw err('Game không hỗ trợ.',400);
r.updatedAt=now();broadcastRoom(r);return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/resign'){const r=getRoom(b);validateRoom(r,session,ctx);const side=r.players.findIndex(p=>p.id===id);if(side<0||r.phase!=='active')throw err('Không thể đầu hàng lúc này.');endGame(r,1-side,'Đối thủ đầu hàng.');broadcastRoom(r);return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/rematch'){const r=getRoom(b);validateRoom(r,session,ctx);if(r.hostId!==id)throw err('Chỉ chủ phòng mới được tạo ván mới.',403);if(r.phase!=='ended'&&r.phase!=='waiting')throw err('Chỉ được chơi lại sau khi kết thúc.');createBoard(r);broadcastRoom(r);return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/chat'){const scope=b.scope==='room'?'room':'lobby';const text=sanitize(b.text);if(!text)throw err('Tin nhắn trống.');if(text.length>400)throw err('Tin nhắn tối đa 400 ký tự.');const throttle=id+':'+scope;const prev=lastMessage.get(throttle)||0;if(Date.now()-prev<900)throw err('Bạn gửi tin nhắn quá nhanh.',429);lastMessage.set(throttle,Date.now());
const message={id:stamp(),author:id,name:viewer.name,avatar:viewer.avatar,text,at:now()};
if(scope==='room'){const r=getRoom(b);validateRoom(r,session,ctx);r.chat.push(message);r.chat=r.chat.slice(-160);broadcastRoom(r);}else{lobbyChat.push(message);if(lobbyChat.length>160)lobbyChat.splice(0,lobbyChat.length-160);broadcastLobby();}return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/chat/delete'){const scope=b.scope==='room'?'room':'lobby',r=scope==='room'?getRoom(b):null;if(r)validateRoom(r,session,ctx);const list=r?r.chat:lobbyChat,at=list.findIndex(x=>x.id===b.messageId);if(at<0)throw err('Không tìm thấy tin nhắn.',404);if(!session.admin&&list[at].author!==id)throw err('Chỉ tác giả hoặc admin mới xóa được tin nhắn.',403);list.splice(at,1);if(r)broadcastRoom(r);else broadcastLobby();return ctx.json(res,{ok:true});}
if(endpoint==='/api/arcade/solo/start'){if(!['gold','bubble'].includes(b.type))throw err('Game không hỗ trợ ghi điểm chơi đơn.');const token=crypto.randomBytes(24).toString('hex');soloSessions.set(id,{token,type:b.type,start:Date.now()});return ctx.json(res,{token});}
if(endpoint==='/api/arcade/solo/finish'){const live=soloSessions.get(id);if(!live||live.token!==b.token||live.type!==b.type)throw err('Phiên chơi không hợp lệ.');const elapsed=(Date.now()-live.start)/1000,score=Number(b.score);const min=live.type==='gold'?20:8;
if(elapsed<min||elapsed>3600||!Number.isInteger(score)||score<0||score>100000)throw err('Điểm số hoặc thời gian chơi không hợp lệ.');soloSessions.delete(id);record(live.type,id,viewer.name,score);broadcastLobby();return ctx.json(res,{ok:true});}
throw err('Không tìm thấy chức năng mini game.',404);
}
function broadcastContent(content){for(const c of clients)send(c.res,'content',content);}
const heartbeat=setInterval(()=>{for(const c of clients)try{c.res.write(': ping\n\n');}catch{clients.delete(c);}const limit=Date.now()-3600e3;for(const [id,value] of soloSessions)if(value.start<limit)soloSessions.delete(id);},20000);heartbeat.unref();
module.exports={handle,broadcastContent,leaveAll,publicLobby,sow,caroMove,oanMove};
