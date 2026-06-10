import { Navigate, Route, Routes } from 'react-router-dom';

import { PublicOnly } from './auth/PublicOnly';
import { RequireRole } from './auth/RequireRole';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { RoleDashboard } from './pages/dashboard/RoleDashboard';
import { AchievementsPage } from './pages/player/AchievementsPage';
import { PlayerProgressPage } from './pages/player/PlayerProgressPage';
import { PlayerHandicapPage } from './pages/player/PlayerHandicapPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage';
import { AdminAuditLogPage } from './pages/admin/AdminAuditLogPage';
import { CoachSchedulePage } from './pages/coach/CoachSchedulePage';
import { CoachAttendancePage } from './pages/coach/CoachAttendancePage';
import { CommitteeEvaluationsPage } from './pages/committee/CommitteeEvaluationsPage';
import { ParentChildPage } from './pages/parent/ParentChildPage';
import { ParentSessionsPage } from './pages/parent/ParentSessionsPage';
import { TournamentsListPage } from './pages/tournaments/TournamentsListPage';
import { TournamentDetailPage } from './pages/tournaments/TournamentDetailPage';
import { TournamentEnterScoresPage } from './pages/tournaments/TournamentEnterScoresPage';
import { TournamentFormPage } from './pages/tournaments/TournamentFormPage';
import { TournamentBracketPage } from './pages/tournaments/TournamentBracketPage';
import { TournamentExternalResultsPage } from './pages/tournaments/TournamentExternalResultsPage';

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
        {/* Tournaments — shared read-only list + detail for every signed-in role. */}
        <Route path="/tournaments" element={<TournamentsListPage />} />
        <Route
          path="/tournaments/new"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <TournamentFormPage />
            </RequireRole>
          }
        />
        <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
        <Route
          path="/tournaments/:id/edit"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <TournamentFormPage />
            </RequireRole>
          }
        />
        <Route
          path="/tournaments/:id/enter-scores"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <TournamentEnterScoresPage />
            </RequireRole>
          }
        />
        {/* Bracket — all signed-in roles can view; management controls are gated
            to admin/coach inside the page. */}
        <Route path="/tournaments/:id/bracket" element={<TournamentBracketPage />} />
        {/* External results log — admin/coach record off-club events that feed a
            junior's competitions-played / best-gross stats. */}
        <Route
          path="/tournaments/external"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <TournamentExternalResultsPage />
            </RequireRole>
          }
        />
        <Route
          path="/achievements"
          element={
            <RequireRole roles={['player']}>
              <AchievementsPage />
            </RequireRole>
          }
        />
        <Route
          path="/progress"
          element={
            <RequireRole roles={['player']}>
              <PlayerProgressPage />
            </RequireRole>
          }
        />
        <Route
          path="/handicap"
          element={
            <RequireRole roles={['player']}>
              <PlayerHandicapPage />
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
        <Route
          path="/schedule"
          element={
            <RequireRole roles={['coach']}>
              <CoachSchedulePage />
            </RequireRole>
          }
        />
        <Route
          path="/attendance"
          element={
            <RequireRole roles={['coach']}>
              <CoachAttendancePage />
            </RequireRole>
          }
        />
        <Route
          path="/evaluations"
          element={
            <RequireRole roles={['committee']}>
              <CommitteeEvaluationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/my-child"
          element={
            <RequireRole roles={['parent']}>
              <ParentChildPage />
            </RequireRole>
          }
        />
        <Route
          path="/sessions"
          element={
            <RequireRole roles={['parent']}>
              <ParentSessionsPage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
