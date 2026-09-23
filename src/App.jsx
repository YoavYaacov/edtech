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
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />

          <Route path="/teacher" element={<RequireRole role="teacher"><TeacherLayout /></RequireRole>}>
            <Route index element={<TeacherHomePage />} />
            <Route path="students" element={<StudentsPage />} />
          </Route>

          <Route path="/student" element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
            <Route index element={<StudentHomePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
