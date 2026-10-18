'use strict';
/* 雞省研究所 V3：前端不直接抓取第三方資料，以 GitHub Actions 審核後的 JSON 為準。 */
const FOOD={fried:{name:'咔啦脆雞',emoji:'🍗',unit:'塊',max:14},smallBurger:{name:'小脆雞堡',emoji:'🍔',unit:'個',max:8},burger:{name:'雞腿堡',emoji:'🥪',unit:'個',max:8},tart:{name:'原味蛋撻',emoji:'🥧',unit:'顆',max:16},nuggets:{name:'上校雞塊',emoji:'🍗',unit:'塊',max:24,step:4},fries:{name:'香酥脆薯',emoji:'🍟',unit:'份',max:8},hash:{name:'薯餅',emoji:'🥔',unit:'份',max:8},drink:{name:'飲料',emoji:'🥤',unit:'杯',max:12},boneless:{name:'無骨雞腿霸',emoji:'🍖',unit:'塊',max:12}};
const KEYS=Object.keys(FOOD),$=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('zh-TW');
const DATE_TPE=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let coupons=SNAPSHOT,selected={fried:4,tart:2,drink:2},party=2,excluded=new Set(),favorite=new Set(),filter='all',status=null;
let history={},verifiedSingles={},activePlans=[],chosenPlan=0,loadedOnline=false;
try{favorite=new Set(JSON.parse(localStorage.getItem('kfc_deal_favs')||'[]'))}catch(_){}
const isValid=c=>Boolean(/^\d{5}$/.test(String(c.code))&&Number.isInteger(c.price)&&c.price>0&&c.price<2000&&/^20\d\d-\d\d-\d\d$/.test(c.end)&&(!c.start||c.start<=DATE_TPE())&&c.end>=DATE_TPE()&&c.items&&typeof c.items==='object'&&Object.values(c.items).every(v=>Number.isInteger(v)&&v>=0)&&Object.keys(c.items).every(k=>KEYS.includes(k)));
const validList=()=>coupons.filter(isValid);
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>$('toast').classList.remove('show'),2200)}
async function copy(txt){try{await navigator.clipboard.writeText(txt);toast('已複製購買資訊')}catch(e){let e2=document.createElement('textarea');e2.value=txt;document.body.append(e2);e2.select();document.execCommand('copy');e2.remove();toast('已複製購買資訊')}}
function initQuantities(){const target=$('quantity-grid');target.innerHTML=KEYS.map(k=>{let v=selected[k]||0,f=FOOD[k];return `<div class="qty"><div class="qty-info"><span class="food-emoji">${f.emoji}</span><div><div class="name">${f.name}</div><span class="unit">${f.unit} · 至少</span></div></div><div class="stepper"><button type="button" aria-label="減少${f.name}" data-key="${k}" data-delta="-${f.step||1}">−</button><output>${v}</output><button type="button" aria-label="增加${f.name}" data-key="${k}" data-delta="${f.step||1}">+</button></div></div>`}).join('');
 document.querySelectorAll('[data-party]').forEach(b=>b.classList.toggle('on',Number(b.dataset.party)===party));
 $('excluded-items').innerHTML=KEYS.map(k=>`<label class="exclude-option"><input type="checkbox" data-exclude="${k}" ${excluded.has(k)?'checked':''} ${selected[k]?'disabled':''}><span>${FOOD[k].emoji} ${FOOD[k].name}</span></label>`).join('');}
