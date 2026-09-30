// All user-facing Hebrew text lives here.
// To rename a term across the whole app, change it once in this file.

export const app = {
  name: 'הבנתי',
  tagline: 'עד שנופל האסימון',
};

// Curriculum terms: Hebrew in the UI, English only in code.
export const terms = {
  node: 'חוליה',
  linkedList: 'שרשרת חוליות',
  doublyLinkedList: 'שרשרת דו-כיוונית',
  circularList: 'שרשרת מעגלית',
  reference: 'הפניה',
  stack: 'מחסנית',
  queue: 'תור',
  binaryTree: 'עץ בינארי',
  root: 'שורש',
  leaf: 'עלה',
  recursion: 'רקורסיה',
  complexity: 'סיבוכיות',
  assignment: 'מטלה',
  assignments: 'מטלות',
  submission: 'הגשה',
  draft: 'טיוטה',
  hint: 'רמז',
  solution: 'פתרון',
  feedback: 'משוב',
  lessonLog: 'סיכום שיעור',
  mistakeNotebook: 'מחברת טעויות',
  questionBank: 'מאגר שאלות',
};

export const roles = {
  teacher: 'מורה',
  student: 'תלמיד',
};

export const nav = {
  teacherHome: 'לוח בקרה',
  students: 'תלמידים',
  studentHome: 'בית',
  courses: 'קורסים',
  questionBank: 'מאגר שאלות',
  assignments: 'מטלות',
  reviews: 'בדיקות',
  signOut: 'יציאה',
  mainNav: 'ניווט ראשי',
};

export const auth = {
  loginTitle: 'כניסה',
  email: 'אימייל',
  password: 'סיסמה',
  signIn: 'כניסה',
  signingIn: 'נכנסים…',
  forgotPassword: 'שכחתי סיסמה',
  backToLogin: 'חזרה לכניסה',
  resetTitle: 'איפוס סיסמה',
  resetExplain: 'נשלח קישור לקביעת סיסמה חדשה.',
  sendResetLink: 'שליחת קישור',
  sending: 'שולחים…',
  resetSent: 'אם הכתובת רשומה במערכת, נשלח אליה קישור. הקישור תקף לזמן מוגבל.',
  noSignupNote: 'אין הרשמה עצמית. החשבון נפתח על ידי המורה.',
  setPasswordTitle: 'קביעת סיסמה',
  setPasswordExplain: 'בחרו סיסמה של 8 תווים לפחות.',
  newPassword: 'סיסמה חדשה',
  confirmPassword: 'אימות סיסמה',
  savePassword: 'שמירת סיסמה',
  saving: 'שומרים…',
  passwordTooShort: 'הסיסמה צריכה להכיל לפחות 8 תווים.',
  passwordsDontMatch: 'הסיסמאות אינן זהות.',
  linkInvalid: 'הקישור לא תקף או שפג תוקפו. אפשר לבקש קישור חדש במסך הכניסה, דרך "שכחתי סיסמה".',
  checkingLink: 'בודקים את הקישור…',
};

export const errors = {
  invalidCredentials: 'האימייל או הסיסמה שגויים.',
  emailNotConfirmed: 'החשבון עדיין לא הופעל. פתחו את קישור ההזמנה שנשלח באימייל.',
  rateLimited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
  network: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.',
  generic: 'משהו השתבש. נסו שוב.',
  profileMissing: 'לא נמצא פרופיל למשתמש הזה. פנו למורה.',
  profileLoad: 'לא הצלחנו לטעון את הפרופיל.',
  retry: 'לנסות שוב',
  missingEnv: 'חסרים משתני סביבה של Supabase. ראו את ‎.env.example.',
};

// Set-password / invite-link errors. Only KNOWN Supabase Auth error codes are mapped
// (see @supabase/auth-js ErrorCode); anything else falls back to errors.generic.
export const passwordErrors = {
  weak: 'הסיסמה חלשה מדי. בחרו סיסמה ארוכה וייחודית יותר.',
  weakLength: 'הסיסמה קצרה מדי לפי דרישות המערכת. בחרו סיסמה ארוכה יותר.',
  weakCharacters: 'הסיסמה חייבת לכלול שילוב של אותיות באנגלית, ספרות ותווים מיוחדים.',
  weakPwned: 'הסיסמה הזו מופיעה ברשימות של סיסמאות שנחשפו בדליפות. בחרו סיסמה אחרת.',
  samePassword: 'הסיסמה החדשה זהה לסיסמה הנוכחית. בחרו סיסמה אחרת.',
  linkExpired: 'הקישור פג תוקף או שכבר נעשה בו שימוש. בקשו מהמורה הזמנה חדשה, או בחרו "שכחתי סיסמה" במסך הכניסה.',
  sessionLost: 'ההתחברות מהקישור פגה. פתחו שוב את הקישור מהאימייל, או בחרו "שכחתי סיסמה" במסך הכניסה.',
  accountUnavailable: 'החשבון לא נמצא או שהוא חסום. פנו למורה.',
  rateLimited: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
};

export const common = {
  loading: 'טוען…',
  hello: (name) => (name ? `שלום, ${name}` : 'שלום'),
  since: 'מאז',
  cancel: 'ביטול',
  close: 'סגירה',
  save: 'שמירה',
  saving: 'שומרים…',
  saved: 'נשמר',
  edit: 'עריכה',
  add: 'הוספה',
  archive: 'העברה לארכיון',
  restore: 'שחזור מהארכיון',
  archived: 'בארכיון',
  showArchived: 'הצגת פריטים בארכיון',
  all: 'הכול',
  none: 'ללא',
  moveUp: 'הזזה למעלה',
  moveDown: 'הזזה למטה',
  back: 'חזרה',
};

export const assignmentLanguage = {
  label: 'שפת המטלה',
  hint: 'לכל מטלה שפה אחת. אחרי הפרסום היא קבועה. כדי לתת את אותו תוכן בשפה אחרת, יוצרים מטלה נוספת.',
  changeError: 'אי אפשר להחליף שפה: יש נמענים שלומדים שפה אחרת. הסירו אותם קודם.',
  saveError: 'החלפת השפה נכשלה.',
  blockersTitle: (lang) => `שאלות שחוסמות פרסום ב-${lang}`,
  blockersIntro: 'המטלה לא תפורסם עד שלכל השאלות יהיה תוכן בשפה שלה.',
  missing_variant: (lang) => `לשאלה הזו עדיין אין גרסת ${lang}`,
  unclassified: (lang) => `לשאלה הזו לא הוגדרה שפה, ולכן היא נחשבת לשפה הראשית של הקורס ולא מתאימה ל-${lang}`,
  createManual: 'צור ידנית',
  suggestAi: 'הצע באמצעות AI',
  aiSoon: 'בקרוב',
  recipientMismatch: (lang) => `לומד/ת ${lang}`,
  allGood: 'לכל השאלות יש תוכן בשפת המטלה.',
};

