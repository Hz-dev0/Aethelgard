/* 新版任務介面（由試玩版整合）：今天／全部，資料同步到 Firestore 的 Aethelgard/todo */
(function(){

const root=document.getElementById('todoRoot');
root.innerHTML='<div class="topbar" id="td-topbar"><div class="seg"><button class="tab" data-a="go" data-v="today">今天</button><button class="tab" data-a="go" data-v="all">全部</button></div><span class="sp"></span><button class="syn wait" id="td-sync" data-a="s-sync"><i></i><span></span></button><button class="chip" data-a="go" data-v="notes">筆記</button><button class="chip" id="td-gear">設定</button></div><div class="tmain"><div id="td-app"></div></div>';
const fl=document.createElement('div');fl.id='todoFloat';
fl.innerHTML='<div id="td-toast"></div><div id="td-fp"><button id="td-fpb" aria-label="完成紀錄">▲</button><div id="td-fpp"></div></div><div id="td-ov"></div>';
document.body.appendChild(fl);

const K='aeth_todo_v1';
let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}
const norm=()=>{S=S||{};S.tasks=S.tasks||[];S.cfg=Object.assign({soon:3,stale:14,sugMax:3,reset:4,fx:1,tabPos:0},S.cfg);S.skip=S.skip||{};S.fold=S.fold||{};S.sug=S.sug||{d:'',n:0};S.best=S.best||0};norm();
let view='today',fpOpen=false,sugId=null,pend=null,ovMode='';
let dirty=false,saveSeq=0,cloudReady=false,pushT=0,pullTries=0;
const save=()=>{S.updatedAt=Date.now();try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}dirty=true;saveSeq++;statusUpd();if(cloudReady){clearTimeout(pushT);pushT=setTimeout(push,800)}};
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ymd(new Date(Date.now()-S.cfg.reset*36e5));
const diff=a=>Math.round((new Date(a+'T00:00')-new Date(today()+'T00:00'))/864e5);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=id=>document.getElementById('td-'+id);
const by=id=>S.tasks.find(t=>t.id==id);
const age=t=>Math.floor((Date.now()-t.touched)/864e5);
const key=t=>(t.date||'9999')+(t.time||''),byDate=(a,b)=>key(a)<key(b)?-1:1;
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function grp(t){const d=today();if(t.on===d||(t.kind!=='none'&&t.date===d))return'today';if(t.kind==='none'||!t.date)return'later';const n=diff(t.date);return n<=7?'week':n<=30?'month':'later'}
function dueLabel(t){const d=diff(t.date),tm=t.time?' '+t.time:'';
  if(t.kind==='dayonly')return d===0?'今天'+(t.time?' '+t.time+' ':'')+'才能做':d>0?t.date+tm+'（剩 '+d+' 天）':'日子已過';
  return d===0?'今天截止':d>0?'剩 '+d+' 天（'+t.date+'）':'已過期 '+(-d)+' 天'}
function toast(m,id,fn,ms){const t=$('toast');t.textContent=m;t.dataset.id=id||'';toast.fn=fn||null;t.style.pointerEvents=id||fn?'auto':'none';   // fn：點「復原」要做的事（刪除／新增的撤銷）
  if(id||fn){const b=document.createElement('b');b.textContent='　復原';b.style.cursor='pointer';t.append(b)}
  t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),ms||(id?3500:1400))}
const peek=new Set();   // 手機上「已翻到時間那面」的卡片（只存在記憶體，不同步）
const tmark=t=>{const a=t.subs||[],n=a.length;return (t.note?'<span class="nt">📝</span>':'')+(n?`<span class="nt">${a.filter(x=>x.done).length}/${n}</span>`:'')};   // 有備註／小步驟才多一個小標記
function row(t,o={}){const m=[],d=today();
  const dayToday=t.kind==='dayonly'&&t.date===d,auto=t.kind!=='none'&&t.date===d;
  if(dayToday&&o.inToday){if(t.time)m.push(`<span class="meta warn">${t.time}</span>`)}
  else if(t.kind!=='none'&&t.date)m.push(`<span class="meta ${diff(t.date)<=S.cfg.soon?'warn':''}">${dueLabel(t)}</span>`);
  if(t.repeat)m.push(`<span class="meta">↻ 每 ${t.repeat} 天</span>`);
  let side='';
  if(auto||t.kind==='dayonly'){}else if(!t.done&&t.on!==d)side=`<button class="b" data-a="today" data-id="${t.id}">今天做</button>`;
  else if(!t.done&&o.unmark)side=`<button class="b q" data-a="untoday" data-id="${t.id}">先不做</button>`;
  const cmp=o.cmp&&m.length;   // 沒有任何第二列資訊的任務就維持原樣，不用翻
  const h=`<div class="row${t.id===detId?' dopen':''}${cmp?' cmp'+(peek.has(t.id)?' show':''):''}"><button class="ckz" data-a="chk" data-id="${t.id}" aria-label="完成"><span class="ck"></span></button><div class="bd"${cmp?` data-a="peek" data-id="${t.id}"`:''}><div>${esc(t.name)}${tmark(t)}</div>${cmp?`<span class="mt">${m.join(' ')}</span>`:m.join(' ')}</div>${side?`<div class="side">${side}</div>`:''}<button class="del dk" data-a="del" data-id="${t.id}" aria-label="刪除">刪除</button></div>`;
  return h+(t.id===detId?detPanel(t,true):'')}
function sec(k,title,n,body){const o=S.fold[k]!==false;return `<h2 class="fold" data-a="fold" data-k="${k}">${o?'▾':'▸'} ${title}（${n}）</h2>`+(o?body:'')}
/* 新增區塊可收合；收合狀態只記在這支手機（不進雲端、不會觸發同步） */
const AF='aeth_todo_addfold';
let addOpen=(()=>{try{return localStorage.getItem(AF)!=='1'}catch(e){return true}})();
const addTg=()=>`<button class="addtg ${addOpen?'on':''}" data-a="addfold" aria-expanded="${addOpen}">${addOpen?'收起 ▴':'＋ 新增'}</button>`;
const CLK='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
/* ── 快速輸入：在名稱裡直接打「明天 15:30 寄報表」「週五前 回信」「每 3 天 澆水」，自動拆出日期／時間／重複 ──
   純規則判斷（不用網路）。氣泡裡手動選的值優先；輸入框下方的小提示可以按 ✕ 取消這次的自動辨識。 */
