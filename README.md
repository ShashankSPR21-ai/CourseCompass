# CourseCompass

## Run it (first time)
Requires **Node.js 20+** (https://nodejs.org).

```bash
cd project-folder
npm install        # creates the node_modules folder (NOT included in the zip)
npm run dev        # opens http://localhost:5173
```

* `.env.local` holds your Supabase URL + key (see `.env.example`). It is a hidden file – make sure it
  is copied along with the folder.
* Production build: `npm run build` (output in `dist/`).

## One-time Supabase setup
1. SQL Editor → run `supabase/001_coordinator_workflow.sql`, then `supabase/004_admin_approval_only.sql` (coordinator edits reach students only after the admin approves; 002 and 003 are not needed).
2. Email OTP through Resend → follow `RESEND_SETUP.md`.
3. Make yourself admin: `update public.profiles set role='admin', approval_status='approved' where email='you@example.com';`

See `CHANGES.md` for what was changed.