export const variants = {
  title: 'גרסאות לפי שפת תכנות',
  explain: 'השאלה כתובה בשפה אחת (הבסיס). כדי להקצות אותה לתלמידים שלומדים שפה אחרת, צרו לה גרסה בשפה הזו: קוד פתיחה, פתרון והסבר. הנוסח והרמזים עוברים מהבסיס אלא אם משנים אותם.',
  base: 'שפת הבסיס',
  has: 'יש גרסה',
  missing: 'חסרה גרסה',
  create: 'יצירת גרסה',
  edit: 'עריכה',
  delete: 'מחיקת הגרסה',
  save: 'שמירת הגרסה',
  saving: 'שומרים…',
  saved: 'הגרסה נשמרה.',
  saveError: 'שמירת הגרסה נכשלה.',
  deleteError: 'מחיקת הגרסה נכשלה.',
  cancel: 'סגירה',
  body: 'נוסח השאלה',
  starter: 'קוד פתיחה',
  solution: 'פתרון (מוסתר מהתלמיד)',
  explanation: 'הסבר לפתרון',
  hint1: 'רמז 1',
  hint2: 'רמז 2',
  saveFirst: 'שמרו את השאלה לפני יצירת גרסאות.',
  copiedFromBase: (from, to) => `הגרסה התחילה כעותק של שאלת הבסיס (${from}). התאימו את מה שתלוי בשפה (${to}) ושמרו. שינוי עתידי בבסיס לא ישנה גרסה שנשמרה.`,
  neutral: 'שאלה ללא תלות בשפת תכנות',
  neutralHint: 'מתאימה לכל שפה כמו שהיא, בלי גרסאות.',
  unclassifiedHint: 'שאלה ללא שפה נחשבת לשפה הראשית של הקורס ולא תוקצה לשפה אחרת עד שתוגדר לה שפה או גרסה.',
  coverageBadge: (lang, ok) => `${lang} ${ok ? '✓' : '✗'}`,
  neutralBadge: 'כללית',
};

export const courseOrder = {
  start: 'סידור קורסים',
  title: 'סידור הקורסים',
  explain: 'הזיזו קורס למעלה או למטה ולחצו “שמירת הסדר”. קורסים בארכיון לא משתתפים בסידור ושומרים על מקומם.',
  save: 'שמירת הסדר',
  saving: 'שומרים…',
  cancel: 'ביטול',
  up: 'הזזה למעלה',
  down: 'הזזה למטה',
  moved: (title, pos, total) => `${title} הוזז למקום ${pos} מתוך ${total}`,
  saved: 'סדר הקורסים נשמר.',
  error: 'שמירת הסדר נכשלה. נסו שוב.',
};

export const courseLanguages = {
  title: 'שפות התכנות בקורס',
  explain: 'אפשר ללמד את אותו קורס ביותר משפה אחת. לכל תלמיד נקבעת שפה, ולכל מטלה שפה אחת.',
  primary: 'שפה ראשית',
  add: 'הוספת שפה',
  choose: 'שפה להוספה',
  remove: 'הסרה',
  none: 'כל השפות הנתמכות כבר נוספו.',
  inUse: 'אי אפשר להסיר את השפה הזו כל עוד יש תלמידים או מטלות שמשתמשים בה.',
  primaryLocked: 'השפה הראשית אינה ניתנת להסרה.',
  removeError: 'ההסרה נכשלה.',
  addError: 'ההוספה נכשלה. נסו שוב.',
  studentLanguage: 'שפת התלמיד',
  changeLanguageError: 'אי אפשר להחליף שפה כל עוד התלמיד משויך למטלת טיוטה בשפה אחרת.',
  choosePlaceholder: 'שפת לימוד',
};

export const students = {
  title: 'תלמידים',
  subtitle: 'התלמידים שמשויכים אליך',
  inviteTitle: 'הזמנת תלמיד',
  inviteExplain: 'התלמיד יקבל אימייל עם קישור לקביעת סיסמה.',
  fullName: 'שם מלא',
  email: 'אימייל',
  invite: 'שליחת הזמנה',
  inviting: 'שולחים הזמנה…',
  invited: (name) => `ההזמנה נשלחה ל${name}.`,
  invitedToCourse: (name) => `ההזמנה נשלחה ל${name}, ו${name} נרשם/ה לקורס. אפשר כבר לשייך אותו/ה למטלות.`,
  emptyTitle: 'עדיין אין תלמידים',
  emptyBody: 'הזמינו את התלמיד הראשון בטופס שלמעלה.',
  status: { active: 'פעיל', archived: 'בארכיון' },
  authStatus: { pending: 'ממתין לאישור ההזמנה', no_password: 'טרם קבע סיסמה' },
  language: 'שפת לימוד',
  inviteErrors: {
    invalid_email: 'כתובת האימייל אינה תקינה.',
    invalid_name: 'יש להזין שם באורך 2 עד 120 תווים.',
    invalid_language: 'שפת הלימוד אינה מוגדרת בקורס הזה.',
    forbidden: 'רק מורה יכול להזמין תלמידים.',
    unauthorized: 'פג תוקף ההתחברות. היכנסו מחדש.',
    course_not_found: 'הקורס לא נמצא או שהוא בארכיון. ההזמנה לא נשלחה.',
    enroll_failed: 'הרישום לקורס נכשל, ולכן ההזמנה בוטלה. אפשר לנסות שוב.',
    link_failed: 'שיוך התלמיד אליך נכשל, ולכן ההזמנה בוטלה. אפשר לנסות שוב.',
    partial_state: 'ההזמנה נכשלה באמצע ולא הצלחנו לנקות את החשבון שנוצר. אל תיצרו תלמיד חדש: לחצו שוב על "שליחת הזמנה" עם אותו אימייל ואז על "שחזור החשבון".',
    invite_failed: 'שליחת ההזמנה נכשלה. נסו שוב בעוד רגע.',
    resend_failed: 'לא הצלחנו לשלוח את המייל. נסו שוב בעוד רגע.',
    repair_failed: 'שחזור החשבון נכשל. לא בוצע שינוי. נסו שוב.',
    email_exists_other: 'האימייל הזה כבר רשום במערכת ואינו משויך אליך, ולכן אי אפשר להזמין אותו מכאן.',
    already_yours: 'התלמיד הזה כבר קיים ברשימת התלמידים שלך.',
    invite_pending: 'התלמיד הזה כבר הוזמן ועדיין לא אישר את ההזמנה.',
    password_not_set: 'התלמיד אישר את ההזמנה אבל עדיין לא קבע סיסמה.',
    needs_repair: 'החשבון של האימייל הזה קיים במערכת אבל חסר לו פרופיל באפליקציה (למשל אחרי מחיקה חלקית). אפשר לשחזר אותו.',
  },
  // one-tap follow-ups offered next to some errors
  inviteActions: {
    invite_pending: { action: 'resend', label: 'שליחת הזמנה מחדש' },
    password_not_set: { action: 'resend', label: 'שליחת קישור לקביעת סיסמה' },
    needs_repair: { action: 'repair', label: 'שחזור החשבון ושליחת קישור' },
  },
  inviteResults: {
    invite_resent: (name) => `ההזמנה נשלחה שוב ל${name}.`,
    recovery_sent: (name) => `נשלח ל${name} קישור לקביעת סיסמה.`,
    repaired: (name, mailSent) => (mailSent
      ? `החשבון של ${name} שוחזר ונשלח אליו קישור לקביעת סיסמה.`
      : `החשבון של ${name} שוחזר, אבל שליחת המייל נכשלה. אפשר ללחוץ שוב על "שליחת קישור לקביעת סיסמה".`),
    enrolled_existing: (name) => `${name} כבר בין התלמידים שלך, ונרשם/ה עכשיו לקורס.`,
  },
  archiveAction: 'העברה לארכיון',
  restoreAction: 'שחזור',
  deleteAction: 'מחיקה לצמיתות',
  showArchived: 'הצגת תלמידים בארכיון',
  archiveTitle: (name) => `להעביר את ${name} לארכיון?`,
  archiveBody: 'התלמיד יוסתר מרשימת התלמידים הפעילים ולא יופיע בהקצאות חדשות. הוא ימשיך לראות את מה שכבר הוקצה לו, וההיסטוריה שלו (הגשות ומשוב) נשמרת ושמו ימשיך להופיע בה. אפשר לשחזר בכל רגע.',
  archived: (name) => `${name} הועבר/ה לארכיון.`,
  restored: (name) => `${name} שוחזר/ה.`,
  archiveError: 'הפעולה נכשלה. נסו שוב.',
  delete: {
    title: (name) => `מחיקה לצמיתות של ${name}`,
    loading: 'בודקים מה יימחק…',
    intro: 'המחיקה מסירה את החשבון של התלמיד לגמרי, ואי אפשר לבטל אותה. אם אפשר, עדיף להשאיר בארכיון.',
    willDelete: 'יימחקו:',
    count: (label, n) => `${label}: ${n}`,
    labels: { enrollments: 'רישומים לקורסים', assignments: 'מטלות שהוקצו', answers: 'תשובות', submissions: 'הגשות', feedback: 'משובים', notifications: 'התראות' },
    typeName: (name) => `כדי לאשר, הקלידו את שם התלמיד: ${name}`,
    typeLabel: 'שם התלמיד',
    confirm: 'מחיקה לצמיתות',
    deleted: (name) => `${name} נמחק/ה.`,
    errors: {
      shared_student: 'התלמיד משויך גם למורה אחר, ולכן אי אפשר למחוק אותו לצמיתות. אפשר להעביר אותו לארכיון בלבד.',
      not_found: 'התלמיד לא נמצא.',
      confirmation_mismatch: 'השם שהוקלד לא תואם.',
      delete_failed: 'המחיקה נכשלה ולא בוצע שינוי. נסו שוב.',
      delete_incomplete: 'המחיקה לא הושלמה עד הסוף. אל תנסו ליצור את התלמיד מחדש. פנו לתמיכה עם התאריך והשעה.',
      generic: 'הפעולה נכשלה. נסו שוב.',
    },
  },
};

