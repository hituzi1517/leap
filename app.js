(()=>{'use strict';
const WORDS=window.WORDS||[],SENSES=WORDS.flatMap(w=>w.senses.map(s=>({w,s,id:`${w.id}:${s.key}`}))),TOTAL=WORDS.length;
const K_MAIN='vocab1935-progress-v1',K_SETTINGS='vocab1935-settings-v1',K_ACTIVITY='vocab1935-activity-v2',K_POINTS='vocab1935-points-v1',K_POINT_DAYS='vocab1935-points-days-v1';
const $=id=>document.getElementById(id), $$=query=>Array.from(document.querySelectorAll(query));
const ACCENTS=[['#2563eb','37,99,235'],['#7c3aed','124,58,237'],['#db2777','219,39,119'],['#e11d48','225,29,72'],['#ea580c','234,88,12'],['#ca8a04','202,138,4'],['#059669','5,150,105'],['#0f766e','15,118,110'],['#0891b2','8,145,178'],['#4f46e5','79,70,229'],['#9333ea','147,51,234'],['#65a30d','101,163,13']];
const number=n=>Number(n||0).toLocaleString('ja-JP'),clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function load(k,def){try{return JSON.parse(localStorage.getItem(k))??def}catch{return def}}
let regular=load(K_MAIN,{}), settings={theme:'system',mode:'mixed',pointsMode:'en-ja',targetDate:'',dailyQuota:100,pointTargetDate:'',pointDailyQuota:30,autoStartOnOpen:false,...load(K_SETTINGS,{})},activity=load(K_ACTIVITY,{}),pointData=load(K_POINTS,{}),pointDays=load(K_POINT_DAYS,{});
if(!['en-ja','ja-en','mixed'].includes(settings.mode))settings.mode='mixed';
if(!['en-ja','ja-en','mixed'].includes(settings.pointsMode))settings.pointsMode='en-ja';
settings.dailyQuota=clamp(parseInt(settings.dailyQuota,10)||100,1,3000);
settings.pointDailyQuota=clamp(parseInt(settings.pointDailyQuota,10)||30,1,1000000);
function saveMain(){localStorage.setItem(K_MAIN,JSON.stringify(regular));localStorage.setItem(K_SETTINGS,JSON.stringify(settings));localStorage.setItem(K_ACTIVITY,JSON.stringify(activity))}
function savePoints(){localStorage.setItem(K_POINTS,JSON.stringify(pointData));localStorage.setItem(K_POINT_DAYS,JSON.stringify(pointDays))}
function saveAll(){saveMain();savePoints()}
function random(a){return a[Math.floor(Math.random()*a.length)]}
function shuffled(a){a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function todayKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function shifted(k,n){const [y,m,d]=k.split('-').map(Number),date=new Date(y,m-1,d+n);return todayKey(date)}
function day(k=todayKey()){const a=activity[k]||(activity[k]={answered:0,correct:0,wrong:0,missionHits:0});if(!Number.isFinite(a.missionHits))a.missionHits=0;return a}
function pointRecord(w){if(!pointData[w.id])pointData[w.id]={unlocked:false,score:0,shown:0,answered:0,correct:0,wrong:0};let p=pointData[w.id];p.score=Math.min(1,Number(p.score)||0);return p}
function pointPassed(w){return pointRecord(w).score>=1}
function pointToday(key=todayKey()){
 const d=pointDays[key]||(pointDays[key]={net:0,answered:0,correct:0,wrong:0,unlocked:0});
 for(const k of ['net','answered','correct','wrong','unlocked'])if(!Number.isFinite(d[k]))d[k]=0;
 return d;
}
function statsPoints(){
 let pass=0,seen=0,neg=0,zero=0,score=0,minScore=0;
 for(const w of WORDS){const p=pointRecord(w);score+=p.score;if(p.score>=1)pass++;else if(p.score<0)neg++;else zero++;if(p.unlocked)seen++;minScore=Math.min(minScore,p.score)}
 return{pass,seen,remaining:TOTAL-pass,neg,zero,score,minScore,remainingScore:TOTAL-score,pct:Math.round(pass/TOTAL*100)};
}
function pointPlan(){
 const stats=statsPoints();let days=null,required=null;
 if(settings.pointTargetDate){const dt=new Date(settings.pointTargetDate+'T00:00:00');
 const today=new Date(todayKey()+'T00:00:00');if(!Number.isNaN(dt.getTime())){
 days=Math.max(0,Math.round((dt-today)/86400000)+1);
 if(days>0)required=Math.ceil(stats.remainingScore/days);
 }}
 return{days,required};
}
function fmtScore(n){return (n>0?'+':'')+number(n)}
function savePointPlan(){
 settings.pointTargetDate=$('pointGoalDate').value||'';
 settings.pointDailyQuota=clamp(Math.round(Number($('pointQuota').value)||30),1,1000000);
 saveMain();renderPoints();
}
function autoPointQuota(){
 const plan=pointPlan();if(plan.required==null){toast('先に今日以降の目標日を設定してください');return}
 settings.pointDailyQuota=clamp(Math.max(1,plan.required),1,1000000);
 saveMain();renderPoints();toast('必要ペースから1日のポイントノルマを設定しました');
}
function mainRecord(w){const s=regular[w.id]||(regular[w.id]={level:0,correct:0,wrong:0,seen:0,due:0,status:'new',starred:false,tripleHits:0,senses:{},senseHits:{}});if(!s.senses)s.senses={};if(!s.senseHits)s.senseHits={};return s}
function hit(u){const s=mainRecord(u.w);if(s.senseHits[u.s.key]==null){const v=u.w.senses.length===1?(s.tripleHits||0):(s.senses[u.s.key]?.correct||0);s.senseHits[u.s.key]=clamp(Number(v)||0,0,3)}return clamp(Number(s.senseHits[u.s.key])||0,0,3)}
function hitSet(u,val){mainRecord(u.w).senseHits[u.s.key]=clamp(val,0,3)}
function normalStats(){let hits=0,clearedSenses=0,clearedWords=0;for(const w of WORDS){let all=true;for(const s of w.senses){const h=hit({w,s});hits+=h;if(h===3)clearedSenses++;else all=false}if(all)clearedWords++}return{hits,total:SENSES.length*3,remaining:SENSES.length*3-hits,clearedSenses,clearedWords,pct:Math.round(hits/(SENSES.length*3)*100)}}
function streak(){let d=todayKey();if(!(day(d).answered>0))d=shifted(d,-1);let n=0;while(activity[d]&&activity[d].answered>0){n++;d=shifted(d,-1)}return n}
function setAccent(){let prev=localStorage.getItem('vocab1935-last-accent'),pool=ACCENTS.filter(x=>x[0]!==prev);let a=random(pool.length?pool:ACCENTS);document.documentElement.style.setProperty('--accent',a[0]);document.documentElement.style.setProperty('--accent-rgb',a[1]);localStorage.setItem('vocab1935-last-accent',a[0]);}
function applyTheme(){let dark=settings.theme==='dark'||(settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';$('themeMeta').content=dark?'#0b111b':'#f4f5f8'}
function toast(text){const e=$('toast');e.textContent=text;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),1900)}
function speak(word){if(!('speechSynthesis'in window))return toast('読み上げ非対応です');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(word).replace(/[～〜]/g,' '));u.lang='en-US';u.rate=.87;speechSynthesis.speak(u)}
function directionText(d){return d==='en-ja'?'英 → 日':d==='ja-en'?'日 → 英':'ごちゃまぜ'}
function datePlan(){let n=null,required=null,m=normalStats();if(settings.targetDate){const t=new Date(settings.targetDate+'T00:00:00'),today=new Date(todayKey()+'T00:00:00');n=Math.max(0,Math.round((t-today)/86400000)+1);if(n>0)required=Math.ceil(m.remaining/n)}return {days:n,required}}
function modeUI(){for(const b of $$('#mainModes button'))b.classList.toggle('active',b.dataset.m===settings.mode);for(const b of $$('#pointsModes button'))b.classList.toggle('active',b.dataset.m===settings.pointsMode)}
function renderHome(){const m=normalStats(),t=day(),p=datePlan(),q=settings.dailyQuota;
 $('mainPercent').textContent=m.pct;$('ringPercent').textContent=m.pct+'%';$('mainRing').style.setProperty('--angle',m.pct*3.6+'deg');
 $('mainHits').textContent=number(m.hits);$('mainTotal').textContent=number(m.total);$('mainRemaining').textContent=number(m.remaining);$('mainCleared').textContent=number(m.clearedSenses);$('mainWords').textContent=number(m.clearedWords);
 $('goalDate').value=settings.targetDate||'';$('mainQuota').value=q;$('daysLeft').textContent=p.days===null?'—':p.days;$('requiredDaily').textContent=p.required===null?'—':number(p.required);$('streak').textContent=number(streak());$('todayCorrect').textContent=number(t.missionHits);$('todayQuota').textContent=number(q);$('mainTodayBar').style.width=Math.min(100,t.missionHits/q*100)+'%';
 const pill=$('pacePill');pill.textContent=m.remaining===0?'全クリ！':p.days===null?'目標日未設定':p.days===0?'目標日経過':q>=(p.required??Infinity)?'ペースOK':`あと${p.required-q}/日`;
 $('mainStart').disabled=m.remaining===0;$('mainStart').textContent=m.remaining===0?'全クリ済み':`通常学習を始める →`;$('autoStart').checked=!!settings.autoStartOnOpen;modeUI();}
function renderPoints(){
 const s=statsPoints(),d=pointToday(),plan=pointPlan(),q=settings.pointDailyQuota;
 $('pointsPct').textContent=s.pct+'%';$('pointsPassed').textContent=number(s.pass);
 $('pointsSeen').textContent=number(s.seen);$('pointsRemaining').textContent=number(s.remaining);
 $('pointsBar').style.width=s.pct+'%';
 $('pointsTotalScore').textContent=number(s.score);$('pointsGoalScore').textContent=number(TOTAL);
 $('pointsScoreRemaining').textContent=number(s.remainingScore);
 $('pointGoalDate').value=settings.pointTargetDate||'';$('pointQuota').value=q;
 $('pointDaysLeft').textContent=plan.days===null?'—':number(plan.days);
 $('pointRequiredDaily').textContent=plan.required===null?'—':number(plan.required);
 $('pointTodayScore').textContent=fmtScore(d.net);$('pointTodayQuota').textContent=number(q);
 $('pointTodayBar').style.width=clamp(d.net/q*100,0,100)+'%';
 $('pointTodayBreakdown').textContent=`今日の正解 ${number(d.correct)}回 · 不正解 ${number(d.wrong)}回 · 初回 ${number(d.unlocked)}語（得点変動なし）`;
 const pill=$('pointPacePill');
 if(s.remaining===0){pill.textContent='1935点達成！';pill.className='pill';}
 else if(plan.days===null){pill.textContent='目標日未設定';pill.className='pill';}
 else if(plan.days===0){pill.textContent='期限を過ぎました';pill.className='pill';}
 else if(q>=plan.required){pill.textContent='ペースOK';pill.className='pill';}
 else{pill.textContent=`あと ${number(plan.required-q)} pt/日`;pill.className='pill';}
 $('pointsStart').disabled=s.remaining===0;
 $('pointsStart').textContent=s.remaining===0?'全1935語合格！':d.net>=q?'今日のノルマ達成済み · 学習を続ける →':'今日のポイントノルマを始める →';
 const data=[['未出題',TOTAL-s.seen],['解放済み・0点',s.zero-(TOTAL-s.seen)],['マイナス点',s.neg],['合格・＋1点',s.pass]];
 $('pointsBreakdown').innerHTML=data.map(([label,n])=>`<div class="breakdown-line"><span>${label}</span><div class="track"><div style="width:${100*n/TOTAL}%"></div></div><b>${number(n)}</b></div>`).join('');modeUI();
}
function renderSearch(){const q=$('searchInput').value.trim().toLowerCase(),arr=q?WORDS.filter(w=>w.word.toLowerCase().includes(q)||w.meaning.toLowerCase().includes(q)).slice(0,200):WORDS.slice(0,80),container=$('searchList');container.textContent='';for(const w of arr){const p=pointRecord(w),card=document.createElement('article');card.className='word-card card';const no=document.createElement('span');no.className='no';no.textContent='No. '+w.id;card.appendChild(no);const h=document.createElement('h3');h.textContent=w.word;card.appendChild(h);const m=document.createElement('div');m.className='senses';m.textContent=w.meaning;card.appendChild(m);const tag=document.createElement('div');tag.className='tagrow';let mainClear=w.senses.every(s=>hit({w,s})>=3);let a=document.createElement('span');a.className='tag'+(mainClear?' good':'');a.textContent=mainClear?'通常クリア':`通常 ${w.senses.map(s=>hit({w,s})).join('/')}/3`;tag.appendChild(a);let b=document.createElement('span');b.className='tag'+(p.score>=1?' good':'');b.textContent=p.unlocked?`ポイント ${p.score>=0?'+':''}${p.score}`:'ポイント 未出題';tag.appendChild(b);card.appendChild(tag);container.appendChild(card)}if(!arr.length)container.textContent='該当する単語はありません。'}
function renderStats(){const m=normalStats(),p=statsPoints();$('statMain').textContent=number(m.hits);$('statPoints').textContent=number(p.pass);$('statDay').textContent=number(day().answered);const d=todayKey();$('weekStrip').innerHTML=Array.from({length:7},(_,i)=>{const k=shifted(d,i-6),a=activity[k]||{},n=a.missionHits||0;return `<div class="day"><small>${k.slice(5).replace('-','/')}</small><b>${n}</b></div>`}).join('')}
let activeView='home',activeQuiz='points', quiz=null, nextRound=0,mixRecent=[],mainContinue=false,pointsContinue=false;
function go(view){if(!$(view+'View'))return;$$('.view').forEach(e=>e.classList.remove('active'));$(view+'View').classList.add('active');activeView=view;document.body.classList.toggle('quiz-open',view==='quiz');$$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='home')renderHome();if(view==='points')renderPoints();if(view==='search')renderSearch();if(view==='stats')renderStats();if(view==='quiz')syncViewport();else window.scrollTo({top:0,behavior:'instant'})}
function syncViewport(){const standalone=document.documentElement.classList.contains('pwa-standalone'),v=window.visualViewport;document.documentElement.style.setProperty('--vh',standalone?'100dvh':Math.round(v?.height||innerHeight)+'px');document.documentElement.style.setProperty('--vtop',standalone?'0px':Math.max(0,Math.round(v?.offsetTop||0))+'px')}
function chooseDirection(m){if(m!=='mixed')return m;if(mixRecent.length>=2&&mixRecent.at(-1)===mixRecent.at(-2))return mixRecent.at(-1)==='en-ja'?'ja-en':'en-ja';return Math.random()<.5?'en-ja':'ja-en'}
// Prefer meaning ① (or the first registered sense) on 65% of multi-meaning questions.
function drawSense(w){if(w.senses.length===1)return w.senses[0];return Math.random()<.65?w.senses[0]:w.senses[1+Math.floor(Math.random()*(w.senses.length-1))]}
function normalized(s){return String(s).replace(/\[[^\]]*\]/g,'').replace(/[（(][^）)]*[）)]/g,'').replace(/[\s　、，,。・「」～〜〈〉]/g,'').toLowerCase()}
function meaningOverlap(a,b){const na=normalized(a),nb=normalized(b);if(!na||!nb)return false;if(na===nb)return true;if(na.length>=4&&nb.length>=4&&(na.includes(nb)||nb.includes(na)))return true;return false}
function choicesFor(w,sense,direction){const picked=[],seenWords=new Set([w.word.toLowerCase()]),usedJ=[sense.text],correct={w,s:sense,correct:true};
 // Intentionally do not use points, hits, wrong or recent history when choosing distractors.
 for(const alt of shuffled(WORDS)){
   if(alt.id===w.id||seenWords.has(alt.word.toLowerCase())||alt.senses.some(s=>w.senses.some(t=>meaningOverlap(s.text,t.text))))continue;
   const opts=shuffled(alt.senses).filter(s=>!usedJ.some(j=>meaningOverlap(j,s.text)));
   if(!opts.length)continue;const item={w:alt,s:opts[0],correct:false};picked.push(item);seenWords.add(alt.word.toLowerCase());usedJ.push(item.s.text);if(picked.length===3)break;
 }
 return shuffled([correct,...picked]);}
