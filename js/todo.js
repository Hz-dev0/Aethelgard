/* 新版任務介面（由試玩版整合）：今天／全部，資料同步到 Firestore 的 Aethelgard/todo */
(function(){

const root=document.getElementById('todoRoot');
root.innerHTML='<div class="topbar" id="td-topbar"><button class="tab" data-a="go" data-v="today">今天</button><button class="tab" data-a="go" data-v="all">全部</button><button class="tab" data-a="go" data-v="notes">筆記</button><span class="sp"></span><button class="tab" id="td-gear">設定</button></div><div class="tmain"><div id="td-app"></div></div>';
const fl=document.createElement('div');fl.id='todoFloat';
fl.innerHTML='<div id="td-toast"></div><div id="td-fp"><button id="td-fpb" aria-label="完成紀錄">▲</button><div id="td-fpp"></div></div><div id="td-ov"></div>';
document.body.appendChild(fl);

const K='aeth_todo_v1';
let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}
const norm=()=>{S=S||{};S.tasks=S.tasks||[];S.cfg=Object.assign({soon:3,stale:14,sugMax:3,reset:4,fx:1,tabPos:0},S.cfg);S.skip=S.skip||{};S.fold=S.fold||{};S.sug=S.sug||{d:'',n:0};S.best=S.best||0};norm();
let view='today',fpOpen=false,sugId=null,pend=null,ovMode='';
const save=()=>{S.updatedAt=Date.now();try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}if(cloudReady){clearTimeout(pushT);pushT=setTimeout(push,800)}};
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
  if(t.kind==='dayonly')return d===0?'今天'+(t.time?' '+t.time+' ':'')+'才能做':d>0?'限 '+t.date+tm+'（剩 '+d+' 天）':'日子已過';
  return d===0?'今天截止':d>0?'剩 '+d+' 天（'+t.date+'）':'已過期 '+(-d)+' 天'}
function toast(m,id){const t=$('toast');t.textContent=m;t.dataset.id=id||'';t.style.pointerEvents=id?'auto':'none';
  if(id){const b=document.createElement('b');b.textContent='　復原';b.style.cursor='pointer';t.append(b)}
  t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),id?3500:1400)}
function row(t,o={}){const m=[],d=today();
  const dayToday=t.kind==='dayonly'&&t.date===d,auto=t.kind!=='none'&&t.date===d;
  if(dayToday&&o.inToday){if(t.time)m.push(`<span class="meta warn">${t.time}</span>`)}
  else if(t.kind!=='none'&&t.date)m.push(`<span class="meta ${diff(t.date)<=S.cfg.soon?'warn':''}">${dueLabel(t)}</span>`);
  if(t.repeat)m.push(`<span class="meta">↻ 每 ${t.repeat} 天</span>`);
  let side='';
  if(auto){}else if(!t.done&&t.on!==d)side=`<button class="b" data-a="today" data-id="${t.id}">今天做</button>`;
  else if(!t.done&&o.unmark)side=`<button class="b q" data-a="untoday" data-id="${t.id}">先不做</button>`;
  return `<div class="row"><button class="ckz" data-a="chk" data-id="${t.id}" aria-label="完成"><span class="ck"></span></button><div class="bd"><div>${esc(t.name)}</div>${m.join(' ')}</div>${side?`<div class="side">${side}</div>`:''}<button class="del dk" data-a="del" data-id="${t.id}" aria-label="刪除">刪除</button></div>`}
