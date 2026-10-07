# עדכון למסמך הפרויקט — שלב 7, R1B-1: מסכי ייבוא (רשימה, העלאה, עיבוד)

## מצב
- R1A סגור ופרוס ב-Production (migration `20261003000100` + Edge Function `import-process`). לא השתנה בדרופ הזה.
- R1B-1 הוא קוד ממשק בלבד: **אין migration חדש ואין שינוי ב-Edge Function.** נבדק מקומית. לא נפרס ב-Production ולא סומן ACCEPTED.
- בדיקת ה-Production האמיתית (קובץ הגיאומטריה, 14 עמודים, 39 שאלות לפי ה-Ground Truth) תיעשה יחד עם בעל המוצר אחרי הפריסה, לפי `R1B1_production_acceptance_he.md`. היא קובץ הקבלה של המנגנון הכללי: שום דבר בקוד לא מותאם אליו.

## מה נוסף
מסלול: מאגר שאלות → "ייבוא שאלות מ-PDF" → רשימת ייבואים → ייבוא חדש → העלאה → עיבוד → רשימת הצעות לקריאה בלבד.
1. `/teacher/questions/import` — רשימת ייבואים (שם, קורס, סטטוס, מספר עמודים, הצעות/ממתינות/אושרו) והעברה לארכיון (`archive_import`).
2. `/teacher/questions/import/new` — טופס: קורס (חובה), קובץ PDF, שם מקור, סוג מקור, שנה, וסימון הסכמה מפורש לשליחת הקובץ ל-Gemini. בדיקות בדפדפן לפני כל שליחה (pdf.js, נטען רק בבחירת קובץ): סוג, גודל 20MB, עד 30 עמודים, שכבת טקסט (PDF סרוק נעצר). רצף: `create_question_import` → העלאה ל-Storage (`{uid}/{importId}/source.pdf`) → sha256 → `finalize_import_upload`. `client_request_id` נוצר פעם אחת לכל קובץ שנבחר; ניסיון חוזר עם אותו קובץ הוא אידמפוטנטי.
3. `/teacher/questions/import/:importId` — מסך עיבוד: הדפדפן קורא ל-`import-process` בלולאה (גוף הבקשה `{import_id}` בלבד). `done`/`split` ממשיכים מיד; `idle` מחכה עד `next_attempt_at`; `chunk_failed` — השרת מחיל attempts ו-backoff; `budget_exceeded` עוצר עם הסבר; שגיאות רשת: עד 3 ניסיונות מקומיים ואז עצירה (המצב נשמר ב-DB). התקדמות ("מעבדים עמודים 4–6 מתוך 14"), השהיה/המשך, "ניסיון חוזר לקטעים שנכשלו" (`retry_import_chunks`), אזהרות על קטעים שנכשלו ועל "ייתכנו שאלות חסרות". העיבוד רץ רק כל עוד המסך פתוח, וזה כתוב בו.
4. קובץ שכבר יובא (אותו sha256, ייבוא לא מאורכב אחר): העיבוד **לא מתחיל** עד שהמורה מחליט (פתיחת הקודם / להמשיך בכל זאת / לבטל). ההחלטה נגזרת מה-DB ולכן שורדת רענון.
5. רשימת ההצעות במסך העיבוד היא לקריאה בלבד (כותרת, עמודים, תווית, סטטוס, דגלים). **אין אישור, אין עריכה ואין דחייה בדרופ הזה**; הם ב-R1B-2. שום שאלה לא נכנסת למאגר.
6. כפתור "ייבוא שאלות מ-PDF" ב-`QuestionBankPage`.

## החלטות R1A שנשמרו
Gemini multimodal B; 3+1 עמודים; שאלה חייבת להתחיל ב-own pages; split/retry; תלות בשרטוט מסומנת בלבד; proposal בלבד (אין אישור אוטומטי, אין יצירת תמונות, אין פתרון/רמזים של AI); `approve_import_candidate` נשאר הדרך היחידה ליצור שאלה (לא בשימוש בדרופ הזה).

## נקודות טכניות לתשומת לב
- `pdfjs-dist` 5.6.205 (נעוץ; engines תואם `>=20.19`). נטען בצורה עצלה, כולל worker של ~1.2MB, רק כשבוחרים קובץ. **משתמשים ב-legacy build בכוונה:** הגרסה המודרנית נכשלה ב-`getOperatorList` ב-Chromium אמיתי (`Map.getOrInsertComputed` לא קיים). זה נתפס בריצת דפדפן ותוקן.
- ספירת הצעות ברשימה נעשית בצד הלקוח מתוך embed קטן (`import_candidates(review_status)`, עד 60 לייבוא), בלי RPC חדש.
- ידוע ולא חוסם: `delete_course` נכשל בקורס שיש בו רשומת ייבוא (RESTRICT). פתרון עתידי = migration נפרדת בהחלטת בעל המוצר.
- מבחן חוזה ל-RTL: `rtlContract.test.js` נועל את כללי ה-CSS (`direction:ltr; unicode-bidi:isolate`) לנוסחאות KaTeX בתוך עברית. ה-Markdown הקיים לא שונה בדרופ הזה.

## קבצים
שונו: `package.json`, `package-lock.json` (הוספת `pdfjs-dist` בלבד), `src/App.jsx` (3 נתיבים), `src/i18n/he.js` (בלוק `imports`), `src/features/questions/QuestionBankPage.jsx` (כפתור).
חדשים: `src/features/imports/*` (importsApi, importProcessClient, importDriver, useImportDriver, importProgress, pdfPrecheck, ImportsListPage, NewImportPage, ImportRunPage, imports.module.css, 7 קובצי בדיקה), `src/components/markdown/__tests__/rtlContract.test.js`.

## הוראות פריסה ל-Production
ראו `R1B1_production_acceptance_he.md`, סעיף "פריסה". תמצית: אין SQL ואין Edge Function; מעתיקים את הקבצים, `npm ci`, `npm test`, `npm run build`, ופורסים את ה-frontend כרגיל.