const QW='日一二三四五六';
function qParse(txt){
  let s=txt,out={date:'',time:'',repeat:0,kind:'',dl:false};
  const cut=re=>{const m=re.exec(s);if(!m)return null;
    let end=m.index+m[0].length;const tail=/^\s*(之前|以前|前|截止)/.exec(s.slice(end));   // 「週五前」的「前」一起拿掉
    if(tail&&re.dateLike){out.dl=true;end+=tail[0].length}
    s=s.slice(0,m.index)+' '+s.slice(end);return m};
  const R=(re,dateLike)=>{re.dateLike=dateLike;return re};
  let m=cut(R(/每\s*(\d{1,3})\s*天(?:\s*提醒(?:我)?)?|(\d{1,3})\s*天[後后]?\s*(?:再)?重複(?:\s*提醒(?:我)?)?/));
  if(m)out.repeat=parseInt(m[1]||m[2]);
  const base=new Date(today()+'T12:00:00'),add=n=>{const d=new Date(base);d.setDate(d.getDate()+n);return ymd(d)};
  if(m=cut(R(/大[後后]天|[後后]天|明[天日]|今[天日]/,1)))out.date=add({大後天:3,大后天:3,後天:2,后天:2,明天:1,明日:1,今天:0,今日:0}[m[0]]);
  else if(m=cut(R(/(下)?(?:週|周|星期|禮拜)([一二三四五六日天])/,1))){
    const tg=QW.indexOf(m[2]==='天'?'日':m[2]),cur=base.getDay();
    out.date=add(m[1]?((tg+6)%7-(cur+6)%7)+7:(tg-cur+7)%7)}
  else if(m=cut(R(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*[日號号]?(?![杯個个顆颗片份克斤匙瓶包\d])/,1))){
    const mo=+m[1],dy=+m[2];let d=new Date(base.getFullYear(),mo-1,dy,12);
    if(mo<1||mo>12||dy<1||dy>31||d.getMonth()!==mo-1){s=txt;out={date:'',time:'',repeat:out.repeat,kind:'',dl:false}}
    else{if(d<base)d=new Date(base.getFullYear()+1,mo-1,dy,12);out.date=ymd(d)}}
  else if(m=cut(R(/(\d{1,3})\s*天[後后]/,1)))out.date=add(+m[1]);
  if(!out.dl){   // 有「前」代表是截止日，時間只有「當天限定」才用得到，所以不拆時間
    const P='(早上|早晨|上午|中午|下午|晚上|晚間|凌晨)?',fix=(pre,h,mi)=>{
      if((pre==='下午'||pre==='晚上'||pre==='晚間')&&h<12)h+=12;else if(pre==='中午'&&h<11)h+=12;
      if(h>23||mi>59)return null;
      const sn=[0,20,30,40,60].reduce((a,b)=>Math.abs(b-mi)<Math.abs(a-mi)?b:a);   // 分鐘靠到 00／20／30／40
      if(sn===60){h+=1;if(h>23)return null}
      return pad(h)+':'+pad(sn%60)};
    if(m=cut(R(new RegExp(P+'\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{2})')))){const t=fix(m[1],+m[2],+m[3]);if(t)out.time=t;else s=txt}
    else if(m=cut(R(new RegExp(P+'\\s*(\\d{1,2})\\s*點\\s*(半|\\d{1,2})?\\s*分?')))){
      const t=fix(m[1],+m[2],m[3]==='半'?30:(parseInt(m[3])||0));if(t)out.time=t;else s=txt}}
  if(!out.date&&!out.time&&!out.repeat)return null;
  if(out.time&&!out.date)out.date=today();
  out.kind=out.dl||(out.date&&!out.time)?'deadline':out.time?'dayonly':'';
  const name=s.replace(/\s+/g,' ').replace(/^[\s,，、:：\-－]+|[\s,，、:：\-－]+$/g,'');
  if(!name)return null;
  const dd=out.date?Math.round((new Date(out.date+'T12:00:00')-base)/864e5):null,dt=out.date?new Date(out.date+'T12:00:00'):null;
  const dl=out.date?(dd===0?'今天':dd===1?'明天':dd===2?'後天':(dt.getMonth()+1)+'/'+dt.getDate()+'（週'+QW[dt.getDay()]+'）'):'';
  out.name=name;out.label=[out.date?'📅 '+dl+(out.time?' '+out.time:'')+(out.dl?' 前':''):'',out.repeat?'↻ 每 '+out.repeat+' 天':''].filter(Boolean).join('　');
  return out}
let qhOff=false;   // 這次輸入已按 ✕ 取消自動辨識
function qHint(){const h=document.getElementById('td-qh'),i=document.getElementById('td-nm');if(!h||!i)return;
  const q=qhOff?null:qParse(i.value);
  if(!q){h.style.display='none';h.innerHTML='';return}
  h.style.display='flex';h.innerHTML=`<span>${esc(q.label)}</span><button type="button" data-a="qh-x" aria-label="取消自動辨識">✕</button>`}