function sec(k,title,n,body){const o=S.fold[k]!==false;return `<h2 class="fold" data-a="fold" data-k="${k}">${o?'▾':'▸'} ${title}（${n}）</h2>`+(o?body:'')}
function addBox(){return `<div class="add"><div class="in"><input class="nm" id="td-nm" placeholder="想到什麼，打字" autocomplete="off"><details><summary>期限／時間（選填）</summary><div class="opts">
<select id="td-kd"><option value="dayonly"${view==='today'?' selected':''}>當天限定</option><option value="deadline">有截止日</option><option value="none"${view==='all'?' selected':''}>沒有期限</option></select>
<input type="date" id="td-dt"><input type="time" id="td-tm"></div>
<div class="opts"><label class="meta">完成後 <input type="number" id="td-rp" min="1" max="365" placeholder="—" style="width:64px"> 天再提醒我（重複的事才填）</label></div></details></div><button class="addb" data-a="add">新增</button></div>`}
const dayStats=()=>S.tasks.filter(t=>t.done&&t.doneAt===today()).length;
function renderToday(){const d=today(),c=S.cfg,open=S.tasks.filter(t=>!t.done);
  const lapsed=open.filter(t=>t.kind!=='none'&&t.date&&diff(t.date)<0);
  const soon=open.filter(t=>t.kind==='deadline'&&t.date&&diff(t.date)>=1&&diff(t.date)<=c.soon&&t.on!==d).sort(byDate);
  const mine=open.filter(t=>!lapsed.includes(t)&&grp(t)==='today').sort((a,b)=>(a.kind==='dayonly'&&a.time||'99:99')<(b.kind==='dayonly'&&b.time||'99:99')?-1:1);
  let h=`<h1>${new Date(Date.now()-c.reset*36e5).getMonth()+1} 月 ${new Date(Date.now()-c.reset*36e5).getDate()} 日</h1><div class="sub">今天已解決 ${dayStats()} 件</div>${addBox()}`;
  if(lapsed.length)h+='<h2>過了日期，要怎麼處理？</h2>'+lapsed.map(t=>`<div class="card2"><div>${esc(t.name)}</div><div class="meta">${dueLabel(t)}</div><div class="foot"><input type="date" data-a="resched" data-id="${t.id}"><button class="b dk" data-a="del" data-id="${t.id}">不用做了</button></div></div>`).join('');
  h+='<h2>今天要做</h2>'+(mine.length?mine.map(t=>row(t,{unmark:1,inToday:1})).join(''):'<div class="empty">還沒有。打字新增，或從「全部」挑幾件過來。</div>');
  if(soon.length)h+=sec('t-soon','快到期',soon.length,`<div class="soon">${soon.map(t=>row(t)).join('')}</div>`);
  return h}
function renderAll(){const G={week:[],month:[],later:[],today:[]},N={week:'這週（7 天內）',month:'這個月（30 天內）',later:'有空再說',today:'今天'};
  S.tasks.filter(t=>!t.done).forEach(t=>G[grp(t)].push(t));
  let h=`<h1>全部</h1><div class="sub">共 ${S.tasks.filter(t=>!t.done).length} 件未完成</div>${addBox()}`;
  for(const k of['week','month','later','today'])h+=sec('a-'+k,N[k],G[k].length,G[k].length?G[k].sort(byDate).map(t=>row(t)).join(''):'<div class="empty">空的</div>');
  return h}
function renderFp(){const dn=S.tasks.filter(t=>t.done).sort((a,b)=>(b.doneTs||0)-(a.doneTs||0)).slice(0,5);
  const wk=S.tasks.filter(t=>t.done&&t.doneAt&&diff(t.doneAt)>=-6).length,tl=(n,l)=>`<div class="tile"><b>${n}</b><span>${l}</span></div>`;
  $('fpp').style.display=fpOpen?'block':'none';$('fpb').textContent=fpOpen?'▼':'▲';
  $('fpp').innerHTML=`<div class="tiles">${tl(dayStats(),'今天')}${tl(wk,'近 7 日')}${tl(S.best,'單日最高')}</div><div class="meta">最近完成</div>`+(dn.length?dn.map(t=>`<div class="rm"><span>${esc(t.name)}</span><span class="meta" style="flex:none">${t.doneTs?new Date(t.doneTs).toTimeString().slice(0,5):''}</span><button class="b" data-a="chk" data-id="${t.id}">復原</button></div>`).join(''):'<div class="empty">還沒有完成的事</div>')}
function render(){$('app').innerHTML=view==='today'?renderToday():renderAll();renderFp();}
function addTask(){const n=$('nm').value.trim();if(!n)return;
  const kind=$('kd').value;let date=$('dt').value||(kind==='dayonly'?ymd(new Date(Date.now()-S.cfg.reset*36e5)):'');let k=kind;if(k!=='none'&&!date)k='none';
  const t={id:Date.now(),name:n,kind:k,date:k==='none'?'':date,time:k==='dayonly'?$('tm').value:'',repeat:parseInt($('rp').value)||0,done:false,touched:Date.now()};
  if(view==='today'&&(k==='none'||date===today()))t.on=today();
  S.tasks.push(t);save();render();$('nm').focus()}
function ask(msg,ok){pend=ok;ovMode='ask';$('ov').innerHTML=`<div class="box"><div class="t">${esc(msg)}</div><div class="foot"><button class="b q" data-a="c-no">取消</button><button class="b dk" data-a="c-yes">確定</button></div></div>`;$('ov').className='on'}
function suggest(){const d=today();if(S.sug.d!==d)S.sug={d,n:0};if(S.sug.n>=S.cfg.sugMax)return;
  const pool=S.tasks.filter(t=>!t.done&&grp(t)==='later'&&S.skip[t.id]!==d);if(!pool.length)return;
  const old=pool.filter(t=>age(t)>=S.cfg.stale).sort((a,b)=>a.touched-b.touched)[0];
  const t=old||pool[Math.floor(Math.random()*pool.length)];sugId=t.id;ovMode='sug';S.sug.n++;save();
  $('ov').innerHTML=`<div class="box"><div class="t"><div class="meta">順手做一件？（今天第 ${S.sug.n}／${S.cfg.sugMax} 次）</div><p style="font-size:18px;margin:8px 0 4px">${esc(t.name)}</p><div class="meta">${age(t)>=S.cfg.stale?'放了 '+age(t)+' 天了':'沒有急的期限'}</div></div><div class="foot"><button class="b" data-a="m-today">今天做</button><button class="b q" data-a="m-skip">改天</button><button class="b dk" data-a="m-del">放掉</button></div></div>`;$('ov').className='on'}
