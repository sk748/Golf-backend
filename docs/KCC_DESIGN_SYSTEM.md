# KCC Junior Golf — Frontend Design System
**Karen Country Club Junior Golf Academy**  
**Version**: 1.0 — January 2026

---

## 1. BRAND IDENTITY

### Logo
- File: `/public/kcc-logo.png`
- White shield with blue crest, "KAREN COUNTRY CLUB" banner
- Always displayed on dark backgrounds
- Minimum height: `h-10` (40px mobile), `h-12` (48px desktop), `h-16` (64px hero)

### Brand Voice
- **Tone**: Professional, aspirational, youth-focused
- **Language**: "Academy", "Junior Golfer", "Elite", "Development"
- **NO emoji** icons in the UI — use Lucide React icons exclusively

---

## 2. COLOR PALETTE

### Core Tokens (CSS Variables — HSL)

```css
--background:   214 100% 14%;    /* #012349 — Navy (all backgrounds) */
--foreground:   220 14% 96%;     /* #F4F4F6 — Silver (primary text) */
--primary:      204 100% 40%;    /* #0082CD — Azure (CTAs, links, active states) */
--accent:       45 97% 56%;      /* #FBBF24 — Gold (badges, highlights, ratings) */
--muted:        215 16% 47%;     /* #64748B — Slate (secondary text, labels) */
--destructive:  0 84% 60%;       /* Red (errors, danger) */
--border:       214 40% 22%;     /* Subtle borders */
```

### Tailwind Shorthand Classes
| Token | Class | Hex | Usage |
|-------|-------|-----|-------|
| Navy | `bg-navy` | `#012349` | Page backgrounds, card backgrounds |
| Azure | `text-azure`, `bg-azure` | `#0082CD` | Buttons, links, active nav items, data values |
| Silver | `text-silver` | `#F4F4F6` | Headings, primary body text |
| Gold | `text-gold` | `#FBBF24` | Star ratings, level badges, accent highlights |
| Slate | `text-slate` | `#64748B` | Secondary text, labels, timestamps |

### Semantic Colors
| Purpose | Example Class | When |
|---------|--------------|------|
| Success | `bg-emerald-500/15 text-emerald-400` | Verified, saved, approved |
| Error | `bg-red-500/15 text-red-400` | Errors, rejected, blocked |
| Warning | `bg-gold/15 text-gold` | COPPA alerts, pending states |
| Live | `bg-red-500/20 text-red-400` | Live tournament badge (pulsing) |
| Info | `bg-azure/15 text-azure` | Badges, labels, highlights |

### Alpha Layering Rules
- **Never use solid background colors on cards** — always use alpha transparency
- Card backgrounds: `rgba(1, 35, 73, 0.6)` or `rgba(255,255,255,0.04)`
- Borders: `border-white/5` (resting), `border-white/10` (inputs), `border-azure/20` (active)
- Hover borders: `hover:border-azure/40`

---

## 3. TYPOGRAPHY

### Font Stack
```css
font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;  /* Body */
font-family: 'JetBrains Mono', monospace;  /* Data, codes, KCC IDs */
```

**CDN Import** (already in `index.css`):
```
https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600;700&display=swap
```

### Type Scale
| Element | Class | Size | Weight | Color |
|---------|-------|------|--------|-------|
| Page Title | `text-2xl sm:text-3xl font-black` | 24–30px | 900 | `text-silver` |
| Section Heading | `text-xl font-black` | 20px | 900 | `text-silver` |
| Card Title | `text-lg font-bold` | 18px | 700 | `text-silver` |
| Body Text | `text-sm` | 14px | 400 | `text-silver` |
| Secondary Text | `text-sm text-slate` | 14px | 400 | `text-slate` |
| Label | `text-xs font-bold text-silver/80 tracking-wide` | 12px | 700 | Silver 80% |
| Overline | `text-[10px] font-bold tracking-widest uppercase text-azure` | 10px | 700 | `text-azure` |
| Micro | `text-[9px] text-slate` | 9px | 400 | `text-slate` |
| Data Value | `text-2xl font-black text-azure font-mono` | 24px | 900 | `text-azure` |
| Stat Number | `text-3xl font-black text-silver` | 30px | 900 | `text-silver` |

