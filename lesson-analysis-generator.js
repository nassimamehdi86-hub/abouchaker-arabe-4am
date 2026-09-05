/* =========================================================================================
   مُولِّد "ورقة تحليل الدرس والأسئلة المتوقعة" (Lesson Analysis Sheet)
   -----------------------------------------------------------------------------------------
   يعتمد بالكامل على محرّك بناء PDF نفسه المستخدم أصلاً في exercise-pdf-generator.js
   (epRenderBlocksToPdf وما يرافقها) — نفس أسلوب "HTML خارج الشاشة + html2canvas + jsPDF"
   الذي يضمن رسم الحروف العربية سليمة ومتصلة.

   محتوى كل درس مُعَدّ يدويًا مسبقًا (وليس عبر ذكاء اصطناعي حيّ داخل التطبيق، لأن المنصة موقع
   ثابت بلا خادم توليد)، ومُخزَّن هنا في LESSON_ANALYSIS بمفتاح id الدرس (نفس id في
   lessons-data.js). لإضافة درس جديد لاحقًا: أضف مفتاحًا جديدًا بنفس بنية 'atf-nasaq' أدناه.
   الدروس التي لا تملك مفتاحًا هنا ببساطة لا يظهر لها الزر (بدل زر معطّل أو خطأ).
   ========================================================================================= */

