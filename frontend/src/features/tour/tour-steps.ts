import type { Role } from '../../types/api';

// Bump when the tour content changes enough that returning users should see it
// again. The localStorage "seen" flag is keyed by this version (see TourProvider).
// v2: the tour now walks the user through each page (navigates as it goes)
// rather than pointing at the sidebar from the dashboard.
export const TOUR_VERSION = 'v2';

export interface TourStep {
  // CSS selector for the element to spotlight. Empty string → a centred card
  // with no spotlight (used for the welcome/closing steps, and the graceful
  // fallback when a target isn't on the page — e.g. a sidebar item that lives
  // behind the mobile menu).
  target: string;
  // Route to take the user to before this step's spotlight lands. The overlay
  // navigates here if we're not already on it, so the tour actually visits each
  // page (and a replay started from any page lands correctly). Omit to stay put.
  path?: string;
  title: string;
  body: string;
  // Preferred side of the target for the card; 'auto' picks the first side that
  // fits the viewport. Ignored when there's no target (always centred).
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}

// Per-role scripts. Each step carries the `path` of the page it describes, so
// the tour navigates there and the spotlight lands on a stable hook on that
// page: the player dashboard's own feature cards (always rendered in main
// content, so they work on mobile too) and the role-aware sidebar `nav-*`
// test-ids from nav-config.ts. Sidebar items only render on the desktop shell;
// on mobile those steps still navigate to the page and fall back to a centred
// card, so the script never dead-ends.
export const TOUR_STEPS_BY_ROLE: Record<Role, TourStep[]> = {
  player: [
    {
      target: '',
      path: '/dashboard',
      title: 'Welcome to your golf 🏌️',
      body: "This is your home base. Let's take 30 seconds to walk through where everything lives — your handicap, your progress, and how to log a round.",
    },
    {
      target: '[data-testid="hero-handicap"]',
      path: '/dashboard',
      title: 'Your handicap index',
      body: 'Your current handicap index sits front and centre. Tap it any time to see your full history and how each round changed it.',
      placement: 'bottom',
    },
    {
      target: '[data-testid="feature-progress"]',
      path: '/dashboard',
      title: 'Your progress',
      body: 'See your current level, the band you are in, and exactly what it takes to reach the next one.',
      placement: 'bottom',
    },
    {
      target: '[data-testid="feature-log-round"]',
      path: '/dashboard',
      title: 'Log a round',
      body: 'Played a round? Enter your scorecard hole by hole here. Once a coach verifies it, it updates your handicap.',
      placement: 'bottom',
    },
    {
      target: '[data-testid="feature-achievements"]',
      path: '/dashboard',
      title: 'Achievements',
      body: 'Earn badges as you train and play. Check back here to see what you have unlocked and what is next.',
      placement: 'bottom',
    },
    {
      target: '[data-testid="nav-book-session"]',
      path: '/book-session',
      title: 'Book a coaching session',
      body: "This is the booking page. Want extra practice? Pick a coach and a time that works for you.",
      placement: 'right',
    },
    {
      target: '[data-testid="nav-messages"]',
      path: '/messages',
      title: 'Messages',
      body: 'And here is where you chat with your coach and club. That is the whole tour — enjoy your golf!',
      placement: 'right',
    },
  ],
  parent: [
    {
      target: '',
      path: '/dashboard',
      title: "Welcome 👋",
      body: "Here's a quick walk-through of where to find your child's golf — their progress, coaching, and how to register them for events.",
    },
    {
      target: '[data-testid="nav-my-child"]',
      path: '/my-child',
      title: "Your child's profile",
      body: "This is your child's profile — their level, handicap, evaluations, and progress against their band, all in one place.",
      placement: 'right',
    },
    {
      target: '[data-testid="nav-coaching"]',
      path: '/sessions',
      title: 'Coaching sessions',
      body: 'On this page you can request a coaching session for your child and track its status.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-tournaments"]',
      path: '/tournaments',
      title: 'Tournaments',
      body: 'Browse upcoming events here and register your child for the ones they are eligible for.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-timetable"]',
      path: '/timetable',
      title: 'Clinic timetable',
      body: 'The quarterly clinic timetable shows the group sessions your child can book onto.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-messages"]',
      path: '/messages',
      title: 'Messages',
      body: "And this is where you stay in touch with the coaches and club. That's the tour — thanks for supporting your junior!",
      placement: 'right',
    },
  ],
  coach: [
    {
      target: '',
      path: '/dashboard',
      title: 'Welcome, coach 🏌️',
      body: "A quick walk-through of your tools — your juniors, attendance, evaluations, and your week.",
    },
    {
      target: '[data-testid="nav-juniors"]',
      path: '/juniors',
      title: 'Your juniors',
      body: 'These are the juniors assigned to you, with full profiles and progress. This is your starting point most days.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-attendance"]',
      path: '/attendance',
      title: 'Attendance',
      body: 'Record class attendance on this page — it counts toward each junior’s band session minimums.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-evaluations"]',
      path: '/evaluations/new',
      title: 'Evaluations',
      body: 'Write the monthly evaluation for each junior here — the form adapts to their band. You sign first, then committee counter-signs.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-schedule"]',
      path: '/schedule',
      title: 'Your schedule',
      body: 'Your week at a glance — classes and sessions laid out day by day.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-group-sessions"]',
      path: '/coach-sessions',
      title: 'Group sessions',
      body: 'Publish group training sessions and approve the players and parents who book onto them.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-verify-rounds"]',
      path: '/verify-rounds',
      title: 'Verify rounds',
      body: "Finally, clear the queue of rounds juniors have logged — verifying a round feeds it into their handicap. That's the tour!",
      placement: 'right',
    },
  ],
  committee: [
    {
      target: '',
      path: '/dashboard',
      title: 'Welcome to oversight 👋',
      body: "A quick walk-through of your programme view — juniors, evaluations to counter-sign, and competitions.",
    },
    {
      target: '[data-testid="nav-juniors"]',
      path: '/juniors',
      title: 'Juniors',
      body: 'Read-across visibility into every junior in the programme — profiles, progress, and evaluations.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-evaluations"]',
      path: '/evaluations',
      title: 'Counter-sign evaluations',
      body: 'Your key task lives here: counter-sign monthly evaluations. The sign-off only opens once the coach has signed first.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-schedules"]',
      path: '/schedule',
      title: 'Schedules',
      body: 'View the coaching schedules across the programme.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-tournaments"]',
      path: '/tournaments',
      title: 'Competitions',
      body: 'Follow tournaments, the junior league, and series standings.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-messages"]',
      path: '/messages',
      title: 'Messages',
      body: "And stay in touch with coaches and the club here. That's the tour!",
      placement: 'right',
    },
  ],
  admin: [
    {
      target: '',
      path: '/dashboard',
      title: 'Welcome, admin 🛠️',
      body: "A quick walk-through of running the club — people, the programme, competitions, and reference data.",
    },
    {
      target: '[data-testid="nav-users"]',
      path: '/users',
      title: 'User management',
      body: 'Create coach and committee accounts and manage roles here. You are the only role that can create privileged users.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-juniors"]',
      path: '/juniors',
      title: 'Juniors',
      body: 'Browse and edit every junior profile across the programme.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-coaches"]',
      path: '/coaches',
      title: 'Coaches',
      body: 'Manage coaches and view their analytics — sessions, juniors, and workload.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-evaluations"]',
      path: '/evaluations',
      title: 'Evaluations',
      body: 'Read across all monthly evaluations and band summaries.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-courses"]',
      path: '/courses',
      title: 'Course reference',
      body: 'The Karen course, its four tee sets, and scorecards — the reference data that drives scoring.',
      placement: 'right',
    },
    {
      target: '[data-testid="nav-messages"]',
      path: '/messages',
      title: 'Messages',
      body: "And reach coaches, committee, and members here. That's the tour — you can replay it any time.",
      placement: 'right',
    },
  ],
};
