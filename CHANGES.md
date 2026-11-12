# What changed

1. **Email OTP verification (Resend)** – `src/Auth.jsx`, `src/Auth.css`; setup guide in `RESEND_SETUP.md`.
   Login, roles, coordinator approval and password reset work exactly as before.
2. **College logo + cover on student cards** – new `src/CollegeVisual.jsx/.css`, used in College Finder
   (card + details popup), Saved Colleges, College Comparison and Smart Predictor.
   The images are the ones the coordinator uploads under *My College → Photos*.
3. **Coordinators can edit cutoffs** – new **🎯 Cutoff Marks** page in the coordinator portal; changes go to the
   admin for approval (shown in the admin "Changes" review with before/after). Needs `supabase/002_cutoffs_editing.sql`.
4. **Sidebar opens from the Menu button** on student, coordinator and admin portals, desktop and phone
   (`src/MenuButton.jsx`, `src/lib/useDrawer.js`). Esc, the ✕ button, the dark backdrop or choosing a page closes it.
5. **New "Aurora" look** – `src/ui-polish.css` (violet / indigo / sky / teal palette, gradient hero, glass top bars, lifted cards).

6. **Instant publishing** – `supabase/003_auto_publish.sql`: college details, courses and cutoffs edited by a coordinator
   now reach students immediately (history kept). Admin can toggle approval mode on/off in *Change Requests*.
   Students' College Finder / Cutoff Comparison have a Refresh button and reload when you return to the tab.
7. **Coordinator portal restyled** to match student & admin (hero with the college's cover + logo, cards, tables, buttons).
8. **Student "Explore courses" now lists college courses too** (before it only showed courses without a college, so
   anything a coordinator added never appeared there). It still appears inside College Finder as before.
9. **Coordinator portal rebuilt**: new `CoordinatorDashboard.css` (the old file assumed a fixed sidebar, which is why
   the page did not fit the screen). Full-width layout, sticky top bar, sidebar opens from the Menu button.
   If instant publishing fails, the coordinator now sees the exact reason.

7. **Courses linked to cutoffs** – run `supabase/005_course_cutoff_link.sql` once.
   Every new course automatically gets an empty cutoff row (rank, exam, category, year, round all blank).
   On *Cutoff Marks* it shows "Awaiting cutoff" with an **Add cutoff details** button (also reachable from
   🎯 Cutoff on the Courses page); saving fills that same row. Renaming a course renames its branch,
   deleting a course deletes its cutoffs, and students only see cutoffs that have been filled in.

8. **Forgot password fixed** – new `src/ResetPassword.jsx` ("Set a new password" screen after opening the email link).
   Also set Supabase → Authentication → URL Configuration: Site URL `http://localhost:5173` and add it to Redirect URLs.
