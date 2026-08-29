/* =========================================================================================
   شريط الأمثال والحكم — Wisdom Quotes Banner
   يعرض أمثالاً وعبراً مشجعة للتلاميذ بتصميم ذهبي أنيق
   ========================================================================================= */

const WisdomQuotes = {
  quotes: [
    "العلم نور يضيء الطريق نحو المستقبل المشرق",
    "من جدّ وجد، ومن سار على الطريق وصل إلى الهدف",
    "اطلب العلم من المهد إلى اللحد",
    "العقل السليم في الجسم السليم يحتاج إلى علم صليب",
    "الاجتهاد والمثابرة مفاتيح النجاح والتفوق",
    "كل صعب يسير إذا صبرت عليه",
    "لا تستح من طلب العلم فإن العلم ضياع النفس",
    "من سعى إلى تحسين نفسه فقد وجد الطريق الصحيح",
    "التعليم هو أفضل استثمار في حياتك",
    "المثابرة والعزيمة تحقق المستحيل",
    "اليوم الذي لا تتعلم فيه شيئاً جديداً يوم ضائع",
    "لكل مجتهد نصيب من التقدم والنجاح",
    "الخطأ خطوة نحو التعلم الصحيح",
    "تذكر دائماً: أنت قادر على تحقيق أحلامك",
    "الوقت ذهب، فلا تضيعه بالتأخير والكسل",
    "المعلم الفاضل هو الذي يبني في أذهان طلابه معانياً سليمة",
    "اللغة العربية لسان قومك وهويتك",
    "حين تحب ما تتعلمه تصبح الدراسة متعة وليست عبء",
    "أنت أقوى مما تظن، وقدراتك أعظم من أحلامك",
    "كل خطوة صغيرة في الدراسة تقربك من حلمك الكبير"
  ],

  currentIndex: 0,
  quoteInterval: null,
  displayElement: null,

  /* تهيئة شريط الأمثال */
  init(containerElement) {
    if (!containerElement) return;
    this.displayElement = containerElement;
    this.currentIndex = 0;
    this.displayQuote();
    /* تغيير الأمثال كل 6 ثوانٍ */
    this.quoteInterval = setInterval(() => this.nextQuote(), 6000);
  },

  /* عرض الأمثال الحالي */
  displayQuote() {
    if (!this.displayElement) return;
    const quote = this.quotes[this.currentIndex];
    this.displayElement.innerHTML = `
      <div class="wisdom-banner">
        <div class="wisdom-content">
          <span class="wisdom-icon">✨</span>
          <div class="wisdom-text">${quote}</div>
          <span class="wisdom-indicator">${this.currentIndex + 1}/${this.quotes.length}</span>
        </div>
      </div>
    `;
  },

  /* الانتقال إلى الأمثال التالي */
  nextQuote() {
    this.currentIndex = (this.currentIndex + 1) % this.quotes.length;
    this.displayQuote();
  },

  /* الانتقال إلى الأمثال السابق */
  prevQuote() {
    this.currentIndex = (this.currentIndex - 1 + this.quotes.length) % this.quotes.length;
    this.displayQuote();
  },

  /* التوقف عن تحديث الأمثال */
  stop() {
    if (this.quoteInterval) {
      clearInterval(this.quoteInterval);
      this.quoteInterval = null;
    }
  }
};
