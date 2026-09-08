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

