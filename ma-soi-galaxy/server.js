'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {URL}=require('node:url');
const arcade=require('./arcade');const game=require('./game');const {ROLE_META,SPECIAL_ROLES}=require('./roles');
const ROOT=__dirname,DATA=process.env.DATA_DIR||path.join(ROOT,'data'),PUBLIC=path.join(ROOT,'public');
fs.mkdirSync(DATA,{recursive:true});
const fileUsers=path.join(DATA,'users.json'),fileContent=path.join(DATA,'content.json');
const load=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;}};
const save=(p,obj)=>{const tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj,null,2));fs.renameSync(tmp,p);};
const seedContent=require('./content.seed.json');
const savedContent=load(fileContent,{});
let users=load(fileUsers,[]),content={ui:{...seedContent.ui,...savedContent.ui},roles:{...seedContent.roles,...savedContent.roles},games:{...seedContent.games,...savedContent.games}};
const sessions=new Map(),rooms=new Map(),streams=new Set();
const PORT=Number(process.env.PORT)||3000;
const stamp=()=>new Date().toISOString();
const loginAttempts=new Map();
function checkAttempts(req,scope){
 const key=(req.socket.remoteAddress||'unknown')+':'+scope, now=Date.now();
 const item=loginAttempts.get(key)||{count:0,from:now};
 if(now-item.from>15*60*1000){item.count=0;item.from=now;}
 if(item.count>=9)throw error('Đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.',429);
 return {key,item};
}
function failedAttempt(attempt){attempt.item.count++;loginAttempts.set(attempt.key,attempt.item);}
function clearAttempt(attempt){loginAttempts.delete(attempt.key);}