document.addEventListener('input',e=>{if(e.target.id==='td-nm'){if(!e.target.value)qhOff=false;qHint()}});
/* ── 任務詳細面板：備註＋小步驟。手機長按卡片、電腦右鍵卡片，從任務下方推開（再按一次或點旁邊收起） ── */
let detId=null,detSave=0,lpT=null,lpPos=null,lpFired=false;
const detSubs=t=>(t.subs||[]).map(x=>`<div class="ds${x.done?' dn':''}"><button type="button" class="dck" data-a="d-tg" data-sid="${x.id}" aria-label="完成小步驟">${x.done?'✦':'✧'}</button><span>${esc(x.text)}</span><button type="button" class="dx" data-a="d-rm" data-sid="${x.id}" aria-label="刪除小步驟">✕</button></div>`).join('');
const linkify=txt=>esc(txt).replace(/(https?:\/\/[^\s<]+)/g,u=>{let tail='';const m=u.match(/(?:[.,;:!?)）」』。，、；：！？]|&gt;)+$/);if(m){tail=m[0];u=u.slice(0,-tail.length)}
  return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>${tail}`});   // 備註裡的網址變成可以點的連結
function detPanel(t,on){const hasN=!!t.note;
  return `<div class="dpanel${on?' on':''}" id="td-dpn"><div class="dpin"><div class="dpc"><div id="td-ds">${detSubs(t)}</div><label class="dghost"><span class="gp">＋</span><input id="td-sn" placeholder="小步驟" autocomplete="off" enterkeyhint="done"></label><div id="td-nv" class="nv${hasN?'':' hid'}">${linkify(t.note||'')}</div><textarea id="td-nt" rows="3" class="${hasN?'hid':''}" placeholder="備註（連結、細節…）">${esc(t.note||'')}</textarea></div></div></div>`}
const P=()=>document.getElementById('td-dpn');
const pq=sel=>{const p=P();return p&&p.querySelector(sel)};
function closeDet(imm){const pn=P();if(!pn){detId=null;return}
  clearTimeout(detSave);const t=by(detId),row=pn.previousElementSibling;
  if(t){const nt=pn.querySelector('#td-nt');if(nt)t.note=nt.value.trim()?nt.value:'';if(!(t.subs||[]).length)delete t.subs;save()}
  detId=null;pn.removeAttribute('id');
  if(row){row.classList.remove('dopen');if(t){const d=row.querySelector('.bd>div:first-child');if(d)d.innerHTML=esc(t.name)+tmark(t)}}   // 只更新那張卡片的小標記，不重畫整頁（免得清掉輸入框）
  if(imm){pn.remove();return}
  pn.classList.remove('on');setTimeout(()=>pn.remove(),320)}
function openDet(id,row){const t=by(id);if(!t)return;closePop('ok');
  if(detId===t.id)return closeDet();   // 再按一次就收起
  closeDet(true);detId=t.id;row.classList.add('dopen');row.insertAdjacentHTML('afterend',detPanel(t));
  const pn=row.nextElementSibling;requestAnimationFrame(()=>requestAnimationFrame(()=>pn.classList.add('on')));
  setTimeout(()=>pn.scrollIntoView({block:'nearest',behavior:'smooth'}),300)}
const detSet=f=>{const t=by(detId);if(!t)return;f(t);save();const l=pq('#td-ds');if(l)l.innerHTML=detSubs(t)};
function detAdd(keep){const i=pq('#td-sn'),v=i&&i.value.trim();if(!v)return;
  detSet(t=>{(t.subs=t.subs||[]).push({id:Date.now()+Math.floor(Math.random()*1000),text:v,done:false})});i.value='';if(keep!==false)i.focus()}
function noteEdit(on){const nv=pq('#td-nv'),nt=pq('#td-nt');if(!nv||!nt)return;
  if(on){nv.classList.add('hid');nt.classList.remove('hid');nt.style.height='auto';nt.style.height=Math.min(160,Math.max(64,nt.scrollHeight))+'px';nt.focus();nt.setSelectionRange(nt.value.length,nt.value.length)}
  else{const t=by(detId);if(t){t.note=nt.value.trim()?nt.value:'';save();nv.innerHTML=linkify(t.note);
    if(t.note){nv.classList.remove('hid');nt.classList.add('hid')}}}}
document.addEventListener('input',e=>{if(e.target.id!=='td-nt')return;const el=e.target;el.style.height='auto';el.style.height=Math.min(160,Math.max(64,el.scrollHeight))+'px';
  const t=by(detId);if(!t)return;t.note=el.value;clearTimeout(detSave);detSave=setTimeout(save,500)});
document.addEventListener('focusout',e=>{if(e.target.id==='td-nt')noteEdit(false);else if(e.target.id==='td-sn')detAdd(false)});   // 打到一半點別處，小步驟也先收進去   // 寫完離開輸入框，備註就變回可以點連結的樣子
document.addEventListener('keydown',e=>{if(e.target.id==='td-sn'&&e.key==='Enter'){e.preventDefault();detAdd()}});
document.addEventListener('click',e=>{if(!detId)return;const t=e.target;
  if(t.closest&&t.closest('#td-nv')&&!t.closest('a')){noteEdit(true);return}            // 點備註的空白處 → 編輯；點連結 → 照常開連結
  if(t.closest&&(t.closest('#td-dpn')||t.closest('.row.dopen')))return;
  closeDet()});   // 點旁邊的地方收起（不攔截那一下點擊）
/* 開啟方式：手機長按、電腦右鍵 */
const rowIdOf=r=>{const c=r&&r.querySelector('.ckz');return c&&c.dataset.id};
document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;const bd=e.target.closest&&e.target.closest('#todoRoot .row .bd');if(!bd)return;
  const r=bd.closest('.row');lpPos={x:e.clientX,y:e.clientY};clearTimeout(lpT);
  lpT=setTimeout(()=>{lpT=null;const id=rowIdOf(r);if(id){lpFired=true;navigator.vibrate&&navigator.vibrate(10);openDet(id,r)}},480)});
document.addEventListener('pointermove',e=>{if(lpT&&Math.hypot(e.clientX-lpPos.x,e.clientY-lpPos.y)>10){clearTimeout(lpT);lpT=null}});
['pointerup','pointercancel'].forEach(ev=>document.addEventListener(ev,()=>{clearTimeout(lpT);lpT=null;if(lpFired)setTimeout(()=>{lpFired=false},400)}));
document.addEventListener('click',e=>{if(lpFired){lpFired=false;e.stopPropagation();e.preventDefault()}},true);   // 長按放開後不要又當成一次點擊
document.addEventListener('contextmenu',e=>{const bd=e.target.closest&&e.target.closest('#todoRoot .row .bd');if(!bd)return;e.preventDefault();
  const r=bd.closest('.row'),id=rowIdOf(r);if(id)openDet(id,r)});
function addBox(){if(!addOpen)return'';
  return`<div class="add"><div class="in"><div class="nmrow"><input class="nm" id="td-nm" placeholder="想到什麼，打字" autocomplete="off"><button type="button" class="tbtn${optSet()?' has':''}" data-a="opts" aria-label="期限／時間／重複">${CLK}</button></div><div class="qhint" id="td-qh" style="display:none"></div></div><button class="addb" data-a="add">新增</button></div>`}
const MINS=['00','20','30','40'];   // 新增任務時「分」只給這幾個選項
/* 新增任務的選填項目：全部放在一個氣泡裡。選的值先存在這幾個變數，按「新增」才套用 */
let kdVal='',dtVal='',tmVal='',rpVal='';
const defKd=()=>view==='today'?'dayonly':'none',effKd=()=>kdVal||defKd();
const optSet=()=>!!(dtVal||tmVal||rpVal||(kdVal&&kdVal!==defKd()));
const WH=32,wheelCol=k=>document.querySelector('#td-wp [data-k="'+k+'"]');
const wheelIdx=el=>Math.max(0,Math.min(el.children.length-1,Math.round(el.scrollTop/WH)));
const wheelVal=k=>{const el=wheelCol(k);return el?el.children[wheelIdx(el)].dataset.v:''};
const mark=el=>{const i=wheelIdx(el);[...el.children].forEach((c,j)=>c.classList.toggle('on',j===i))};
document.addEventListener('scroll',e=>{const el=e.target;if(el.classList&&el.classList.contains('wc'))mark(el)},true);
document.addEventListener('click',e=>{const it=e.target.closest&&e.target.closest('.wc .wi');if(!it)return;
  const col=it.parentNode;col.scrollTo({top:[...col.children].indexOf(it)*WH,behavior:'smooth'})});
const popIn=e=>{const t=e.target;if(!t.id)return;
  if(t.id==='td-kd'){kdVal=t.value;popFill()}else if(t.id==='td-dt')dtVal=t.value;else if(t.id==='td-rp')rpVal=t.value};
document.addEventListener('input',popIn);document.addEventListener('change',popIn);
function popFill(){const w=document.getElementById('td-wp');if(!w)return;const k=effKd();w.dataset.kd=k;   // 依類型顯示／隱藏日期和時間
  if(k==='dayonly'){const [h,m]=(tmVal||'').split(':'),hc=wheelCol('h'),mc=wheelCol('m');
    hc.scrollTop=(h?parseInt(h)+1:0)*WH;mc.scrollTop=Math.max(0,MINS.indexOf(m))*WH;mark(hc);mark(mc)}}
function closePop(commit){const w=document.getElementById('td-wp'),bk=document.getElementById('td-wb');if(!w)return;
  if(commit==='clr'){kdVal=dtVal=tmVal=rpVal=''}
  else if(effKd()==='dayonly'){const h=wheelVal('h');tmVal=h?h+':'+wheelVal('m'):''}
  w.remove();bk&&bk.remove();const b=document.querySelector('#todoRoot .tbtn');if(b)b.classList.toggle('has',optSet())}
function openPop(btn){closePop('ok');
  const col=(k,list)=>`<div class="wc" data-k="${k}">${list.map(v=>`<div class="wi" data-v="${v==='--'?'':v}">${v}</div>`).join('')}</div>`;
  const bk=document.createElement('div');bk.id='td-wb';bk.dataset.a='w-ok';
  const w=document.createElement('div');w.id='td-wp';
  w.innerHTML=`<div class="prow"><select id="td-kd"><option value="dayonly">當天限定</option><option value="deadline">有截止日</option><option value="none">沒有期限</option></select></div>
<div class="prow r-dt"><input type="date" id="td-dt"></div>
<div class="r-tm"><div class="wheel">${col('h',['--',...Array.from({length:24},(_,i)=>pad(i))])}<b>:</b>${col('m',MINS)}</div></div>
<label class="prow rp"><input type="number" id="td-rp" min="1" max="365" inputmode="numeric" placeholder="—"> 天後重複提醒我</label>
<div class="wbtns"><button class="b q" data-a="w-clr">清除</button><button class="b" data-a="w-ok">完成</button></div>`;
  document.getElementById('todoFloat').append(bk,w);
  w.querySelector('#td-kd').value=effKd();w.querySelector('#td-dt').value=dtVal;w.querySelector('#td-rp').value=rpVal;
  popFill();
  const r=btn.getBoundingClientRect(),ww=w.offsetWidth,wh=w.offsetHeight;
  const left=Math.max(8,Math.min(r.right-ww,innerWidth-ww-8)),below=r.bottom+10+wh<=innerHeight-8;
  w.style.cssText=`left:${left}px;${below?'top:'+(r.bottom+10):'bottom:'+(innerHeight-r.top+10)}px;--ax:${Math.max(16,Math.min(ww-16,r.left+r.width/2-left))}px`;w.classList.add(below?'dn':'up')}
const dayStats=()=>S.tasks.filter(t=>t.done&&t.doneAt===today()).length;
/* 月曆圖示：點下去會展開手機的日期選擇器（透明的日期欄位蓋在圖示上，點到的就是它） */
const CAL='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v3.5M16 3v3.5"/><circle cx="8.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="12" cy="14.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="14.5" r=".9" fill="currentColor"/></svg>';
document.addEventListener('click',e=>{const i=e.target.closest&&e.target.closest('.cal input');if(i&&i.showPicker){try{i.showPicker()}catch(_){}}});   // 電腦版也能點圖示就開月曆
function renderToday(){const d=today(),c=S.cfg,open=S.tasks.filter(t=>!t.done);
  const lapsed=open.filter(t=>t.kind!=='none'&&t.date&&diff(t.date)<0);
  const soon=open.filter(t=>t.kind==='deadline'&&t.date&&diff(t.date)>=1&&diff(t.date)<=c.soon&&t.on!==d).sort(byDate);
  const mine=open.filter(t=>!lapsed.includes(t)&&grp(t)==='today').sort((a,b)=>(a.kind==='dayonly'&&a.time||'99:99')<(b.kind==='dayonly'&&b.time||'99:99')?-1:1);
  let h=`<div class="hrow"><h1>${new Date(Date.now()-c.reset*36e5).getMonth()+1} 月 ${new Date(Date.now()-c.reset*36e5).getDate()} 日</h1>${addTg()}</div><div class="sub">今天已解決 ${dayStats()} 件</div>${addBox()}`;
  if(lapsed.length)h+='<h2>過了日期，要怎麼處理？</h2>'+lapsed.map(t=>`<div class="row lapsed"><div class="bd"><div>${esc(t.name)}</div><span class="meta warn">${dueLabel(t)}</span></div><label class="cal" aria-label="改到別天"><span>${CAL}</span><input type="date" data-a="resched" data-id="${t.id}" min="${d}"></label><button class="del dk wide" data-a="del" data-id="${t.id}">不用做了</button></div>`).join('');
  h+='<h2>今天要做</h2>'+(mine.length?mine.map(t=>row(t,{unmark:1,inToday:1})).join(''):'<div class="empty">還沒有。打字新增，或從「全部」挑幾件過來。</div>');
  if(soon.length)h+=sec('t-soon','快到期',soon.length,`<div class="soon">${soon.map(t=>row(t)).join('')}</div>`);
  return h}
function renderAll(){const G={week:[],month:[],later:[],today:[]},N={week:'這週（7 天內）',month:'這個月（30 天內）',later:'有空再說',today:'今天'};
  S.tasks.filter(t=>!t.done).forEach(t=>G[grp(t)].push(t));
  let h=`<div class="hrow"><h1>全部</h1>${addTg()}</div><div class="sub">共 ${S.tasks.filter(t=>!t.done).length} 件未完成</div>${addBox()}`;
  for(const k of['week','month','later','today'])h+=sec('a-'+k,N[k],G[k].length,G[k].length?G[k].sort(byDate).map(t=>row(t,{cmp:1})).join(''):'<div class="empty">空的</div>');
  return h}
function renderFp(){const dn=S.tasks.filter(t=>t.done).sort((a,b)=>(b.doneTs||0)-(a.doneTs||0)).slice(0,5);
  const wk=S.tasks.filter(t=>t.done&&t.doneAt&&diff(t.doneAt)>=-6).length,tl=(n,l)=>`<div class="tile"><b>${n}</b><span>${l}</span></div>`;
  $('fpp').style.display=fpOpen?'block':'none';$('fpb').textContent=fpOpen?'▼':'▲';
  $('fpp').innerHTML=`<div class="tiles">${tl(dayStats(),'今天')}${tl(wk,'近 7 日')}${tl(S.best,'單日最高')}</div><div class="meta">最近完成</div>`+(dn.length?dn.map(t=>`<div class="rm"><span>${esc(t.name)}</span><span class="meta" style="flex:none">${t.doneTs?new Date(t.doneTs).toTimeString().slice(0,5):''}</span><button class="b" data-a="chk" data-id="${t.id}">復原</button></div>`).join(''):'<div class="empty">還沒有完成的事</div>')}
function render(){$('app').innerHTML=view==='today'?renderToday():renderAll();renderFp();}
function addTask(){const raw=$('nm').value.trim();if(!raw)return;closePop('ok');
  const q=qhOff?null:qParse(raw),n=q?q.name:raw;   // 氣泡裡手動選的優先，沒選的才用輸入框辨識出來的
  const kind=kdVal||(q&&q.kind)||defKd(),tm=tmVal||(q&&q.time)||'',rp=parseInt(rpVal)||(q&&q.repeat)||0;
  let date=dtVal||(q&&q.date)||(kind==='dayonly'?ymd(new Date(Date.now()-S.cfg.reset*36e5)):'');let k=kind;if(k!=='none'&&!date)k='none';
  const t={id:Date.now(),name:n,kind:k,date:k==='none'?'':date,time:k==='dayonly'?tm:'',repeat:rp,done:false,touched:Date.now()};
  if(view==='today'&&(k==='none'||date===today()))t.on=today();
  S.tasks.push(t);kdVal=dtVal=tmVal=rpVal='';qhOff=false;save();render();$('nm').focus();
  toast('已新增',null,()=>{S.tasks=S.tasks.filter(x=>x!==t);save();render()},5000)}
let askBack=null;
function ask(msg,ok,back){pend=ok;askBack=back||null;ovMode='ask';$('ov').innerHTML=`<div class="box"><div class="t">${esc(msg)}</div><div class="foot"><button class="b q" data-a="c-no">取消</button><button class="b dk" data-a="c-yes">確定</button></div></div>`;$('ov').className='on'}
function suggest(){const d=today();if(S.sug.d!==d)S.sug={d,n:0};if(S.sug.n>=S.cfg.sugMax)return;
  const pool=S.tasks.filter(t=>!t.done&&grp(t)==='later'&&S.skip[t.id]!==d);if(!pool.length)return;
  const old=pool.filter(t=>age(t)>=S.cfg.stale).sort((a,b)=>a.touched-b.touched)[0];
  const t=old||pool[Math.floor(Math.random()*pool.length)];sugId=t.id;ovMode='sug';S.sug.n++;save();
  $('ov').innerHTML=`<div class="box"><div class="t"><div class="meta">順手做一件？（今天第 ${S.sug.n}／${S.cfg.sugMax} 次）</div><p style="font-size:18px;margin:8px 0 4px">${esc(t.name)}</p><div class="meta">${age(t)>=S.cfg.stale?'放了 '+age(t)+' 天了':'沒有急的期限'}</div></div><div class="foot"><button class="b" data-a="m-today">今天做</button><button class="b q" data-a="m-skip">改天</button><button class="b dk" data-a="m-del">放掉</button></div></div>`;$('ov').className='on'}
/* 完成任務特效：① 卡片「瞬間」罩上一層半透明的白金色（任務名稱仍看得到），並微微放大發光
   → ② 白光從左掃過 → ③ 碎成藍／金／白交雜的方塊落下，同時迸出幾顆金色小星星 → ④ 卡片消失。
   全部用程式直接建立元素與動畫（不依賴 CSS 檔，不會被舊快取或樣式蓋掉）。 */
/* ── 完成動畫：依「今天第幾件」換不同的版本（只有破紀錄才會碎裂） ──
   1～2 件：星星原地快速放大縮小、淡出　3～5 件：星星往上飄出（比 1～2 件大一點點）
   6 件以上：往上飄的星星＋爆開（越多件越強）　破今日紀錄：碎裂＋最大版＋星星雨＋文字 */
const fxR=(a,b)=>a+Math.random()*(b-a);
const fxMk=(css,txt)=>{const e=document.createElement('i');e.style.cssText='position:fixed;pointer-events:none;font-style:normal;line-height:1;'+css;if(txt)e.textContent=txt;document.body.append(e);return e};
const fxGo=(e,kf,o)=>{e.animate(kf,Object.assign({fill:'forwards'},o)).onfinish=()=>e.remove()};
const fxStar=(x,y,sz,col)=>fxMk(`left:${x}px;top:${y}px;font-size:${sz}px;color:${col||'#e8c35a'};text-shadow:0 0 8px rgba(232,195,90,.95),0 0 16px rgba(232,195,90,.6);z-index:22`,'✦');
function fxTwinkle(b,n){   // 1～2 件：原地閃，快速小幅放大縮小，然後淡出
  for(let i=0;i<6+n*2;i++){const st=fxStar(b.left-10+fxR(0,b.width+20),b.top-14+fxR(0,b.height+28),fxR(18,28),i%3?'#e8c35a':'#fff');
    fxGo(st,[{opacity:0,transform:'scale(.3)'},{opacity:1,transform:'scale(1)',offset:.15},{opacity:1,transform:'scale(1.3)',offset:.3},{opacity:.85,transform:'scale(.8)',offset:.45},
      {opacity:1,transform:'scale(1.25)',offset:.6},{opacity:.85,transform:'scale(.85)',offset:.75},{opacity:0,transform:'scale(.5)'}],{duration:fxR(1150,1500),delay:fxR(0,400),easing:'ease-in-out'})}}
function fxRise(b,big){   // 金色小星星從卡片往上迸出（big：3～5 件用，比 1～2 件大一點點）
  for(let k=0;k<6;k++){const st=fxStar(b.left+b.width*fxR(.1,.9),b.top+b.height*fxR(.2,.7),big?fxR(24,36):fxR(10,20));
    fxGo(st,[{transform:'translate(0,0) scale(.3) rotate(0)',opacity:0},{transform:`translate(${fxR(-25,25)}px,${fxR(-54,-24)}px) scale(1.2) rotate(40deg)`,opacity:1,offset:.35},{transform:`translate(${fxR(-35,35)}px,${fxR(-90,-50)}px) scale(.5) rotate(90deg)`,opacity:0}],{duration:fxR(700,1000),delay:fxR(0,150),easing:'ease-out'})}}
function fxBurst(b,n,rec){const L=rec?12:n-5,cx=b.left+b.width/2,cy=b.top+b.height/2,N=Math.min(16+L*6,rec?90:68),far=Math.min(100+L*16,rec?300:230);
  for(let i=0;i<N;i++){const a=fxR(0,6.283),d=fxR(far*.4,far),big=i%4===0,st=fxStar(cx,cy,big?fxR(20,32):fxR(10,18),i%3?'#e8c35a':(i%2?'#fff':'#9ec1ea'));
    fxGo(st,[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:`translate(calc(-50% + ${Math.cos(a)*d*.7}px),calc(-50% + ${Math.sin(a)*d*.7}px)) scale(1.2) rotate(${fxR(-90,90)}deg)`,opacity:1,offset:.4},
      {transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d+30}px)) scale(.3) rotate(${fxR(-180,180)}deg)`,opacity:0}],{duration:fxR(900,1500),delay:fxR(0,120),easing:'cubic-bezier(.2,.7,.3,1)'})}
  const rings=1+(L>=3)+(L>=6)+(rec?1:0);
  for(let k=0;k<rings;k++){const o=fxMk(`left:${cx}px;top:${cy}px;width:20px;height:20px;border:${3-(k>1)}px solid ${k%2?'#fff':'#e8c35a'};border-radius:50%;z-index:19;box-shadow:0 0 14px rgba(232,195,90,.7)`);
    fxGo(o,[{transform:'translate(-50%,-50%) scale(.3)',opacity:.9},{transform:`translate(-50%,-50%) scale(${far/10+k*3})`,opacity:0}],{duration:900+k*200,delay:k*140,easing:'ease-out'})}
  if(L>=4||rec){const f=fxMk(`inset:0;z-index:18;background:radial-gradient(circle at ${cx}px ${cy}px,rgba(255,244,200,${rec?.7:.35}),transparent 65%)`);fxGo(f,[{opacity:0},{opacity:1,offset:.15},{opacity:0}],{duration:rec?1400:700})}}
