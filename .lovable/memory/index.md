# Memory: index.md
Updated: now

Design system, branding, architecture constraints for Comply by IOBT — Compliance & Checklist App

Design: Goudy Bookletter 1911 (display/serif) + Inter (body/sans), monochrome/greyscale palette (black primary, light grey bg), greens/reds for correct/incorrect only. Keep colours simple and neutral.
Branding: App is "OSMO" by "IOBT". IOBT logos at /images/iobt-logo.svg (wordmark) and /images/iobt-icon.svg (square icon/favicon). Company-specific logos still display via CompanyLogo component; IOBT logos used as fallbacks and on login page.
Database: companies, locations, profiles, user_roles, checklist_submissions, lesson_content (checklist block definitions), custom_roles
Auth: email/password with role-based routing (admin→/admin/dashboard, manager→/manager/dashboard, supervisor→/supervisor/dashboard, staff→/home)
Roles: admin > manager > supervisor > staff. Supervisors scoped by location_id + custom_role (department). is_supervisor_of() security definer function checks location + department overlap.
RLS: has_role(), get_user_company_id(), is_supervisor_of() security definer functions
White-label: company branding stored in companies table (primary_color, secondary_color, accent_color)
Pivot: Removed all learning features (paths, courses, lessons, XP, streaks, badges, rewards, leaderboard, sessions, quizzes). App is now compliance/checklist-focused.
Staff home: /home (AuditorHome.tsx) — shows checklist submissions grouped by status
Gamification: Fully removed (no XP, streaks, badges, rewards, leaderboard)