### Weight Usage
- `font-black` (900): Headlines, stat numbers, scores, handicap values
- `font-bold` (700): Section titles, button labels, emphasized text
- `font-semibold` (600): Nav items, secondary buttons
- `font-medium` (500): Body with emphasis
- Default (400): Body text, descriptions

---

## 4. SPACING & LAYOUT

### Page Structure
```
Sidebar (fixed, w-64, hidden on mobile) → Main Content (lg:ml-64)
  └─ Top Bar (sticky, backdrop-blur, border-b)
  └─ Content Area (p-3 sm:p-6, max-w varies by component)
```

### Content Max Widths
| Component Type | Class | Px |
|---------------|-------|-----|
| Forms (Scorecard, Eval, VPC) | `max-w-lg mx-auto` | 512px |
| Medium panels (Chat, Attendance) | `max-w-xl mx-auto` | 576px |
| Feed/Lists (Broadcasts, Feed) | `max-w-2xl` | 672px |
| Tables/Leaderboard | `max-w-4xl` | 896px |
| Admin Dashboard | `max-w-6xl` | 1152px |
| Dashboard Home | `max-w-5xl` | 1024px |

### Spacing Scale
| Gap | Use Case |
|-----|----------|
| `gap-1` | Hole score grids, tight button groups |
| `gap-2` | Pill selectors, tag groups |
| `gap-3` | Card lists, stacked items |
| `gap-4` | Form fields, stat card grids |
| `gap-6` | Major sections, grid columns |
| `gap-8` | Page-level section separators |

### Grid Patterns
```
Stats:     grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4
Dashboard: grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6
Form cols: grid grid-cols-2 gap-4
Hole grid: grid grid-cols-9 gap-1 sm:gap-2   (Front/Back 9)
Hole full: grid grid-cols-10 gap-1            (9 holes + total)
```

---

## 5. COMPONENT PATTERNS

### Glass Card (Primary Container)
```jsx
<div className="glass rounded-2xl p-6">
  {/* Content */}
</div>
```
```css
.glass {
  background: rgba(1, 35, 73, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.08);
}
```

### Glass Light Card (Secondary/Nested)
```jsx
<div className="glass-light rounded-2xl p-6">
  {/* Content */}
</div>
```
```css
.glass-light {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.06);
}
```

### Inner Card (Data Row / Nested Item)
```jsx
<div className="bg-navy border border-white/5 rounded-xl p-3">
```

### Stat Card
```jsx
<div className="glass-light rounded-2xl p-4 sm:p-5">
  <Icon size={20} className="text-azure mb-2" />
  <p className="text-xl sm:text-2xl font-black text-silver">{value}</p>
  <p className="text-xs text-slate mt-1">{label}</p>
</div>
```

### Form Input
```jsx
<input className="w-full bg-navy border border-white/10 rounded-xl px-4 py-3 text-silver outline-none focus:border-azure transition-colors" />
```

### Select Dropdown
```jsx
<select className="w-full bg-navy border border-white/10 rounded-xl px-4 py-3 text-silver outline-none focus:border-azure transition-colors">
```

### Textarea
```jsx
<textarea className="w-full h-32 bg-navy border border-white/10 rounded-xl p-4 text-silver outline-none focus:border-azure resize-none" />
```

---

## 6. BUTTONS

### Primary CTA
```jsx
<button className="bg-azure text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-azure/30 hover:brightness-110 active:scale-[0.98] transition-all">
```

### Large CTA (Hero/Submit)
```jsx
<button className="w-full bg-azure text-white py-4 rounded-xl font-bold shadow-lg shadow-azure/30 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
```

### Secondary/Glass Button
```jsx
<button className="glass text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-all">
```

### Ghost Button (Cancel/Back)
```jsx
<button className="py-3 rounded-xl border border-white/15 text-silver font-semibold hover:bg-white/5 transition-all">
```

### Danger Button
```jsx
<button className="bg-red-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:brightness-110 transition-all">
```

### Gold Accent Button
```jsx
<button className="bg-gold text-navy py-4 rounded-xl font-black text-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all">
```

### Pill Selector (Tab/Toggle)
```jsx
// Active
<button className="px-4 py-2 rounded-xl text-sm font-medium bg-azure text-white">
// Inactive
<button className="px-4 py-2 rounded-xl text-sm font-medium glass text-slate hover:text-silver">
```

