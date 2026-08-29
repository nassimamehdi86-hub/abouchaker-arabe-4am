/* =========================================================================================
   منصة الأستاذ محمد أبوشاكر لعبودي — المنطق الرئيسي (Firebase + التسجيل + القفل + الاختبارات)
   ========================================================================================= */

/* ---------- تهيئة Firebase (compat SDK، محمّل من CDN في index.html) ---------- */
let fbApp = null, db = null, fbReady = false;
try{
  if(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey.indexOf('ضع_') === -1){
    fbApp = firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    fbReady = true;
  }
}catch(e){ console.warn('Firebase init failed', e); }

function fbUnavailableNotice(){
  return `<div class="note" style="margin:14px 0">
    <b>تنبيه:</b> لم يتم بعد ربط هذه النسخة بمشروع Firebase حقيقي. عدّل ملف
    <b>firebase-config.js</b> بمفاتيح مشروعك لتفعيل التسجيل والترتيب ولوحة التحكم.
    باقي المحتوى (الدروس، الفيديوهات، اختبار الفهم، إعراب الجمل) يعمل بلا اتصال بأي حال.
  </div>`;
}

/* =========================================================================================
   أدوات عامة: تطبيع نص عربي، توليد معرّف جلسة، تخزين محلي
   ========================================================================================= */
function normalizeAr(s){
  return (s||'')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
    .replace(/[إأآٱا]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/[^ابتثجحخدذرزسشصضطظعغفقكلمنهويء0-9\s]/g,'').replace(/\s+/g,' ').trim();
}
function genSessionId(){ return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); }

/* ضغط صورة (وصل الدفع) في المتصفح إلى حجم صغير جدًا قبل إرسالها — تجنّبًا لاستخدام Firebase Storage */
function compressImageFile(file, maxDim){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let { width, height } = img;
        const dim = maxDim || 700;
        if(width > height && width > dim){ height = Math.round(height * dim/width); width = dim; }
        else if(height > dim){ width = Math.round(width * dim/height); height = dim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.55));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* =========================================================================================
   حالة الطالب الحالية (Student State)
   ========================================================================================= */
const Student = {
  id:null, fullName:null, status:null, sessionId:null, unsubscribe:null, streak:0,

  normalizedKey(fullName){ return normalizeAr(fullName); },

  /* تحديث سلسلة النشاط اليومية (أيام متتالية من الدخول) — تُستدعى بعد كل دخول ناجح */
  async updateStreak(){
    if(!fbReady || !this.id) return;
    const today = new Date().toISOString().slice(0,10);
    try{
      const ref = db.collection('students').doc(this.id);
      const snap = await ref.get();
      const data = snap.data() || {};
      const last = data.lastLoginDate;
      let streak = data.streak || 0;
      if(last !== today){
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
        streak = (last === yesterday) ? (streak + 1) : 1;
        await ref.update({ lastLoginDate: today, streak });
      }
      this.streak = streak;
    }catch(e){ this.streak = 0; }
  },

  /* محاولة الدخول أو التسجيل بالاسم واللقب — receiptDataUrl: صورة وصل مضغوطة (Base64)، فقط عند أول تسجيل */
  async loginOrRegister(fullName, receiptDataUrl){
    if(!fbReady) return { ok:false, reason:'no-firebase' };
    const key = this.normalizedKey(fullName);
    if(!key) return { ok:false, reason:'empty-name' };

    const col = db.collection('students');
    const existing = await col.where('nameKey','==', key).limit(1).get();

    if(!existing.empty){
      const docSnap = existing.docs[0];
      const data = docSnap.data();
      this.id = docSnap.id; this.fullName = data.fullName; this.status = data.status;

      if(data.status === 'pending')  return { ok:true, status:'pending' };
      if(data.status === 'rejected') return { ok:true, status:'rejected' };

      /* موافق عليه: نبدأ جلسة جديدة (تطرد أي جلسة سابقة تلقائيًا) */
      const newSession = genSessionId();
      await col.doc(this.id).update({ currentSession:newSession, lastSeen:firebase.firestore.FieldValue.serverTimestamp() });
      this.sessionId = newSession;
      lsSet('student_id', this.id); lsSet('student_name', this.fullName); lsSet('student_session', newSession);
      this.watchSession();
      await this.updateStreak();
      return { ok:true, status:'approved' };
    }

    /* لا يوجد سجل سابق: إنشاء طلب جديد بحالة الانتظار — يتطلب صورة وصل عند أول تسجيل */
    if(!receiptDataUrl) return { ok:false, reason:'receipt-required' };
    const newDoc = await col.add({
      fullName: fullName.trim(), nameKey:key, status:'pending',
      receiptImage: receiptDataUrl, /* مؤقتة: تُحذف تلقائيًا فور قرار القبول/الرفض */
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), currentSession:null
    });
    this.id = newDoc.id; this.fullName = fullName.trim(); this.status = 'pending';
    lsSet('student_id', this.id); lsSet('student_name', this.fullName);
    return { ok:true, status:'pending' };
  },

  /* محاولة استرجاع جلسة محفوظة محليًا عند فتح التطبيق */
  async resume(){
    if(!fbReady) return false;
    const id = lsGet('student_id'), name = lsGet('student_name'), session = lsGet('student_session');
    if(!id || !session) return false;
    try{
      const snap = await db.collection('students').doc(id).get();
      if(!snap.exists) return false;
      const data = snap.data();
      if(data.status !== 'approved' || data.currentSession !== session) return false;
      this.id = id; this.fullName = data.fullName; this.status = 'approved'; this.sessionId = session;
      this.watchSession();
      await this.updateStreak();
      return true;
    }catch(e){ return false; }
  },

  /* مراقبة الجلسة: إن تغيّرت (دخول من جهاز آخر) نخرج تلقائيًا */
  watchSession(){
    if(!fbReady || !this.id) return;
    if(this.unsubscribe) this.unsubscribe();
    this.unsubscribe = db.collection('students').doc(this.id).onSnapshot(snap=>{
      if(!snap.exists) return;
      const data = snap.data();
      if(data.currentSession && this.sessionId && data.currentSession !== this.sessionId){
        alert('تم تسجيل دخولك من جهاز آخر، سيتم إنهاء هذه الجلسة.');
        Student.logout();
        location.reload();
      }
    });
  },

  logout(){
    if(this.unsubscribe) this.unsubscribe();
    localStorage.removeItem('student_id'); localStorage.removeItem('student_name'); localStorage.removeItem('student_session');
    this.id=null; this.fullName=null; this.status=null; this.sessionId=null;
  }
};

/* =========================================================================================
   حالة قفل/فتح الدروس والفصول (يتحكم بها الأستاذ/المشرف من داخل التطبيق)
   وثيقة واحدة: state/locks  =>  { lessons: {lessonId: true/false}, trimesters: {t1:bool, t2:bool, t3:bool} }
   ========================================================================================= */
const Locks = {
  data:{ lessons:{}, trimesters:{t1:false, t2:false, t3:false} }, ready:false,

  async load(){
    if(!fbReady) { this.ready = true; return; }
    try{
      const snap = await db.collection('state').doc('locks').get();
      if(snap.exists) this.data = Object.assign({lessons:{}, trimesters:{t1:false,t2:false,t3:false}}, snap.data());
    }catch(e){
      /* هذا الخطأ يخفي المشكلة الحقيقية غالبًا: عدم سماح قواعد Firestore بقراءة state/locks
         بدون Firebase Auth. لو فشلت هذه القراءة، تبقى كل الدروس تظهر "مقفلة" حتى لو فتحها
         الأستاذ فعليًا، لأن this.data يبقى على قيمته الافتراضية الفارغة. */
      console.error('تعذّرت قراءة حالة القفل (state/locks) — تحقق من قواعد Firestore:', e);
      if(typeof showFbPermissionNotice === 'function') showFbPermissionNotice('locks');
    }
    this.ready = true;
  },
  isLessonLocked(id){ return !this.data.lessons || this.data.lessons[id] !== true; }, // افتراضيًا مقفل حتى يُفتح صراحة
  isTrimesterOpen(t){ return !!(this.data.trimesters && this.data.trimesters[t]); },

  async setLesson(id, open){
    if(!fbReady) return;
    this.data.lessons = this.data.lessons || {};
    this.data.lessons[id] = !!open;
    await db.collection('state').doc('locks').set(this.data, {merge:true});
  },
  async setTrimester(t, open){
    if(!fbReady) return;
    this.data.trimesters = this.data.trimesters || {};
    this.data.trimesters[t] = !!open;
    await db.collection('state').doc('locks').set(this.data, {merge:true});
  },

  /* استماع لحظي للتغييرات حتى تنعكس فورًا عند كل التلاميذ */
  listen(onChange){
    if(!fbReady) return;
    db.collection('state').doc('locks').onSnapshot(snap=>{
      if(snap.exists) this.data = Object.assign({lessons:{}, trimesters:{t1:false,t2:false,t3:false}}, snap.data());
      if(onChange) onChange();
    }, error=>{
      console.error('تعذّر الاستماع لحالة القفل (state/locks) — تحقق من قواعد Firestore:', error);
      if(typeof showFbPermissionNotice === 'function') showFbPermissionNotice('locks');
    });
  }
};

/* =========================================================================================
   لوحة تحكم الأستاذ/المشرف — الرقم السري + طلبات الانتظار + الإحصائيات
   ========================================================================================= */
