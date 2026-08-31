/* =========================================================================================
   خانة إحصائيات المنصّة الثابتة (Platform Stats Widget)
   - تعرض دائمًا: عدد التلاميذ المنضمّين (status == approved) وعدد المتصلين الآن (نشِطون خلال آخر دقيقتين)
   - "المتصل الآن" يعتمد على نبضة (heartbeat) تُحدّث حقل lastSeen كل 45 ثانية لصاحب الجلسة الحالية
   - يعمل فقط عند توفر اتصال Firebase؛ وإن فشل استعلام "المتصلين الآن" (مثلاً بسبب عدم وجود
     الفهرس المركّب المطلوب في Firestore) يُخفى ذلك الرقم فقط دون التأثير على باقي التطبيق
   ========================================================================================= */

const PlatformStats = {
  widgetInjected:false,
  onlineIndexMissing:false,

  /* حقن الخانة في الصفحة مرة واحدة فقط */
  injectWidget(){
    if(this.widgetInjected) return;
    const el = document.createElement('div');
    el.id = 'platformStatsWidget';
    el.className = 'platform-stats-widget';
    el.innerHTML = `
      <span class="ps-item" id="psTotal" title="عدد التلاميذ المنضمّين إلى المنصّة">
        <span class="ps-emoji">👥</span><span class="ps-num">—</span>
      </span>
      <span class="ps-sep"></span>
      <span class="ps-item" id="psOnline" title="عدد المتصلين الآن">
        <span class="ps-dot"></span><span class="ps-num">—</span>
      </span>
    `;
    document.body.appendChild(el);
    this.widgetInjected = true;
  },

  /* تحديث الأرقام المعروضة */
  render(counts){
    const totalEl  = document.querySelector('#psTotal .ps-num');
    const onlineWrap = document.getElementById('psOnline');
    const onlineEl = document.querySelector('#psOnline .ps-num');
    if(totalEl)  totalEl.textContent  = (counts.total  === null) ? '—' : counts.total;
    if(onlineEl) onlineEl.textContent = (counts.online === null) ? '—' : counts.online;
    if(onlineWrap) onlineWrap.style.display = (counts.online === null && this.onlineIndexMissing) ? 'none' : 'flex';
  },

  /* جلب العددين من Firestore عبر استعلامات count() الخفيفة (قراءة واحدة لكل استعلام مهما كان حجم المجموعة) */
  async fetchCounts(){
    let total = null, online = null;

    try{
      const totalSnap = await db.collection('students').where('status','==','approved').count().get();
      total = totalSnap.data().count;
    }catch(e){ console.warn('تعذّر جلب عدد التلاميذ المنضمّين:', e && e.message); }

    try{
      const cutoff = new Date(Date.now() - 2*60*1000); /* نشط خلال آخر دقيقتين */
      const onlineSnap = await db.collection('students')
        .where('status','==','approved')
        .where('lastSeen','>=', cutoff)
        .count().get();
      online = onlineSnap.data().count;
    }catch(e){
      /* الاستعلام يحتاج فهرسًا مركّبًا (status + lastSeen) في Firestore — يُنشأ تلقائيًا
         بالضغط على الرابط الذي يظهر في رسالة الخطأ أدناه ضمن الـ Console عند أول محاولة */
      this.onlineIndexMissing = true;
      console.warn('تعذّر جلب عدد المتصلين الآن (يلزم إنشاء فهرس مركّب في Firestore لحقلي status و lastSeen):', e && e.message);
    }

    return { total, online };
  },

  async refresh(){
    if(!fbReady || !db) return;
    const counts = await this.fetchCounts();
    this.render(counts);
  },

  /* نبضة حياة: تُحدّث lastSeen لصاحب الجلسة الحالية كل 45 ثانية طالما التطبيق مفتوح لديه،
     لتبقى "متصل الآن" معبّرة عن نشاط حقيقي وليس مجرّد آخر دخول قديم */
  startHeartbeat(){
    if(!fbReady || !db) return;
    const beat = ()=>{
      const id = (typeof lsGet === 'function') ? lsGet('student_id') : null;
      if(!id) return;
      db.collection('students').doc(id).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
    };
    beat();
    setInterval(beat, 45000);
    /* تحديث فوري أيضًا كلّما رجع التطبيق مرئيًا بعد أن كان في الخلفية */
    document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') beat(); });
  },

  init(){
    if(!fbReady || !db) return; /* لا معنى للخانة بدون Firebase */
    this.injectWidget();
    this.refresh();
    setInterval(()=> this.refresh(), 30000); /* تحديث الأرقام كل 30 ثانية */
    this.startHeartbeat();
  }
};

function initPlatformStatsWidget(){ PlatformStats.init(); }
