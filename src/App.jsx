import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import RequireRole from './features/auth/RequireRole';
import RootRedirect from './features/auth/RootRedirect';
import FreshOpenRedirect from './features/auth/FreshOpenRedirect';
import LoginPage from './features/auth/LoginPage';
import SetPasswordPage from './features/auth/SetPasswordPage';
import TeacherLayout from './layouts/TeacherLayout';
import StudentLayout from './layouts/StudentLayout';
import TeacherHomePage from './features/dashboard/TeacherHomePage';
import StudentHomePage from './features/dashboard/StudentHomePage';
import SubjectsPage from './features/student/SubjectsPage';
import SubjectMapPage from './features/student/SubjectMapPage';
import LibraryPage from './features/student/LibraryPage';
import StudentsPage from './features/students/StudentsPage';
import CoursesPage from './features/content/CoursesPage';
import CoursePage from './features/content/CoursePage';
import { LoadingState } from './components/ui/States';

// Heavy teacher-only pages (code editor, markdown) load on demand.
const QuestionBankPage = lazy(() => import('./features/questions/QuestionBankPage'));
const QuestionEditorPage = lazy(() => import('./features/questions/QuestionEditorPage'));
const ImportsListPage = lazy(() => import('./features/imports/ImportsListPage'));
const NewImportPage = lazy(() => import('./features/imports/NewImportPage'));
const ImportReviewPage = lazy(() => import('./features/imports/ImportReviewPage'));
const ImportRunPage = lazy(() => import('./features/imports/ImportRunPage'));
const AssignmentsPage = lazy(() => import('./features/assignments/AssignmentsPage'));
const AssignmentPage = lazy(() => import('./features/assignments/AssignmentPage'));
const LessonsPage = lazy(() => import('./features/lessons/LessonsPage'));
const LessonDetailPage = lazy(() => import('./features/lessons/LessonDetailPage'));
const StudentLessonPage = lazy(() => import('./features/lessons/StudentLessonPage'));
const WorkspacePage = lazy(() => import('./features/workspace/WorkspacePage'));
const ReviewPage = lazy(() => import('./features/review/ReviewPage'));
const ReviewQueuePage = lazy(() => import('./features/review/ReviewQueuePage'));
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FreshOpenRedirect />
        <Suspense fallback={<LoadingState fullPage />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />

          <Route path="/teacher" element={<RequireRole role="teacher"><TeacherLayout /></RequireRole>}>
            <Route index element={<TeacherHomePage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:courseId" element={<CoursePage />} />
            <Route path="questions" element={<QuestionBankPage />} />
            <Route path="questions/import" element={<ImportsListPage />} />
            <Route path="questions/import/new" element={<NewImportPage />} />
            <Route path="questions/import/:importId" element={<ImportRunPage />} />
            <Route path="questions/import/:importId/review" element={<ImportReviewPage />} />
            <Route path="questions/new" element={<QuestionEditorPage key="new" />} />
            <Route path="questions/:questionId" element={<QuestionEditorPage />} />
            <Route path="lessons" element={<LessonsPage />} />
            <Route path="lessons/:lessonId" element={<LessonDetailPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="assignments/:assignmentId" element={<AssignmentPage />} />
            <Route path="assignments/:assignmentId/review" element={<ReviewPage />} />
            <Route path="review" element={<ReviewQueuePage />} />
          </Route>

          <Route path="/student" element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
            <Route index element={<StudentHomePage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="subjects/:courseId" element={<SubjectMapPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="lessons/:lessonId" element={<StudentLessonPage />} />
            <Route path="assignments/:assignmentId" element={<WorkspacePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