### Icon Button
```jsx
<button className="p-2 text-slate hover:text-azure hover:bg-white/5 rounded-lg transition-colors">
  <Icon size={18} />
</button>
```

---

## 7. BADGES & STATUS INDICATORS

### Role Badge
```jsx
// ADMIN
<span className="text-[10px] font-bold tracking-widest px-2 py-1 rounded-lg bg-red-500/15 text-red-400">ADMIN</span>
// COACH
<span className="... bg-gold/15 text-gold">COACH</span>
// STUDENT
<span className="... bg-azure/15 text-azure">STUDENT</span>
// PARENT
<span className="... bg-emerald-500/15 text-emerald-400">PARENT</span>
```

### Status Badge
```jsx
// Verified
<span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400">Verified</span>
// Pending
<span className="... bg-red-500/15 text-red-400">Pending</span>
```

### Priority Badge
```jsx
<div className="inline-block bg-red-500/20 text-red-400 text-[10px] font-bold tracking-widest px-2 py-0.5 rounded">PRIORITY</div>
```

### Live Badge (Pulsing)
```jsx
<span className="flex items-center gap-1.5 bg-red-500/20 text-red-400 text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1 rounded-full animate-pulse">
  <span className="w-2 h-2 bg-red-500 rounded-full" /> LIVE
</span>
```

### Tournament Type
```jsx
// Open
<span className="text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded bg-azure/15 text-azure">Open</span>
// Elite
<span className="... bg-gold/15 text-gold">Elite</span>
```

### Hole Count Badge (Live Scoring)
```jsx
<span className="ml-1.5 text-[10px] bg-azure/30 px-1.5 py-0.5 rounded text-azure font-bold">13H</span>
```

---

## 8. NAVIGATION

### Sidebar Item
```jsx
// Active
<button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-azure/15 text-azure border border-azure/20">
  <Icon size={18} /> Label <ChevronRight size={14} className="ml-auto" />
</button>
// Inactive
<button className="... text-slate hover:text-silver hover:bg-white/5">
```

### User Avatar
```jsx
<div className="w-9 h-9 rounded-full bg-azure/20 flex items-center justify-center text-azure font-bold text-sm border border-azure/30">
  {name.charAt(0)}
</div>
```

### Roster Avatar (Smaller)
```jsx
<div className="w-9 h-9 rounded-full bg-azure/15 flex items-center justify-center text-azure font-bold text-sm border border-azure/20">
```

---

## 9. DATA DISPLAY

### Leaderboard Position Badges
```jsx
// 1st (Gold)
<span className="w-7 h-7 rounded-full bg-gold text-navy font-black text-sm inline-flex items-center justify-center">1</span>
// 2nd (Silver)
<span className="... bg-slate/50 text-white">2</span>
// 3rd (Bronze)
<span className="... bg-amber-700/50 text-amber-200">3</span>
// 4th+ (Plain)
<span className="text-slate">4</span>
```

### To-Par Formatting
```javascript
function formatToPar(val) {
  if (val === 0) return "E";
  return val > 0 ? `+${val}` : `${val}`;
}
// Colors: ≤0 → text-emerald-400, 1-3 → text-gold, >3 → text-red-400
```

### Hole Score Color Coding
```
Eagle or better (≤-2):  bg-amber-500 text-navy font-black
Birdie (-1):            bg-emerald-500/30 text-emerald-300 font-bold
Par (0):                text-silver
Bogey (+1):             text-gold
Double+ (≥+2):          text-red-400
```

### Star Rating Display
```jsx
<div className="text-gold text-xs">
  {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
</div>
```

### Chart Tooltip
```jsx
contentStyle={{
  backgroundColor: "#012349",
  border: "1px solid rgba(0,130,205,0.3)",
  borderRadius: "12px",
  color: "#F4F4F6"
}}
```

### Chart Gradient
```jsx
<defs>
  <linearGradient id="colorDiff" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%" stopColor="#0082CD" stopOpacity={0.3} />
    <stop offset="95%" stopColor="#0082CD" stopOpacity={0} />
  </linearGradient>
</defs>
```

---

## 10. ANIMATIONS

