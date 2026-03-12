# Sales Tab — Priorities & Plan

Last updated: 2026-03-07

---

## Phase 1: Critical Data Integrity Bugs

These can silently corrupt or misrepresent data. Fix first.

- [ ] **1.1 Inline grid edit destroys sub-amounts**
  Editing a cell in the main grid zeros out `new_amount`, `recurring_amount`, and `refund_amount` because `handleCellSave` only captures total and deal count. Fix: either pass through existing sub-amounts when only total/deals are edited, or expand the inline editor to show all fields.

- [ ] **1.2 Wrong product on grid cell save**
  `handleCellSave` uses `filterProduct || data?.products?.[0] || "General"` as the product key. With multiple products and no filter, edits save against the wrong product. Fix: attach the actual product to the cell's edit state, or require a product filter before allowing inline edits.

- [ ] **1.3 Server-side amount validation**
  No API-level check that `amount == new_amount + recurring_amount - refund_amount`. If someone sends a manual POST with mismatched values, the data is silently wrong. Fix: add validation in the POST handler, or auto-compute `amount` server-side from the three sub-fields.

---

## Phase 2: Display & Calculation Bugs

Wrong numbers or misleading visuals shown to users.

- [ ] **2.1 Revenue Split KPI bar includes refunds in denominator**
  Main view computes bar widths as `totalX / (totalNew + totalRecurring + totalRefunds)`, inflating percentages. The RepProfile view does this correctly using `(totalNew + totalRecurring)` as denominator. Fix: match the RepProfile logic.

- [ ] **2.2 Negative totals shown in green**
  "Total Sales" (main view) and "Total Revenue" (RepProfile) are always `text-emerald-400` even when negative. Fix: conditionally apply `text-red-400` when value < 0.

- [ ] **2.3 MoM growth shows "0% up" with one month of data**
  When there's only one month, `momGrowth` defaults to 0 and shows an up arrow. Fix: show "---" or "N/A" when fewer than 2 months exist.

- [ ] **2.4 YoY chart renders 12 months of zeros with sparse data**
  All 12 months render even when only 1-2 months have data, creating misleading flat lines at zero. Fix: only render months that have data in at least one year, or add a minimum-data guard.

- [ ] **2.5 Highlights fire trivially for single-rep teams**
  Product leader highlights say "X had the highest Elite revenue" when there's only one rep. Fix: gate product-leader highlights behind `reps.length > 1`.

- [ ] **2.6 "star" icon falls through to faint trophy**
  The highlights icon mapper doesn't handle "star" — it falls to the default case rendering a faint trophy. Fix: add a Star icon case or change the icon type to "trophy".

---

## Phase 3: Missing Features & Gaps

Functionality that would meaningfully improve the tool.

- [ ] **3.1 Delete functionality**
  No way to remove a bad entry. Records can only be overwritten to zero. Add a DELETE button on individual records (the API already supports `DELETE /api/students/churn?id=` pattern — add similar for sales).

- [ ] **3.2 Surface the notes field**
  The `notes` column exists in the schema and API but has no input anywhere in the UI. Add a notes field to the add-entry form and the inline/profile editors.

- [ ] **3.3 CSV/data export**
  Add an export button that downloads filtered sales data as CSV. Essential for sharing with stakeholders outside the app.

- [ ] **3.4 Refunds line in main "New vs Recurring" chart**
  The RepProfile view shows refunds as a negative line. The main view's revenue-type chart should match. Add a Refunds line rendered below zero.

- [ ] **3.5 Monthly Report respect active filters**
  Report mode ignores `filterRep` and `filterProduct`. Either apply the active filters or show a clear indicator that the report is team-wide.

- [ ] **3.6 YoY mode + year filter conflict**
  Filtering to a single year then toggling YoY only shows that year. Either disable the year filter when YoY is active, show a warning, or automatically include prior years for comparison.

- [ ] **3.7 Quota / target tracking**
  Add a concept of monthly revenue goals per rep. Show progress-to-target in KPI cards and on charts as reference lines.

- [ ] **3.8 Deal-level data**
  Currently everything is monthly aggregates. Consider a `deals` table with individual deal records (company, amount, date, product, rep) for granular analysis.

---

## Phase 4: UX Polish

Friction points and rough edges.

- [ ] **4.1 Clear editing state on filter change**
  `editingCell` persists when rep/product/time filters change. Reset it in a `useEffect` watching filter dependencies.

- [ ] **4.2 Simplify add-entry rep/product inputs**
  Currently shows both a select and a text input binding to the same state. Use a single combobox or a select with an "Add new..." option.

- [ ] **4.3 Form validation feedback**
  Clicking "Save" with missing fields silently does nothing. Add inline error messages or field highlighting.

- [ ] **4.4 Memoize `repTotals`**
  Currently computed inline in JSX on every render. Wrap in `useMemo` keyed on `filtered` and `visibleReps`.

- [ ] **4.5 Mobile responsive breakpoints**
  KPI grids are fixed `grid-cols-3` / `grid-cols-4`. Add responsive classes like `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

- [ ] **4.6 Add keyboard submit on forms**
  No Enter-to-submit on the add-entry form. Add `onKeyDown` handler.

- [ ] **4.7 Auto-compute edge case**
  If user zeros out all three sub-amount fields, the total is not reset. Fix the condition to also clear total when all sub-fields are 0.

- [ ] **4.8 Report rep cards responsive grid**
  Rep cards in the monthly report are fixed `grid-cols-2`. Add responsive breakpoints for mobile and 5+ rep scenarios.

---

## Phase 5: Opportunities

Longer-term enhancements for when the foundation is solid.

- [ ] **5.1 Rep comparison mode**
  Side-by-side metrics for two selected reps with delta highlights.

- [ ] **5.2 Deal velocity / efficiency metrics**
  Revenue per meeting trend, deals per meeting trend over time.

- [ ] **5.3 Refund analysis section**
  Dedicated view showing refund rates by product, by rep, and over time. Flag reps/products with above-average refund rates.

- [ ] **5.4 Seasonality overlay**
  Chart that overlays same-month performance across multiple years for pattern recognition.

- [ ] **5.5 Separate `rep_meetings` table**
  Move booked calls from the `rep_sales` product rows to a dedicated `rep_meetings` table keyed on `(rep_name, month)`. Eliminates the `Math.max` de-duplication hack and prevents data loss when product rows are modified.

- [ ] **5.6 Pipeline / forecast view**
  Project future revenue based on current close rates, meeting volume trends, and historical seasonality.

- [ ] **5.7 Rep management**
  Dedicated screen to rename reps (cascading to all historical data), archive inactive reps, and set per-rep metadata (start date, team, role).

---

## Schema Note

The base `CREATE TABLE rep_sales` in `db.ts` (lines 361-374) is out of sync with the actual table. The columns `new_amount`, `recurring_amount`, `booked_calls`, and `refund_amount` are added via ALTER TABLE migrations (lines 851-863). If the table is ever dropped and recreated without running migrations, those columns will be missing. Consider updating the base CREATE statement to include all columns.
