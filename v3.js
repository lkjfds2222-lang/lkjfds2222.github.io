'use strict';
/* 雞省研究所 V3.5.1：自訂單點參考價不等於官方核價。比價券仍以 GitHub Actions 審核後的 JSON 為準。 */
const FOOD={fried:{name:'咔啦脆雞',emoji:'🍗',unit:'塊',max:14},boneless:{name:'無骨雞腿霸',emoji:'🍖',unit:'塊',max:12},nuggets:{name:'上校雞塊',emoji:'🍗',unit:'塊',max:24,step:4},popcorn:{name:'雞米花',emoji:'🍿',unit:'份',max:8},smallBurger:{name:'小脆雞堡',emoji:'🍔',unit:'個',max:8},burger:{name:'雞腿堡',emoji:'🥪',unit:'個',max:8},anyRice:{name:'飯類（口味不限）',emoji:'🍚',unit:'份',max:8},rice:{name:'雞汁風味飯',emoji:'🍚',unit:'份',max:8},pepperRice:{name:'青花椒醬飯',emoji:'🍚',unit:'份',max:8},creamRice:{name:'蒜香白醬飯',emoji:'🍚',unit:'份',max:8},tart:{name:'原味蛋撻',emoji:'🥧',unit:'顆',max:16},qqBalls:{name:'QQ 球',emoji:'🟠',unit:'顆',max:30,step:5},fries:{name:'香酥脆薯',emoji:'🍟',unit:'份',max:8},hash:{name:'薯餅',emoji:'🥔',unit:'份',max:8},soup:{name:'玉米濃湯',emoji:'🥣',unit:'杯',max:8},drink:{name:'飲料',emoji:'🥤',unit:'杯',max:12}};
const FOOD_GROUPS=[{title:'🍗 炸雞與雞肉',keys:['fried','boneless','nuggets','popcorn']},{title:'🍔 漢堡與飯類',keys:['smallBurger','burger','anyRice','rice','pepperRice','creamRice']},{title:'🥧 配餐、點心與飲料',keys:['tart','qqBalls','fries','hash','soup','drink']}];
const KEYS=Object.keys(FOOD),RICE_KEYS=['rice','pepperRice','creamRice'],riceQuantity=items=>RICE_KEYS.reduce((n,k)=>n+(items[k]||0),0),$=id=>document.getElementById(id),money=n=>Number(n).toLocaleString('zh-TW');
const DATE_TPE=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const esc=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let coupons=SNAPSHOT,selected={fried:4,tart:2,drink:2},party=2,excluded=new Set(),favorite=new Set(),filter='all',status=null;
let history={},verifiedSingles={},activePlans=[],chosenPlan=0,loadedOnline=false;
let historyDays=30,lastHistoryCode=null,manualSingles={},enableManualSingles=false;
const MANUAL_STORAGE='kfc_manual_single_prices_v34';
try{let x=JSON.parse(localStorage.getItem(MANUAL_STORAGE)||'{}');if(x&&typeof x==='object'&&!Array.isArray(x))for(const k of KEYS){let v=Number(x[k]);if(Number.isInteger(v)&&v>=1&&v<=500)manualSingles[k]=v;}}catch(_){}
const validManualPrice=(v)=>Number.isInteger(v)&&v>=1&&v<=500;
function saveManualPrices(){try{localStorage.setItem(MANUAL_STORAGE,JSON.stringify(manualSingles))}catch(_){}}
function renderManualPrices(){let el=$('manual-price-grid');if(!el)return;el.innerHTML=KEYS.map(k=>`<label class="single-price-field"><span>${FOOD[k].emoji} ${FOOD[k].name}</span><span class="single-price-input"><b>NT$</b><input type="number" data-single="${k}" inputmode="numeric" min="1" max="500" step="1" placeholder="未設定" value="${manualSingles[k]||''}" aria-label="${FOOD[k].name} 單點參考價格"></span></label>`).join('');updateManualSummary()}
function updateManualSummary(){let el=$('manual-price-status');if(!el)return;let n=Object.keys(manualSingles).length;el.textContent=`已設定 ${n} 種單點參考價${enableManualSingles?'，將加入下次試算':'，目前未納入比價'}。手動價格只儲存在本機，不代表肯德基官方現價。`;}

