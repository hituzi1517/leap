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
let settings = Object.assign({
  start: 1, end: 100, filter: "all", size: 20, shuffle: true,
  quizMode: "en-ja", theme: "system", targetDate: "", dailyQuota: 30
}, loadJSON(SETTINGS_KEY, {}));

let studyDeck = [], studyPos = 0, studyRevealed = false, studySessionType = "normal";
let quizDeck = [], quizPos = 0, quizAnswered = false;
let challengeCurrent = null, challengeAnswered = false, challengeRecent = [], challengeSessionCleared = new Set();
const senseCache = new Map();

function loadJSON(k, fallback){
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}
function persist(){
  localStorage.setItem(KEY, JSON.stringify(progress));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}
function save(){ persist(); refreshHome(); }
function state(id){
  if(!progress[id]) progress[id] = {level:0, correct:0, wrong:0, seen:0, due:0, status:"new", starred:false, tripleHits:0, senses:{}};
  if(progress[id].tripleHits == null) progress[id].tripleHits = 0;
  if(!progress[id].senses) progress[id].senses = {};
  return progress[id];
}
function now(){ return Date.now(); }
function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),1800);
}
function speak(text){
  if(!("speechSynthesis" in window)) return toast("このブラウザでは読み上げを利用できません");
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=.88;
  speechSynthesis.speak(u);
}
function cleanMeaning(s){ return s; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function statusJP(s){return {new:"未学習",learning:"学習中",weak:"苦手",mastered:"習得"}[s]||s}

function localDateKey(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dateFromKey(key){
  const [y,m,d]=key.split("-").map(Number);
  return new Date(y,m-1,d);
}
function shiftDateKey(key, delta){
  const d=dateFromKey(key); d.setDate(d.getDate()+delta); return localDateKey(d);
}
function activityEntry(key=localDateKey()){
  if(!activity[key]) activity[key]={answered:0,correct:0,wrong:0,newIds:[]};
  if(!Array.isArray(activity[key].newIds)) activity[key].newIds=[];
  return activity[key];
}
function recordActivity(correct, newId=null){
  const a=activityEntry();
  a.answered=(a.answered||0)+1;
  if(correct===true) a.correct=(a.correct||0)+1;
  if(correct===false) a.wrong=(a.wrong||0)+1;
  if(newId && !a.newIds.includes(newId)) a.newIds.push(newId);
}
function todayNewCount(){ return activity[localDateKey()]?.newIds?.length || 0; }
function streakCount(){
  const today=localDateKey();
  let cursor=(activity[today]?.answered||0)>0 ? today : shiftDateKey(today,-1);
  let n=0;
  while((activity[cursor]?.answered||0)>0){ n++; cursor=shiftDateKey(cursor,-1); }
  return n;
}

// Meaning parser: keeps the source's numbered senses and the nearest part-of-speech tag.
function parseSenses(raw){
  const parts=String(raw).split(/(\[[^\]]+\]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g).filter(Boolean);
  let pos="", current=null, plain="";
  const out=[];
  for(const part of parts){
    if(/^\[[^\]]+\]$/.test(part)){
      pos=part;
      continue;
    }
    if(CIRCLED.includes(part) && part.length===1){
      if(current && current.text.trim()) out.push(current);
      current={no:part,pos,text:""};
      continue;
    }
    if(current) current.text+=part;
    else plain+=part;
  }
  if(current && current.text.trim()) out.push(current);
  if(!out.length){
    const stripped=plain.trim() || String(raw).replace(/^\[[^\]]+\]\s*/,"").trim();
    return [{key:"1",no:"",pos,text:stripped||String(raw)}];
  }
  return out.map((s,i)=>({key:s.no||String(i+1),no:s.no,pos:s.pos,text:s.text.trim()}));
}
function getSenses(w){
  if(!senseCache.has(w.id)) senseCache.set(w.id,parseSenses(w.meaning));
  return senseCache.get(w.id);
}
function formatSense(s){ return `${s.pos ? s.pos+" " : ""}${s.text}`.trim(); }
function isPolysemous(w){ return getSenses(w).length>1; }