$('quantity-grid').addEventListener('click',e=>{const b=e.target.closest('[data-delta]');if(!b)return;let k=b.dataset.key,v=Number(b.dataset.delta);selected[k]=Math.max(0,Math.min(FOOD[k].max,(selected[k]||0)+v));if(selected[k])excluded.delete(k);party=0;initQuantities();});
$('party-segments').addEventListener('click',e=>{let b=e.target.closest('[data-party]');if(!b)return;party=Number(b.dataset.party);selected=party?{fried:party*2,tart:party,drink:party}:{};KEYS.forEach(k=>{if(selected[k])excluded.delete(k)});initQuantities();});
$('reset-items').addEventListener('click',()=>{selected={};party=0;initQuantities();renderResult(null,{},null);});
$('excluded-items').addEventListener('change',e=>{let k=e.target.dataset.exclude;if(!k)return;if(e.target.checked)excluded.add(k);else excluded.delete(k)});
function selectedMode(){return document.querySelector('input[name="mode"]:checked').value}
// 不推測第三方數字 orderTypes 的意思。只有已人工核對的文字 channels 才能對應特定訂購方式。
function eligible(c,channel){return channel==='any'||(Array.isArray(c.channels)&&c.channels.includes(channel)&&c.channelVerified===true)}
function getOptions(req={}){let channel=$('channel').value;let opts=validList().filter(c=>eligible(c,channel)&&!Object.keys(c.items).some(k=>excluded.has(k)&&c.items[k]>0));
 // Only hand-verified individual menu prices can be added as synthetic choices.
 for(const [k,r] of Object.entries(verifiedSingles)){
  if(!FOOD[k]||!r||!Number.isInteger(r.price)||r.price<1||r.price>500||!/^https:\/\//.test(r.sourceUrl||'')||!/^20\d\d-\d\d-\d\d$/.test(r.verifiedAt||''))continue;
  const age=(new Date(DATE_TPE()+'T12:00:00+08:00')-new Date(r.verifiedAt+'T12:00:00+08:00'))/86400000;
  if(age<0||age>30||excluded.has(k))continue;
  if(channel!=='any'&&!(r.channelVerified===true&&Array.isArray(r.channels)&&r.channels.includes(channel)))continue;
  for(let i=0;i<Math.max(1,Math.min(FOOD[k].max,req[k]||0));i++)opts.push({code:'SINGLE-'+k+'-'+(i+1),title:FOOD[k].name+'（已核價單點）',price:r.price,items:{[k]:1},desc:FOOD[k].name+' 1 '+FOOD[k].unit,original:null,synthetic:true,sourceUrl:r.sourceUrl});
 }
 return opts;
}
const sortPlans=(a,b)=>a.cost-b.cost||a.uses-b.uses||a.sig.localeCompare(b.sig);
function planSignature(counts){return Object.keys(counts).filter(k=>counts[k]>0).sort().map(k=>k+':'+counts[k]).join('|')}
function takePlan(p,c){let counts={...p.counts,[c.code]:(p.counts[c.code]||0)+1};return {cost:p.cost+c.price,counts,uses:p.uses+1,sig:planSignature(counts)}}
function addTop3(arr,entry){if(arr.some(p=>p.sig===entry.sig))return;arr.push(entry);arr.sort(sortPlans);if(arr.length>3)arr.pop()}
function setupStates(req){const keys=KEYS.filter(k=>req[k]>0);if(!keys.length)return null;const caps=keys.map(k=>req[k]);let total=1;const step=[];for(const c of caps){step.push(total);total*=c+1}return {keys,caps,step,total,goal:total-1}}
function nextState(state,c,s,exact,req){let out=0;for(let i=0;i<s.keys.length;i++){
 const k=s.keys[i],v=Math.floor(state/s.step[i])%(s.caps[i]+1),add=c.items[k]||0;
 if(exact&&v+add>req[k])return -1;
 out+=Math.min(s.caps[i],v+add)*s.step[i];
 }
 if(exact&&(Object.keys(c.items).some(k=>!req[k]&&c.items[k]>0)||/QQ球|濃湯|冰淇淋/.test(c.desc||'')))return -1;
 return out;
}
// Exact 0/1 dynamic program; each capped item-count state retains 3 distinct cheapest compositions.
// Because transitions have no negative costs, keeping 3 per state suffices for top 3 paths
// for a fixed state (coupon included at most once, order fixed).
function solveOnce(req,opts,exact){const s=setupStates(req);if(!s)return [];if(s.total>120000)return {tooMany:true};let states=new Map([[0,[{cost:0,counts:{},uses:0,sig:''}]]]);
 for(const c of opts){let previous=Array.from(states,([st,paths])=>[st,paths.slice()]);for(const [st,paths] of previous){const ns=nextState(st,c,s,exact,req);if(ns<=st)continue;let arr=states.get(ns);if(!arr){arr=[];states.set(ns,arr)}for(const p of paths)addTop3(arr,takePlan(p,c));}if(states.size>80000)return {tooMany:true};}
 return states.get(s.goal)||[];}
class Heap{constructor(){this.a=[]}push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){let p=(i-1)>>1;if(a[p].cost<=v.cost)break;a[i]=a[p];i=p}a[i]=v}pop(){const a=this.a,top=a[0],last=a.pop();if(!a.length)return top;let i=0;while(2*i+1<a.length){let j=2*i+1;if(j+1<a.length&&a[j+1].cost<a[j].cost)j++;if(last.cost<=a[j].cost)break;a[i]=a[j];i=j}a[i]=last;return top}get size(){return this.a.length}}
// Reusable coupons: Dijkstra's nonnegative shortest path, deduplicated on full purchase composition.
function solveRepeat(req,opts,exact){let s=setupStates(req);if(!s)return [];if(s.total>120000)return {tooMany:true};const initial={state:0,cost:0,counts:{},uses:0,sig:''},heap=new Heap();heap.push(initial);let used=new Map(),result=[],pops=0;
 while(heap.size&&pops<150000){let p=heap.pop();if(used.get(p.state)?.has(p.sig))continue;let at=used.get(p.state);if(!at){at=new Set();used.set(p.state,at)}if(at.size>=3)continue;at.add(p.sig);pops++;
 if(p.state===s.goal){addTop3(result,p);if(result.length===3&&heap.a[0]?.cost>result[2].cost)break;continue;}
 for(let c of opts){let ns=nextState(p.state,c,s,exact,req);if(ns<=p.state)continue;heap.push({...takePlan(p,c),state:ns});}
 }
 return pops>=150000?{tooMany:true}:result;}
