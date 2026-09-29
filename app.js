const WORDS = window.WORDS || [];
const KEY = "vocab1935-progress-v1";
const SETTINGS_KEY = "vocab1935-settings-v1";
const ACTIVITY_KEY = "vocab1935-activity-v2";
const DAY = 86400000;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let progress = loadJSON(KEY, {});
let activity = loadJSON(ACTIVITY_KEY, {});
const legacySettings = loadJSON(SETTINGS_KEY, {});
let settings = Object.assign({ theme:"system", targetDate:"", dailyQuota:100 }, legacySettings);
settings.dailyQuota = clamp(parseInt(settings.dailyQuota)||100, 1, 2000);

const senseCache = new Map();
let UNITS = [];
let currentUnit = null;
let missionAnswered = false;
let recentUnits = [];
let recentWords = [];
let retryQueue = [];
let questionNo = 0;
let combo = 0;
let quotaExtended = false;

function loadJSON(k,fallback){ try{return JSON.parse(localStorage.getItem(k)) ?? fallback}catch{return fallback} }
function persist(){
  localStorage.setItem(KEY,JSON.stringify(progress));
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
  localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity));
}
function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),1800); }
function speak(text){
  if(!("speechSynthesis" in window)) return toast("このブラウザでは読み上げを利用できません");
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=.88; speechSynthesis.speak(u);
}
function state(id){
  if(!progress[id]) progress[id]={level:0,correct:0,wrong:0,seen:0,due:0,status:"new",starred:false,tripleHits:0,senses:{},senseHits:{}};
  const s=progress[id];
  if(!s.senses) s.senses={};
  if(!s.senseHits) s.senseHits={};
  if(s.tripleHits==null) s.tripleHits=0;
  return s;
}
function localDateKey(d=new Date()){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dateFromKey(k){ const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d); }
function shiftDateKey(k,n){ const d=dateFromKey(k); d.setDate(d.getDate()+n); return localDateKey(d); }
function activityEntry(k=localDateKey()){
  if(!activity[k]) activity[k]={answered:0,correct:0,wrong:0,newIds:[],missionHits:0};
  if(activity[k].missionHits==null) activity[k].missionHits=0;
  return activity[k];
}
function streakCount(){
  const today=localDateKey();
  let cursor=(activity[today]?.answered||0)>0?today:shiftDateKey(today,-1), n=0;
  while((activity[cursor]?.answered||0)>0){ n++; cursor=shiftDateKey(cursor,-1); }
  return n;
}

function parseSenses(raw){
  const parts=String(raw).split(/(\[[^\]]+\]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g).filter(Boolean);
  let pos="",current=null,plain=""; const out=[];
  for(const part of parts){
    if(/^\[[^\]]+\]$/.test(part)){ pos=part; continue; }
    if(CIRCLED.includes(part)&&part.length===1){ if(current&&current.text.trim())out.push(current); current={no:part,pos,text:""}; continue; }
    if(current) current.text+=part; else plain+=part;
  }
  if(current&&current.text.trim()) out.push(current);
  if(!out.length){
    const stripped=plain.trim()||String(raw).replace(/^\[[^\]]+\]\s*/,"").trim();
    return [{key:"1",no:"",pos,text:stripped||String(raw)}];
  }
  return out.map((s,i)=>({key:s.no||String(i+1),no:s.no,pos:s.pos,text:s.text.trim()}));
}
function getSenses(w){ if(!senseCache.has(w.id))senseCache.set(w.id,parseSenses(w.meaning)); return senseCache.get(w.id); }
function unitId(w,sense){ return `${w.id}:${sense.key}`; }
function buildUnits(){
  UNITS=[];
  for(const w of WORDS){
    const senses=getSenses(w);
    senses.forEach((sense,index)=>UNITS.push({id:unitId(w,sense),w,sense,index,count:senses.length}));
  }
}
function ensureSenseRecord(unit){
  const s=state(unit.w.id);
  if(!s.senses[unit.sense.key]) s.senses[unit.sense.key]={correct:0,wrong:0};
  if(s.senseHits[unit.sense.key]==null){
    // v2 migration: single-sense 3x records are unambiguous; multi-sense records use prior meaning-specific correct counts only.
    if(unit.count===1) s.senseHits[unit.sense.key]=Math.min(3,s.tripleHits||0);
    else s.senseHits[unit.sense.key]=Math.min(3,s.senses[unit.sense.key]?.correct||0);
  }
  return s.senses[unit.sense.key];
}
function getHits(unit){ ensureSenseRecord(unit); return clamp(Number(state(unit.w.id).senseHits[unit.sense.key])||0,0,3); }
function setHits(unit,n){ ensureSenseRecord(unit); state(unit.w.id).senseHits[unit.sense.key]=clamp(n,0,3); }
function unitWrong(unit){ return ensureSenseRecord(unit).wrong||0; }
function unitCorrect(unit){ return ensureSenseRecord(unit).correct||0; }
function isUnitClear(unit){ return getHits(unit)>=3; }
function isWordClear(w){ return getSenses(w).every(s=>getHits({w,sense:s,count:getSenses(w).length})>=3); }