function setupPresets(){
  const sel=$("#rangePreset");
  const opts=[];
  for(let s=1;s<=WORDS.length;s+=100){
    const e=Math.min(s+99,WORDS.length);
    opts.push(`<option value="${s}-${e}">${s}–${e}</option>`);
  }
  opts.push(`<option value="1-${WORDS.length}">全範囲 1–${WORDS.length}</option>`);
  sel.innerHTML=opts.join("");
  const current=[...sel.options].find(o=>o.value===`${settings.start}-${settings.end}`);
  if(current) sel.value=current.value;
}
function applySettingsToUI(){
  $("#rangeStart").value=settings.start;
  $("#rangeEnd").value=settings.end;
  $("#sessionSize").value=String(settings.size);
  $("#shuffleToggle").checked=!!settings.shuffle;
  $("#targetDate").value=settings.targetDate||"";
  $("#dailyQuota").value=String(settings.dailyQuota||30);
  $$("#deckFilter button").forEach(b=>b.classList.toggle("active",b.dataset.filter===settings.filter));
  $$(".quiz-mode button").forEach(b=>b.classList.toggle("active",b.dataset.mode===settings.quizMode));
  applyTheme();
}
function readRange(){
  const a=clamp(parseInt($("#rangeStart").value)||1,1,WORDS.length);
  const b=clamp(parseInt($("#rangeEnd").value)||WORDS.length,1,WORDS.length);
  settings.start=Math.min(a,b); settings.end=Math.max(a,b);
  settings.size=parseInt($("#sessionSize").value)||20;
  settings.shuffle=$("#shuffleToggle").checked;
  $("#rangeStart").value=settings.start; $("#rangeEnd").value=settings.end;
  save();
}
function eligibleWords(){
  const t=now();
  return WORDS.filter(w=>{
    if(w.id<settings.start||w.id>settings.end) return false;
    const s=progress[w.id];
    if(settings.filter==="all") return true;
    if(settings.filter==="new") return !s || !s.seen;
    if(settings.filter==="due") return !!s && s.seen>0 && (s.due||0)<=t;
    if(settings.filter==="weak") return !!s && (s.status==="weak" || (s.wrong||0)>(s.correct||0));
    if(settings.filter==="starred") return !!s && s.starred;
    return true;
  });
}
function makeDeck(limit=settings.size){
  let a=eligibleWords();
  if(settings.shuffle) a=shuffle(a);
  return a.slice(0,limit);
}
function makeQuizDeck(){
  let base=eligibleWords();
  if(settings.quizMode==="multi" || settings.quizMode==="sense") base=base.filter(isPolysemous);
  if(settings.quizMode==="sense"){
    let items=[];
    for(const w of base){
      getSenses(w).forEach((sense,index)=>items.push({w,sense,senseIndex:index,retry:0}));
    }
    if(settings.shuffle) items=shuffle(items);
    return items.slice(0,settings.size);
  }
  if(settings.shuffle) base=shuffle(base);
  return base.slice(0,settings.size).map(w=>({w,retry:0}));
}
function go(view){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  window.scrollTo({top:0,behavior:"instant"});
  if(view==="search"){ $("#searchInput").focus(); renderSearch(); }
  if(view==="stats") renderStats();
  if(view==="home") refreshHome();
}