try{favorite=new Set(JSON.parse(localStorage.getItem('kfc_deal_favs')||'[]'))}catch(_){}
const isValid=c=>Boolean(/^\d{5}$/.test(String(c.code))&&Number.isInteger(c.price)&&c.price>0&&c.price<2000&&/^20\d\d-\d\d-\d\d$/.test(c.end)&&(!c.start||c.start<=DATE_TPE())&&c.end>=DATE_TPE()&&c.items&&typeof c.items==='object'&&Object.values(c.items).every(v=>Number.isInteger(v)&&v>=0)&&Object.keys(c.items).every(k=>KEYS.includes(k)&&k!=='anyRice'));
const validList=()=>coupons.filter(isValid);
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>$('toast').classList.remove('show'),2200)}
async function copy(txt){try{await navigator.clipboard.writeText(txt);toast('已複製購買資訊')}catch(e){let e2=document.createElement('textarea');e2.value=txt;document.body.append(e2);e2.select();document.execCommand('copy');e2.remove();toast('已複製購買資訊')}}
function initQuantities(){const target=$('quantity-grid');target.innerHTML=FOOD_GROUPS.map(group=>`<h4 class="qty-group">${group.title}</h4>`+group.keys.map(k=>{let v=selected[k]||0,f=FOOD[k];return `<div class="qty"><div class="qty-info"><span class="food-emoji">${f.emoji}</span><div><div class="name">${f.name}</div><span class="unit">${f.unit} · ${k==='anyRice'?'任選現有飯款；與指定口味份數相加':'至少'}</span></div></div><div class="stepper"><button type="button" aria-label="減少${f.name}" data-key="${k}" data-delta="-${f.step||1}">−</button><output>${v}</output><button type="button" aria-label="增加${f.name}" data-key="${k}" data-delta="${f.step||1}">+</button></div></div>`}).join('')).join('');
 document.querySelectorAll('[data-party]').forEach(b=>b.classList.toggle('on',Number(b.dataset.party)===party));
 $('excluded-items').innerHTML=KEYS.map(k=>`<label class="exclude-option"><input type="checkbox" data-exclude="${k}" ${excluded.has(k)?'checked':''} ${selected[k]?'disabled':''}><span>${FOOD[k].emoji} ${FOOD[k].name}</span></label>`).join('');}