function missionData(){
  let hits=0,clearedUnits=0; const dist=[0,0,0,0];
  for(const u of UNITS){ const h=getHits(u); hits+=h; dist[h]++; if(h>=3)clearedUnits++; }
  let clearedWords=0; for(const w of WORDS) if(isWordClear(w)) clearedWords++;
  const total=UNITS.length*3, remaining=Math.max(0,total-hits), pct=total?Math.round(hits/total*100):0;
  return {hits,clearedUnits,clearedWords,total,remaining,pct,dist};
}
function planningData(){
  const m=missionData(); let days=null,needed=null;
  if(settings.targetDate){
    const target=dateFromKey(settings.targetDate),today=dateFromKey(localDateKey());
    const diff=Math.floor((target-today)/DAY); days=diff>=0?diff+1:0; needed=days>0?Math.ceil(m.remaining/days):null;
  }
  return {...m,days,needed};
}
function todayStats(){
  const a=activityEntry(); return {hits:a.missionHits||0,answered:a.answered||0,correct:a.correct||0,wrong:a.wrong||0};
}
function refreshHome(){
  const m=missionData(), plan=planningData(), t=todayStats(), quota=settings.dailyQuota;
  $("#overallPct").textContent=m.pct; $("#earnedHits").textContent=m.hits.toLocaleString(); $("#totalHits").textContent=m.total.toLocaleString();
  $("#remainingHits").textContent=m.remaining.toLocaleString(); $("#clearedUnits").textContent=m.clearedUnits.toLocaleString(); $("#clearedWords").textContent=m.clearedWords.toLocaleString();
  $("#streakCount").textContent=streakCount(); $("#ringPct").textContent=m.pct+"%"; $("#progressRing").style.setProperty("--p",(m.pct*3.6)+"deg");
  $("#targetDate").value=settings.targetDate||""; $("#dailyQuota").value=quota;
  $("#daysLeft").textContent=plan.days==null?"—":plan.days; $("#planRemaining").textContent=m.remaining.toLocaleString(); $("#neededPerDay").textContent=plan.needed==null?"—":plan.needed.toLocaleString();
  $("#todayHits").textContent=t.hits.toLocaleString(); $("#todayQuotaText").textContent=quota.toLocaleString(); $("#dailyGoalBar").style.width=Math.min(100,t.hits/quota*100)+"%";
  const pace=$("#paceStatus"), hint=$("#planHint");
  if(m.remaining===0){ pace.textContent="全クリ"; pace.className="status-pill good"; hint.textContent="全3553語義を3回ずつ正解しました。"; }
  else if(!settings.targetDate){ pace.textContent="目標日未設定"; pace.className="status-pill"; hint.textContent=`現在の残りは ${m.remaining.toLocaleString()} 正解。目標日を決めると必要な1日ノルマを自動計算します。`; }
  else if(plan.days===0){ pace.textContent="目標日経過"; pace.className="status-pill bad"; hint.textContent="新しい目標日を設定してください。"; }
  else if(quota>=plan.needed){ pace.textContent="ペースOK"; pace.className="status-pill good"; hint.textContent=`このペースなら目標日に間に合います。必要ペースは1日 ${plan.needed.toLocaleString()} 正解です。`; }
  else { pace.textContent=`+${(plan.needed-quota).toLocaleString()}/日`; pace.className="status-pill warn"; hint.textContent=`目標日に間に合わせるには、あと1日 ${(plan.needed-quota).toLocaleString()} 正解増やす必要があります。`; }
  $("#startMissionBtn").textContent = m.remaining===0 ? "全クリ済み" : (t.hits>=quota ? "今日のノルマ達成済み · 続ける" : "今日のノルマを始める");
  $("#startMissionBtn").disabled = m.remaining===0;
}
function savePlan(){
  settings.targetDate=$("#targetDate").value||""; settings.dailyQuota=clamp(parseInt($("#dailyQuota").value)||100,1,2000); $("#dailyQuota").value=settings.dailyQuota; persist(); refreshHome();
}
function autoQuota(){
  settings.targetDate=$("#targetDate").value||settings.targetDate||""; const p=planningData();
  if(p.needed==null){ toast(settings.targetDate?"目標日が過ぎています":"先に目標日を設定してください"); return; }
  settings.dailyQuota=clamp(Math.max(1,p.needed),1,2000); persist(); refreshHome(); toast(`1日 ${settings.dailyQuota.toLocaleString()} 正解に設定しました`);
}

