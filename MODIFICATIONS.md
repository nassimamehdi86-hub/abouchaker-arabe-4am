# Modifications apportées

## Résumé
1. Renommage des 4 groupes (أفواج) Zoom : numérotation → noms des jours.
2. Possibilité d'ajouter plusieurs liens (vidéo / résumé / exercices) par groupe.
3. Envoi de la solution (photo/fichier) au professeur via un bot Telegram, **intégré directement dans l'onglet du groupe** (plus besoin de choisir le groupe séparément — il est déjà connu par l'onglet ouvert), sans texte explicatif superflu : juste le champ fichier et le bouton d'envoi.

## Fichiers modifiés / ajoutés

### `app.js`
- `ZOOM_GROUPS` : libellés = noms des jours.
- `ZoomLinks` : `video` / `summary` / `exercises` sont des tableaux (liens multiples), rétrocompatible avec les anciennes données.
- `renderZoomGroupsBox` : quand l'élève ouvre l'onglet d'un فوج, le champ + bouton d'envoi de solution apparaissent directement sous les documents/la vidéo de CE فوج (`buildSolutionInlineHtml` + `wireSolutionInline`).
- `SolutionSubmit.send()` : envoie le fichier + légende (nom, téléphone, فوج, titre du cours) au bot Telegram (`sendPhoto`/`sendDocument`).

### `telegram-config.js` (nouveau fichier)
- `TELEGRAM_CONFIG.botToken` et `chatId`, à remplir par l'utilisateur (instructions en commentaire dans le fichier).

### `index.html`
- Ajout de `<script src="telegram-config.js"></script>` avant `app.js`.

### `style.css`
- Classes zoom-* pour les liens multiples et les onglets vidéo (voir historique).
- `.solution-inline-row`, `.solution-inline-file`, `.solution-file-preview`, `.solution-file-name` pour le bloc d'envoi minimal intégré à l'onglet.

## Résultats
- ✅ Noms de groupes = jours de la semaine.
- ✅ Liens multiples par groupe et par type.
- ✅ L'élève envoie sa solution directement depuis l'onglet de son فوج, sans champ de sélection ni texte explicatif — juste le fichier et le bouton.
- ✅ Le professeur reçoit sur Telegram : nom, prénom, téléphone, groupe, titre du cours + le fichier.
- ✅ Rien ne se passe (message clair) tant que `telegram-config.js` n'est pas rempli.

## Notes
- Tous les autres fichiers sont inchangés.
- La configuration du bot Telegram (`telegram-config.js`) reste à compléter par l'utilisateur.

## Mise à jour — Statistiques des solutions (indépendantes de Telegram)

### Contexte
Le bouton "حلول التلاميذ لتمارين الزوم" du panneau admin ouvrait directement la conversation Telegram du bot. Ajout demandé : une fenêtre affichant, pour chaque leçon, le nombre d'élèves ayant envoyé une solution, groupés par فوج, avec leurs noms — en plus du bouton Telegram (qui reste pour consulter les fichiers eux-mêmes).

### `app.js`
- Nouvel objet `ZoomSolutions` : `log(lesson, groupKey, groupLabel)` enregistre un document Firestore `zoomSolutions/{lessonId}_{studentId}` (drapeau léger : leçon, فوج, nom/ID élève, horodatage — **aucun fichier**) ; `allGrouped()` relit toute la collection et la regroupe par leçon puis par فوج.
- `wireSolutionInline()` appelle désormais `ZoomSolutions.log(...)` juste après un envoi Telegram réussi (les deux mécanismes sont indépendants : l'échec de l'un n'affecte pas l'autre).
- Nouvelle fenêtre `openSolutionsModal()` / `renderSolutionsStats()` : bouton "فتح محادثة الحلول على تيليجرام" en haut, puis la liste des leçons avec compteur et noms par فوج.
- Le clic sur `#solutionsBotBtn` (panneau admin) ouvre désormais cette fenêtre au lieu d'ouvrir Telegram directement.

### ⚠️ Étape manuelle requise
La collection Firestore `zoomSolutions` est nouvelle : il faut ajouter et **republier** cette règle dans la console Firebase (Firestore Database → Rules), sinon la lecture/écriture sera refusée (permission-denied) :

```
match /zoomSolutions/{docId} {
  allow read, write: if true;
}
```


## Mise à jour — Section Dردشة (chat) + questions dirigées vers l'enseignant (#الاستاذ)