function fxRecord(b){fxBurst(b,0,true);
  for(let i=0;i<46;i++){const st=fxStar(fxR(0,innerWidth),-30,fxR(12,28),i%3?'#e8c35a':'#fff'),x=fxR(-30,30);
    fxGo(st,[{transform:'translate(0,0) rotate(0)',opacity:0},{opacity:1,offset:.12},{opacity:.4,offset:.35},{opacity:1,offset:.55},{opacity:.4,offset:.75},{transform:`translate(${x}px,${innerHeight+60}px) rotate(${fxR(-120,120)}deg)`,opacity:0}],{duration:fxR(2200,3600),delay:fxR(200,1600),easing:'linear'})}
  const t=fxMk('left:50%;top:38%;z-index:30;font-size:26px;font-weight:700;letter-spacing:.12em;color:#fff;white-space:nowrap;text-shadow:0 0 18px rgba(232,195,90,.95),0 2px 10px rgba(0,0,0,.35)','✦ 今日新紀錄 ✦');
  fxGo(t,[{transform:'translate(-50%,-50%) scale(.5)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.2},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.75},{transform:'translate(-50%,-70%) scale(1)',opacity:0}],{duration:2200,delay:300,easing:'ease-out'})}
function fx(r,cb,n,rec){let ok=0;const fin=()=>{if(!ok){ok=1;cb()}};
  try{fxRun(r,fin,n,rec)}catch(e){console.error('fx',e);fin()}}
function fxRun(r,cb,n,rec){
  navigator.vibrate&&navigator.vibrate(rec?[20,40,20,40,40]:15);
  const shatter=rec,D=640,b0=r.getBoundingClientRect();
  const o=document.createElement('div');   // 蓋在卡片上的白金色薄紗（半透明：底下的字還看得到）
  o.style.cssText=`position:fixed;z-index:21;left:${b0.left}px;top:${b0.top}px;width:${b0.width}px;height:${b0.height}px;border-radius:10px;overflow:hidden;pointer-events:none;`
    +'background:rgba(236,224,184,.5);opacity:0';
  const sw=document.createElement('div');  // 白光掃過的光帶
  sw.style.cssText='position:absolute;top:0;bottom:0;left:0;width:100%;background:linear-gradient(105deg,transparent 10%,rgba(255,255,255,.5) 36%,#fff 50%,rgba(255,255,255,.5) 64%,transparent 90%);transform:translateX(-120%)';
  o.append(sw);document.body.append(o);
  const pop=[{transform:'scale(1)',boxShadow:'0 0 0 rgba(214,196,140,0)'},{transform:'scale(1.035)',boxShadow:'0 0 22px rgba(214,196,140,.85)',offset:.15},{transform:'scale(1.02)',boxShadow:'0 0 14px rgba(214,196,140,.55)'}];
  o.animate([{opacity:0},{opacity:1,offset:.06},{opacity:1}],{duration:D,fill:'forwards'});   // 約 40ms 內罩上 = 瞬間
  o.animate(pop,{duration:D,easing:'ease-out',fill:'forwards'});
  r.animate(pop,{duration:D,easing:'ease-out',fill:'forwards'});
  sw.animate([{transform:'translateX(-120%)'},{transform:'translateX(120%)'}],{duration:D-110,delay:80,easing:'linear',fill:'forwards'});
  setTimeout(()=>{o.remove();
    if(!shatter){   // 不碎：卡片輕輕縮小淡出，畫面留給星星
      r.animate([{opacity:1,transform:'scale(1.02)'},{opacity:0,transform:'scale(.96)'}],{duration:380,easing:'ease-in',fill:'forwards'});
      if(n<3)fxTwinkle(b0,n);else if(n<6)fxRise(b0,true);else{fxRise(b0);fxBurst(b0,n)}
      setTimeout(cb,360);return}
    const b=r.getBoundingClientRect(),cols=12,rows=3,w=b.width/cols,h=b.height/rows,C=['#e8c35a','#f3dc8f','#3A6EA5','#b9c9dd','#ffffff'];
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const p=fxMk(`z-index:20;left:${b.left+i*w}px;top:${b.top+j*h}px;width:${w}px;height:${h}px;background:${C[(i*7+j*3)%5]}`);
      fxGo(p,[{transform:'none',opacity:1},{transform:`translate(${fxR(-40,40)}px,${fxR(140,260)}px) rotate(${fxR(-80,80)}deg)`,opacity:0}],{duration:fxR(650,1000),delay:fxR(0,120),easing:'cubic-bezier(.5,0,1,.6)'})}
    fxRise(b);
    if(rec)fxRecord(b);
    r.style.visibility='hidden';setTimeout(cb,350)},D+20)}
function act(a,id,val){const t=by(id);if(!t)return;
  if(a==='chk'){t.done=!t.done;t.doneAt=t.done?today():null;t.doneTs=t.done?Date.now():0;
    if(t.done){const n=dayStats();let m='解決了 ✓';if(S.best>0&&n>S.best)m+='　單日新紀錄 '+n+' 件！';S.best=Math.max(S.best,n);
      if(t.repeat){const x=new Date(today()+'T00:00');x.setDate(x.getDate()+t.repeat);
        const nx={id:Date.now()+1,name:t.name,kind:'deadline',date:ymd(x),time:'',repeat:t.repeat,done:false,touched:Date.now()};S.tasks.push(nx);t.nextId=nx.id;m+='　'+t.repeat+' 天後再提醒'}
      toast(m,t.id)}
    else{if(t.nextId){const n=by(t.nextId);if(n&&!n.done)S.tasks=S.tasks.filter(x=>x!==n);t.nextId=null}toast('已取消完成')}}
  else if(a==='today'){t.on=today();t.touched=Date.now()}
  else if(a==='untoday')t.on=null;
  else if(a==='resched'){if(!val)return;t.date=val;t.touched=Date.now()}
  else if(a==='del'){const i=S.tasks.indexOf(t);S.tasks=S.tasks.filter(x=>x!==t);save();render();   // 直接刪，5 秒內可按「復原」放回原位
    toast('已刪除',null,()=>{S.tasks.splice(Math.min(i,S.tasks.length),0,t);save();render()},5000);return}
  else return;save();render()}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.closest&&e.target.closest('.add'))addTask()});
