// All user-facing Hebrew text lives here.
// To rename a term across the whole app, change it once in this file.

export const app = {
  name: 'חוליה',
  tagline: 'מקום אחד לשיעורים, למטלות ולהתקדמות',
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

export const common = {
  loading: 'טוען…',
  hello: (name) => (name ? `שלום, ${name}` : 'שלום'),
  since: 'מאז',
  cancel: 'ביטול',
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
  emptyTitle: 'עדיין אין תלמידים',
  emptyBody: 'הזמינו את התלמיד הראשון בטופס שלמעלה.',
  status: { active: 'פעיל', archived: 'בארכיון' },
  inviteErrors: {
    email_exists: 'כבר קיים משתמש עם האימייל הזה.',
    invalid_email: 'כתובת האימייל אינה תקינה.',
    invalid_name: 'יש להזין שם באורך 2 עד 120 תווים.',
    forbidden: 'רק מורה יכול להזמין תלמידים.',
    unauthorized: 'פג תוקף ההתחברות. היכנסו מחדש.',
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
  java: 'Java', python: 'Python', csharp: 'C#', c: 'C', cpp: 'C++', javascript: 'JavaScript',
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
