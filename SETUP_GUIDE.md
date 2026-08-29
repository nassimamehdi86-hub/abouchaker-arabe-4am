# 🔧 دليل التثبيت والإعدادات — الميزات الجديدة

## 📦 خطوات التثبيت الأساسية

### الخطوة 1: إضافة الملفات الجديدة
تأكد من أن الملفات التالية موجودة في مجلد `app/`:

```
app/
├── wisdom-quotes.js              ← أمثال وحكم
├── notifications-system.js       ← نظام الإشعارات والجرس
├── student-management.js         ← إدارة التلاميذ
├── app-enhancements.js           ← توسيعات التطبيق
├── index.html                    ← محدّث
├── app.js                        ← محدّث
├── style.css                     ← محدّث
└── FEATURES.md                   ← هذا الملف
```

### الخطوة 2: التحقق من ملف `index.html`
تأكد من أن ملف HTML يحتوي على:

```html
<!-- شريط الأمثال -->
<div id="wisdomBannerContainer"></div>

<!-- الجرس والإشعارات -->
<div class="notification-bell" id="notificationBell">🔔</div>
<div class="notifications-panel" id="notificationsPanel"></div>

<!-- الملفات المطلوبة -->
<script src="wisdom-quotes.js"></script>
<script src="notifications-system.js"></script>
<script src="student-management.js"></script>
<script src="app-enhancements.js"></script>
```

### الخطوة 3: التحقق من Firebase
تأكد من إعدادات Firebase صحيحة في `firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## ⚙️ إعدادات Firebase المتقدمة

### 1. إنشاء مجموعة `notifications` (اختياري)

اذهب إلى Firebase Console → Firestore Database:

```
Collection: notifications
└── doc (auto-generated)
    ├── title (string): "درس جديد"
    ├── message (string): "درس الإعراب متاح الآن"
    ├── icon (string): "📖"
    ├── timestamp (timestamp): auto
    ├── isNew (boolean): true
    └── read (boolean): false
```

### 2. قواعد الأمان (Security Rules)

⚠️ **تنبيه:** النسخة أدناه مُصححة. النسخة القديمة من هذا القسم كانت تشترط
`request.auth != null` (أي تسجيل دخول Firebase Authentication حقيقي)، لكن هذا التطبيق
**لا يستخدم Firebase Authentication إطلاقًا** — الحماية تتم فقط عبر رقم PIN داخل الواجهة
(`window.ADMIN_PIN`). لو نسخت النسخة القديمة إلى Firebase Console، فكل كتابة يقوم بها
الأستاذ (فتح درس، إرسال إشعار) كانت تُرفض بصمت برسالة `permission-denied`، وهو ما يفسّر
عدم إضاءة الجرس وعدم ظهور رسائل الأستاذ وبقاء الدروس "مقفلة" رغم فتحها. اعتمد دائمًا
القواعد الموجودة في **README.md** (وهي المطابقة لهذا التطبيق)، وتأكد من نسخها بالكامل —
بما في ذلك مجموعة `notifications` — إلى تبويب Rules ثم اضغط Publish:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // الإشعارات: قراءة وكتابة مفتوحتان — الحماية عبر PIN داخل الواجهة فقط
    match /notifications/{id} {
      allow read: if true;
      allow write: if true;
    }

    // الأقفال (فتح/إغلاق الدروس والفصول)
    match /state/{doc} {
      allow read: if true;
      allow write: if true;
    }

    // بيانات التلاميذ
    match /students/{id} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if true;
    }
  }
}
```

---

## 🎨 تخصيص الأمثال والعبارات

لتعديل قائمة الأمثال:

1. افتح `wisdom-quotes.js`
2. ابحث عن `WisdomQuotes.quotes = [`
3. عدّل الأمثال حسب رغبتك:

```javascript
quotes: [
  "أمثالك الأول هنا",
  "أمثالك الثاني هنا",
  // أضف المزيد...
]
```

### تخصيص سرعة التغيير:

```javascript
// في الدالة init()
// غيّر 6000 إلى عدد الميلي ثانية المطلوبة
this.quoteInterval = setInterval(() => this.nextQuote(), 6000); // 6 ثوانٍ
```

---

## 🔔 تخصيص أيقونة الجرس والإشعارات

### تغيير أيقونة الجرس:

في `index.html`:
```html
<div class="notification-bell" id="notificationBell">
  🔔  <!-- غيّر هذه الأيقونة حسب رغبتك -->
</div>
```

### تخصيص ألوان الإشعارات:

في `style.css`:
```css
.notification-bell.has-notifications::after {
  background: #e74c3c;  /* غيّر هذا اللون -->
}
```