### Contexte
Ajout d'un espace de discussion accessible aux élèves depuis l'accueil ("💬 الدردشة"). Chaque message affiche le nom complet de l'élève. Si un message contient le mot-clé `#الاستاذ`, il est traité comme une question destinée à l'enseignant : elle apparaît immédiatement dans le panneau admin (section "❓ أسئلة التلاميذ") en temps réel, en plus de rester visible dans le fil de discussion avec un badge "⏳ بانتظار رد الأستاذ". L'enseignant peut répondre par texte ou par message vocal (micro du navigateur, enregistré puis envoyé sur Firebase Storage) ; la réponse s'affiche ensuite pour **tous** les élèves dans la discussion, juste sous la question, avec le nom et le texte de l'élève qui a posé la question.

### `app.js`
- Nouvel objet `Chat` (élève) : `ensureListening()` écoute en temps réel (`onSnapshot`) la collection `chatMessages`, `send()` détecte le tag `#الاستاذ` et enregistre `isQuestion`, `answered`, etc. `renderMessages()` affiche les bulles normales, les questions en attente, et la réponse (texte ou lecteur audio) une fois publiée.
- `renderChatScreen()` : câble l'input et le bouton d'envoi de l'écran `screen-chat`.
- Nouvel objet `ChatAdmin` (enseignant) : `ensureListening()` écoute les questions non répondues (`isQuestion==true`, `answered==false`) et les injecte dans `#chatQuestionsBody` du panneau admin. `wire()` gère l'envoi d'une réponse écrite. `toggleRecording()` gère l'enregistrement micro (`MediaRecorder`), l'upload du fichier `.webm` vers Firebase Storage (`teacherAnswers/{id}-{timestamp}.webm`) et l'enregistrement de l'URL obtenue sur le document de la question.
- `renderAdminPanel()` : nouvel accordéon "❓ أسئلة التلاميذ (الدردشة)" + appel à `ChatAdmin.ensureListening()`.
- `Screens` : ajout de l'écran `chat` (liste `Screens.el`, appel de `renderChatScreen()` dans `Screens.show`).

### `index.html`
- Nouvelle carte d'accueil "💬 الدردشة" (`data-nav="chat"`).
- Nouvel écran `#screen-chat` : rappel du tag `#الاستاذ`, zone des messages (`#chatMessagesWrap`), champ + bouton d'envoi (`#chatInput` / `#chatSendBtn`).

### `style.css`
- Classes `.chat-*` pour les bulles de message, les questions en attente, les réponses de l'enseignant (avec lecteur `<audio>`), la barre de saisie collante, et les cartes de question côté admin (`.chat-q-card`).

### ⚠️ Étapes manuelles requises (Firebase)
1. **Firestore → Rules** : ajouter et republier (nouvelle collection `chatMessages`) :
```
match /chatMessages/{docId} {
  allow read, write: if true;
}
```
2. **Firestore → Indexes** : la requête des questions non répondues (`isQuestion==true` + `answered==false`, triée par `createdAt`) nécessite un index composite. S'il manque, Firestore refuse la requête et affiche dans la console du navigateur un lien direct "Create index" — il suffit de l'ouvrir et de cliquer sur "Créer".

Sans ces étapes, la discussion affichera une erreur "permission-denied".

### Note — pas de Firebase Storage (compte Blaze/payant requis)
Firebase Storage nécessite désormais un forfait payant (Blaze) sur ce projet. Pour éviter cette exigence, la réponse vocale de l'enseignant n'est **pas** envoyée sur Storage : elle est enregistrée via `MediaRecorder`, convertie en Base64 (Data URL), puis stockée directement dans le champ `answerAudioUrl` du document `chatMessages` correspondant (fonctionne avec le forfait Spark gratuit). L'enregistrement est limité à 60 secondes (arrêt automatique) afin de rester sous la limite de taille d'un document Firestore (1 Mo).

## Mise à jour — Bouton "❓ للأستاذ" + limite d'un sujet direct par semaine

### Contexte
Demande : (1) rendre le tag `#الاستاذ` accessible aux élèves sans avoir à le taper (un bouton dans la barre de saisie), et (2) limiter chaque élève à une seule question directe à l'enseignant par semaine.