function startQuiz(mode){activeQuiz=mode;mainContinue=mode==='main'&&day().missionHits>=settings.dailyQuota;pointsContinue=false;nextRound=0;mixRecent=[];go('quiz');nextQuestion()}
function chooseMain(){const pool=SENSES.filter(u=>hit(u)<3);if(!pool.length)return null;return random(pool)}
function choosePoints(){const pool=WORDS.filter(w=>pointRecord(w).score<1);if(!pool.length)return null;const w=random(pool);return {w,s:drawSense(w),id:`${w.id}`}}
function nextQuestion(){if(activeQuiz==='points'){const s=statsPoints();if(s.remaining===0){done('全1935語合格！','全1935語が＋1点になり、合計1935ポイントを達成しました。',false);return}if(!pointsContinue&&pointToday().net>=settings.pointDailyQuota){done('今日のポイントノルマ達成！',`今日は ${fmtScore(pointToday().net)} pt を獲得しました。負の得点も合算した正味のポイントです。`,false,true);return}}if(activeQuiz==='main'&&!mainContinue&&day().missionHits>=settings.dailyQuota){done('今日のノルマ達成！',`今日は${number(day().missionHits)}回の有効正解です。`,true);return}const unit=activeQuiz==='points'?choosePoints():chooseMain();if(!unit){if(activeQuiz==='points')done('全1935語合格！','すべての単語が＋1点に達しました。',false);else done('通常学習も全クリ！','3553語義をすべて3回ずつ正解しました。',false);return}
 const mode=activeQuiz==='points'?settings.pointsMode:settings.mode;const direction=chooseDirection(mode);mixRecent.push(direction);if(mixRecent.length>5)mixRecent.shift();
 // First presentation unlocks the word, without affecting its score.
 let first=false;if(activeQuiz==='points'){const rec=pointRecord(unit.w);first=!rec.unlocked;if(first){rec.unlocked=true;pointToday().unlocked++}rec.shown++;savePoints()}
 quiz={unit,direction,first,answered:false,choices:choicesFor(unit.w,unit.s,direction)};
 $('quizWordNo').textContent=`No. ${unit.w.id}`;$('quizModeTag').textContent=`${activeQuiz==='points'?'ポイント制':'通常学習'} / ${directionText(direction)}`;
 $('quizSense').textContent=unit.s.no?`${unit.s.no} ${unit.s.pos||''}`:unit.s.pos||'単一語義';$('quizScore').textContent=activeQuiz==='points'?(first?'初回 0pt':`${pointRecord(unit.w).score>0?'+':''}${pointRecord(unit.w).score} pt`):`${hit(unit)}/3`;
 const prompt=$('quizPrompt');prompt.textContent=direction==='en-ja'?unit.w.word:unit.s.text;prompt.classList.toggle('jp',direction==='ja-en');$('quizAudio').classList.toggle('hidden',direction==='ja-en');$('quizHeaderInfo').textContent=activeQuiz==='points'?`今日 ${fmtScore(pointToday().net)}/${number(settings.pointDailyQuota)} pt · 合格 ${number(statsPoints().pass)}語`:`今日 ${number(day().missionHits)}/${number(settings.dailyQuota)} 正解`;
 $('quizResult').className='quiz-result';$('quizResult').textContent=activeQuiz==='points'&&first?'初回出題：今回の正誤ではポイントは変わりません':'1つ選んでください';$('quizNext').disabled=true;$('quizNext').textContent='回答を選択してください';$('quizFooter').textContent=activeQuiz==='points'?'未合格単語を正誤・得点に関係なく均等抽選':'語義ごとに3回正解でクリア';renderChoices();}
