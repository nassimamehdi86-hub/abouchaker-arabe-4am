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

  /* محاولة الدخول أو التسجيل بالاسم واللقب — receiptDataUrl: صورة وصل مضغوطة (Base64)، فقط عند أول تسجيل (اختيارية الآن) */
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

    /* لا يوجد سجل سابق: إنشاء طلب جديد بحالة الانتظار */
    const newDoc = await col.add({
      fullName: fullName.trim(), nameKey:key, status:'pending',
      receiptImage: receiptDataUrl || null, /* صورة وصل اختيارية */
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
  data:{ lessons:{}, trimesters:{t1:false, t2:false, t3:false}, situations:{} }, ready:false,

  async load(){
    if(!fbReady) { this.ready = true; return; }
    try{
      const snap = await db.collection('state').doc('locks').get();
      if(snap.exists) this.data = Object.assign({lessons:{}, trimesters:{t1:false,t2:false,t3:false}, situations:{}}, snap.data());
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
  isSituationLocked(key){ return !this.data.situations || this.data.situations[key] !== true; }, // افتراضيًا مقفل حتى يُفتح صراحة

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
  async setSituation(key, open){
    if(!fbReady) return;
    this.data.situations = this.data.situations || {};
    this.data.situations[key] = !!open;
    await db.collection('state').doc('locks').set(this.data, {merge:true});
  },

  /* استماع لحظي للتغييرات حتى تنعكس فورًا عند كل التلاميذ */
  listen(onChange){
    if(!fbReady) return;
    db.collection('state').doc('locks').onSnapshot(snap=>{
      if(snap.exists) this.data = Object.assign({lessons:{}, trimesters:{t1:false,t2:false,t3:false}, situations:{}}, snap.data());
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
  },

  /* ---------- الترتيب الشامل (لوحة الشرف العامة) — مجموع نتائج كل تلميذ في تمارين الدروس المنجزة ----------
     يجمع نتائج كل تلميذ عبر جميع الدروس المتوفرة (وليس درسًا واحدًا فقط)، ويرتّبهم تنازليًا حسب
     مجموع نتائجهم الإجمالية. يُعاد أيضًا متوسط النسبة المئوية وعدد التمارين المنجزة لكل تلميذ. */
  async overallLessons(){
    if(!fbReady) return [];
    const lessons = window.LESSONS.filter(l=>l.locked!=='pending');
    const byStudent = new Map(); // studentId -> {name, total, count}
    for(const l of lessons){
      try{
        const snap = await db.collection('submissions').doc(l.id).collection('students').get();
        snap.forEach(doc=>{
          const data = doc.data();
          if(typeof data.percent !== 'number') return;
          const id = doc.id;
          const entry = byStudent.get(id) || { studentId:id, name:data.studentName || 'طالب غير معروف', total:0, count:0 };
          entry.total += data.percent;
          entry.count += 1;
          entry.name = data.studentName || entry.name;
          byStudent.set(id, entry);
        });
      }catch(e){}
    }
    const results = Array.from(byStudent.values()).map(e=>({
      studentId: e.studentId, name: e.name, totalScore: Math.round(e.total*10)/10,
      avgPercent: Math.round(e.total / e.count), exercisesCount: e.count
    }));
    /* الترتيب التنازلي حسب مجموع النتائج الإجمالية */
    results.sort((a,b)=> b.totalScore - a.totalScore);
    return results;
  },

  /* ---------- ترتيب الفروض والاختبارات — مجموع النقاط المتحصل عليها لكل تلميذ عبر كل الفروض/الاختبارات المنجزة ----------
     ملاحظة: تسليم الفروض/الاختبارات يتم بالاسم الكامل فقط (بدون حساب دخول)، لذا يتم تجميع النقاط
     حسب اسم التلميذ(ة) كما كتبه بنفسه عند التسليم. */
  async overallExams(){
    if(!fbReady) return [];
    const byStudent = new Map(); // normalizedName -> {name, total, count}
    try{
      const examsSnap = await db.collection('exams').get();
      for(const examDoc of examsSnap.docs){
        try{
          const subsSnap = await db.collection('exams').doc(examDoc.id).collection('submissions').get();
          subsSnap.forEach(doc=>{
            const data = doc.data();
            const name = (data.studentName || '').trim();
            if(!name || typeof data.score !== 'number') return;
            const key = name.toLowerCase();
            const entry = byStudent.get(key) || { name, total:0, count:0 };
            entry.total += data.score;
            entry.count += 1;
            byStudent.set(key, entry);
          });
        }catch(e){}
      }
    }catch(e){}
    const results = Array.from(byStudent.values()).map(e=>({
      name: e.name, totalPoints: Math.round(e.total*100)/100, examsCount: e.count
    }));
    /* الترتيب التنازلي حسب مجموع النقاط المتحصل عليها */
    results.sort((a,b)=> b.totalPoints - a.totalPoints);
    return results;
  }
};

/* =========================================================================================
   نافذة ترتيب الدرس (Leaderboard Popup)
   ========================================================================================= */
async function showLeaderboardPopup(lesson){
  if(!fbReady){
    alert('Firebase غير مفعّل. لا يمكن عرض الترتيب.');
    return;
  }
  
  /* إنشاء الـ overlay والـ popup */
  const overlay = document.createElement('div');
  overlay.className = 'leaderboard-overlay';
  
  const popup = document.createElement('div');
  popup.className = 'leaderboard-popup';
  
  /* الهيدر */
  const header = document.createElement('div');
  header.className = 'leaderboard-header';
  
  const title = document.createElement('div');
  title.className = 'leaderboard-title';
  title.textContent = `ترتيب درس: ${lesson.title}`;
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'leaderboard-close';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = ()=>overlay.remove();
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  /* قائمة النتائج */
  const listDiv = document.createElement('div');
  listDiv.className = 'leaderboard-list';
  listDiv.innerHTML = '<div class="leaderboard-empty">جاري تحميل النتائج…</div>';
  
  popup.appendChild(header);
  popup.appendChild(listDiv);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  /* جلب البيانات من Firebase */
  try{
    const submissionsRef = db.collection('submissions').doc(lesson.id).collection('students');
    const snap = await submissionsRef.get();
    
    if(snap.empty){
      listDiv.innerHTML = '<div class="leaderboard-empty">لا توجد نتائج بعد لهذا الدرس</div>';
      return;
    }
    
    const results = [];
    snap.forEach(doc=>{
      results.push({ ...doc.data(), studentId:doc.id });
    });
    
    /* ترتيب حسب النسبة المئوية تنازليًا */
    results.sort((a,b)=>(b.percent||0)-(a.percent||0));
    
    listDiv.innerHTML = '';
    results.forEach((res, idx)=>{
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      
      const rank = document.createElement('div');
      rank.className = 'leaderboard-rank';
      if(idx===0) rank.classList.add('first');
      else if(idx===1) rank.classList.add('second');
      else if(idx===2) rank.classList.add('third');
      rank.textContent = (idx+1);
      
      const info = document.createElement('div');
      info.className = 'leaderboard-info';
      
      const name = document.createElement('div');
      name.className = 'leaderboard-name';
      name.textContent = res.studentName || 'طالب غير معروف';
      
      const score = document.createElement('div');
      score.className = 'leaderboard-score';
      let dateLabel = 'غير محدد';
      if(res.submittedAt){
        const d = (typeof res.submittedAt.toDate === 'function') ? res.submittedAt.toDate() : new Date(res.submittedAt);
        if(d && !isNaN(d.getTime())) dateLabel = d.toLocaleDateString('ar-EG');
      }
      score.textContent = `تاريخ: ${dateLabel}`;
      
      info.appendChild(name);
      info.appendChild(score);
      
      const percent = document.createElement('div');
      percent.className = 'leaderboard-percent';
      percent.textContent = `${res.percent || 0}%`;
      
      item.appendChild(rank);
      item.appendChild(info);
      item.appendChild(percent);
      listDiv.appendChild(item);
    });
  }catch(e){
    console.error('Error loading leaderboard:', e);
    listDiv.innerHTML = '<div class="leaderboard-empty">خطأ في تحميل النتائج</div>';
  }
}

/* =========================================================================================
   تحميل تمارين الدروس — البيانات مضمّنة مباشرة في الكود (لا توجد ملفات خارجية)
   ========================================================================================= */
const LESSON_EXERCISES = {
  'atf-nasaq': {
    "lessonId": "atf-nasaq",
    "sections": [
      {
        "title": "١) أكمل الفراغات",
        "instructions": "أكمل الفراغات بما يناسبها.",
        "type": "fill",
        "items": [
          { "before": "العطف علاقة بين مفردتين، يفصل بينهما حرف من حروف", "after": ".", "answer": "العطف" },
          { "before": "يُسمى الأول", "after": ".", "answer": "المعطوف عليه" },
          { "before": "ويسمى الثاني", "after": ".", "answer": "المعطوف" },
          { "before": "العطف يكون بين", "after": ".", "answer": "اسم واسم، أو فعل وفعل، أو جملة وجملة" },
          { "before": "أهم حروف العطف هي:", "after": ".", "answer": "الواو، الفاء، ثمّ، أو، أم، بل، لا، حتى، لكن" }
        ]
      },
      {
        "title": "٢) استخرج من الفقرة",
        "instructions": "استخرج المعطوف والمعطوف عليه وحرف العطف ممّا يلي. اضغط «أضف حالة» كل ما لقيت حالة جديدة.",
        "type": "extract",
        "sourceText": "إنَّ الوعيَ بالذَّاتِ يستوجِبُ سَلامةَ القَلبِ مِنَ الأحقادِ والمشاعرِ الهدَّامةِ تُجاهَ الكائناتِ والكونِ بما فيهِ، وأنْ يكونَ ظاهرُكَ كباطِنِكَ، فلا تتظاهرْ بما ليسَ فيكَ فتُكشفَ، وتُقبُحَ صورتُكَ، ولا تتكلَّفْ بما لا تستطيعُ فتشعرَ بالقهرِ والضِّيقِ، وانبِذِ التَّعصُّبَ، وكُنْ منطقيًّا وعَقلانيًّا في إصدارِ أَحكامِكَ، واتِّخاذِ قراراتِكَ. عَليكَ أنْ تَعرِفَ أنَّه لا يُوجدُ شَخصٌ سيّئٌ مُطلقًا، أَو خَيرٌ مُطلقًا، ولكنَّنا جميعًا مَزيجٌ بينَ هذا وذاكَ. أطلِقِ العَنانَ لأفكارِكَ وآمالِكَ، ولا تَيأَسْ، ولا تَستَسلِمْ، ولا تَستَمِعْ إلى كلامِ المُثبِّطينَ. اعتَنِ بنفسِكَ، وكافِئْ ذاتَكَ، وآمِنْ أنَّكَ تَستَحِقُّ الكَثيرَ. لا تُضخِّمِ الأُمورَ، وضَعْها في مَكانِها المُناسِبِ. فأَنتَ بحاجةٍ حَتمًا إلى العِبادةِ والتَّأمُّلِ، وأَدرِكْ أنَّ مِفتاحَ الانسِجامِ الدَّاخليِّ هوَ في البَساطةِ وعَدمِ التَّكَلُّفِ.",
        "pairs": [
          { "before": "الأحقاد", "conj": "الواو", "after": "المشاعر" },
          { "before": "الكائنات", "conj": "الواو", "after": "الكون" },
          { "before": "تُكشَف", "conj": "الواو", "after": "تُقبَح" },
          { "before": "القهر", "conj": "الواو", "after": "الضيق" },
          { "before": "منطقيًا", "conj": "الواو", "after": "عقلانيًا" },
          { "before": "إصدار", "conj": "الواو", "after": "اتخاذ" },
          { "before": "سيئ", "conj": "أو", "after": "خير" },
          { "before": "هذا", "conj": "الواو", "after": "ذاك" },
          { "before": "تستسلم", "conj": "الواو", "after": "تيأس" },
          { "before": "تيأس", "conj": "الواو", "after": "تستمع" },
          { "before": "أفكارك", "conj": "الواو", "after": "آمالك" },
          { "before": "اعتن", "conj": "الواو", "after": "كافئ" },
          { "before": "كافئ", "conj": "الواو", "after": "آمن" },
          { "before": "تضخم", "conj": "الواو", "after": "ضعها" },
          { "before": "العبادة", "conj": "الواو", "after": "التأمل" },
          { "before": "البساطة", "conj": "الواو", "after": "التكلف" }
        ],
        "passRatio": 0.6
      },
      {
        "title": "٣) أعرب ما تحته خط",
        "instructions": "أعرب الكلمات التالية من الفقرة السابقة.",
        "type": "irab",
        "items": [
          { "word": "الأحقاد", "answer": "اسم مجرور بـ«من» وعلامة جره الكسرة الظاهرة على آخره." },
          { "word": "الواو", "answer": "حرف عطف مبني على الفتح لا محل له من الإعراب." },
          { "word": "المشاعر", "answer": "اسم معطوف مجرور وعلامة جره الكسرة الظاهرة على آخره." },
          { "word": "سيّئ", "answer": "نعت مرفوع وعلامة رفعه الضمة الظاهرة على آخره." }
        ]
      },
      {
        "title": "٤) حروف العطف ومعانيها",
        "instructions": "اكتب المعنى الذي يفيده كل حرف من حروف العطف.",
        "type": "term",
        "items": [
          { "term": "الواو", "answer": "تفيد الجمع والاشتراك المطلق بلا ترتيب" },
          { "term": "الفاء", "answer": "تفيد الترتيب مع التعقيب (بدون مهلة)" },
          { "term": "ثمّ", "answer": "تفيد الترتيب مع التراخي (مع مهلة)" },
          { "term": "أو", "answer": "تفيد التخيير أو الإباحة أو الشك" },
          { "term": "أم", "answer": "تفيد التعيين وتسبقها همزة الاستفهام غالبًا" },
          { "term": "بل", "answer": "تفيد الإضراب، أي العدول عن الأول إلى الثاني" },
          { "term": "لا", "answer": "تفيد نفي الحكم عن الثاني وإثباته للأول" },
          { "term": "لكن", "answer": "تفيد الاستدراك" },
          { "term": "حتى", "answer": "تفيد الغاية، أي انتهاء الحكم عندها" }
        ]
      },
      {
        "title": "٥) وظّف كل حرف في جملة",
        "instructions": "وظّف كل حرف من حروف العطف في جملة من إنشائك (لا يوجد جواب وحيد صحيح — يكفي أن تستعمل الحرف بشكل سليم ضمن جملة كاملة).",
        "type": "sentence",
        "items": [
          { "term": "الواو" },
          { "term": "الفاء" },
          { "term": "ثمّ" },
          { "term": "أو" },
          { "term": "أم" },
          { "term": "بل" },
          { "term": "لا" },
          { "term": "لكن" },
          { "term": "حتى" }
        ]
      }
    ]
  }
};

async function loadLessonExercise(lessonId){
  return LESSON_EXERCISES[lessonId] || null;
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
/* زر "🔑 دخول الأستاذ/المشرف" ظاهر دائمًا للجميع أعلى الصفحة؛ الحماية الفعلية تكون
   بالرمز السري (2580) عند فتح نافذة الدخول، سواء كان الجهاز قد استُعمل من قبل أم لا. */

const Screens = {
  el: {}, // يُملأ عند التحميل بعناصر id لكل شاشة

  init(){
    ['home','lessons','lessonDetail','exams','irab','situation','leaderboard','admin'].forEach(s=>{
      this.el[s] = document.getElementById('screen-'+s);
    });
    document.querySelectorAll('[data-nav]').forEach(btn=>{
      btn.addEventListener('click', ()=> this.show(btn.getAttribute('data-nav')));
    });
    document.getElementById('adminEntryBtn').addEventListener('click', ()=> this.openAdminLogin());
  },

  show(name){
    if(name !== 'situation' && typeof stopStoryNarration === 'function') stopStoryNarration();
    Object.values(this.el).forEach(e=>{ if(e) e.style.display = 'none'; });
    if(this.el[name]) this.el[name].style.display = 'block';
    window.scrollTo({top:0, behavior:'instant'});
    
    /* ========== التحكم في ظهور الترويسة والترحيب ========== */
    const hero = document.querySelector('.hero');
    const welcomeBox = document.getElementById('welcomeBox');
    
    if(name === 'home'){
      /* في الشاشة الرئيسية: أظهر الترويسة الكاملة والترحيب */
      if(hero) hero.style.display = 'block';
      if(welcomeBox) welcomeBox.style.display = Student.status === 'approved' ? 'flex' : 'none';
    } else {
      /* في التبويبات الأخرى (الدروس، الفروض، إعراب، الترتيب): أخفِ الترويسة وأظهر الترحيب فقط */
      if(hero) hero.style.display = 'none';
      if(welcomeBox) welcomeBox.style.display = Student.status === 'approved' ? 'flex' : 'none';
    }
    
    if(name === 'lessons') renderLessonsScreen();
    if(name === 'exams') renderExamsScreen();
    if(name === 'irab') renderIrabScreen();
    if(name === 'situation') renderSituationScreen();
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
  balagha:{ icon:'📕', title:'الظواهر البلاغية' },
  anmat:  { icon:'📓', title:'أنماط النصوص' },
  itisaq: { icon:'📔', title:'الاتساق والانسجام' }
};

function renderLessonsScreen(){
  const wrap = document.getElementById('lessonsListWrap');
  wrap.innerHTML = '<div class="sf-label">جاري التحميل…</div>';
  Locks.load().then(()=>{
    let html = '';
    ['tawabi','qawaid','jumal','balagha','anmat','itisaq'].forEach((cat, idx)=>{
      const meta = CATEGORY_META[cat];
      const lessons = window.LESSONS.filter(l=>l.category===cat).sort((a,b)=>a.order-b.order);
      const categoryId = `category-${cat}`;
      const isOpen = idx === 0; /* فتح أول وحدة افتراضياً، الباقي مغلق */
      
      html += `
        <div class="lesson-accordion">
          <div class="group-header accordion-toggle" data-category="${categoryId}">
            <span class="gh-icon">${meta.icon}</span>
            <span class="gh-title">${meta.title}</span>
            <span class="gh-count">${lessons.length} دروس</span>
            <span class="accordion-arrow" style="margin-right: auto; transition: transform 0.3s ease;">
              ${isOpen ? '▼' : '▶'}
            </span>
          </div>
          <div class="lesson-list accordion-content" id="${categoryId}" style="display: ${isOpen ? 'block' : 'none'}; max-height: ${isOpen ? '1000px' : '0'}; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: ${isOpen ? '1' : '0'};">
      `;
      
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
      
      html += `
          </div>
        </div>
      `;
    });
    
    wrap.innerHTML = html;
    
    /* إضافة معالج الـ Accordion */
    wrap.querySelectorAll('.accordion-toggle').forEach(toggle=>{
      toggle.addEventListener('click', function(){
        const categoryId = this.getAttribute('data-category');
        const content = document.getElementById(categoryId);
        const arrow = this.querySelector('.accordion-arrow');
        
        if(content.style.display === 'none'){
          /* فتح الـ Accordion */
          content.style.display = 'block';
          content.style.maxHeight = '1000px';
          setTimeout(() => content.style.opacity = '1', 10);
          arrow.style.transform = 'rotate(0deg)';
          arrow.textContent = '▼';
        } else {
          /* إغلاق الـ Accordion */
          content.style.opacity = '0';
          content.style.maxHeight = '0';
          setTimeout(() => {
            if(content.style.maxHeight === '0px') content.style.display = 'none';
          }, 300);
          arrow.style.transform = 'rotate(0deg)';
          arrow.textContent = '▶';
        }
      });
    });
    
    /* معالج النقر على الدروس */
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
  
  /* إضافة زر عرض الترتيب */
  let leaderBtn = document.getElementById('ldLeaderboardBtn');
  if(!leaderBtn){
    leaderBtn = document.createElement('button');
    leaderBtn.id = 'ldLeaderboardBtn';
    leaderBtn.style.cssText = 'background:none; border:none; font-size:24px; cursor:pointer; margin-right:12px; padding:4px;';
    leaderBtn.title = 'عرض ترتيب التلاميذ';
    leaderBtn.innerHTML = '🏆';
    const hub = document.querySelector('.hub');
    if(hub) hub.insertBefore(leaderBtn, hub.firstChild);
  }
  leaderBtn.onclick = ()=>showLeaderboardPopup(lesson);
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
  document.getElementById('ldMindmapPdfBtn').onclick = ()=> exportMindmapPDF(lesson);

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
      <div class="lesson-cta-note">⏳ تمارين هذا الدرس غير متوفرة بعد — سيقوم الأستاذ/المشرف بإضافتها قريبًا. عند توفرها ستكون محاولة واحدة فقط، وتُحسب النتيجة بالنسبة المئوية وتدخل الترتيب.</div>`;
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
      </div>
      <div id="ldExercisesPdfButtons"></div>`;
    /* التلميذ اجتاز هذا التمرين فعلاً (نتيجته محفوظة في قاعدة البيانات) — أزرار تحميل PDF
       يجب أن تظهر هنا في كل مرة يُفتح فيها الدرس من جديد، وليس فقط لحظة الإنهاء الأولى،
       لأن data (محتوى التمرين) محمّل مسبقًا في هذه الدالة أصلاً. */
    addPdfDownloadButtons(lesson, data, document.getElementById('ldExercisesPdfButtons'));
    return;
  }

  /* صيغتان مدعومتان لملف التمارين:
     1) { questions:[...] }  → اختيار من متعدد (المحرك القديم createExerciseEngine)
     2) { sections:[...] }   → أسئلة مفتوحة مختلطة (أكمل الفراغ/الإعراب/المعنى/الجملة/الاستخراج) */
  const units = Array.isArray(data.questions) ? null : buildExerciseUnits(data);
  const count = units ? units.length : data.questions.length;

  box.innerHTML = `
    <button class="lesson-cta-btn" id="ldExerciseStartBtn">▶️ ابدأ التمرين</button>
    <div class="lesson-cta-note">⚠️ محاولة واحدة فقط — عدد الأسئلة: ${count}. لا يمكنك إعادة هذا التمرين بعد إرساله، وتُحسب نتيجتك بالنسبة المئوية وتدخل ترتيب هذا الدرس.</div>
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
      : '<p style="text-align:center;font-weight:700;color:#c0392b;margin-top:10px">⚠️ تعذّر حفظ نتيجتك في قاعدة البيانات (تحقق من الاتصال). راجع الأستاذ إن استمرت المشكلة.</p>'}
    <div id="pdfButtonsContainer"></div>`;
  
  /* إضافة أزرار تحميل PDF بعد تسجيل النتيجة بنجاح */
  if(res && res.ok){
    const exerciseData = await loadLessonExercise(lesson.id);
    if(exerciseData){
      const btnContainer = document.getElementById('pdfButtonsContainer');
      addPdfDownloadButtons(lesson, exerciseData, btnContainer);
    }
  }
}

/* ---------- تصدير الخريطة الذهنية للدرس كملف PDF (تحميل مباشر) ----------
   تُبنى نسخة كاملة من الخريطة الذهنية (كل الأقسام مفتوحة دائمًا، بنفس الألوان والإطارات)
   في حاوية خارج نطاق الشاشة المرئية (#mindmapPrintArea)، ثم تُلتقط كصورة عبر html2canvas
   وتُحوَّل إلى ملف PDF فعلي عبر jsPDF ويُنزَّل مباشرة على جهاز التلميذ (بلا نافذة طباعة).
   يتطلب هذا اتصالاً بالإنترنت لتحميل مكتبتي html2canvas وjsPDF (عبر CDN) عند أول استخدام. */
function buildMindmapPrintBranchHTML(branch){
  const childrenHtml = (branch.children||[]).map(ch=>`
    <div class="pp-leaf">
      <span class="pp-leaf-title">${ch.title}</span>
      ${ch.rule?`<div class="pp-leaf-rule">${ch.rule}</div>`:''}
      ${ch.example?`<div class="pp-leaf-example">✏️ ${ch.example}</div>`:''}
    </div>`).join('');
  return `<div class="pp-branch c-${branch.color||'blue'}">
    <div class="pp-branch-head">${branch.title}</div>
    <div class="pp-branch-body">
      ${branch.rule?`<div class="pp-rule">${branch.rule}</div>`:''}
      ${branch.example?`<div class="pp-example">✏️ ${branch.example}</div>`:''}
      ${childrenHtml?`<div class="pp-children">${childrenHtml}</div>`:''}
    </div>
  </div>`;
}

/* تنتظر تحميل مكتبتي html2canvas وjsPDF من الإنترنت (قد يتأخرا قليلاً حسب سرعة الاتصال
   أو تُحجبان من بعض برامج حجب الإعلانات/جدران حماية الشبكة)، وتفشل بخطأ واضح بعد مهلة معقولة */
function waitForPdfLibs(timeoutMs = 10000){
  return new Promise((resolve, reject)=>{
    const start = Date.now();
    (function check(){
      const ready = (typeof html2canvas !== 'undefined') && window.jspdf && window.jspdf.jsPDF;
      if(ready) return resolve();
      if(Date.now() - start > timeoutMs){
        return reject(new Error('تعذّر تحميل مكوّنات إنشاء PDF من الإنترنت. تأكد من اتصالك، ومن أن أي برنامج حجب إعلانات أو جدار حماية للشبكة لا يمنع تحميل ملفات جافاسكريبت خارجية، ثم أعد المحاولة.'));
      }
      setTimeout(check, 200);
    })();
  });
}

/* تضمن اكتمال تحميل خط Cairo (المستخدم الآن حصريًا في كامل قالب طباعة الـ PDF، بما في ذلك
   عنوان المنصة وعنوان الدرس) فعليًا في المتصفح قبل التقاط الصورة، لتفادي أي خط احتياطي مؤقت. */
async function ensureMindmapFontsLoaded(){
  if(!(document.fonts && document.fonts.load)) return;
  try{
    await Promise.all([
      document.fonts.load('900 21px Cairo'),
      document.fonts.load('800 17px Cairo'),
      document.fonts.load('700 12px Cairo'),
      document.fonts.load('600 12px Cairo'),
      document.fonts.load('400 12px Cairo')
    ]);
    if(document.fonts.ready) await document.fonts.ready;
  }catch(e){
    /* لا نوقف عملية التصدير أبدًا بسبب فشل تحميل خط واحد — نتابع بأفضل خط متاح */
  }
}

/* تقدير "ثِقَل" محتوى الدرس (عدد الفروع + الأبناء + طول التعريف) لاختيار حجم خط/مسافات
   مناسب تلقائيًا حتى تتسع الخريطة الذهنية بأناقة داخل صفحة A4 واحدة دائمًا مهما طال الدرس */
function estimateMindmapPrintSizeClass(lesson){
  const branches = lesson.tree || [];
  const totalChildren = branches.reduce((acc,b)=> acc + ((b.children||[]).length), 0);
  const defLen = (lesson.def||'').replace(/<[^>]*>/g,'').length;
  const weight = (branches.length*3) + totalChildren + Math.floor(defLen/55);
  if(weight > 38) return 'pp-ultra-compact';
  if(weight > 22) return 'pp-compact';
  return '';
}

function exportMindmapPDF(lesson, btnEl){
  if(!lesson.tree || !lesson.tree.length) return;
  const btn = btnEl || document.getElementById('ldMindmapPdfBtn');
  const area = document.getElementById('mindmapPrintArea');

  const sizeClass = estimateMindmapPrintSizeClass(lesson);
  area.innerHTML = `
    <div class="pp-page ${sizeClass}">
      <div class="pp-header">
        <div class="pp-platform">منصة الأستاذ محمد أبوشاكر لعبودي</div>
        <div class="pp-level">اللغة العربية — السنة الرابعة متوسط</div>
        <div class="pp-lesson-title">🗺️ الخريطة الذهنية: ${lesson.title}</div>
      </div>
      ${lesson.def ? `<div class="pp-def">${lesson.def}</div>` : ''}
      <div class="pp-branches">
        ${lesson.tree.map(buildMindmapPrintBranchHTML).join('')}
      </div>
      <div class="pp-footer">إعداد الأستاذ الوطني: محمد أبوشاكر لعبودي</div>
    </div>`;

  const originalBtnHTML = btn.innerHTML;
  btn.innerHTML = '⏳ جارٍ التحضير...';
  btn.disabled = true;

  /* التقاط عنصر .pp-page كصورة عبر html2canvas مع ضمانات صريحة ضد أشهر أخطاء المكتبة:
     1) تجاهل أي عنصر خلفية عائم في الصفحة (مثل صورة الأستاذ الشفافة/العلامة المائية) حتى
        لا يظهر أي أثر لها إطلاقًا في خلفية ملف الـ PDF الناتج.
     2) عدم استخدام أي تدرّج لوني (gradient) داخل قالب الطباعة نفسه — القالب يعتمد ألوانًا
        صلبة فقط — لتفادي خطأ addColorStop الشهير الذي يقع عندما تحاول html2canvas رسم
        تدرّجات لونية معقّدة أو نص مقصوص بتدرّج (background-clip:text).
     3) تحجيم (scale) تلقائي يتناسب مع ارتفاع المحتوى الفعلي بدل قيمة ثابتة، لتفادي تجاوز
        الحد الأقصى لأبعاد الـ canvas المسموح بها في متصفحات الجوّال. */
  (async ()=>{
    const ignoreFloatingBackgrounds = (el)=>{
      if(!el || !el.classList) return false;
      return el.classList.contains('teacher-watermark') || el.classList.contains('islamic-pattern');
    };
    const forceCleanClone = (clonedDoc)=>{
      clonedDoc.querySelectorAll('.teacher-watermark, .islamic-pattern').forEach(n=> n.remove());
      if(clonedDoc.body){ clonedDoc.body.style.background = '#ffffff'; }
      if(clonedDoc.documentElement){ clonedDoc.documentElement.style.background = '#ffffff'; }
      /* html2canvas ينسخ الصفحة داخل iframe منفصل داخليًا، وقد يكون تحميل الخطوط فيه غير
         متزامن مع الصفحة الأصلية حتى لو كانت جاهزة هناك، فتظهر الحروف العربية مفكّكة. بما أن
         html2canvas تنتظر أي Promise تُعيدها onclone قبل المتابعة، ننتظر هنا صراحةً اكتمال
         تحميل خطوط المستند المستنسخ نفسه، مع مهلة قصوى احترازية حتى لا يتعلّق التصدير للأبد. */
      if(clonedDoc.fonts && clonedDoc.fonts.ready){
        return Promise.race([
          clonedDoc.fonts.ready,
          new Promise(resolve=> setTimeout(resolve, 1500))
        ]);
      }
      return Promise.resolve();
    };

    async function captureWithScale(pageEl, scale){
      return html2canvas(pageEl, {
        scale,
        useCORS:true,
        allowTaint:true,
        backgroundColor:'#ffffff',
        logging:false,
        ignoreElements: ignoreFloatingBackgrounds,
        onclone: forceCleanClone
      });
    }

    try{
      await waitForPdfLibs();
      await ensureMindmapFontsLoaded();
      /* مهلة بسيطة إضافية لضمان اكتمال رسم العنصر (الخطوط والتخطيط) في DOM قبل التقاطه بالصورة */
      await new Promise(r=>setTimeout(r, 150));

      const pageEl = area.querySelector('.pp-page');

      /* حساب scale آمن حسب أبعاد المحتوى الفعلية، بحيث لا يتجاوز ناتج الـ canvas حدًا
         أقصى آمنًا (~4000px لأي بعد) وهو ما يتوافق مع أضعف متصفحات الجوّال */
      const naturalW = pageEl.scrollWidth || 794;
      const naturalH = pageEl.scrollHeight || 1123;
      const MAX_DIM = 4000;
      let scale = 2;
      if(naturalW*scale > MAX_DIM || naturalH*scale > MAX_DIM){
        scale = Math.max(1, Math.min(scale, MAX_DIM / Math.max(naturalW, naturalH)));
      }

      let canvas;
      try{
        canvas = await captureWithScale(pageEl, scale);
      }catch(innerErr){
        /* محاولة أخيرة أكثر أمانًا بحجم scale=1 إن فشلت المحاولة الأولى لأي سبب متعلق بالأبعاد */
        console.warn('exportMindmapPDF: retrying with scale=1 after error:', innerErr);
        canvas = await captureWithScale(pageEl, 1);
      }

      /* حارس أمان صريح: إن كان canvas بأبعاد صفرية أو غير سليمة (وهذا ما كان يسبب سابقًا
         خطأ "Invalid coordinates passed to jsPDF.addImage" بصمت) نوقف العملية برسالة
         عربية واضحة بدل تمرير قيم NaN/صفرية إلى jsPDF */
      if(!canvas || !canvas.width || !canvas.height){
        throw new Error('تعذّر تجهيز صورة الخريطة الذهنية (أبعاد فارغة). أعد فتح الدرس وحاول مجددًا.');
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;
      if(imgHeight > pageHeight){
        imgHeight = pageHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
      }
      const x = (pageWidth - imgWidth) / 2;
      const y = Math.max(0, (pageHeight - imgHeight) / 2);

      if(![x,y,imgWidth,imgHeight].every(Number.isFinite)){
        throw new Error('تعذّر حساب أبعاد ملف PDF بشكل صحيح. أعد فتح الدرس وحاول مجددًا.');
      }

      pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);
      pdf.save(`الخريطة الذهنية - ${lesson.title}.pdf`);
    }catch(err){
      console.error('exportMindmapPDF failed:', err);
      const msg = (err && err.message) ? err.message : 'تعذّر إنشاء ملف PDF. تأكد من اتصالك بالإنترنت ثم حاول مجددًا.';
      alert(msg);
    }finally{
      area.innerHTML = '';
      btn.innerHTML = originalBtnHTML;
      btn.disabled = false;
    }
  })();
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
    return `<details class="mm-branch c-${branch.color||'blue'}">
      <summary><span>${branch.title}</span><span class="chev">▾</span></summary>
      <div class="mm-branch-body">
        ${branch.rule?`<div class="mm-rule">${branch.rule}</div>`:''}
        ${branch.example?`<div class="mm-example">✏️ ${branch.example}</div>`:''}
        ${childrenHtml?`<div class="mm-children">${childrenHtml}</div>`:''}
      </div>
    </details>`;
  }).join('');
}

/* ---------- شاشة الوضعية الإدماجية ---------- */
let situationRendered = false;
function renderSituationScreen(){
  const s = window.SITUATION;
  if(!s) return;
  document.getElementById('situationDef').innerHTML = s.def || '';
  renderMindmap(s, document.getElementById('situationMindmap'));
  if(!situationRendered){
    document.getElementById('situationMindmapPdfBtn').onclick = ()=>
      exportMindmapPDF(s, document.getElementById('situationMindmapPdfBtn'));
    situationRendered = true;
  }
  Locks.load().then(renderSituationPracticeTabs);
}

/* ---------- تبويبات «وضعيات للاستئناس» حسب المقاطع الثمانية (يتحكم بفتحها/إغلاقها الأستاذ/المشرف) ---------- */
let situPracticeActiveKey = null;
let situActiveStoryId = null;
function renderSituationPracticeTabs(){
  const data = window.SITU_PRACTICE;
  const tabsWrap = document.getElementById('situPracticeTabs');
  if(!data || !tabsWrap) return;

  if(!situPracticeActiveKey) situPracticeActiveKey = data[0].key;

  tabsWrap.innerHTML = data.map(seg => {
    const locked = Locks.isSituationLocked(seg.key);
    return `
    <button type="button" class="situ-tab ${seg.key === situPracticeActiveKey ? 'active' : ''} ${locked ? 'is-locked' : ''}" data-key="${seg.key}">
      <span class="situ-tab-num">${String(seg.num).padStart(2,'0')}</span>
      <span class="situ-tab-icon">${seg.icon}</span>
      <span class="situ-tab-label">${seg.title}</span>
      <span class="situ-tab-lock">${locked ? '🔒' : '🔓'}</span>
    </button>`;
  }).join('');

  tabsWrap.querySelectorAll('.situ-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(situPracticeActiveKey === btn.getAttribute('data-key')){ renderSituationPracticePanel(); return; }
      situPracticeActiveKey = btn.getAttribute('data-key');
      situActiveStoryId = null;
      tabsWrap.querySelectorAll('.situ-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      btn.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
      renderSituationPracticePanel();
    });
  });

  renderSituationPracticePanel();
}

function renderSituationPracticePanel(){
  const data = window.SITU_PRACTICE;
  const panel = document.getElementById('situPracticePanel');
  if(!data || !panel) return;
  stopStoryNarration();
  const seg = data.find(x => x.key === situPracticeActiveKey) || data[0];

  if(Locks.isSituationLocked(seg.key)){
    situActiveStoryId = null;
    panel.innerHTML = `
      <div class="exam-panel">
        <span class="lock-icon">🔒</span>
        سيُفتح هذا المقطع «${seg.title}» من قبل الأستاذ أو المشرف في الوقت المناسب
      </div>`;
    return;
  }

  /* مقاطع من نوع "قصص للقراءة" (عناوين تُفتح كل واحدة على حدة) */
  if(seg.stories && seg.stories.length){
    if(situActiveStoryId){
      const story = seg.stories.find(s => s.id === situActiveStoryId);
      if(story){ renderStoryReader(seg, story); return; }
    }
    renderStoryTitlesList(seg);
    return;
  }

  situActiveStoryId = null;
  panel.innerHTML = `
    <div class="situ-panel c-${seg.color || 'blue'}">
      <div class="situ-panel-head">
        <span class="situ-panel-icon">${seg.icon}</span>
        <span class="situ-panel-title">المقطع ${seg.num}: ${seg.title}</span>
      </div>
      ${(seg.situations||[]).map(sit => `
        <div class="situ-card">
          <div class="situ-card-title">${sit.title}</div>
          <div class="situ-block">
            <span class="situ-block-label">🔹 السياق</span>
            <p class="situ-block-text">${sit.context}</p>
          </div>
          <div class="situ-block">
            <span class="situ-block-label">🔹 السند</span>
            <p class="situ-block-text">${sit.support}</p>
          </div>
          <div class="situ-block">
            <span class="situ-block-label">🔹 التعليمة</span>
            <p class="situ-block-text">${sit.instruction}</p>
          </div>
          ${sit.pattern ? `<div class="situ-pattern">🧭 النمط المقترح: <b>${sit.pattern}</b></div>` : ''}
        </div>`).join('')}
    </div>`;
}

/* ---------- قائمة عناوين القصص داخل مقطع (يُضغط على العنوان لفتح القصة كاملة) ---------- */
function renderStoryTitlesList(seg){
  const panel = document.getElementById('situPracticePanel');
  panel.innerHTML = `
    <div class="situ-panel c-${seg.color || 'blue'}">
      <div class="situ-panel-head">
        <span class="situ-panel-icon">${seg.icon}</span>
        <span class="situ-panel-title">المقطع ${seg.num}: ${seg.title}</span>
      </div>
      <div class="story-hint">📖 اضغط على عنوان الوضعية لقراءتها كاملة</div>
      <div class="story-list">
        ${seg.stories.map(st => `
          <div class="story-list-item" data-story="${st.id}">
            <span class="story-list-icon">${st.icon}</span>
            <span class="story-list-title">${st.title}</span>
            <span class="story-list-arrow">‹</span>
          </div>`).join('')}
      </div>
    </div>`;
  panel.querySelectorAll('.story-list-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      situActiveStoryId = item.getAttribute('data-story');
      renderSituationPracticePanel();
    });
  });
}

/* ---------- قارئ القصة الكاملة (بشكلها التام) + زر الاستماع بصوت حنون ---------- */
function renderStoryReader(seg, story){
  const panel = document.getElementById('situPracticePanel');
  const bodyHtml = story.blocks.map(b=>{
    if(b.type === 'quote') return `<div class="story-quote">${b.text}</div>`;
    if(b.type === 'moral') return `<div class="story-moral"><span class="story-moral-badge">🖊️ العبرة</span><p>${b.text}</p></div>`;
    if(b.type === 'scene') return `<div class="story-scene"><span class="story-scene-icon">${b.icon}</span><span class="story-scene-caption">${b.caption||''}</span></div>`;
    return `<p class="story-p">${b.text}</p>`;
  }).join('');

  panel.innerHTML = `
    <div class="situ-panel c-${seg.color || 'blue'}">
      <button type="button" class="story-back-btn" id="storyBackBtn">‹ رجوع إلى عناوين المقطع</button>
      <div class="story-reader">
        <div class="story-reader-head">
          <span class="story-reader-icon">${story.icon}</span>
          <h3 class="story-reader-title">${story.title}</h3>
        </div>
        <button type="button" class="story-listen-btn" id="storyListenBtn">🔊 استمع إلى الوضعية</button>
        <div class="story-body" id="storyBody">${bodyHtml}</div>
      </div>
    </div>`;

  document.getElementById('storyBackBtn').addEventListener('click', ()=>{
    situActiveStoryId = null;
    renderSituationPracticePanel();
  });

  document.getElementById('storyListenBtn').addEventListener('click', (e)=>{
    if(storyNarrationActive){ stopStoryNarration(); return; }
    startStoryNarration(story, e.currentTarget);
  });
}

/* ---------- الاستماع للقصة بصوت حنون: قراءة متأنية، فقرة فقرة، مع وقفات هادئة ---------- */
let storyNarrationActive = false;
let storyNarrationQueue = [];
let storyNarrationIdx = 0;

function pickArabicVoice(){
  if(!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return voices.find(v => /^ar/i.test(v.lang)) || null;
}

function startStoryNarration(story, btnEl){
  if(!('speechSynthesis' in window)){
    alert('عذرًا، متصفحك لا يدعم خاصية الاستماع الصوتي.');
    return;
  }
  window.speechSynthesis.cancel();
  storyNarrationQueue = story.blocks
    .map(b => (b.speech || b.caption || b.text || '').replace(/<[^>]+>/g, ''))
    .filter(t => t && t.trim());
  storyNarrationIdx = 0;
  storyNarrationActive = true;
  if(btnEl){ btnEl.textContent = '⏹ إيقاف الاستماع'; btnEl.classList.add('is-playing'); }
  speakNextBlock(btnEl);
}

function speakNextBlock(btnEl){
  if(!storyNarrationActive) return;
  if(storyNarrationIdx >= storyNarrationQueue.length){
    stopStoryNarration();
    return;
  }
  const text = storyNarrationQueue[storyNarrationIdx++];
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickArabicVoice();
  if(voice) utter.voice = voice;
  utter.lang = voice ? voice.lang : 'ar-SA';
  utter.rate = 0.82;   /* قراءة متأنية ليسهل الفهم */
  utter.pitch = 1.08;  /* نبرة أكثر دفئًا وحنوًا */
  utter.volume = 1;
  utter.onend = ()=>{ setTimeout(()=> speakNextBlock(btnEl), 380); /* وقفة هادئة بين الفقرات */ };
  utter.onerror = ()=> stopStoryNarration();
  window.speechSynthesis.speak(utter);
}

function stopStoryNarration(){
  storyNarrationActive = false;
  storyNarrationQueue = [];
  storyNarrationIdx = 0;
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
  const btn = document.getElementById('storyListenBtn');
  if(btn){ btn.textContent = '🔊 استمع إلى الوضعية'; btn.classList.remove('is-playing'); }
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

/* ---------- شاشة الترتيب العام ----------
   ثلاثة أقسام مستقلة تمامًا عن بعضها:
   1) لوحة الشرف العامة: ترتيب شامل لكل التلاميذ بمجموع نتائجهم في كل تمارين الدروس مجتمعة.
   2) ترتيب الفروض والاختبارات: ترتيب مستقل بمجموع النقاط المتحصل عليها في الفروض/الاختبارات المنجزة فقط.
   3) ترتيب تمارين كل درس على حدة: تبقى كما كانت — نافذة منبثقة خاصة بكل درس عند الضغط عليه. */
function renderLeaderboardScreen(){
  const wrap = document.getElementById('leaderboardWrap');
  wrap.innerHTML = `
    <div class="lb-section">
      <div class="lb-section-title-clickable" onclick="showOverallLeaderboardPopup()" style="cursor:pointer;">
        <span class="lb-section-icon">🏅</span>
        <span>لوحة الشرف العامة</span>
        <span class="lb-popup-indicator">→</span>
      </div>
      <div class="sf-label">الترتيب الشامل لجميع التلاميذ في المنصة، بناءً على مجموع نتائجهم الإجمالية في تمارين الدروس المنجزة</div>
    </div>

    <div class="lb-section">
      <div class="lb-section-title-clickable" onclick="showExamsLeaderboardPopup()" style="cursor:pointer;">
        <span class="lb-section-icon">📝</span>
        <span>ترتيب الفروض والاختبارات</span>
        <span class="lb-popup-indicator">→</span>
      </div>
      <div class="sf-label">ترتيب مستقل للتلاميذ بناءً على مجموع النقاط المتحصل عليها في الفروض والاختبارات المنجزة</div>
    </div>

    <div class="lb-section">
      <div class="lb-section-title"><span class="lb-section-icon">📚</span>ترتيب تمارين كل درس</div>
      <div class="sf-label">اختر درسًا لعرض ترتيب تمارينه الخاصة به فقط في نافذة منبثقة مستقلة (تظهر البطاقات فور توفر تمارين الدرس)</div>
      <div id="lbLessonGrid" class="lb-lesson-grid"></div>
    </div>`;

  /* 3) شبكة الدروس — لا تغيير في المنطق: كل بطاقة تفتح ترتيب تمارين درسها فقط */
  const grid = document.getElementById('lbLessonGrid');
  window.LESSONS.filter(l=>l.locked!=='pending').forEach(l=>{
    const card = document.createElement('div');
    card.className = 'lb-lesson-card';
    card.innerHTML = `
      <div class="lb-card-num">${String(l.order).padStart(2,'0')}</div>
      <div class="lb-card-icon">🏆</div>
      <div class="lb-card-title">${l.title}</div>`;
    card.addEventListener('click', ()=> showLeaderboardPopup(l));
    grid.appendChild(card);
  });
}

function renderHallRow(idx, rankLabel, nameHtml, metaHtml, badgeHtml){
  const rankCls = idx===0?'first':idx===1?'second':idx===2?'third':'';
  const trophy = idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':'';
  return `<div class="lb-hall-item">
      <div class="lb-hall-rank ${rankCls}">${trophy || rankLabel}</div>
      <div class="lb-hall-info">
        <div class="lb-hall-name">${nameHtml}</div>
        <div class="lb-hall-meta">${metaHtml}</div>
      </div>
      <div class="lb-hall-badge">${badgeHtml}</div>
    </div>`;
}

/* ===== Popups الكاملة (النوافذ المنبثقة) ===== */
async function showOverallLeaderboardPopup(){
  if(!fbReady){
    alert('Firebase غير مفعّل. لا يمكن عرض الترتيب.');
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.className = 'leaderboard-modal-overlay';
  
  const popup = document.createElement('div');
  popup.className = 'leaderboard-modal-popup';
  
  const header = document.createElement('div');
  header.className = 'leaderboard-modal-header';
  
  const title = document.createElement('div');
  title.className = 'leaderboard-modal-title';
  title.textContent = '🏅 لوحة الشرف العامة';
  
  const subtitle = document.createElement('div');
  subtitle.className = 'leaderboard-modal-subtitle';
  subtitle.textContent = 'الترتيب الشامل لجميع التلاميذ';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'leaderboard-modal-close';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = ()=>overlay.remove();
  
  header.appendChild(title);
  header.appendChild(subtitle);
  header.appendChild(closeBtn);
  
  const listDiv = document.createElement('div');
  listDiv.className = 'leaderboard-modal-list';
  listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">جاري تحميل الترتيب…</div>';
  
  popup.appendChild(header);
  popup.appendChild(listDiv);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  try{
    const results = await Leaderboard.overallLessons();
    if(!results.length){
      listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">لا توجد نتائج بعد</div>';
      return;
    }
    
    listDiv.innerHTML = results.map((r, idx)=> renderHallRow(
      idx, (idx+1),
      r.name,
      `مجموع النتائج: ${r.totalScore} — ${r.exercisesCount} تمرين منجز`,
      `${r.avgPercent}%`
    )).join('');
  }catch(e){
    console.error('Error loading overall leaderboard popup:', e);
    listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">خطأ في تحميل الترتيب</div>';
  }
}

async function showExamsLeaderboardPopup(){
  if(!fbReady){
    alert('Firebase غير مفعّل. لا يمكن عرض الترتيب.');
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.className = 'leaderboard-modal-overlay';
  
  const popup = document.createElement('div');
  popup.className = 'leaderboard-modal-popup';
  
  const header = document.createElement('div');
  header.className = 'leaderboard-modal-header';
  
  const title = document.createElement('div');
  title.className = 'leaderboard-modal-title';
  title.textContent = '📝 ترتيب الفروض والاختبارات';
  
  const subtitle = document.createElement('div');
  subtitle.className = 'leaderboard-modal-subtitle';
  subtitle.textContent = 'ترتيب التلاميذ حسب نقاطهم في الفروض والاختبارات';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'leaderboard-modal-close';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = ()=>overlay.remove();
  
  header.appendChild(title);
  header.appendChild(subtitle);
  header.appendChild(closeBtn);
  
  const listDiv = document.createElement('div');
  listDiv.className = 'leaderboard-modal-list';
  listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">جاري تحميل الترتيب…</div>';
  
  popup.appendChild(header);
  popup.appendChild(listDiv);
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  try{
    const results = await Leaderboard.overallExams();
    if(!results.length){
      listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">لا توجد فروض أو اختبارات منجزة بعد</div>';
      return;
    }
    
    listDiv.innerHTML = results.map((r, idx)=> renderHallRow(
      idx, (idx+1),
      r.name,
      `${r.examsCount} فرض/اختبار منجز`,
      `${r.totalPoints} نقطة`
    )).join('');
  }catch(e){
    console.error('Error loading exams leaderboard popup:', e);
    listDiv.innerHTML = '<div class="leaderboard-empty" style="padding:30px 20px;">خطأ في تحميل الترتيب</div>';
  }
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

/* ===== نظام الأقسام القابلة للطي (Accordion) في لوحة تحكم الأستاذ =====
   يحتفظ بمجموعة معرّفات الأقسام المفتوحة حاليًا في هذا المتغيّر (خارج أي دالة) كي تبقى
   الأقسام المفتوحة مفتوحة حتى بعد إعادة رسم اللوحة (renderAdminPanel) عند كل تفاعل. */
const AdminAccordionState = { open: new Set() };

function adminAccordionHTML(id, titleHtml, bodyHtml){
  const isOpen = AdminAccordionState.open.has(id);
  return `<div class="admin-accordion" data-accordion-id="${id}">
    <button type="button" class="admin-accordion-header" data-accordion-toggle="${id}" aria-expanded="${isOpen}">
      <span class="aa-title">${titleHtml}</span>
      <span class="aa-chevron">▾</span>
    </button>
    <div class="admin-accordion-body-wrap ${isOpen ? 'open' : ''}">
      <div class="admin-accordion-body-inner">${bodyHtml}</div>
    </div>
  </div>`;
}

/* تُستدعى بعد إدراج HTML الأقسام في الصفحة لتفعيل أزرار الفتح/الإغلاق داخل الحاوية المُعطاة */
function wireAdminAccordions(container){
  container.querySelectorAll('[data-accordion-toggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-accordion-toggle');
      const bodyWrap = btn.nextElementSibling;
      const nowOpen = !bodyWrap.classList.contains('open');
      bodyWrap.classList.toggle('open', nowOpen);
      btn.setAttribute('aria-expanded', String(nowOpen));
      if(nowOpen) AdminAccordionState.open.add(id); else AdminAccordionState.open.delete(id);
    });
  });
}

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

  let pendingBody;
  if(!pending.length){
    pendingBody = `<div class="exam-panel">لا توجد طلبات تسجيل قيد الانتظار حاليًا.</div>`;
  } else {
    pendingBody = pending.map(p=>`
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

  const approvedBody = `
    <button class="al-key" id="toggleApprovedBtn" style="width:100%">👥 عدد التلاميذ المقبولين: ${totalStudents} — اضغط لعرض الأسماء والمستوى</button>
    <div id="approvedListContainer" style="display:none;margin-top:12px"></div>`;

  let lessonsBody = `<div class="lesson-list">`;
  window.LESSONS.forEach(l=>{
    const pendingLesson = l.locked === 'pending';
    const open = !pendingLesson && !Locks.isLessonLocked(l.id);
    lessonsBody += `<div class="lesson-row ${pendingLesson?'placeholder':''}">
      <div class="lr-num">${String(l.order).padStart(2,'0')}</div>
      <div class="lr-text"><div class="lr-title">${l.title}</div></div>
      ${pendingLesson
        ? `<div class="lr-status">⏳ بلا محتوى بعد</div>`
        : `<button class="al-key" style="width:auto;padding:6px 14px" data-toggle-lesson="${l.id}">${open?'🔓 مفتوح — اضغط للإغلاق':'🔒 مغلق — اضغط للفتح'}</button>`}
    </div>`;
  });
  lessonsBody += `</div>`;

  let trimestersBody = `<div class="lesson-list">`;
  [{k:'t1',l:'الفصل الأول'},{k:'t2',l:'الفصل الثاني'},{k:'t3',l:'الفصل الثالث'}].forEach(t=>{
    const open = Locks.isTrimesterOpen(t.k);
    trimestersBody += `<div class="lesson-row"><div class="lr-text"><div class="lr-title">${t.l}</div></div>
      <button class="al-key" style="width:auto;padding:6px 14px" data-toggle-trimester="${t.k}">${open?'🔓 مفتوح — اضغط للإغلاق':'🔒 مغلق — اضغط للفتح'}</button></div>`;
  });
  trimestersBody += `</div>`;

  let situationsBody = `<div class="lesson-list">`;
  (window.SITU_PRACTICE || []).forEach(seg=>{
    const open = !Locks.isSituationLocked(seg.key);
    situationsBody += `<div class="lesson-row">
      <div class="lr-num">${String(seg.num).padStart(2,'0')}</div>
      <div class="lr-text"><div class="lr-title">${seg.icon} ${seg.title}</div></div>
      <button class="al-key" style="width:auto;padding:6px 14px" data-toggle-situation="${seg.key}">${open?'🔓 مفتوح — اضغط للإغلاق':'🔒 مغلق — اضغط للفتح'}</button>
    </div>`;
  });
  situationsBody += `</div>`;

  const statsBody = `<div id="adminStatsMount"></div>`;
  const aiTeacherBody = `
    <div class="note" style="margin-bottom:12px">🧠 وحدة منفصلة تتيح إنشاء اختبار (نص/جدول/رسوم)، طباعته، ورفع تلميذ صورة إجابته لتصحّح تلقائيًا بالذكاء الاصطناعي مع علامة وتقرير فوري.
      <br><b>عند أول استخدام</b> ستطلب منك لوحة الأستاذ(ة) هناك رمزًا سريًا خاصًا بها (منفصل عن رمز هذه اللوحة)، ثم رابط خادم التصحيح (Worker) — راجع ملف <b>worker.js</b> وREADME المرفقين لنشره خلال دقائق.</div>
    <a class="al-key" style="display:inline-block;width:auto;padding:9px 22px;text-decoration:none" href="smart-teacher.html" target="_blank" rel="noopener">🧠 فتح لوحة المعلّم الذكي</a>
    <div class="note" style="margin-top:12px">💡 بعد نشر اختبار هناك، انسخ رابطه وأرسله لكل التلاميذ عبر قسم "👥 التلاميذ المقبولون" أدناه أو أي وسيلة تواصل معتادة.</div>`;

  wrap.innerHTML =
    adminAccordionHTML('pending', `⏳ طلبات الانتظار <span class="aa-badge">${pending.length}</span>`, pendingBody) +
    adminAccordionHTML('approved', `👥 التلاميذ المقبولون <span class="aa-badge">${totalStudents}</span>`, approvedBody) +
    adminAccordionHTML('lessons', `📖 فتح/إغلاق الدروس`, lessonsBody) +
    adminAccordionHTML('trimesters', `📝 فتح/إغلاق الفروض والاختبارات`, trimestersBody) +
    adminAccordionHTML('situations', `📝 فتح/إغلاق وضعيات الاستئناس (المقاطع)`, situationsBody) +
    adminAccordionHTML('aiTeacher', `🧠 المعلّم الذكي — اختبارات وتصحيح آلي`, aiTeacherBody) +
    adminAccordionHTML('stats', `📊 إحصائيات كل درس`, statsBody);

  wireAdminAccordions(wrap);

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
  wrap.querySelectorAll('[data-toggle-situation]').forEach(b=> b.addEventListener('click', async ()=>{
    const k = b.getAttribute('data-toggle-situation');
    const open = !Locks.isSituationLocked(k);
    try{
      await Locks.setSituation(k, !open);
    }catch(error){
      console.error('فشل تحديث حالة قفل المقطع (تحقق من قواعد Firestore لمجموعة state):', error);
      if(typeof showFbPermissionNotice === 'function') showFbPermissionNotice('locks');
      alert('تعذّر حفظ حالة المقطع في قاعدة البيانات. راجع التنبيه الظاهر أعلى الصفحة.');
    }
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
  /* تهيئة: تأكد من أن الـ hero يظهر افتراضياً (الشاشة الرئيسية) */
  const hero = document.querySelector('.hero');
  if(hero) hero.style.display = 'block';
  
  Screens.init();
  setupAdminLoginModal();

  if(!fbReady){
    document.getElementById('fbNotice').innerHTML = fbUnavailableNotice();
  }

  Locks.listen(()=>{
    if(document.getElementById('screen-lessons').style.display !== 'none') renderLessonsScreen();
    if(document.getElementById('screen-situation').style.display !== 'none') renderSituationPracticeTabs();
  });

  const resumed = await Student.resume();
  if(resumed){ renderWelcome(); }

  document.getElementById('loginSubmitBtn').addEventListener('click', async ()=>{
    const firstName = document.getElementById('loginFirstNameInput').value.trim();
    const lastName = document.getElementById('loginLastNameInput').value.trim();
    if(!firstName || !lastName){ alert('يرجى كتابة الاسم واللقب في الخانتين.'); return; }
    const name = firstName + ' ' + lastName;
    const btn = document.getElementById('loginSubmitBtn');
    const msgBox = document.getElementById('loginMsg');

    btn.disabled = true; btn.textContent = 'جارٍ التحقق…';
    msgBox.textContent = '';

    /* لا حاجة للبحث عن receipt — يتم التسجيل بالاسم واللقب فقط */
    const res = await Student.loginOrRegister(name, null);
    btn.disabled = false; btn.textContent = 'دخول';

    if(!res.ok){ msgBox.textContent = 'تعذّر الاتصال بالمنصة، تحقق من إعداد Firebase.'; return; }
    if(res.status === 'pending'){ msgBox.textContent = '⏳ طلبك قيد المراجعة، يرجى الانتظار حتى يوافق الأستاذ أو المشرف.'; return; }
    if(res.status === 'rejected'){ msgBox.textContent = '❌ لم تتم الموافقة على طلبك. تواصل مع الأستاذ لمزيد من التفاصيل.'; return; }
    document.getElementById('loginModal').classList.remove('show');
    renderWelcome();
  });

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

/* إخفاء زر/صف "تثبيت التطبيق" نهائياً من الواجهة */
function hidePwaInstallButton(){
  const btn = document.getElementById('pwaInstallBtn');
  const row = btn ? btn.closest('.install-row') : document.querySelector('.install-row');
  if(row) row.style.display = 'none';
  else if(btn) btn.style.display = 'none';
}

/* هل التطبيق مثبّت فعلاً؟ (تخزين محلي، أو التشغيل حالياً بوضع standalone/PWA) */
function isPwaInstalled(){
  if(localStorage.getItem('pwaInstalled') === '1') return true;
  if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if(window.navigator.standalone === true) return true; // iOS Safari
  return false;
}

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredInstallPrompt = e;
});

/* المتصفح يطلق هذا الحدث فور اكتمال التثبيت فعلياً */
window.addEventListener('appinstalled', ()=>{
  localStorage.setItem('pwaInstalled', '1');
  hidePwaInstallButton();
});

document.addEventListener('DOMContentLoaded', ()=>{
  /* إن كان التطبيق مثبتاً مسبقاً على هذا الجهاز، أخفِ الزر فوراً ولا تُظهره مجدداً */
  if(isPwaInstalled()) hidePwaInstallButton();

  /* تثبيت التطبيق */
  const btn = document.getElementById('pwaInstallBtn');
  if(btn) btn.addEventListener('click', async ()=>{
    if(deferredInstallPrompt){
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      /* بعض المتصفحات لا تُطلق appinstalled فور القبول، فنحفظ الحالة هنا احتياطاً */
      if(choice && choice.outcome === 'accepted'){
        localStorage.setItem('pwaInstalled', '1');
        hidePwaInstallButton();
      }
    }
    else alert('لتثبيت التطبيق: افتح قائمة المتصفح واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
  });

  /* تهيئة الميزات الجديدة */
  if(typeof initWisdomBanner === 'function') setTimeout(initWisdomBanner, 500);
  if(typeof initNotificationsSystem === 'function') setTimeout(initNotificationsSystem, 500);
  if(typeof setupLessonLiveUpdates === 'function') setTimeout(setupLessonLiveUpdates, 500);
  if(typeof initPlatformStatsWidget === 'function') setTimeout(initPlatformStatsWidget, 500);

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