export const teacherHome = {
  studentsCard: 'תלמידים',
  studentsCount: (n) => (n === 1 ? 'תלמיד אחד' : `${n} תלמידים`),
  coursesCard: 'קורסים',
  coursesCount: (n) => (n === 1 ? 'קורס אחד' : `${n} קורסים`),
  questionsCard: 'מאגר שאלות',
  questionsCount: (n) => (n === 1 ? 'שאלה אחת' : `${n} שאלות`),
  open: 'פתיחה',
  manageStudents: 'ניהול תלמידים',
  noStudentsTitle: 'בואו נתחיל',
  noStudentsBody: 'הזמינו את התלמיד הראשון כדי להתחיל לעבוד.',
  inviteFirst: 'הזמנת תלמיד',
};

export const studentHome = {
  yourTeacher: 'המורה שלך',
  myCourses: 'הקורסים שלי',
  emptyTitle: 'עוד אין כאן מטלות',
  emptyBody: 'מטלות, סיכומי שיעורים וחזרות יופיעו כאן כשהמורה יפרסם אותם.',
};

export const notFound = {
  title: 'העמוד לא נמצא',
  body: 'ייתכן שהקישור שגוי או שהעמוד הועבר.',
  home: 'חזרה לדף הבית',
};

export const formatDate = (iso) =>
  new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

// ---------------------------------------------------------------------
// Phase 2 — content & question bank
// ---------------------------------------------------------------------
export const languages = {
  java: '\u2066Java\u2069', python: '\u2066Python\u2069', csharp: '\u2066C#\u2069', c: '\u2066C\u2069', cpp: '\u2066C++\u2069', javascript: '\u2066JavaScript\u2069',
};

export const courses = {
  title: 'קורסים',
  subtitle: 'קורסים, יחידות ונושאים',
  newCourse: 'קורס חדש',
  create: 'יצירת קורס',
  creating: 'יוצרים…',
  courseTitle: 'שם הקורס',
  code: 'קוד (לא חובה)',
  codeHint: 'למשל מספר שאלון',
  description: 'תיאור (לא חובה)',
  language: 'שפת תכנות',
  noLanguage: 'ללא',
  emptyTitle: 'עדיין אין קורסים',
  emptyBody: 'צרו קורס ראשון, ובתוכו יחידות ונושאים.',
  topicsCount: (n) => (n === 1 ? 'נושא אחד' : `${n} נושאים`),
  notFound: 'הקורס לא נמצא, או שאין לך גישה אליו.',
  details: 'פרטי הקורס',
  editDetails: 'עריכת פרטים',
  archiveCourse: 'העברת הקורס לארכיון',
  archiveCourseBody: 'הקורס יוסתר מהתלמידים. אפשר לשחזר אותו בכל עת.',
  restoreCourse: 'שחזור הקורס',
  archivedNotice: 'הקורס בארכיון ומוסתר מהתלמידים.',
  titleRequired: 'יש להזין שם לקורס.',
};

export const topics = {
  expand: 'פתיחה',
  collapse: 'סגירה',
  title: 'מבנה הנושאים',
  explain: 'עד שלוש רמות: יחידה, נושא, תת-נושא.',
  levels: { 1: 'יחידה', 2: 'נושא', 3: 'תת-נושא' },
  newUnit: 'יחידה חדשה',
  addUnit: 'הוספת יחידה',
  addChild: (level) => (level === 1 ? 'הוספת נושא' : 'הוספת תת-נושא'),
  newChildPlaceholder: (level) => (level === 1 ? 'שם הנושא' : 'שם תת-הנושא'),
  rename: 'שינוי שם',
  emptyTitle: 'עדיין אין יחידות',
  emptyBody: 'הוסיפו יחידה ראשונה, למשל "מבני נתונים".',
  archiveTitle: 'להעביר לארכיון?',
  archiveBody: 'הנושא וכל מה שמתחתיו יוסתרו מהתלמידים. שאלות שמשויכות אליו לא נמחקות.',
};

export const enrollment = {
  title: 'תלמידים בקורס',
  explain: 'תלמיד רואה רק קורסים שהוא רשום אליהם.',
  add: 'רישום לקורס',
  choose: 'בחירת תלמיד',
  remove: 'הסרה מהקורס',
  empty: 'אין עדיין תלמידים בקורס.',
  noCandidates: 'כל התלמידים שלך כבר רשומים לקורס.',
  noStudents: 'עדיין אין לך תלמידים. הזמינו תלמיד בדף "תלמידים".',
  addStudent: 'הוספת תלמיד לקורס',
  cancelAdd: 'ביטול',
  modeExisting: 'תלמיד קיים',
  modeNew: 'תלמיד חדש',
  existingExplain: 'בחירה מתוך התלמידים שלך שעדיין לא רשומים לקורס.',
  noExistingCandidates: 'כל התלמידים שלך כבר רשומים לקורס. אפשר להזמין תלמיד חדש.',
  newExplain: 'התלמיד יקבל אימייל עם קישור לקביעת סיסמה, ויירשם לקורס הזה מיד.',
  enrolled: (name) => `${name} נרשם/ה לקורס.`,
  alreadyEnrolled: 'התלמיד כבר רשום לקורס.',
};

export const questionLabels = {
  difficulty: { basic: 'בסיסי', intermediate: 'בינוני', advanced: 'מתקדם', bagrut: 'רמת בגרות' },
  sourceType: { original: 'שאלה מקורית', homework: 'תרגיל בית', bagrut: 'בגרות', exam: 'מבחן', practice: 'תרגול' },
  questionType: { code: 'כתיבת קוד', text: 'תשובה מילולית', tracing: 'מעקב אחר קוד' },
  status: { draft: 'טיוטה', ready: 'מוכנה', archived: 'בארכיון' },
};