window.LESSON_ANALYSIS = {

  'atf-nasaq': {
    mainIdea: 'عطف النسق أسلوب من أساليب التوابع: حرفٌ من حروف العطف التسعة يتوسّط بين اسمين — «المعطوف عليه» (المتبوع) و«المعطوف» (التابع) — فيُشرك المعطوفَ مع المعطوف عليه في الإعراب دائمًا، وأحيانًا في الحكم أيضًا حسب نوع الحرف.',

    keyPoints: [
      'المعطوف تابع يُعرب بإعراب المعطوف عليه (متبوعه) دائمًا.',
      'حروف العطف تسعة حروف بالضبط: الواو، الفاء، ثمّ، حتى، أو، أم، لا، بل، لكن.',
      'تنقسم حروف العطف إلى مجموعتين: 6 حروف (الواو، الفاء، ثمّ، حتى، أو، أم) تفيد المشاركة في اللفظ (الإعراب) والحكم معًا، و3 حروف (لا، بل، لكن) تفيد المشاركة في اللفظ فقط.',
      'لكل حرف من حروف العطف دلالة معنوية خاصة به يجب حفظها وتمييزها عن غيرها.'
    ],

    definitions: [
      { term:'المعطوف', def:'التابع الذي يتوسّط بينه وبين متبوعه (المعطوف عليه) أحد حروف العطف.' },
      { term:'المعطوف عليه', def:'الاسم المتبوع الذي يسبق حرف العطف.' },
      { term:'حرف العطف', def:'الحرف الذي يربط بين المعطوف والمعطوف عليه ويُشركهما في الإعراب.' }
    ],

    comparisonGroups: [
      { title:'حروف تفيد المشاركة في اللفظ والمعنى معًا (6 حروف)', note:'تجعل المعطوف يشارك المعطوف عليه في الإعراب وفي الحكم معًا.' },
      { title:'حروف تفيد المشاركة في اللفظ فقط (3 حروف)', note:'تفيد المغايرة، فتُشرك المعطوف عليه في الإعراب فقط دون الحكم.' }
    ],

    letters: [
      { letter:'الواو', meaning:'مطلق الجمع دون ترتيب', example:'حضر محمدٌ وعليٌّ' },
      { letter:'الفاء', meaning:'الترتيب والتعقيب بلا مهلة', example:'حضر محمدٌ فزيدٌ' },
      { letter:'ثمّ', meaning:'الترتيب مع التراخي', example:'زرتُ وهرانَ ثمّ غردايةَ' },
      { letter:'حتى', meaning:'الغاية، بشرط أن يكون المعطوف اسمًا مفردًا ظاهرًا وجزءًا من المعطوف عليه', example:'يموتُ الناسُ حتى الأنبياءُ' },
      { letter:'أو', meaning:'التخيير أو التقسيم أو الشك أو الإباحة حسب السياق', example:'اشرب ماءً أو حليبًا' },
      { letter:'أم', meaning:'التسوية أو طلب التعيين', example:'أمسافرٌ محمدٌ أم زيدٌ؟' },
      { letter:'لا', meaning:'النفي مع العطف', example:'جاءتني بشرى لا تسنيمُ' },
      { letter:'بل', meaning:'الإضراب', example:'قام زيدٌ بل طارقٌ' },
      { letter:'لكن', meaning:'الاستدراك بعد نفي أو نهي', example:'ما جاء إلياسُ لكن الحارثُ' }
    ],

    confusions: [
      'الخلط بين دلالات «أو» المتعددة (تخيير، تقسيم، شك، إباحة) التي تُفهَم من السياق فقط دون قاعدة ثابتة واحدة.',
      'نسيان الشرط الخاص بـ«حتى» العاطفة (أن يكون المعطوف اسمًا مفردًا ظاهرًا وجزءًا حقيقيًا من المعطوف عليه)؛ فإن اختل الشرط لم تكن «حتى» عاطفة.',
      'الخلط بين «الفاء» (ترتيب وتعقيب بلا مهلة) و«ثمّ» (ترتيب مع تراخٍ)، مع أن كليهما يفيد الترتيب.'
    ],

    forgettable: [
      'العدد الدقيق لحروف العطف (تسعة) وتوزيعها (6 حروف + 3 حروف).',
      'حروف المغايرة الثلاثة (لا، بل، لكن) لا تُشرك المعطوف مع المعطوف عليه في الحكم، بل في الإعراب فقط.',
      'المعطوف يتبع المعطوف عليه في الإعراب دائمًا، ولا يُعرب استقلالًا بذاته.'
    ],

    mcq: [
      { q:'ما الحرف الذي يفيد «الترتيب مع التراخي (المهلة)»؟', options:['الفاء','ثمّ','الواو','حتى'], correct:1 },
      { q:'أيّ الحروف التالية يفيد «الاستدراك بعد نفي أو نهي»؟', options:['بل','لا','لكن','أم'], correct:2 },
      { q:'ما الشرط اللازم لتكون «حتى» عاطفة؟', options:['أن يسبقها فعل ماضٍ','أن يكون المعطوف جملة','أن يكون المعطوف اسمًا مفردًا ظاهرًا وجزءًا من المعطوف عليه','لا شرط لها'], correct:2 },
      { q:'كم عدد حروف العطف التي تفيد المشاركة في اللفظ والحكم معًا؟', options:['ثلاثة','ستة','تسعة','أربعة'], correct:1 },
      { q:'في جملة «حضر محمدٌ وعليٌّ»، ما إعراب كلمة «علي»؟', options:['مبتدأ','معطوف مرفوع تبعًا للمعطوف عليه','فاعل مستقل','بدل'], correct:1 }
    ],

    trueFalse: [
      { q:'حروف العطف عددها تسعة.', answer:true },
      { q:'«الفاء» تفيد الترتيب مع التراخي.', answer:false, explain:'هذا لـ«ثمّ»، أما «الفاء» فتفيد الترتيب بلا مهلة.' },
      { q:'حروف «لا، بل، لكن» تُشرك المعطوف والمعطوف عليه في الحكم والإعراب معًا.', answer:false, explain:'تُشركهما في الإعراب (اللفظ) فقط.' },
      { q:'المعطوف يُعرب تبعًا لإعراب المعطوف عليه.', answer:true },
      { q:'«حتى» العاطفة لا تشترط أي شرط خاص.', answer:false, explain:'تشترط أن يكون المعطوف اسمًا مفردًا ظاهرًا وجزءًا من المعطوف عليه.' }
    ],

    fillBlank: [
      { before:'حروف العطف التي تفيد المشاركة في اللفظ والمعنى معًا عددها', after:'.', answer:'ستة' },
      { before:'الحرف الذي يفيد «الإضراب» من حروف العطف هو', after:'.', answer:'بل' },
      { before:'في جملة «اشرب ماءً أو حليبًا» تفيد «أو» معنى', after:'.', answer:'الإباحة (أو التخيير)' }
    ],

    shortAnswer: [
      { q:'عرّف المعطوف في أسلوب عطف النسق.', answer:'التابع الذي يتوسّط بينه وبين متبوعه أحد حروف العطف.' },
      { q:'اذكر حرفين من حروف العطف التي تفيد المشاركة في اللفظ فقط.', answer:'أي حرفين من: لا، بل، لكن.' },
      { q:'ما دلالة حرف «أم» في العطف؟', answer:'التسوية أو طلب التعيين.' }
    ],

    justify: [
      { q:'علّل: لماذا لا تُعدّ «حتى» عاطفة في كل استعمالاتها؟', answer:'لأنها تشترط أن يكون المعطوف اسمًا مفردًا ظاهرًا وجزءًا حقيقيًا من المعطوف عليه؛ فإن جاء المعطوف جملة أو لم يكن جزءًا من المعطوف عليه، لم تكن «حتى» عاطفة.' },
      { q:'علّل: لماذا تُسمى «لا، بل، لكن» حروف مغايرة؟', answer:'لأنها تجعل حكم المعطوف مخالفًا لحكم المعطوف عليه، فتُشركهما في اللفظ (الإعراب) فقط دون الحكم.' }
    ],

    thinking: {
      q:'في جملة «ما نجح خالدٌ بل صديقُه»، وضّح لماذا لا يصح استبدال «بل» بـ«الواو» مع بقاء المعنى نفسه؟',
      answer:'لأن «بل» تفيد الإضراب، أي نفي الحكم عن الأول وإثباته للثاني (فخالد لم ينجح، وصديقه هو من نجح)، بينما «الواو» تفيد مطلق الجمع، أي اشتراك الاثنين معًا في الحكم (نجاح خالد وصديقه معًا)؛ فاستبدال الحرف يقلب المعنى المقصود تمامًا.'
    },

    topTested: [
      'عدد حروف العطف (تسعة) وتقسيمها إلى مجموعتين: 6 حروف (لفظ وحكم) و3 حروف (لفظ فقط).',
      'دلالة كل حرف من حروف العطف على حدة، خصوصًا الفرق بين «الفاء» و«ثمّ»، ومعاني «أو» المتعددة.',
      'الشرط الخاص بحرف «حتى» ليكون عاطفة.'
    ],

    commonMistakes: [
      'الخلط بين «الفاء» و«ثمّ» في إفادة الترتيب (الفاء بلا مهلة، ثمّ بمهلة وتراخٍ).',
      'اعتبار «حتى» عاطفة في كل موضع دون التحقق من شرطها الخاص.',
      'الظن أن حروف العطف التسعة كلها تُشرك المعطوف والمعطوف عليه في الحكم، مع أن «لا، بل، لكن» تُشركهما في الإعراب فقط.'
    ]
  }

  /* لإضافة تحليل درس جديد لاحقًا: انسخ الكائن أعلاه وبدّل المفتاح 'atf-nasaq' بمعرّف الدرس
     الجديد (نفس id الموجود في lessons-data.js)، وحدّث كل الحقول وفق محتوى ذلك الدرس فقط. */
};

