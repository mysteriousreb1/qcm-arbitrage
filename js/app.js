(() => {
  const CONFIG = { examCount: 20, examSeconds: 600, passScore: 16, masteredStreak: 2 };
  const STORE_KEY = 'qcm_arbitrage_v1';
  const app = document.getElementById('app');
  let QUESTIONS = [];
  let state = null;

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  const sample = (arr, n) => shuffle([...arr]).slice(0, Math.min(n, arr.length));
  const sameSet = (a,b) => a.length === b.length && a.every(x => b.includes(x));
  const labelFor = (i) => String.fromCharCode(65+i);

  function defaultStore(){
    return { perQuestion: {}, errors: [], exams: [] };
  }
  function loadStore(){
    try { return Object.assign(defaultStore(), JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); }
    catch { return defaultStore(); }
  }
  function saveStore(store){ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  function qStats(id){
    const store = loadStore();
    if(!store.perQuestion[id]) store.perQuestion[id] = { seen:0, correct:0, wrong:0, streak:0 };
    saveStore(store);
    return store.perQuestion[id];
  }
  function recordAnswer(question, isCorrect){
    const store = loadStore();
    const id = question.id;
    if(!store.perQuestion[id]) store.perQuestion[id] = { seen:0, correct:0, wrong:0, streak:0 };
    const s = store.perQuestion[id];
    s.seen += 1;
    if(isCorrect){ s.correct += 1; s.streak += 1; store.errors = store.errors.filter(x => x !== id); }
    else { s.wrong += 1; s.streak = 0; if(!store.errors.includes(id)) store.errors.push(id); }
    saveStore(store);
  }
  function recordExam(score, total){
    const store = loadStore();
    store.exams.push({ score, total, date: new Date().toISOString() });
    saveStore(store);
  }
  function getQuestion(id){ return QUESTIONS.find(q => q.id === id); }
  function selectedIndexes(container){
    return [...container.querySelectorAll('input:checked')].map(i => Number(i.value)).sort((a,b)=>a-b);
  }
  function answerText(q, arr){ return arr.map(i => `${labelFor(i)}. ${q.answers[i] ?? ''}`).join(' + '); }

  function screen(title, body){
    app.innerHTML = `<main class="screen">${title ? `<div class="hero"><h1>${title}</h1><p>Révision QCM Arbitrage — données locales sur cet appareil.</p></div>` : ''}${body}</main>`;
  }
  function backHomeButton(){ return `<button class="secondary-btn" data-action="home">Accueil</button>`; }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const action = btn.dataset.action;
    if(action === 'home') return home();
    if(action === 'training') return startTraining(QUESTIONS);
    if(action === 'exam') return startExam();
    if(action === 'errors') return errorsMenu();
    if(action === 'stats') return statsScreen();
    if(action === 'resetStats') return resetStats();
    if(action === 'errors10') return startTraining(sample(errorQuestions(), 10), true);
    if(action === 'errors20') return startTraining(sample(errorQuestions(), 20), true);
    if(action === 'errorsAll') return startTraining(shuffle(errorQuestions()), true);
  });

  function home(){
    const store = loadStore();
    const errCount = store.errors.length;
    screen('🏀 QCM Arbitrage', `
      <div class="grid">
        <button class="menu-btn" data-action="training">▶️ Mode Training <span>Correction immédiate, vert/rouge, extrait du règlement.</span></button>
        <button class="menu-btn" data-action="exam">📝 Mode Exam <span>20 questions au hasard, 10 minutes, note à la fin.</span></button>
        <button class="menu-btn" data-action="errors">📚 Réviser mes erreurs <span>${errCount} question(s) à retravailler sur cet appareil.</span></button>
        <button class="menu-btn" data-action="stats">📊 Statistiques <span>Progression, réussite globale, examens, questions maîtrisées.</span></button>
      </div>
      <hr><p class="small">${QUESTIONS.length} questions chargées. Les thèmes/articles ne sont jamais affichés pendant les questions.</p>
    `);
  }

  function renderQuestion(q, options){
    const multi = q.multiple || q.correct.length > 1;
    return `
      <div class="question-card">
        <div class="row">
          ${options.badges || ''}
          ${multi ? `<span class="badge warn">Plusieurs réponses sont possibles</span>` : ''}
        </div>
        <div class="question-text">${esc(q.question)}</div>
        <div class="answers" id="answers">
          ${q.answers.map((a,i)=>`
            <label class="answer" data-index="${i}">
              <input type="${multi ? 'checkbox' : 'radio'}" name="answer" value="${i}">
              <span><strong>${labelFor(i)}.</strong> ${esc(a)}</span>
            </label>`).join('')}
        </div>
      </div>`;
  }
  function bindAnswerHighlight(){
    document.querySelectorAll('.answer input').forEach(input => {
      input.addEventListener('change', () => {
        document.querySelectorAll('.answer').forEach(l => l.classList.toggle('selected', l.querySelector('input').checked));
      });
    });
  }

  function startTraining(pool, isErrorMode=false){
    const list = shuffle(pool.filter(q => q.answers.length && q.correct.length));
    state = { mode:'training', list, index:0, score:0, answered:false, isErrorMode };
    if(!list.length) return screen('📚 Réviser mes erreurs', `<p>Aucune question disponible dans cette section.</p><div class="footer-actions">${backHomeButton()}</div>`);
    trainingQuestion();
  }
  function trainingQuestion(){
    const q = state.list[state.index];
    screen('', `
      <div class="topbar">
        <div class="row"><span class="badge">Training</span><span class="badge">Question ${state.index+1}/${state.list.length}</span><span class="badge good">Score ${state.score}</span></div>
        ${backHomeButton()}
      </div>
      ${renderQuestion(q, {badges:''})}
      <div id="feedback"></div>
      <div class="footer-actions">
        <button class="secondary-btn" id="nextBtn" style="display:none">Question suivante</button>
        <button class="primary-btn" id="validateBtn">Valider</button>
      </div>`);
    bindAnswerHighlight();
    $('#validateBtn').addEventListener('click', () => validateTraining(q));
    $('#nextBtn').addEventListener('click', () => { state.index++; state.answered=false; if(state.index>=state.list.length) return trainingEnd(); trainingQuestion(); });
  }
  function validateTraining(q){
    if(state.answered) return;
    const chosen = selectedIndexes($('#answers'));
    if(!chosen.length) return alert('Choisis au moins une réponse.');
    const ok = sameSet(chosen, q.correct);
    recordAnswer(q, ok);
    if(ok) state.score += 1;
    state.answered = true;
    document.querySelectorAll('.answer').forEach(label => {
      const idx = Number(label.dataset.index);
      const input = label.querySelector('input');
      input.disabled = true;
      if(q.correct.includes(idx)) label.classList.add('correct');
      if(chosen.includes(idx) && !q.correct.includes(idx)) label.classList.add('incorrect');
    });
    $('#feedback').innerHTML = `
      <div class="explanation">
        <strong>${ok ? '✅ Correct' : '❌ Incorrect'}</strong><br>
        <strong>Bonne réponse :</strong> ${esc(answerText(q, q.correct))}
        ${q.explanation ? `<br><br><strong>Extrait :</strong><br>${esc(q.explanation)}` : ''}
      </div>`;
    $('#validateBtn').style.display = 'none';
    $('#nextBtn').style.display = 'inline-flex';
  }
  function trainingEnd(){
    screen('▶️ Training terminé', `
      <div class="result-score">${state.score}/${state.list.length}</div>
      <div class="result-label">Session terminée</div>
      <div class="footer-actions">${backHomeButton()}<button class="primary-btn" data-action="training">Nouvelle session</button></div>`);
  }

  function startExam(){
    const list = sample(QUESTIONS.filter(q => q.answers.length && q.correct.length), CONFIG.examCount);
    state = { mode:'exam', list, index:0, answers:[], seconds:CONFIG.examSeconds, timer:null };
    state.timer = setInterval(() => { state.seconds--; if(state.seconds <= 0) finishExam(true); else updateTimer(); }, 1000);
    examQuestion();
  }
  function updateTimer(){ const el=$('#timer'); if(el) el.textContent = formatTime(state.seconds); }
  function formatTime(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  function examQuestion(){
    const q = state.list[state.index];
    const pct = ((state.index)/state.list.length)*100;
    screen('', `
      <div class="topbar">
        <div class="row"><span class="badge">Exam</span><span class="badge">Question ${state.index+1}/${state.list.length}</span><span class="badge bad timer" id="timer">${formatTime(state.seconds)}</span></div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      ${renderQuestion(q, {badges:''})}
      <div class="footer-actions">
        <span class="small">Pas de retour arrière. Correction uniquement à la fin.</span>
        <button class="primary-btn" id="examNext">${state.index === state.list.length-1 ? 'Terminer' : 'Question suivante'}</button>
      </div>`);
    bindAnswerHighlight();
    $('#examNext').addEventListener('click', () => {
      const chosen = selectedIndexes($('#answers'));
      if(!chosen.length) return alert('Choisis au moins une réponse.');
      state.answers.push(chosen);
      if(state.index === state.list.length-1) return finishExam(false);
      state.index++;
      examQuestion();
    });
  }
  function finishExam(timedOut){
    if(!state || state.mode !== 'exam') return;
    clearInterval(state.timer);
    while(state.answers.length < state.list.length) state.answers.push([]);
    let score=0, mistakes=[];
    state.list.forEach((q,i) => {
      const ok = sameSet(state.answers[i], q.correct);
      recordAnswer(q, ok);
      if(ok) score++; else mistakes.push({q, chosen:state.answers[i]});
    });
    recordExam(score, state.list.length);
    const passed = score >= CONFIG.passScore;
    screen('Résultat examen', `
      ${timedOut ? `<p><span class="badge bad">Temps écoulé</span></p>` : ''}
      <div class="result-score">${score}/${state.list.length}</div>
      <div class="result-label">${passed ? '✅ Réussi' : '❌ Échec'} <span class="small">Minimum : ${CONFIG.passScore}/20</span></div>
      <div class="footer-actions">${backHomeButton()}<button class="primary-btn" data-action="exam">Recommencer un examen</button></div>
      <hr>
      <h2>Correction des erreurs</h2>
      ${mistakes.length ? `<div class="error-list">${mistakes.map((m,idx)=>`
        <div class="error-item">
          <div class="badge bad">Erreur ${idx+1}</div>
          <p><strong>Question :</strong><br>${esc(m.q.question)}</p>
          <p><strong>Votre réponse :</strong> ${m.chosen.length ? esc(answerText(m.q, m.chosen)) : 'Aucune réponse'}</p>
          <p><strong>Bonne réponse :</strong> ${esc(answerText(m.q, m.q.correct))}</p>
          ${m.q.explanation ? `<div class="explanation"><strong>Extrait :</strong><br>${esc(m.q.explanation)}</div>` : ''}
        </div>`).join('')}</div>` : '<p>Bravo, aucune erreur.</p>'}
    `);
    state=null;
  }

  function errorQuestions(){
    const store = loadStore();
    return store.errors.map(getQuestion).filter(Boolean);
  }
  function errorsMenu(){
    const n = errorQuestions().length;
    screen('📚 Réviser mes erreurs', `
      <p>${n} question(s) à retravailler sur cet appareil.</p>
      <div class="grid">
        <button class="menu-btn" data-action="errors10">10 erreurs <span>Session courte.</span></button>
        <button class="menu-btn" data-action="errors20">20 erreurs <span>Session type examen.</span></button>
        <button class="menu-btn" data-action="errorsAll">Toutes mes erreurs <span>Réviser l'ensemble des questions ratées.</span></button>
        <button class="menu-btn" data-action="home">Accueil <span>Retour au menu principal.</span></button>
      </div>`);
  }

  function statsScreen(){
    const store=loadStore();
    const ids = Object.keys(store.perQuestion || {});
    const viewed = ids.filter(id => store.perQuestion[id].seen > 0).length;
    const totalCorrect = ids.reduce((s,id)=>s+(store.perQuestion[id].correct||0),0);
    const totalWrong = ids.reduce((s,id)=>s+(store.perQuestion[id].wrong||0),0);
    const mastered = ids.filter(id => (store.perQuestion[id].streak||0) >= CONFIG.masteredStreak).length;
    const toReview = (store.errors || []).length;
    const rate = (totalCorrect+totalWrong) ? Math.round(100*totalCorrect/(totalCorrect+totalWrong)) : 0;
    const exams = store.exams || [];
    const best = exams.length ? Math.max(...exams.map(e=>e.score)) : 0;
    const avg = exams.length ? (exams.reduce((s,e)=>s+e.score,0)/exams.length).toFixed(1) : '0.0';
    screen('📊 Statistiques', `
      <div class="kpi-grid">
        <div class="kpi"><strong>${QUESTIONS.length}</strong><span>Questions totales</span></div>
        <div class="kpi"><strong>${viewed}</strong><span>Questions vues</span></div>
        <div class="kpi"><strong>${QUESTIONS.length-viewed}</strong><span>Jamais vues</span></div>
        <div class="kpi"><strong>${rate}%</strong><span>Réussite globale</span></div>
        <div class="kpi"><strong>${mastered}</strong><span>Questions maîtrisées</span></div>
        <div class="kpi"><strong>${toReview}</strong><span>Questions à retravailler</span></div>
        <div class="kpi"><strong>${exams.length}</strong><span>Examens passés</span></div>
        <div class="kpi"><strong>${best}/20</strong><span>Meilleur score</span></div>
      </div>
      <hr>
      <p><strong>Moyenne examens :</strong> ${avg}/20</p>
      <p class="small">Une question devient maîtrisée après ${CONFIG.masteredStreak} bonnes réponses consécutives. Une erreur remet son compteur à zéro.</p>
      <div class="footer-actions">${backHomeButton()}<button class="danger-btn" data-action="resetStats">Réinitialiser les statistiques</button></div>`);
  }
  function resetStats(){
    if(confirm('Réinitialiser toutes les statistiques, erreurs et examens sur cet appareil ?')){
      localStorage.removeItem(STORE_KEY);
      statsScreen();
    }
  }

  async function init(){
    app.innerHTML = '<div class="loading">Chargement des questions…</div>';
    try {
      const res = await fetch('data/questions.json', {cache:'no-store'});
      if(!res.ok) throw new Error('questions.json introuvable');
      const data = await res.json();
      QUESTIONS = data.questions || [];
      home();
    } catch(e) {
      app.innerHTML = `<div class="empty"><h1>Erreur de chargement</h1><p>${esc(e.message)}</p></div>`;
    }
  }
  init();
})();