function go(view){
  $$(".view").forEach(v=>v.classList.remove("active")); const el=$(`#${view}View`); if(el)el.classList.add("active");
  $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  window.scrollTo({top:0,behavior:"instant"});
  if(view==="home")refreshHome(); if(view==="search")renderSearch(); if(view==="stats")renderStats();
}

function normalizeMeaning(s){
  return String(s).toLowerCase().replace(/[（(][^）)]*[）)]/g,"").replace(/[〈〉［］\[\]～〜・，、。,.\/＝=\s]/g,"").replace(/[①-⑳]/g,"");
}
function meaningTokens(s){
  const cleaned=String(s).replace(/[（(][^）)]*[）)]/g," ").replace(/[〈〉［］\[\]～〜・，、。,.\/＝=]/g," ");
  return [...new Set(cleaned.match(/[一-龯ぁ-んァ-ヶー]{2,}|[a-zA-Z]{3,}/g)||[])];
}
function meaningsOverlap(a,b){
  const na=normalizeMeaning(a),nb=normalizeMeaning(b); if(!na||!nb)return false; if(na===nb)return true;
  if(Math.min(na.length,nb.length)>=4&&(na.includes(nb)||nb.includes(na)))return true;
  const A=meaningTokens(a),B=meaningTokens(b); if(!A.length||!B.length)return false;
  let shared=0; for(const x of A) if(B.includes(x))shared++;
  return shared/Math.min(A.length,B.length)>=0.6;
}
function distractorsFor(unit){
  const candidates=shuffle(UNITS.filter(u=>u.w.id!==unit.w.id && !meaningsOverlap(u.sense.text,unit.sense.text)));
  const picked=[]; const used=[];
  for(const c of candidates){
    if(used.some(x=>meaningsOverlap(x,c.sense.text)))continue;
    picked.push(c); used.push(c.sense.text); if(picked.length===3)break;
  }
  return picked;
}
function weightedRandom(pool){
  let total=0; const weighted=pool.map(u=>{
    const h=getHits(u), w=1 + Math.min(4,unitWrong(u)*0.55) + h*0.18; total+=w; return [u,total];
  });
  const r=Math.random()*total; return weighted.find(([,cum])=>r<cum)?.[0]||pool[0];
}
function queueRetry(unit){
  if(retryQueue.some(x=>x.id===unit.id))return;
  retryQueue.push({id:unit.id,due:questionNo+4+Math.floor(Math.random()*3)});
}
function chooseNextUnit(){
  retryQueue=retryQueue.filter(x=>{ const u=UNITS.find(v=>v.id===x.id); return u&&!isUnitClear(u); });
  const due=retryQueue.filter(x=>x.due<=questionNo);
  if(due.length){
    const item=due[0]; retryQueue=retryQueue.filter(x=>x!==item); return UNITS.find(u=>u.id===item.id);
  }
  let pool=UNITS.filter(u=>!isUnitClear(u)&&!recentUnits.includes(u.id)&&!recentWords.includes(u.w.id));
  if(pool.length<8) pool=UNITS.filter(u=>!isUnitClear(u)&&!recentUnits.includes(u.id));
  if(!pool.length) pool=UNITS.filter(u=>!isUnitClear(u));
  return pool.length?weightedRandom(pool):null;
}
function startMission(forceContinue=false){
  const m=missionData(); if(!m.remaining){toast("全語義クリア済みです");return;}
  quotaExtended=forceContinue || todayStats().hits>=settings.dailyQuota;
  currentUnit=null; missionAnswered=false; combo=0; retryQueue=[]; recentUnits=[]; recentWords=[]; questionNo=0;
  go("mission"); nextMission();
}
function nextMission(){
  const t=todayStats();
  if(!quotaExtended && t.hits>=settings.dailyQuota){ showComplete(); return; }
  currentUnit=chooseNextUnit(); missionAnswered=false;
  if(!currentUnit){ showComplete(true); return; }
  questionNo++;
  recentUnits.push(currentUnit.id); if(recentUnits.length>10)recentUnits.shift();
  recentWords.push(currentUnit.w.id); if(recentWords.length>5)recentWords.shift();
  renderMission();
}
function renderMission(){
  const u=currentUnit,m=missionData(),t=todayStats(),quota=settings.dailyQuota,h=getHits(u);
  $("#missionTodayHits").textContent=t.hits.toLocaleString(); $("#missionQuota").textContent=quota.toLocaleString(); $("#missionBar").style.width=Math.min(100,t.hits/quota*100)+"%";
  $("#missionRemaining").textContent=m.remaining.toLocaleString(); $("#missionWordNo").textContent=`No. ${u.w.id}`; $("#senseHit").textContent=`${h} / 3`;
  $("#missionPrompt").textContent=u.w.word; $("#missionStarBtn").textContent=state(u.w.id).starred?"★":"☆";
  const label=$("#senseLabel");
  if(u.count>1){ label.classList.remove("hidden"); label.textContent=`${u.sense.no||`意味${u.index+1}`} ${u.sense.pos||""}`.trim(); }
  else label.classList.add("hidden");
  $("#missionFeedback").className="feedback hidden"; $("#nextMissionBtn").classList.add("hidden"); $("#missionChoices").innerHTML="";
  const choices=shuffle([u,...distractorsFor(u)]);
  choices.forEach(c=>{
    const b=document.createElement("button"); b.className="choice"; b.textContent=c.sense.text; b.dataset.unit=c.id;
    b.onclick=()=>answerMission(b,c.id===u.id); $("#missionChoices").appendChild(b);
  });
  updateLiveStats();
}
function recordMission(correct){
  const u=currentUnit,s=state(u.w.id),sr=ensureSenseRecord(u),a=activityEntry();
  s.seen=(s.seen||0)+1; a.answered=(a.answered||0)+1;
  let gained=0;
  if(correct){
    s.correct=(s.correct||0)+1; sr.correct=(sr.correct||0)+1; a.correct=(a.correct||0)+1;
    const before=getHits(u); if(before<3){ setHits(u,before+1); a.missionHits=(a.missionHits||0)+1; gained=1; }
    s.status=isWordClear(u.w)?"mastered":"learning";
  }else{
    s.wrong=(s.wrong||0)+1; sr.wrong=(sr.wrong||0)+1; a.wrong=(a.wrong||0)+1; s.status="weak"; queueRetry(u);
  }
  persist(); return gained;
}
function answerMission(btn,correct){
  if(missionAnswered)return; missionAnswered=true;
  const u=currentUnit;
  [...$("#missionChoices").children].forEach(b=>{ b.disabled=true; if(b.dataset.unit===u.id)b.classList.add("correct"); });
  if(!correct)btn.classList.add("wrong");
  const gained=recordMission(correct),h=getHits(u); combo=correct?combo+1:0;
  $("#senseHit").textContent=`${h} / 3`;
  const f=$("#missionFeedback"); f.className="feedback "+(correct?"good-f":"bad-f");
  if(correct){
    const clearText=h>=3?" · この語義をクリア！":"";
    f.innerHTML=`✓ 正解 <b>${h} / 3</b>${clearText}${u.count>1?`<div class="feedback-note">${escapeHTML(u.w.word)} ${escapeHTML(u.sense.no)}：${escapeHTML(u.sense.text)}</div>`:""}`;
  }else{
    f.innerHTML=`✕ 正解は <b>${escapeHTML(u.sense.text)}</b><div class="feedback-note">4〜6問ほど後にもう一度出ます。正解回数は減りません。</div>`;
  }
  $("#nextMissionBtn").classList.remove("hidden"); updateMissionHeader(); updateLiveStats();
  const t=todayStats(); if(gained && t.hits>0 && t.hits%25===0)toast(`今日 ${t.hits.toLocaleString()} 正解！`);
}
function updateMissionHeader(){
  const t=todayStats(),m=missionData(),quota=settings.dailyQuota;
  $("#missionTodayHits").textContent=t.hits.toLocaleString(); $("#missionQuota").textContent=quota.toLocaleString(); $("#missionBar").style.width=Math.min(100,t.hits/quota*100)+"%"; $("#missionRemaining").textContent=m.remaining.toLocaleString();
}
function updateLiveStats(){
  const t=todayStats(); $("#comboCount").textContent=combo; $("#todayAnswered").textContent=t.answered.toLocaleString(); $("#todayAccuracy").textContent=t.answered?Math.round(t.correct/t.answered*100)+"%":"—";
}
function showComplete(all=false){
  const m=missionData(),t=todayStats();
  $("#completeTodayHits").textContent=t.hits.toLocaleString(); $("#completeRemaining").textContent=m.remaining.toLocaleString(); $("#completeUnits").textContent=m.clearedUnits.toLocaleString(); $("#completeWords").textContent=m.clearedWords.toLocaleString();
  $("#continueMissionBtn").classList.toggle("hidden",all||m.remaining===0); go("complete");
}
function toggleStar(id){ const s=state(id); s.starred=!s.starred; persist(); return s.starred; }