function renderChoices(){const wrap=$('quizOptions');wrap.textContent='';quiz.choices.forEach((c,i)=>{const card=document.createElement('div');card.className='choice';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','選択肢 '+(i+1));const main=document.createElement('div');main.className='choice-main';main.textContent=quiz.direction==='en-ja'?c.s.text:c.w.word;if(quiz.direction==='ja-en')main.classList.add('en','has-audio');card.appendChild(main);const detail=document.createElement('div');detail.className='choice-detail';detail.textContent=quiz.direction==='en-ja'?c.w.word:c.s.text;card.appendChild(detail);if(quiz.direction==='ja-en'){const audio=document.createElement('button');audio.className='choice-audio';audio.textContent='🔊';audio.setAttribute('aria-label',c.w.word+'の発音');audio.onclick=e=>{e.stopPropagation();speak(c.w.word)};card.appendChild(audio)}card.onclick=()=>answerChoice(i);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();answerChoice(i)}};wrap.appendChild(card)})}
function answerChoice(i){if(!quiz||quiz.answered)return;quiz.answered=true;const q=quiz,c=q.choices[i],correct=!!c.correct,w=q.unit.w;let result='';const fb=$('quizResult');fb.className='quiz-result '+(correct?'good':'bad');
 if(activeQuiz==='points'){
 const r=pointRecord(w),pday=pointToday();r.answered++;pday.answered++;
 if(correct){r.correct++;pday.correct++}else{r.wrong++;pday.wrong++}
 if(q.first){result=correct?'✓ 正解！ 初回はポイント変動なし':'✕ 不正解。初回はポイント変動なし'}
 else{const delta=correct?1:-1;r.score+=delta;pday.net+=delta;
 result=correct?`✓ 正解！ ＋1点 → ${r.score}pt${r.score===1?' · 合格！':''}`:`✕ 不正解。−1点 → ${r.score}pt`;
 r.score=Math.min(1,r.score)}
 savePoints();$('quizScore').textContent=fmtScore(r.score)+' pt';
}
 else{const s=mainRecord(w),key=q.unit.s.key;s.senses[key]??={correct:0,wrong:0};s.seen=(s.seen||0)+1;day().answered++;if(correct){day().correct++;s.correct++;s.senses[key].correct++;let old=hit(q.unit);if(old<3){hitSet(q.unit,old+1);day().missionHits++}result=`✓ 正解！ ${hit(q.unit)}/3${hit(q.unit)===3?' · 語義クリア！':''}`}else{day().wrong++;s.wrong++;s.senses[key].wrong++;result=`✕ 不正解。正解は緑色の選択肢`}saveMain();$('quizScore').textContent=`${hit(q.unit)}/3`}
 fb.textContent=result;
 [...$('quizOptions').children].forEach((e,n)=>{e.classList.add('answered');e.setAttribute('aria-disabled','true');if(q.choices[n].correct)e.classList.add('correct');else if(n===i)e.classList.add('wrong');else e.classList.add('dim')});
 $('quizNext').disabled=false;$('quizNext').textContent=activeQuiz==='points'&&pointToday().net>=settings.pointDailyQuota&&!pointsContinue?'今日の結果を見る →':activeQuiz==='points'?'次のランダムな単語 →':'次の問題 →';$('quizHeaderInfo').textContent=activeQuiz==='points'?`今日 ${fmtScore(pointToday().net)}/${number(settings.pointDailyQuota)} pt · 合格 ${number(statsPoints().pass)}語`:`今日 ${number(day().missionHits)} / ${number(settings.dailyQuota)} 正解`;
}
function done(title,message,mainDone,pointsDailyDone=false){
 $('doneTitle').textContent=title;$('doneMessage').textContent=message;
 $('doneContinue').textContent=pointsDailyDone?'ノルマを超えて学習を続ける':mainDone?'続けて通常学習':'ポイント制に戻る';
 $('doneContinue').onclick=()=>{if(pointsDailyDone){pointsContinue=true;go('quiz');nextQuestion()}
 else if(mainDone){mainContinue=true;go('quiz');nextQuestion()}else go(activeQuiz==='points'?'points':'home')};
 $('doneBack').textContent=activeQuiz==='points'?'ポイント制に戻る':'通常学習に戻る';
 go('done');
}
function syncWidget(){try{saveMain();const m=normalStats(),d=day();const data={version:1,date:todayKey(),hits:d.missionHits,quota:settings.dailyQuota,answered:d.answered,correct:d.correct,remaining:m.remaining,total:m.total,overallHits:m.hits,clearedUnits:m.clearedSenses,clearedWords:m.clearedWords,streak:streak(),mode:settings.mode,targetDate:settings.targetDate||'',accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),siteUrl:new URL('./',location.href).href,updatedAt:new Date().toISOString(),week:Array.from({length:7},(_,i)=>{const k=shifted(todayKey(),i-6);return{date:k,hits:activity[k]?.missionHits||0}})};const url='scriptable:///run/Vocab1935Widget?payload='+encodeURIComponent(JSON.stringify(data));toast('Scriptableへ同期データを送ります');setTimeout(()=>location.href=url,150)}catch(e){console.error(e);toast('同期に失敗しました')}}
function exportData(){saveAll();const data={format:'Vocab1935-v9',version:9,exportedAt:new Date().toISOString(),progress:regular,settings,activity,pointData,pointDays};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=`vocab1935-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function importData(file){try{const d=JSON.parse(await file.text());if(!d||!d.progress||typeof d.progress!=='object')throw Error('wrong file');if(!confirm('バックアップを読み込んで現在の進捗を置き換えますか？'))return;regular=d.progress;settings={...settings,...d.settings};activity=d.activity&&typeof d.activity==='object'?d.activity:{};if(d.pointData&&typeof d.pointData==='object')pointData=d.pointData;pointDays=d.pointDays&&typeof d.pointDays==='object'?d.pointDays:{};settings.pointDailyQuota=clamp(parseInt(settings.pointDailyQuota,10)||30,1,1000000);saveAll();renderHome();renderPoints();renderStats();toast('読み込みました（ポイント履歴も反映）')}catch(e){toast('読み込みに失敗しました')}}
function resetPoints(){if(!confirm('ポイント制1935語の得点・解放履歴だけをすべてリセットしますか？ 通常の3回クリア進捗は残ります。'))return;pointData={};pointDays={};savePoints();renderPoints();toast('ポイント制だけリセットしました')}
// bindings
for(const b of $$('#mainModes button'))b.onclick=()=>{settings.mode=b.dataset.m;saveMain();renderHome()};
for(const b of $$('#pointsModes button'))b.onclick=()=>{settings.pointsMode=b.dataset.m;saveMain();renderPoints()};
for(const b of $$('[data-view]'))b.onclick=()=>go(b.dataset.view);
$('accentBtn').onclick=()=>{setAccent();toast('差し色を変えました')};$('themeBtn').onclick=()=>{settings.theme=settings.theme==='system'?'light':settings.theme==='light'?'dark':'system';saveMain();applyTheme()};
$('goalDate').onchange=e=>{settings.targetDate=e.target.value;saveMain();renderHome()};$('mainQuota').onchange=e=>{settings.dailyQuota=clamp(Number(e.target.value)||100,1,3000);saveMain();renderHome()};
$('autoQuotaBtn').onclick=()=>{const p=datePlan();if(p.required==null){toast('先に未来の目標日を設定してください');return}settings.dailyQuota=clamp(Math.max(1,p.required),1,3000);saveMain();renderHome();toast('ノルマを再計算しました')};
$('mainStart').onclick=()=>startQuiz('main');$('pointsStart').onclick=()=>startQuiz('points');$('pointsReset').onclick=resetPoints;
$('pointGoalDate').onchange=savePointPlan;$('pointQuota').onchange=savePointPlan;$('pointAutoQuotaBtn').onclick=autoPointQuota;
$('doneBack').onclick=()=>go(activeQuiz==='points'?'points':'home');$('quizBack').onclick=()=>go(activeQuiz==='points'?'points':'home');$('quizAudio').onclick=()=>{if(quiz)speak(quiz.unit.w.word)};$('quizNext').onclick=()=>{if(!$('quizNext').disabled)nextQuestion()};
$('searchInput').oninput=renderSearch;$('exportBtn').onclick=exportData;$('importFile').onchange=e=>{if(e.target.files?.[0])importData(e.target.files[0]);e.target.value=''};
$('syncWidgetBtn').onclick=syncWidget;$('autoStart').onchange=e=>{settings.autoStartOnOpen=e.target.checked;saveMain()};
function viewport(){const standalone=document.documentElement.classList.contains('pwa-standalone');if(standalone){document.documentElement.style.setProperty('--vh','100dvh');document.documentElement.style.setProperty('--vtop','0px')}else syncViewport()}
window.addEventListener('resize',viewport,{passive:true});window.addEventListener('pageshow',viewport,{passive:true});if(window.visualViewport&&!document.documentElement.classList.contains('pwa-standalone')){visualViewport.addEventListener('resize',viewport,{passive:true});visualViewport.addEventListener('scroll',viewport,{passive:true})}
for(const w of WORDS){for(const s of w.senses)hit({w,s})} // migrate earlier 3-hit progress without resetting it
saveMain();setAccent();applyTheme();renderHome();renderPoints();viewport();
if((settings.autoStartOnOpen||new URLSearchParams(location.search).has('study'))&&normalStats().remaining>0){setTimeout(()=>{if(activeView==='home'&&!document.hidden)startQuiz('main')},240)}
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
