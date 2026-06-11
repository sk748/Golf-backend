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
import { AdminCoachAssignmentsPage } from './pages/admin/AdminCoachAssignmentsPage';
import { AdminModerationPage } from './pages/admin/AdminModerationPage';
import { AdminBenchmarksPage } from './pages/admin/AdminBenchmarksPage';
import { AdminImportPage } from './pages/admin/AdminImportPage';
import { TimetablePage } from './pages/coaching/TimetablePage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { AnnouncementsPage } from './pages/announcements/AnnouncementsPage';
import { CoachSchedulePage } from './pages/coach/CoachSchedulePage';
import { CoachAttendancePage } from './pages/coach/CoachAttendancePage';
import { CoachWriteEvaluationPage } from './pages/coach/CoachWriteEvaluationPage';
import { CommitteeEvaluationsPage } from './pages/committee/CommitteeEvaluationsPage';
import { ParentChildPage } from './pages/parent/ParentChildPage';
import { ParentSessionsPage } from './pages/parent/ParentSessionsPage';
import { TournamentsListPage } from './pages/tournaments/TournamentsListPage';
import { TournamentDetailPage } from './pages/tournaments/TournamentDetailPage';
import { TournamentEnterScoresPage } from './pages/tournaments/TournamentEnterScoresPage';
import { TournamentFormPage } from './pages/tournaments/TournamentFormPage';
import { TournamentBracketPage } from './pages/tournaments/TournamentBracketPage';
import { TournamentExternalResultsPage } from './pages/tournaments/TournamentExternalResultsPage';
import { LogRoundPage } from './pages/scoring/LogRoundPage';
import { VerifyRoundsPage } from './pages/scoring/VerifyRoundsPage';
import { CoachSessionsPage } from './pages/coaching/CoachSessionsPage';
import { BookSessionPage } from './pages/coaching/BookSessionPage';
import { JuniorsBrowserPage } from './pages/juniors/JuniorsBrowserPage';
import { JuniorProfilePage } from './pages/juniors/JuniorProfilePage';
import { SeriesListPage } from './pages/tournaments/SeriesListPage';
import { SeriesDetailPage } from './pages/tournaments/SeriesDetailPage';

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
        {/* Series / order-of-merit — all signed-in roles view standings;
            create/edit/delete is gated to admin inside the pages. */}
        <Route path="/series" element={<SeriesListPage />} />
        <Route path="/series/:id" element={<SeriesDetailPage />} />
        {/* Social phase — every role chats (matrix enforced server-side) and
            reads the club announcement feed. */}
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        {/* Rounds — players log their own (pending until verified); staff log
            for any junior (verified immediately); staff verify the queue. */}
        <Route
          path="/log-round"
          element={
            <RequireRole roles={['admin', 'coach', 'player']}>
              <LogRoundPage />
            </RequireRole>
          }
        />
        <Route
          path="/verify-rounds"
          element={
            <RequireRole roles={['admin', 'coach', 'committee']}>
              <VerifyRoundsPage />
            </RequireRole>
          }
        />
        {/* Group training sessions — coach publishes + approves; parents and
            players book onto published sessions. */}
        <Route
          path="/coach-sessions"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <CoachSessionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/book-session"
          element={
            <RequireRole roles={['parent', 'player']}>
              <BookSessionPage />
            </RequireRole>
          }
        />
        {/* Staff junior browser + full profile view (committee sees the full
            intake incl. medical/goals; admin/committee can edit). */}
        <Route
          path="/juniors"
          element={
            <RequireRole roles={['admin', 'coach', 'committee']}>
              <JuniorsBrowserPage />
            </RequireRole>
          }
        />
        <Route
          path="/juniors/:id"
          element={
            <RequireRole roles={['admin', 'coach', 'committee']}>
              <JuniorProfilePage />
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
          path="/coach-assignments"
          element={
            <RequireRole roles={['admin']}>
              <AdminCoachAssignmentsPage />
            </RequireRole>
          }
        />
        <Route
          path="/moderation"
          element={
            <RequireRole roles={['admin']}>
              <AdminModerationPage />
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
          path="/admin/benchmarks"
          element={
            <RequireRole roles={['admin']}>
              <AdminBenchmarksPage />
            </RequireRole>
          }
        />
        <Route
          path="/import"
          element={
            <RequireRole roles={['admin', 'committee']}>
              <AdminImportPage />
            </RequireRole>
          }
        />
        <Route
          path="/timetable"
          element={
            <RequireRole roles={['admin', 'coach', 'committee', 'parent', 'player']}>
              <TimetablePage />
            </RequireRole>
          }
        />
        <Route
          path="/schedule"
          element={
            <RequireRole roles={['admin', 'coach', 'committee']}>
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
            <RequireRole roles={['admin', 'committee']}>
              <CommitteeEvaluationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/evaluations/new"
          element={
            <RequireRole roles={['admin', 'coach']}>
              <CoachWriteEvaluationPage />
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