export const questions = {
  title: 'מאגר שאלות',
  subtitle: 'כל השאלות שלך, לשימוש חוזר במטלות',
  newQuestion: 'שאלה חדשה',
  search: 'חיפוש בכותרת',
  filterCourse: 'קורס',
  filterTopic: 'נושא',
  filterDifficulty: 'רמת קושי',
  filterSource: 'מקור',
  filterStatus: 'סטטוס',
  activeStatuses: 'טיוטות ומוכנות',
  clearFilters: 'ניקוי סינון',
  resultCount: (n) => (n === 1 ? 'שאלה אחת' : `${n} שאלות`),
  limitNote: (n) => `מוצגות ${n} השאלות האחרונות שעודכנו. צמצמו את הסינון כדי למצוא שאלה מסוימת.`,
  emptyTitle: 'עדיין אין שאלות',
  emptyBody: 'צרו שאלה ראשונה. אפשר לשייך אותה לנושאים ולהוסיף רמזים ופתרון.',
  noMatchTitle: 'לא נמצאו שאלות',
  noMatchBody: 'נסו לשנות או לנקות את הסינון.',
  needCourseTitle: 'קודם צריך קורס',
  needCourseBody: 'כל שאלה שייכת לקורס. צרו קורס, ואז חזרו לכאן.',
  goToCourses: 'מעבר לקורסים',
  updated: 'עודכנה',
};

export const questionEditor = {
  newTitle: 'שאלה חדשה',
  editTitle: 'עריכת שאלה',
  notFound: 'השאלה לא נמצאה, או שאין לך גישה אליה.',
  sectionDetails: 'פרטים',
  sectionContent: 'השאלה',
  sectionTopics: 'נושאים',
  sectionHints: 'רמזים',
  sectionSolution: 'פתרון',
  sectionNotes: 'הערות למורה',
  titleLabel: 'כותרת',
  course: 'קורס',
  type: 'סוג שאלה',
  language: 'שפת תכנות',
  difficulty: 'רמת קושי',
  status: 'סטטוס',
  source: 'מקור',
  sourceYear: 'שנה',
  sourceExam: 'שם המבחן / השאלון',
  sourceExamHint: 'למשל: בגרות קיץ, שאלה 3',
  tags: 'תגיות',
  tagsHint: 'מופרדות בפסיק',
  body: 'נוסח השאלה',
  bodyHint: 'Markdown: **הדגשה**, רשימות, וקוד בין שלושה ` בתחילת ובסוף הבלוק.',
  write: 'כתיבה',
  preview: 'תצוגה מקדימה',
  previewEmpty: 'אין עדיין תוכן לתצוגה.',
  starterCode: 'קוד פתיחה (לא חובה)',
  topicsExplain: 'שיוך לנושאים עוזר לסנן ולעקוב אחר התקדמות.',
  topicsSelected: (n) => (n === 1 ? 'נבחר אחד' : `נבחרו ${n}`),
  topicsNone: 'לקורס הזה עדיין אין נושאים.',
  hint1: 'רמז',
  hint2: 'רמז נוסף',
  hintsExplain: 'רמזים נשמרים בנפרד מהשאלה, ויוצגו לתלמיד רק אחרי שתפתחו אותם.',
  solutionCode: 'קוד הפתרון',
  explanation: 'הסבר',
  solutionExplain: 'הפתרון נשמר בנפרד, ויוצג לתלמיד רק אחרי שתפתחו אותו.',
  notesExplain: 'גלוי רק לך. לא מוצג לתלמיד בשום מצב.',
  save: 'שמירת שאלה',
  saved: 'השאלה נשמרה.',
  titleRequired: 'יש להזין כותרת.',
  courseRequired: 'יש לבחור קורס.',
  yearInvalid: 'שנה בין 1990 ל-2100.',
  unsaved: 'יש שינויים שלא נשמרו',
  saveError: 'השמירה נכשלה. השינויים עדיין כאן, אפשר לנסות שוב.',
  courseChangeNote: 'החלפת קורס מנקה את שיוך הנושאים.',
};

// ---------------------------------------------------------------------
// Phase 2 improvements (decisions 21–24)
// ---------------------------------------------------------------------
export const markdownToolbar = {
  toolbar: 'עיצוב טקסט',
  bold: 'מודגש (Ctrl+B)',
  italic: 'נטוי (Ctrl+I)',
  code: 'קוד בתוך שורה',
  codeBlock: 'בלוק קוד',
  bulletList: 'רשימה',
  numberedList: 'רשימה ממוספרת',
  placeholderText: 'טקסט',
  placeholderCode: 'code',
  placeholderItem: 'פריט',
};

export const flash = {
  questionCreated: 'השאלה נשמרה בהצלחה.',
  questionUpdated: 'השינויים נשמרו בהצלחה.',
  courseDeleted: 'הקורס נמחק לצמיתות.',
  dismiss: 'סגירה',
};

export const safeDelete = {
  deleteForever: 'מחיקה לצמיתות',
  deleting: 'מוחקים…',
  checking: 'בודקים אם אפשר למחוק…',
  irreversible: 'הפעולה אינה ניתנת לביטול.',
  close: 'סגירה',
  archiveInstead: 'העברה לארכיון',
  topicTitle: (name) => `למחוק את "${name}" לצמיתות?`,
  topicBody: (n) => (n > 1
    ? `יימחקו הנושא וכל ${n - 1} הנושאים שמתחתיו. אף שאלה לא משויכת אליהם.`
    : 'אף שאלה לא משויכת לנושא הזה.'),
  topicBlockedTitle: 'אי אפשר למחוק את הנושא',
  topicHasQuestions: (q) => (q === 1
    ? 'שאלה אחת משויכת לנושא הזה או לנושא שמתחתיו, ולכן הוא חלק מהתוכן של המערכת.'
    : `${q} שאלות משויכות לנושא הזה או לנושאים שמתחתיו, ולכן הוא חלק מהתוכן של המערכת.`),
  courseTitle: (name) => `למחוק את הקורס "${name}" לצמיתות?`,
  courseBody: (n) => (n > 0
    ? `יימחקו הקורס ו-${n} הנושאים שבו. אין בקורס שאלות ואין תלמידים רשומים.`
    : 'אין בקורס נושאים, שאלות או תלמידים רשומים.'),
  courseBlockedTitle: 'אי אפשר למחוק את הקורס',
  courseHasQuestions: (q) => (q === 1 ? 'בקורס יש שאלה אחת במאגר.' : `בקורס יש ${q} שאלות במאגר.`),
  courseHasStudents: (s) => (s === 1
    ? 'תלמיד אחד רשום לקורס. אפשר להסיר אותו מהקורס ואז לנסות שוב.'
    : `${s} תלמידים רשומים לקורס. אפשר להסיר אותם מהקורס ואז לנסות שוב.`),
  inUse: 'הפריט נמצא בשימוש במקום אחר במערכת.',
  hasMistakeTags: (n) => (n === 1 ? 'תגית טעות אחת מקושרת לפריט הזה. אפשר להעביר את התגית לנושא אחר או לארכיון.' : `${n} תגיות טעות מקושרות לפריט הזה. אפשר להעביר אותן לנושא אחר או לארכיון.`),
  archiveHint: 'אפשר להעביר לארכיון: הפריט יוסתר מהתלמידים, וההיסטוריה נשמרת.',
  alreadyArchivedHint: 'הפריט כבר בארכיון ומוסתר מהתלמידים.',
};

// ---------------------------------------------------------------------
// Phase 3 — assignments & student workspace
// ---------------------------------------------------------------------
export const formatDateTime = (iso) =>
  new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const formatTime = (iso) =>
  new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const assignmentLabels = {
  status: { draft: 'טיוטה', published: 'פורסמה', closed: 'נסגרה' },
  hintPolicy: { on_request: 'התלמיד פותח בעצמו, לפי הסדר', locked: 'נעולים' },
  solutionPolicy: { after_submit: 'נפתח לתלמיד אחרי הגשה', locked: 'נעול' },
  answerStatus: { none: 'לא התחיל', draft: 'בעבודה', submitted: 'הוגש' },
};

