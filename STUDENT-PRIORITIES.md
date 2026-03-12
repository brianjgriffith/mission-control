# Student Section — Priorities & Plan

> Last updated: 2026-03-07
> Generated from full codebase audit of the student tracking module.

---

## Phase 1: Bug Fixes

### 1.1 Remove orphaned `churn/route 2.ts`
- **File:** `src/app/api/students/churn/route 2.ts`
- **Problem:** File has a space in the name so Next.js never serves it. It contains a more correct implementation than the active `route.ts` (status reversion on delete, transaction-wrapped POST, additional filter params).
- **Fix:** Merge the improvements from `route 2.ts` into `route.ts`, then delete `route 2.ts`. Update the UI's churn delete call if the interface changes (query param → JSON body).

### 1.2 Churn delete does not revert student status
- **File:** `src/app/api/students/churn/route.ts` (DELETE handler, line ~126)
- **Problem:** Deleting a churn event removes the record but leaves the student marked as `cancelled`/`paused`/`downgraded` with no corresponding event. This creates orphaned statuses.
- **Fix:** On delete, look up the event's `event_type`. If it was a cancel/pause/downgrade, revert the student's status to `active`. The orphaned `route 2.ts` has a working implementation of this.

### 1.3 Stats API counts restarts as churn
- **File:** `src/app/api/students/stats/route.ts` (line ~36)
- **Problem:** `monthly_churn_count` includes ALL churn event types including `restart`, inflating the count and rate. The frontend works around this by filtering client-side, but the API returns incorrect numbers.
- **Fix:** Add `AND event_type != 'restart'` to the churn count query. Also exclude restarts from `monthly_churn_revenue`.

### 1.4 Attendance checklist double-fetch
- **File:** `src/components/views/students.tsx` (AttendanceChecklist, lines ~3983–4133)
- **Problem:** Component fetches `/api/students/attendance?session_id=X` (which already returns merged records for all elite students) AND separately fetches `/api/students` to build its own list. The two can diverge.
- **Fix:** Use only the attendance API response as the source of truth. Remove the redundant `/api/students` fetch.

### 1.5 MRR history uses current revenue for all months
- **File:** `src/app/api/students/mrr-history/route.ts` (line ~88)
- **Problem:** When reconstructing historical MRR, each student's current `monthly_revenue` value is used for every month they were active. If revenue was changed via PATCH, all past months are retroactively recalculated with the new amount.
- **Fix (short-term):** Add a note/caveat in the UI that MRR history reflects current rates. **(Full fix deferred to Phase 3, item 3.5.)**

---

## Phase 2: Gaps

### 2.1 Surface student `notes` in read-only views
- **File:** `src/components/views/students.tsx` (Roster tab)
- **Problem:** The `notes` field is stored and editable via the dialog but never shown in the roster table or anywhere else.
- **Fix:** Add a notes icon/tooltip on the roster row when `notes` is non-empty, or add an expandable row detail.

### 2.2 Surface churn event `notes` in events table
- **File:** `src/components/views/students.tsx` (Churn tab, events table)
- **Problem:** `notes` is collected in the Log Churn dialog but the events table only shows `reason`, not `notes`.
- **Fix:** Add a `Notes` column or make rows expandable to reveal notes.

### 2.3 Attendance notes collection
- **Files:** `src/components/views/students.tsx` (AttendanceChecklist), `src/app/api/students/attendance/route.ts`
- **Problem:** The API accepts a `notes` field per attendance record but the UI never collects or displays it.
- **Fix:** Add an optional inline text input or expandable note field per student in the attendance checklist.

### 2.4 Add churn event editing (PATCH endpoint)
- **File:** New route at `src/app/api/students/churn/[id]/route.ts`
- **Problem:** Churn events can only be created or deleted. Correcting a wrong reason or revenue impact requires delete + re-create.
- **Fix:** Add `PATCH /api/students/churn/[id]` supporting `event_type`, `event_date`, `reason`, `monthly_revenue_impact`, `coach`, `notes`. Add an edit button to churn event rows in the UI.

### 2.5 Expose session edit/delete in UI
- **Files:** `src/components/views/students.tsx` (Attendance tab)
- **Problem:** `PATCH` and `DELETE` endpoints exist at `/api/students/sessions/[id]` but the Attendance tab has no edit or delete buttons on session cards.
- **Fix:** Add edit (pencil) and delete (trash) icons to session card headers. Edit opens a dialog pre-filled with session data. Delete uses two-click confirmation pattern (matching roster delete UX).

