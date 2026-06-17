import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { ScrollToTop } from './components/ScrollToTop';
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
import { AdminBadgesPage } from './pages/admin/AdminBadgesPage';
import { AdminImportPage } from './pages/admin/AdminImportPage';
import { TimetablePage } from './pages/coaching/TimetablePage';
import { CalendarPage } from './pages/calendar/CalendarPage';
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
import { LeagueOverviewPage } from './pages/league/LeagueOverviewPage';
import { FixtureDetailPage } from './pages/league/FixtureDetailPage';
import { LeagueManagePage } from './pages/league/LeagueManagePage';
import { ProfilePage } from './pages/profile/ProfilePage';

// Access-tier guards. Each wraps an <Outlet/> so a group of routes declares its
// allowed roles once, in the route tree, instead of repeating RequireRole on
// every leaf. RequireRole itself is unchanged; role membership is identical to
// the previous per-route lists. Route-level access lives here; pages still gate
// individual *controls* (e.g. tournament management buttons) internally.
function CoachAdminOnly() {
  return (
    <RequireRole roles={['admin', 'coach']}>
      <Outlet />
    </RequireRole>
  );
}

function StaffOnly() {
  return (
    <RequireRole roles={['admin', 'coach', 'committee']}>
      <Outlet />
    </RequireRole>
  );
}

function AdminOnly() {
  return (
    <RequireRole roles={['admin']}>
      <Outlet />
    </RequireRole>
  );
}

function AdminCommitteeOnly() {
  return (
    <RequireRole roles={['admin', 'committee']}>
      <Outlet />
    </RequireRole>
  );
}

function PlayerOnly() {
  return (
    <RequireRole roles={['player']}>
      <Outlet />
    </RequireRole>
  );
}

function ParentOnly() {
  return (
    <RequireRole roles={['parent']}>
      <Outlet />
    </RequireRole>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
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
        {/* Shared — any signed-in role. */}
        <Route path="/dashboard" element={<RoleDashboard />} />
        {/* Tournaments — shared read-only list + detail for every signed-in role. */}
        <Route path="/tournaments" element={<TournamentsListPage />} />
        <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
        {/* Bracket — all signed-in roles can view; management controls are gated
            to admin/coach inside the page. */}
        <Route path="/tournaments/:id/bracket" element={<TournamentBracketPage />} />
        {/* Series / order-of-merit — all signed-in roles view standings;
            create/edit/delete is gated to admin inside the pages. */}
        <Route path="/series" element={<SeriesListPage />} />
        <Route path="/series/:id" element={<SeriesDetailPage />} />
        {/* Junior League — shared read-only overview + fixture detail for every
            signed-in role; all scoring is server-computed. */}
        <Route path="/league" element={<LeagueOverviewPage />} />
        <Route path="/league/fixtures/:id" element={<FixtureDetailPage />} />
        {/* Social phase — every role chats (matrix enforced server-side) and
            reads the club announcement feed. */}
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        {/* Quarterly clinic timetable — visible to all signed-in roles. */}
        <Route path="/timetable" element={<TimetablePage />} />
        {/* Events / calendar — every signed-in role views their week; create is
            gated to admin/coach/committee inside the page. */}
        <Route path="/calendar" element={<CalendarPage />} />
        {/* Self-service profile — any signed-in user edits their own name/phone. */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* admin + coach — tournament management, external results, sessions,
            and writing/coach-signing evaluations. */}
        <Route element={<CoachAdminOnly />}>
          <Route path="/tournaments/new" element={<TournamentFormPage />} />
          <Route path="/tournaments/:id/edit" element={<TournamentFormPage />} />
          <Route
            path="/tournaments/:id/enter-scores"
            element={<TournamentEnterScoresPage />}
          />
          {/* External results log — admin/coach record off-club events that feed
              a junior's competitions-played / best-gross stats. */}
          <Route path="/tournaments/external" element={<TournamentExternalResultsPage />} />
          {/* Group training sessions — coach publishes + approves. */}
          <Route path="/coach-sessions" element={<CoachSessionsPage />} />
          <Route path="/evaluations/new" element={<CoachWriteEvaluationPage />} />
        </Route>

        {/* admin + coach + committee — junior browser/profiles, weekly schedule,
            and verifying the rounds queue. */}
        <Route element={<StaffOnly />}>
          <Route path="/league/manage" element={<LeagueManagePage />} />
          <Route path="/juniors" element={<JuniorsBrowserPage />} />
          <Route path="/juniors/:id" element={<JuniorProfilePage />} />
          <Route path="/schedule" element={<CoachSchedulePage />} />
          {/* Rounds verification queue — staff sign off pending rounds. */}
          <Route path="/verify-rounds" element={<VerifyRoundsPage />} />
        </Route>

        {/* admin only — privileged user/config/reference/reporting surfaces. */}
        <Route element={<AdminOnly />}>
          <Route path="/users" element={<AdminUsersPage />} />
          <Route path="/coach-assignments" element={<AdminCoachAssignmentsPage />} />
          <Route path="/moderation" element={<AdminModerationPage />} />
          <Route path="/audit-log" element={<AdminAuditLogPage />} />
          <Route path="/courses" element={<AdminCoursesPage />} />
          <Route path="/admin/benchmarks" element={<AdminBenchmarksPage />} />
          <Route path="/admin/badges" element={<AdminBadgesPage />} />
        </Route>

        {/* admin + committee — bulk junior import and the evaluation
            counter-sign queue. */}
        <Route element={<AdminCommitteeOnly />}>
          <Route path="/import" element={<AdminImportPage />} />
          <Route path="/evaluations" element={<CommitteeEvaluationsPage />} />
        </Route>

        {/* player only — own progress, handicap, achievements. */}
        <Route element={<PlayerOnly />}>
          <Route path="/achievements" element={<AchievementsPage />} />
          <Route path="/progress" element={<PlayerProgressPage />} />
          <Route path="/handicap" element={<PlayerHandicapPage />} />
        </Route>

        {/* parent only — own child + session requests. */}
        <Route element={<ParentOnly />}>
          <Route path="/my-child" element={<ParentChildPage />} />
          <Route path="/sessions" element={<ParentSessionsPage />} />
        </Route>

        {/* Rounds — players log their own (pending until verified); staff log
            for any junior (verified immediately). admin/coach/player only. */}
        <Route
          path="/log-round"
          element={
            <RequireRole roles={['admin', 'coach', 'player']}>
              <LogRoundPage />
            </RequireRole>
          }
        />
        {/* Booking onto published sessions — parents and players. */}
        <Route
          path="/book-session"
          element={
            <RequireRole roles={['parent', 'player']}>
              <BookSessionPage />
            </RequireRole>
          }
        />
        {/* Attendance capture — coach only (on the range). */}
        <Route
          path="/attendance"
          element={
            <RequireRole roles={['coach']}>
              <CoachAttendancePage />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