export const assignments = {
  title: 'מטלות',
  subtitle: 'מטלות שנותנים לתלמידים מתוך מאגר השאלות',
  newAssignment: 'מטלה חדשה',
  create: 'יצירת מטלה',
  creating: 'יוצרים…',
  course: 'קורס',
  titleLabel: 'שם המטלה',
  titleRequired: 'יש להזין שם למטלה.',
  emptyTitle: 'עדיין אין מטלות',
  emptyBody: 'צרו מטלה, הוסיפו אליה שאלות מהמאגר ובחרו למי היא מיועדת.',
  needCourse: 'כדי ליצור מטלה צריך קודם קורס עם שאלות.',
  counts: (q, s) => `${q === 1 ? 'שאלה אחת' : `${q} שאלות`} · ${s === 1 ? 'תלמיד אחד' : `${s} תלמידים`}`,
  due: 'להגשה עד',
  noDue: 'ללא תאריך הגשה',
  notFound: 'המטלה לא נמצאה, או שאין לך גישה אליה.',
  // details
  details: 'פרטי המטלה',
  instructions: 'הנחיות לתלמיד (לא חובה)',
  dueLabel: 'תאריך ושעת הגשה (לא חובה)',
  saveDetails: 'שמירת פרטים',
  detailsSaved: 'הפרטים נשמרו.',
  // questions
  questions: 'שאלות במטלה',
  questionsDraftNote: 'אפשר להוסיף, להסיר ולשנות סדר כל עוד המטלה בטיוטה.',
  questionsFrozenNote: 'המטלה פורסמה: רשימת השאלות והסדר קבועים. התלמידים רואים את הגרסה שפורסמה.',
  addQuestions: 'הוספת שאלות מהמאגר',
  closePicker: 'סיום הוספה',
  clearPickerFilters: 'נקה סינון', // explicit reset only — never automatic on selection (UX fix, Round 5)
  pickerSearch: 'חיפוש שאלה בקורס',
  pickerEmpty: 'אין עוד שאלות זמינות בקורס הזה.',
  add: 'הוספה',
  remove: 'הסרה מהמטלה',
  noQuestions: 'עדיין אין שאלות במטלה.',
  hints: 'רמזים',
  solution: 'פתרון',
  hintsCount: (n) => (n === 0 ? 'אין רמזים' : n === 1 ? 'רמז אחד' : `${n} רמזים`),
  bankChanged: 'השאלה עודכנה במאגר אחרי הפרסום. במטלה מוצגת הגרסה שפורסמה.',
  bankDraftWarning: 'השאלה מסומנת במאגר כטיוטה.',
  // students
  students: 'למי המטלה מיועדת',
  studentsExplain: 'תלמידים שרשומים לקורס. אפשר להוסיף תלמידים גם אחרי הפרסום.',
  noEnrolled: 'אין תלמידים רשומים לקורס. רושמים תלמידים בדף הקורס.',
  cannotRemove: 'התלמיד כבר התחיל לעבוד על המטלה, ולכן אי אפשר להסיר אותו.',
  // lifecycle
  publish: 'פרסום לתלמידים',
  publishTitle: 'לפרסם את המטלה?',
  publishBody: 'התלמידים שנבחרו יראו אותה מיד. אחרי הפרסום רשימת השאלות והסדר קבועים, ושינויים במאגר לא ישפיעו על המטלה.',
  published: 'המטלה פורסמה.',
  unpublish: 'החזרה לטיוטה',
  unpublishTitle: 'להחזיר לטיוטה?',
  unpublishBody: 'התלמידים לא יראו את המטלה עד שתפורסם שוב. אפשרי רק כל עוד אף תלמיד לא התחיל לעבוד.',
  close: 'סגירת המטלה',
  closeTitle: 'לסגור את המטלה?',
  closeBody: 'התלמידים ימשיכו לראות את המטלה ואת מה שכתבו, אבל לא יוכלו לערוך או להגיש.',
  reopen: 'פתיחה מחדש',
  deleteDraft: 'מחיקת הטיוטה',
  deleteTitle: 'למחוק את הטיוטה לצמיתות?',
  deleteBody: 'המטלה תימחק. השאלות נשארות במאגר. הפעולה אינה ניתנת לביטול.',
  reasons: {
    no_questions: 'אי אפשר לפרסם מטלה בלי שאלות.',
    no_students: 'צריך לבחור לפחות תלמיד אחד.',
    archived_question: 'יש במטלה שאלה שהועברה לארכיון. הסירו אותה או שחזרו אותה במאגר.',
    students_started: 'תלמידים כבר התחילו לעבוד, ולכן אי אפשר להחזיר לטיוטה. אפשר לסגור את המטלה.',
    not_draft: 'המטלה כבר פורסמה.',
    variants_missing: 'אי אפשר לפרסם: יש שאלות שאין להן גרסה בשפה של המטלה. ראו הפירוט למעלה.',
    recipient_language_mismatch: 'יש נמענים שלומדים שפה אחרת מזו של המטלה. הסירו אותם או החליפו את שפת המטלה.',
    bad_transition: 'הפעולה לא מתאימה למצב המטלה.',
  },
  // progress
  progress: 'התקדמות התלמידים',
  progressEmpty: 'התלמידים עוד לא התחילו לעבוד.',
  refresh: 'רענון',
  lifecycleHelp: {
    draft: 'פרסום: התלמידים שנבחרו יראו את המטלה. אחרי הפרסום רשימת השאלות והסדר קבועים.',
    close: 'סגירה: המטלה נשארת מפורסמת וכל העבודה נשמרת. התלמידים יכולים לצפות, אבל לא לערוך או להגיש. אפשר לפתוח מחדש בכל עת.',
    unpublish: 'החזרה לטיוטה: ביטול הפרסום כדי לשנות את מבנה המטלה (שאלות וסדר). אפשרי רק כל עוד אף תלמיד לא התחיל לעבוד.',
    reopen: 'פתיחה מחדש: התלמידים יוכלו שוב לערוך ולהגיש. העבודה שכבר נעשתה נשמרת.',
  },
  pickerFiltersTitle: 'סינון שאלות',
  pickerCount: (n) => (n === 1 ? 'נמצאה שאלה אחת שאפשר להוסיף' : `נמצאו ${n} שאלות שאפשר להוסיף`),
  student: 'תלמיד',
  hintsUsed: (n, total) => `רמזים ${n}/${total}`,
  solutionSeen: 'ראה פתרון',
  viewAnswer: 'צפייה בתשובה',
  answerOf: (student, q) => `${student} · ${q}`,
  noAnswer: 'אין עדיין תשובה.',
  lastSaved: 'נשמר לאחרונה',
  submittedAt: 'הוגש',
  revealedHints: 'רמזים שנחשפו',
};