### `app.js`
- `Student` : nouveaux champs `lastQuestionAt` (chargé depuis `students/{id}.lastQuestionAt` à la connexion/reprise de session, et tenu à jour via l'écouteur `watchSession`) et méthodes `canAskQuestion()` / `daysUntilNextQuestion()` (cooldown de 7 jours).
- `Chat.send()` : si le message contient `#الاستاذ`, vérifie `Student.canAskQuestion()` avant l'envoi (bloque avec message clair sinon) ; après un envoi réussi, met à jour `students/{id}.lastQuestionAt` (`serverTimestamp`) et l'état local.
- `updateChatQuotaNote()` : affiche dans `#chatQuotaNote` si l'élève peut encore poser une question cette semaine, ou dans combien de jours.
- `renderChatScreen()` : câble le nouveau bouton `#chatAskTeacherBtn` qui insère `#الاستاذ` dans le champ de saisie (et refuse avec le même message si le quota est déjà utilisé).

### `index.html`
- Ajout du bouton "❓ للأستاذ" dans la barre de saisie de `#screen-chat`, et d'une ligne `#chatQuotaNote` sous le rappel du tag.

### `style.css`
- `.chat-quota-note` pour la ligne de statut du quota hebdomadaire.

### Note
Le quota est stocké sur le document de l'élève lui-même (`students/{id}.lastQuestionAt`), aucune nouvelle collection ni règle Firestore requise (les règles `students/{id}` autorisent déjà `update`).

## Mise à jour — Fenêtre de discussion unique avec défilement interne (façon WhatsApp/Telegram)

### Contexte
Demande : ne plus afficher chaque message dans un cadre séparé, mais avoir un seul grand écran de discussion avec défilement interne (haut/bas), et le champ de saisie fixé en bas.

### `index.html`
- `#chatMessagesWrap` est désormais entouré d'un conteneur `.chat-window` (le cadre unique de toute la conversation) et porte lui-même la classe `.chat-messages-scroll` (hauteur fixe, défilement interne).

### `style.css`
- `.chat-window` / `.chat-messages-scroll` : un seul cadre pour toute la discussion, hauteur généreuse (`64vh`, entre 360px et 680px), défilement interne fluide.
- Bulles de message (`.chat-msg`, `.chat-question`, `.chat-answer`) : suppression des bordures individuelles, remplacées par un simple fond coloré (façon bulle de discussion), plus compactes.
- `.chat-input-row` : n'est plus en `position:sticky` (qui n'était pas fiable partout) — reste simplement juste sous la fenêtre de discussion, donc toujours visible sans avoir à faire défiler la page.

## Refonte des exercices "livre" — un exercice = une seule page (au lieu d'être éclaté en questions isolées)

### Problème signalé
Le moteur d'exercices affichait chaque sous-item d'un exercice comme une question plein-écran séparée ("سؤال 9 من 28"), ce qui :
- coupait certains items de leur contexte (ex. un mot à analyser en إعراب s'affichait seul, sans le texte source) ;
- éclatait un même exercice du livre (ex. التمرين 9 : استخراج + إعراب) en deux sections indépendantes ;
- pour التمرين 8, présentait chaque blanc comme une question isolée au lieu d'une phrase continue à trous.
De plus, le texte source de l'exercice 9 (`content/exercises/atf-nasaq.json`) était tronqué (les puces manquaient), alors que plusieurs paires attendues venaient justement de ces puces.

### Nouveau modèle (réutilisable pour tout futur exercice)
`data.sections` reste le format de fichier, mais **chaque section = une page complète = un exercice du livre**, affichée en une seule fois avec un seul bouton "تحقق" :
- `type:"fill"` + `passage:[{text}|{blank,answer}]` → phrase continue avec des champs de saisie **en ligne** aux emplacements des trous (au lieu d'un champ unique par item). Ancien format `items:[{before,after,answer}]` toujours supporté (rétrocompatibilité `badal.json`), affiché comme une liste groupée sur une seule page.
- `type:"extract"` peut désormais inclure `irabItems` + `irabInstructions` : le texte source, le tableau d'extraction ET la liste d'إعراب s'affichent **ensemble** sur la même page (un seul تحقق, score combiné pondéré par nombre d'items).
- `type:"term" | "sentence" | "irab"` : tous les items de la section s'affichent en liste sur une seule page (au lieu d'un item par écran).

