const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const categories={all:'全部',transit:'綠色交通',food:'餐飲生活',leisure:'休閒健康',perk:'企業福利'};
// Demonstration catalog: point costs are discussion values, sponsors show who would fund each item.
export const catalog=[
 {id:'transit-50',category:'transit',icon:'🚇',name:'大眾運輸票卡加值 NT$50',note:'捷運、公車皆可使用',cost:10,stock:200,sponsor:'政府補助'},
 {id:'bike-4',category:'transit',icon:'🚲',name:'公共自行車騎乘券 ×4',note:'每張 30 分鐘，接駁最後一哩路',cost:6,stock:300,sponsor:'政府補助'},
 {id:'day-pass',category:'transit',icon:'🚌',name:'大眾運輸一日票',note:'平日假日都能用',cost:15,stock:120,sponsor:'政府補助'},
 {id:'carpool',category:'transit',icon:'🚗',name:'共乘車位優先預約（1 週）',note:'2 人以上共乘適用',cost:20,stock:40,sponsor:'企業提供'},
 {id:'coffee',category:'food',icon:'☕',name:'早晨咖啡兌換券',note:'錯峰到班，先來一杯',cost:5,stock:500,sponsor:'合作商家'},
 {id:'breakfast',category:'food',icon:'🥪',name:'早餐套餐兌換券',note:'園區合作早餐店',cost:8,stock:300,sponsor:'合作商家'},
 {id:'lunch',category:'food',icon:'🍱',name:'午餐餐券 NT$150',note:'園區合作餐廳',cost:18,stock:150,sponsor:'合作商家'},
 {id:'tableware',category:'food',icon:'🌱',name:'環保餐具組',note:'筷、匙、吸管與收納袋',cost:15,stock:80,sponsor:'政府補助'},
 {id:'gym',category:'leisure',icon:'🏊',name:'運動中心單次入場券',note:'游泳或健身擇一',cost:12,stock:150,sponsor:'政府補助'},
 {id:'books',category:'leisure',icon:'📚',name:'書店禮券 NT$200',note:'通勤路上多讀一本',cost:25,stock:60,sponsor:'合作商家'},
 {id:'movie',category:'leisure',icon:'🎬',name:'電影票 1 張',note:'一般數位廳',cost:30,stock:50,sponsor:'合作商家'},
 {id:'massage',category:'perk',icon:'💆',name:'辦公室紓壓按摩 20 分鐘',note:'於公司福利日使用',cost:22,stock:30,sponsor:'企業提供'},
 {id:'leave-2h',category:'perk',icon:'🏖️',name:'彈性休假 2 小時',note:'由任職企業核發',cost:40,stock:20,sponsor:'企業提供'},
 {id:'lottery',category:'perk',icon:'🎁',name:'錯峰之星年度抽獎券',note:'年終抽獎，多換多中',cost:3,stock:999,sponsor:'企業提供'}
];
export const SEED_POINTS=24;
const KEY='neihu-flex-wallet-v1';
export function memoryStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
// Browser storage can be blocked (private mode, file:// policies); fall back to this page session only.
function browserStorage(){try{const s=globalThis.localStorage;s.getItem(KEY);return s;}catch{return memoryStorage();}}
const seed=()=>({balance:SEED_POINTS,earned:SEED_POINTS,spent:0,checkins:{},redeemed:{},history:[{id:'seed',date:'2026-10-01',kind:'seed',label:'示範帳戶起始點數（10 月錯峰到班 24 次）',points:SEED_POINTS,balance:SEED_POINTS}]});
const valid=s=>s&&Number.isInteger(s.balance)&&s.balance>=0&&Array.isArray(s.history)&&s.checkins&&s.redeemed;
const voucher=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',n=new Uint8Array(8);(globalThis.crypto?.getRandomValues?.(n))||n.forEach((_,i)=>n[i]=Math.random()*256);return 'NH-'+[...n].map((v,i)=>(i===4?'-':'')+a[v%a.length]).join('');};
export function createWallet(storage=browserStorage()){
 let state;try{state=JSON.parse(storage.getItem(KEY));}catch{state=null;}
 if(!valid(state))state=seed();
 const save=()=>{try{storage.setItem(KEY,JSON.stringify(state));}catch{}},log=entry=>state.history.unshift({id:`${Date.now()}-${state.history.length}`,...entry,balance:state.balance});
 return {
  get balance(){return state.balance;},get earned(){return state.earned;},get spent(){return state.spent;},get history(){return state.history.slice();},
  get redeemedCount(){return Object.values(state.redeemed).reduce((n,v)=>n+v,0);},
  stockLeft(item){return item.stock-(state.redeemed[item.id]||0);},
  checkedIn(date){return state.checkins[date]||null;},
  // One point per workday; `check` is the rewardCheck result for this arrival from the flex page rule.
  earn({date,arrival,time,flex,direction,check:r}){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return {...r,recorded:false,message:'請選擇日期'};
   if(!r?.points)return {...r,recorded:false};
   if(state.checkins[date])return {...r,recorded:false,duplicate:true};
   state.checkins[date]=arrival;state.balance+=1;state.earned+=1;log({date,kind:'earn',label:`${direction} · ${arrival} 到班（${time} 上班，彈性 ±${flex} 分）`,points:1});save();return {...r,recorded:true};
  },
  redeem(id,date){
   const item=catalog.find(i=>i.id===id);if(!item)throw Error('找不到這項商品');
   if(state.balance<item.cost)throw Error('點數不足');if(this.stockLeft(item)<=0)throw Error('已兌換完畢');
   const code=voucher();state.balance-=item.cost;state.spent+=item.cost;state.redeemed[id]=(state.redeemed[id]||0)+1;
   log({date,kind:'redeem',label:`兌換 ${item.name}`,points:-item.cost,code});save();return {item,code};
  },
  reset(){state=seed();save();}
 };
}
export function createRewardStore({root,wallet,today}){
 const view={category:'all',confirming:null,resetting:false,last:null,error:''};
 function card(item){
  const left=wallet.stockLeft(item),short=item.cost-wallet.balance,can=short<=0&&left>0,confirming=view.confirming===item.id;
  const action=left<=0?'<button disabled>已兌換完畢</button>':confirming?`<div class="store-confirm"><span>用 ${item.cost} 點兌換？</span><button data-store-confirm="${item.id}">確認兌換</button><button data-store-cancel>取消</button></div>`:can?`<button data-store-redeem="${item.id}">兌換</button>`:`<button disabled>還差 ${short} 點</button>`;
  return `<article class="store-item${can?'':' locked'}" data-store-item="${item.id}"><div class="store-icon" aria-hidden="true">${item.icon}</div><span class="store-sponsor">${esc(item.sponsor)}</span><h3>${esc(item.name)}</h3><p>${esc(item.note)}</p><div class="store-cost"><strong>${item.cost}</strong> 點<small>剩 ${left} 份</small></div>${can?'':`<div class="store-progress" aria-label="已累積 ${Math.min(wallet.balance,item.cost)}／${item.cost} 點"><i style="width:${Math.min(100,wallet.balance/item.cost*100).toFixed(1)}%"></i></div>`}${action}</article>`;
 }
 function render(){
  const items=catalog.filter(i=>view.category==='all'||i.category===view.category),history=wallet.history;
  root.innerHTML=`<section class="reward-store"><header class="store-wallet"><div class="store-balance"><p class="eyebrow">MY POINTS / 我的獎勵點數</p><strong id="store-balance">${wallet.balance}</strong><span>點</span></div><dl><div><dt>累積獲得</dt><dd>${wallet.earned} 點</dd></div><div><dt>已使用</dt><dd>${wallet.spent} 點</dd></div><div><dt>已兌換</dt><dd>${wallet.redeemedCount} 件</dd></div></dl><div class="store-earn"><p>在彈性工時內，避開上班時間前後 15 分鐘的尖峰核心時段到班，每個上班日 +1 點。</p><button data-view="flex">去賺更多點數 →</button></div></header>
${view.last?`<div class="store-success" role="status"><strong>兌換成功：${esc(view.last.item.name)}</strong><span>兌換碼 <code>${view.last.code}</code>（示範用，非真實票券）</span><button data-store-dismiss aria-label="關閉">×</button></div>`:''}${view.error?`<p class="store-error" role="alert">${esc(view.error)}</p>`:''}
<nav class="store-categories" aria-label="商品分類">${Object.entries(categories).map(([k,v])=>`<button data-store-category="${k}" aria-pressed="${view.category===k}">${v}<small>${k==='all'?catalog.length:catalog.filter(i=>i.category===k).length}</small></button>`).join('')}</nav>
<div class="store-grid">${items.map(card).join('')}</div>
<section class="store-history"><h3>點數明細</h3><div class="table-scroll"><table><thead><tr><th>日期</th><th>內容</th><th>點數</th><th>餘額</th></tr></thead><tbody>${history.map(h=>`<tr class="${h.kind}"><td>${esc(h.date)}</td><td>${esc(h.label)}${h.code?`<small>兌換碼 ${esc(h.code)}</small>`:''}</td><td class="${h.points>0?'plus':'minus'}">${h.points>0?'+':''}${h.points}</td><td>${h.balance}</td></tr>`).join('')}</tbody></table></div></section>
<p class="store-basis">示範帳戶：點數與兌換紀錄只存在這台裝置的瀏覽器，不會上傳。商品、點數與贊助單位為示意設定，實際內容由政府、企業與合作商家共同訂定。${view.resetting?`<span class="store-confirm"><span>清除紀錄並回到 ${SEED_POINTS} 點？</span><button data-store-reset-confirm>確認重設</button><button data-store-cancel>取消</button></span>`:'<button data-store-reset>重設示範帳戶</button>'}</p></section>`;
  window.rewardStoreState={balance:wallet.balance,earned:wallet.earned,spent:wallet.spent,redeemed:wallet.redeemedCount,category:view.category,items:items.length,history:history.length};
 }
 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!root.contains(b))return;const d=b.dataset;view.error='';
  if(d.storeCategory){view.category=d.storeCategory;view.confirming=null;}
  else if(d.storeRedeem){view.confirming=d.storeRedeem;view.resetting=false;}
  else if(d.storeConfirm){try{view.last=wallet.redeem(d.storeConfirm,today());}catch(err){view.error=err.message;}view.confirming=null;}
  else if('storeCancel' in d){view.confirming=null;view.resetting=false;}
  else if('storeDismiss' in d)view.last=null;
  else if('storeReset' in d){view.resetting=true;view.confirming=null;}
  else if('storeResetConfirm' in d){wallet.reset();view.resetting=false;view.last=null;}
  else return;
  render();
  if(d.storeConfirm||d.storeRedeem)root.querySelector(`[data-store-item="${d.storeConfirm||d.storeRedeem}"] button`)?.focus();
 });
 return {render};
}