export const workspace = {
  myAssignments: 'המטלות שלי',
  back: 'המטלות שלי',
  progress: (done, total) => `${done} מתוך ${total} הוגשו`,
  questionOf: (i, n) => `שאלה ${i} מתוך ${n}`,
  statusNew: 'חדשה',
  statusInProgress: 'בתהליך',
  statusDone: 'הכול הוגש',
  statusClosed: 'נסגרה',
  instructions: 'הנחיות המטלה',
  closedBanner: 'המטלה נסגרה. אפשר לצפות בה, אבל לא לערוך או להגיש.',
  yourAnswer: 'התשובה שלך',
  answerPlaceholder: 'כתבו כאן את התשובה…',
  save: { idle: '', dirty: 'שינויים שלא נשמרו', saving: 'שומר…', saved: (t) => `נשמר ${t}`, error: 'לא נשמר. מנסים שוב…' },
  submit: 'הגשת התשובה',
  submitting: 'מגישים…',
  submitTitle: 'להגיש את התשובה?',
  submitBody: 'אחרי ההגשה אי אפשר לשנות את התשובה. המורה יראה אותה כפי שהיא.',
  submitted: (t) => `הוגש ב-${t}`,
  submitEmpty: 'אי אפשר להגיש תשובה ריקה.',
  // Round 6, section B: submission is now ONE assignment-level action, not
  // one per question (writing/autosave stays per question, unchanged).
  // submit/submitting/submitTitle/submitBody above described the old
  // per-question confirm dialog and are no longer referenced from the UI —
  // kept rather than deleted, same as other now-unused strings in this file.
  submitAssignmentButton: 'שליחת המטלה לבדיקה',
  // ready/total = answered/total among the NOT-yet-submitted questions only
  // (mirrors release.sendReadiness's own wording/shape). Production fix:
  // the box itself is now always shown (never absent) — see the two strings
  // below for its other two states.
  submitAssignmentReadiness: (ready, total) => `${ready} מתוך ${total} שאלות מוכנות להגשה`,
  submitAssignmentNeedAll: 'כדי לשלוח לבדיקה, יש לענות על כל שאלות המטלה.',
  submitAssignmentAllSent: 'כל שאלות המטלה נשלחו לבדיקה.',
  submitAssignmentTitle: 'לשלוח את המטלה לבדיקה?',
  submitAssignmentBody: (n) => (n === 1
    ? 'שאלה אחת תישלח לבדיקה. אחרי ההגשה אי אפשר לשנות אותה.'
    : `${n} שאלות יישלחו לבדיקה בבת אחת. אחרי ההגשה אי אפשר לשנות אותן.`),
  submitAssignmentAction: 'שליחה לבדיקה',
  submitAssignmentSending: 'שולחים…',
  submitAssignmentDone: 'נשלח בהצלחה לבדיקה.',
  submitAssignmentPartialError: 'חלק מהשאלות לא נשלחו (תקלת תקשורת). אפשר ללחוץ שוב על השליחה — שאלות שכבר נשלחו לא יישלחו פעמיים.',
  hints: 'רמזים',
  hintN: (n) => `רמז ${n}`,
  revealHint: (n, total) => `הצגת רמז ${n} מתוך ${total}`,
  hintsLocked: 'הרמזים לשאלה הזו ייפתחו על ידי המורה.',
  allHintsShown: 'כל הרמזים מוצגים.',
  solution: 'פתרון',
  revealSolution: 'הצגת הפתרון',
  solutionAfterSubmit: 'הפתרון ייפתח אחרי שתגישו את התשובה.',
  solutionLocked: 'הפתרון ייפתח על ידי המורה.',
  explanation: 'הסבר',
  prev: 'השאלה הקודמת',
  next: 'השאלה הבאה',
  notFound: 'המטלה לא נמצאה.',
  leaveWarning: 'יש שינויים שעוד לא נשמרו.',
  stepReviewed: 'התקבל משוב', // a11y-only suffix for the stepper's reviewed state (Step 5, decision 6)
};

// ---------------------------------------------------------------------
// Phase 4 step 2 — mistake tags (teacher only; decisions 55, 60, 63)
// ---------------------------------------------------------------------
export const mistakeTags = {
  title: 'תגיות טעות',
  explain: 'רשימה קבועה של טעויות לסיווג עקבי בבדיקה. כלי פנימי – התלמידים לא רואים את התגיות.',
  add: 'תגית חדשה',
  create: 'יצירת תגית',
  name: 'שם התגית',
  topic: 'נושא',
  general: 'כללי בקורס',
  description: 'תיאור קצר (לא חובה)',
  nameRequired: 'יש להזין שם לתגית.',
  duplicate: 'כבר קיימת בקורס תגית בשם הזה.',
  emptyTitle: 'עדיין אין תגיות טעות',
  emptyBody: 'צרו תגיות לטעויות שחוזרות, למשל "איבוד הפניה" או "מקרה קצה".',
  usage: (n) => (n === 0 ? 'לא בשימוש' : n === 1 ? 'בשימוש בהגשה אחת' : `בשימוש ב-${n} הגשות`),
  delete: 'מחיקה לצמיתות',
  deleteTitle: (name) => `למחוק את התגית "${name}"?`,
  deleteBody: 'התגית לא בשימוש באף הגשה. הפעולה אינה ניתנת לביטול.',
  inUseTitle: 'אי אפשר למחוק תגית שבשימוש',
  inUseBody: (n) => `התגית משויכת ל-${n === 1 ? 'הגשה אחת' : `${n} הגשות`} ולכן היא חלק מהתיעוד. אפשר להעביר אותה לארכיון: היא תישאר בהיסטוריה ולא תוצע בבדיקות חדשות.`,
  close: 'סגירה',
};

// ---------------------------------------------------------------------
// Phase 4 step 3 — review screen & feedback draft (decisions 49, 59–68)
// ---------------------------------------------------------------------
export const verdictLabels = {
  correct: 'נכון',
  partial: 'נכון חלקית',
  needs_fix: 'לתיקון',
  incorrect: 'לא נכון',
};

export const review = {
  title: 'בדיקת הגשות',
  reviewThis: 'בדיקת ההגשה',
  back: 'חזרה למטלה',
  student: 'תלמיד',
  nextPending: 'הבא לבדיקה',
  noPending: 'אין הגשות נוספות שממתינות לבדיקה במטלה הזו.',
  notFound: 'המטלה לא נמצאה, או שאין לך גישה אליה.',
  noStudents: 'אין תלמידים משויכים למטלה.',
  draftAssignment: 'המטלה עדיין בטיוטה – אין הגשות לבדוק.',
  states: {
    none: 'לא התחיל', in_progress: 'בעבודה', pending: 'ממתין לבדיקה',
    pending_draft: 'טיוטת משוב', reviewed: 'נבדק', returned: 'הוחזר לתיקון',
  },
  question: 'השאלה כפי שהתלמיד קיבל',
  reference: 'פתרון הייחוס',
  referenceEmpty: 'לשאלה אין פתרון שמור.',
  hintsTitle: 'רמזים בשאלה',
  attempt: (n) => `ניסיון ${n}`,
  questionN: (n) => `שאלה ${n}`,
  prevQuestion: 'השאלה הקודמת',
  nextQuestion: 'השאלה הבאה',
  submittedAt: 'הוגש',
  answer: 'התשובה שהוגשה',
  noSubmission: 'התלמיד עוד לא הגיש תשובה לשאלה הזו.',
  workingOnNext: (n) => `התלמיד עובד כעת על ניסיון ${n}.`,
  hintsUsed: (n, total, byTeacher) => `רמזים שנחשפו: ${n} מתוך ${total}${byTeacher ? ` (${byTeacher} נפתחו על ידי המורה)` : ''}`,
  solutionSeen: (when) => `התלמיד צפה בפתרון (${when})`,
  solutionNotSeen: 'התלמיד לא צפה בפתרון',
  // form
  feedbackTitle: 'משוב',
  verdict: 'משוב', // Round 6, section D: "פסק דין" is too harsh a term for a learning tool; UI text only, DB column `verdict` is unchanged
  message: 'הודעה לתלמיד',
  messageHint: 'התלמיד יראה את ההודעה ואת המשוב אחרי השחרור. אפשר להשתמש ב-Markdown ובנוסחאות.',
  previewToggle: 'תצוגה כפי שהתלמיד יראה',
  privateNote: 'הערה פרטית למורה',
  privateNoteHint: 'לא מוצגת לתלמיד בשום מצב.',
  tags: 'תגיות טעות',
  tagsHint: 'כלי פנימי – לא מוצגות לתלמיד.',
  tagsEmpty: 'אין תגיות טעות בקורס. אפשר ליצור אותן בדף הקורס.',
  tagsGeneral: 'כללי בקורס',
  returnIntent: 'להחזיר לתלמיד לניסיון נוסף', // unused since the Round 6 Production fix below — kept, not deleted
  returnIntentHint: 'ההחזרה תתבצע בזמן שחרור המשוב.', // unused, same reason
  // Round 6 Production fix (section 6): "לתיקון" now IS the decision to
  // return the question — replaces the separate checkbox above.
  needsFixReturnNote: 'משוב "לתיקון" יחזיר את השאלה לתלמיד לניסיון נוסף בעת השליחה.',
  solutionSeenWarning: 'התלמיד כבר צפה בפתרון לשאלה זו.',
  ready: 'מוכן לשחרור',
  missingVerdict: 'חסר משוב',
  missingMessage: 'חסרה הודעה לתלמיד (חובה לכל משוב שאינו "נכון")',
  releaseLater: 'שחרור המשוב לתלמיד יתווסף בשלב הבא. כרגע נשמרת טיוטה בלבד, והתלמיד לא רואה אותה.',
  saveDraft: 'שמירת טיוטה',
  released: (when) => `המשוב שוחרר לתלמיד ב-${when} ואינו ניתן לשינוי.`,
  returnedAt: (when) => `הוחזר לתיקון ב-${when}.`,
  metadataEditable: 'ההערה הפרטית ותגיות הטעות עדיין ניתנות לעדכון.',
  conflict: 'המצב השתנה בינתיים. הנתונים נטענו מחדש.',
  save: { idle: '', dirty: 'שינויים שלא נשמרו', saving: 'שומר…', saved: (t) => `נשמר ${t}`, error: 'לא נשמר. מנסים שוב…' },
};