const Admin = {
  authed:false,

  checkPin(pin){
    if(pin === (window.ADMIN_PIN || '')){ this.authed = true; return true; }
    return false;
  },

  async listPending(){
    if(!fbReady) return [];
    const snap = await db.collection('students').where('status','==','pending').get();
    return snap.docs.map(d=>({ id:d.id, ...d.data() }));
  },
  /* حذف صورة الوصل تلقائيًا من الوثيقة فور اتخاذ القرار — لا نُبقي أي صورة مخزَّنة بعد المعالجة */
  async approve(id){ if(fbReady) await db.collection('students').doc(id).update({status:'approved', receiptImage: firebase.firestore.FieldValue.delete()}); },
  async reject(id){ if(fbReady) await db.collection('students').doc(id).update({status:'rejected', receiptImage: firebase.firestore.FieldValue.delete()}); },

  /* إحصائيات درس واحد من مجموعة submissions (تُملأ لاحقًا عند إضافة "تمارين الدرس") */
  async lessonStats(lessonId, totalStudents){
    if(!fbReady) return { participants:0, total:totalStudents||0, avg:0 };
    try{
      const snap = await db.collection('submissions').doc(lessonId).collection('students').get();
      let sum = 0, count = 0;
      snap.forEach(d=>{ const v = d.data().percent; if(typeof v === 'number'){ sum += v; count++; } });
      return { participants:count, total: totalStudents||count, avg: count ? Math.round(sum/count) : 0 };
    }catch(e){ return { participants:0, total:totalStudents||0, avg:0 }; }
  },

  async allStudentsCount(){
    if(!fbReady) return 0;
    const snap = await db.collection('students').where('status','==','approved').get();
    return snap.size;
  },

  /* قائمة أسماء كل التلاميذ المقبولين، مرتبة أبجديًا */
  async listApproved(){
    if(!fbReady) return [];
    const snap = await db.collection('students').where('status','==','approved').get();
    const names = snap.docs.map(d=>d.data().fullName);
    names.sort((a,b)=> a.localeCompare(b, 'ar'));
    return names;
  },

  /* قائمة كاملة (المعرّف + الاسم) لكل التلاميذ المقبولين، مرتبة أبجديًا */
  async listApprovedFull(){
    if(!fbReady) return [];
    const snap = await db.collection('students').where('status','==','approved').get();
    const list = snap.docs.map(d=>({ id:d.id, fullName:d.data().fullName }));
    list.sort((a,b)=> a.fullName.localeCompare(b.fullName, 'ar'));
    return list;
  },

  /* متوسط مستوى تلميذ في تمارين كل الدروس (بالنسبة المئوية)، أو null إن لم يشارك في أي تمرين بعد */
  async studentAverage(studentId){
    if(!fbReady) return null;
    const lessons = window.LESSONS.filter(l=>l.locked!=='pending');
    const percents = [];
    for(const l of lessons){
      try{
        const doc = await db.collection('submissions').doc(l.id).collection('students').doc(studentId).get();
        if(doc.exists && typeof doc.data().percent === 'number') percents.push(doc.data().percent);
      }catch(e){}
    }
    if(!percents.length) return null;
    return Math.round(percents.reduce((a,b)=>a+b,0) / percents.length);
  }
};

/* =========================================================================================
   الترتيب (Leaderboard) لتمارين الدرس — بالنسبة المئوية، وليس بمجموع نقاط
   ========================================================================================= */