document.addEventListener('click',e=>{
  if(fpOpen&&!e.target.closest('#td-fp')){fpOpen=false;renderFp()}
  if(!e.target.closest('#todoRoot,#todoFloat'))return;
  const el=e.target.closest('[data-a]');if(!el||el.matches('select,input'))return;const a=el.dataset.a,id=el.dataset.id;
  if(a==='peek'){if(!matchMedia('(hover:none)').matches)return;   // 電腦版用游標指上去，不用點
    const r=el.closest('.row'),on=r.classList.toggle('show');on?peek.add(Number(id)):peek.delete(Number(id));return}
  if(a==='opts')return openPop(el);
  if(a==='d-ok')return closeDet();
  if(a==='d-add')return detAdd();
  if(a==='d-tg'){const sid=el.dataset.sid;detSet(t=>{const x=(t.subs||[]).find(v=>v.id==sid);if(x)x.done=!x.done});
    const b=pq('.dck[data-sid="'+sid+'"]');if(b&&b.parentNode.classList.contains('dn'))b.classList.add('pop');return}   // 勾起來的星星閃一下
  if(a==='d-rm'){detSet(t=>{t.subs=(t.subs||[]).filter(v=>v.id!=el.dataset.sid)});return}
  if(a==='qh-x'){qhOff=true;qHint();const i=$('nm');i&&i.focus();return}
  if(a==='w-ok')return closePop('ok');
  if(a==='w-clr')return closePop('clr');
  if(a==='add')return addTask();
  if(a==='go')return go(el.dataset.v);
  if(a==='addfold'){addOpen=!addOpen;try{localStorage.setItem(AF,addOpen?'0':'1')}catch(e){}render();if(addOpen)setTimeout(()=>{const n=$('nm');if(n)n.focus()},0);return}
  if(a==='fold'){S.fold[el.dataset.k]=S.fold[el.dataset.k]===false;save();return render()}
  if(a==='s-close'){$('ov').className='';return}
  if(a==='s-sync'){syncClick();return}
  if(a==='s-out'){$('ov').className='';if(typeof window.ownerSignOut==='function')window.ownerSignOut();return}
  if(a==='s-tdur'){const mm=parseInt(el.dataset.m);if(typeof window._setTokenMinutes==='function')window._setTokenMinutes(mm);
    document.querySelectorAll('#td-tkp [data-m]').forEach(x=>{const on=x===el;x.classList.toggle('dk',on);x.classList.toggle('q',!on)});return}
  if(a==='s-tgen'){if(typeof window.generateToken==='function')window.generateToken();return}
  if(a==='s-link'){const say=m=>typeof window.showToast==='function'&&window.showToast(m);
    if(typeof window._fbLinkGoogle!=='function')return say('Firebase 尚未就緒');
    window._fbLinkGoogle().then(()=>{say('✅ 已綁定 Google，之後用 Google 登入會讀到同一份資料');openSet()}).catch(err=>{
      const m={'auth/credential-already-in-use':'這個 Google 帳號已經是另一個獨立帳號。請到 Firebase 主控台 → Authentication → Users 刪掉它，再回來綁定一次',
        'auth/provider-already-linked':'已經綁定過 Google 了','auth/popup-closed-by-user':'已取消','auth/cancelled-popup-request':'已取消',
        'auth/operation-not-allowed':'Firebase 後台尚未啟用 Google 登入方式','auth/unauthorized-domain':'這個網址尚未加入 Firebase 授權網域'};
      say('❌ '+(m[err.code]||('綁定失敗：'+(err.code||err.message))))});return}
  if(a==='s-n'){const f=window[el.dataset.f];if(typeof f==='function')f();return}
  if(a==='s-tab'){stab=el.dataset.k;bkMsg='';bkUndo=false;return openSet()}
  if(a==='s-do'){const v=$('bk').value;
    if(v==='full')dl('aethelgard-backup-'+today()+'.json',JSON.stringify(fullBackup(),null,1));
    else if(v==='tasks')dl('tasks-'+today()+'.json',JSON.stringify(S,null,1));
    else{const f=window[{notesJson:'notesExportJson',notesMd:'notesExportMd',notesTxt:'notesExportTxt'}[v]];if(typeof f==='function')f()}
    return}
  if(a==='s-undo'){const pv=readPrev();if(!pv)return;ask('復原上次還原？\n會把任務'+(pv.tabs?'和筆記':'')+'換回還原之前的樣子。',()=>{bkMsg=applyBackup({tasks:pv.tasks,tabs:pv.tabs})+'（已復原）';bkUndo=false;openSet()},openSet);return}
  if(a==='c-no'){pend=null;$('ov').className='';if(askBack){const b=askBack;askBack=null;b()}return}
  if(a==='c-yes'){const f=pend;pend=null;askBack=null;$('ov').className='';f&&f();return}
  if(a.startsWith('m-')){const t=by(sugId);$('ov').className='';if(!t)return;
    if(a==='m-today')act('today',t.id);else if(a==='m-skip'){S.skip[t.id]=today();save()}else act('del',t.id);return}
  const t=by(id);if(a==='chk'&&t&&!t.done&&S.cfg.fx){const r=el.closest('.row');if(r){const n=dayStats()+1;return fx(r,()=>act(a,id),n,S.best>0&&n>S.best)}}
  act(a,id)});