// ---------------------------------------------------------------------
// Phase 6 / Round 1B — הצעת AI למורה (AI מציע, המורה מחליט)
// ---------------------------------------------------------------------
export const aiReview = {
  button: 'הצעת AI',
  buttonAgain: 'ניתוח מחדש',
  loading: 'מנתח את התשובה...',
  title: 'הצעת AI',
  badge: 'הצעה בלבד · לא נשמרה ולא נשלחה לתלמיד',
  hint: 'ה-AI מנתח את התשובה ומציע. ההחלטה, השמירה והשליחה לתלמיד — שלך.',
  proposedVerdict: 'הערכה מוצעת',
  useVerdict: 'בחירה בהערכה המוצעת',
  verdictSelected: 'נבחרה בטופס',
  verdictApplied: (label) => `נבחרה ההערכה "${label}". אפשר לשנות בבורר שלמעלה.`,
  verdictReplaced: (from, to) => `ההערכה שונתה מ-"${from}" ל-"${to}". אפשר לחזור לבחירה הקודמת בבורר שלמעלה.`,
  needsFixNote: 'בחירה ב"לתיקון" מחזירה את השאלה לתלמיד בעת השליחה — כמו בבחירה ידנית.',
  analysis: 'אבחון למורה (לא מוצג לתלמיד)',
  studentFeedback: 'משוב מוצע לתלמיד',
  useFeedback: 'השתמש במשוב המוצע',
  feedbackCopied: 'המשוב הועתק לשדה ההודעה לתלמיד. אפשר לערוך אותו; הוא נשמר כטיוטה כרגיל ולא נשלח לתלמיד.',
  existingTextTitle: 'כבר יש הודעה בשדה. מה לעשות עם המשוב המוצע?',
  replaceText: 'החלפת הטקסט הקיים',
  appendText: 'הוספה בסוף הטקסט',
  cancel: 'ביטול',
  close: 'סגירה',
  undo: 'שחזור הטקסט הקודם',
  recommendYes: 'ה-AI ממליץ להחזיר לתיקון',
  recommendNo: 'ה-AI לא ממליץ להחזיר לתיקון',
  recommendNote: 'זו המלצה בלבד. החזרה לתיקון נקבעת רק כשאתה בוחר בהערכה "לתיקון".',
  recommendMismatchYes: 'אם תרצה להחזיר לתיקון — בחר בהערכה "לתיקון".',
  recommendMismatchNo: 'ההערכה המוצעת היא "לתיקון", אך ה-AI לא ממליץ להחזיר. ההחלטה שלך.',
  attentionTitle: 'כדאי לבדוק את התשובה בעיון',
  attentionGeneric: 'ה-AI סימן שהתשובה דורשת תשומת לב מיוחדת.',
  notesTitle: 'הערות ה-AI',
  errors: {
    unauthorized: 'ההתחברות פגה. רעננו את הדף והתחברו מחדש.',
    forbidden: 'אין הרשאה להפעיל ניתוח AI.',
    not_found: 'ההגשה לא נמצאה, או שאינה שלך.',
    bad_request: 'לא ניתן לבצע ניתוח AI להגשה הזו.',
    missing_context: 'אין מספיק תוכן לניתוח (התשובה או השאלה ריקות). אפשר להמשיך לבדוק ידנית.',
    timeout: 'הניתוח לקח יותר מדי זמן. אפשר לנסות שוב או להמשיך לבדוק את התשובה ידנית.',
    quota_exceeded: 'מכסת ה-AI הנוכחית מוצתה. אפשר לנסות שוב מאוחר יותר, או להמשיך לבדוק ידנית.',
    server_overload: 'שירות ה-AI עמוס כרגע. אפשר לנסות שוב בעוד רגע, או להמשיך לבדוק ידנית.',
    no_connection: 'אין חיבור לשירות ה-AI. בדקו את האינטרנט ונסו שוב, או המשיכו לבדוק ידנית.',
    invalid_output: 'ה-AI החזיר תשובה שלא ניתן להציג. אפשר לנסות שוב או להמשיך לבדוק ידנית.',
    fallback: 'לא ניתן לבצע כרגע ניתוח AI. אפשר להמשיך לבדוק את התשובה ידנית.',
  },
  retry: 'ניסיון נוסף',
  manualOk: 'הבדיקה הידנית ממשיכה לעבוד כרגיל.',
};

// ---------------------------------------------------------------------
// Phase 4 step 4 + UX fixes — queue, release, return, bulk release
// ---------------------------------------------------------------------
export const formatRelativeDay = (iso) => {
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `ב-${new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(d)}`;
};

export const reviewQueue = {
  title: 'ממתינות לבדיקה',
  subtitle: 'מטלות שתלמידים הגישו וממתינות לבדיקה שלך. ההגשות האחרונות ראשונות.',
  submitted: (when) => `הוגש ${when}`,
  pendingOf: (p, total) => (p === 1 ? `שאלה אחת ממתינה מתוך ${total}` : `${p} שאלות ממתינות מתוך ${total}`),
  drafts: (n) => (n === 1 ? 'טיוטת משוב אחת' : `${n} טיוטות משוב`),
  open: 'בדיקת המטלה',
  closed: 'מטלה סגורה',
  emptyTitle: 'אין הגשות שממתינות לבדיקה',
  emptyBody: 'כשתלמיד יגיש תשובה, המטלה תופיע כאן.',
};