$('quantity-grid').addEventListener('click',e=>{const b=e.target.closest('[data-delta]');if(!b)return;let k=b.dataset.key,v=Number(b.dataset.delta);selected[k]=Math.max(0,Math.min(FOOD[k].max,(selected[k]||0)+v));if(selected[k])excluded.delete(k);party=0;initQuantities();});
$('party-segments').addEventListener('click',e=>{let b=e.target.closest('[data-party]');if(!b)return;party=Number(b.dataset.party);selected=party?{fried:party*2,tart:party,drink:party}:{};KEYS.forEach(k=>{if(selected[k])excluded.delete(k)});initQuantities();});
$('reset-items').addEventListener('click',()=>{selected={};party=0;initQuantities();renderResult(null,{},null);});
$('excluded-items').addEventListener('change',e=>{let k=e.target.dataset.exclude;if(!k)return;if(e.target.checked)excluded.add(k);else excluded.delete(k)});
function selectedMode(){return document.querySelector('input[name="mode"]:checked').value}
// 不推測第三方數字 orderTypes 的意思。只有已人工核對的文字 channels 才能對應特定訂購方式。
function eligible(c,channel){return channel==='any'||(Array.isArray(c.channels)&&c.channels.includes(channel)&&c.channelVerified===true)}
function getOptions(req={},repeat=false){let channel=$('channel').value;let opts=validList().filter(c=>eligible(c,channel)&&!Object.keys(c.items).some(k=>excluded.has(k)&&c.items[k]>0));
 // Each single-item choice is a physical unit. When repeats are disabled, add one bounded
 // copy per requested unit, all with the same canonical code so duplicate compositions collapse.
 // User-entered prices override verified menu prices for the same category only while enabled.
 for(const k of KEYS){
  if(excluded.has(k)||!req[k]&&!(req.anyRice>0&&RICE_KEYS.includes(k)))continue;
  let r=verifiedSingles[k],manual=enableManualSingles&&validManualPrice(manualSingles[k]);
  let sourceUrl=null,price=null,code=null,title=null;
  if(manual){
   // For channel-specific quotes, we cannot assert applicability. Only include on unrestricted mode.
   if(channel!=='any')continue;
   price=manualSingles[k];code='MANUAL-'+k;title=FOOD[k].name+'（自行輸入參考價）';
  }else{
   if(!r||!Number.isInteger(r.price)||r.price<1||r.price>500||!/^https:\/\//.test(r.sourceUrl||'')||!/^20\d\d-\d\d-\d\d$/.test(r.verifiedAt||''))continue;
   const age=(new Date(DATE_TPE()+'T12:00:00+08:00')-new Date(r.verifiedAt+'T12:00:00+08:00'))/86400000;
   if(age<0||age>30)continue;
   if(channel!=='any'&&!(r.channelVerified===true&&Array.isArray(r.channels)&&r.channels.includes(channel)))continue;
   price=r.price;code='SINGLE-'+k;title=FOOD[k].name+'（有來源的單點價）';sourceUrl=r.sourceUrl;
  }
  const unit={code,title,price,items:{[k]:1},desc:FOOD[k].name+' 1 '+FOOD[k].unit,original:null,synthetic:true,manual,sourceUrl};
  const quantity=repeat?1:Math.max(1,Math.min(FOOD[k].max,(RICE_KEYS.includes(k)?(req[k]||0)+(req.anyRice||0):req[k]||0)));
  for(let i=0;i<quantity;i++)opts.push(unit);
 }
 return opts;
}
const sortPlans=(a,b)=>a.cost-b.cost||a.uses-b.uses||a.sig.localeCompare(b.sig);
function planSignature(counts){return Object.keys(counts).filter(k=>counts[k]>0).sort().map(k=>k+':'+counts[k]).join('|')}
function takePlan(p,c){let counts={...p.counts,[c.code]:(p.counts[c.code]||0)+1};return {cost:p.cost+c.price,counts,uses:p.uses+1,sig:planSignature(counts)}}
function addTop3(arr,entry){if(arr.some(p=>p.sig===entry.sig))return;arr.push(entry);arr.sort(sortPlans);if(arr.length>3)arr.pop()}
function setupStates(req){const keys=KEYS.filter(k=>req[k]>0);if(!keys.length)return null;const caps=keys.map(k=>k==='anyRice' ? req.anyRice+RICE_KEYS.reduce((sum,flavor)=>sum+(req[flavor]||0),0) : req[k]);let total=1;const step=[];for(const c of caps){step.push(total);total*=c+1}return {keys,caps,step,total,goal:total-1}}
function nextState(state,c,s,exact,req){let out=0;const flexible=req.anyRice>0;
 for(let i=0;i<s.keys.length;i++){
  const k=s.keys[i],v=Math.floor(state/s.step[i])%(s.caps[i]+1);
  // "口味不限" 代表飯類總需求，指定口味也必須計入總數，但不能重複當成另一份飯。
  const add=k==='anyRice'?(c.items.anyRice||0)+riceQuantity(c.items):(c.items[k]||0);
  if(exact&&v+add>s.caps[i]&&!(flexible&&RICE_KEYS.includes(k)))return -1;
  out+=Math.min(s.caps[i],v+add)*s.step[i];
 }
 if(exact&&(Object.keys(c.items).some(k=>!req[k]&&c.items[k]>0&&!(flexible&&(RICE_KEYS.includes(k)||k==='anyRice')))||((/QQ\s*球/.test(c.desc||'')&&!c.items.qqBalls)||(/濃湯/.test(c.desc||'')&&!c.items.soup)||/冰淇淋/.test(c.desc||''))))return -1;
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
function calculate(){let req=Object.fromEntries(KEYS.map(k=>[k,selected[k]||0]));if(!KEYS.some(k=>req[k])){renderResult(null,req,null);return}let exact=selectedMode()==='exact';let repeat=$('repeat').checked,opts=getOptions(req,repeat),budget=Number($('budget').value);
 $('result-body').innerHTML='<div class="res-empty">🔍 正在比較可用的優惠組合...</div>';
 setTimeout(()=>{let time=performance.now(),plans=repeat?solveRepeat(req,opts,exact):solveOnce(req,opts,exact);activePlans=Array.isArray(plans)?plans:[];chosenPlan=0;renderResult(plans,req,{opts,budget,repeat,exact,elapsed:performance.now()-time});},20);
}
function actualCounts(plan,opts){let values={};for(const [code,n]of Object.entries(plan.counts)){let c=opts.find(x=>x.code===code);if(!c)continue;for(const [k,v]of Object.entries(c.items))values[k]=(values[k]||0)+v*n}return values}
function planSummary(plan,opts,req){const actual=actualCounts(plan,opts),extra=[];
 let genericRemaining=req.anyRice||0;
 for(const k of KEYS){
  if(k==='anyRice')continue;
  let overflow=Math.max(0,(actual[k]||0)-(req[k]||0));
  if(RICE_KEYS.includes(k)&&genericRemaining>0){const matched=Math.min(overflow,genericRemaining);overflow-=matched;genericRemaining-=matched;}
  if(overflow>0)extra.push(FOOD[k].name+'多 '+overflow+FOOD[k].unit);
 }
 // 手動的『口味不限飯』沒有明確口味：不能用來冒充指定口味。
 const unknown=Math.max(0,(actual.anyRice||0)-genericRemaining);
 if(unknown>0)extra.push('未指定口味飯多 '+unknown+'份');
 return {actual,extra};}
function planText(p,opts){return '肯德基 V3.5.1 比價購買清單\n'+Object.entries(p.counts).map(([code,n])=>{let c=opts.find(x=>x.code===code);return (c?.manual?'自行輸入單點 ':c?.synthetic?'單點 ': '優惠碼 ')+(c?.synthetic?'':code+' × ')+n+'｜'+c.title+'｜'+c.desc+'｜NT$ '+money(c.price*n)}).join('\n')+'\n合計 NT$ '+money(p.cost)+'\n此為已收錄資料試算，請至官方確認實際可用性。'}
function renderResult(plans,req,context){let target=$('result-body');if(!context){target.innerHTML='<div class="res-empty"><div class="large-icon">🧺</div><h3>先挑選想吃的餐點</h3><p>設定數量後比較優惠券組合。</p></div>';return}
 if(plans?.tooMany){target.innerHTML='<div class="res-empty">🧩 條件過於複雜，請減少餐點種類或數量。系統不會以近似結果冒充最低價。</div>';return}
 if(!plans?.length){const specified=RICE_KEYS.some(k=>req[k]>0),anyRice=req.anyRice>0;
 target.innerHTML=`<div class="res-empty"><div class="large-icon">🧐</div><h3>目前找不到符合限制的組合</h3><p>${specified?'指定口味的飯尚未找到符合條件的優惠或單點價格。不同飯款不會在未經同意下互換。<br>':''}${anyRice?'目前沒有足夠、符合限制的飯類優惠或單點價格。<br>':''}${(specified||anyRice)?'你可展開「加入單點價格混合比價」輸入自行查到的飯類單價，再勾選納入試算。<br>':''}也可調整精準數量、排除餐點或訂購方式。</p>${specified?'<button class="rice-help-button" id="switch-any-rice" type="button">🍚 改為飯類（口味不限）</button>':''}${(specified||anyRice)?'<button class="rice-help-button secondary" id="open-rice-price" type="button">💲 設定飯類單點價格</button>':''}</div>`;
 const switcher=$('switch-any-rice');if(switcher)switcher.onclick=()=>{selected.anyRice=(selected.anyRice||0)+RICE_KEYS.reduce((sum,k)=>sum+(selected[k]||0),0);selected.anyRice=Math.min(FOOD.anyRice.max,selected.anyRice);for(const k of RICE_KEYS)selected[k]=0;party=0;excluded.delete('anyRice');initQuantities();calculate();};
 const priceButton=$('open-rice-price');if(priceButton)priceButton.onclick=()=>{const box=$('manual-prices');box.open=true;box.scrollIntoView({behavior:'smooth',block:'center'});const input=box.querySelector('input[data-single="anyRice"]');if(input)input.focus({preventScroll:true});};return;}
 window.v3LastReq=req;window.v3LastCtx=context;drawSelectedPlan();}
function drawSelectedPlan(){
 const target=$('result-body'),p=activePlans[chosenPlan],ctx=window.v3LastCtx,req=window.v3LastReq;
 if(!p||!ctx)return;
 const {actual,extra}=planSummary(p,ctx.opts,req),over=ctx.budget&&p.cost>ctx.budget;
 const entries=Object.entries(p.counts).map(([code,n])=>({code,n,c:ctx.opts.find(x=>x.code===code)})).filter(x=>x.c);
 const codeEntries=entries.filter(x=>!x.c.synthetic);
 const voucherCount=codeEntries.reduce((sum,x)=>sum+x.n,0);
 const hasManual=entries.some(x=>x.c.manual);
 const missingSides=[...new Set(entries.flatMap(x=>missingSideItems(x.c)))];
 const detailRows=entries.map(({code,n,c})=>`<div class="detail-line">
 <div><b>${esc(c.title)} × ${n}</b><small>${esc(c.desc)}</small>${!c.synthetic?`<small class="item-provenance">${esc(sourceLabel(c))}</small>`:''}<small class="detail-amount">小計 NT$ ${money(c.price*n)}</small></div>
 <div class="detail-actions"><span class="coupon-code" title="${c.manual?'自行輸入，非官方核價':c.synthetic?'有來源的單點':'優惠碼 '+esc(code)}">${esc(c.manual?'自訂價':c.synthetic?'單點':code)}</span>${c.manual?'<span class="manual-badge">待核對</span>':`<button class="tiny-btn" type="button" data-copy="${esc(code)}" aria-label="${c.synthetic?'開啟單點價格來源':'複製優惠碼 '+esc(code)}">${c.synthetic?'來源 ↗':'複製券碼'}</button>`}</div>
 </div>`).join('');
 target.innerHTML=`
 <div class="v3-label">${ctx.exact?'精準數量比價':'至少滿足餐點需求'} · ${ctx.repeat?'可重複使用理論價格':'每張券最多一次'}</div>
 ${hasManual?'<div class="manual-alert" role="note">⚠ 本方案包含你自行輸入的單點價格；未核對官方售價、稅費或通路，僅供估算。</div>':''}
 ${req.anyRice?'<div class="manual-alert" role="note">🍚 你選擇了「飯類（口味不限）」，系統會接受任一已辨識的飯款；若另外指定口味，兩者份數相加，不會把同一份飯算兩次。實際能否指定口味請以優惠券規則為準。</div>':''}
 ${missingSides.length?`<div class="manual-alert" role="note">⚠ 優惠券文字提及 ${esc(missingSides.join('、'))}，但舊版資料尚未有可計算的數量；這些附餐未計入需求或額外份數，請以官方結帳為準。</div>`:''}
 <div class="price-big"><small>NT$ </small>${money(p.cost)}</div>
 <span class="status-chip ${over?'warning':''}">${over?'超過預算 NT$ '+money(p.cost-ctx.budget):'✓ '+(ctx.budget?'符合預算':'已收錄選項中的低價方案')}</span>
 <div class="plan-list" aria-label="其他購買方案">${activePlans.map((x,i)=>`<button class="plan-option ${i===chosenPlan?'selected':''}" aria-pressed="${i===chosenPlan}" type="button" data-plan="${i}"><div class="plan-head"><b>${i===0?'🏆 最低價方案':'備選方案 '+(i+1)}</b><strong>NT$ ${money(x.cost)}</strong></div><div class="plan-caption">${x.uses} 張／筆優惠選項 · ${Object.keys(x.counts).length} 種組合</div></button>`).join('')}</div>
 <section class="plan-detail" aria-label="購買清單"><div class="plan-detail-head"><div><strong>🧾 購買清單</strong><small>依照下方券碼選購並於官方確認</small></div><span class="plan-list-total">${voucherCount} 張優惠券${entries.some(x=>x.c.synthetic)?'＋單點':''}</span></div>
 ${detailRows}
 <div class="plan-total-row"><span>購買清單合計</span><strong>NT$ ${money(p.cost)}</strong></div></section>
 <div class="plan-warning">✅ 需求：${esc(KEYS.filter(k=>req[k]).map(k=>FOOD[k].name+req[k]+FOOD[k].unit).join('、'))}<br>📦 實得：${esc(KEYS.filter(k=>actual[k]).map(k=>FOOD[k].name+actual[k]+FOOD[k].unit).join('、'))}<br>🎁 額外品項：${esc(extra.join('、')||'無（依已收錄品項統計）')}</div>
 <div class="plan-foot"><button id="copy-plan" class="outline" type="button">📋 複製購買清單</button><button id="copy-codes" class="outline" type="button" ${voucherCount?'':'disabled'}>🎟️ 只複製優惠碼</button><button id="share-plan" class="outline" type="button">🔗 分享需求</button><a class="outline" target="_blank" rel="noopener noreferrer" href="https://www.kfcclub.com.tw/coupon">官方核對 ↗</a></div>
 <p class="plan-note">價格僅涵蓋已收錄、目前有效且符合已知限制的選項。尚未完整驗證門市、重複使用限制與商品供應；${hasManual?'本方案包含自行輸入的參考單價，不是正式報價。':entries.some(x=>x.c.synthetic)?'本方案單點價格有來源及核對日期。':'未納入所有官方單點套餐的價格。'} 計算 ${Math.round(ctx.elapsed)} ms。</p>`;
 target.querySelectorAll('[data-plan]').forEach(el=>el.onclick=()=>{chosenPlan=Number(el.dataset.plan);drawSelectedPlan()});
 target.querySelectorAll('[data-copy]').forEach(el=>el.onclick=()=>{const code=el.dataset.copy,c=ctx.opts.find(x=>x.code===code);if(!c)return;if(c.synthetic){if(c.sourceUrl)window.open(c.sourceUrl,'_blank','noopener');return;}copy(code)});
 $('copy-plan').onclick=()=>copy(planText(p,ctx.opts));
 $('copy-codes').onclick=()=>copy(codeEntries.map(({code,n})=>n>1?code+' × '+n:code).join('\n'));
 $('share-plan').onclick=async()=>{let u=new URL(location.href);u.searchParams.set('plan',encodeURIComponent(JSON.stringify({selected,excluded:[...excluded],exact:ctx.exact,repeat:ctx.repeat,channel:$('channel').value,budget:ctx.budget})));if(navigator.share){try{await navigator.share({title:'雞省研究所 V3.5.1',url:u.href});return}catch(_){}}copy(u.href)};
}
function restoreShare(){let raw=new URL(location.href).searchParams.get('plan');if(!raw)return;try{let d=JSON.parse(decodeURIComponent(raw));if(d.selected&&typeof d.selected==='object')selected=Object.fromEntries(KEYS.map(k=>[k,Math.max(0,Math.min(FOOD[k].max,Number(d.selected[k])||0))]));excluded=new Set((d.excluded||[]).filter(k=>KEYS.includes(k)&&!selected[k]));party=0;if(d.exact)document.querySelector('input[value="exact"]').checked=true;$('repeat').checked=!!d.repeat;if(['any','pickup','dinein','delivery'].includes(d.channel))$('channel').value=d.channel;if([0,100,200,300,500,800].includes(Number(d.budget)))$('budget').value=Number(d.budget);toast('已載入分享的餐點需求')}catch(_){}}
function missingSideItems(c){
 const d=String(c.desc||'');const missing=[];
 if(/QQ\s*球/.test(d)&&!c.items.qqBalls)missing.push('QQ 球');
 if(/濃湯/.test(d)&&!c.items.soup)missing.push('濃湯');
 if(/雞米花/.test(d)&&!c.items.popcorn)missing.push('雞米花');
 return missing;
}
function sourceLabel(c){
 const x=c.crosscheck;
 if(x&&x.priceAgreement===true&&Array.isArray(x.sources)&&x.sources.length>=2)return x.sources.length+' 個第三方來源價格一致（非官方驗證）';
 const names=(x&&Array.isArray(x.sources)&&x.sources.length)?x.sources:[c.source||'歷史收錄'];
 return names.join('＋')+' · 尚須官網確認';
}
function renderCards(){let keyword=$('search').value.trim().toLowerCase(),order=$('sort').value;let list=validList().filter(c=>{
 if(filter==='confirmed'&&c.crosscheck?.priceAgreement!==true)return false;if(filter==='favorite'&&!favorite.has(c.code))return false;if(filter==='expiring'&&c.end>DATE_TPE()&&Math.ceil((Date.parse(c.end+'T12:00:00+08:00')-Date.parse(DATE_TPE()+'T12:00:00+08:00'))/86400000)>7)return false;if(filter==='under100'&&c.price>=100)return false;if(filter==='burger'&&!(c.items.burger||c.items.smallBurger))return false;if(filter==='rice'&&!['rice','pepperRice','creamRice'].some(k=>c.items[k]))return false;if(filter==='sides'&&!['popcorn','soup','qqBalls'].some(k=>c.items[k])&&!missingSideItems(c).length)return false;if(['fried','tart','nuggets'].includes(filter)&&!c.items[filter])return false;return !keyword||[c.code,c.title,c.desc,sourceLabel(c)].join(' ').toLowerCase().includes(keyword)});
 list.sort((a,b)=>order==='high'?b.price-a.price:order==='expire'?a.end.localeCompare(b.end)||a.price-b.price:order==='discount'?(b.original&&b.original>b.price?1-b.price/b.original:0)-(a.original&&a.original>a.price?1-a.price/a.original:0)||a.price-b.price:a.price-b.price);
 $('stat-coupons').textContent=validList().length;
 $('count-result').textContent=`顯示 ${list.length} 張有效券 · 自動排除未開始及過期券`;
 $('coupon-cards').innerHTML=list.length?list.map(c=>{let gap=Math.round((new Date(c.end+'T12:00:00+08:00')-new Date(DATE_TPE()+'T12:00:00+08:00'))/86400000);let saved=c.original&&c.original>c.price?Math.round((1-c.price/c.original)*100):null;
 return `<article class="coupon-card"><div class="card-top"><div class="card-icon">${c.items.fried?'🍗':c.items.tart?'🥧':c.items.burger||c.items.smallBurger?'🍔':(c.items.rice||c.items.pepperRice||c.items.creamRice)?'🍚':'🎟️'}</div><button class="heart ${favorite.has(c.code)?'active':''}" data-fav="${esc(c.code)}" aria-label="收藏${esc(c.code)}">${favorite.has(c.code)?'♥':'♡'}</button></div><div class="card-title">${esc(c.title)}</div><div class="card-code">優惠代碼 ${esc(c.code)}</div><p class="card-desc">${esc(c.desc)}</p><div class="card-tags"><span class="mini-chip" title="資料來源不等於官方核可">${esc(sourceLabel(c))}</span>${missingSideItems(c).length?'<span class="mini-chip pill-danger">配餐明細待核對</span>':''}${saved?`<span class="mini-chip">參考原價省 ${saved}%</span>`:''}${gap<=7?'<span class="mini-chip pill-danger">即將到期</span>':''}</div><div class="card-end"><div><div class="card-price"><span>NT$</span> ${money(c.price)}</div>${c.original?`<div class="old-price">參考原價 NT$ ${money(c.original)}</div>`:''}</div><div><div class="exp ${gap<=7?'soon':''}">期限至 ${esc(c.end)}</div><button class="copy-btn" data-copy="${esc(c.code)}">複製券碼</button><a class="tiny-btn" href="https://www.kfcclub.com.tw/coupon" target="_blank" rel="noopener noreferrer" title="到肯德基官網輸入這張優惠碼進行核對">官網查證 ↗</a><button class="tiny-btn" data-history="${esc(c.code)}">價格歷史</button></div></div></article>`}).join(''):'<div class="emptycards">找不到符合條件的有效券，請換個品項或關鍵字。</div>';
}
function renderHistory(code){
 const c=coupons.find(x=>x.code===code);const box=$('history-card');
 lastHistoryCode=code;box.classList.add('show');$('history-title').textContent=(c?.title||'優惠券')+'｜'+code;
 document.querySelectorAll('[data-history-days]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.historyDays)===historyDays));
 const src=Array.isArray(history[code])?history[code]:[];
 const until=DATE_TPE(),from=new Date(until+'T12:00:00+08:00');from.setUTCDate(from.getUTCDate()-(historyDays-1));
 const cutoff=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(from);
 const records=src.filter(r=>r&&/^20\d\d-\d\d-\d\d$/.test(r.date)&&r.date>=cutoff&&r.date<=until&&Number.isInteger(r.price)&&r.price>0).sort((a,b)=>a.date.localeCompare(b.date));
 const chart=$('history-graph'),metrics=$('history-metrics');chart.innerHTML='';
 if(!records.length){$('history-text').textContent=`最近 ${historyDays} 天尚無通過核對的價格記錄，不代表價格未變動。`;metrics.textContent='尚無可計算的歷史價格';return}
 const prices=records.map(r=>r.price),min=Math.min(...prices),max=Math.max(...prices),delta=prices.at(-1)-prices[0];
 metrics.textContent=`最低 NT$ ${money(min)}　最高 NT$ ${money(max)}　區間變化 ${delta>0?'+':''}${money(delta)} 元`;
 const w=640,h=150,pad=24,range=Math.max(max-min,2);
 const points=records.map((r,i)=>`${pad+(records.length===1?0:i/(records.length-1)*(w-2*pad))},${h-pad-(r.price-min)/range*(h-2*pad)}`).join(' ');
 const lastPoint=points.split(' ').at(-1).split(',');
 chart.innerHTML=`<line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#dec9b7"/><polyline points="${points}" fill="none" stroke="#c62c28" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4" fill="#c62c28"/>`;
 $('history-text').textContent=`最近 ${historyDays} 天有 ${records.length} 筆已保存記錄 · ${records[0].date}：NT$ ${money(records[0].price)} → ${records.at(-1).date}：NT$ ${money(records.at(-1).price)}。僅代表來源核對記錄，非官方保證售價。`;
 box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderOfficial(d){
 const health=$('official-health'),list=$('official-offer-list');if(!health||!list)return;
 if(!d||typeof d!=='object'){health.textContent='⚠️ 尚無官方巡查記錄；可使用上方官網按鈕自行確認。';return}
 const cp=d.couponPage||{},home=d.homePage||{};
 const when=d.generatedAt?String(d.generatedAt).slice(0,16).replace('T',' '):'未提供';
 health.textContent=(cp.ok?'✓ 官方優惠碼頁可讀':'⚠ 官方優惠碼頁無法核對')+'｜'+(home.ok?'官方首頁可讀':'官方首頁未更新')+'｜檢查 '+when+(d.staleData?'｜上一版活動摘要已過時':'')+'；官方查碼頁非公開批次券清單。';
 const offers=Array.isArray(d.offers)?d.offers.slice(0,8):[];
 list.innerHTML=offers.length?offers.map(o=>`<div class="official-item">${esc(String(o.title||'活動資料待確認').slice(0,110))} <small>・尚待結帳核對</small><div><a href="https://www.kfcclub.com.tw/" target="_blank" rel="noopener noreferrer">前往官網查證 ↗</a></div></div>`).join(''):'<div class="official-item">尚未辨識到可展示的官方活動文字；不代表肯德基目前沒有優惠。請至官網查看。</div>';
}
async function loadOfficial(){
 if(location.protocol==='file:'){renderOfficial(null);return}
 try{renderOfficial(await fetchJson('official-offers.json'))}catch(_){renderOfficial(null)}
}

function renderStatus(){if(!status)return;let stamp=status.lastChecked||'';$('upd-last').textContent=stamp?stamp.slice(5,16).replace('T',' '):'未核對';$('upd-auto').textContent=(status.autoAdded||0)+' 張';$('upd-pending').textContent=(status.pendingNewCoupons||0)+' 張';$('upd-review').textContent=(status.reviewNeeded||0)+' 項';
 $('upd-sources').innerHTML=Object.entries(status.sources||{}).map(([name,val])=>`${val.ok?'<span class="pill-green">● 成功</span>':'<span class="pill-orange">● 失敗</span>'} ${esc(name)}（${Number(val.verified??val.listed??0)} 筆）`).join('<br>')||'尚未核對';}
async function fetchJson(name){let r=await fetch('./'+name+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.json()}
async function loadData(){if(location.protocol==='file:'){$('data-status').textContent='離線預覽：2026/10/18 的快照；每日自動更新須部署至 GitHub Pages。';return}
 try{let incoming=await fetchJson('coupons.json');if(!Array.isArray(incoming)||incoming.length<3||!incoming.every(c=>/^\d{5}$/.test(String(c.code))&&Number.isInteger(c.price)&&c.price>0&&c.price<2000&&/^20\d\d-\d\d-\d\d$/.test(c.end)&&c.items&&typeof c.items==='object'&&Object.keys(c.items).every(k=>KEYS.includes(k)&&k!=='anyRice')&&Object.values(c.items).every(v=>Number.isInteger(v)&&v>=0)))throw new Error('券資料格式有問題');coupons=incoming;loadedOnline=true;
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
$('manual-price-grid').addEventListener('change',e=>{const el=e.target.closest('input[data-single]');if(!el)return;const k=el.dataset.single;if(!FOOD[k])return;const raw=el.value.trim(),v=Number(raw);if(raw&&validManualPrice(v)){manualSingles[k]=v}else{delete manualSingles[k];if(raw)toast('單價請輸入 1～500 元的整數')}saveManualPrices();renderManualPrices();});
$('use-manual-prices').addEventListener('change',e=>{enableManualSingles=!!e.target.checked;updateManualSummary();});
$('clear-manual-prices').addEventListener('click',()=>{manualSingles={};saveManualPrices();renderManualPrices();toast('已清空自訂單價')});
$('history-range').addEventListener('click',e=>{const btn=e.target.closest('[data-history-days]');if(!btn)return;historyDays=Number(btn.dataset.historyDays);if(lastHistoryCode)renderHistory(lastHistoryCode)});

$('history-close').addEventListener('click',()=>$('history-card').classList.remove('show'));
restoreShare();initQuantities();renderManualPrices();renderCards();calculate();loadData();loadOfficial();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