function calculate(){let req=Object.fromEntries(KEYS.map(k=>[k,selected[k]||0]));if(!KEYS.some(k=>req[k])){renderResult(null,req,null);return}let exact=selectedMode()==='exact';let opts=getOptions(req),budget=Number($('budget').value),repeat=$('repeat').checked;
 $('result-body').innerHTML='<div class="res-empty">🔍 正在比較可用的優惠組合...</div>';
 setTimeout(()=>{let time=performance.now(),plans=repeat?solveRepeat(req,opts,exact):solveOnce(req,opts,exact);activePlans=Array.isArray(plans)?plans:[];chosenPlan=0;renderResult(plans,req,{opts,budget,repeat,exact,elapsed:performance.now()-time});},20);
}
function actualCounts(plan,opts){let values={};for(const [code,n]of Object.entries(plan.counts)){let c=opts.find(x=>x.code===code);if(!c)continue;for(const [k,v]of Object.entries(c.items))values[k]=(values[k]||0)+v*n}return values}
function planSummary(plan,opts,req){let actual=actualCounts(plan,opts);let extra=KEYS.filter(k=>(actual[k]||0)>(req[k]||0)).map(k=>FOOD[k].name+'多 '+(actual[k]-req[k])+FOOD[k].unit);return {actual,extra}}
function planText(p,opts){return '肯德基比價購買清單\n'+Object.entries(p.counts).map(([code,n])=>{let c=opts.find(x=>x.code===code);return (c?.synthetic?'單點 ': '優惠碼 ')+code+' × '+n+'｜'+c.title+'｜'+c.desc+'｜NT$ '+money(c.price*n)}).join('\n')+'\n合計 NT$ '+money(p.cost)+'\n此為已收錄資料試算，請至官方確認實際可用性。'}
function renderResult(plans,req,context){let target=$('result-body');if(!context){target.innerHTML='<div class="res-empty"><div class="large-icon">🧺</div><h3>先挑選想吃的餐點</h3><p>設定數量後比較優惠券組合。</p></div>';return}
 if(plans?.tooMany){target.innerHTML='<div class="res-empty">🧩 條件過於複雜，請減少餐點種類或數量。系統不會以近似結果冒充最低價。</div>';return}
 if(!plans?.length){target.innerHTML=`<div class="res-empty"><div class="large-icon">🧐</div><h3>目前找不到符合限制的組合</h3><p>可試試最低價模式、取消排除餐點或修改購買方式。<br>若選了特定通路，只會使用已人工驗證適用的券。</p></div>`;return}
 window.v3LastReq=req;window.v3LastCtx=context;drawSelectedPlan();}