$('ov').addEventListener('click',e=>{if(e.target.id!=='td-ov')return;if(ovMode==='sug'){const t=by(sugId);if(t){S.skip[t.id]=today();save()}}pend=null;$('ov').className=''});
document.addEventListener('change',e=>{const el=e.target;if(el.matches('input[type=date][data-a]'))act(el.dataset.a,el.dataset.id,el.value)});
$('toast').onclick=()=>{if(toast.fn){const f=toast.fn;toast.fn=null;$('toast').classList.remove('on');f();return}const id=$('toast').dataset.id;if(id){$('toast').classList.remove('on');act('chk',id)}};
$('fpb').onclick=e=>{e.stopPropagation();fpOpen=!fpOpen;renderFp()};
let stab='gen',bkMsg='',bkUndo=false;
/* ── 備份／還原 ── */
const KB=K+'_lastbak',KP=K+'_prev';   // 上次備份時間、還原前自動留的一份
const notesTabs=()=>{try{const p=typeof window._notesGetSyncPayload==='function'&&window._notesGetSyncPayload();return p&&Array.isArray(p.tabs)?p.tabs:null}catch(e){return null}};
function dl(name,text){const u=URL.createObjectURL(new Blob([text],{type:'application/json'})),x=document.createElement('a');x.href=u;x.download=name;document.body.appendChild(x);x.click();x.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
  try{localStorage.setItem(KB,String(Date.now()))}catch(e){}}
