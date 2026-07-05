# Supabase + Google sign-in setup (Phase E)

One-time setup for cross-device sync. All free tier.

## 1. Create the Supabase project
- Sign up at https://supabase.com → **New project** (any name, e.g. `floor-planner`). Pick a region near the UK. Save the database password somewhere.
- When it's ready, go to **Project Settings → API** and note:
  - **Project URL** (e.g. `https://abcd.supabase.co`) → this is `VITE_SUPABASE_URL`
  - **anon public** key → this is `VITE_SUPABASE_ANON_KEY` (safe to expose; data is protected by RLS below)

## 2. Create the table + Row-Level Security
Open **SQL Editor → New query**, paste this, and **Run**:

```sql
create table if not exists public.projects (
  id uuid primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "own rows - select" on public.projects
  for select using (auth.uid() = owner);
create policy "own rows - insert" on public.projects
  for insert with check (auth.uid() = owner);
create policy "own rows - update" on public.projects
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own rows - delete" on public.projects
  for delete using (auth.uid() = owner);
```

RLS means each signed-in user can only ever read/write their own rows.

## 3. Google OAuth client (Google Cloud Console)
- Go to https://console.cloud.google.com → create/select a project.
- **APIs & Services → OAuth consent screen**: choose **External**, fill the app name + your email, add yourself as a test user, save.
- **APIs & Services → Credentials → Create credentials → OAuth client ID**:
  - Application type: **Web application**
  - **Authorized redirect URIs**: add your Supabase callback (from Supabase → Authentication → Providers → Google, it shows the exact URL, of the form `https://<your-project>.supabase.co/auth/v1/callback`).
  - Create → copy the **Client ID** and **Client secret**.

## 4. Enable Google in Supabase
- Supabase → **Authentication → Providers → Google** → enable, paste the **Client ID** and **Client secret**, save.

## 5. Allow our app's URLs
- Supabase → **Authentication → URL Configuration**:
  - **Site URL**: `https://richbroad29.github.io/floor-planner/`
  - **Redirect URLs**: add both
    - `https://richbroad29.github.io/floor-planner/`
    - `http://localhost:5173/floor-planner/` (for local testing)

## 6. Give the keys to the app
- Add the two values as **GitHub repo secrets** (Settings → Secrets and variables → Actions → New repository secret):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- (Claude will also add them to a local `.env` for testing, and push to redeploy.)

Once done, the live site's **Sign in with Google** button works and plans sync across devices.