function planningData(){
  const unseen=WORDS.filter(w=>!progress[w.id]?.seen).length;
  let days=null, needed=null;
  if(settings.targetDate){
    const target=dateFromKey(settings.targetDate), today=dateFromKey(localDateKey());
    const diff=Math.floor((target-today)/DAY);
    days=diff>=0?diff+1:0;
    needed=days>0?Math.ceil(unseen/days):null;
  }
  return {unseen,days,needed};
}
function tripleData(){
  let hits=0,cleared=0;
  for(const w of WORDS){
    const h=Math.min(3,progress[w.id]?.tripleHits||0);
    hits+=h; if(h>=3) cleared++;
  }
  const total=WORDS.length*3;
  return {hits,cleared,total,remaining:total-hits,pct:Math.round(cleared/WORDS.length*100)};
}
function refreshHome(){
  const entries=Object.values(progress).filter(v=>v&&typeof v==="object");
  const mastered=entries.filter(s=>s.status==="mastered").length;
  const weak=entries.filter(s=>s.status==="weak").length;
  const starred=entries.filter(s=>s.starred).length;
  const due=entries.filter(s=>s.seen>0 && (s.due||0)<=now() && s.status!=="mastered").length;
  const pct=Math.round(mastered/WORDS.length*100);
  $("#masteredCount").textContent=mastered; $("#totalCount").textContent=WORDS.length;
  $("#weakCount").textContent=weak; $("#starCount").textContent=starred; $("#dueCount").textContent=due;
  $("#streakCount").textContent=streakCount();
  $("#progressPct").textContent=pct; $("#ringPct").textContent=pct+"%";
  $("#progressRing").style.setProperty("--p",(pct*3.6)+"deg");

  const plan=planningData(), quota=clamp(parseInt(settings.dailyQuota)||30,1,500), todayNew=todayNewCount();
  $("#unseenCount").textContent=plan.unseen;
  $("#daysLeft").textContent=plan.days==null?"—":plan.days;
  $("#neededPerDay").textContent=plan.needed==null?"—":plan.needed;
  $("#todayNewCount").textContent=todayNew; $("#todayQuotaText").textContent=quota;
  $("#dailyGoalBar").style.width=Math.min(100,todayNew/quota*100)+"%";
  const pace=$("#paceStatus");
  if(!settings.targetDate){ pace.textContent="未設定"; pace.className="status-pill"; $("#planHint").textContent="目標日を設定すると、残り語数から1日あたりの必要数を計算します。"; }
  else if(plan.days===0){ pace.textContent="期限超過"; pace.className="status-pill bad"; $("#planHint").textContent="目標日を過ぎています。新しい目標日を設定してください。"; }
  else if(plan.unseen===0){ pace.textContent="新規完了"; pace.className="status-pill good"; $("#planHint").textContent="全単語に一度触れています。以後は復習と3回クリアで定着を上げられます。"; }
  else if(quota>=plan.needed){ pace.textContent="ペースOK"; pace.className="status-pill good"; $("#planHint").textContent=`今のノルマなら目標ペース以上です。推奨は1日 ${plan.needed} 語です。`; }
  else { pace.textContent=`+${plan.needed-quota}/日`; pace.className="status-pill warn"; $("#planHint").textContent=`目標日に間に合わせるには、現在より1日 ${plan.needed-quota} 語増やす計算です。`; }

  const tri=tripleData();
  $("#triplePct").textContent=tri.pct+"%";
  $("#tripleBar").style.width=tri.pct+"%";
  $("#tripleCleared").textContent=tri.cleared;
  $("#tripleRemainingHits").textContent=tri.remaining;
}

function updateLearningState(s, correct){
  if(correct){
    s.correct=(s.correct||0)+1; s.level=Math.min(6,(s.level||0)+1);
    const intervals=[1,3,7,14,30,60,120];
    s.due=now()+intervals[s.level]*DAY; s.status=s.level>=4?"mastered":"learning";
  }else{
    s.wrong=(s.wrong||0)+1; s.level=Math.max(0,(s.level||0)-1); s.due=now()+10*60*1000; s.status="weak";
  }
}
function rateWord(id, rating){
  const s=state(id), wasNew=!s.seen; s.seen=(s.seen||0)+1; s.last=now();
  if(rating==="again"){
    s.wrong=(s.wrong||0)+1; s.level=Math.max(0,(s.level||0)-1); s.status="weak"; s.due=now()+10*60*1000;
    recordActivity(false,wasNew?id:null);
  } else if(rating==="hard"){
    s.correct=(s.correct||0)+1; s.level=Math.max(1,s.level||0); s.status="learning"; s.due=now()+DAY;
    recordActivity(true,wasNew?id:null);
  } else {
    s.correct=(s.correct||0)+1; s.level=Math.min(6,(s.level||0)+1);
    const intervals=[1,3,7,14,30,60,120];
    s.due=now()+intervals[s.level]*DAY;
    s.status=s.level>=4?"mastered":"learning";
    recordActivity(true,wasNew?id:null);
  }
  save();
}
function recordQuiz(id, correct){
  const s=state(id), wasNew=!s.seen; s.seen=(s.seen||0)+1; s.last=now();
  updateLearningState(s,correct); recordActivity(correct,wasNew?id:null); save();
}
function recordSenseQuiz(item, correct){
  const s=state(item.w.id), wasNew=!s.seen; s.seen=(s.seen||0)+1; s.last=now();
  const key=item.sense.key||String(item.senseIndex+1);
  if(!s.senses[key]) s.senses[key]={correct:0,wrong:0};
  if(correct) s.senses[key].correct++; else s.senses[key].wrong++;
  updateLearningState(s,correct); recordActivity(correct,wasNew?item.w.id:null); save();
}
function recordChallenge(w, correct){
  const s=state(w.id), wasNew=!s.seen; s.seen=(s.seen||0)+1; s.last=now();
  updateLearningState(s,correct);
  if(correct) s.tripleHits=Math.min(3,(s.tripleHits||0)+1);
  recordActivity(correct,wasNew?w.id:null); save();
  return s.tripleHits||0;
}
function toggleStar(id){
  const s=state(id); s.starred=!s.starred; save(); return s.starred;
}

