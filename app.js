const WORDS = window.WORDS || [];
const KEY = "vocab1935-progress-v1";
const SETTINGS_KEY = "vocab1935-settings-v1";
const ACTIVITY_KEY = "vocab1935-activity-v2";
const DAY = 86400000;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const IS_STANDALONE = !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true);
document.documentElement.classList.toggle("pwa-standalone", IS_STANDALONE);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let progress = loadJSON(KEY, {});
let activity = loadJSON(ACTIVITY_KEY, {});
const legacySettings = loadJSON(SETTINGS_KEY, {});
let settings = Object.assign({ theme:"system", targetDate:"", dailyQuota:100, mode:"mixed", autoStartOnOpen:false }, legacySettings);
if(!["en-ja","ja-en","mixed"].includes(settings.mode)) settings.mode="mixed";
settings.dailyQuota = clamp(parseInt(settings.dailyQuota)||100, 1, 2000);

const senseCache = new Map();
let UNITS = [];
let currentUnit = null;
let currentDirection = "en-ja";
let missionAnswered = false;
let recentUnits = [];
let recentWords = [];
let retryQueue = [];
let questionNo = 0;
let combo = 0;
let quotaExtended = false;
let recentDirections = [];

const ACCENTS = [
  ["#4f46e5","79,70,229"],["#7c3aed","124,58,237"],["#c026d3","192,38,211"],
  ["#db2777","219,39,119"],["#e11d48","225,29,72"],["#ea580c","234,88,12"],
  ["#ca8a04","202,138,4"],["#16a34a","22,163,74"],["#059669","5,150,105"],
  ["#0891b2","8,145,178"],["#0284c7","2,132,199"],["#2563eb","37,99,235"]
];

function loadJSON(k,fallback){ try{return JSON.parse(localStorage.getItem(k)) ?? fallback}catch{return fallback} }
function persist(){
  localStorage.setItem(KEY,JSON.stringify(progress));
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
  localStorage.setItem(ACTIVITY_KEY,JSON.stringify(activity));
}
function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),1600); }
function syncVisualViewport(){
  // Installed iOS PWAs already have their own stable standalone viewport.
  // visualViewport can report a shorter inset viewport there, which caused
  // a blank strip at the bottom and pushed content under the status bar.
  if(IS_STANDALONE){
    const h = window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty("--app-vh", `${Math.round(h)}px`);
    document.documentElement.style.setProperty("--app-vtop", "0px");
    return;
  }
  const vv=window.visualViewport;
  const h=vv ? vv.height : window.innerHeight;
  const top=vv ? vv.offsetTop : 0;
  document.documentElement.style.setProperty("--app-vh", `${Math.round(h)}px`);
  document.documentElement.style.setProperty("--app-vtop", `${Math.max(0,Math.round(top))}px`);
}
function scheduleViewportSync(){
  syncVisualViewport();
  requestAnimationFrame(syncVisualViewport);
  setTimeout(syncVisualViewport,120);
  setTimeout(syncVisualViewport,420);
}