/* =========================================================================================
   بناء "كتل" HTML لملف تحليل الدرس (تُستهلك عبر epRenderBlocksToPdf من exercise-pdf-generator.js)
   ========================================================================================= */
function lagBuildBlocks(analysis){
  const b = [];
  const esc = (typeof epEscapeHtml === 'function') ? epEscapeHtml : (s => String(s==null?'':s));
  const LETTERS_AR = ['أ','ب','ج','د'];

  /* ---------- أولاً: تحليل الصفحة ---------- */
  b.push(`<div class="ep-section-title theme-blue">🧠 أولاً: تحليل الصفحة</div>`);

  b.push(`<div class="ep-section-title theme-gold" style="margin-top:6px">الفكرة الأساسية</div>
          <div class="ep-answer-text">${esc(analysis.mainIdea)}</div>`);

  b.push(`<div class="ep-section-title theme-gold">أهم المعلومات</div>
          ${analysis.keyPoints.map(p=>`<div class="ep-bullet">${esc(p)}</div>`).join('')}`);

  b.push(`<div class="ep-section-title theme-gold">التعريفات المهمة</div>
          ${analysis.definitions.map(d=>`<div class="ep-bullet"><b>${esc(d.term)}:</b> ${esc(d.def)}</div>`).join('')}`);

  {
    let html = `<div class="ep-section-title theme-gold">المقارنات المهمة</div>`;
    analysis.comparisonGroups.forEach(g=>{
      html += `<div class="ep-bullet"><b>${esc(g.title)}:</b> ${esc(g.note)}</div>`;
    });
    html += `<table class="ep-table" style="margin-top:6px"><thead><tr><th>الحرف</th><th>الدلالة</th><th>مثال</th></tr></thead><tbody>`;
    analysis.letters.forEach(l=>{
      html += `<tr><td style="text-align:center;font-weight:800;padding:4px">${esc(l.letter)}</td><td style="font-size:9px;padding:4px">${esc(l.meaning)}</td><td style="font-size:9px;padding:4px">${esc(l.example)}</td></tr>`;
    });
    html += `</tbody></table>`;
    b.push(html);
  }

  b.push(`<div class="ep-section-title theme-gold">النقاط التي قد يختلط فهمها على الطالب</div>
          ${analysis.confusions.map(p=>`<div class="ep-highlight-box" style="margin-bottom:4px">${esc(p)}</div>`).join('')}`);

  b.push(`<div class="ep-section-title theme-gold">معلومات يسهل نسيانها</div>
          ${analysis.forgettable.map(p=>`<div class="ep-highlight-box theme-blue" style="margin-bottom:4px">${esc(p)}</div>`).join('')}`);

  /* ---------- ثانيًا: الأسئلة ---------- */
  b.push(`<div class="ep-section-title theme-blue">📝 ثانيًا: أسئلة مراجعة الدرس</div>`);

  {
    let html = `<div class="ep-section-title theme-gold">أولًا — اختيار من متعدد</div>`;
    analysis.mcq.forEach((item,i)=>{
      html += `<div class="ep-q">${i+1}) ${esc(item.q)}</div>`;
      item.options.forEach((opt,oi)=>{
        html += `<div class="ep-mcq-opt${oi===item.correct?' is-correct':''}">${LETTERS_AR[oi]}) ${esc(opt)}${oi===item.correct?' ✓':''}</div>`;
      });
    });
    b.push(html);
  }

  {
    let html = `<div class="ep-section-title theme-gold">ثانيًا — صح أو خطأ</div>`;
    analysis.trueFalse.forEach((item,i)=>{
      html += `<div class="ep-q">${i+1}) ${esc(item.q)} — <span class="ep-answer">${item.answer?'صح':'خطأ'}</span>${item.explain?` (${esc(item.explain)})`:''}</div>`;
    });
    b.push(html);
  }

  {
    let html = `<div class="ep-section-title theme-gold">ثالثًا — أكمل الفراغ</div>`;
    analysis.fillBlank.forEach((item,i)=>{
      html += `<div class="ep-q">${i+1}) ${esc(item.before)} <span class="ep-answer">${esc(item.answer)}</span> ${esc(item.after)}</div>`;
    });
    b.push(html);
  }

  {
    let html = `<div class="ep-section-title theme-gold">رابعًا — إجابة قصيرة</div>`;
    analysis.shortAnswer.forEach((item,i)=>{
      html += `<div class="ep-word">${i+1}) ${esc(item.q)}</div><div class="ep-answer-text">${esc(item.answer)}</div>`;
    });
    b.push(html);
  }

  {
    let html = `<div class="ep-section-title theme-gold">خامسًا — علّل</div>`;
    analysis.justify.forEach((item,i)=>{
      html += `<div class="ep-word">${i+1}) ${esc(item.q)}</div><div class="ep-answer-text">${esc(item.answer)}</div>`;
    });
    b.push(html);
  }

  b.push(`<div class="ep-section-title theme-gold">سادسًا — سؤال يقيس الفهم والتفكير</div>
          <div class="ep-word">${esc(analysis.thinking.q)}</div>
          <div class="ep-answer-text">${esc(analysis.thinking.answer)}</div>`);

  /* ---------- ثالثًا: خلاصة المراجعة ---------- */
  b.push(`<div class="ep-section-title theme-blue">⭐ أهم 3 نقاط يُحتمل أن يأتي عليها سؤال</div>
          ${analysis.topTested.map(p=>`<div class="ep-bullet">${esc(p)}</div>`).join('')}`);

  b.push(`<div class="ep-section-title theme-blue">⚠️ أخطاء شائعة</div>
          ${analysis.commonMistakes.map(p=>`<div class="ep-highlight-box" style="margin-bottom:4px">${esc(p)}</div>`).join('')}`);

  b.push(`<div class="ep-section-title theme-blue">📊 تقييم سريع</div>
          <div class="ep-rubric-row"><span>90% - 100%</span><span>ممتاز 🏆</span></div>
          <div class="ep-rubric-row"><span>75% - 89%</span><span>جيد جدًا 👍</span></div>
          <div class="ep-rubric-row"><span>60% - 74%</span><span>محتاج مراجعة بسيطة 📖</span></div>
          <div class="ep-rubric-row"><span>أقل من 60%</span><span>راجع الصفحة مرة أخرى 🔁</span></div>`);

  return b;
}