function renderSearch(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const list=(q?WORDS.filter(w=>w.word.toLowerCase().includes(q)||w.meaning.toLowerCase().includes(q)):WORDS.slice(0,80)).slice(0,160);
  $("#searchResults").innerHTML=list.map(w=>{
    const senses=getSenses(w), rows=senses.map(s=>{ const u={w,sense:s,count:senses.length}; return `<div class="sense-row"><span>${escapeHTML(s.no||"")}${s.pos?` ${escapeHTML(s.pos)}`:""}</span><em>${escapeHTML(s.text)}</em><b>${getHits(u)}/3</b></div>`; }).join("");
    return `<div class="word-item"><div><div class="meta">No. ${w.id} · ${senses.length}語義</div><h4>${escapeHTML(w.word)}</h4>${rows}</div><button class="mini-star" data-star="${w.id}">${state(w.id).starred?"★":"☆"}</button></div>`;
  }).join("");
  $$('[data-star]').forEach(b=>b.onclick=()=>{ const on=toggleStar(Number(b.dataset.star)); b.textContent=on?"★":"☆"; });
}
function renderWeekStrip(){
  const today=localDateKey(),labels=["日","月","火","水","木","金","土"],cells=[];
  for(let i=6;i>=0;i--){ const key=shiftDateKey(today,-i),d=dateFromKey(key),a=activity[key]||{},count=a.missionHits||0; cells.push(`<div class="week-day ${count?"active":""}"><span>${labels[d.getDay()]}</span><b>${d.getDate()}</b><small>${count||"—"}</small></div>`); }
  $("#weekStrip").innerHTML=cells.join("");
}
function renderStats(){
  const m=missionData(),entries=Object.values(progress).filter(v=>v&&typeof v==="object");
  const correct=entries.reduce((a,s)=>a+(s.correct||0),0),wrong=entries.reduce((a,s)=>a+(s.wrong||0),0),t=todayStats();
  $("#statsHits").textContent=m.hits.toLocaleString(); $("#statsClearedUnits").textContent=m.clearedUnits.toLocaleString(); $("#statsClearedWords").textContent=m.clearedWords.toLocaleString();
  $("#statsStreak").textContent=streakCount(); $("#statsToday").textContent=t.hits.toLocaleString(); $("#statsAccuracy").textContent=(correct+wrong)?Math.round(correct/(correct+wrong)*100)+"%":"—";
  $("#hitDistribution").innerHTML=m.dist.map((n,i)=>`<div><span>${i}/3</span><div class="mini-bar"><i style="width:${UNITS.length?Math.round(n/UNITS.length*100):0}%"></i></div><b>${n.toLocaleString()}</b></div>`).join("");
  renderWeekStrip();
  const hard=UNITS.filter(u=>unitWrong(u)>0&&!isUnitClear(u)).sort((a,b)=>unitWrong(b)-unitWrong(a)||getHits(a)-getHits(b)).slice(0,12);
  $("#hardList").innerHTML=hard.length?hard.map(u=>`<div class="hard-item"><div><b>${escapeHTML(u.w.word)} ${escapeHTML(u.sense.no||"")}</b><span>${escapeHTML(u.sense.text)}</span></div><em>誤答 ${unitWrong(u)} · ${getHits(u)}/3</em></div>`).join(""):`<p class="tiny">まだ誤答記録はありません。</p>`;
  const chunks=[];
  for(let start=1;start<=WORDS.length;start+=100){
    const end=Math.min(start+99,WORDS.length),ws=WORDS.filter(w=>w.id>=start&&w.id<=end),cleared=ws.filter(isWordClear).length,p=Math.round(cleared/ws.length*100);
    chunks.push(`<div class="chunk"><span>${start}–${end}</span><div class="mini-bar"><i style="width:${p}%"></i></div><b>${p}%</b></div>`);
  }
  $("#chunkStats").innerHTML=chunks.join("");
}