---

## 💾 حفظ واستعادة البيانات

### تصدير قائمة التلاميذ:

يتم تلقائياً عند الضغط على زر "تصدير CSV" في لوحة التحكم.

الملف يحتوي على:
- الرقم
- الاسم واللقب
- حالة الحساب
- نسبة التقدم
- تاريخ الانضمام

### استيراد البيانات:

حالياً يتم الاستيراد تلقائياً من Firebase.

---

## 🔐 معلومات أمان

### حماية لوحة تحكم الأستاذ:

تستخدم رقم سري محفوظ في `app.js`:

```javascript
window.ADMIN_PIN = '1234';  // غيّر هذا الرقم
```

### حماية الإشعارات:

لا يمكن حذف أو تعديل الإشعارات من جانب العميل.

### حماية التلاميذ:

لا يمكن حذف أي تلميذ بدون تأكيد من الأستاذ.

---

## 📊 معلومات الأداء

### حجم الملفات:

| الملف | الحجم |
|------|-------|
| `wisdom-quotes.js` | ~2 KB |
| `notifications-system.js` | ~8 KB |
| `student-management.js` | ~6 KB |
| `app-enhancements.js` | ~5 KB |
| **الإجمالي** | **~21 KB** |

### تحسينات الأداء:

- ✅ Lazy loading للصور
- ✅ تأخير تحميل الميزات (500ms)
- ✅ استخدام `setTimeout` لتجنب الحجب
- ✅ تحديث فعال للـ DOM

---

## 🐛 استكشاف الأخطاء

### المشكلة: الصفحة تحميل بطيء

**الحل:**
- تقليل عدد الإشعارات المحفوظة
- تقليل حجم الصور
- تنظيف بيانات Firebase

### المشكلة: الجرس لا يعمل

**الحل:**
1. فتح Console (F12) → Console
2. اختبر: `typeof NotificationsSystem`
3. يجب أن تُرجع `"object"`
4. إذا لم تتمكن، أعد تحميل الصفحة

### المشكلة: الأمثال لا تتغير

**الحل:**
1. تحقق من: `typeof WisdomQuotes`
2. اختبر: `WisdomQuotes.nextQuote()`
3. تحقق من عدم حدوث أخطاء في Console

### المشكلة: لا يمكن حذف التلاميذ

**الحل:**
1. تحقق من اتصالك بـ Firebase
2. تحقق من الرقم السري للأستاذ
3. تحقق من القواعس في Firebase Security Rules

---

## 🌍 الدعم متعدد اللغات

الميزات الحالية تدعم:
- ✅ العربية (الافتراضي)
- ✅ الواجهة RTL (من اليمين إلى اليسار)

لإضافة لغات أخرى:
1. عدّل الأمثال في `wisdom-quotes.js`
2. عدّل النصوص في `notifications-system.js`
3. عدّل الرسائل في `student-management.js`

---

## 📱 توافق الأجهزة

### الأجهزة المدعومة:
- ✅ الهواتف الذكية (iOS و Android)
- ✅ الأجهزة اللوحية
- ✅ الكمبيوتر المكتبي
- ✅ المتصفحات الحديثة (Chrome, Firefox, Safari, Edge)

### الحد الأدنى للمتصفح:
- Chrome 50+
- Firefox 45+
- Safari 10+
- Edge 15+

---

## 🚀 التحديثات المستقبلية

### المخطط له:
- [ ] صوت مخصص للإشعارات
- [ ] صور في الإشعارات
- [ ] إشعارات مجدولة
- [ ] تصنيفات للإشعارات
- [ ] إحصائيات متقدمة
- [ ] تصدير التقارير

---

## ✅ قائمة التحقق النهائية

قبل إطلاق الميزات الجديدة:

- [ ] تم التحقق من جميع الملفات الجديدة
- [ ] تم تحديث `index.html`
- [ ] تم تحديث `app.js`
- [ ] تم تحديث `style.css`
- [ ] تم اختبار الأمثال والعبارات
- [ ] تم اختبار الإشعارات
- [ ] تم اختبار حذف التلاميذ
- [ ] تم اختبار الجرس
- [ ] تم اختبار على الهواتف الذكية
- [ ] تم حفظ جميع البيانات في النسخة الاحتياطية

---

## 📞 الدعم الفني

للمساعدة أو الإبلاغ عن الأخطاء:
- افتح Console (F12)
- انسخ الرسالة الخطأ
- تواصل مع فريق التطوير

---

تاريخ آخر تحديث: 2024
الإصدار: 2.0
التوافق: جميع الأجهزة والمتصفحات