/**
 * إنشاء ملف PDF لتحليل الدرس وأسئلته المتوقعة، وتنزيله مباشرة على جهاز التلميذ
 */
async function generateLessonAnalysisPDF(lesson){
  const analysis = window.LESSON_ANALYSIS && window.LESSON_ANALYSIS[lesson.id];
  if(!analysis) return { ok:false, error:'تحليل هذا الدرس غير متوفر بعد.' };
  try{
    await epWaitForLibs();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const headerHtml = epBuildHeader(
      'blue',
      'منصة الأستاذ محمد أبوشاكر لعبودي — تحليل الدرس وأسئلة متوقعة',
      lesson,
      'راجع التحليل أولًا ثم أجب عن الأسئلة بنفسك قبل النظر إلى الإجابات المرفقة.'
    );
    const blocks = lagBuildBlocks(analysis);
    await epRenderBlocksToPdf(pdf, { headerHtml, blocks, footerNote: 'منصة الأستاذ محمد أبوشاكر لعبودي' });
    pdf.save(`${(lesson.title||'الدرس').replace(/\s+/g, '_')}_تحليل_ومراجعة.pdf`);
    return { ok:true };
  }
  catch(err){
    console.error('generateLessonAnalysisPDF error:', err);
    return { ok:false, error: err.message };
  }
}

