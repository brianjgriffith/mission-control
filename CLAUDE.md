# Mission Control

## Project Overview

Internal business intelligence dashboard for Think Media. Currently runs on Next.js 16 + SQLite (local). Being migrated to Supabase + Vercel (cloud) per the PRD at `docs/PRD-mission-control-v2.md`.

## Tech Stack

- **Framework:** Next.js 16 (Turbopack)
- **Database (v1):** SQLite via better-sqlite3
- **Database (v2):** Supabase (PostgreSQL)
- **UI:** Tailwind CSS v4, shadcn/ui, Recharts
- **State:** Zustand
- **Sync Engine:** n8n

## Dev Server

```bash
npm run dev  # runs on port 3000
```

## Key Directories

- `src/components/views/` — main dashboard views (dashboard, sales, students, marketing, roadmap, etc.)
- `src/lib/` — types, store, db, utils
- `scripts/` — data import/seed scripts
- `docs/` — PRD and priority docs
- `supabase/migrations/` — SQL migration files for Supabase

---

## Supabase Migration Tracking

**IMPORTANT: Read this section before and after any work that touches the database schema.**

Migration files live in `supabase/migrations/` and must be manually applied by Brian in the Supabase SQL Editor. This tracking system ensures nothing gets missed.

### Rules for Claude

1. **When you create a new migration file**, you MUST also add an entry to the tracker below.
2. **Migration file naming:** `NNN_description.sql` (e.g., `001_initial_schema.sql`)
3. **Always check the tracker** at the start of any database-related work to understand the current state.
4. **Never mark a migration as applied** — only Brian does that after running it in Supabase.
5. **If a migration depends on another**, note it in the "Depends On" column.

### Migration Tracker

| # | File | Description | Status | Depends On | Date Created |
|---|------|-------------|--------|------------|--------------|
| | | | | | |

**Status values:**
- `PENDING` — migration file created, waiting for Brian to apply in Supabase
- `APPLIED` — Brian has confirmed it's been run in Supabase
- `SUPERSEDED` — replaced by a newer migration (do not apply)

### How to use this tracker

**Brian:** After running a migration in the Supabase SQL Editor, update its status from `PENDING` to `APPLIED`.

**Claude:** When creating any new table, column, index, RLS policy, or function in Supabase, write a migration file in `supabase/migrations/` and add a row to the tracker above with status `PENDING`. Alert Brian that there are pending migrations.

---

## Theme

Obsidian-inspired high-contrast dark theme. Colors defined in `src/app/globals.css`.

## Current Features Carrying Forward to v2

- Sales dashboard (will auto-populate from HubSpot/SamCart)
- Students dashboard (will auto-populate from enrollment detection)
- Marketing — Think Media funnels (rebuilt with HubSpot segment auto-discovery)

## Deprecated (NOT migrating to v2)

- Marketing — Jake Berman funnel machine (may rebuild later with GHL integration)
- Projects tracker (may recreate later)