// Study cards
function startStudy(){
  studySessionType="normal"; studyDeck=makeDeck(); studyPos=0;
  if(!studyDeck.length){ toast("この条件に該当する単語がありません"); return; }
  $("#studySessionBanner").classList.add("hidden");
  go("study"); renderStudy();
}
function startToday(){
  const quota=clamp(parseInt(settings.dailyQuota)||30,1,500);
  const need=Math.max(0,quota-todayNewCount());
  const due=shuffle(WORDS.filter(w=>{const s=progress[w.id];return s?.seen>0&&(s.due||0)<=now()&&s.status!=="mastered";}));
  const unseen=shuffle(WORDS.filter(w=>!progress[w.id]?.seen));
  const reviewCap=Math.max(10,Math.min(30,settings.size||20));
  const review=due.slice(0,reviewCap), fresh=unseen.slice(0,need);
  studyDeck=[...review,...fresh];
  if(settings.shuffle) studyDeck=shuffle(studyDeck);
  if(!studyDeck.length){ toast("今日の新規ノルマは達成済みです。復習対象もありません"); return; }
  studySessionType="today"; studyPos=0;
  const banner=$("#studySessionBanner"); banner.textContent=`今日のプラン：新規 ${fresh.length} 語 + 復習 ${review.length} 語`; banner.classList.remove("hidden");
  go("study"); renderStudy();
}
function renderStudy(){
  if(studyPos>=studyDeck.length){ toast(studySessionType==="today"?"今日のプラン完了！":"学習完了！"); go("home"); return; }
  const w=studyDeck[studyPos], s=state(w.id); studyRevealed=false;
  $("#studyIndex").textContent=studyPos+1; $("#studyTotal").textContent=studyDeck.length;
  $("#studyBar").style.width=((studyPos)/studyDeck.length*100)+"%";
  $("#studyWordNo").textContent=`No. ${w.id}`; $("#studyFront").textContent=w.word; $("#studyBack").textContent=cleanMeaning(w.meaning);
  $("#studyBack").classList.add("hidden"); $("#tapHint").classList.remove("hidden"); $("#ratingButtons").classList.add("hidden");
  $("#studyStarBtn").textContent=s.starred?"★":"☆";
}
function revealStudy(){
  if(studyRevealed) return;
  studyRevealed=true; $("#studyBack").classList.remove("hidden"); $("#tapHint").classList.add("hidden"); $("#ratingButtons").classList.remove("hidden");
}
function finishRating(r){
  const w=studyDeck[studyPos]; rateWord(w.id,r); studyPos++; renderStudy();
}