function setRandomAccent(force=false){
  const prev=localStorage.getItem("vocab1935-last-accent");
  let pool=ACCENTS.filter(a=>force || a[0]!==prev);
  if(!pool.length) pool=ACCENTS;
  const [hex,rgb]=sample(pool);
  document.documentElement.style.setProperty("--accent",hex);
  document.documentElement.style.setProperty("--accent-rgb",rgb);
  document.documentElement.style.setProperty("--accentText",isLight(hex)?"#111827":"#ffffff");
  localStorage.setItem("vocab1935-last-accent",hex);
}
function isLight(hex){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return (r*299+g*587+b*114)/1000>170;
}
function speak(text){
  if(!("speechSynthesis" in window)) return toast("このブラウザでは読み上げを利用できません");
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(String(text).replace(/[～〜]/g," "));
  u.lang="en-US"; u.rate=.87; speechSynthesis.speak(u);
}
function state(id){
  if(!progress[id]) progress[id]={level:0,correct:0,wrong:0,seen:0,due:0,status:"new",starred:false,tripleHits:0,senses:{},senseHits:{}};
  const s=progress[id];
  if(!s.senses) s.senses={};
  if(!s.senseHits) s.senseHits={};
  if(s.tripleHits==null) s.tripleHits=0;
  return s;
}
function localDateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
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
    if(CIRCLED.includes(part)&&part.length===1){
      if(current&&current.text.trim()) out.push(current);
      current={no:part,pos,text:""}; continue;
    }
    if(current) current.text+=part; else plain+=part;
  }
  if(current&&current.text.trim()) out.push(current);
  if(!out.length){
    const stripped=plain.trim()||String(raw).replace(/^\[[^\]]+\]\s*/,"").trim();
    return [{key:"1",no:"",pos,text:stripped||String(raw)}];
  }
  return out.map((s,i)=>({key:s.no||String(i+1),no:s.no,pos:s.pos,text:s.text.trim()}));
}
function getSenses(w){ if(!senseCache.has(w.id)) senseCache.set(w.id,parseSenses(w.meaning)); return senseCache.get(w.id); }
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
    if(unit.count===1) s.senseHits[unit.sense.key]=Math.min(3,s.tripleHits||0);
    else s.senseHits[unit.sense.key]=Math.min(3,s.senses[unit.sense.key]?.correct||0);
  }
  return s.senses[unit.sense.key];
}
function getHits(unit){ ensureSenseRecord(unit); return clamp(Number(state(unit.w.id).senseHits[unit.sense.key])||0,0,3); }
function setHits(unit,n){ ensureSenseRecord(unit); state(unit.w.id).senseHits[unit.sense.key]=clamp(n,0,3); }
function unitWrong(unit){ return ensureSenseRecord(unit).wrong||0; }
function isUnitClear(unit){ return getHits(unit)>=3; }
function isWordClear(w){ const senses=getSenses(w); return senses.every(s=>getHits({w,sense:s,count:senses.length})>=3); }

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
function todayStats(){ const a=activityEntry(); return {hits:a.missionHits||0,answered:a.answered||0,correct:a.correct||0,wrong:a.wrong||0}; }

function modeText(mode=settings.mode){ return mode==="en-ja"?"英 → 日":mode==="ja-en"?"日 → 英":"ごちゃまぜ"; }
function refreshModeUI(){
  $$("#modeSegment button").forEach(b=>b.classList.toggle("active",b.dataset.mode===settings.mode));
  $("#modeHint").textContent=modeText();
}
function setMode(mode){ settings.mode=mode; persist(); refreshModeUI(); }

function refreshHome(){
  const m=missionData(), plan=planningData(), t=todayStats(), quota=settings.dailyQuota;
  $("#overallPct").textContent=m.pct; $("#earnedHits").textContent=m.hits.toLocaleString(); $("#totalHits").textContent=m.total.toLocaleString();
  $("#remainingHits").textContent=m.remaining.toLocaleString(); $("#clearedUnits").textContent=m.clearedUnits.toLocaleString(); $("#clearedWords").textContent=m.clearedWords.toLocaleString();
  $("#streakCount").textContent=streakCount(); $("#ringPct").textContent=m.pct+"%"; $("#progressRing").style.setProperty("--p",(m.pct*3.6)+"deg");
  $("#targetDate").value=settings.targetDate||""; $("#dailyQuota").value=quota;
  $("#daysLeft").textContent=plan.days==null?"—":plan.days; $("#planRemaining").textContent=m.remaining.toLocaleString(); $("#neededPerDay").textContent=plan.needed==null?"—":plan.needed.toLocaleString();
  $("#todayHits").textContent=t.hits.toLocaleString(); $("#todayQuotaText").textContent=quota.toLocaleString(); $("#dailyGoalBar").style.width=Math.min(100,t.hits/quota*100)+"%";
  const pace=$("#paceStatus"), hint=$("#planHint");
  if(m.remaining===0){ pace.textContent="全クリ"; pace.className="status-pill good"; hint.textContent=`全${UNITS.length.toLocaleString()}語義を3回ずつ正解しました。`; }
  else if(!settings.targetDate){ pace.textContent="目標日未設定"; pace.className="status-pill"; hint.textContent=`現在の残りは ${m.remaining.toLocaleString()} 正解。目標日を決めると必要な1日ノルマを自動計算します。`; }
  else if(plan.days===0){ pace.textContent="目標日経過"; pace.className="status-pill bad"; hint.textContent="新しい目標日を設定してください。"; }
  else if(quota>=plan.needed){ pace.textContent="ペースOK"; pace.className="status-pill good"; hint.textContent=`必要ペースは1日 ${plan.needed.toLocaleString()} 正解です。現在のモードは「${modeText()}」。`; }
  else { pace.textContent=`+${(plan.needed-quota).toLocaleString()}/日`; pace.className="status-pill warn"; hint.textContent=`目標日に間に合わせるには、あと1日 ${(plan.needed-quota).toLocaleString()} 正解増やす必要があります。`; }
  $("#startMissionBtn").textContent = m.remaining===0 ? "全クリ済み" : (t.hits>=quota ? `今日達成済み · ${modeText()}で続ける` : `${modeText()}で今日のノルマを始める`);
  $("#startMissionBtn").disabled = m.remaining===0;
  $("#autoStartOnOpen").checked=!!settings.autoStartOnOpen;
  refreshModeUI();
}
function savePlan(){ settings.targetDate=$("#targetDate").value||""; settings.dailyQuota=clamp(parseInt($("#dailyQuota").value)||100,1,2000); $("#dailyQuota").value=settings.dailyQuota; persist(); refreshHome(); }
function autoQuota(){
  settings.targetDate=$("#targetDate").value||settings.targetDate||""; const p=planningData();
  if(p.needed==null){ toast(settings.targetDate?"目標日が過ぎています":"先に目標日を設定してください"); return; }
  settings.dailyQuota=clamp(Math.max(1,p.needed),1,2000); persist(); refreshHome(); toast(`1日 ${settings.dailyQuota.toLocaleString()} 正解に設定`);
}
function go(view){
  $$(".view").forEach(v=>v.classList.remove("active")); const el=$(`#${view}View`); if(el) el.classList.add("active");
  document.body.classList.toggle("quiz-open",view==="mission"); if(view==="mission") scheduleViewportSync();
  $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view!=="mission") window.scrollTo({top:0,behavior:"instant"});
  if(view==="home") refreshHome(); if(view==="search") renderSearch(); if(view==="stats") renderStats();
}