const Leaderboard = {
  async forLesson(lessonId){
    if(!fbReady) return [];
    const snap = await db.collection('submissions').doc(lessonId).collection('students')
      .orderBy('percent','desc').limit(50).get();
    return snap.docs.map(d=>({ name:d.data().studentName, percent:d.data().percent }));
  },
  /* نتيجة التلميذ الحالي في تمرين درس معيّن، إن وُجدت (لمنع إعادة المحاولة وعرض نتيجته السابقة) */
  async mine(lessonId){
    if(!fbReady || !Student.id) return null;
    try{
      const doc = await db.collection('submissions').doc(lessonId).collection('students').doc(Student.id).get();
      return doc.exists ? doc.data() : null;
    }catch(e){ return null; }
  },
  /* تسجيل نتيجة تمرين درس — محاولة واحدة فقط */
  async submit(lessonId, percent){
    if(!fbReady || !Student.id) return { ok:false, reason:'offline' };
    const ref = db.collection('submissions').doc(lessonId).collection('students').doc(Student.id);
    try{
      const existing = await ref.get();
      if(existing.exists) return { ok:false, reason:'already-submitted' }; // محاولة واحدة فقط
      await ref.set({ studentName: Student.fullName, percent, submittedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { ok:true };
    }catch(e){ return { ok:false, reason:'error' }; }
  }
};

/* =========================================================================================
   تحميل ملف تمارين درس معيّن من content/exercises/<lessonId>.json (يرفعه الأستاذ/المشرف مباشرة
   عبر GitHub بدون الحاجة لتعديل كود التطبيق). إن لم يوجد الملف بعد، تُعاد null بهدوء ويظهر
   للتلميذ أن التمارين "غير متوفرة بعد" كما في السابق.
   ========================================================================================= */
async function loadLessonExercise(lessonId){
  try{
    const res = await fetch(`content/exercises/${lessonId}.json`, {cache:'no-store'});
    if(!res.ok) return null;
    const data = await res.json();
    if(data && Array.isArray(data.questions) && data.questions.length) return data;
    return null;
  }catch(e){ return null; }
}

/* =========================================================================================
   محرك «اختبار الفهم» — محلي بالكامل، بلا Firebase، نسبة تراكمية من 100%
   إعادة الأسئلة الخاطئة فقط، التلميذ يقرر بنفسه متى يتوقف، لا يدخل أي ترتيب.
   ========================================================================================= */
function shuffleArr(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function createQuizEngine(lesson, mountEl){
  const total = lesson.mcq.length;
  let order = shuffleArr(lesson.mcq.map((_,i)=>i));
  let correctSet = new Set();     // فهارس الأسئلة التي أُجيبت صحيحة (تراكميًا، لا تُعاد)
  let roundQueue = order.slice(); // أسئلة الجولة الحالية
  let idx = 0;
  const PASS_THRESHOLD = 80; // لا تُكشف الإجابات الصحيحة إلا بعد تجاوز هذه النسبة

  function currentPercent(){ return Math.round((correctSet.size/total)*100); }

  function renderQuestion(){
    if(idx >= roundQueue.length){
      renderResult();
      return;
    }
    const qIndex = roundQueue[idx];
    const item = lesson.mcq[qIndex];
    const opts = item.options.map((opt,oi)=>`<button class="mcq-btn" data-oi="${oi}">${opt}</button>`).join('');
    mountEl.innerHTML = `
      <div class="quiz-progress">سؤال ${idx+1} من ${roundQueue.length} — التقدّم التراكمي: <b>${currentPercent()}%</b></div>
      <div class="quiz-card">
        <div class="quiz-q">${item.q}</div>
        <div class="quiz-opts">${opts}</div>
        <div class="quiz-explain" style="display:none"></div>
        <button class="quiz-next-btn" style="display:none">التالي ←</button>
      </div>`;
    const btns = mountEl.querySelectorAll('.mcq-btn');
    btns.forEach(b=>{
      b.addEventListener('click', ()=>{
        btns.forEach(x=>x.disabled = true);
        const oi = parseInt(b.getAttribute('data-oi'));
        const ok = oi === item.correct;
        const ex = mountEl.querySelector('.quiz-explain');
        if(ok){
          b.classList.add('correct'); correctSet.add(qIndex);
        } else {
          /* لا نكشف أي إجابة صحيحة أو تفسير هنا — فقط نُشير أن اختيار التلميذ كان خاطئًا،
             حتى لا تظهر له الإجابة الصحيحة قبل أن يتجاوز نسبة النجاح المطلوبة */
          b.classList.add('wrong');
          ex.innerHTML = '❌ إجابة غير صحيحة. تابع الأسئلة، وستظهر لك الإجابات الصحيحة كاملة بعد تجاوزك نسبة ' + PASS_THRESHOLD + '%.';
          ex.style.display = 'block';
        }
        mountEl.querySelector('.quiz-next-btn').style.display = 'inline-block';
      });
    });
    mountEl.querySelector('.quiz-next-btn').addEventListener('click', ()=>{ idx++; renderQuestion(); });
  }

  function renderResult(){
    const pct = currentPercent();
    const wrongCount = total - correctSet.size;
    const passed = pct >= PASS_THRESHOLD;
    recordQuizAchievement(lesson.id, pct, wrongCount === 0);
    let tier = 'retry', emoji='🌱', title='لا بأس، البداية دائمًا هكذا!',
        msg = 'كل خبير كان مبتدئًا يومًا. راجع الدرس وحاول مجددًا، أنا واثق أنك ستتحسّن بسرعة 💛';
    if(pct >= 90){ tier='excellent'; emoji='🏆'; title='أداء استثنائي يا نجم! 🌟'; msg='لقد أتقنت هذا الدرس بامتياز! واصل بنفس الحماس 🚀'; }
    else if(pct >= 60){ tier='good'; emoji='💪'; title='أحسنت، نتيجة جيدة جدًا!'; msg='أنت قريب جدًا من الإتقان الكامل. راجع الأخطاء البسيطة 🌱'; }

    mountEl.innerHTML = `
      <div class="result-card ${tier}">        <div class="result-emoji">${emoji}</div>
        <div class="result-gauge" style="--pct:${pct}"><div class="rg-pct">${pct}%</div></div>
        <div class="result-title">${title}</div>
        <div class="result-msg">${msg}</div>
      </div>
      <div style="text-align:center; margin-top:14px;">
        ${wrongCount > 0
          ? `<button class="quiz-retry-btn">🔁 أعد الأسئلة الخاطئة فقط (${wrongCount})</button>
             <p style="font-size:11.5px;color:#5B6E62;margin-top:10px">أنت من يقرر: يمكنك التوقف الآن أو إعادة المحاولة لرفع نسبتك أكثر.</p>`
          : `<p style="font-weight:800;color:#3F6350">🎉 أجبتَ عن كل الأسئلة بشكل صحيح! أتممتَ هذا الاختبار بنسبة 100%.</p>`}
        ${passed ? `<button class="quiz-retry-btn" id="quizRevealBtn" style="margin-top:10px">📖 إظهار الإجابات الصحيحة والتفسير</button>` : ''}
      </div>
      <div id="quizReviewMount" style="margin-top:16px"></div>`;
    if(wrongCount > 0){
      mountEl.querySelector('.quiz-retry-btn').addEventListener('click', ()=>{
        roundQueue = order.filter(qi => !correctSet.has(qi));
        idx = 0;
        renderQuestion();
      });
    }
    if(passed){
      document.getElementById('quizRevealBtn').addEventListener('click', ()=>{
        const rev = document.getElementById('quizReviewMount');
        rev.innerHTML = order.map(qi=>{
          const item = lesson.mcq[qi];
          return `<div class="quiz-card" style="margin-bottom:10px">
            <div class="quiz-q">${item.q}</div>
            <div style="font-weight:800;color:#3F6350;margin:8px 0">✅ الإجابة الصحيحة: ${item.options[item.correct]}</div>
            <div class="quiz-explain" style="display:block">${item.explain||''}</div>
          </div>`;
        }).join('');
      });
    }
  }

  renderQuestion();
}

/* =========================================================================================
   محرك «إعراب الجمل» الشفهي (يُستخدم مع EXAM_FULL و EXAM_FULL2)
   ========================================================================================= */
const AR_STOPWORDS = new Set(['جمله','في','محل','ل','و','او','أو','هذا','هذه','ذلك','التي','الذي','لام','من']);
function extractCoreTerms(answerText){
  const plain = answerText.replace(/<[^>]+>/g,'');
  const norm = normalizeAr(plain);
  const seen = new Set();
  norm.split(' ').forEach(tok=>{ if(tok.length>=2 && !AR_STOPWORDS.has(tok)) seen.add(tok); });
  return Array.from(seen);
}
function gradeExamAnswer(transcript, item){
  const norm = normalizeAr(transcript);
  if(!norm) return false;
  const given = new Set(norm.split(' ').filter(Boolean));
  if(item.core.length === 0) return false;
  let hits = 0; item.core.forEach(t=>{ if(given.has(t)) hits++; });
  return (hits/item.core.length) >= 0.6;
}

function createIrabEngine(data, mountEl, titleText){
  data.forEach(item=>{ if(!item.core) item.core = extractCoreTerms(item.a); });
  let order = shuffleArr(data.map((_,i)=>i));
  let index = 0, score = 0, wrong = 0;
  const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  function render(){
    const item = data[order[index]];
    mountEl.innerHTML = `
      <div class="irab-progress">${titleText} — السؤال ${index+1} من ${data.length} &nbsp;|&nbsp; ✅ ${score} ❌ ${wrong}</div>
      <div class="exam-full-card">
        <div class="efc-tag">${item.tag}</div>
        <div class="efc-question">${item.q}</div>
        <div class="efc-heard" id="irabHeard"></div>
        <div class="efc-verdict" id="irabVerdict"></div>
        <div class="efc-answer" id="irabAnswer"><b>الإجابة الصحيحة:</b> ${item.a}</div>
      </div>
      <div class="exam-full-controls">
        ${SRClass ? `<button class="efc-mic-btn" id="irabMic">🎙️ سجّل إجابتك الآن</button>`
                  : `<div class="efc-no-mic show">⚠️ متصفحك لا يدعم التعرّف على الصوت. جرّب Chrome.</div>`}
        <div class="exam-full-nav"><button class="efc-next-btn" id="irabNext">السؤال التالي ←</button></div>
      </div>`;
    if(SRClass){
      document.getElementById('irabMic').addEventListener('click', ()=>{
        const micBtn = document.getElementById('irabMic');
        if(micBtn.classList.contains('recording')) return;
        const recognition = new SRClass();
        recognition.lang = 'ar-SA'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        micBtn.classList.add('recording'); micBtn.textContent = '🔴 يستمع الآن...';
        recognition.onresult = (e)=>{
          const transcript = e.results[0][0].transcript;
          document.getElementById('irabHeard').textContent = `🗣️ سمعتُ: «${transcript}»`;
          document.getElementById('irabHeard').classList.add('show');
          const ok = gradeExamAnswer(transcript, item);
          if(ok) score++; else { wrong++; document.getElementById('irabAnswer').classList.add('show'); }
          const v = document.getElementById('irabVerdict');
          v.classList.add('show', ok?'ok':'no'); v.textContent = ok ? '✅ إجابة صحيحة' : '❌ إجابة غير دقيقة';
          document.getElementById('irabNext').classList.add('show');
          micBtn.style.display = 'none';
        };
        recognition.onerror = ()=>{ micBtn.classList.remove('recording'); micBtn.textContent = '🎙️ سجّل إجابتك الآن'; };
        recognition.onend = ()=>{ micBtn.classList.remove('recording'); micBtn.textContent = '🎙️ سجّل إجابتك الآن'; };
        recognition.start();
      });
    }
    document.getElementById('irabNext').addEventListener('click', ()=>{
      if(index < data.length-1){ index++; render(); } else { renderFinal(); }
    });
  }
  function renderFinal(){
    const pct = Math.round((score/data.length)*100);
    mountEl.innerHTML = `
      <div class="result-card ${pct>=80?'excellent':pct>=50?'good':'retry'}">
        <div class="result-emoji">${pct>=80?'🏆':pct>=50?'💪':'🌱'}</div>
        <div class="result-gauge" style="--pct:${pct}"><div class="rg-pct">${pct}%</div></div>
        <div class="result-title">انتهى الاختبار!</div>
        <div class="result-msg">✅ ${score} صحيحة &nbsp;|&nbsp; ❌ ${wrong} خاطئة من أصل ${data.length}</div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <button class="quiz-retry-btn" id="irabRestart">🔄 إعادة الاختبار</button>
      </div>`;
    document.getElementById('irabRestart').addEventListener('click', ()=>{
      order = shuffleArr(data.map((_,i)=>i)); index=0; score=0; wrong=0; render();
    });
  }
  render();
}

/* =========================================================================================
   التنقّل بين الشاشات وربط الواجهة (مبني على هيكل index.html)
   ========================================================================================= */
const Screens = {
  el: {}, // يُملأ عند التحميل بعناصر id لكل شاشة

  init(){
    ['home','lessons','lessonDetail','exams','irab','leaderboard','admin'].forEach(s=>{
      this.el[s] = document.getElementById('screen-'+s);
    });
    document.querySelectorAll('[data-nav]').forEach(btn=>{
      btn.addEventListener('click', ()=> this.show(btn.getAttribute('data-nav')));
    });
    document.getElementById('adminEntryBtn').addEventListener('click', ()=> this.openAdminLogin());
  },

  show(name){
    Object.values(this.el).forEach(e=>{ if(e) e.style.display = 'none'; });
    if(this.el[name]) this.el[name].style.display = 'block';
    window.scrollTo({top:0, behavior:'instant'});
    if(name === 'lessons') renderLessonsScreen();
    if(name === 'exams') renderExamsScreen();
    if(name === 'irab') renderIrabScreen();
    if(name === 'leaderboard') renderLeaderboardScreen();
  },

  openAdminLogin(){
    const modal = document.getElementById('adminLoginModal');
    modal.classList.add('show');
  }
};

/* ---------- الشاشة الرئيسية: رسالة الترحيب ---------- */
function renderWelcome(){
  const box = document.getElementById('welcomeBox');
  if(!box) return;
  if(Student.status === 'approved' && Student.fullName){
    box.innerHTML = `
      <div class="wb-mascot-wrap">${MASCOT_SVG}</div>
      <div class="wb-text">
        <div class="wb-greet">مرحبًا بعودتك</div>
        <div class="wb-name">أهلًا، <b>${Student.fullName}</b> ✨</div>
      </div>
      <button class="back-btn" id="studentLogoutBtn" style="flex-shrink:0">🚪 خروج</button>`;
    box.style.display = 'flex';
    document.getElementById('studentLogoutBtn').addEventListener('click', ()=>{
      if(!confirm('هل تريد تسجيل الخروج من المنصة؟')) return;
      Student.logout();
      location.reload();
    });
    renderBadges();
  } else {
    box.style.display = 'none';
  }
}

/* =========================================================================================
   شارات الإنجاز — مبنية على بيانات حقيقية (سلسلة الدخول من Firestore، بقية الشارات محليًا
   على جهاز التلميذ من نتائج اختبار الفهم، ونجم الأسبوع من ترتيب تمارين الدرس الفعلي)
   ========================================================================================= */
function getAchievements(){
  if(!Student.id) return { passed:[], perfect:false };
  return lsGet('achv_' + Student.id) || { passed:[], perfect:false };
}
function saveAchievements(a){
  if(!Student.id) return;
  lsSet('achv_' + Student.id, a);
}
/* تُستدعى من محرك اختبار الفهم عند كل نتيجة نهائية */
function recordQuizAchievement(lessonId, pct, isPerfect){
  if(!Student.id) return; // شارات الإنجاز تتطلب حسابًا مسجَّلًا لتُحفظ
  const a = getAchievements();
  if(pct >= 80 && !a.passed.includes(lessonId)) a.passed.push(lessonId);
  if(isPerfect) a.perfect = true;
  saveAchievements(a);
  renderBadges();
}

async function renderBadges(){
  if(Student.status !== 'approved' || !Student.id) return;
  const a = getAchievements();

  const streakEl = document.getElementById('badge-streak');
  if(streakEl){
    const active = Student.streak >= 1;
    streakEl.classList.toggle('active', active);
    let countEl = streakEl.querySelector('.st-count');
    if(active){
      if(!countEl){ countEl = document.createElement('div'); countEl.className = 'st-count'; streakEl.appendChild(countEl); }
      countEl.textContent = Student.streak;
    } else if(countEl){ countEl.remove(); }
  }
  const goalEl = document.getElementById('badge-goal');
  if(goalEl) goalEl.classList.toggle('active', a.passed.length >= 1);
  const fastEl = document.getElementById('badge-fast');
  if(fastEl) fastEl.classList.toggle('active', a.passed.length >= 3);
  const perfectEl = document.getElementById('badge-perfect');
  if(perfectEl) perfectEl.classList.toggle('active', !!a.perfect);

  /* نجم الأسبوع: تحقّق فعلي من التصدّر في ترتيب أي درس (يعتمد على وجود تمارين درس حقيقية) */
  const starEl = document.getElementById('badge-star');
  if(starEl && fbReady){
    const openLessons = window.LESSONS.filter(l=>l.locked!=='pending');
    for(const l of openLessons){
      try{
        const rows = await Leaderboard.forLesson(l.id);
        if(rows.length && rows[0].name === Student.fullName){
          starEl.classList.add('active');
          break;
        }
      }catch(e){}
    }
  }
}

/* ---------- تصنيفات الدروس (كما تصنيف الفهرس) ---------- */
const CATEGORY_META = {
  tawabi: { icon:'📗', title:'التوابع' },
  qawaid: { icon:'📘', title:'قواعد اللغة' },
  jumal:  { icon:'📙', title:'الجمل التي لها محلّ من الإعراب' },
  balagha:{ icon:'📕', title:'الظواهر البلاغية' }
};

function renderLessonsScreen(){
  const wrap = document.getElementById('lessonsListWrap');
  wrap.innerHTML = '<div class="sf-label">جاري التحميل…</div>';
  Locks.load().then(()=>{
    let html = '';
    ['tawabi','qawaid','jumal','balagha'].forEach(cat=>{
      const meta = CATEGORY_META[cat];
      const lessons = window.LESSONS.filter(l=>l.category===cat).sort((a,b)=>a.order-b.order);
      html += `<div class="group-header"><span class="gh-icon">${meta.icon}</span><span class="gh-title">${meta.title}</span><span class="gh-count">${lessons.length} دروس</span></div><div class="lesson-list">`;
      lessons.forEach(l=>{
        const pending = l.locked === 'pending';
        const locked = pending || Locks.isLessonLocked(l.id);
        html += `<div class="lesson-row ${locked?'locked':''} ${pending?'placeholder':''}" data-lesson="${l.id}">
          <div class="lr-num">${String(l.order).padStart(2,'0')}</div>
          <div class="lr-text">
            <div class="lr-title">${l.title}</div>
            <div class="lr-sub">${pending ? 'قريبًا — بانتظار المحتوى' : (l.subtitle||'')}</div>
          </div>
          <div class="lr-status">${pending ? '⏳' : (locked ? '🔒' : '✅')}</div>
        </div>`;
      });
      html += `</div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.lesson-row').forEach(row=>{
      row.addEventListener('click', ()=>{
        if(row.classList.contains('locked')) return;
        openLessonDetail(row.getAttribute('data-lesson'));
      });
    });
  });
}

function openLessonDetail(id){
  const lesson = window.LESSONS.find(l=>l.id===id);
  if(!lesson) return;
  Screens.show('lessonDetail');
  document.getElementById('ldTitle').textContent = lesson.title;
  document.getElementById('ldSubtitle').textContent = lesson.subtitle||'';
  document.getElementById('ldDef').innerHTML = lesson.def||'';
  const videos = Array.isArray(lesson.video) ? lesson.video : (lesson.video ? [lesson.video] : []);
  const videoFrame = document.getElementById('ldVideo');
  const listenWrap = videoFrame.closest('.listen-wrap');
  if(videos.length && videos[0] && videos[0].yt){
    videoFrame.src = `https://www.youtube.com/embed/${videos[0].yt}?rel=0`;
    if(listenWrap) listenWrap.style.display = '';
  } else {
    videoFrame.src = '';
    if(listenWrap) listenWrap.style.display = 'none';
  }
  renderMindmap(lesson, document.getElementById('ldMindmap'));

  const quizMount = document.getElementById('ldQuiz');
  document.getElementById('ldQuizStartBtn').onclick = ()=>{
    document.getElementById('ldQuizStartBtn').style.display='none';
    createQuizEngine(lesson, quizMount);
  };
  quizMount.innerHTML = '';
  document.getElementById('ldQuizStartBtn').style.display='inline-block';

  renderLessonExercisesBox(lesson);
}

/* ---------- صندوق "تمارين الدرس" — تحميل ديناميكي + محاولة واحدة + دخول الترتيب ---------- */
async function renderLessonExercisesBox(lesson){
  const box = document.getElementById('ldExercisesBox');
  box.innerHTML = '<div class="sf-label">جاري التحقق من التمارين…</div>';

  const data = await loadLessonExercise(lesson.id);
  if(!data){
    box.innerHTML = `
      <div class="one-attempt-warn">
        <div class="oaw-icon">⏳</div>
        <div>
          <div class="oaw-title">تمارين هذا الدرس غير متوفرة بعد</div>
          <div class="oaw-sub">سيقوم الأستاذ/المشرف بإضافتها قريبًا. عند توفرها ستكون محاولة واحدة فقط، وتُحسب النتيجة بالنسبة المئوية وتدخل الترتيب.</div>
        </div>
      </div>`;
    return;
  }

  const mine = await Leaderboard.mine(lesson.id);
  if(mine && typeof mine.percent === 'number'){
    const pct = mine.percent;
    const tier = pct>=90?'excellent':(pct>=60?'good':'retry');
    const emoji = pct>=90?'🏆':(pct>=60?'💪':'🌱');
    box.innerHTML = `
      <div class="result-card ${tier}">
        <div class="result-emoji">${emoji}</div>
        <div class="result-gauge" style="--pct:${pct}"><div class="rg-pct">${pct}%</div></div>
        <div class="result-title">لقد أتممتَ تمرين هذا الدرس</div>
        <div class="result-msg">هذه نتيجتك المسجّلة — محاولة واحدة فقط لكل تلميذ، ولا يمكن إعادتها.</div>
      </div>`;
    return;
  }

  /* صيغتان مدعومتان لملف التمارين:
     1) { questions:[...] }  → اختيار من متعدد (المحرك القديم createExerciseEngine)
     2) { sections:[...] }   → أسئلة مفتوحة مختلطة (أكمل الفراغ/الإعراب/المعنى/الجملة/الاستخراج) */
  const units = Array.isArray(data.questions) ? null : buildExerciseUnits(data);
  const count = units ? units.length : data.questions.length;

  box.innerHTML = `
    <div class="one-attempt-warn">
      <div class="oaw-icon">⚠️</div>
      <div>
        <div class="oaw-title">محاولة واحدة فقط</div>
        <div class="oaw-sub">عدد الأسئلة: ${count}. لا يمكنك إعادة هذا التمرين بعد إرساله، وتُحسب نتيجتك بالنسبة المئوية وتدخل ترتيب هذا الدرس.</div>
      </div>
    </div>
    <button class="install-btn" id="ldExerciseStartBtn" style="margin-top:12px">▶️ ابدأ التمرين</button>
    <div id="ldExerciseMount" style="margin-top:14px"></div>`;

  document.getElementById('ldExerciseStartBtn').addEventListener('click', ()=>{
    document.getElementById('ldExerciseStartBtn').style.display = 'none';
    const mount = document.getElementById('ldExerciseMount');
    if(units) createOpenExerciseEngine(lesson, units, mount);
    else createExerciseEngine(lesson, data.questions, mount);
  });
}

/* ---------- محرك «تمارين الدرس» — اختيار من متعدد، محاولة واحدة، يُسجَّل في الترتيب ---------- */
function createExerciseEngine(lesson, questions, mountEl){
  const total = questions.length;
  const order = shuffleArr(questions.map((_,i)=>i));
  let idx = 0, correctCount = 0;

  function renderQuestion(){
    const qIndex = order[idx];
    const item = questions[qIndex];
    const opts = item.options.map((opt,oi)=>`<button class="mcq-btn" data-oi="${oi}">${opt}</button>`).join('');
    mountEl.innerHTML = `
      <div class="quiz-progress">سؤال ${idx+1} من ${total}</div>
      <div class="quiz-card">
        <div class="quiz-q">${item.q}</div>
        <div class="quiz-opts">${opts}</div>
        <div class="quiz-explain" style="display:none"></div>
        <button class="quiz-next-btn" style="display:none">${idx+1<total ? 'التالي ←' : 'إنهاء وإرسال ✅'}</button>
      </div>`;
    const btns = Array.from(mountEl.querySelectorAll('.mcq-btn'));
    btns.forEach(b=>{
      b.addEventListener('click', ()=>{
        btns.forEach(x=>x.disabled = true);
        const oi = parseInt(b.getAttribute('data-oi'));
        const ok = oi === item.correct;
        if(ok){ b.classList.add('correct'); correctCount++; }
        else {
          b.classList.add('wrong');
          if(btns[item.correct]) btns[item.correct].classList.add('correct');
          const ex = mountEl.querySelector('.quiz-explain');
          if(item.explain){ ex.innerHTML = item.explain; ex.style.display = 'block'; }
        }
        mountEl.querySelector('.quiz-next-btn').style.display = 'inline-block';
      });
    });
    mountEl.querySelector('.quiz-next-btn').addEventListener('click', ()=>{
      idx++;
      if(idx >= total) finishExercise(lesson, mountEl, Math.round((correctCount/total)*100));
      else renderQuestion();
    });
  }

  renderQuestion();
}

/* ---------- تطبيع ومطابقة النصوص العربية (تسامح في الصياغة، مثل صفحة التمارين الأصلية) ---------- */
/* ---------- التسجيل الصوتي لحقول الإجابة النصية (Web Speech API) ---------- */
const QuizSpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
function attachQuizMic(btn, targetEl){
  if(!btn || !targetEl) return;
  if(!QuizSpeechRec){ btn.disabled = true; btn.title = 'التعرف الصوتي غير مدعوم على هذا الجهاز'; return; }
  btn.addEventListener('click', ()=>{
    const rec = new QuizSpeechRec();
    rec.lang = 'ar-SA'; rec.interimResults = false; rec.maxAlternatives = 1;
    btn.classList.add('listening');
    try{ rec.start(); }catch(e){ btn.classList.remove('listening'); return; }
    rec.onresult = (e)=>{ targetEl.value = e.results[0][0].transcript; };
    rec.onend = ()=> btn.classList.remove('listening');
    rec.onerror = ()=> btn.classList.remove('listening');
  });
}

function normalizeArabic(s){
  return (s||'')
    .replace(/[\u064B-\u0652\u0670\u0640]/g,'')
    .replace(/[إأآا]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/[^\u0600-\u06FF\s]/g,'').trim().replace(/\s+/g,' ');
}
function wordOverlapRatioAr(a,b){
  const wa = normalizeArabic(a).split(' ').filter(Boolean);
  const wb = normalizeArabic(b).split(' ').filter(Boolean);
  if(!wa.length || !wb.length) return 0;
  const setB = new Set(wb);
  let common = 0;
  wa.forEach(w=>{ if(setB.has(w)) common++; });
  return common / Math.max(wa.length, wb.length);
}
function isMatchAr(user, model, loose){
  const nu = normalizeArabic(user), nm = normalizeArabic(model);
  if(!nu) return false;
  if(nu === nm) return true;
  return wordOverlapRatioAr(nu, nm) >= (loose ? 0.4 : 0.7);
}
function containsWordAr(user, word){
  const nu = normalizeArabic(user), nw = normalizeArabic(word);
  return nu.split(' ').includes(nw);
}

/* ---------- تحويل أقسام ملف التمارين (sections) إلى قائمة أسئلة مسطّحة ---------- */
function buildExerciseUnits(data){
  const units = [];
  (data.sections||[]).forEach(sec=>{
    if(sec.type === 'extract'){
      units.push({
        type:'extract', sectionTitle:sec.title, instruction:sec.instructions,
        sourceText:sec.sourceText, pairs:sec.pairs||[], passRatio: sec.passRatio || 0.6
      });
    } else {
      (sec.items||[]).forEach(it=>{
        units.push(Object.assign({ type:sec.type, sectionTitle:sec.title, instruction:sec.instructions }, it));
      });
    }
  });
  return units;
}

/* ---------- محرك «تمارين الدرس» — أسئلة مفتوحة مختلطة (أكمل الفراغ/الإعراب/المعنى/الجملة/الاستخراج) ---------- */
function createOpenExerciseEngine(lesson, units, mountEl){
  const total = units.length;
  let idx = 0, scoreSum = 0;

  function header(sectionTitle){
    return `<div class="quiz-progress">${sectionTitle ? sectionTitle+' — ' : ''}سؤال ${idx+1} من ${total}</div>`;
  }

  function renderUnit(){
    const u = units[idx];
    if(u.type === 'extract') return renderExtractUnit(u);
    return renderSimpleUnit(u);
  }

  function renderSimpleUnit(u){
    let label = '', inputTag = '', checkLabel = 'تحقق';
    if(u.type === 'fill'){
      label = `<div class="quiz-fill-sentence">${u.before||''}<span class="blank"></span>${u.after||''}</div>`;
      inputTag = `<input type="text" class="quiz-text-input" placeholder="اكتب إجابتك هنا">`;
    } else if(u.type === 'irab'){
      label = `<div class="quiz-term-label">${u.word||''}</div><div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px">أعرب هذه الكلمة</div>`;
      inputTag = `<textarea class="quiz-textarea" placeholder="اكتب الإعراب هنا"></textarea>`;
    } else if(u.type === 'term'){
      label = `<div class="quiz-term-label">${u.term||''}</div><div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px">ما المعنى الذي يفيده هذا الحرف؟</div>`;
      inputTag = `<input type="text" class="quiz-text-input" placeholder="اكتب المعنى هنا">`;
    } else if(u.type === 'sentence'){
      label = `<div class="quiz-term-label">${u.term||''}</div><div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px">وظّف هذا الحرف في جملة من إنشائك</div>`;
      inputTag = `<input type="text" class="quiz-text-input" placeholder="اكتب جملتك هنا">`;
    }
    mountEl.innerHTML = `
      ${header(u.sectionTitle)}
      <div class="quiz-card">
        ${u.instruction ? `<div class="quiz-q" style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:14px">${u.instruction}</div>` : ''}
        ${label}
        <div class="quiz-answer-row">
          ${inputTag}
          <button type="button" class="quiz-mic-btn" id="unitMicBtn" title="سجّل صوتيًا">🎤</button>
        </div>
        <div style="text-align:center">
          <button class="quiz-check-btn" id="unitCheckBtn">${checkLabel}</button>
        </div>
        <div class="quiz-explain" style="display:none"></div>
        <button class="quiz-next-btn" style="display:none">${idx+1<total ? 'التالي ←' : 'إنهاء وإرسال ✅'}</button>
      </div>`;

    attachQuizMic(document.getElementById('unitMicBtn'), mountEl.querySelector('.quiz-text-input, .quiz-textarea'));

    document.getElementById('unitCheckBtn').addEventListener('click', ()=>{
      const inputEl = mountEl.querySelector('.quiz-text-input, .quiz-textarea');
      const val = inputEl.value;
      let ok = false, note = '';
      if(u.type === 'sentence'){
        ok = containsWordAr(val, u.term) && normalizeArabic(val).split(' ').filter(Boolean).length >= 4;
        note = ok ? '✓ وظّفتَ الحرف في جملة مقبولة' : '✗ تأكد أن جملتك تحتوي الحرف وتكون جملة كاملة';
      } else {
        ok = isMatchAr(val, u.answer, true);
        note = ok ? '✓ إجابة صحيحة' : '✗ إجابة غير مطابقة';
      }
      scoreSum += ok ? 1 : 0;
      inputEl.disabled = true;
      document.getElementById('unitCheckBtn').disabled = true;
      const ex = mountEl.querySelector('.quiz-explain');
      const modelLine = (u.type !== 'sentence' && u.answer) ? `<div class="quiz-model-answer">الحل النموذجي: ${u.answer}</div>` : '';
      ex.innerHTML = `<b style="color:${ok?'var(--sage-deep)':'#C94848'}">${note}</b>${modelLine}`;
      ex.style.display = 'block';
      mountEl.querySelector('.quiz-next-btn').style.display = 'inline-block';
    });
    mountEl.querySelector('.quiz-next-btn').addEventListener('click', ()=>{
      idx++;
      if(idx >= total) finish(); else renderUnit();
    });
  }

  function renderExtractUnit(u){
    let rowCount = 0;
    const rowsHtml = () => Array.from(mountEl.querySelectorAll('.extract-row')).length;
    mountEl.innerHTML = `
      ${header(u.sectionTitle)}
      <div class="quiz-card">
        ${u.instruction ? `<div class="quiz-q" style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">${u.instruction}</div>` : ''}
        <div class="extract-source">${u.sourceText||''}</div>
        <table class="extract-table">
          <thead><tr><th>المعطوف عليه</th><th>حرف العطف</th><th>المعطوف</th><th></th></tr></thead>
          <tbody id="extractRows"></tbody>
        </table>
        <button class="extract-add-btn" id="extractAddBtn" type="button">+ أضف حالة</button>
        <button class="quiz-check-btn" id="unitCheckBtn" type="button">تحقق وإنهاء هذا القسم</button>
        <div class="quiz-explain" style="display:none"></div>
        <button class="quiz-next-btn" style="display:none">${idx+1<total ? 'التالي ←' : 'إنهاء وإرسال ✅'}</button>
      </div>`;

    const tbody = document.getElementById('extractRows');
    function addRow(){
      const rid = rowCount++;
      const tr = document.createElement('tr');
      tr.className = 'extract-row';
      tr.dataset.rid = rid;
      tr.innerHTML = `
        <td><input type="text" data-f="before"></td>
        <td><input type="text" data-f="conj"></td>
        <td><input type="text" data-f="after"></td>
        <td><button type="button" class="extract-row-remove">✕</button></td>`;
      tr.querySelector('.extract-row-remove').addEventListener('click', ()=> tr.remove());
      tbody.appendChild(tr);
    }
    document.getElementById('extractAddBtn').addEventListener('click', addRow);
    for(let i=0;i<3;i++) addRow();

    document.getElementById('unitCheckBtn').addEventListener('click', ()=>{
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const usedModel = new Set();
      let matched = 0;
      rows.forEach(row=>{
        const before = row.querySelector('[data-f="before"]').value;
        const conj = row.querySelector('[data-f="conj"]').value;
        const after = row.querySelector('[data-f="after"]').value;
        if(!before && !conj && !after) return;
        let foundIdx = -1;
        u.pairs.forEach((m, mIdx)=>{
          if(foundIdx !== -1 || usedModel.has(mIdx)) return;
          if(isMatchAr(before, m.before, true) && isMatchAr(conj, m.conj, false) && isMatchAr(after, m.after, true)) foundIdx = mIdx;
        });
        if(foundIdx !== -1){ usedModel.add(foundIdx); matched++; row.style.color = 'var(--sage-deep)'; }
        else { row.style.color = '#C94848'; }
      });
      const ratio = u.pairs.length ? matched / u.pairs.length : 0;
      scoreSum += Math.min(1, ratio);
      Array.from(tbody.querySelectorAll('input')).forEach(i=> i.disabled = true);
      document.getElementById('extractAddBtn').disabled = true;
      document.getElementById('unitCheckBtn').disabled = true;
      const ex = mountEl.querySelector('.quiz-explain');
      ex.innerHTML = `<b>لقيت ${matched} حالة صحيحة من أصل ${u.pairs.length}.</b>
        <div class="quiz-model-answer">الحل النموذجي الكامل: ${u.pairs.map(p=>`(${p.before} ${p.conj} ${p.after})`).join('، ')}</div>`;
      ex.style.display = 'block';
      mountEl.querySelector('.quiz-next-btn').style.display = 'inline-block';
    });
    mountEl.querySelector('.quiz-next-btn').addEventListener('click', ()=>{
      idx++;
      if(idx >= total) finish(); else renderUnit();
    });
  }

  function finish(){
    const pct = Math.round((scoreSum/total)*100);
    finishExercise(lesson, mountEl, pct);
  }

  renderUnit();
}

/* ---------- إنهاء أي تمرين (اختيار من متعدد أو مفتوح): حفظ النتيجة النهائية في الترتيب ---------- */
async function finishExercise(lesson, mountEl, pct){
  mountEl.innerHTML = '<div class="sf-label">جاري حفظ نتيجتك…</div>';
  const res = await Leaderboard.submit(lesson.id, pct);
  let tier='retry', emoji='🌱', title='لا بأس، البداية دائمًا هكذا!',
      msg='راجع الدرس جيدًا. النتيجة سُجّلت في ترتيب هذا الدرس.';
  if(pct>=90){ tier='excellent'; emoji='🏆'; title='أداء استثنائي يا نجم! 🌟'; msg='لقد أتقنت هذا الدرس بامتياز!'; }
  else if(pct>=60){ tier='good'; emoji='💪'; title='أحسنت، نتيجة جيدة جدًا!'; msg='نتيجة جيدة! راجع الأخطاء البسيطة لاحقًا.'; }
  mountEl.innerHTML = `
    <div class="result-card ${tier}">
      <div class="result-emoji">${emoji}</div>
      <div class="result-gauge" style="--pct:${pct}"><div class="rg-pct">${pct}%</div></div>
      <div class="result-title">${title}</div>
      <div class="result-msg">${msg}</div>
    </div>
    ${res && res.ok
      ? '<p style="text-align:center;font-weight:800;color:#3F6350;margin-top:10px">✅ تم تسجيل نتيجتك في ترتيب هذا الدرس.</p>'
      : '<p style="text-align:center;font-weight:700;color:#c0392b;margin-top:10px">⚠️ تعذّر حفظ نتيجتك في قاعدة البيانات (تحقق من الاتصال). راجع الأستاذ إن استمرت المشكلة.</p>'}`;
}

/* ---------- الخريطة الذهنية ---------- */
function renderMindmap(lesson, wrap){
  if(!lesson.tree){ wrap.innerHTML=''; return; }
  wrap.innerHTML = lesson.tree.map(branch=>{
    const childrenHtml = (branch.children||[]).map(ch=>`
      <div class="mm-leaf">
        <span class="mm-leaf-title">${ch.title}</span>
        ${ch.rule?`<div class="mm-leaf-rule">${ch.rule}</div>`:''}
        ${ch.example?`<div class="mm-leaf-example">✏️ ${ch.example}</div>`:''}
      </div>`).join('');
    return `<details class="mm-branch c-${branch.color||'blue'}" open>
      <summary><span>${branch.title}</span><span class="chev">▾</span></summary>
      <div class="mm-branch-body">
        ${branch.rule?`<div class="mm-rule">${branch.rule}</div>`:''}
        ${branch.example?`<div class="mm-example">✏️ ${branch.example}</div>`:''}
        ${childrenHtml?`<div class="mm-children">${childrenHtml}</div>`:''}
      </div>
    </details>`;
  }).join('');
}

/* ---------- شاشة الفروض والاختبارات ---------- */
function renderExamsScreen(){
  Locks.load().then(()=>{
    const trimesters = [
      {key:'t1', icon:'📘', label:'الفصل الأول'},
      {key:'t2', icon:'📗', label:'الفصل الثاني'},
      {key:'t3', icon:'📙', label:'الفصل الثالث'}
    ];
    const tabsWrap = document.getElementById('examTabsWrap');
    tabsWrap.innerHTML = trimesters.map((t,i)=>{
      const open = Locks.isTrimesterOpen(t.key);
      return `<div class="exam-tab ${i===0?'active':''}" data-t="${t.key}"><span class="et-icon">${t.icon}</span>${t.label}<span class="lock-mini">${open?'🔓 مفتوح':'🔒 مغلق'}</span></div>`;
    }).join('');
    const panel = document.getElementById('examPanelWrap');
    function showPanel(t){
      const open = Locks.isTrimesterOpen(t);
      panel.innerHTML = open
        ? `<div class="exam-panel">📋 سيظهر هنا محتوى فروض واختبارات هذا الفصل عند رفعه من الأستاذ/المشرف.</div>`
        : `<div class="exam-panel"><span class="lock-icon">🔒</span>سيُفتح هذا القسم من قبل الأستاذ أو المشرف في الوقت المناسب</div>`;
    }
    tabsWrap.querySelectorAll('.exam-tab').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        tabsWrap.querySelectorAll('.exam-tab').forEach(x=>x.classList.remove('active'));
        tab.classList.add('active'); showPanel(tab.getAttribute('data-t'));
      });
    });
    showPanel('t1');
  });
}

/* ---------- شاشة إعراب الجمل ---------- */
function renderIrabScreen(){
  const wrap = document.getElementById('irabContentWrap');
  wrap.innerHTML = `
    <div class="irab-launch" id="irabLaunch1"><div class="il-icon">📗</div><div>
      <div class="il-title">إعراب 101 جملة وجملة</div>
      <div class="il-sub">أجب شفهيًا عن كل جملة، وسأتحقق تلقائيًا من إعرابك</div></div></div>
    <div class="irab-launch" id="irabLaunch2"><div class="il-icon">📙</div><div>
      <div class="il-title">الاختبار الشامل الثاني</div>
      <div class="il-sub">تدريبات إضافية على الجمل التي لها محلّ من الإعراب</div></div></div>
    <div id="irabEngineMount"></div>`;
  document.getElementById('irabLaunch1').addEventListener('click', ()=>{
    createIrabEngine(window.EXAM_FULL2, document.getElementById('irabEngineMount'), 'إعراب 101 جملة');
  });
  document.getElementById('irabLaunch2').addEventListener('click', ()=>{
    createIrabEngine(window.EXAM_FULL, document.getElementById('irabEngineMount'), 'الاختبار الشامل');
  });
}

/* ---------- شاشة الترتيب العام ---------- */
function renderLeaderboardScreen(){
  const wrap = document.getElementById('leaderboardWrap');
  wrap.innerHTML = `<div class="sf-label">اختر درسًا لعرض ترتيب تمارينه (تظهر القوائم فور توفر تمارين الدرس)</div>`;
  const sel = document.createElement('div');
  sel.className = 'lesson-list';
  window.LESSONS.filter(l=>l.locked!=='pending').forEach(l=>{
    const row = document.createElement('div');
    row.className = 'lesson-row';
    row.innerHTML = `<div class="lr-num">${String(l.order).padStart(2,'0')}</div>
      <div class="lr-text"><div class="lr-title">${l.title}</div></div><div class="lr-status">🏆</div>`;
    row.addEventListener('click', async ()=>{
      const listWrap = document.getElementById('leaderboardListMount');
      listWrap.innerHTML = '<div class="sf-label">جاري التحميل…</div>';
      const rows = await Leaderboard.forLesson(l.id);
      if(!rows.length){ listWrap.innerHTML = '<div class="exam-panel">لا توجد نتائج بعد لتمارين هذا الدرس.</div>'; return; }
      listWrap.innerHTML = `<div class="lb-list">` + rows.map((r,i)=>{
        const cls = i===0?'top1':i===1?'top2':i===2?'top3':'';
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
        return `<div class="lb-row ${cls}"><div class="lb-rank">${medal}</div><div class="lb-name">${r.name}</div><div class="lb-pct">${r.percent}%</div></div>`;
      }).join('') + `</div>`;
    });
    sel.appendChild(row);
  });
  wrap.appendChild(sel);
  const listMount = document.createElement('div');
  listMount.id = 'leaderboardListMount'; listMount.style.marginTop = '16px';
  wrap.appendChild(listMount);
}

/* ---------- موسكوت SVG (نفس تصميم المعاينة) ---------- */
const MASCOT_SVG = `<svg class="mascot" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="58" rx="34" ry="30" fill="#F3ECD5" stroke="#A97F2A" stroke-width="2.2"/>
  <path d="M20 40 Q50 8 80 40 Q68 30 50 30 Q32 30 20 40Z" fill="#3F6350" stroke="#A97F2A" stroke-width="2"/>
  <rect x="42" y="14" width="16" height="6" rx="1" fill="#22352B"/><circle cx="58" cy="16" r="2.2" fill="#D8AE52"/>
  <circle cx="36" cy="55" r="12" fill="#FFFDF7" stroke="#A97F2A" stroke-width="2"/>
  <circle cx="64" cy="55" r="12" fill="#FFFDF7" stroke="#A97F2A" stroke-width="2"/>
  <circle cx="37" cy="56" r="4.6" fill="#22352B"/><circle cx="63" cy="56" r="4.6" fill="#22352B"/>
  <circle cx="38.5" cy="54" r="1.4" fill="#FFFDF7"/><circle cx="64.5" cy="54" r="1.4" fill="#FFFDF7"/>
  <path d="M46 68 L50 74 L54 68Z" fill="#D8AE52"/>
  <path d="M18 68 Q10 66 14 78 Q22 76 24 70Z" fill="#F3ECD5" stroke="#A97F2A" stroke-width="1.6"/>
  <path d="M82 68 Q90 66 86 78 Q78 76 76 70Z" fill="#F3ECD5" stroke="#A97F2A" stroke-width="1.6"/>
</svg>`;

/* =========================================================================================
   لوحة تحكم الأستاذ/المشرف
   ========================================================================================= */
function setupAdminLoginModal(){
  const modal = document.getElementById('adminLoginModal');
  const input = document.getElementById('adminPinInput');
  document.getElementById('adminPinSubmit').addEventListener('click', ()=>{
    if(Admin.checkPin(input.value.trim())){
      modal.classList.remove('show'); input.value='';
      /* إخفاء نافذة تسجيل دخول التلميذ إن كانت ظاهرة، فهي تحجب لوحة تحكم الأستاذ/المشرف */
      document.getElementById('loginModal').classList.remove('show');
      Screens.show('admin'); renderAdminPanel();
    } else {
      alert('الرقم السري غير صحيح.');
    }
  });
  document.getElementById('adminLoginClose').addEventListener('click', ()=> modal.classList.remove('show'));
}

async function renderAdminPanel(){
  const wrap = document.getElementById('adminWrap');
  wrap.innerHTML = '<div class="sf-label">جاري التحميل…</div>';
  await Locks.load();
  const pending = await Admin.listPending();
  const totalStudents = await Admin.allStudentsCount();

  let html = `<div class="section-title"><span>طلبات الانتظار (${pending.length})</span><div class="line"></div></div>`;
  if(!pending.length){
    html += `<div class="exam-panel">لا توجد طلبات تسجيل قيد الانتظار حاليًا.</div>`;
  } else {
    html += pending.map(p=>`
      <div class="stat-card" style="text-align:center">
        <div class="sc-title" style="margin-bottom:10px">${p.fullName}</div>
        ${p.receiptImage
          ? `<img src="${p.receiptImage}" alt="وصل الدفع" style="max-width:100%;max-height:260px;border-radius:12px;border:1.4px solid var(--gold-3);margin-bottom:10px">`
          : `<div class="exam-panel" style="margin-bottom:10px">⚠️ لا توجد صورة وصل مرفَقة</div>`}
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="al-key" style="width:auto;padding:8px 20px" data-approve="${p.id}">✅ قبول</button>
          <button class="al-key" style="width:auto;padding:8px 20px" data-reject="${p.id}">❌ رفض</button>
        </div>
      </div>`).join('');
  }

  html += `<div class="section-title" style="margin-top:22px"><span>التلاميذ المقبولون</span><div class="line"></div></div>`;
  html += `<button class="al-key" id="toggleApprovedBtn" style="width:100%">👥 عدد التلاميذ المقبولين: ${totalStudents} — اضغط لعرض الأسماء والمستوى</button>`;
  html += `<div id="approvedListContainer" style="display:none;margin-top:12px"></div>`;

  html += `<div class="section-title" style="margin-top:22px"><span>فتح/إغلاق الدروس</span><div class="line"></div></div><div class="lesson-list">`;
  window.LESSONS.forEach(l=>{
    const pendingLesson = l.locked === 'pending';
    const open = !pendingLesson && !Locks.isLessonLocked(l.id);
    html += `<div class="lesson-row ${pendingLesson?'placeholder':''}">
      <div class="lr-num">${String(l.order).padStart(2,'0')}</div>
      <div class="lr-text"><div class="lr-title">${l.title}</div></div>
      ${pendingLesson
        ? `<div class="lr-status">⏳ بلا محتوى بعد</div>`
        : `<button class="al-key" style="width:auto;padding:6px 14px" data-toggle-lesson="${l.id}">${open?'🔓 مفتوح — اضغط للإغلاق':'🔒 مغلق — اضغط للفتح'}</button>`}
    </div>`;
  });
  html += `</div>`;

  html += `<div class="section-title" style="margin-top:22px"><span>فتح/إغلاق الفروض والاختبارات</span><div class="line"></div></div><div class="lesson-list">`;
  [{k:'t1',l:'الفصل الأول'},{k:'t2',l:'الفصل الثاني'},{k:'t3',l:'الفصل الثالث'}].forEach(t=>{
    const open = Locks.isTrimesterOpen(t.k);
    html += `<div class="lesson-row"><div class="lr-text"><div class="lr-title">${t.l}</div></div>
      <button class="al-key" style="width:auto;padding:6px 14px" data-toggle-trimester="${t.k}">${open?'🔓 مفتوح — اضغط للإغلاق':'🔒 مغلق — اضغط للفتح'}</button></div>`;
  });
  html += `</div>`;

  html += `<div class="section-title" style="margin-top:22px"><span>إحصائيات كل درس</span><div class="line"></div></div><div id="adminStatsMount"></div>`;

  wrap.innerHTML = html;

  const toggleBtn = document.getElementById('toggleApprovedBtn');
  const listContainer = document.getElementById('approvedListContainer');
  let approvedLoaded = false;
  toggleBtn.addEventListener('click', async ()=>{
    const showing = listContainer.style.display !== 'none';
    if(showing){ listContainer.style.display = 'none'; return; }
    listContainer.style.display = 'block';
    if(approvedLoaded) return;
    approvedLoaded = true;
    listContainer.innerHTML = `
      <input type="text" id="studentSearchInput" placeholder="🔎 ابحث عن تلميذ بالاسم..." style="width:100%;padding:10px 14px;border-radius:11px;border:1.4px solid #A97F2A;font-family:'Cairo';font-size:13px;margin-bottom:12px;background:#FFFDF7;color:#22352B">
      <div class="lesson-list" id="approvedListRows"></div>`;
    const rowsWrap = document.getElementById('approvedListRows');
    const students = await Admin.listApprovedFull();
    if(!students.length){ rowsWrap.innerHTML = `<div class="exam-panel">لا يوجد بعد أي تلميذ مقبول.</div>`; return; }
    rowsWrap.innerHTML = students.map((s,i)=>`
      <div class="lesson-row" data-student-name="${s.fullName}">
        <div class="lr-num">${i+1}</div>
        <div class="lr-text"><div class="lr-title">${s.fullName}</div></div>
        <div class="lr-status" id="perf-${s.id}" style="font-size:11px;font-weight:800;color:#5B6E62">…</div>
      </div>`).join('');
    document.getElementById('studentSearchInput').addEventListener('input', (e)=>{
      const q = normalizeAr(e.target.value);
      rowsWrap.querySelectorAll('[data-student-name]').forEach(row=>{
        const name = normalizeAr(row.getAttribute('data-student-name'));
        row.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
      });
    });
    /* حساب مستوى كل تلميذ في التمارين تدريجيًا (بلا حجب الواجهة) */
    students.forEach(async (s)=>{
      const avg = await Admin.studentAverage(s.id);
      const el = document.getElementById('perf-'+s.id);
      if(el) el.textContent = (avg === null) ? 'لم يشارك بعد' : ('مستواه: ' + avg + '%');
    });
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', ()=>{
    if(!confirm('هل تريد تسجيل الخروج من لوحة التحكم؟')) return;
    Admin.authed = false;
    Screens.show('home');
  });

  wrap.querySelectorAll('[data-approve]').forEach(b=> b.addEventListener('click', async ()=>{ await Admin.approve(b.getAttribute('data-approve')); renderAdminPanel(); }));
  wrap.querySelectorAll('[data-reject]').forEach(b=> b.addEventListener('click', async ()=>{ await Admin.reject(b.getAttribute('data-reject')); renderAdminPanel(); }));
  wrap.querySelectorAll('[data-toggle-lesson]').forEach(b=> b.addEventListener('click', async ()=>{
    const id = b.getAttribute('data-toggle-lesson');
    const open = !Locks.isLessonLocked(id);
    
    /* الحصول على عنوان الدرس */
    const lesson = window.LESSONS.find(l => l.id === id);
    const lessonTitle = lesson ? lesson.title : 'درس جديد';
    
    /* فتح أو إغلاق الدرس مع الإشعار */
    if(!open && typeof LocksEnhanced !== 'undefined' && LocksEnhanced.setLessonWithNotification){
      await LocksEnhanced.setLessonWithNotification(id, true, lessonTitle);
    } else {
      try{
        await Locks.setLesson(id, !open);
      }catch(error){
        console.error('فشل إغلاق الدرس (تحقق من قواعد Firestore لمجموعة state):', error);
        if(typeof showFbPermissionNotice === 'function') showFbPermissionNotice('locks');
        alert('تعذّر حفظ حالة الدرس في قاعدة البيانات. راجع التنبيه الظاهر أعلى الصفحة.');
      }
    }
    
    renderAdminPanel();
  }));
  wrap.querySelectorAll('[data-toggle-trimester]').forEach(b=> b.addEventListener('click', async ()=>{
    const k = b.getAttribute('data-toggle-trimester');
    const open = Locks.isTrimesterOpen(k);
    await Locks.setTrimester(k, !open);
    renderAdminPanel();
  }));

  const statsMount = document.getElementById('adminStatsMount');
  for(const l of window.LESSONS){
    if(l.locked==='pending') continue;
    const st = await Admin.lessonStats(l.id, totalStudents);
    const pctParticipation = totalStudents ? Math.round((st.participants/totalStudents)*100) : 0;
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="sc-head"><div class="sc-num">${String(l.order).padStart(2,'0')}</div><div class="sc-title">${l.title}</div></div>
      <div class="stat-row">
        <div class="stat-box"><div class="sb-value">${st.participants}</div><div class="sb-label">مشارك من ${st.total}</div></div>
        <div class="stat-box"><div class="sb-value">${pctParticipation}%</div><div class="sb-label">نسبة المشاركة</div></div>
        <div class="stat-box"><div class="sb-value">${st.avg}%</div><div class="sb-label">متوسط التقدّم</div></div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${st.avg}%"></div></div>`;
    statsMount.appendChild(card);
  }
}

/* =========================================================================================
   الإقلاع
   ========================================================================================= */
document.addEventListener('DOMContentLoaded', async ()=>{
  Screens.init();
  setupAdminLoginModal();

  if(!fbReady){
    document.getElementById('fbNotice').innerHTML = fbUnavailableNotice();
  }

  Locks.listen(()=>{ if(document.getElementById('screen-lessons').style.display !== 'none') renderLessonsScreen(); });

  const resumed = await Student.resume();
  if(resumed){ renderWelcome(); }

  document.getElementById('loginSubmitBtn').addEventListener('click', async ()=>{
    const firstName = document.getElementById('loginFirstNameInput').value.trim();
    const lastName = document.getElementById('loginLastNameInput').value.trim();
    if(!firstName || !lastName){ alert('يرجى كتابة الاسم واللقب في الخانتين.'); return; }
    const name = firstName + ' ' + lastName;
    const btn = document.getElementById('loginSubmitBtn');
    const msgBox = document.getElementById('loginMsg');
    const receiptFile = document.getElementById('loginReceiptInput').files[0];

    btn.disabled = true; btn.textContent = 'جارٍ التحقق…';
    msgBox.textContent = '';

    let receiptDataUrl = null;
    if(receiptFile){
      try{ receiptDataUrl = await compressImageFile(receiptFile, 700); }
      catch(e){ /* تجاهل خطأ الضغط، سنعتمد على فحص لاحق */ }
    }

    const res = await Student.loginOrRegister(name, receiptDataUrl);
    btn.disabled = false; btn.textContent = 'دخول';

    if(!res.ok && res.reason === 'receipt-required'){
      msgBox.textContent = '📎 يرجى إرفاق صورة وصل الدفع عند أول تسجيل.';
      document.getElementById('receiptFieldWrap').style.display = 'block';
      return;
    }
    if(!res.ok){ msgBox.textContent = 'تعذّر الاتصال بالمنصة، تحقق من إعداد Firebase.'; return; }
    if(res.status === 'pending'){ msgBox.textContent = '⏳ طلبك قيد المراجعة، يرجى الانتظار حتى يوافق الأستاذ أو المشرف.'; return; }
    if(res.status === 'rejected'){ msgBox.textContent = '❌ لم تتم الموافقة على طلبك. تواصل مع الأستاذ لمزيد من التفاصيل.'; return; }
    document.getElementById('loginModal').classList.remove('show');
    renderWelcome();
  });

  /* معاينة صورة الوصل فور اختيارها + إخفاء حقل الرفع تلقائيًا إذا كان الاسم مسجَّلًا مسبقًا محليًا */
  document.getElementById('loginReceiptInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    const wrap = document.getElementById('receiptPreviewWrap');
    const img = document.getElementById('receiptPreviewImg');
    if(!file){ wrap.style.display = 'none'; return; }
    const reader = new FileReader();
    reader.onload = (ev)=>{ img.src = ev.target.result; wrap.style.display = 'block'; };
    reader.readAsDataURL(file);
  });
  if(lsGet('student_id')){
    /* هذا الجهاز فيه تسجيل سابق محفوظ محليًا: نُخفي حقل الوصل افتراضيًا لتبسيط التجربة،
       ويظهر تلقائيًا من جديد إن رجع الخادم برسالة "يلزم إرفاق الوصل" (تسجيل تلميذ آخر من نفس الجهاز) */
    document.getElementById('receiptFieldWrap').style.display = 'none';
  }

  if(Student.status !== 'approved'){
    document.getElementById('loginModal').classList.add('show');
  }

  Screens.show('home');
});

/* =========================================================================================
   PWA: تسجيل Service Worker وزر التثبيت
   ========================================================================================= */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      /* عند اكتشاف نسخة جديدة من الملفات على الخادم: نفعّلها فورًا ونُعيد تحميل الصفحة تلقائيًا،
         حتى لا يحتاج التلميذ أو الأستاذ أبدًا لحذف التطبيق أو مسح بياناته يدويًا */
      reg.addEventListener('updatefound', ()=>{
        const newWorker = reg.installing;
        if(!newWorker) return;
        newWorker.addEventListener('statechange', ()=>{
          if(newWorker.state === 'activated'){ location.reload(); }
        });
      });
      /* تحقق دوري من وجود تحديث كل مرة يُفتح فيها التطبيق */
      reg.update().catch(()=>{});
    }).catch(()=>{});
  });
  /* إن تغيّر الـ Service Worker المتحكّم (تحديث فعلي حدث)، أعد تحميل الصفحة مرة واحدة فقط */
  let reloadedOnce = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(reloadedOnce) return; reloadedOnce = true; location.reload();
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredInstallPrompt = e;
});
document.addEventListener('DOMContentLoaded', ()=>{
  /* تثبيت التطبيق */
  const btn = document.getElementById('pwaInstallBtn');
  if(btn) btn.addEventListener('click', async ()=>{
    if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; }
    else alert('لتثبيت التطبيق: افتح قائمة المتصفح واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
  });

  /* تهيئة الميزات الجديدة */
  if(typeof initWisdomBanner === 'function') setTimeout(initWisdomBanner, 500);
  if(typeof initNotificationsSystem === 'function') setTimeout(initNotificationsSystem, 500);
  if(typeof setupLessonLiveUpdates === 'function') setTimeout(setupLessonLiveUpdates, 500);

  /* تحديث لوحة التحكم لتشمل إدارة التلاميذ */
  const originalRenderAdminPanel = window.renderAdminPanel;
  if(typeof originalRenderAdminPanel === 'function'){
    window.renderAdminPanel = async function(){
      await originalRenderAdminPanel.call(this);
      if(typeof renderStudentManagementPanel === 'function'){
        setTimeout(() => renderStudentManagementPanel(), 300);
      }
    };
  }
});