// Standard quiz
function startQuiz(){
  quizDeck=makeQuizDeck(); quizPos=0;
  if(!quizDeck.length){
    toast((settings.quizMode==="multi"||settings.quizMode==="sense")?"この範囲に番号付きの多義語がありません":"この条件に該当する単語がありません");
    return;
  }
  go("quiz"); renderQuiz();
}
function currentQuizItem(){ return quizDeck[quizPos]; }
function renderQuiz(){
  if(quizPos>=quizDeck.length){ toast("テスト完了！"); go("stats"); return; }
  quizAnswered=false;
  const item=currentQuizItem(), w=item.w, s=state(w.id), mode=settings.quizMode;
  $("#quizIndex").textContent=quizPos+1; $("#quizTotal").textContent=quizDeck.length;
  $("#quizBar").style.width=((quizPos)/quizDeck.length*100)+"%";
  $("#quizWordNo").textContent=`No. ${w.id}`;
  $("#quizStarBtn").textContent=s.starred?"★":"☆";
  $("#quizFeedback").className="feedback hidden"; $("#nextQuizBtn").classList.add("hidden"); $("#multiSubmitBtn").classList.add("hidden");
  $("#quizKicker").classList.add("hidden"); $("#choiceArea").innerHTML=""; $("#spellInput").value="";
  $("#quizSpeakBtn").classList.toggle("hidden",mode==="ja-en"||mode==="spell");
  $("#choiceArea").classList.toggle("hidden",mode==="spell");
  $("#spellArea").classList.toggle("hidden",mode!=="spell");

  if(mode==="en-ja"){
    $("#quizPrompt").textContent=w.word; renderChoices(w,true);
  }else if(mode==="ja-en"){
    $("#quizPrompt").textContent=w.meaning; renderChoices(w,false);
  }else if(mode==="spell"){
    $("#quizPrompt").textContent=w.meaning; setTimeout(()=>$("#spellInput").focus(),50);
  }else if(mode==="multi"){
    $("#quizKicker").textContent="当てはまる意味をすべて選択"; $("#quizKicker").classList.remove("hidden");
    $("#quizPrompt").textContent=w.word; renderMultiChoices(w); $("#multiSubmitBtn").classList.remove("hidden");
  }else if(mode==="sense"){
    $("#quizKicker").textContent=`${item.sense.pos||"語義"} · 意味${item.sense.no||item.senseIndex+1}`; $("#quizKicker").classList.remove("hidden");
    $("#quizPrompt").textContent=w.word; renderSenseChoices(item);
  }
}
function distractors(target){
  let pool=WORDS.filter(w=>w.id>=settings.start&&w.id<=settings.end&&w.id!==target.id);
  if(pool.length<3) pool=WORDS.filter(w=>w.id!==target.id);
  return shuffle(pool).slice(0,3);
}
function renderChoices(w, answerIsMeaning){
  const choices=shuffle([w,...distractors(w)]);
  choices.forEach(x=>{
    const b=document.createElement("button"); b.className="choice";
    b.textContent=answerIsMeaning?x.meaning:x.word;
    b.dataset.id=x.id;
    b.addEventListener("click",()=>answerChoice(b,Number(b.dataset.id)===w.id,w));
    $("#choiceArea").appendChild(b);
  });
}
function answerChoice(btn, correct, w){
  if(quizAnswered) return; quizAnswered=true;
  [...$("#choiceArea").children].forEach(b=>{ if(Number(b.dataset.id)===w.id) b.classList.add("correct"); });
  if(!correct) btn.classList.add("wrong");
  showFeedback(correct,w); recordQuiz(w.id,correct);
  if(!correct) scheduleRetry(currentQuizItem());
}
function submitSpell(){
  if(quizAnswered) return;
  const item=currentQuizItem(), w=item.w, ans=$("#spellInput").value.trim().toLowerCase().replace(/\s+/g," ");
  if(!ans) return;
  const correct=ans===w.word.toLowerCase().replace(/\s+/g," ");
  quizAnswered=true; showFeedback(correct,w); recordQuiz(w.id,correct);
  if(!correct) scheduleRetry(item);
}
function renderMultiChoices(w){
  const correct=getSenses(w).map(s=>({text:formatSense(s),correct:true}));
  const needed=Math.max(2,Math.min(4,8-correct.length));
  const others=shuffle(WORDS.filter(x=>x.id!==w.id));
  const wrong=[];
  for(const ow of others){
    for(const s of getSenses(ow)){
      const text=formatSense(s);
      if(!correct.some(x=>x.text===text)&&!wrong.some(x=>x.text===text)) wrong.push({text,correct:false});
      if(wrong.length>=needed) break;
    }
    if(wrong.length>=needed) break;
  }
  shuffle([...correct,...wrong]).forEach((opt,i)=>{
    const b=document.createElement("button"); b.className="choice multi-choice"; b.textContent=opt.text; b.dataset.correct=opt.correct?"1":"0"; b.dataset.opt=i;
    b.onclick=()=>{ if(!quizAnswered) b.classList.toggle("selected"); };
    $("#choiceArea").appendChild(b);
  });
}
function answerMulti(){
  if(quizAnswered) return;
  const buttons=[...$("#choiceArea").children];
  const correct=buttons.every(b=>(b.dataset.correct==="1")===b.classList.contains("selected"));
  quizAnswered=true;
  buttons.forEach(b=>{
    if(b.dataset.correct==="1") b.classList.add("correct");
    else if(b.classList.contains("selected")) b.classList.add("wrong");
    b.disabled=true;
  });
  $("#multiSubmitBtn").classList.add("hidden");
  const item=currentQuizItem(); showFeedback(correct,item.w,"意味をすべて選ぶ問題"); recordQuiz(item.w.id,correct);
  if(!correct) scheduleRetry(item);
}
function renderSenseChoices(item){
  const options=[{text:item.sense.text,correct:true}];
  // Other meanings of the same word are strong distractors and make the numbered sense meaningful.
  for(const s of getSenses(item.w)){
    if(s.key!==item.sense.key && !options.some(o=>o.text===s.text)) options.push({text:s.text,correct:false});
    if(options.length>=4) break;
  }
  if(options.length<4){
    const all=shuffle(WORDS.filter(w=>w.id!==item.w.id));
    outer: for(const w of all){
      for(const s of getSenses(w)){
        if(!options.some(o=>o.text===s.text)) options.push({text:s.text,correct:false});
        if(options.length>=4) break outer;
      }
    }
  }
  shuffle(options.slice(0,4)).forEach(opt=>{
    const b=document.createElement("button"); b.className="choice"; b.textContent=opt.text; b.dataset.correct=opt.correct?"1":"0";
    b.onclick=()=>answerSenseChoice(b,opt.correct,item);
    $("#choiceArea").appendChild(b);
  });
}
function answerSenseChoice(btn, correct, item){
  if(quizAnswered) return; quizAnswered=true;
  [...$("#choiceArea").children].forEach(b=>{ if(b.dataset.correct==="1") b.classList.add("correct"); });
  if(!correct) btn.classList.add("wrong");
  const label=`${item.sense.pos||""} 意味${item.sense.no||item.senseIndex+1}`.trim();
  showFeedback(correct,item.w,label,item.sense.text); recordSenseQuiz(item,correct);
  if(!correct) scheduleRetry(item);
}
function showFeedback(correct,w,label="",answerText=""){
  const f=$("#quizFeedback"); f.className="feedback "+(correct?"good-f":"bad-f");
  const detail=answerText||w.meaning;
  f.innerHTML=correct
    ? `✓ 正解${label?` <span class="feedback-note">${escapeHTML(label)}</span>`:""}<br><b>${escapeHTML(w.word)}</b>`
    : `✕ ${label?escapeHTML(label)+" の正解":"正解"}は<br><b>${escapeHTML(detail)}</b>`;
  $("#nextQuizBtn").classList.remove("hidden");
}
function scheduleRetry(item){
  if((item.retry||0)>=2) return;
  const retry=Object.assign({},item,{retry:(item.retry||0)+1});
  const at=Math.min(quizDeck.length,quizPos+4);
  quizDeck.splice(at,0,retry);
  $("#quizTotal").textContent=quizDeck.length;
}
function nextQuiz(){ quizPos++; renderQuiz(); }