/**
 * إضافة زر "تحليل الدرس والمراجعة" داخل صفحة الدرس — يظهر فقط إن كان تحليل الدرس معدًّا
 * مسبقًا في LESSON_ANALYSIS أعلاه (الدروس الأخرى تُضاف تباعًا بنفس الطريقة).
 */
function renderLessonAnalysisButton(lesson, containerEl){
  if(!containerEl) return;
  containerEl.innerHTML = '';
  const analysis = window.LESSON_ANALYSIS && window.LESSON_ANALYSIS[lesson.id];
  if(!analysis){
    containerEl.innerHTML = `<div class="lesson-cta-note">⏳ ورقة تحليل هذا الدرس غير متوفرة بعد — سيتم إعدادها تباعًا لكل الدروس.</div>`;
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'lesson-cta-btn';
  btn.textContent = '🧠 تحميل تحليل الدرس + أسئلة متوقعة (PDF)';
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '⏳ جاري إنشاء الملف…';
    const result = await generateLessonAnalysisPDF(lesson);
    btn.textContent = result.ok ? '✅ تم التحميل!' : `❌ ${result.error||'حدث خطأ'}`;
    setTimeout(()=>{ btn.disabled = false; btn.textContent = original; }, 2500);
  });
  containerEl.appendChild(btn);
}