const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||(process.env.NODE_ENV==='production'?'':'08022005');
if(!ADMIN_PASSWORD)console.warn('⚠️ ADMIN_PASSWORD chưa được thiết lập: chức năng chỉnh sửa đã bị khóa.');
if(process.env.NODE_ENV!=='production')console.warn('⚠️ Đang chạy bản demo. Mã admin mặc định chỉ nên dùng cục bộ.');
const error=(msg,code=400)=>Object.assign(new Error(msg),{code});
const cookie=(req,key)=>{const c=(req.headers.cookie||'').split(';').map(s=>s.trim());const v=c.find(s=>s.startsWith(key+'='));return v?decodeURIComponent(v.substring(key.length+1)):null;};
const getSession=req=>sessions.get(cookie(req,'lunar_session'));
const setSession=(res,s)=>{const token=crypto.randomBytes(32).toString('hex');sessions.set(token,s);res.setHeader('Set-Cookie',`lunar_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV==='production'?'; Secure':''}`);return token;};
const sanitizeNick=s=>String(s||'').trim().replace(/\s+/g,' ').slice(0,30);
const publicViewer=s=>s?{id:s.userId||s.guestId,name:s.userId?users.find(u=>u.id===s.userId)?.name:s.name,avatar:s.userId?users.find(u=>u.id===s.userId)?.avatar:s.avatar,guest:!!s.guestId,admin:!!s.admin}:null;
const uid=s=>s.userId?'u_'+s.userId:'g_'+s.guestId;
const hash=(pin,salt)=>crypto.scryptSync(pin,salt,64).toString('hex');
const safeEqual=(a,b)=>{if(!a||!b||a.length!==b.length)return false;return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));};
const json=(res,obj,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const read=async req=>{
 const chunks=[];let len=0;for await(const chunk of req){len+=chunk.length;if(len>650000)throw error('Dữ liệu gửi lên quá lớn.',413);chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw error('Định dạng dữ liệu không hợp lệ.');}
};
const access=(s)=>{if(!s)throw error('Bạn cần đăng nhập hoặc chọn chế độ khách.',401);return s;};
const ownRoom=(body,s)=>{
 const code=String(body.code||'').trim().toUpperCase(),room=rooms.get(code);
 if(!room)throw error('Mã phòng không tồn tại hoặc đã đóng.',404);
 const p=room.players.find(x=>x.id===uid(s));if(!p)throw error('Bạn chưa tham gia phòng này.',403);
 return {room,p};
};
const owner=(room,p)=>{if(room.hostId!==p.id)throw error('Chỉ chủ phòng mới có quyền thực hiện. ',403);};
function send(res,event,payload){try{res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);}catch{}}
function broadcast(room){for(const s of streams)if(s.code===room.code){const session=s.session;const id=uid(session);const p=room.players.find(x=>x.id===id);send(s.res,'room',p?game.roomView(room,id,content):null);}}
function allContent(){for(const s of streams)send(s.res,'content',content);arcade.broadcastContent(content);}
const addRoomMember=(room,s,spectate)=>{
 const id=uid(s),pv=publicViewer(s);let p=room.players.find(p=>p.id===id);
 if(p){return p;}
 if(room.phase!=='lobby'&&!spectate)throw error('Ván đang diễn ra, bạn chỉ có thể vào xem.');
 if(!spectate&&room.players.filter(p=>!p.spectate).length>=room.capacity)throw error('Phòng đã đủ người chơi.');
 p={id,name:pv.name,avatar:pv.avatar,guest:pv.guest,spectate:!!spectate,ready:false,alive:room.phase==='lobby',role:null};
 room.players.push(p);game.system(room,`${p.name} ${spectate?'đã đến xem trận đấu':'đã bước vào ngôi làng'}.`);return p;
};
function removeMember(room,id){
 const p=room.players.find(x=>x.id===id);if(!p)return;
 if(room.phase!=='lobby'&&!p.spectate&&p.alive){p.alive=false;game.system(room,`${p.name} đã rời phòng và rời ván chơi.`);game.checkWinner(room);}
 room.players=room.players.filter(x=>x.id!==id);
 if(room.hostId===id)room.hostId=room.players[0]?.id||null;
 if(!room.players.length)rooms.delete(room.code);else game.system(room,`${p.name} đã rời phòng.`);
 broadcast(room);
}
function stream(req,res,url){
 const s=access(getSession(req));const code=(url.searchParams.get('room')||'').trim().toUpperCase();
 const room=code?rooms.get(code):null;
 if(code&&!room)throw error('Phòng không tồn tại.',404);
 if(room&&!room.players.some(p=>p.id===uid(s)))throw error('Bạn không ở trong phòng này.',403);
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
 res.write(': connected\n\n');const client={res,code,session:s};streams.add(client);
 send(res,'content',content);if(room)send(res,'room',game.roomView(room,uid(s),content));
 req.on('close',()=>streams.delete(client));
}
function originCheck(req){if(req.method!=='POST')return;const origin=req.headers.origin;if(!origin)return;try{const o=new URL(origin),host=req.headers['x-forwarded-host']||req.headers.host; if(o.host!==host&&(process.env.APP_ORIGIN||'')!==origin)throw error('Yêu cầu từ website khác bị từ chối.',403);}catch(e){throw e.code?e:error('Origin không hợp lệ.',403);}}
async function api(req,res,url){
 const endpoint=url.pathname;
 if(endpoint.startsWith('/api/arcade/')){if(req.method==='POST')originCheck(req);return arcade.handle(req,res,url,{getSession,publicViewer,uid,access,json,read,getContent:()=>content});}
 if(req.method==='GET'&&endpoint==='/api/bootstrap')return json(res,{viewer:publicViewer(getSession(req)),content,roles:ROLE_META,specialRoles:SPECIAL_ROLES});
 if(req.method==='GET'&&endpoint==='/api/stream')return stream(req,res,url);
 if(req.method==='GET'&&endpoint==='/api/room'){
  const s=access(getSession(req)),room=rooms.get((url.searchParams.get('code')||'').toUpperCase());
  if(!room||!room.players.some(p=>p.id===uid(s)))throw error('Bạn chưa vào phòng này.',404);
  return json(res,{room:game.roomView(room,uid(s),content)});
 }
 if(req.method!=='POST')throw error('Không tìm thấy API.',404);
 originCheck(req);const b=await read(req);let s=getSession(req);
 if(endpoint==='/api/auth'){
  if(s){for(const r of [...rooms.values()])if(r.players.some(p=>p.id===uid(s)))removeMember(r,uid(s));arcade.leaveAll(uid(s));}
  const type=b.type,nick=sanitizeNick(b.name),pin=String(b.pin||'');
  if(type==='guest'){
   if(!/^[\p{L}\p{N} ._-]{2,30}$/u.test(nick))throw error('Tên khách phải từ 2–30 ký tự, chỉ chữ, số, cách, dấu chấm và gạch.');
   const session={guestId:crypto.randomUUID(),name:nick,avatar:null,admin:false};setSession(res,session);return json(res,{viewer:publicViewer(session)});
  }
  if(!/^[\p{L}\p{N} ._-]{2,30}$/u.test(nick))throw error('Tên tài khoản phải từ 2–30 ký tự hợp lệ.');
  if(!/^\d{8}$/.test(pin))throw error('Mã ngày sinh cần 8 chữ số DDMMYYYY.');
  const norm=nick.toLocaleLowerCase('vi-VN'),u=users.find(x=>x.norm===norm);
  if(type==='register'){
   if(u)throw error('Tên này đã tồn tại. Hãy đăng nhập hoặc chọn biệt danh khác.',409);
   const salt=crypto.randomBytes(24).toString('hex');const user={id:crypto.randomUUID(),name:nick,norm,salt,passHash:hash(pin,salt),avatar:null,createdAt:stamp()};
   users.push(user);save(fileUsers,users);const session={userId:user.id,admin:false};setSession(res,session);return json(res,{viewer:publicViewer(session)});
  }
  if(type==='login'){
   const attempt=checkAttempts(req,'login:'+norm);
   if(!u||!safeEqual(hash(pin,u.salt),u.passHash)){failedAttempt(attempt);throw error('Tên hoặc mã ngày sinh không đúng.',401);}
   clearAttempt(attempt);const session={userId:u.id,admin:false};setSession(res,session);return json(res,{viewer:publicViewer(session)});
  }
  throw error('Chế độ đăng nhập không hợp lệ.');
 }
 if(endpoint==='/api/logout'){
  if(s){for(const r of [...rooms.values()])if(r.players.some(p=>p.id===uid(s)))removeMember(r,uid(s));arcade.leaveAll(uid(s));}
  const token=cookie(req,'lunar_session');sessions.delete(token);res.setHeader('Set-Cookie','lunar_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,{ok:true});
 }
 s=access(s);
 if(endpoint==='/api/avatar'){
  const data=String(b.image||'');if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>280000)throw error('Ảnh không hợp lệ hoặc quá lớn. Vui lòng chọn ảnh nhỏ hơn.');
  if(s.userId){const u=users.find(u=>u.id===s.userId);u.avatar=data;save(fileUsers,users);}else s.avatar=data;
  for(const r of rooms.values()){const p=r.players.find(p=>p.id===uid(s));if(p){p.avatar=data;broadcast(r);}}
  return json(res,{viewer:publicViewer(s)});
 }
 if(endpoint==='/api/room/create'){
  const name=String(b.name||'Hội trăng máu').trim().slice(0,48);
  if(!name)throw error('Vui lòng đặt tên phòng.');
  for(const r of [...rooms.values()])if(r.players.some(x=>x.id===uid(s)))removeMember(r,uid(s));
  let code;do{code=crypto.randomBytes(4).toString('hex').substring(0,6).toUpperCase();}while(rooms.has(code));
  const room={code,name,hostId:uid(s),capacity:60,nightSeconds:90,daySeconds:150,voteSeconds:90,enabledRoles:[...SPECIAL_ROLES],players:[],messages:[],actions:{},votes:{},lovers:[],silenced:[],voteBonus:{},phase:'lobby',round:0,deadline:null};
  rooms.set(code,room);addRoomMember(room,s,false);broadcast(room);return json(res,{room:game.roomView(room,uid(s),content)});
 }
 if(endpoint==='/api/room/join'){
  const code=String(b.code||'').trim().toUpperCase(),r=rooms.get(code);
  if(!r)throw error('Không tìm thấy phòng. Hãy kiểm tra mã gồm 6 ký tự.',404);
  for(const other of [...rooms.values()])if(other.code!==code&&other.players.some(x=>x.id===uid(s)))removeMember(other,uid(s));
  addRoomMember(r,s,!!b.spectate);broadcast(r);return json(res,{room:game.roomView(r,uid(s),content)});
 }
 if(endpoint==='/api/admin/unlock'){
  const attempt=checkAttempts(req,'admin');
  if(!ADMIN_PASSWORD)throw error('Quản trị chưa được cấu hình trên máy chủ.',503);
  const provided=String(b.password||''),a=Buffer.from(provided),c=Buffer.from(ADMIN_PASSWORD);
  if(a.length!==c.length||!crypto.timingSafeEqual(a,c)){failedAttempt(attempt);throw error('Mật khẩu quản trị không đúng.',403);}
  clearAttempt(attempt);s.admin=true;return json(res,{viewer:publicViewer(s)});
 }
 if(endpoint==='/api/admin/content'){
  if(!s.admin)throw error('Cần mở khóa quyền quản trị.',403);
  const ui={},roles={},games={};
  for(const k of Object.keys(content.ui)){const value=b.ui?.[k];if(typeof value!=='string'||value.length>1500)throw error(`Nội dung ${k} không hợp lệ.`);ui[k]=value;}
  for(const k of Object.keys(content.roles)){
   const name=b.roles?.[k]?.name,description=b.roles?.[k]?.description;
   if(typeof name!=='string'||name.length>100||typeof description!=='string'||description.length>1500)throw error(`Nội dung vai ${k} không hợp lệ.`);
   roles[k]={name,description};
  }
  for(const k of Object.keys(content.games)){const x=b.games?.[k];if(!x||!['name','subtitle','description','instructions'].every(f=>typeof x[f]==='string'&&x[f].length<=1500))throw error(`Nội dung trò chơi ${k} không hợp lệ.`);games[k]={name:x.name,subtitle:x.subtitle,description:x.description,instructions:x.instructions};}
  content={ui,roles,games};save(fileContent,content);allContent();return json(res,{ok:true});
 }
 const {room,p}=ownRoom(b,s);
 if(endpoint==='/api/room/leave'){removeMember(room,p.id);return json(res,{ok:true});}
 if(endpoint==='/api/room/ready'){
  if(room.phase!=='lobby'||p.spectate)throw error('Không thể thay đổi trạng thái lúc này.');
  p.ready=!!b.ready;broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/config'){
  owner(room,p);if(room.phase!=='lobby')throw error('Chỉ chỉnh được trước khi bắt đầu.');
  room.capacity=Math.min(60,Math.max(5,Number(b.capacity)||60));
  if(room.players.filter(p=>!p.spectate).length>room.capacity)throw error('Sức chứa nhỏ hơn số người đang có.');
  room.nightSeconds=Math.min(600,Math.max(30,Number(b.nightSeconds)||90));
  room.daySeconds=Math.min(900,Math.max(30,Number(b.daySeconds)||150));
  room.voteSeconds=Math.min(600,Math.max(30,Number(b.voteSeconds)||90));
  if(!Array.isArray(b.enabledRoles))throw error('Danh sách vai không hợp lệ.');
  room.enabledRoles=SPECIAL_ROLES.filter(x=>b.enabledRoles.includes(x));broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/start'){
  owner(room,p);if(room.phase!=='lobby')throw error('Ván đã bắt đầu.');
  const playing=room.players.filter(x=>!x.spectate);if(playing.length<5)throw error('Cần tối thiểu 5 người để chơi.');
  if(playing.some(x=>!x.ready))throw error('Hãy đợi tất cả người chơi nhấn Sẵn sàng.');
  game.gameInit(room);broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/chat'){
  const text=String(b.text||'').trim().replace(/[\u0000-\u0008\u000B-\u001F]/g,'').slice(0,300);
  if(!text)throw error('Tin nhắn trống.');
  if(p.spectate||!p.alive||room.silenced?.includes(p.id))throw error('Bạn hiện không thể chat.');
  const channel=room.phase==='night'&&game.isWolf(p.role)?'wolf':'main';
  if(room.phase!=='lobby'&&room.phase!=='day'&&channel!=='wolf')throw error('Chỉ có thể chat công khai trong ban ngày.');
  if(p.lastMessage&&Date.now()-p.lastMessage<700)throw error('Vui lòng gửi tin nhắn chậm hơn một chút.',429);
  p.lastMessage=Date.now();room.messages.push({id:crypto.randomUUID(),at:stamp(),name:p.name,author:p.id,avatar:p.avatar,kind:'message',channel,text});room.messages=room.messages.slice(-180);broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/action'){
  const message=game.submitAction(room,p,String(b.kind||''),b.targets);
  broadcast(room);return json(res,{ok:true,message});
 }
 if(endpoint==='/api/room/vote'){
  game.castVote(room,p,String(b.targetId||''));broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/advance'){
  owner(room,p);game.advance(room);broadcast(room);return json(res,{ok:true});
 }
 if(endpoint==='/api/room/rematch'){
  owner(room,p);if(room.phase!=='ended')throw error('Chỉ tạo ván mới sau khi có kết quả.');
  room.phase='lobby';room.round=0;room.deadline=null;room.messages=[];room.winner=null;room.actions={};room.votes={};room.lovers=[];room.silenced=[];room.voteBonus={};
  for(const m of room.players){m.ready=false;m.alive=true;m.role=null;m.privateInfo=[];m.revealed=false;m.cannotVote=false;}
  game.system(room,'Một ngôi làng mới được mở. Hãy sẵn sàng cho ván tiếp theo!');broadcast(room);return json(res,{ok:true});
 }
 throw error('Không tìm thấy chức năng.',404);
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
function serve(req,res,url){
 let file=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','app.js','styles.css','galaxy.jpg','favicon.svg','games.html','games.js','games.css'].includes(file))throw error('Không tìm thấy trang.',404);
 const f=path.join(PUBLIC,file);fs.readFile(f,(err,data)=>{
  if(err)return json(res,{error:'Không tìm thấy tài nguyên.'},404);
  res.writeHead(200,{'Content-Type':mime[path.extname(f)],'Content-Length':data.length,'X-Content-Type-Options':'nosniff','Cache-Control':file==='galaxy.jpg'?'public, max-age=604800':'no-cache'});if(req.method==='HEAD')res.end();else res.end(data);
 });
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'self'");
 Promise.resolve().then(()=>url.pathname.startsWith('/api/')?api(req,res,url):serve(req,res,url)).catch(e=>{
  if(!res.headersSent)json(res,{error:e.message||'Đã xảy ra lỗi.'},e.code||500);
  else try{res.end();}catch{}
  if(!e.code)console.error(e);
 });
});
const heartbeat=setInterval(()=>{for(const s of streams)try{s.res.write(': ping\n\n');}catch{streams.delete(s);}},20000);heartbeat.unref();
const clock=setInterval(()=>{for(const room of rooms.values())if(['night','day','vote'].includes(room.phase)&&room.deadline&&Date.now()>=room.deadline){try{game.advance(room);broadcast(room);}catch(e){console.error('phase error',e);}}},1000);clock.unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`🌙 LUNAR WOLF đang chạy tại http://localhost:${PORT}`));
module.exports={server};