// 3x random challenge
function startTripleChallenge(){
  const tri=tripleData();
  if(tri.cleared>=WORDS.length){ toast("全1935語が3回クリア済みです！"); return; }
  challengeSessionCleared=new Set(); challengeRecent=[]; challengeCurrent=null; challengeAnswered=false;
  go("challenge"); nextChallenge();
}
function chooseChallengeWord(){
  let pool=WORDS.filter(w=>(progress[w.id]?.tripleHits||0)<3 && !challengeRecent.includes(w.id));
  if(!pool.length) pool=WORDS.filter(w=>(progress[w.id]?.tripleHits||0)<3);
  return pool.length?sample(pool):null;
}
function nextChallenge(){
  challengeCurrent=chooseChallengeWord(); challengeAnswered=false;
  if(!challengeCurrent){ toast("3回クリア完了！"); go("stats"); return; }
  challengeRecent.push(challengeCurrent.id); if(challengeRecent.length>8) challengeRecent.shift();
  renderChallenge();
}
function renderChallenge(){
  const w=challengeCurrent, s=state(w.id), tri=tripleData();
  $("#challengeClearedNow").textContent=challengeSessionCleared.size;
  $("#challengeBar").style.width=(tri.cleared/WORDS.length*100)+"%";
  $("#challengeWordNo").textContent=`No. ${w.id}`; $("#challengePrompt").textContent=w.word;
  $("#challengeHit").textContent=`${Math.min(3,s.tripleHits||0)} / 3`;
  $("#challengeStarBtn").textContent=s.starred?"★":"☆";
  $("#challengeFeedback").className="feedback hidden"; $("#nextChallengeBtn").classList.add("hidden"); $("#challengeChoices").innerHTML="";
  const choices=shuffle([w,...challengeDistractors(w)]);
  choices.forEach(x=>{
    const b=document.createElement("button"); b.className="choice"; b.textContent=x.meaning; b.dataset.id=x.id;
    b.onclick=()=>answerChallengeChoice(b,Number(b.dataset.id)===w.id,w);
    $("#challengeChoices").appendChild(b);
  });
}
function challengeDistractors(target){
  return shuffle(WORDS.filter(w=>w.id!==target.id)).slice(0,3);
}
function answerChallengeChoice(btn,correct,w){
  if(challengeAnswered) return; challengeAnswered=true;
  [...$("#challengeChoices").children].forEach(b=>{if(Number(b.dataset.id)===w.id)b.classList.add("correct")});
  if(!correct) btn.classList.add("wrong");
  const before=progress[w.id]?.tripleHits||0, hits=recordChallenge(w,correct);
  if(correct && hits>=3 && before<3) challengeSessionCleared.add(w.id);
  $("#challengeHit").textContent=`${hits} / 3`;
  const f=$("#challengeFeedback"); f.className="feedback "+(correct?"good-f":"bad-f");
  if(correct) f.innerHTML=hits>=3?`✓ 正解 · <b>3 / 3 クリア！</b>`:`✓ 正解 · <b>${hits} / 3</b>`;
  else f.innerHTML=`✕ 正解は<br><b>${escapeHTML(w.meaning)}</b><br><span class="feedback-note">正解回数は減りません</span>`;
  $("#nextChallengeBtn").classList.remove("hidden");
  const tri=tripleData(); $("#challengeBar").style.width=(tri.cleared/WORDS.length*100)+"%"; $("#challengeClearedNow").textContent=challengeSessionCleared.size;
}