### Fichiers modifiés
- `app.js` : `buildExerciseUnits` → `buildExercisePages` (une page = une section, plus de "flatten"). `createOpenExerciseEngine` réécrit avec `renderFillPassagePage`, `renderFillListPage` (legacy), `renderExtractPage` (extract + irab fusionnés), `renderWordListPage` (irab/term/sentence). Suppression de la copie codée en dur de `atf-nasaq` dans `LESSON_EXERCISES` — ce cours est désormais chargé uniquement depuis `content/exercises/atf-nasaq.json` (source unique). **Pattern à suivre pour tout nouveau cours : ajouter uniquement un fichier `content/exercises/<lessonId>.json`, sans toucher à `app.js`.**
- `content/exercises/atf-nasaq.json` : reconstruit fidèlement à partir des photos du cahier (التمرين 8 en phrase continue à 18 trous ; التمرين 9 avec le texte source complet — y compris les puces manquantes — et fusion استخراج + إعراب ; التمرين 10 inchangé mais affiché en une seule page).
- `exercise-pdf-generator.js` : génération PDF (fiche d'exercice + corrigé) mise à jour pour le nouveau format `passage` et pour l'إعراب fusionné dans la section `extract`.
- `style.css` : nouvelles classes `.book-exercise-title`, `.book-exercise-instr`, `.book-sub-instr`, `.passage-block`, `.inline-blank-input`, `.book-item-row`, `.book-item-feedback`.

## تحديث — إخفاء الدروس المغلقة + تقديم تمارين الدرس (تحسين الفهم وإنجاز التمارين)

### السياق
التلاميذ يشتكون من صعوبة فهم المنصة، ونسبة إنجاز التمارين ضعيفة جدًا (17 من 400 تلميذ فقط).

### `app.js`
- `renderLessonsScreen`: قائمة الدروس في كل تصنيف تُصفّى الآن لتعرض فقط الدروس المفتوحة فعليًا (`!Locks.isLessonLocked`) أو التي بانتظار المحتوى (`locked==='pending'`). الدروس المغلقة (لم يفتحها الأستاذ بعد) لا تظهر إطلاقًا في القائمة، بدل عرضها سابقًا بأيقونة 🔒 قابلة للرؤية لكن غير قابلة للفتح. عدّاد "X دروس" أعلى كل تصنيف يعكس الآن العدد المرئي فقط.

### `index.html`
- صفحة تفاصيل الدرس: قسم "تمارين الدرس" (`ldExercisesSection`) نُقل ليظهر مباشرة بعد شرح الدرس النصي (`ldDef`)، قبل الفيديو وتسجيلات الزوم والخريطة الذهنية واختبار الفهم (كان في آخر الصفحة). عنوان القسم أصبح "📝 تمارين الدرس (الواجب المنزلي)" لزيادة وضوح أنها المطلوب إنجازه.

### الهدف
- تفادي إرباك التلميذ بدروس يراها لكنه لا يستطيع فتحها.
- رفع نسبة إنجاز التمارين بوضعها في أول ما يراه التلميذ عند فتح الدرس، بدل دفنها تحت أقسام أخرى (فيديو، زوم، خريطة ذهنية، اختبار).

### ملاحظة
لم يُعدَّل أي منطق آخر (الأقفال، الترتيب، الحفظ التدريجي للتمارين... كلها كما هي).

## تحديث — صفحة الدرس بنوافذ (تبويبات) بدل صفحة طويلة واحدة

### السياق
طلب تحويل صفحة الدرس إلى نوافذ منفصلة: الخريطة الذهنية، حصص الزوم والواجب المنزلي، اختبار الفهم، تمارين الدرس — بدل تمرير طويل بين كل الأقسام.

### `index.html`
- الشرح النصي وفيديو الأستاذ يبقيان ثابتين أعلى الصفحة (كمقدمة الدرس).
- الأقسام الأربعة (`ldExercisesSection`, `ldZoomSection`, `ldQuizSection`, `ldMindmapSection`) أصبحت كلها بصنف `ld-tab-panel`، وأضيف شريط أزرار `#ldTabs` فوقها.

### `app.js`
- دالة جديدة `setupLdTabs(panels, defaultKey)`: تبني أزرار التبويبات من الأقسام المتاحة فعليًا لهذا الدرس فقط (مثلاً درس بلا تسجيلات زوم لا يظهر له تبويب "حصص الزوم")، وتُظهر نافذة واحدة فقط فالمرة. إذا بقي قسم واحد فقط (كدرس zoomOnly) يختفي شريط التبويبات ويظهر القسم مباشرة بلا أزرار.
- `openLessonDetail`: بدل تبديل `style.display` لكل قسم يدويًا، أصبحت تحسب الأقسام المتاحة لهذا الدرس وتستدعي `setupLdTabs` بها. **التبويب المفتوح افتراضيًا هو "تمارين الدرس"** (الأولوية، بسبب ضعف نسبة الإنجاز).

### `style.css`
- كلاسات جديدة: `.ld-tabs`, `.ld-tab-btn`, `.ld-tab-btn.active` — بنفس أسلوب أزرار تبويبات الزوم الموجودة مسبقًا (شبكة أزرار ذهبية عند التفعيل).

### افتراض
اخترت "تمارين الدرس" كتبويب افتراضي (أول ما يراه التلميذ) بدل "الخريطة الذهنية" لأنه هو المشكلة الملحّة (17/400). إذا بغيتي ترتيب أو تبويب افتراضي آخر، قوليلي.