### 2.6 Dynamic coach colors
- **File:** `src/components/views/students.tsx` (COACH_COLORS map, line ~181)
- **Problem:** Hardcoded to 6 coaches. New coaches added via the Capacity tab get fallback grey.
- **Fix:** Generate colors from a palette based on `coach_capacity` data (already fetched). Fall back to a hash-based color for any unregistered coach names.

### 2.7 Small cohort visibility
- **File:** `src/components/views/students.tsx` (cohort retention, line ~3196)
- **Problem:** Cohorts with fewer than 3 students are silently dropped from retention curves.
- **Fix:** Either lower the threshold to 1, or add a note in the UI explaining why some months are missing.

---

## Phase 3: Opportunities

### 3.1 Student detail drawer
- **Problem:** No way to see a student's full history in one place — churn events, sessions attended, revenue changes, notes, tenure.
- **Plan:** Add a slide-out drawer triggered by clicking a student name in the roster. Sections: Profile summary, Timeline (churn events + sessions), Attendance history, Revenue info. Data sourced from existing APIs.

### 3.2 Per-coach churn rate sparklines
- **Problem:** The Coach Performance Scorecard shows a static 3-month churn rate number. No trend visibility.
- **Plan:** Add a small sparkline (last 6–12 months) next to each coach's churn rate in the scorecard table. Data available from existing churn events.

### 3.3 Student data CSV export
- **Problem:** No way to export the roster or churn data for external analysis or reporting.
- **Plan:** Add export buttons (roster CSV, churn events CSV) to the Roster and Churn tabs. The `/api/export` route already exists in the codebase and can be extended.

### 3.4 Program switching as a first-class event
- **Problem:** "Downgrade" can mean Elite → Accelerator or a rate reduction within the same program. No dedicated event type distinguishes these. The program field is not auto-updated on downgrade.
- **Plan:** Add a `program_change` churn event type. When logged, auto-update the student's `program` field. Update the churn analysis UI to show program changes separately.

### 3.5 Revenue change history
- **Problem:** Patching `monthly_revenue` silently overwrites the stored value. Historical MRR reconstruction uses the current value for all months, producing inaccurate history.
- **Plan:** Create a `student_revenue_changes` table (`student_id`, `old_revenue`, `new_revenue`, `effective_date`, `created_at`). On PATCH to `monthly_revenue`, auto-insert a change record. Update MRR history endpoint to use change records for accurate month-by-month calculation.

### 3.6 Coach filtering on Coaches tab
- **Problem:** The Coaches tab loads all data with no way to scope to a single coach.
- **Plan:** Add a coach selector dropdown that filters the Performance Scorecard, Renewals, and churn breakdown to a single coach.

### 3.7 Attendance notes in session view
- **Problem:** The attendance checklist is toggle-only. The API supports per-student notes but the UI doesn't use them.
- **Plan:** Add a small expandable text input per student row in the checklist. Save on blur via the existing attendance upsert API.

---

## Execution Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P1 | 1.1 Remove orphaned route file | 15 min | Cleanup |
| P1 | 1.2 Fix churn delete status reversion | 30 min | Data integrity |
| P1 | 1.3 Fix stats API restart counting | 15 min | Correct metrics |
| P1 | 1.4 Fix attendance double-fetch | 30 min | Performance |
| P2 | 1.5 MRR history caveat (short-term) | 15 min | Transparency |
| P2 | 2.1 Surface student notes | 30 min | Usability |
| P2 | 2.2 Surface churn event notes | 20 min | Usability |
| P2 | 2.5 Session edit/delete in UI | 1 hr | Feature completeness |
| P2 | 2.6 Dynamic coach colors | 45 min | Scalability |
| P3 | 2.3 Attendance notes UI | 45 min | Feature completeness |
| P3 | 2.4 Churn event PATCH endpoint | 1 hr | Feature completeness |
| P3 | 2.7 Small cohort visibility | 15 min | UX clarity |
| P3 | 3.1 Student detail drawer | 3-4 hrs | High value |
| P3 | 3.2 Coach churn sparklines | 1-2 hrs | Trend visibility |
| P3 | 3.3 CSV export | 1-2 hrs | Reporting |
| P4 | 3.4 Program change event type | 2-3 hrs | Data model |
| P4 | 3.5 Revenue change history | 3-4 hrs | MRR accuracy |
| P4 | 3.6 Coach filtering on Coaches tab | 1 hr | Usability |
| P4 | 3.7 Attendance notes in session | 45 min | Feature completeness |
