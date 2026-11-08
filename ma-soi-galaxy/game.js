'use strict';
const crypto = require('node:crypto');
const {ROLE_META,SPECIAL_ROLES,WOLF_ROLES,ROLE_PRIORITY} = require('./roles');
const isWolf = r => ROLE_META[r]?.faction === 'wolf';
const alive = room => room.players.filter(p => !p.spectate && p.alive);
const player = (room,id) => room.players.find(p=>p.id===id && !p.spectate);
const stamp = () => new Date().toISOString();
const rand = n => crypto.randomInt(n);
function shuffle(a) { a=[...a]; for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; }
function makeDeck(count,enabled=SPECIAL_ROLES) {
  if(count<5 || count>60) throw Error('Cần 5–60 người chơi để bắt đầu.');
  const allowed = new Set(enabled);
  const wolfCount = Math.max(1,Math.floor(count/4));
  const specials = ['white_wolf','wolf_cub','silencer'].filter(r=>allowed.has(r));
  let wolves = ['wolf'];
  for(const r of specials) if(wolves.length<wolfCount) wolves.push(r);
  while(wolves.length<wolfCount) wolves.push('wolf');
  const villageN = count-wolfCount;
  const villagerAbilities = ROLE_PRIORITY.filter(r=>allowed.has(r));
  // Một số Dân thường luôn có mặt, tạo cơ hội suy luận thay vì toàn vai quyền năng.
  const slots = Math.min(villagerAbilities.length,Math.max(1,villageN-1));
  let village = [...villagerAbilities.slice(0,slots)];
  while(village.length<villageN) village.push('villager');
  return shuffle([...wolves,...village]);
}
function system(room,message){room.messages.push({id:crypto.randomUUID(),at:stamp(),kind:'system',channel:'main',name:'THÔNG BÁO',text:message}); room.messages=room.messages.slice(-180);}
function gameInit(room){
  const gamers=room.players.filter(p=>!p.spectate), deck=makeDeck(gamers.length,room.enabledRoles);
  gamers.forEach((p,i)=>{p.role=deck[i];p.alive=true;p.revealed=false;p.ready=false;p.privateInfo=[];p.used={};p.lastGuard=null;p.foxDisabled=false;p.cannotVote=false;p.hunterTarget=null;});
  room.phase='night';room.round=1;room.deadline=Date.now()+room.nightSeconds*1000;
  room.actions={};room.votes={};room.lovers=[];room.silenced=[];room.voteBonus={};room.wolfBonus=false;room.wolfBonusNext=false;room.winner=null;room.messages=[];
  system(room,'Trăng máu đã xuất hiện. Mỗi người hãy nhìn lá bài bí mật của mình.');
  system(room,'Đêm 1 bắt đầu. Các vai có năng lực hãy hành động trước khi hết giờ.');
}
const NAMES={kill:'Sói chọn nạn nhân',kill2:'Sói săn thêm mục tiêu',whitewolf:'Sói Trắng hạ một Sói',seer:'Soi phe',witch_save:'Dùng bình cứu',witch_poison:'Dùng bình độc',guard:'Bảo vệ',hunter:'Đặt mục tiêu trả thù',cupid:'Ghép đôi',fox:'Đánh hơi 3 người',priest:'Ban phước',detective:'Đối chiếu 2 người',raven:'Đánh dấu +2 phiếu',silencer:'Cấm phát biểu'};
function actionsAvailable(room,p){
  if(room.phase!=='night'||!p?.alive||p.spectate)return [];
  const everybody=alive(room),others=everybody.filter(x=>x.id!==p.id), nonWolf=others.filter(x=>!isWolf(x.role)), wolves=others.filter(x=>isWolf(x.role));
  const a=[];const add=(id,candidates,n=1,help='')=>a.push({id,label:NAMES[id],targets:n,candidates:candidates.map(x=>({id:x.id,name:x.name})),help,selected:room.actions[p.id]?.[id]||null});
  if(isWolf(p.role)){
    add('kill',nonWolf,1,'Các thành viên phe Sói cùng bỏ phiếu. Mục tiêu nhiều phiếu nhất sẽ bị tấn công.');
    if(room.wolfBonus)add('kill2',nonWolf,1,'Sói Con đã chết: đàn Sói có thêm một lượt tấn công đêm này.');
  }
  if(p.role==='white_wolf'&&!p.used.whitewolf)add('whitewolf',wolves,1,'Một lần trong ván: bí mật hạ một Sói đồng đội.');
  if(p.role==='silencer')add('silencer',nonWolf,1,'Người được chọn sẽ không chat được trong buổi thảo luận sáng mai.');
  if(p.role==='seer')add('seer',others);
  if(p.role==='witch'){
    if(!p.used.witch_save)add('witch_save',everybody,1,'Chọn một người để che chắn trước đòn của Sói trong đêm này.');
    if(!p.used.witch_poison)add('witch_poison',others,1,'Chọn một người để đầu độc trong đêm này.');
  }
  if(p.role==='guard')add('guard',everybody.filter(x=>x.id!==p.lastGuard),1,'Không bảo vệ cùng một người trong hai đêm liên tiếp.');
  if(p.role==='hunter')add('hunter',others);
  if(p.role==='cupid'&&room.round===1&&room.lovers.length===0)add('cupid',everybody,2,'Đôi tình nhân cùng sống cùng chết.');
  if(p.role==='fox'&&!p.foxDisabled)add('fox',others);
  if(p.role==='priest'&&!p.used.priest)add('priest',everybody);
  if(p.role==='detective')add('detective',others,2,'Biết hai người cùng phe hay khác phe.');
  if(p.role==='raven')add('raven',others,1,'Người bị đánh dấu nhận thêm hai phiếu ở phiên biểu quyết sắp tới.');
  return a;
}
function submitAction(room,p,kind,targets){
  if(room.phase!=='night'||!p?.alive)throw Error('Hiện không ở giai đoạn hành động ban đêm.');
  const av=actionsAvailable(room,p).find(a=>a.id===kind);
  if(!av)throw Error('Vai trò của bạn không thể dùng kỹ năng này lúc này.');
  if(!Array.isArray(targets)||targets.length!==av.targets||new Set(targets).size!==targets.length||!targets.every(id=>av.candidates.some(x=>x.id===id)))throw Error('Vui lòng chọn đúng mục tiêu hợp lệ.');
  room.actions[p.id]??={};room.actions[p.id][kind]=targets;
  const targetP=targets.map(id=>player(room,id));
  if(kind==='seer')p.privateInfo.push(`Đêm ${room.round}: ${targetP[0].name} thuộc ${isWolf(targetP[0].role)?'PHE SÓI 🐺':'PHE DÂN 🌙'}.`);
  if(kind==='detective')p.privateInfo.push(`Đêm ${room.round}: ${targetP[0].name} và ${targetP[1].name} ${isWolf(targetP[0].role)===isWolf(targetP[1].role)?'CÙNG':'KHÁC'} phe.`);
  if(kind==='fox'){
    const seats=alive(room),i=seats.findIndex(x=>x.id===targets[0]);
    const near=[seats[(i+seats.length-1)%seats.length],seats[i],seats[(i+1)%seats.length]];
    const found=near.some(x=>isWolf(x.role));
    p.privateInfo.push(`Đêm ${room.round}: quanh ${targetP[0].name} ${found?'CÓ dấu vết Sói 🐺':'KHÔNG có Sói. Bạn đã mất năng lực Cáo.'}`);
    if(!found)p.foxDisabled=true;
  }
  if(kind==='cupid')room.lovers=[...targets];
  if(kind==='hunter')p.hunterTarget=targets[0];
  return `${NAMES[kind]}: ${targetP.map(x=>x.name).join(' & ')}. Đã ghi nhận.`;
}
function majority(ids,excluded=new Set()){
  const counts=new Map(); for(const id of ids)if(id&&!excluded.has(id))counts.set(id,(counts.get(id)||0)+1);
  if(!counts.size)return null;
  let top=Math.max(...counts.values()); const leads=[...counts].filter(([,n])=>n===top).map(([id])=>id);
  return leads[rand(leads.length)];
}
function finalDeaths(room,initial){
  const queue=[...initial], dead=[],seen=new Set();
  while(queue.length){
    const d=queue.shift();if(!d||seen.has(d.id))continue;
    const p=player(room,d.id);if(!p||!p.alive)continue;
    seen.add(p.id);p.alive=false;dead.push({id:p.id,name:p.name,role:p.role,reason:d.reason});
    const lover=room.lovers.length===2 ? room.lovers.find(x=>x!==p.id && room.lovers.includes(p.id)):null;
    if(lover)queue.push({id:lover,reason:'tình nhân qua đời'});
    if(p.role==='hunter'&&p.hunterTarget&&p.hunterTarget!==p.id)queue.push({id:p.hunterTarget,reason:'Thợ Săn trả thù'});
    if(p.role==='wolf_cub')room.wolfBonusNext=true;
  }
  return dead;
}
function checkWinner(room){
 const live=alive(room),wolf=live.filter(p=>isWolf(p.role)),village=live.filter(p=>!isWolf(p.role));
 let winner=null;
 if(live.length===1&&live[0].role==='white_wolf')winner='Sói Trắng';
 else if(room.lovers.length===2&&live.length===2&&room.lovers.every(id=>live.some(p=>p.id===id))&&isWolf(live[0].role)!==isWolf(live[1].role))winner='Đôi Tình Nhân';
 else if(wolf.length===0)winner='Phe Dân 🌙';
 else if(wolf.length>=village.length)winner='Phe Sói 🐺';
 if(winner){room.phase='ended';room.winner=winner;room.deadline=null;system(room,`🏆 ${winner} đã chiến thắng! Tất cả vai trò được công khai sau ván.`);}
 return winner;
}
function resolveNight(room){
 if(room.phase!=='night')return;
 const players=alive(room),wolfVotes=[],wolfVotes2=[];
 for(const p of players)if(isWolf(p.role)){
  wolfVotes.push(room.actions[p.id]?.kill?.[0]);
  if(room.wolfBonus)wolfVotes2.push(room.actions[p.id]?.kill2?.[0]);
 }
 const first=majority(wolfVotes),second=room.wolfBonus?majority(wolfVotes2,new Set([first])):null;
 const guarded=new Set();let poisoned=[];
 for(const p of players){const act=room.actions[p.id]||{};
  if(p.role==='guard'&&act.guard?.[0]){guarded.add(act.guard[0]);p.lastGuard=act.guard[0];}
  if(p.role==='priest'&&act.priest?.[0]){guarded.add(act.priest[0]);p.used.priest=true;}
  if(p.role==='witch'){
   if(act.witch_save?.[0]){guarded.add(act.witch_save[0]);p.used.witch_save=true;}
   if(act.witch_poison?.[0]){poisoned.push({id:act.witch_poison[0],reason:'bị trúng bình độc'});p.used.witch_poison=true;}
  }
  if(p.role==='white_wolf'&&act.whitewolf?.[0]){poisoned.push({id:act.whitewolf[0],reason:'bị Sói Trắng tấn công'});p.used.whitewolf=true;}
 }
 const deaths=[...poisoned];
 for(const target of [first,second]){
  if(!target||guarded.has(target))continue;
  const p=player(room,target);
  if(p?.alive){if(p.role==='elder'&&!p.used.elder){p.used.elder=true;p.privateInfo.push(`Đêm ${room.round}: Bạn đã dùng khả năng sống sót trước đòn Sói đầu tiên.`);}else deaths.push({id:target,reason:'bị đàn Sói tấn công'});}
 }
 room.silenced=[];room.voteBonus={};
 for(const p of players){const a=room.actions[p.id]||{};
  if(p.role==='silencer'&&a.silencer?.[0])room.silenced.push(a.silencer[0]);
  if(p.role==='raven'&&a.raven?.[0])room.voteBonus[a.raven[0]]=(room.voteBonus[a.raven[0]]||0)+2;
 }
 const killed=finalDeaths(room,deaths);
 system(room,killed.length ? `Bình minh đêm ${room.round}: ${killed.map(p=>p.name+` (${p.reason})`).join('; ')}. Vai trò đã được hé lộ trong danh sách.` : `Bình minh đêm ${room.round}: Không có ai thiệt mạng. Một điều kỳ lạ đã xảy ra...`);
 room.wolfBonus=room.wolfBonusNext;room.wolfBonusNext=false;
 if(checkWinner(room))return;
 room.phase='day';room.deadline=Date.now()+room.daySeconds*1000;room.actions={};
 if(room.silenced.length)system(room,'Một hoặc nhiều người đã bị Sói Câm Lặng phong ấn tiếng nói trong phiên thảo luận này.');
}
function resolveVote(room){
 if(room.phase!=='vote')return;
 const score=new Map();
 for(const p of alive(room)){const t=room.votes[p.id];if(t&&player(room,t)?.alive)score.set(t,(score.get(t)||0)+1);}
 for(const [id,n]of Object.entries(room.voteBonus))if(player(room,id)?.alive)score.set(id,(score.get(id)||0)+n);
 let result=null,dead=[];
 if(score.size){const high=Math.max(...score.values());const tied=[...score.entries()].filter(([,n])=>n===high).map(([id])=>id);
  if(tied.length===1)result=player(room,tied[0]);
  else system(room,'Phiếu bầu hòa nhau. Hội đồng không loại bất kỳ ai.');
 }else system(room,'Không có phiếu hợp lệ. Không ai bị loại trong vòng này.');
 if(result){
  if(result.role==='idiot'&&!result.used.idiot){result.used.idiot=true;result.revealed=true;result.cannotVote=true;system(room,`${result.name} là Kẻ Ngốc! Được tha lần này nhưng vĩnh viễn mất quyền bỏ phiếu.`);}
  else if(result.role==='prince'&&!result.used.prince){result.used.prince=true;result.revealed=true;system(room,`${result.name} hóa ra là Hoàng Tử! Được tha lần bị loại đầu tiên.`);}
  else{dead=finalDeaths(room,[{id:result.id,reason:'bị hội đồng loại'}]);system(room,`${dead.map(p=>p.name).join(', ')} đã rời cuộc chơi sau phiên bỏ phiếu.`);}
 }
 room.votes={};room.voteBonus={};room.silenced=[];
 if(checkWinner(room))return;
 room.round++;room.phase='night';room.deadline=Date.now()+room.nightSeconds*1000;room.actions={};if(room.wolfBonusNext){room.wolfBonus=true;room.wolfBonusNext=false;}
 system(room,`Đêm ${room.round} bắt đầu. Làng chìm vào giấc ngủ.`);
}
function advance(room){
 if(room.phase==='night')resolveNight(room);
 else if(room.phase==='day'){room.phase='vote';room.deadline=Date.now()+room.voteSeconds*1000;room.votes={};system(room,'Thảo luận đã kết thúc. Hãy gửi lá phiếu của bạn.');}
 else if(room.phase==='vote')resolveVote(room);
 else throw Error('Không thể chuyển giai đoạn lúc này.');
}
function castVote(room,p,targetId){
 if(room.phase!=='vote'||!p?.alive||p.cannotVote)throw Error('Hiện bạn không có quyền bỏ phiếu.');
 if(!player(room,targetId)?.alive||targetId===p.id)throw Error('Mục tiêu bỏ phiếu không hợp lệ.');
 room.votes[p.id]=targetId;
}
function roomView(room,viewerId,content){
 const me=room.players.find(p=>p.id===viewerId),own=me&&!me.spectate?me:null;
 const showRoles=room.phase==='ended';
 const people=room.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,guest:p.guest,spectate:p.spectate,ready:p.ready,alive:p.alive,
  revealed:showRoles||!p.alive||p.revealed, role:(showRoles||!p.alive||p.revealed)?p.role:null,
  host:p.id===room.hostId,cannotVote:!!p.cannotVote}));
 const filtered=room.messages.filter(m=>m.channel!=='wolf'||(own&&isWolf(own.role))||showRoles);
 return {
  code:room.code,name:room.name,phase:room.phase,round:room.round,deadline:room.deadline,hostId:room.hostId,
  capacity:room.capacity,nightSeconds:room.nightSeconds,daySeconds:room.daySeconds,voteSeconds:room.voteSeconds,
  enabledRoles:room.enabledRoles,players:people,winner:room.winner,chat:filtered.slice(-90),
  currentPlayer:me?{id:me.id,spectate:me.spectate,alive:me.alive,ready:me.ready,role:own?.role||null,hasVoted:!!room.votes[me.id],
   cannotVote:!!own?.cannotVote,silenced:room.silenced.includes(me.id),privateInfo:own?.privateInfo?.slice(-18)||[],
   wolfMates:own&&isWolf(own.role)?room.players.filter(p=>p.alive&&isWolf(p.role)).map(p=>p.id):[],
   loverId:room.lovers.includes(me.id)?room.lovers.find(id=>id!==me.id):null,
   actions:own?actionsAvailable(room,own):[]} :null,
  votesCast:Object.keys(room.votes).length,
  chatAllowed:!!(me&&!me.spectate&&me.alive&&!room.silenced.includes(me.id)&&(room.phase==='day'||room.phase==='lobby'||(room.phase==='night'&&own&&isWolf(own.role))))
 };
}
module.exports={makeDeck,gameInit,submitAction,advance,castVote,roomView,system,isWolf,alive,player,checkWinner};
