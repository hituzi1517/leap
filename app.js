
const WORDS = window.WORDS || [];
const KEY = "vocab1935-progress-v1";
const SETTINGS_KEY = "vocab1935-settings-v1";
const DAY = 86400000;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let progress = loadJSON(KEY, {});
let settings = Object.assign({
  start: 1, end: 100, filter: "all", size: 20, shuffle: true,
  quizMode: "en-ja", theme: "system"
}, loadJSON(SETTINGS_KEY, {}));

let studyDeck = [], studyPos = 0, studyRevealed = false;
let quizDeck = [], quizPos = 0, quizAnswered = false;

function loadJSON(k, fallback){
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(progress));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  refreshHome();
}
function state(id){
  if(!progress[id]) progress[id] = {level:0, correct:0, wrong:0, seen:0, due:0, status:"new", starred:false};
  return progress[id];
}
function now(){ return Date.now(); }
function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),1500);
}
function speak(text){
  if(!("speechSynthesis" in window)) return toast("このブラウザでは読み上げを利用できません");
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=.88;
  speechSynthesis.speak(u);
}
function cleanMeaning(s){ return s; }

function setupPresets(){
  const sel=$("#rangePreset");
  const opts=[];
  for(let s=1;s<=1901;s+=100){
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
  readRange();
  const t=now();
  return WORDS.filter(w=>{
    if(w.id<settings.start||w.id>settings.end) return false;
    const s=progress[w.id];
    if(settings.filter==="all") return true;
    if(settings.filter==="new") return !s || !s.seen;
    if(settings.filter==="due") return !!s && s.seen>0 && (s.due||0)<=t;
    if(settings.filter==="weak") return !!s && (s.status==="weak" || s.wrong>s.correct);
    if(settings.filter==="starred") return !!s && s.starred;
    return true;
  });
}
function makeDeck(){
  let a=eligibleWords();
  if(settings.shuffle) a=shuffle(a);
  return a.slice(0,settings.size);
}
function go(view){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  window.scrollTo({top:0,behavior:"instant"});
  if(view==="search"){ $("#searchInput").focus(); renderSearch(); }
  if(view==="stats") renderStats();
}
function refreshHome(){
  const entries=Object.values(progress);
  const mastered=entries.filter(s=>s.status==="mastered").length;
  const weak=entries.filter(s=>s.status==="weak").length;
  const starred=entries.filter(s=>s.starred).length;
  const due=entries.filter(s=>s.seen>0 && (s.due||0)<=now() && s.status!=="mastered").length;
  const pct=Math.round(mastered/WORDS.length*100);
  $("#masteredCount").textContent=mastered; $("#totalCount").textContent=WORDS.length;
  $("#weakCount").textContent=weak; $("#starCount").textContent=starred; $("#dueCount").textContent=due;
  $("#progressPct").textContent=pct; $("#ringPct").textContent=pct+"%";
  $("#progressRing").style.setProperty("--p",(pct*3.6)+"deg");
}
function rateWord(id, rating){
  const s=state(id); s.seen++; s.last=now();
  if(rating==="again"){
    s.wrong++; s.level=Math.max(0,s.level-1); s.status="weak"; s.due=now()+10*60*1000;
  } else if(rating==="hard"){
    s.correct++; s.level=Math.max(1,s.level); s.status="learning"; s.due=now()+DAY;
  } else {
    s.correct++; s.level=Math.min(6,(s.level||0)+1);
    const intervals=[1,3,7,14,30,60,120];
    s.due=now()+intervals[s.level]*DAY;
    s.status=s.level>=4?"mastered":"learning";
  }
  save();
}
function recordQuiz(id, correct){
  const s=state(id); s.seen++; s.last=now();
  if(correct){
    s.correct++; s.level=Math.min(6,(s.level||0)+1);
    const intervals=[1,3,7,14,30,60,120];
    s.due=now()+intervals[s.level]*DAY; s.status=s.level>=4?"mastered":"learning";
  } else {
    s.wrong++; s.level=Math.max(0,(s.level||0)-1); s.due=now()+10*60*1000; s.status="weak";
  }
  save();
}
function toggleStar(id){
  const s=state(id); s.starred=!s.starred; save(); return s.starred;
}

// Study
function startStudy(){
  studyDeck=makeDeck(); studyPos=0;
  if(!studyDeck.length){ toast("この条件に該当する単語がありません"); return; }
  go("study"); renderStudy();
}
function renderStudy(){
  if(studyPos>=studyDeck.length){ toast("学習完了！"); go("home"); return; }
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

// Quiz
function startQuiz(){
  quizDeck=makeDeck(); quizPos=0;
  if(!quizDeck.length){ toast("この条件に該当する単語がありません"); return; }
  go("quiz"); renderQuiz();
}
function renderQuiz(){
  if(quizPos>=quizDeck.length){ toast("テスト完了！"); go("stats"); return; }
  quizAnswered=false;
  const w=quizDeck[quizPos], s=state(w.id);
  $("#quizIndex").textContent=quizPos+1; $("#quizTotal").textContent=quizDeck.length;
  $("#quizBar").style.width=((quizPos)/quizDeck.length*100)+"%";
  $("#quizWordNo").textContent=`No. ${w.id}`;
  $("#quizStarBtn").textContent=s.starred?"★":"☆";
  $("#quizFeedback").className="feedback hidden"; $("#nextQuizBtn").classList.add("hidden");
  $("#choiceArea").innerHTML=""; $("#spellInput").value="";
  const mode=settings.quizMode;
  $("#quizSpeakBtn").classList.toggle("hidden",mode!=="en-ja");
  $("#choiceArea").classList.toggle("hidden",mode==="spell");
  $("#spellArea").classList.toggle("hidden",mode!=="spell");
  if(mode==="en-ja"){
    $("#quizPrompt").textContent=w.word;
    renderChoices(w, true);
  }else if(mode==="ja-en"){
    $("#quizPrompt").textContent=w.meaning;
    renderChoices(w, false);
  }else{
    $("#quizPrompt").textContent=w.meaning;
    setTimeout(()=>$("#spellInput").focus(),50);
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
  [...$("#choiceArea").children].forEach(b=>{
    if(Number(b.dataset.id)===w.id) b.classList.add("correct");
  });
  if(!correct) btn.classList.add("wrong");
  showFeedback(correct,w);
  recordQuiz(w.id,correct);
}
function submitSpell(){
  if(quizAnswered) return;
  const w=quizDeck[quizPos]; const ans=$("#spellInput").value.trim().toLowerCase().replace(/\s+/g," ");
  if(!ans) return;
  const correct=ans===w.word.toLowerCase().replace(/\s+/g," ");
  quizAnswered=true; showFeedback(correct,w); recordQuiz(w.id,correct);
}
function showFeedback(correct,w){
  const f=$("#quizFeedback");
  f.className="feedback "+(correct?"good-f":"bad-f");
  f.innerHTML=correct?`✓ 正解<br><b>${escapeHTML(w.word)}</b>`:`✕ 正解は <b>${escapeHTML(w.word)}</b><br>${escapeHTML(w.meaning)}`;
  $("#nextQuizBtn").classList.remove("hidden");
}
function nextQuiz(){ quizPos++; renderQuiz(); }

// Search & stats
function renderSearch(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const list=(q?WORDS.filter(w=>w.word.toLowerCase().includes(q)||w.meaning.toLowerCase().includes(q)):WORDS.slice(0,60)).slice(0,120);
  $("#searchResults").innerHTML=list.map(w=>{
    const s=progress[w.id]||{};
    return `<div class="word-item"><div><div class="meta">No. ${w.id}${s.status?` · ${statusJP(s.status)}`:""}</div><h4>${escapeHTML(w.word)}</h4><p>${escapeHTML(w.meaning)}</p></div><button class="mini-star" data-star="${w.id}">${s.starred?"★":"☆"}</button></div>`;
  }).join("");
  $$("[data-star]").forEach(b=>b.onclick=()=>{const on=toggleStar(Number(b.dataset.star));b.textContent=on?"★":"☆";});
}
function statusJP(s){return {new:"未学習",learning:"学習中",weak:"苦手",mastered:"習得"}[s]||s}
function renderStats(){
  const entries=Object.values(progress);
  $("#statsSeen").textContent=entries.filter(s=>s.seen>0).length;
  $("#statsCorrect").textContent=entries.reduce((a,s)=>a+(s.correct||0),0);
  $("#statsWrong").textContent=entries.reduce((a,s)=>a+(s.wrong||0),0);
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
function escapeHTML(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }

// Export/import
function exportProgress(){
  const payload={version:1,exportedAt:new Date().toISOString(),progress,settings};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`vocab1935-progress-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProgress(file){
  try{
    const j=JSON.parse(await file.text());
    if(!j || typeof j.progress!=="object") throw new Error();
    progress=j.progress; settings=Object.assign(settings,j.settings||{}); save(); applySettingsToUI(); toast("進捗を読み込みました");
  }catch{toast("読み込みに失敗しました")}
}
function resetProgress(){
  if(confirm("すべての学習記録をリセットしますか？")){
    progress={}; localStorage.removeItem(KEY); save(); toast("リセットしました");
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

// Events
$("#applyPresetBtn").onclick=()=>{const [a,b]=$("#rangePreset").value.split("-").map(Number);$("#rangeStart").value=a;$("#rangeEnd").value=b;readRange();toast(`${a}–${b} に設定しました`)};
$("#rangeStart").onchange=readRange; $("#rangeEnd").onchange=readRange; $("#sessionSize").onchange=readRange; $("#shuffleToggle").onchange=readRange;
$$("#deckFilter button").forEach(b=>b.onclick=()=>{settings.filter=b.dataset.filter;$$("#deckFilter button").forEach(x=>x.classList.toggle("active",x===b));save();});
$("#startStudyBtn").onclick=startStudy; $("#startQuizBtn").onclick=startQuiz;
$("#flashcard").onclick=revealStudy; $("#flashcard").onkeydown=e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();revealStudy();}};
$$("[data-rating]").forEach(b=>b.onclick=()=>finishRating(b.dataset.rating));
$("#studySpeakBtn").onclick=e=>{e.stopPropagation();speak(studyDeck[studyPos]?.word||"")};
$("#studyStarBtn").onclick=()=>{const w=studyDeck[studyPos];if(w)$("#studyStarBtn").textContent=toggleStar(w.id)?"★":"☆"};
$$(".quiz-mode button").forEach(b=>b.onclick=()=>{settings.quizMode=b.dataset.mode;$$(".quiz-mode button").forEach(x=>x.classList.toggle("active",x===b));save();renderQuiz();});
$("#quizSpeakBtn").onclick=()=>speak(quizDeck[quizPos]?.word||"");
$("#quizStarBtn").onclick=()=>{const w=quizDeck[quizPos];if(w)$("#quizStarBtn").textContent=toggleStar(w.id)?"★":"☆"};
$("#spellSubmit").onclick=submitSpell; $("#spellInput").onkeydown=e=>{if(e.key==="Enter") quizAnswered?nextQuiz():submitSpell();};
$("#nextQuizBtn").onclick=nextQuiz;
$("#searchInput").oninput=renderSearch;
$("#exportBtn").onclick=exportProgress; $("#importInput").onchange=e=>{if(e.target.files[0])importProgress(e.target.files[0]);}; $("#resetBtn").onclick=resetProgress;
$("#themeBtn").onclick=cycleTheme;
$$(".bottom-nav button").forEach(b=>b.onclick=()=>{const v=b.dataset.view;if(v==="study")startStudy();else if(v==="quiz")startQuiz();else go(v);});
$$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));

setupPresets(); applySettingsToUI(); refreshHome();
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