// Search & stats
function renderSearch(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const list=(q?WORDS.filter(w=>w.word.toLowerCase().includes(q)||w.meaning.toLowerCase().includes(q)):WORDS.slice(0,60)).slice(0,120);
  $("#searchResults").innerHTML=list.map(w=>{
    const s=progress[w.id]||{}, h=Math.min(3,s.tripleHits||0), poly=isPolysemous(w)?` · ${getSenses(w).length}義`:"";
    return `<div class="word-item"><div><div class="meta">No. ${w.id}${s.status?` · ${statusJP(s.status)}`:""} · 3× ${h}/3${poly}</div><h4>${escapeHTML(w.word)}</h4><p>${escapeHTML(w.meaning)}</p></div><button class="mini-star" data-star="${w.id}">${s.starred?"★":"☆"}</button></div>`;
  }).join("");
  $$('[data-star]').forEach(b=>b.onclick=()=>{const on=toggleStar(Number(b.dataset.star));b.textContent=on?"★":"☆";});
}
function renderWeekStrip(){
  const today=localDateKey(), labels=["日","月","火","水","木","金","土"], cells=[];
  for(let i=6;i>=0;i--){
    const key=shiftDateKey(today,-i), d=dateFromKey(key), a=activity[key]||{}, count=a.answered||0;
    cells.push(`<div class="week-day ${count?"active":""}"><span>${labels[d.getDay()]}</span><b>${d.getDate()}</b><small>${count||"—"}</small></div>`);
  }
  $("#weekStrip").innerHTML=cells.join("");
}
function renderStats(){
  const entries=Object.values(progress).filter(v=>v&&typeof v==="object");
  const correct=entries.reduce((a,s)=>a+(s.correct||0),0), wrong=entries.reduce((a,s)=>a+(s.wrong||0),0);
  $("#statsSeen").textContent=entries.filter(s=>s.seen>0).length;
  $("#statsCorrect").textContent=correct; $("#statsWrong").textContent=wrong;
  $("#statsStreak").textContent=streakCount(); $("#statsToday").textContent=activity[localDateKey()]?.answered||0;
  $("#statsAccuracy").textContent=(correct+wrong)?Math.round(correct/(correct+wrong)*100)+"%":"—";
  renderWeekStrip();

  let touched=0, perfect=0;
  for(const w of WORDS.filter(isPolysemous)){
    const senses=getSenses(w), rec=progress[w.id]?.senses||{};
    touched+=senses.filter(s=>((rec[s.key]?.correct||0)+(rec[s.key]?.wrong||0))>0).length;
    if(senses.every(s=>(rec[s.key]?.correct||0)>0)) perfect++;
  }
  $("#senseTouched").textContent=touched; $("#sensePerfectWords").textContent=perfect;

  const chunks=[];
  for(let start=1;start<=WORDS.length;start+=100){
    const end=Math.min(start+99,WORDS.length), total=end-start+1;
    let mastered=0;
    for(let i=start;i<=end;i++) if(progress[i]?.status==="mastered") mastered++;
    const p=Math.round(mastered/total*100);
    chunks.push(`<div class="chunk"><span>${start}–${end}</span><div class="mini-bar"><i style="width:${p}%"></i></div><b>${p}%</b></div>`);
  }
  $("#chunkStats").innerHTML=chunks.join("");
}

