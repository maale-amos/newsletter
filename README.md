# עיתון מעלה עמוס · maale-newsletter

מערכת כתיבה ועריכה לוועד התקשורת של מעלה עמוס.

🔗 **חי ב:** https://maale-amos.github.io/newsletter/

## ארכיטקטורה — פורסת לחלוטין על GitHub Pages
- **אין Apps Script.** האתר לא תלוי בשום שירות חיצוני שעלול להיחסם.
- **אין Backend.** כל הנתונים בדפדפן (localStorage) + קבצי JSON ב-repo.
- **AI אופציונלי:** הזן Gemini API Key פעם אחת בדפדפן — הקריאה ישירה מהדפדפן ל-Gemini.
- **PDF:** ייצוא דרך הדפסה (Ctrl+P → Save as PDF), ללא תלות בספרייה חיצונית.

## תכונות
- כתיבת כתבות עשירה (RTL, Heebo, Frank Ruhl Libre)
- עורך עם כלים בסיסיים: כותרות, רשימות, תמונות
- שמירה אוטומטית ל-localStorage כל 5 שניות
- בנק תמונות עם תיוג והקטנה אוטומטית (1200px)
- חיפוש מיידי בכתבות ובתמונות
- ייצוא PDF
- AI דרך Gemini Flash (אופציונלי, מצריך API key חינמי)

## מבנה
```
index.html       רשימת כתבות
editor.html      עורך כתבה + AI
gallery.html     בנק תמונות
archive.html     ארכיון (placeholder)
data/
  articles.json  זרע ראשוני (ריק)
  photos.json    זרע ראשוני (ריק)
assets/
  css/main.css
  js/
    api.js       layer של נתונים (localStorage + JSON)
    index.js     רשימת כתבות
    editor.js    עורך
    gallery.js   גלריית תמונות
```

## איך זה עובד
1. בכניסה ראשונה — האתר טוען את `data/articles.json` ו-`data/photos.json` (ריקים בהתחלה).
2. כל שינוי נשמר אוטומטית ל-localStorage של הדפדפן.
3. נתונים מתמשכים בין רענונים, אבל מקומיים לדפדפן הזה.
4. לסנכרון בין מכשירים — ייצוא/ייבוא JSON ידני (תכונה עתידית).
5. AI: בלחיצה על "הגה"ה"/"קיצור"/וכו', האתר ישאל פעם אחת ל-Gemini API key, ישמור מקומית, ויקרא ישירות ל-API של Gemini.

### Gemini API Key חינמי
- היכנס ל-https://aistudio.google.com/app/apikey
- צור API Key
- הזן באתר בפעם הראשונה שתלחץ על AI

## הרשאות עריכה
- יוסף שניידר — admin
- עמנואל רקטובסקי — מורשה (לפי project memory)
