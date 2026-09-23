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
  manageStudents: 'ניהול תלמידים',
  noStudentsTitle: 'בואו נתחיל',
  noStudentsBody: 'הזמינו את התלמיד הראשון כדי להתחיל לעבוד.',
  inviteFirst: 'הזמנת תלמיד',
};

export const studentHome = {
  yourTeacher: 'המורה שלך',
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
