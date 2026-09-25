import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import RequireRole from './features/auth/RequireRole';
import RootRedirect from './features/auth/RootRedirect';
import LoginPage from './features/auth/LoginPage';
import SetPasswordPage from './features/auth/SetPasswordPage';
import TeacherLayout from './layouts/TeacherLayout';
import StudentLayout from './layouts/StudentLayout';
import TeacherHomePage from './features/dashboard/TeacherHomePage';
import StudentHomePage from './features/dashboard/StudentHomePage';
import StudentsPage from './features/students/StudentsPage';
import CoursesPage from './features/content/CoursesPage';
import CoursePage from './features/content/CoursePage';
import { LoadingState } from './components/ui/States';

// Heavy teacher-only pages (code editor, markdown) load on demand.
const QuestionBankPage = lazy(() => import('./features/questions/QuestionBankPage'));
const QuestionEditorPage = lazy(() => import('./features/questions/QuestionEditorPage'));
const AssignmentsPage = lazy(() => import('./features/assignments/AssignmentsPage'));
const AssignmentPage = lazy(() => import('./features/assignments/AssignmentPage'));
const WorkspacePage = lazy(() => import('./features/workspace/WorkspacePage'));
const ReviewPage = lazy(() => import('./features/review/ReviewPage'));
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="questions/new" element={<QuestionEditorPage key="new" />} />
            <Route path="questions/:questionId" element={<QuestionEditorPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="assignments/:assignmentId" element={<AssignmentPage />} />
            <Route path="assignments/:assignmentId/review" element={<ReviewPage />} />
          </Route>

          <Route path="/student" element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
            <Route index element={<StudentHomePage />} />
            <Route path="assignments/:assignmentId" element={<WorkspacePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