### CSS Keyframes (defined in index.css)
```css
@keyframes fadeInUp    { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeIn      { from { opacity:0 } to { opacity:1 } }
@keyframes slideInLeft { from { opacity:0; transform:translateX(-24px) } to { opacity:1; transform:translateX(0) } }
@keyframes slideInRight{ from { opacity:0; transform:translateX(24px) }  to { opacity:1; transform:translateX(0) } }
```

### Utility Classes
| Class | Duration | Use |
|-------|----------|-----|
| `animate-fade-in-up` | 0.5s | Page content, cards entering |
| `animate-fade-in` | 0.4s | Tab content switching |
| `animate-slide-left` | 0.6s | Hero text |
| `animate-slide-right` | 0.6s | Announcements panel |
| `animate-pulse` | Built-in | Live badges |
| `animate-spin` | Built-in | Loading spinners (Loader2 icon) |

### Stagger Pattern
```jsx
<div className="animate-fade-in-up stagger-1">First</div>   /* delay 0.1s */
<div className="animate-fade-in-up stagger-2">Second</div>  /* delay 0.2s */
<div className="animate-fade-in-up stagger-3">Third</div>   /* delay 0.3s */
<div className="animate-fade-in-up stagger-4">Fourth</div>  /* delay 0.4s */
```

### Interactive Transitions
```
Buttons:     active:scale-[0.98] transition-all
Cards:       hover:border-azure/40 transition-all
Nav items:   transition-all (on bg, color, border)
Inputs:      focus:border-azure transition-colors
Hover lift:  hover:-translate-y-1
```

---

## 11. RESPONSIVE BREAKPOINTS

### Strategy
- **Mobile-first**: Default styles target 390px
- `sm:` (640px): Slight spacing/size increases
- `md:` (768px): Table/card layout switches
- `lg:` (1024px): Sidebar visible, multi-column grids

### Key Responsive Patterns

**Sidebar**: Hidden by default, toggle via hamburger menu, visible `lg:translate-x-0`

**Roster Table ↔ Cards**:
```jsx
<div className="hidden md:block">  {/* Desktop table */}
<div className="md:hidden">        {/* Mobile card stack */}
```

**Text Scaling**:
```
text-3xl sm:text-5xl md:text-6xl   (hero headline)
text-xl sm:text-2xl                (page titles)
text-base sm:text-lg               (body large)
p-4 sm:p-6                         (card padding)
gap-3 sm:gap-4                     (grid gaps)
```

**Button Stacking**:
```jsx
<div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
```

---

## 12. ICONS

**Library**: Lucide React (imported per-component)

### Standard Icon Sizes
| Context | Size | Example |
|---------|------|---------|
| Navigation sidebar | 18 | `<Icon size={18} />` |
| Stat card icon | 20 | `<Icon size={20} />` |
| Section header | 20–24 | |
| Feature card | 28–32 | |
| Empty state | 40 | |
| Hero decorative | 48+ | |
| Inline with text | 12–16 | |

### Commonly Used Icons
```
LayoutDashboard, FileText, Map, MessageSquare, Trophy, Users, Star,
ClipboardList, Upload, Bell, LogOut, Menu, X, ChevronRight, ChevronDown,
ChevronUp, Shield, Zap, BarChart3, Search, TrendingDown, Award, Target,
Calendar, Flag, Clock, Plus, Send, Check, Loader2, ArrowLeft, Eye, EyeOff,
Lock, StopCircle, Play
```

---

## 13. SCROLLBAR

```css
::-webkit-scrollbar        { width: 6px }
::-webkit-scrollbar-track  { background: rgba(255,255,255,0.03) }
::-webkit-scrollbar-thumb  { background: rgba(0,130,205,0.3); border-radius: 3px }
::-webkit-scrollbar-thumb:hover { background: rgba(0,130,205,0.5) }
```

---

## 14. SELECTION

```css
selection:bg-azure/30   /* Applied to root container */
```

---

## 15. DATA-TESTID CONVENTION

Every interactive and data-display element gets a `data-testid`:
```
Pattern: {context}-{element-type}
Examples:
  data-testid="sign-in-btn"
  data-testid="auth-submit-btn"
  data-testid="nav-leaderboard"
  data-testid="course-select"
  data-testid="lb-row-0"
  data-testid="hole-input-7"
  data-testid="roster-card-2"
  data-testid="approval-{uuid}"
```

---

*This design system governs all existing components. Maintain consistency when adding new features.*