// Export/import
function exportProgress(){
  const payload={version:2,exportedAt:new Date().toISOString(),progress,settings,activity};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`vocab1935-progress-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProgress(file){
  try{
    const j=JSON.parse(await file.text());
    if(!j || typeof j.progress!=="object") throw new Error();
    progress=j.progress; settings=Object.assign(settings,j.settings||{}); activity=(j.activity&&typeof j.activity==="object")?j.activity:{};
    save(); applySettingsToUI(); toast("進捗を読み込みました");
  }catch{toast("読み込みに失敗しました")}
}
function resetProgress(){
  if(confirm("すべての学習記録・3回クリア記録・連続学習記録をリセットしますか？")){
    progress={}; activity={}; localStorage.removeItem(KEY); localStorage.removeItem(ACTIVITY_KEY); save(); toast("リセットしました");
  }
}

// Theme
function applyTheme(){
  const dark=settings.theme==="dark" || (settings.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme=dark?"dark":"light";
}
function cycleTheme(){
  settings.theme=settings.theme==="system"?"light":settings.theme==="light"?"dark":"system";
  save(); applyTheme(); toast(`表示: ${settings.theme==="system"?"端末設定":settings.theme==="light"?"ライト":"ダーク"}`);
}
function savePlanInputs(){
  settings.targetDate=$("#targetDate").value||"";
  settings.dailyQuota=clamp(parseInt($("#dailyQuota").value)||30,1,500);
  $("#dailyQuota").value=settings.dailyQuota;
  save();
}
function autoQuota(){
  settings.targetDate=$("#targetDate").value||settings.targetDate||"";
  const plan=planningData();
  if(plan.needed==null){ toast(settings.targetDate?"目標日が過ぎています":"先に目標日を設定してください"); return; }
  settings.dailyQuota=Math.max(1,plan.needed); $("#dailyQuota").value=settings.dailyQuota; save(); toast(`1日 ${settings.dailyQuota} 語に設定しました`);
}

// Events
$("#applyPresetBtn").onclick=()=>{const [a,b]=$("#rangePreset").value.split("-").map(Number);$("#rangeStart").value=a;$("#rangeEnd").value=b;readRange();toast(`${a}–${b} に設定しました`)};
$("#rangeStart").onchange=readRange; $("#rangeEnd").onchange=readRange; $("#sessionSize").onchange=readRange; $("#shuffleToggle").onchange=readRange;
$$("#deckFilter button").forEach(b=>b.onclick=()=>{settings.filter=b.dataset.filter;$$("#deckFilter button").forEach(x=>x.classList.toggle("active",x===b));save();});
$("#targetDate").onchange=savePlanInputs; $("#dailyQuota").onchange=savePlanInputs; $("#autoQuotaBtn").onclick=autoQuota;
$("#startTodayBtn").onclick=startToday; $("#startTripleBtn").onclick=startTripleChallenge;
$("#startStudyBtn").onclick=startStudy; $("#startQuizBtn").onclick=startQuiz;
$("#flashcard").onclick=revealStudy; $("#flashcard").onkeydown=e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();revealStudy();}};
$$('[data-rating]').forEach(b=>b.onclick=()=>finishRating(b.dataset.rating));
$("#studySpeakBtn").onclick=e=>{e.stopPropagation();speak(studyDeck[studyPos]?.word||"")};
$("#studyStarBtn").onclick=()=>{const w=studyDeck[studyPos];if(w)$("#studyStarBtn").textContent=toggleStar(w.id)?"★":"☆"};
$$(".quiz-mode button").forEach(b=>b.onclick=()=>{
  settings.quizMode=b.dataset.mode; $$(".quiz-mode button").forEach(x=>x.classList.toggle("active",x===b)); save(); startQuiz();
});
$("#quizSpeakBtn").onclick=()=>speak(currentQuizItem()?.w?.word||"");
$("#quizStarBtn").onclick=()=>{const w=currentQuizItem()?.w;if(w)$("#quizStarBtn").textContent=toggleStar(w.id)?"★":"☆"};
$("#spellSubmit").onclick=submitSpell; $("#spellInput").onkeydown=e=>{if(e.key==="Enter") quizAnswered?nextQuiz():submitSpell();};
$("#multiSubmitBtn").onclick=answerMulti; $("#nextQuizBtn").onclick=nextQuiz;
$("#challengeSpeakBtn").onclick=()=>speak(challengeCurrent?.word||"");
$("#challengeStarBtn").onclick=()=>{if(challengeCurrent)$("#challengeStarBtn").textContent=toggleStar(challengeCurrent.id)?"★":"☆"};
$("#nextChallengeBtn").onclick=nextChallenge;
$("#searchInput").oninput=renderSearch;
$("#exportBtn").onclick=exportProgress; $("#importInput").onchange=e=>{if(e.target.files[0])importProgress(e.target.files[0]);}; $("#resetBtn").onclick=resetProgress;
$("#themeBtn").onclick=cycleTheme;
$$(".bottom-nav button").forEach(b=>b.onclick=()=>{const v=b.dataset.view;if(v==="study")startStudy();else if(v==="quiz")startQuiz();else go(v);});
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

setupPresets(); applySettingsToUI(); refreshHome();
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
