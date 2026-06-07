import { Navigate, Route, Routes } from 'react-router-dom';

import { PublicOnly } from './auth/PublicOnly';
import { RequireRole } from './auth/RequireRole';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { RoleDashboard } from './pages/dashboard/RoleDashboard';
import { AchievementsPage } from './pages/player/AchievementsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage';
import { AdminAuditLogPage } from './pages/admin/AdminAuditLogPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      {/* Signed-in app: role-guarded shell layout with nested pages. */}
      <Route
        element={
          <RequireRole>
            <AppShell />
          </RequireRole>
        }
      >
        <Route path="/dashboard" element={<RoleDashboard />} />
        <Route
          path="/achievements"
          element={
            <RequireRole roles={['player']}>
              <AchievementsPage />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole roles={['admin']}>
              <AdminUsersPage />
            </RequireRole>
          }
        />
        <Route
          path="/audit-log"
          element={
            <RequireRole roles={['admin']}>
              <AdminAuditLogPage />
            </RequireRole>
          }
        />
        <Route
          path="/courses"
          element={
            <RequireRole roles={['admin']}>
              <AdminCoursesPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