function fullBackup(){const tabs=notesTabs();return Object.assign({app:'aethelgard',exportedAt:new Date().toISOString()},S,tabs?{notes:{tabs}}:{})}
/* 看懂各種備份檔：完整備份、舊版只有任務的備份、只有筆記的備份 */
function parseBackup(j){if(!j||typeof j!=='object')return null;let tasks=null,tabs=null;
  if(Array.isArray(j.tasks)){tasks=Object.assign({},j);delete tasks.notes;delete tasks.exportedAt;delete tasks.app}
  const nt=(j.notes&&j.notes.tabs)||j.tabs||(Array.isArray(j)?j:null);if(Array.isArray(nt)&&nt.length)tabs=nt;
  return tasks||tabs?{tasks,tabs,at:j.exportedAt||''}:null}
const readPrev=()=>{try{return JSON.parse(localStorage.getItem(KP))}catch(e){return null}};
function applyBackup(b){   // 還原前先把目前的資料留一份，之後可以按「復原」
  try{localStorage.setItem(KP,JSON.stringify({at:Date.now(),tasks:S,tabs:notesTabs()}))}catch(e){}
  const out=[];
  if(b.tasks){S=b.tasks;norm();save();render();out.push('任務 '+S.tasks.length+' 件')}
  if(b.tabs&&typeof window.notesApplyTabs==='function'){window.notesApplyTabs(b.tabs);out.push('筆記 '+b.tabs.length+' 個標籤')}
  return '已還原：'+out.join('、')}
const ago=ts=>{if(!ts)return null;const n=Math.floor((Date.now()-ts)/864e5);return n<=0?'今天':n===1?'昨天':n+' 天前'};
function backupPane(){
  const pv=readPrev();
  return `<div class="sh">匯出</div>
<div class="brow"><select id="td-bk" style="flex:1;min-width:0;padding:8px"><option value="full">任務＋筆記（完整備份）</option><option value="tasks">只有任務</option><option value="notesJson">筆記 JSON</option><option value="notesMd">筆記 MD</option><option value="notesTxt">筆記 TXT</option></select><button class="b dk" data-a="s-do" style="border-radius:10px;padding:0 18px">匯出</button></div>
<div class="sh">還原</div>
<label class="b q sbtn upl">選擇備份檔…<input type="file" id="td-imp" accept=".json,application/json"></label>
${bkMsg?`<div class="bkmsg">${esc(bkMsg)}</div>`:''}
${bkMsg&&bkUndo&&pv?`<div class="brow" style="margin-top:8px"><button class="b q sbtn" data-a="s-undo">復原</button></div>`:''}`}
function openSet(){ovMode='set';const o=(k,min,max)=>`<input type="number" data-c="${k}" min="${min}" max="${max}" inputmode="numeric">`;
  const row=(t,d,c)=>`<div class="srow"><div class="sx"><div class="st">${t}</div>${d?`<div class="sd">${d}</div>`:''}</div><div class="sc">${c}</div></div>`;
  const TB=[['gen','⚙','一般'],['tok','🔑','通行碼'],['acct','◉','帳號'],['exp','⇩','備份']];
  if(!TB.some(t=>t[0]===stab))stab=TB[0][0];
  const info=(window._fbAuthInfo&&window._fbAuthInfo())||{},email=info.email||(window._fbAuth&&window._fbAuth.currentUser&&window._fbAuth.currentUser.email)||'',
    hasG=(info.providers||[]).includes('google.com');
  const P={gen:row('快到期提醒','截止前幾天，列入「快到期」',o('soon',0,60)+'天')
    +row('久放任務優先','沒期限的任務放太久，會優先彈出',o('stale',1,365)+'天')
    +row('順手做一件','每天最多彈出幾次',o('sugMax',0,20)+'次')
    +row('每日重置時間','過了這個時間才算新的一天',`<select data-c="reset">${Array.from({length:24},(_,i)=>`<option value="${i}">${pad(i)}:00</option>`).join('')}</select>`)
    +row('完成特效','勾掉任務時的動畫','<select data-c="fx"><option value="1">開啟</option><option value="0">關閉</option></select>'),
  tok:`<div class="sh">有效時間</div>
<div id="td-tkp" class="tkchips">${[[30,'30 分鐘'],[60,'1 小時'],[180,'3 小時'],[480,'8 小時']].map(([m,l])=>`<button class="b ${(window._getTokenMinutes?window._getTokenMinutes():30)===m?'dk':'q'}" data-a="s-tdur" data-m="${m}">${l}</button>`).join('')}</div>
<div class="sh">通行碼</div>
<div class="tkrow"><div id="td-tkcode" class="tkcode">——————</div><button class="b dk" data-a="s-tgen">產生</button></div>
<div class="meta" id="td-tkst" style="margin-top:8px;min-height:16px"></div>`,
  acct:(email?row('登入帳號',`<span style="word-break:break-all">${esc(email)}</span>`,''):'')
    +(hasG?row('Google 登入','已綁定，用 Google 登入會看到同一份資料','<span class="okmark">✓ 已綁定</span>')
          :row('Google 登入','綁定後，也能用 Google 登入並看到同一份資料','<button class="b q" data-a="s-link" style="border-radius:8px;min-height:36px;padding:0 14px">綁定</button>'))
    +`<button class="b dk sbtn" data-a="s-out" style="margin-top:14px">登出</button><div class="ver">版本 ${esc(window._BUILD||'—')}</div>`,
  exp:backupPane()};
  $('ov').innerHTML=`<div class="box sb p1" style="height:clamp(380px,60vh,540px);max-height:92vh;overflow:hidden"><div class="tabs">${TB.map(([k,i,l])=>`<button class="tb ${k===stab?'on':''}" data-a="s-tab" data-k="${k}"><i>${i}</i>${l}</button>`).join('')}</div><div class="pane" style="min-height:0"><div class="pc" style="min-height:0;overflow-y:auto">${P[stab]}</div><div class="foot"><button class="b" data-a="s-close">完成</button></div></div></div>`;
  $('ov').querySelectorAll('[data-c]').forEach(el=>{const k=el.dataset.c;el.value=S.cfg[k];el.onchange=()=>{const v=parseInt(el.value);if(v>=0){S.cfg[k]=v;save();render();}}});
  const im=$('imp');if(im)im.onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
    f.text().then(txt=>{let j;try{j=JSON.parse(txt)}catch(x){}const b=parseBackup(j);
      if(!b){bkMsg='這個檔案看不出是備份檔（需要是從這裡下載的 .json）';return openSet()}
      const when=b.at&&!isNaN(new Date(b.at))?'（'+new Date(b.at).toLocaleDateString()+' 的備份）':'';
      const nt=notesTabs(),L=['還原「'+f.name+'」'+when+'？'];
      if(b.tasks)L.push('任務：目前 '+S.tasks.length+' 件 → 備份裡 '+b.tasks.tasks.length+' 件');
      if(b.tabs)L.push('筆記：目前 '+(nt?nt.length:0)+' 個標籤 → 備份裡 '+b.tabs.length+' 個標籤');
      L.push('這些會取代目前的資料。');
      ask(L.join('\n'),()=>{bkMsg=applyBackup(b);bkUndo=true;openSet()},openSet)})};
  if(typeof window._tokRestore==='function')window._tokRestore();
  $('ov').className='on'}