function fx(r,cb){r.classList.add('shine');navigator.vibrate&&navigator.vibrate(15);
  setTimeout(()=>{const b=r.getBoundingClientRect(),C=['#e8c35a','#f3dc8f','#3A6EA5','#b9c9dd','#fff'],cols=12,rows=3,w=b.width/cols,h=b.height/rows;
    for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const p=document.createElement('i');
      p.style.cssText=`position:fixed;z-index:20;left:${b.left+i*w}px;top:${b.top+j*h}px;width:${w}px;height:${h}px;background:${C[(i*7+j*3)%5]};pointer-events:none`;document.body.append(p);
      p.animate([{transform:'none',opacity:1},{transform:`translate(${(Math.random()-.5)*80}px,${140+Math.random()*120}px) rotate(${(Math.random()-.5)*160}deg)`,opacity:0}],{duration:650+Math.random()*350,delay:Math.random()*120,easing:'cubic-bezier(.5,0,1,.6)'}).onfinish=()=>p.remove()}
    r.style.visibility='hidden';setTimeout(cb,350)},430)}
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
  else if(a==='del'){ask('確定要刪除「'+t.name+'」嗎？',()=>{S.tasks=S.tasks.filter(x=>x!==t);save();render()});return}
  else return;save();render()}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.closest&&e.target.closest('.add'))addTask()});
document.addEventListener('click',e=>{
  if(fpOpen&&!e.target.closest('#td-fp')){fpOpen=false;renderFp()}
  if(!e.target.closest('#todoRoot,#todoFloat'))return;
  const el=e.target.closest('[data-a]');if(!el||el.matches('select,input'))return;const a=el.dataset.a,id=el.dataset.id;
  if(a==='add')return addTask();
  if(a==='go')return go(el.dataset.v);
  if(a==='fold'){S.fold[el.dataset.k]=S.fold[el.dataset.k]===false;save();return render()}
  if(a==='s-close'){$('ov').className='';return}
  if(a==='s-out'){$('ov').className='';if(typeof window.ownerSignOut==='function')window.ownerSignOut();return}
  if(a==='s-tab'){stab=el.dataset.k;return openSet()}
  if(a==='s-exp'){const u=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:'application/json'})),x=document.createElement('a');x.href=u;x.download='tasks-'+today()+'.json';x.click();URL.revokeObjectURL(u);return}
  if(a==='c-no'){pend=null;$('ov').className='';return}
  if(a==='c-yes'){const f=pend;pend=null;$('ov').className='';f&&f();return}
  if(a.startsWith('m-')){const t=by(sugId);$('ov').className='';if(!t)return;
    if(a==='m-today')act('today',t.id);else if(a==='m-skip'){S.skip[t.id]=today();save()}else act('del',t.id);return}
  const t=by(id);if(a==='chk'&&t&&!t.done&&S.cfg.fx){const r=el.closest('.row');if(r)return fx(r,()=>act(a,id))}
  act(a,id)});
