/* =========================================================================================
   مُولِّد PDF تمارين الدرس والحل النموذجي
   ========================================================================================= */

/**
 * تحميل المكتبات المطلوبة (html2canvas و jsPDF)
 * إذا كانت محملة بالفعل تُرجع Promise مستقل
 */
async function ensurePdfLibraries(){
  return new Promise((resolve, reject)=>{
    let ready = (typeof html2canvas !== 'undefined') && window.jspdf && window.jspdf.jsPDF;
    if(ready) return resolve();

    const scripts = [
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', name: 'html2canvas' },
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', name: 'jsPDF' }
    ];

    let loaded = 0;
    scripts.forEach(script=>{
      const s = document.createElement('script');
      s.src = script.src;
      s.onerror = ()=> reject(new Error(`تعذّر تحميل ${script.name}`));
      s.onload = ()=>{
        loaded++;
        if(loaded === scripts.length){
          setTimeout(()=>{
            const ready = (typeof html2canvas !== 'undefined') && window.jspdf && window.jspdf.jsPDF;
            if(ready) resolve();
            else reject(new Error('المكتبات لم تُحمّل بشكل صحيح'));
          }, 100);
        }
      };
      document.head.appendChild(s);
    });
  });
}

/**
 * إنشاء ملف PDF للتمارين (بدون الحلول)
 * يحتوي على نفس الأسئلة بمساحات فارغة للكتابة اليدوية
 */
