'use strict';
// Self-contained legal chess rules, 0x88 board, all state kept server-side.
const FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DIR={n:[-33,-31,-18,-14,14,18,31,33],b:[-17,-15,15,17],r:[-16,-1,1,16],q:[-17,-16,-15,-1,1,15,16,17],k:[-17,-16,-15,-1,1,15,16,17]};
const on=i=>i>=0&&i<128&&!(i&0x88);
const side=p=>p==='.'||!p?0:p===p.toUpperCase()?1:-1;
const sq=i=>'abcdefgh'[i&7]+(8-(i>>4));
const idx=s=>(8-Number(s[1]))*16+'abcdefgh'.indexOf(s[0]);
const key=m=>sq(m[0])+sq(m[1])+(m[2]||'');
function init(){const b=Array(128).fill('.');const rows=FEN.split(' ')[0].split('/');rows.forEach((r,y)=>{let x=0;for(const c of r){if(/[1-8]/.test(c))x+=+c;else b[y*16+x++]=c;}});return {b,t:1,c:15,ep:-1,half:0,full:1};}
function attacked(s,target,by){for(let f=0;f<128;f++){if(!on(f)||side(s.b[f])!==by)continue;const p=s.b[f].toLowerCase();if(p==='p'){if(target===f-16*by-1||target===f-16*by+1)return true;continue;}
for(const d of DIR[p]){for(let t=f+d;on(t);t+=d){if(t===target)return true;if(s.b[t]!=='.'||p==='n'||p==='k')break;}}}return false;}
const checked=(s,color=s.t)=>attacked(s,s.b.indexOf(color===1?'K':'k'),-color);
function apply(s,m){const [f,t,promo,flag]=m,b=s.b.slice(),piece=b[f],captured=b[t];let c=s.c;b[f]='.';b[t]=promo?(s.t===1?promo.toUpperCase():promo):piece;
if(flag==='ep')b[t+16*s.t]='.';
if(flag==='castle'){const rf=t>f?f+3:f-4,rt=t>f?f+1:f-1;b[rt]=b[rf];b[rf]='.';}
if(piece==='K')c&=~3;if(piece==='k')c&=~12;
const rookBit={119:1,112:2,7:4,0:8};if(piece.toLowerCase()==='r')c&=~(rookBit[f]||0);if(captured.toLowerCase()==='r')c&=~(rookBit[t]||0);
return {b,t:-s.t,c,ep:piece.toLowerCase()==='p'&&Math.abs(t-f)===32?(t+f)/2:-1,half:piece.toLowerCase()==='p'||captured!=='.'||flag==='ep'?0:s.half+1,full:s.full+(s.t===-1?1:0)};}
function pseudo(s){const out=[];for(let f=0;f<128;f++){if(!on(f)||side(s.b[f])!==s.t)continue;const p=s.b[f].toLowerCase();
const add=(t,flag='')=>{if(s.b[t].toLowerCase()==='k')return;if(p==='p'&&((t>>4)===0||(t>>4)===7))for(const q of ['q','r','b','n'])out.push([f,t,q,flag]);else out.push([f,t,'',flag]);};
if(p==='p'){const t=f-16*s.t;if(on(t)&&s.b[t]==='.'){add(t);const u=t-16*s.t;if((f>>4)===(s.t===1?6:1)&&s.b[u]==='.')add(u);}for(const d of [-1,1]){const u=t+d;if(!on(u))continue;if(side(s.b[u])===-s.t)add(u);else if(u===s.ep&&s.b[u]==='.'&&s.b[u+16*s.t]===(s.t===1?'p':'P'))add(u,'ep');}}
else{for(const d of DIR[p])for(let t=f+d;on(t);t+=d){if(side(s.b[t])===s.t)break;add(t);if(s.b[t]!=='.'||p==='n'||p==='k')break;}
const home=s.t===1?116:4,rook=s.t===1?'R':'r',bits=s.t===1?[1,2]:[4,8];if(p==='k'&&f===home&&!checked(s)){
if((s.c&bits[0])&&s.b[f+3]===rook&&s.b[f+1]==='.'&&s.b[f+2]==='.'&&!attacked(s,f+1,-s.t)&&!attacked(s,f+2,-s.t))add(f+2,'castle');
if((s.c&bits[1])&&s.b[f-4]===rook&&s.b[f-1]==='.'&&s.b[f-2]==='.'&&s.b[f-3]==='.'&&!attacked(s,f-1,-s.t)&&!attacked(s,f-2,-s.t))add(f-2,'castle');}}
}return out;}
const legal=s=>pseudo(s).filter(m=>!checked(apply(s,m),s.t));
function san(s,m){const [f,t,promo,flag]=m,p=s.b[f].toUpperCase(),capture=s.b[t]!=='.'||flag==='ep';let out='';if(flag==='castle')out=t>f?'O-O':'O-O-O';else{if(p!=='P'){out=p;const other=legal(s).filter(x=>x[0]!==f&&x[1]===t&&s.b[x[0]]===s.b[f]);if(other.length)out+=!other.some(x=>(x[0]&7)===(f&7))?sq(f)[0]:!other.some(x=>(x[0]>>4)===(f>>4))?sq(f)[1]:sq(f);}else if(capture)out=sq(f)[0];out+=(capture?'x':'')+sq(t)+(promo?'='+promo.toUpperCase():'');}const n=apply(s,m);return out+(checked(n)?legal(n).length?'+':'#':'');}
function insufficient(s){const a=[];for(let i=0;i<128;i++)if(on(i)&&s.b[i]!=='.'&&s.b[i].toLowerCase()!=='k')a.push([s.b[i].toLowerCase(),((i>>4)+(i&7))%2]);return !a.length||(a.length===1&&['b','n'].includes(a[0][0]))||(a.every(p=>p[0]==='b')&&new Set(a.map(p=>p[1])).size===1);}
function positionKey(s){return s.b.join('')+':'+s.t+':'+s.c+':'+(s.ep>=0&&legal(s).some(m=>m[3]==='ep')?s.ep:-1);}
function status(history){const s=history.at(-1),available=legal(s);if(!available.length)return {ended:true,winner:checked(s)?-s.t:0,reason:checked(s)?'Chiếu hết':'Hòa do hết nước đi'};if(insufficient(s))return {ended:true,winner:0,reason:'Hòa do không đủ quân'};if(s.half>=100)return {ended:true,winner:0,reason:'Hòa theo quy tắc 50 nước'};const k=positionKey(s);if(history.filter(a=>positionKey(a)===k).length>=3)return {ended:true,winner:0,reason:'Hòa do lặp vị trí 3 lần'};return {ended:false,winner:null,reason:checked(s)?'Đang bị chiếu':''};}
function move(history,uci){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error('Nước cờ không đúng định dạng.');const s=history.at(-1),m=legal(s).find(m=>key(m)===uci);if(!m)throw Error('Nước cờ không hợp lệ hoặc khiến vua bị chiếu.');return {state:apply(s,m),notation:san(s,m)};}
function view(s){const out=[];for(let r=0;r<8;r++)for(let f=0;f<8;f++)out.push(s.b[r*16+f]);return out;}
module.exports={init,legal,apply,move,status,view,checked,idx,sq,key};