$('ov').addEventListener('click',e=>{if(e.target.id!=='td-ov')return;if(ovMode==='sug'){const t=by(sugId);if(t){S.skip[t.id]=today();save()}}pend=null;$('ov').className=''});
document.addEventListener('change',e=>{const el=e.target;if(el.matches('input[type=date][data-a]'))act(el.dataset.a,el.dataset.id,el.value)});
$('toast').onclick=()=>{const id=$('toast').dataset.id;if(id){$('toast').classList.remove('on');act('chk',id)}};
$('fpb').onclick=e=>{e.stopPropagation();fpOpen=!fpOpen;renderFp()};
let stab='gen';
function openSet(){ovMode='set';const o=(k,min,max)=>`<input type="number" data-c="${k}" min="${min}" max="${max}" style="width:64px">`;
  const TB=[['gen','⚙','一般'],['look','◐','外觀'],['acct','◉','帳號'],['exp','⇩','匯出']];
  const P={gen:`<label class="sl">快到期區：截止前 ${o('soon',0,60)} 天，開始列進「快到期」</label>
<label class="sl">沒期限的任務超過 ${o('stale',1,365)} 天沒動，彈窗會優先出現它</label>
<label class="sl">「順手做一件」彈窗：每天最多出現 ${o('sugMax',0,20)} 次</label>
<label class="sl">每天 <select data-c="reset">${Array.from({length:24},(_,i)=>`<option value="${i}">${i} 點</option>`).join('')}</select> 重置（換日、彈窗次數）</label>`,
  look:`<label class="sl">標籤位置 <select data-c="tabPos"><option value="0">左側</option><option value="1">上方</option><option value="2">下方</option></select></label>
<label class="sl">完成特效 <select data-c="fx"><option value="1">開</option><option value="0">關</option></select></label>`,
  acct:`<div class="sl">帳號：<b>${esc((window._fbAuth&&window._fbAuth.currentUser&&window._fbAuth.currentUser.email)||'（未取得）')}</b></div>
<button class="b dk" style="width:100%;border-radius:8px" data-a="s-out">登出</button>
<div class="meta" style="margin-top:12px">任務資料同步位置：Firestore 的 Aethelgard/todo。</div>`,
  exp:`<button class="b" style="width:100%;border-radius:8px" data-a="s-exp">匯出資料（JSON）</button>
<label class="sl" style="margin-top:14px">匯入 <input type="file" id="td-imp" accept=".json"></label><div class="meta" id="td-inote">匯入會取代目前所有資料。</div>`};
  $('ov').innerHTML=`<div class="box sb p${S.cfg.tabPos}"><div class="tabs">${TB.map(([k,i,l])=>`<button class="tb ${k===stab?'on':''}" data-a="s-tab" data-k="${k}"><i>${i}</i>${l}</button>`).join('')}</div><div class="pane"><div class="pc">${P[stab]}</div><div class="foot"><button class="b" data-a="s-close">完成</button></div></div></div>`;
  $('ov').querySelectorAll('[data-c]').forEach(el=>{const k=el.dataset.c;el.value=S.cfg[k];el.onchange=()=>{const v=parseInt(el.value);if(v>=0){S.cfg[k]=v;save();render();if(k==='tabPos')openSet()}}});
  const im=$('imp');if(im)im.onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(s=>{try{const j=JSON.parse(s);if(!Array.isArray(j.tasks))throw 0;S=j;norm();save();render();$('inote').textContent='匯入完成'}catch(x){$('inote').textContent='檔案格式不對'}})};
  $('ov').className='on'}
$('gear').onclick=openSet;
render();

/* ===== 與整個 app 的銜接 ===== */
let cloudReady=false,pushT=0,pullTries=0;
const REF=()=>window._fbDoc(window._fbDb,'Aethelgard','todo');
async function push(){try{await window._fbSetDoc(REF(),{json:JSON.stringify(S),updatedAt:S.updatedAt||Date.now()},{merge:true})}catch(e){console.warn('[todo push]',e)}}
async function pull(){
  if(!(window._fbIsOwner&&window._fbUid&&window._fbDb&&window._fbGetDoc))return false;
  try{const snap=await window._fbGetDoc(REF());
    if(snap.exists()){const d=snap.data(),cu=d.updatedAt||0,lu=S.updatedAt||0;
      if(cu>lu){S=JSON.parse(d.json||'{}');norm();S.updatedAt=cu;try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}render()}
      else if(lu>cu)await push()}
    else if((S.tasks&&S.tasks.length)||S.updatedAt)await push();
    cloudReady=true;return true}catch(e){console.warn('[todo pull]',e);return false}}
function startCloud(){
  const t=setInterval(async()=>{
    if(!(window._fbIsOwner&&window._fbUid&&window._fbGetDoc))return;
    clearInterval(t);
    const go=async()=>{if(await pull()){setTimeout(suggest,1500)}else if(++pullTries<6)setTimeout(go,8000)};go()},800);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cloudReady)pull()})}
const OLD=['tree','tasks','sandbox','wishzone','stats'];
let cur='today';
function markTabs(c){cur=c;document.querySelectorAll('#td-topbar .tab[data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===c))}
function go(v){if(v==='notes'){if(typeof window.showPage==='function')window.showPage('notes');markTabs('notes');return}
  view=v;render();if(typeof window.showPage==='function')window.showPage('todo');markTabs(v)}
window.todoGo=go;
function wrapShowPage(){const sp=window.showPage;if(typeof sp!=='function'||sp._td)return;
  window.showPage=function(id,skip){if(OLD.includes(id))id='todo';const r=sp.call(this,id,skip);markTabs(id==='notes'?'notes':view);return r};window.showPage._td=1}
function setTop(){const b=document.getElementById('td-topbar');if(b)document.documentElement.style.setProperty('--tdtop',b.offsetHeight+'px')}
function boot(){wrapShowPage();
  const io=document.getElementById('notes-io-btn'),sp=document.querySelector('#td-topbar .sp');if(io&&sp)sp.after(io);
  setTop();addEventListener('resize',setTop);go('today');startCloud()}

boot();
})();