export const release = {
  release: 'שחרור משוב',
  releaseAndReturn: 'שחרור והחזרה לניסיון נוסף',
  confirmTitle: 'לשחרר את המשוב לתלמיד?',
  confirmBody: 'התלמיד יראה את המשוב ואת ההודעה. אחרי השחרור המשוב קבוע ואי אפשר לערוך אותו.',
  confirmReturn: 'השאלה תיפתח לתלמיד לניסיון נוסף, עם התשובה הקודמת שלו כנקודת התחלה.',
  released: 'המשוב שוחרר לתלמיד.',
  releasedAndReturned: 'המשוב שוחרר, והשאלה הוחזרה לתלמיד לניסיון נוסף.',
  lateReturn: 'החזרה לתיקון',
  lateReturnTitle: 'להחזיר את השאלה לתלמיד לניסיון נוסף?',
  lateReturnBody: 'המשוב שכבר שוחרר נשאר כפי שהוא. השאלה תיפתח לתלמיד לניסיון נוסף.',
  returned: 'השאלה הוחזרה לתלמיד לניסיון נוסף.',
  notReadyHint: 'אפשר לשחרר רק משוב מוכן.',
  reasons: {
    not_ready: 'המשוב עדיין לא מוכן לשחרור.',
    closed_no_return: 'המטלה סגורה, ולכן אי אפשר להחזיר לתיקון כרגע. אפשר לפתוח את המטלה מחדש.',
    already_released: 'המשוב כבר שוחרר.',
    already_returned: 'השאלה כבר הוחזרה לתיקון.',
    not_latest: 'זה לא הניסיון האחרון של התלמיד.',
    not_released: 'אפשר להחזיר רק אחרי שחרור משוב.',
    no_feedback: 'אין משוב לשחרור.',
    bad_state: 'מצב ההגשה השתנה.',
  },
  bulk: 'שחרור כל המשובים המוכנים',
  bulkTitle: 'שחרור כל המשובים המוכנים במטלה',
  bulkReady: (n) => (n === 1 ? 'משוב אחד מוכן לשחרור' : `${n} משובים מוכנים לשחרור`),
  bulkWithReturn: (n) => (n === 1 ? 'מתוכם אחד כולל החזרה לניסיון נוסף' : `מתוכם ${n} כוללים החזרה לניסיון נוסף`),
  bulkNotReady: (n) => (n === 1 ? 'טיוטה אחת לא מוכנה – לא תשוחרר' : `${n} טיוטות לא מוכנות – לא ישוחררו`),
  bulkNoFeedback: (n) => (n === 1 ? 'הגשה אחת עדיין בלי משוב – לא תשתנה' : `${n} הגשות עדיין בלי משוב – לא ישתנו`),
  bulkBlocked: (n) => (n === 1 ? 'משוב אחד מסומן להחזרה במטלה סגורה – לא ישוחרר' : `${n} משובים מסומנים להחזרה במטלה סגורה – לא ישוחררו`),
  bulkNothing: 'אין כרגע משובים מוכנים לשחרור במטלה.',
  bulkAllOrNothing: 'השחרור מתבצע בבת אחת: אם משהו השתנה מאז הבדיקה, שום משוב לא ישוחרר.',
  bulkConfirm: (n) => `שחרור ${n}`,
  bulkDone: (n, r) => `שוחררו ${n} משובים${r ? ` (${r} הוחזרו לניסיון נוסף)` : ''}.`,
  bulkStale: 'המצב השתנה מאז התצוגה המקדימה, ולכן שום משוב לא שוחרר. בדקו שוב ונסו מחדש.',
  close: 'סגירה',

  // Step 5 — send feedback to one student for one assignment (decisions 1-3, 7-8):
  // release moves from per-question to a single Student × Assignment action here.
  sendReadiness: (ready, total) => `${ready} מתוך ${total} שאלות מוכנות`,
  sendButton: (name) => `שליחת משוב ל${name}`,
  sendBlockedClosed: (n) => (n === 1
    ? 'שאלה אחת מוכנה מסומנת להחזרה לתיקון, אבל המטלה סגורה. הסירו את סימון ההחזרה או פתחו את המטלה מחדש לפני השליחה.'
    : `${n} שאלות מוכנות מסומנות להחזרה לתיקון, אבל המטלה סגורה. הסירו את סימון ההחזרה או פתחו את המטלה מחדש לפני השליחה.`),
  sendTitle: 'שליחת משוב לתלמיד',
  sendConfirmTitle: (name, n) => `לשלוח ל${name} משוב עבור ${n} ${n === 1 ? 'שאלה' : 'שאלות'}?`,
  sendConfirmBody: 'התלמיד יראה את כל המשובים האלה בבת אחת. אחרי השליחה הם קבועים ואי אפשר לערוך אותם.',
  sendConfirmAction: 'שליחת משוב',
  sendStale: 'המצב השתנה מאז החישוב (למשל טיוטה לא הייתה מוכנה, או שהוגש ניסיון חדש), ולכן לא נשלח שום משוב. בדקו את השאלות ונסו לשלוח מחדש.',
  sendDone: (name, n, r) => `נשלח משוב ל${name} עבור ${n} ${n === 1 ? 'שאלה' : 'שאלות'}${r ? ` (${r} הוחזרו לניסיון נוסף)` : ''}.`,
};

// Student side — minimal display needed to complete the step-4 flow
export const studentFeedback = {
  title: 'משוב מהמורה',
  verdict: 'משוב', // Round 6, section D — see review.verdict above
  reviewed: (v) => `נבדק: ${v}`,
  returnedBanner: (n) => `הוחזר לתיקון – ניסיון ${n}. קראו את המשוב, תקנו והגישו שוב.`,
  resubmit: (n) => `הגשה חוזרת (ניסיון ${n})`,
  releasedAt: (when) => `ב-${when}`,
};

// ---------------------------------------------------------------------
// Phase 5 step 2 — Notification / Action Center (bell + panel)
// ---------------------------------------------------------------------
export const notifications = {
  bell: 'התראות',
  // Round 6: the count can include a purely-informational row (student's
  // "התקבל משוב חדש") alongside actionable ones, so the wording is now
  // role-neutral rather than "דורשים טיפול" for all of them.
  bellWithCount: (n) => `התראות, ${n} פריטים`,
  panelTitle: 'התראות',
  pendingSection: 'דורש טיפול',
  newSection: 'חדש',
  pendingEmpty: 'אין כרגע פריטים שדורשים טיפול.',
  newEmpty: 'אין אירועים חדשים.',
  loading: 'טוען התראות…',
  loadError: 'לא הצלחנו לטעון את ההתראות.',
  retry: 'ניסיון נוסף',
  unread: 'לא נקרא',
  close: 'סגירה',
  // Teacher's "דורש טיפול" is grouped Student × Assignment (decision 85,
  // matching the "בדיקות" hub's own grouping) — one line per group, e.g.
  // "בננה — אבישג וקיל" + "5 שאלות ממתינות לבדיקה" underneath.
  pendingTeacherTitle: (assignmentTitle, studentName) => `${assignmentTitle} — ${studentName}`,
  pendingCount: (n) => (n === 1 ? 'שאלה אחת ממתינה לבדיקה' : `${n} שאלות ממתינות לבדיקה`),
  // A resubmission after a return reads distinctly (decision 5) — same unit
  // (Student × Assignment), different, more notable wording + icon (↻).
  correctionCount: (n) => (n === 1 ? 'תיקון התקבל' : `${n} תיקונים לבדיקה`),
  // Student side — Assignment is the whole unit now (Notification Center
  // principle this round): no question names anywhere, on either list.
  pendingStudentStatus: 'הוחזרה לתיקון',
  eventSubmissionReceived: (student) => `הגשה חדשה${student ? ` (${student})` : ''}`, // teacher's rare unmatched leftover only
  eventFeedbackAvailable: 'התקבל משוב חדש',
  eventReturnedForRevision: 'הוחזר לתיקון', // rare unmatched leftover fallback only — see notificationsApi.reconcile()
};