function exportProgress(){
  const payload={version:3,exportedAt:new Date().toISOString(),progress,settings,activity};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url; a.download=`vocab1935-progress-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProgress(file){
  try{
    const j=JSON.parse(await file.text()); if(!j||typeof j.progress!=="object")throw new Error();
    progress=j.progress; settings=Object.assign(settings,j.settings||{}); settings.dailyQuota=clamp(parseInt(settings.dailyQuota)||100,1,2000); activity=(j.activity&&typeof j.activity==="object")?j.activity:{};
    persist(); refreshHome(); toast("進捗を読み込みました");
  }catch{toast("読み込みに失敗しました")}
}
function resetProgress(){
  if(confirm("すべての学習記録をリセットしますか？")){ progress={}; activity={}; localStorage.removeItem(KEY); localStorage.removeItem(ACTIVITY_KEY); persist(); refreshHome(); toast("リセットしました"); }
}
function applyTheme(){
  const dark=settings.theme==="dark"||(settings.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme=dark?"dark":"light";
}
function cycleTheme(){ settings.theme=settings.theme==="system"?"light":settings.theme==="light"?"dark":"system"; persist(); applyTheme(); toast(`表示: ${settings.theme==="system"?"端末設定":settings.theme==="light"?"ライト":"ダーク"}`); }

buildUnits();
// Ensure migration is materialized once so totals remain stable across reloads.
for(const u of UNITS) ensureSenseRecord(u);
persist();
$("#targetDate").onchange=savePlan; $("#dailyQuota").onchange=savePlan; $("#autoQuotaBtn").onclick=autoQuota;
$("#startMissionBtn").onclick=()=>startMission(false); $("#missionSpeakBtn").onclick=()=>speak(currentUnit?.w.word||"");
$("#missionStarBtn").onclick=()=>{ if(currentUnit)$("#missionStarBtn").textContent=toggleStar(currentUnit.w.id)?"★":"☆"; };
$("#nextMissionBtn").onclick=nextMission; $("#continueMissionBtn").onclick=()=>startMission(true);
$("#searchInput").oninput=renderSearch; $("#exportBtn").onclick=exportProgress; $("#importInput").onchange=e=>{if(e.target.files[0])importProgress(e.target.files[0]);}; $("#resetBtn").onclick=resetProgress;
$("#themeBtn").onclick=cycleTheme;
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
$$(".bottom-nav button").forEach(b=>b.onclick=()=>go(b.dataset.view));
applyTheme(); refreshHome();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