async function generateExercisePDF(lesson, exerciseData){
  try{
    await ensurePdfLibraries();
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    let yPosition = 15;
    const margin = 15;
    const contentWidth = pageWidth - (2 * margin);
    
    // ===== الرأس (اسم المنصة واسم الدرس) =====
    pdf.setFillColor(169, 127, 42); // ذهبي
    pdf.rect(margin, 8, contentWidth, 12, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text('منصة الأستاذ محمد أبوشاكر لعبودي — تمارين الدرس', pageWidth/2, 15, { align: 'center' });
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    yPosition = 28;
    pdf.text(`📚 ${lesson.title}`, margin, yPosition);
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(80, 80, 80);
    yPosition += 8;
    const instructions = `⏤ اكتب إجابتك يدويًا في المسافات المتروكة أسفل كل سؤال\n⏤ لا تتردد في الاستعانة بملفات الدرس والفيديوهات`;
    const instructionLines = pdf.splitTextToSize(instructions, contentWidth);
    pdf.text(instructionLines, margin, yPosition);
    yPosition += (instructionLines.length * 5) + 5;
    
    // ===== الأسئلة =====
    pdf.setTextColor(0, 0, 0);
    
    const sections = exerciseData.sections || [];
    sections.forEach((section, sectionIdx)=>{
      // عنوان القسم
      pdf.setFontSize(11);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(169, 127, 42);
      yPosition += 3;
      pdf.text(section.title, margin, yPosition);
      yPosition += 7;
      
      // تعليمات القسم
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(100, 100, 100);
      if(section.instructions){
        const instructLines = pdf.splitTextToSize(section.instructions, contentWidth - 4);
        pdf.text(instructLines, margin + 2, yPosition);
        yPosition += (instructLines.length * 4) + 3;
      }
      
      // محتوى الأسئلة حسب النوع
      if(section.type === 'fill'){
        // أسئلة ملء الفراغات
        section.items.forEach((item, itemIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'normal');
          
          const questionNum = itemIdx + 1;
          const questionText = `${questionNum}) ${item.before} ________ ${item.after}`;
          const lines = pdf.splitTextToSize(questionText, contentWidth - 4);
          
          pdf.text(lines, margin + 2, yPosition);
          yPosition += (lines.length * 5) + 12; // مساحة إضافية للكتابة
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
      } 
      else if(section.type === 'extract'){
        // أسئلة الاستخراج
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'normal');
        
        // النص المراد الاستخراج منه
        const sourceLines = pdf.splitTextToSize(section.sourceText, contentWidth - 4);
        pdf.text(sourceLines, margin + 2, yPosition);
        yPosition += (sourceLines.length * 4) + 5;
        
        if(yPosition > pageHeight - 15){
          pdf.addPage();
          yPosition = 15;
        }
        
        // جدول للاستخراج
        pdf.setFontSize(8);
        pdf.setTextColor(169, 127, 42);
        pdf.text('استخرج المعطوف والمعطوف عليه وحرف العطف:', margin + 2, yPosition);
        yPosition += 5;
        
        // صفوف فارغة للملء
        for(let i = 0; i < (section.pairs ? section.pairs.length : 5); i++){
          pdf.setDrawColor(169, 127, 42);
          pdf.rect(margin + 2, yPosition, contentWidth - 4, 8);
          yPosition += 9;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        }
        yPosition += 3;
      }
      else if(['irab', 'term', 'sentence'].includes(section.type)){
        // الإعراب والمعاني والجمل
        section.items.forEach((item, itemIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'bold');
          
          const label = item.word || item.term || '';
          const questionNum = itemIdx + 1;
          pdf.text(`${questionNum}) ${label}`, margin + 2, yPosition);
          yPosition += 6;
          
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          
          // مساحة للإجابة
          const lineCount = section.type === 'irab' ? 6 : 3;
          for(let l = 0; l < lineCount; l++){
            pdf.setDrawColor(200, 200, 200);
            pdf.line(margin + 4, yPosition, pageWidth - margin - 4, yPosition);
            yPosition += 4;
          }
          
          yPosition += 3;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
      }
      
      yPosition += 5;
    });
    
    // تنزيل الملف
    pdf.save(`${lesson.title.replace(/\s+/g, '_')}_تمارين.pdf`);
    return { ok: true };
  }
  catch(err){
    console.error('generateExercisePDF error:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * إنشاء ملف PDF للحل النموذجي (Answer Key)
 */
async function generateAnswerKeyPDF(lesson, exerciseData){
  try{
    await ensurePdfLibraries();
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    let yPosition = 15;
    const margin = 15;
    const contentWidth = pageWidth - (2 * margin);
    
    // ===== الرأس =====
    pdf.setFillColor(41, 128, 107); // أخضر
    pdf.rect(margin, 8, contentWidth, 12, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text('منصة الأستاذ محمد أبوشاكر لعبودي — الحل النموذجي', pageWidth/2, 15, { align: 'center' });
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    yPosition = 28;
    pdf.text(`📚 ${lesson.title}`, margin, yPosition);
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(80, 80, 80);
    yPosition += 8;
    pdf.text('الحل النموذجي الصحيح — استخدمه بعد محاولة حل التمارين بنفسك', margin, yPosition);
    yPosition += 8;
    
    // ===== الحلول =====
    pdf.setTextColor(0, 0, 0);
    
    const sections = exerciseData.sections || [];
    sections.forEach((section, sectionIdx)=>{
      // عنوان القسم
      pdf.setFontSize(11);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(41, 128, 107);
      yPosition += 3;
      pdf.text(section.title, margin, yPosition);
      yPosition += 7;
      
      // محتوى الحلول
      if(section.type === 'fill'){
        // ملء الفراغات
        section.items.forEach((item, itemIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'normal');
          
          const questionNum = itemIdx + 1;
          const answerText = `${questionNum}) ${item.before} ${item.answer} ${item.after}`;
          const lines = pdf.splitTextToSize(answerText, contentWidth - 4);
          
          pdf.setFont(undefined, 'normal');
          pdf.text(lines, margin + 2, yPosition);
          yPosition += (lines.length * 5) + 3;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
      }
      else if(section.type === 'extract'){
        // الاستخراج - قائمة بجميع الحالات
        pdf.setTextColor(41, 128, 107);
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.text('الحالات المستخرجة من النص:', margin + 2, yPosition);
        yPosition += 6;
        
        section.pairs.forEach((pair, pairIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(8);
          pdf.setFont(undefined, 'normal');
          
          const pairText = `${pairIdx + 1}) المعطوف عليه: "${pair.before}" - حرف العطف: "${pair.conj}" - المعطوف: "${pair.after}"`;
          const lines = pdf.splitTextToSize(pairText, contentWidth - 4);
          pdf.text(lines, margin + 4, yPosition);
          yPosition += (lines.length * 4) + 2;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
        yPosition += 3;
      }
      else if(section.type === 'irab'){
        // الإعراب
        section.items.forEach((item, itemIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'bold');
          
          const questionNum = itemIdx + 1;
          pdf.text(`${questionNum}) الكلمة: "${item.word}"`, margin + 2, yPosition);
          yPosition += 5;
          
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(41, 128, 107);
          pdf.text('الإعراب:', margin + 4, yPosition);
          yPosition += 4;
          
          pdf.setTextColor(0, 0, 0);
          const answerLines = pdf.splitTextToSize(item.answer, contentWidth - 8);
          pdf.text(answerLines, margin + 6, yPosition);
          yPosition += (answerLines.length * 4) + 4;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
      }
      else if(section.type === 'term'){
        // معاني حروف العطف
        section.items.forEach((item, itemIdx)=>{
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'bold');
          
          const questionNum = itemIdx + 1;
          pdf.text(`${questionNum}) "${item.term}"`, margin + 2, yPosition);
          yPosition += 5;
          
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(41, 128, 107);
          pdf.text('المعنى:', margin + 4, yPosition);
          yPosition += 4;
          
          pdf.setTextColor(0, 0, 0);
          const answerLines = pdf.splitTextToSize(item.answer, contentWidth - 8);
          pdf.text(answerLines, margin + 6, yPosition);
          yPosition += (answerLines.length * 4) + 4;
          
          if(yPosition > pageHeight - 15){
            pdf.addPage();
            yPosition = 15;
          }
        });
      }
      else if(section.type === 'sentence'){
        // جمل توضيحية
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'normal');
        const note = 'ملاحظة: هذا القسم يتطلب حلولاً فردية. الحل النموذجي يظهر أمثلة على الاستخدام الصحيح.';
        const noteLines = pdf.splitTextToSize(note, contentWidth - 4);
        pdf.text(noteLines, margin + 2, yPosition);
        yPosition += (noteLines.length * 4) + 4;
      }
      
      yPosition += 3;
    });
    
    // تنزيل الملف
    pdf.save(`${lesson.title.replace(/\s+/g, '_')}_الحل_النموذجي.pdf`);
    return { ok: true };
  }
  catch(err){
    console.error('generateAnswerKeyPDF error:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * إظهار أزرار تنزيل PDF بجانب نتيجة التمرين
 */
function addPdfDownloadButtons(lesson, exerciseData, containerEl){
  if(!containerEl) return;
  
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = `
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 16px;
    flex-wrap: wrap;
  `;
  
  // زر تنزيل التمارين
  const exerciseBtn = document.createElement('button');
  exerciseBtn.textContent = '📄 تحميل التمارين (بدون حل)';
  exerciseBtn.style.cssText = `
    padding: 10px 16px;
    background: linear-gradient(160deg, #ffc107, #ff9800);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(169, 127, 42, 0.3);
    transition: all 0.3s ease;
  `;
  
  exerciseBtn.addEventListener('mouseover', ()=>{
    exerciseBtn.style.transform = 'translateY(-2px)';
    exerciseBtn.style.boxShadow = '0 6px 16px rgba(169, 127, 42, 0.4)';
  });
  
  exerciseBtn.addEventListener('mouseout', ()=>{
    exerciseBtn.style.transform = 'translateY(0)';
    exerciseBtn.style.boxShadow = '0 4px 12px rgba(169, 127, 42, 0.3)';
  });
  
  exerciseBtn.addEventListener('click', async ()=>{
    exerciseBtn.disabled = true;
    exerciseBtn.textContent = '⏳ جاري إنشاء الملف…';
    const result = await generateExercisePDF(lesson, exerciseData);
    if(result.ok){
      exerciseBtn.textContent = '✅ تم التحميل!';
      setTimeout(()=>{
        exerciseBtn.disabled = false;
        exerciseBtn.textContent = '📄 تحميل التمارين (بدون حل)';
      }, 2000);
    } else {
      exerciseBtn.textContent = '❌ خطأ في التحميل';
      setTimeout(()=>{
        exerciseBtn.disabled = false;
        exerciseBtn.textContent = '📄 تحميل التمارين (بدون حل)';
      }, 2000);
    }
  });
  
  // زر تنزيل الحل النموذجي
  const answerKeyBtn = document.createElement('button');
  answerKeyBtn.textContent = '🔑 تحميل الحل النموذجي';
  answerKeyBtn.style.cssText = `
    padding: 10px 16px;
    background: linear-gradient(160deg, #4caf50, #45a049);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
    transition: all 0.3s ease;
  `;
  
  answerKeyBtn.addEventListener('mouseover', ()=>{
    answerKeyBtn.style.transform = 'translateY(-2px)';
    answerKeyBtn.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
  });
  
  answerKeyBtn.addEventListener('mouseout', ()=>{
    answerKeyBtn.style.transform = 'translateY(0)';
    answerKeyBtn.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
  });
  
  answerKeyBtn.addEventListener('click', async ()=>{
    answerKeyBtn.disabled = true;
    answerKeyBtn.textContent = '⏳ جاري إنشاء الملف…';
    const result = await generateAnswerKeyPDF(lesson, exerciseData);
    if(result.ok){
      answerKeyBtn.textContent = '✅ تم التحميل!';
      setTimeout(()=>{
        answerKeyBtn.disabled = false;
        answerKeyBtn.textContent = '🔑 تحميل الحل النموذجي';
      }, 2000);
    } else {
      answerKeyBtn.textContent = '❌ خطأ في التحميل';
      setTimeout(()=>{
        answerKeyBtn.disabled = false;
        answerKeyBtn.textContent = '🔑 تحميل الحل النموذجي';
      }, 2000);
    }
  });
  
  btnContainer.appendChild(exerciseBtn);
  btnContainer.appendChild(answerKeyBtn);
  containerEl.appendChild(btnContainer);
}