function normalizeMeaning(s){
  return String(s).toLowerCase().replace(/[（(][^）)]*[）)]/g,"").replace(/[〈〉［］\[\]～〜・，、。,.\/＝=\s]/g,"").replace(/[①-⑳]/g,"");
}
function meaningTokens(s){
  const cleaned=String(s).replace(/[（(][^）)]*[）)]/g," ").replace(/[〈〉［］\[\]～〜・，、。,.\/＝=]/g," ");
  return [...new Set(cleaned.match(/[一-龯ぁ-んァ-ヶー]{2,}|[a-zA-Z]{3,}/g)||[])];
}
function meaningsOverlap(a,b){
  const na=normalizeMeaning(a),nb=normalizeMeaning(b); if(!na||!nb) return false; if(na===nb) return true;
  if(Math.min(na.length,nb.length)>=4&&(na.includes(nb)||nb.includes(na))) return true;
  const A=meaningTokens(a),B=meaningTokens(b); if(!A.length||!B.length) return false;
  let shared=0; for(const x of A) if(B.includes(x)) shared++;
  return shared/Math.min(A.length,B.length)>=0.55;
}
function distractorsFor(unit,direction){
  const targetWord=unit.w.word.toLowerCase();
  const candidates=shuffle(UNITS.filter(u=>u.w.id!==unit.w.id && u.w.word.toLowerCase()!==targetWord && !meaningsOverlap(u.sense.text,unit.sense.text)));
  const picked=[], usedWords=new Set(), usedMeanings=[];
  for(const c of candidates){
    const w=c.w.word.toLowerCase(), nm=normalizeMeaning(c.sense.text);
    if(direction==="ja-en" && usedWords.has(w)) continue;
    if(direction==="en-ja" && usedMeanings.some(x=>meaningsOverlap(x,c.sense.text))) continue;
    picked.push(c); usedWords.add(w); usedMeanings.push(c.sense.text);
    if(picked.length===3) break;
  }
  return picked;
}
function weightedRandom(pool){
  let total=0; const weighted=pool.map(u=>{ const h=getHits(u), w=1+Math.min(4,unitWrong(u)*.55)+h*.18; total+=w; return [u,total]; });
  const r=Math.random()*total; return weighted.find(([,cum])=>r<cum)?.[0]||pool[0];
}
function queueRetry(unit){ if(retryQueue.some(x=>x.id===unit.id)) return; retryQueue.push({id:unit.id,due:questionNo+4+Math.floor(Math.random()*3)}); }
function chooseNextUnit(){
  retryQueue=retryQueue.filter(x=>{ const u=UNITS.find(v=>v.id===x.id); return u&&!isUnitClear(u); });
  const due=retryQueue.filter(x=>x.due<=questionNo);
  if(due.length){ const item=due[0]; retryQueue=retryQueue.filter(x=>x!==item); return UNITS.find(u=>u.id===item.id); }
  let pool=UNITS.filter(u=>!isUnitClear(u)&&!recentUnits.includes(u.id)&&!recentWords.includes(u.w.id));
  if(pool.length<8) pool=UNITS.filter(u=>!isUnitClear(u)&&!recentUnits.includes(u.id));
  if(!pool.length) pool=UNITS.filter(u=>!isUnitClear(u));
  return pool.length?weightedRandom(pool):null;
}
function chooseDirection(){
  if(settings.mode!=="mixed") return settings.mode;
  if(recentDirections.length>=2 && recentDirections.slice(-2).every(x=>x===recentDirections.at(-1))) return recentDirections.at(-1)==="en-ja"?"ja-en":"en-ja";
  if(recentDirections.length && Math.random()<.42) return recentDirections.at(-1)==="en-ja"?"ja-en":"en-ja";
  return Math.random()<.5?"en-ja":"ja-en";
}
function startMission(forceContinue=false){
  const m=missionData(); if(!m.remaining){ toast("全語義クリア済みです"); return; }
  quotaExtended=forceContinue || todayStats().hits>=settings.dailyQuota;
  currentUnit=null; missionAnswered=false; combo=0; retryQueue=[]; recentUnits=[]; recentWords=[]; recentDirections=[]; questionNo=0;
  go("mission"); nextMission();
}
function nextMission(){
  const t=todayStats();
  if(!quotaExtended && t.hits>=settings.dailyQuota){ showComplete(); return; }
  currentUnit=chooseNextUnit(); missionAnswered=false;
  if(!currentUnit){ showComplete(true); return; }
  currentDirection=chooseDirection(); recentDirections.push(currentDirection); if(recentDirections.length>5) recentDirections.shift();
  questionNo++;
  recentUnits.push(currentUnit.id); if(recentUnits.length>10) recentUnits.shift();
  recentWords.push(currentUnit.w.id); if(recentWords.length>5) recentWords.shift();
  renderMission();
}
function unitLabel(u){ return `${u.sense.no||""}${u.sense.pos?` ${u.sense.pos}`:""}`.trim(); }
function renderMission(){
  const u=currentUnit,m=missionData(),t=todayStats(),quota=settings.dailyQuota,h=getHits(u);
  $("#missionTodayHits").textContent=t.hits.toLocaleString(); $("#missionQuota").textContent=quota.toLocaleString(); $("#missionBar").style.width=Math.min(100,t.hits/quota*100)+"%";
  $("#missionRemaining").textContent=m.remaining.toLocaleString(); $("#missionWordNo").textContent=`No. ${u.w.id}`;
  $("#senseLabel").textContent=unitLabel(u) || "単一語義"; $("#senseHit").textContent=`${h} / 3`; $("#directionBadge").textContent=currentDirection==="en-ja"?"英 → 日":"日 → 英";
  $("#missionStarBtn").textContent=state(u.w.id).starred?"★":"☆";
  const prompt=$("#missionPrompt"), speakBtn=$("#missionSpeakBtn");
  if(currentDirection==="en-ja"){
    prompt.textContent=u.w.word; prompt.classList.remove("jp"); speakBtn.classList.remove("hidden");
  }else{
    prompt.textContent=u.sense.text; prompt.classList.add("jp"); speakBtn.classList.add("hidden");
  }
  $("#missionFeedback").className="feedback-strip neutral"; $("#missionFeedback").textContent="1つ選んでください";
  const next=$("#nextMissionBtn"); next.disabled=true; next.textContent="選択してください";
  $("#missionChoices").innerHTML="";
  const choices=shuffle([u,...distractorsFor(u,currentDirection)]);
  choices.forEach(c=>$("#missionChoices").appendChild(makeChoice(c,u)));
  updateLiveStats();
}
function makeChoice(c,target){
  const b=document.createElement("button"); b.className="choice-card"; b.dataset.unit=c.id;
  const main=document.createElement("div"); main.className="choice-main";
  const reveal=document.createElement("div"); reveal.className="choice-reveal";
  if(currentDirection==="en-ja"){
    main.textContent=c.sense.text;
    reveal.innerHTML=`<b>${escapeHTML(c.w.word)}</b>${unitLabel(c)?` <span>· ${escapeHTML(unitLabel(c))}</span>`:""}`;
  }else{
    main.textContent=c.w.word; main.classList.add("en","has-audio");
    const audio=document.createElement("button"); audio.type="button"; audio.className="choice-audio"; audio.textContent="🔊"; audio.setAttribute("aria-label",`${c.w.word}を読み上げ`);
    audio.onclick=e=>{ e.stopPropagation(); speak(c.w.word); };
    b.appendChild(audio);
    reveal.textContent=c.sense.text;
  }
  b.appendChild(main); b.appendChild(reveal);
  b.onclick=()=>answerMission(b,c.id===target.id);
  return b;
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
  if(missionAnswered) return; missionAnswered=true;
  const u=currentUnit, targetId=u.id;
  [...$("#missionChoices").children].forEach(b=>{
    b.disabled=true; b.classList.add("answered");
    if(b.dataset.unit===targetId) b.classList.add("correct");
    else if(b===btn && !correct) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  const gained=recordMission(correct),h=getHits(u); combo=correct?combo+1:0;
  $("#senseHit").textContent=`${h} / 3`;
  const f=$("#missionFeedback");
  if(correct){ f.className="feedback-strip good"; f.textContent=h>=3?"✓ 正解 · この語義をクリア！":`✓ 正解 · ${h}/3`; }
  else { f.className="feedback-strip bad"; f.textContent="✕ 不正解 · 正解は緑色。4〜6問後に再出題"; }
  const next=$("#nextMissionBtn"); next.disabled=false; next.textContent="次の問題";
  updateMissionHeader(); updateLiveStats();
  const t=todayStats(); if(gained && t.hits>0 && t.hits%25===0) toast(`今日 ${t.hits.toLocaleString()} 正解！`);
}
function updateMissionHeader(){
  const t=todayStats(),m=missionData(),quota=settings.dailyQuota;
  $("#missionTodayHits").textContent=t.hits.toLocaleString(); $("#missionQuota").textContent=quota.toLocaleString(); $("#missionBar").style.width=Math.min(100,t.hits/quota*100)+"%"; $("#missionRemaining").textContent=m.remaining.toLocaleString();
}
function updateLiveStats(){ const t=todayStats(); $("#comboCount").textContent=combo; $("#todayAccuracy").textContent=t.answered?Math.round(t.correct/t.answered*100)+"%":"—"; }
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
  const payload={version:4,exportedAt:new Date().toISOString(),progress,settings,activity};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url; a.download=`vocab1935-progress-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProgress(file){
  try{
    const j=JSON.parse(await file.text()); if(!j||typeof j.progress!=="object") throw new Error();
    progress=j.progress; settings=Object.assign(settings,j.settings||{}); if(!["en-ja","ja-en","mixed"].includes(settings.mode)) settings.mode="mixed";
    settings.dailyQuota=clamp(parseInt(settings.dailyQuota)||100,1,2000); activity=(j.activity&&typeof j.activity==="object")?j.activity:{};
    persist(); refreshHome(); toast("進捗を読み込みました");
  }catch{ toast("読み込みに失敗しました"); }
}
function resetProgress(){
  if(confirm("すべての学習記録をリセットしますか？")){
    progress={}; activity={}; localStorage.removeItem(KEY); localStorage.removeItem(ACTIVITY_KEY); persist(); refreshHome(); toast("リセットしました");
  }
}
function applyTheme(){ const dark=settings.theme==="dark"||(settings.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.dataset.theme=dark?"dark":"light"; const meta=$("#themeColorMeta"); if(meta) meta.setAttribute("content",dark?"#080d16":"#f4f5f7"); }
function siteRootURL(){
  // Use the exact root used to install the PWA. A trailing slash is important
  // when Scriptable later opens it via the iOS webapp:// scheme.
  return new URL("./", location.href).href;
}
function widgetPayload(){
  const m=missionData(), t=todayStats(), today=localDateKey();
  return {
    version:1, date:today, hits:t.hits, quota:settings.dailyQuota,
    answered:t.answered, correct:t.correct, remaining:m.remaining,
    total:m.total, overallHits:m.hits, clearedUnits:m.clearedUnits,
    clearedWords:m.clearedWords, streak:streakCount(), mode:settings.mode,
    targetDate:settings.targetDate||"", accent:getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    siteUrl:siteRootURL(), updatedAt:new Date().toISOString(),
    week:Array.from({length:7},(_,i)=>{ const day=shiftDateKey(today,i-6); return {date:day,hits:activity[day]?.missionHits||0}; })
  };
}
function syncWidget(){
  try{
    persist();
    const payload=widgetPayload();
    const url="scriptable:///run/Vocab1935Widget?payload="+encodeURIComponent(JSON.stringify(payload));
    toast("Scriptableに進捗を送ります");
    setTimeout(()=>{ location.href=url; },140);
  }catch(e){ console.error(e); toast("同期用データを作成できませんでした"); }
}
function cycleTheme(){ settings.theme=settings.theme==="system"?"light":settings.theme==="light"?"dark":"system"; persist(); applyTheme(); toast(`表示: ${settings.theme==="system"?"端末設定":settings.theme==="light"?"ライト":"ダーク"}`); }

buildUnits();
for(const u of UNITS) ensureSenseRecord(u);
persist();
setRandomAccent(false);
applyTheme();
refreshHome();

$("#targetDate").onchange=savePlan; $("#dailyQuota").onchange=savePlan; $("#autoQuotaBtn").onclick=autoQuota;
$("#startMissionBtn").onclick=()=>startMission(false); $("#missionSpeakBtn").onclick=()=>speak(currentUnit?.w.word||"");
$("#missionStarBtn").onclick=()=>{ if(currentUnit) $("#missionStarBtn").textContent=toggleStar(currentUnit.w.id)?"★":"☆"; };
$("#nextMissionBtn").onclick=()=>{ if(!$("#nextMissionBtn").disabled) nextMission(); };
$("#continueMissionBtn").onclick=()=>startMission(true);
$("#searchInput").oninput=renderSearch; $("#exportBtn").onclick=exportProgress; $("#importInput").onchange=e=>{if(e.target.files[0]) importProgress(e.target.files[0]);}; $("#resetBtn").onclick=resetProgress;
$("#syncWidgetBtn").onclick=syncWidget;
$("#completeWidgetBtn").onclick=syncWidget;
$("#autoStartOnOpen").onchange=e=>{
  settings.autoStartOnOpen=e.target.checked; persist();
  toast(settings.autoStartOnOpen?"次回起動から学習を自動開始":"自動開始をオフにしました");
};
$("#themeBtn").onclick=cycleTheme; $("#accentBtn").onclick=()=>{ setRandomAccent(true); toast("差し色を変えました"); };
$$("#modeSegment button").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
$$(".bottom-nav button").forEach(b=>b.onclick=()=>go(b.dataset.view));
scheduleViewportSync();
window.addEventListener("resize",scheduleViewportSync,{passive:true});
window.addEventListener("orientationchange",scheduleViewportSync,{passive:true});
window.addEventListener("pageshow",scheduleViewportSync,{passive:true});
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden){
    scheduleViewportSync();
    // Also used when the widget focuses an already-running PWA.
    if(settings.autoStartOnOpen && !$("#missionView").classList.contains("active") &&
       $("#homeView").classList.contains("active") && missionData().remaining>0){
      setTimeout(()=>{ if(!document.hidden && $("#homeView").classList.contains("active")) startMission(false); },240);
    }
  }
});
if(window.visualViewport && !IS_STANDALONE){
  window.visualViewport.addEventListener("resize",scheduleViewportSync,{passive:true});
  window.visualViewport.addEventListener("scroll",scheduleViewportSync,{passive:true});
}
// ?study=1 is useful on platforms that support deep links into installed PWAs.
// On iOS the webapp:// handler may reopen the PWA at its original URL; the
// optional autoStartOnOpen setting above covers that path.
if((settings.autoStartOnOpen || new URLSearchParams(location.search).has("study")) && missionData().remaining>0){
  setTimeout(()=>{ if(!document.hidden && $("#homeView").classList.contains("active")) startMission(false); },330);
}
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
