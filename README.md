# עיתון מעלה עמוס · maale-newsletter

מערכת כתיבה ועריכה שיתופית לוועד התקשורת של מעלה עמוס.

## ארכיטקטורה (עוקפת NetFree)

```
GitHub Pages (Frontend)  ──────► Apps Script (Backend)  ──────► Drive + Gemini
       (לא חסום)                  (רץ ב-Google)                  (לא עובר במחשב)
                                       │
                                       └──► Yemot API ──► שלוחה /3 בקו 0772251404
                                            (העלאה ישירה,
                                             ללא הורדה למחשב)
```

## שלבי הפעלה

### 1. פריסת ה-Apps Script
1. ב-`apps-script/Code.gs` יש את הקוד.
2. עבור ל-https://script.google.com → New project → הדבק את הקוד.
3. Deploy → New deployment → Web App
   - Execute as: **Me**
   - Who has access: **Anyone with link**
4. העתק את ה-`/exec` URL.

### 2. הגדרת ה-Frontend
1. פתח את האתר ב-https://yossi6742853.github.io/maale-newsletter
2. בכניסה ראשונה הוא ישאל אותך ל-API URL — הדבק את ה-URL מהשלב הקודם.
3. נשמר ב-localStorage, לא צריך שוב.

### 3. שימוש
- **כתבה חדשה:** editor.html → כתוב → AI עוזר (Gemini) להגה"ה/קיצור/הצעת תמונות
- **שמירה:** אוטומטית ל-Drive בתיקייה `מעלה-עמוס-עיתון/כתבות/`
- **תמונות:** gallery.html → העלה → תיוג AI אוטומטי
- **PDF:** כפתור "ייצוא PDF" → נשמר ב-`PDF/`
- **פודקאסט:** "קריא לאודיו" → סקריפט נכתב, נשמר ב-`אודיו/` → ה-listener במחשב יומר ל-MP3 ויעלה ל-/3

## תכונות

| תכונה | סטטוס |
|--------|---------|
| עורך כתבות עם RTL+Heebo+Frank Ruhl | ✓ |
| AI: הגה"ה/קיצור/הרחבה/כותרת/תמונות (Gemini) | ✓ |
| AI: סקריפט פודקאסט → /3 | ✓ |
| בנק תמונות עם תיוג AI | ✓ |
| PDF Export | ✓ |
| ארכיון גיליונות | TODO |
| חלוקה ל-WhatsApp | TODO |

## הרשאות
- יוסף שניידר (`6742853@gmail.com`) — בעלים
- עמנואל רקטובסקי (`e0548451402@gmail.com`) — מורשה לערוך (לפי הזיכרון)