function drawSelectedPlan(){
 const target=$('result-body'),p=activePlans[chosenPlan],ctx=window.v3LastCtx,req=window.v3LastReq;
 if(!p||!ctx)return;
 const {actual,extra}=planSummary(p,ctx.opts,req),over=ctx.budget&&p.cost>ctx.budget;
 const entries=Object.entries(p.counts).map(([code,n])=>({code,n,c:ctx.opts.find(x=>x.code===code)})).filter(x=>x.c);
 const codeEntries=entries.filter(x=>!x.c.synthetic);
 const voucherCount=codeEntries.reduce((sum,x)=>sum+x.n,0);
 const detailRows=entries.map(({code,n,c})=>`<div class="detail-line">
 <div><b>${esc(c.title)} × ${n}</b><small>${esc(c.desc)}</small><small class="detail-amount">小計 NT$ ${money(c.price*n)}</small></div>
 <div class="detail-actions"><span class="coupon-code" title="${c.synthetic?'經人工核價的單點':'優惠碼 '+esc(code)}">${esc(c.synthetic?'單點':code)}</span><button class="tiny-btn" type="button" data-copy="${esc(code)}" aria-label="${c.synthetic?'開啟單點價格來源':'複製優惠碼 '+esc(code)}">${c.synthetic?'來源 ↗':'複製券碼'}</button></div>
 </div>`).join('');
 target.innerHTML=`
 <div class="v3-label">${ctx.exact?'精準數量比價':'至少滿足餐點需求'} · ${ctx.repeat?'可重複使用理論價格':'每張券最多一次'}</div>
 <div class="price-big"><small>NT$ </small>${money(p.cost)}</div>
 <span class="status-chip ${over?'warning':''}">${over?'超過預算 NT$ '+money(p.cost-ctx.budget):'✓ '+(ctx.budget?'符合預算':'已收錄選項中的低價方案')}</span>
 <div class="plan-list" aria-label="其他購買方案">${activePlans.map((x,i)=>`<button class="plan-option ${i===chosenPlan?'selected':''}" aria-pressed="${i===chosenPlan}" type="button" data-plan="${i}"><div class="plan-head"><b>${i===0?'🏆 最低價方案':'備選方案 '+(i+1)}</b><strong>NT$ ${money(x.cost)}</strong></div><div class="plan-caption">${x.uses} 張／筆優惠選項 · ${Object.keys(x.counts).length} 種組合</div></button>`).join('')}</div>
 <section class="plan-detail" aria-label="購買清單"><div class="plan-detail-head"><div><strong>🧾 購買清單</strong><small>依照下方券碼選購並於官方確認</small></div><span class="plan-list-total">${voucherCount} 張優惠券${entries.some(x=>x.c.synthetic)?'＋單點':''}</span></div>
 ${detailRows}
 <div class="plan-total-row"><span>購買清單合計</span><strong>NT$ ${money(p.cost)}</strong></div></section>
 <div class="plan-warning">✅ 需求：${esc(KEYS.filter(k=>req[k]).map(k=>FOOD[k].name+req[k]+FOOD[k].unit).join('、'))}<br>📦 實得：${esc(KEYS.filter(k=>actual[k]).map(k=>FOOD[k].name+actual[k]+FOOD[k].unit).join('、'))}<br>🎁 額外品項：${esc(extra.join('、')||'無（依已收錄品項統計）')}</div>
 <div class="plan-foot"><button id="copy-plan" class="outline" type="button">📋 複製購買清單</button><button id="copy-codes" class="outline" type="button" ${voucherCount?'':'disabled'}>🎟️ 只複製優惠碼</button><button id="share-plan" class="outline" type="button">🔗 分享需求</button><a class="outline" target="_blank" rel="noopener noreferrer" href="https://www.kfcclub.com.tw/coupon">官方核對 ↗</a></div>
 <p class="plan-note">價格僅涵蓋已收錄、目前有效且符合已知限制的選項。尚未完整驗證門市、重複使用限制與商品供應；${ctx.opts.some(x=>x.synthetic)?'單點價格採已核對來源。':'尚未納入所有官方單點套餐的價格。'} 計算 ${Math.round(ctx.elapsed)} ms。</p>`;
 target.querySelectorAll('[data-plan]').forEach(el=>el.onclick=()=>{chosenPlan=Number(el.dataset.plan);drawSelectedPlan()});
 target.querySelectorAll('[data-copy]').forEach(el=>el.onclick=()=>{const code=el.dataset.copy,c=ctx.opts.find(x=>x.code===code);if(!c)return;if(c.synthetic){window.open(c.sourceUrl,'_blank','noopener');return;}copy(code)});
 $('copy-plan').onclick=()=>copy(planText(p,ctx.opts));
 $('copy-codes').onclick=()=>copy(codeEntries.map(({code,n})=>n>1?code+' × '+n:code).join('\n'));
 $('share-plan').onclick=async()=>{let u=new URL(location.href);u.searchParams.set('plan',encodeURIComponent(JSON.stringify({selected,excluded:[...excluded],exact:ctx.exact,repeat:ctx.repeat,channel:$('channel').value,budget:ctx.budget})));if(navigator.share){try{await navigator.share({title:'雞省研究所 V3.1',url:u.href});return}catch(_){}}copy(u.href)};
}
function restoreShare(){let raw=new URL(location.href).searchParams.get('plan');if(!raw)return;try{let d=JSON.parse(decodeURIComponent(raw));if(d.selected&&typeof d.selected==='object')selected=Object.fromEntries(KEYS.map(k=>[k,Math.max(0,Math.min(FOOD[k].max,Number(d.selected[k])||0))]));excluded=new Set((d.excluded||[]).filter(k=>KEYS.includes(k)&&!selected[k]));party=0;if(d.exact)document.querySelector('input[value="exact"]').checked=true;$('repeat').checked=!!d.repeat;if(['any','pickup','dinein','delivery'].includes(d.channel))$('channel').value=d.channel;if([0,100,200,300,500,800].includes(Number(d.budget)))$('budget').value=Number(d.budget);toast('已載入分享的餐點需求')}catch(_){}}
function renderCards(){let keyword=$('search').value.trim().toLowerCase(),order=$('sort').value;let list=validList().filter(c=>{
 if(filter==='favorite'&&!favorite.has(c.code))return false;if(filter==='under100'&&c.price>=100)return false;if(filter==='burger'&&!(c.items.burger||c.items.smallBurger))return false;if(['fried','tart','nuggets'].includes(filter)&&!c.items[filter])return false;return !keyword||[c.code,c.title,c.desc].join(' ').toLowerCase().includes(keyword)});
 list.sort((a,b)=>order==='high'?b.price-a.price:order==='expire'?a.end.localeCompare(b.end)||a.price-b.price:order==='discount'?(b.original&&b.original>b.price?1-b.price/b.original:0)-(a.original&&a.original>a.price?1-a.price/a.original:0)||a.price-b.price:a.price-b.price);
 $('stat-coupons').textContent=validList().length;
 $('count-result').textContent=`顯示 ${list.length} 張有效券 · 自動排除未開始及過期券`;
 $('coupon-cards').innerHTML=list.length?list.map(c=>{let gap=Math.round((new Date(c.end+'T12:00:00+08:00')-new Date(DATE_TPE()+'T12:00:00+08:00'))/86400000);let saved=c.original&&c.original>c.price?Math.round((1-c.price/c.original)*100):null;
 return `<article class="coupon-card"><div class="card-top"><div class="card-icon">${c.items.fried?'🍗':c.items.tart?'🥧':c.items.burger||c.items.smallBurger?'🍔':'🎟️'}</div><button class="heart ${favorite.has(c.code)?'active':''}" data-fav="${esc(c.code)}" aria-label="收藏${esc(c.code)}">${favorite.has(c.code)?'♥':'♡'}</button></div><div class="card-title">${esc(c.title)}</div><div class="card-code">優惠代碼 ${esc(c.code)}</div><p class="card-desc">${esc(c.desc)}</p><div class="card-tags">${saved?`<span class="mini-chip">參考原價省 ${saved}%</span>`:''}${gap<=7?'<span class="mini-chip pill-danger">即將到期</span>':''}</div><div class="card-end"><div><div class="card-price"><span>NT$</span> ${money(c.price)}</div>${c.original?`<div class="old-price">參考原價 NT$ ${money(c.original)}</div>`:''}</div><div><div class="exp ${gap<=7?'soon':''}">期限至 ${esc(c.end)}</div><button class="copy-btn" data-copy="${esc(c.code)}">複製券碼</button><button class="tiny-btn" data-history="${esc(c.code)}">價格歷史</button></div></div></article>`}).join(''):'<div class="emptycards">找不到符合條件的有效券，請換個品項或關鍵字。</div>';
}
function renderHistory(code){let c=coupons.find(x=>x.code===code);const records=(history[code]||[]).slice(-90);const box=$('history-card');box.classList.add('show');$('history-title').textContent=(c?.title||'優惠券')+'｜'+code;
 let chart=$('history-graph');chart.innerHTML='';if(!records.length){$('history-text').textContent='尚無每日追蹤記錄。首次部署後，成功核對來源才會記錄，不會捏造歷史價格。';return}
 const w=640,h=130,pad=20,min=Math.min(...records.map(r=>r.price)),max=Math.max(...records.map(r=>r.price));let delta=Math.max(4,max-min);const points=records.map((r,i)=>`${pad+(records.length===1?0:i/(records.length-1)*(w-2*pad))},${h-pad-(r.price-min)/delta*(h-2*pad)}`).join(' ');
 chart.innerHTML=`<polyline points="${points}" fill="none" stroke="#c62c28" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${points.split(' ').slice(-1)[0].replace(',','" cy="')}" r="4" fill="#c62c28"/>`;
 $('history-text').textContent=`${records.length} 筆已保存價格記錄 · 首筆 ${records[0].date} NT$ ${money(records[0].price)} → 最近 ${records.at(-1).date} NT$ ${money(records.at(-1).price)}。僅代表本網站取得並審核的資料。`;
 box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderStatus(){if(!status)return;let stamp=status.lastChecked||'';$('upd-last').textContent=stamp?stamp.slice(5,16).replace('T',' '):'未核對';$('upd-auto').textContent=(status.autoAdded||0)+' 張';$('upd-pending').textContent=(status.pendingNewCoupons||0)+' 張';$('upd-review').textContent=(status.reviewNeeded||0)+' 項';
 $('upd-sources').innerHTML=Object.entries(status.sources||{}).map(([name,val])=>`${val.ok?'<span class="pill-green">● 成功</span>':'<span class="pill-orange">● 失敗</span>'} ${esc(name)}（${Number(val.verified??val.listed??0)} 筆）`).join('<br>')||'尚未核對';}
async function fetchJson(name){let r=await fetch('./'+name+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.json()}
async function loadData(){if(location.protocol==='file:'){$('data-status').textContent='離線預覽：2026/10/18 的快照；每日自動更新須部署至 GitHub Pages。';return}
 try{let incoming=await fetchJson('coupons.json');if(!Array.isArray(incoming)||incoming.length<3||!incoming.every(c=>/^\d{5}$/.test(String(c.code))&&Number.isInteger(c.price)&&c.price>0&&c.price<2000&&/^20\d\d-\d\d-\d\d$/.test(c.end)&&c.items&&typeof c.items==='object'&&Object.keys(c.items).every(k=>KEYS.includes(k))&&Object.values(c.items).every(v=>Number.isInteger(v)&&v>=0)))throw new Error('券資料格式有問題');coupons=incoming;loadedOnline=true;
 try{status=await fetchJson('update-status.json');renderStatus()}catch(_){}try{history=await fetchJson('price-history.json')}catch(_){}
 try{let m=await fetchJson('menu-prices.json');verifiedSingles=m.prices||{}}catch(_){}
 try{let r=await fetchJson('pending-review.json');let lines=[...(r.newCoupons||[]).slice(0,5),...(r.uncertainChanges||[]).slice(0,4)];$('upd-details').innerHTML=lines.length?lines.map(x=>`<div>${esc(x.code)}：${esc(x.reason||'待審')}</div>`).join(''):'<span class="pill-green">本次沒有待審資料</span>'}catch(_){}
 let checked=status?.lastChecked,last=checked?Date.parse(checked):NaN,fresh=Number.isFinite(last)&&Date.now()-last<48*3600000;
 $('data-status').textContent=(fresh?'✅':'⚠️')+' 已載入網站優惠資料。'+(checked?'最近核對：'+checked.slice(0,16).replace('T',' ')+'（台灣時間）。':'目前仍未有成功更新的時間。')+' 每日執行成功不代表原始資料當日有變更；請以官方實際可用券為準。';
 }catch(err){$('data-status').textContent='⚠️ 線上資料讀取失敗，使用 2026/10/18 離線快照。'+String(err.message||err)}renderCards();calculate();}
$('filter-buttons').addEventListener('click',e=>{let b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('on',x===b));renderCards()});
$('search').addEventListener('input',renderCards);$('sort').addEventListener('change',renderCards);
$('coupon-cards').addEventListener('click',e=>{let b=e.target.closest('[data-fav],[data-copy],[data-history]');if(!b)return;if(b.dataset.copy){copy(b.dataset.copy);return}if(b.dataset.history){renderHistory(b.dataset.history);return}if(b.dataset.fav){let code=b.dataset.fav;if(favorite.has(code))favorite.delete(code);else favorite.add(code);try{localStorage.setItem('kfc_deal_favs',JSON.stringify([...favorite]))}catch(_){}renderCards()}});
$('calculate').addEventListener('click',calculate);
$('history-close').addEventListener('click',()=>$('history-card').classList.remove('show'));
restoreShare();initQuantities();renderCards();calculate();loadData();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