$('gear').onclick=openSet;
render();

/* ===== 與整個 app 的銜接 ===== */
const REF=()=>window._fbDoc(window._fbDb,'Aethelgard','todo');
/* 「待同步」判斷：本機最後修改時間 > 最後一次確認與雲端一致的時間。存在 localStorage，重開 App 也算得出來
   （Firestore 離線時只把寫入暫存在記憶體，關掉 App 就沒了，所以不能靠它） */
const KS=K+'_synced';
function markSynced(){try{localStorage.setItem(KS,String(S.updatedAt||0))}catch(e){}dirty=false;statusUpd()}
async function push(){const seq=saveSeq;
  try{await window._fbSetDoc(REF(),{json:JSON.stringify(S),updatedAt:S.updatedAt||Date.now()},{merge:true});if(seq===saveSeq)markSynced()}
  catch(e){console.warn('[todo push]',e)}
  statusUpd()}
async function pull(){
  if(!(window._fbIsOwner&&window._fbUid&&window._fbDb&&window._fbGetDoc))return false;
  try{const snap=await window._fbGetDoc(REF());
    if(snap.exists()){const d=snap.data(),cu=d.updatedAt||0,lu=S.updatedAt||0;
      if(cu>lu){S=JSON.parse(d.json||'{}');norm();S.updatedAt=cu;try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}markSynced();render()}
      else if(lu>cu)await push();
      else markSynced()}
    else if((S.tasks&&S.tasks.length)||S.updatedAt)await push();
    else markSynced();
    cloudReady=true;statusUpd();return true}catch(e){console.warn('[todo pull]',e);return false}}
/* 立刻同步一次（連上網、切回前景、點狀態點時用）；剛恢復連線時 Firestore 可能還沒接上，失敗就稍後再試 */
let syncAt=0;   // 同步鎖：離線時 Firestore 的寫入會一直「等待中」不回應，所以鎖要有逾時，不能永遠卡住
async function syncNow(tries){if(syncAt&&Date.now()-syncAt<15000)return false;
  if(!(window._fbIsOwner&&window._fbUid&&window._fbDb&&window._fbGetDoc))return false;
  syncAt=Date.now();clearTimeout(pushT);let ok=false;
  try{ok=await Promise.race([pull(),new Promise(r=>setTimeout(()=>r(false),15000))])}finally{syncAt=0}
  if(!ok&&(tries||0)<3&&navigator.onLine!==false)setTimeout(()=>syncNow((tries||0)+1),3000);
  if(ok){try{if(typeof _pushNotesEmergency==='function')_pushNotesEmergency('同步')}catch(e){}}
  statusUpd();return ok}
window._todoSyncNow=syncNow;window._todoToast=toast;

/* ===== 同步狀態點（頂列）：已同步 / 待同步 / 離線 / 連線中 ===== */
function stateNow(){
  const nd=(typeof _notesDirty!=='undefined'&&_notesDirty)||(typeof window._notesPendingGet==='function'&&window._notesPendingGet()),pend=dirty||nd;
  if(navigator.onLine===false)return[pend?'off pend':'off','離線'];   // 離線且有待同步：同樣顯示「離線」，圓點改橘色
  if(pend)return['pend','待同步'];
  if(!cloudReady)return['wait','連線中'];
  return['ok','']}
function statusUpd(){const el=document.getElementById('td-sync');if(!el)return;
  const [c,t]=stateNow();el.className='syn '+c;el.querySelector('span').textContent=t;
  el.setAttribute('aria-label','同步狀態：'+(t||'已同步'))}
const SYNMSG={ok:'已同步到雲端',pend:'有修改還沒同步，連上網就會送出',off:'目前離線，修改都先存在手機，連上網會自動同步（橘點＝有修改還沒送出）',wait:'正在連線雲端…'};
function syncClick(){const c=stateNow()[0].split(' ')[0];toast(SYNMSG[c]);if(navigator.onLine!==false)syncNow()}
addEventListener('online',()=>{statusUpd();syncNow()});
addEventListener('offline',statusUpd);
setInterval(statusUpd,1500);

function startCloud(){
  const t=setInterval(async()=>{
    if(!(window._fbIsOwner&&window._fbUid&&window._fbGetDoc))return;
    clearInterval(t);
    const go=async()=>{if(await pull()){setTimeout(suggest,1500)}else if(++pullTries<6)setTimeout(go,8000)};go()},800);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow()})}
const OLD=['tree','tasks','sandbox','wishzone','stats'];
let cur='today';
function markTabs(c){cur=c;document.querySelectorAll('#td-topbar [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===c))}
function go(v){closePop('ok');closeDet(true);if(v==='notes'){if(typeof window.showPage==='function')window.showPage('notes');markTabs('notes');return}
  view=v;render();if(typeof window.showPage==='function')window.showPage('todo');markTabs(v)}
window.todoGo=go;
function wrapShowPage(){const sp=window.showPage;if(typeof sp!=='function'||sp._td)return;
  window.showPage=function(id,skip){if(OLD.includes(id))id='todo';const r=sp.call(this,id,skip);markTabs(id==='notes'?'notes':view);return r};window.showPage._td=1}
function setTop(){const b=document.getElementById('td-topbar');if(b)document.documentElement.style.setProperty('--tdtop',b.offsetHeight+'px')}
function boot(){wrapShowPage();
  try{dirty=(S.updatedAt||0)>(Number(localStorage.getItem(KS))||0)}catch(e){}statusUpd();
  setTop();addEventListener('resize',setTop);go('today');startCloud()}

boot();
})();
