"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  type FinancialEntry,
  type EntryType,
  type IncomeCategory,
  type ExpenseCategory,
  type RevenueSnapshot,
  type BudgetTarget,
  type Project,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  BarChart3,
  ListFilter,
  LayoutGrid,
  Pencil,
  GitCompareArrows,
  Target,
} from "lucide-react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Summary {
  total_income: number;
  total_expense: number;
  net: number;
}

type FinancialTab = "overview" | "revenue" | "entries";

const TABS: { id: FinancialTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "revenue", label: "Revenue", icon: BarChart3 },
  { id: "entries", label: "Entries", icon: ListFilter },
];

// Distinct colors for product lines in charts
const PRODUCT_COLORS = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ef4444", // red
  "#a855f7", // purple
  "#14b8a6", // teal
  "#f97316", // orange
];

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function FinancialsView() {
  const projects = useStore((s) => s.projects);
  const [activeTab, setActiveTab] = useState<FinancialTab>("overview");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Financials</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === "overview" && "Monthly overview"}
            {activeTab === "revenue" && "Product revenue trends"}
            {activeTab === "entries" && "All transactions"}
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-1 rounded-lg border border-border/50 bg-card/20 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <OverviewTab projects={projects} />}
        {activeTab === "revenue" && <RevenueTab />}
        {activeTab === "entries" && <EntriesTab projects={projects} />}
      </div>
    </div>
  );
}

// ===========================================================================
// Overview Tab
// ===========================================================================

function OverviewTab({ projects }: { projects: Project[] }) {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total_income: 0,
    total_expense: 0,
    net: 0,
  });
  const [budget, setBudget] = useState<BudgetTarget | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetIncome, setBudgetIncome] = useState("");
  const [budgetExpense, setBudgetExpense] = useState("");

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/financials?month=${currentMonth}`);
      if (!res.ok) return;
      const json = await res.json();
      setEntries(
        (json.entries ?? []).map((e: Record<string, unknown>) => ({
          ...e,
          recurring: Boolean(e.recurring),
        }))
      );
      setSummary(
        json.summary ?? { total_income: 0, total_expense: 0, net: 0 }
      );
    } catch (err) {
      console.error("[OverviewTab] fetch:", err);
    }
  }, [currentMonth]);

  const fetchBudget = useCallback(async () => {
    try {
      const res = await fetch(`/api/financials/budget?month=${currentMonth}`);
      if (!res.ok) return;
      const json = await res.json();
      setBudget(json.target ?? null);
    } catch (err) {
      console.error("[OverviewTab] budget fetch:", err);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchEntries();
    fetchBudget();
  }, [fetchEntries, fetchBudget]);

  const handleSaveBudget = async () => {
    const ti = parseFloat(budgetIncome);
    const te = parseFloat(budgetExpense);
    await fetch("/api/financials/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: currentMonth,
        target_income: isNaN(ti) ? 0 : ti,
        target_expense: isNaN(te) ? 0 : te,
      }),
    });
    setEditingBudget(false);
    fetchBudget();
  };

  const startEditBudget = () => {
    setBudgetIncome(budget?.target_income?.toString() ?? "");
    setBudgetExpense(budget?.target_expense?.toString() ?? "");
    setEditingBudget(true);
  };

  // Project lookup
  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  // Per-project breakdown
  const projectBreakdown = new Map<
    string,
    { income: number; expense: number }
  >();
  for (const entry of entries) {
    const key = entry.project_id || "__none__";
    if (!projectBreakdown.has(key))
      projectBreakdown.set(key, { income: 0, expense: 0 });
    const b = projectBreakdown.get(key)!;
    if (entry.entry_type === "income") b.income += entry.amount;
    else b.expense += entry.amount;
  }

  const maxProjectAmount = Math.max(
    1,
    ...Array.from(projectBreakdown.values()).map((b) =>
      Math.max(b.income, b.expense)
    )
  );

  // Recurring entries
  const recurringEntries = entries.filter((e) => e.recurring);
  const recurringIncome = recurringEntries
    .filter((e) => e.entry_type === "income")
    .reduce((sum, e) => sum + e.amount, 0);
  const recurringExpense = recurringEntries
    .filter((e) => e.entry_type === "expense")
    .reduce((sum, e) => sum + e.amount, 0);

  const incomePct = budget && budget.target_income > 0
    ? Math.min((summary.total_income / budget.target_income) * 100, 100)
    : null;
  const expensePct = budget && budget.target_expense > 0
    ? Math.min((summary.total_expense / budget.target_expense) * 100, 100)
    : null;
  const netTarget = budget ? budget.target_income - budget.target_expense : null;

  return (
    <>
      {/* Month header + budget toggle */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {formatMonth(currentMonth)}
        </h2>
        {!editingBudget && (
          <button
            onClick={startEditBudget}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Target className="h-3 w-3" />
            {budget ? "Edit targets" : "Set budget"}
          </button>
        )}
      </div>

      {/* Inline budget editor */}
      {editingBudget && (
        <div className="mb-4 flex items-end gap-3 rounded-lg border border-border bg-card/40 p-3">
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Income Target</label>
            <Input
              type="number"
              min="0"
              step="100"
              value={budgetIncome}
              onChange={(e) => setBudgetIncome(e.target.value)}
              placeholder="0"
              className="h-8 w-32 text-xs"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Expense Target</label>
            <Input
              type="number"
              min="0"
              step="100"
              value={budgetExpense}
              onChange={(e) => setBudgetExpense(e.target.value)}
              placeholder="0"
              className="h-8 w-32 text-xs"
            />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={handleSaveBudget}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setEditingBudget(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Income</span>
          </div>
          {budget && budget.target_income > 0 ? (
            <>
              <p className="mt-1 text-xl font-semibold text-emerald-400">
                {fmtMoney(summary.total_income)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  of {fmtMoney(budget.target_income)}
                </span>
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${incomePct}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                {incomePct!.toFixed(0)}% of target
              </p>
            </>
          ) : (
            <p className="mt-1 text-xl font-semibold text-emerald-400">
              {fmtMoney(summary.total_income)}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs text-muted-foreground">Expenses</span>
          </div>
          {budget && budget.target_expense > 0 ? (
            <>
              <p className="mt-1 text-xl font-semibold text-red-400">
                {fmtMoney(summary.total_expense)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  of {fmtMoney(budget.target_expense)}
                </span>
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    expensePct! > 90 ? "bg-red-500" : expensePct! > 70 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${expensePct}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                {expensePct!.toFixed(0)}% of budget
              </p>
            </>
          ) : (
            <p className="mt-1 text-xl font-semibold text-red-400">
              {fmtMoney(summary.total_expense)}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Net</span>
          </div>
          <p
            className={cn(
              "mt-1 text-xl font-semibold",
              summary.net >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {fmtMoney(summary.net)}
          </p>
          {netTarget !== null && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50">
              Target: {fmtMoney(netTarget)}
            </p>
          )}
        </div>
      </div>

      {/* Recurring Commitments */}
      {recurringEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">
            Recurring Commitments
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-card/30 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">
                Monthly Income
              </span>
              <p className="text-sm font-semibold text-emerald-400">
                {fmtMoney(recurringIncome)}
              </p>
            </div>
            <div className="rounded-md bg-card/30 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">
                Monthly Expenses
              </span>
              <p className="text-sm font-semibold text-red-400">
                {fmtMoney(recurringExpense)}
              </p>
            </div>
            <div className="rounded-md bg-card/30 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">
                Net Recurring
              </span>
              <p
                className={cn(
                  "text-sm font-semibold",
                  recurringIncome - recurringExpense >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                )}
              >
                {fmtMoney(recurringIncome - recurringExpense)}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            {recurringEntries.map((entry) => {
              const isIncome = entry.entry_type === "income";
              const proj = entry.project_id
                ? projectMap[entry.project_id]
                : null;
              const allCats = {
                ...INCOME_CATEGORIES,
                ...EXPENSE_CATEGORIES,
              } as Record<string, string>;
              const catLabel = entry.category
                ? allCats[entry.category] || entry.category
                : "";

              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-md bg-card/30 px-3 py-2"
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isIncome ? "text-emerald-400" : "text-red-400"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium">
                      {entry.description || catLabel || entry.entry_type}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                      {catLabel && <span>{catLabel}</span>}
                      {proj && (
                        <span style={{ color: proj.color }}>{proj.name}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-sm font-medium",
                      isIncome ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {isIncome ? "+" : "-"}
                    {fmtMoney(entry.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Project Breakdown */}
      {projectBreakdown.size > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">By Project</h2>
          <div className="space-y-2">
            {Array.from(projectBreakdown.entries()).map(([projectId, b]) => {
              const proj =
                projectId !== "__none__" ? projectMap[projectId] : null;
              const net = b.income - b.expense;
              return (
                <div
                  key={projectId}
                  className="rounded-md bg-card/30 px-3 py-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {proj ? (
                        <>
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: proj.color }}
                          />
                          <span className="text-xs font-medium">
                            {proj.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        net >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {fmtMoney(net)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500/40"
                      style={{
                        width: `${(b.income / maxProjectAmount) * 100}%`,
                        minWidth: b.income > 0 ? "4px" : 0,
                      }}
                    />
                    <div
                      className="h-1.5 rounded-full bg-red-500/40"
                      style={{
                        width: `${(b.expense / maxProjectAmount) * 100}%`,
                        minWidth: b.expense > 0 ? "4px" : 0,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground/50">
                    <span>{fmtMoney(b.income)} in</span>
                    <span>{fmtMoney(b.expense)} out</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Revenue Tab
// ===========================================================================

interface RevenueData {
  snapshots: RevenueSnapshot[];
  products: string[];
  summary: {
    grand_total: number;
    product_totals: Record<
      string,
      { total: number; count: number; best: number; bestMonth: string }
    >;
  };
}

type TimeFrame = "all" | "ytd" | "custom" | string; // string for specific year like "2024"

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Distinct year-over-year colors (darker → more recent)
const YEAR_COLORS: Record<string, string> = {
  "2022": "#94a3b8",
  "2023": "#a855f7",
  "2024": "#3b82f6",
  "2025": "#22c55e",
  "2026": "#f59e0b",
  "2027": "#ef4444",
};

function RevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [yoyMode, setYoyMode] = useState(false);
  const [filterProduct, setFilterProduct] = useState("");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchRevenue = useCallback(async () => {
    try {
      const res = await fetch("/api/financials/revenue");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[RevenueTab] fetch:", err);
    }
  }, []);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  // All available years from the data
  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set<string>();
    for (const s of data.snapshots) years.add(s.month.slice(0, 4));
    return Array.from(years).sort();
  }, [data]);

  // Filtered snapshots based on product + time frame
  const filtered = useMemo(() => {
    if (!data) return [];
    let snapshots = data.snapshots;

    // Product filter
    if (filterProduct) {
      snapshots = snapshots.filter((s) => s.product_name === filterProduct);
    }

    // Time frame filter
    const currentYear = new Date().getFullYear().toString();
    if (timeFrame === "ytd") {
      snapshots = snapshots.filter((s) => s.month.startsWith(currentYear));
    } else if (timeFrame === "custom") {
      if (customStart) snapshots = snapshots.filter((s) => s.month >= customStart);
      if (customEnd) snapshots = snapshots.filter((s) => s.month <= customEnd);
    } else if (timeFrame !== "all") {
      // Specific year
      snapshots = snapshots.filter((s) => s.month.startsWith(timeFrame));
    }

    return snapshots;
  }, [data, filterProduct, timeFrame, customStart, customEnd]);

  // Products visible in the filtered set
  const visibleProducts = useMemo(() => {
    const set = new Set<string>();
    for (const s of filtered) set.add(s.product_name);
    return Array.from(set).sort();
  }, [filtered]);

  // Standard chart data (month on x-axis, one key per product)
  const chartData = useMemo(() => {
    const monthMap: Record<string, Record<string, number>> = {};
    for (const s of filtered) {
      if (!monthMap[s.month]) monthMap[s.month] = {};
      monthMap[s.month][s.product_name] = s.amount;
    }
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, products]) => ({
        month,
        label: formatMonth(month),
        ...products,
      }));
  }, [filtered]);

  // Year-over-year chart data (Jan-Dec on x-axis, one line per year)
  const yoyChartData = useMemo(() => {
    if (!yoyMode) return [];
    // Sum all products per month, then group by month-of-year
    const yearMonthTotals: Record<string, Record<string, number>> = {};
    for (const s of filtered) {
      const year = s.month.slice(0, 4);
      const monthIdx = s.month.slice(5, 7); // "01" - "12"
      if (!yearMonthTotals[monthIdx]) yearMonthTotals[monthIdx] = {};
      yearMonthTotals[monthIdx][year] =
        (yearMonthTotals[monthIdx][year] ?? 0) + s.amount;
    }
    return Array.from({ length: 12 }, (_, i) => {
      const key = String(i + 1).padStart(2, "0");
      return {
        month: key,
        label: MONTH_LABELS[i],
        ...(yearMonthTotals[key] ?? {}),
      };
    });
  }, [filtered, yoyMode]);

  const yoyYears = useMemo(() => {
    const years = new Set<string>();
    for (const s of filtered) years.add(s.month.slice(0, 4));
    return Array.from(years).sort();
  }, [filtered]);

  // Build grid data: rows = months (newest first), cols = visible products
  const gridData = useMemo(() => {
    const months = new Set<string>();
    const grid: Record<string, Record<string, RevenueSnapshot | null>> = {};
    for (const s of filtered) {
      months.add(s.month);
      if (!grid[s.month]) grid[s.month] = {};
      grid[s.month][s.product_name] = s;
    }
    const sortedMonths = Array.from(months).sort().reverse();
    for (const m of sortedMonths) {
      if (!grid[m]) grid[m] = {};
      for (const p of visibleProducts) {
        if (!grid[m][p]) grid[m][p] = null;
      }
    }
    return { months: sortedMonths, grid };
  }, [filtered, visibleProducts]);

  // Compute summary stats from filtered data
  const stats = useMemo(() => {
    const empty = {
      total: 0, avg: 0, bestMonth: "", bestAmount: 0,
      momGrowth: 0, momFrom: "", momTo: "",
      avgMomGrowth: 0, momCount: 0,
    };
    if (filtered.length === 0) return empty;

    const total = filtered.reduce((sum, s) => sum + s.amount, 0);

    // Monthly totals for growth calc
    const monthTotals: Record<string, number> = {};
    for (const s of filtered) {
      monthTotals[s.month] = (monthTotals[s.month] ?? 0) + s.amount;
    }
    const sortedMonths = Object.entries(monthTotals).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const avg = sortedMonths.length > 0
      ? sortedMonths.reduce((sum, [, v]) => sum + v, 0) / sortedMonths.length
      : 0;

    let bestMonth = "";
    let bestAmount = 0;
    for (const [m, v] of sortedMonths) {
      if (v > bestAmount) {
        bestAmount = v;
        bestMonth = m;
      }
    }

    // Latest MoM growth (last two months)
    let momGrowth = 0;
    let momFrom = "";
    let momTo = "";
    if (sortedMonths.length >= 2) {
      const prev = sortedMonths[sortedMonths.length - 2];
      const curr = sortedMonths[sortedMonths.length - 1];
      momFrom = prev[0];
      momTo = curr[0];
      momGrowth = prev[1] > 0 ? ((curr[1] - prev[1]) / prev[1]) * 100 : 0;
    }

    // Average MoM growth across all consecutive months
    let momSum = 0;
    let momCount = 0;
    for (let i = 1; i < sortedMonths.length; i++) {
      const prev = sortedMonths[i - 1][1];
      const curr = sortedMonths[i][1];
      if (prev > 0) {
        momSum += ((curr - prev) / prev) * 100;
        momCount++;
      }
    }
    const avgMomGrowth = momCount > 0 ? momSum / momCount : 0;

    return { total, avg, bestMonth, bestAmount, momGrowth, momFrom, momTo, avgMomGrowth, momCount };
  }, [filtered]);

  // Label for the total stat card
  const totalLabel = useMemo(() => {
    if (timeFrame === "all") return "Lifetime";
    if (timeFrame === "ytd") return "YTD";
    if (timeFrame === "custom") return "Range Total";
    return timeFrame; // year
  }, [timeFrame]);

  const handleUpsert = async (
    productName: string,
    month: string,
    amount: number
  ) => {
    await fetch("/api/financials/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: productName, month, amount }),
    });
    fetchRevenue();
  };

  const handleAddMonth = async () => {
    if (!newMonth || !newProductName || !newAmount) return;
    await handleUpsert(newProductName, newMonth, parseFloat(newAmount));
    setNewMonth("");
    setNewAmount("");
    setShowAddProduct(false);
  };

  const handleCellSave = async (product: string, month: string) => {
    const amount = parseFloat(editValue);
    if (isNaN(amount)) {
      setEditingCell(null);
      return;
    }
    await handleUpsert(product, month, amount);
    setEditingCell(null);
  };

  const allProducts = data?.products ?? [];

  return (
    <>
      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Product filter */}
        <select
          value={filterProduct}
          onChange={(e) => setFilterProduct(e.target.value)}
          className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground"
        >
          <option value="">All Products</option>
          {allProducts.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Time frame presets */}
        <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/20 p-0.5">
          {[
            { id: "all" as TimeFrame, label: "All Time" },
            { id: "ytd" as TimeFrame, label: "YTD" },
            ...availableYears.map((y) => ({ id: y as TimeFrame, label: y })),
            { id: "custom" as TimeFrame, label: "Custom" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTimeFrame(opt.id)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                timeFrame === opt.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom range pickers */}
        {timeFrame === "custom" && (
          <>
            <input
              type="month"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              placeholder="Start"
              className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="month"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              placeholder="End"
              className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
            />
          </>
        )}

        {/* YoY toggle */}
        <button
          onClick={() => setYoyMode(!yoyMode)}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            yoyMode
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary"
          )}
        >
          <GitCompareArrows className="h-3 w-3" />
          Year over Year
        </button>
      </div>

      {/* Charts */}
      {(yoyMode ? yoyChartData : chartData).length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {yoyMode ? "Year-over-Year Comparison" : "Revenue Trends"}
              {filterProduct && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({filterProduct})
                </span>
              )}
            </h2>
            {!yoyMode && (
              <div className="flex gap-1">
                <button
                  onClick={() => setChartType("line")}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] transition-colors",
                    chartType === "line"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  Line
                </button>
                <button
                  onClick={() => setChartType("bar")}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] transition-colors",
                    chartType === "bar"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  Stacked Bar
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/50 bg-card/40 p-4">
            <ResponsiveContainer width="100%" height={280}>
              {yoyMode ? (
                /* Year-over-year: one line per year, Jan-Dec on x-axis */
                <LineChart data={yoyChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => fmtMoney(Number(value ?? 0))}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}
                  />
                  {yoyYears.map((year) => (
                    <Line
                      key={year}
                      type="monotone"
                      dataKey={year}
                      stroke={YEAR_COLORS[year] ?? PRODUCT_COLORS[yoyYears.indexOf(year) % PRODUCT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              ) : chartType === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => fmtMoney(Number(value ?? 0))}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}
                  />
                  {visibleProducts.map((product, i) => (
                    <Line
                      key={product}
                      type="monotone"
                      dataKey={product}
                      stroke={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => fmtMoney(Number(value ?? 0))}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}
                  />
                  {visibleProducts.map((product, i) => (
                    <Bar
                      key={product}
                      dataKey={product}
                      stackId="revenue"
                      fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
                      radius={
                        i === visibleProducts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                      }
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {filtered.length > 0 && (
        <div className="mb-6 grid grid-cols-5 gap-3">
          <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">{totalLabel} Revenue</span>
            <p className="text-lg font-semibold text-emerald-400">
              {fmtMoney(stats.total)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Monthly Avg</span>
            <p className="text-lg font-semibold text-foreground">
              {fmtMoney(stats.avg)}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Best Month</span>
            <p className="text-lg font-semibold text-foreground">
              {fmtMoney(stats.bestAmount)}
            </p>
            {stats.bestMonth && (
              <p className="text-[10px] text-muted-foreground/50">
                {formatMonth(stats.bestMonth)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Latest MoM</span>
            <p
              className={cn(
                "flex items-center gap-1 text-lg font-semibold",
                stats.momGrowth >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {stats.momGrowth >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {Math.abs(stats.momGrowth).toFixed(1)}%
            </p>
            {stats.momFrom && (
              <p className="text-[10px] text-muted-foreground/50">
                {formatMonth(stats.momFrom)} → {formatMonth(stats.momTo)}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
            <span className="text-[10px] text-muted-foreground">Avg MoM</span>
            <p
              className={cn(
                "flex items-center gap-1 text-lg font-semibold",
                stats.avgMomGrowth >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {stats.avgMomGrowth >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              {Math.abs(stats.avgMomGrowth).toFixed(1)}%
            </p>
            {stats.momCount > 0 && (
              <p className="text-[10px] text-muted-foreground/50">
                across {stats.momCount} month{stats.momCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Per-product breakdown (only when multiple products visible) */}
      {filtered.length > 0 && visibleProducts.length > 1 && !filterProduct && (
        <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
            Revenue by Product
          </h3>
          <div className="space-y-2.5">
            {(() => {
              const productTotals: { name: string; total: number; avg: number; count: number }[] = [];
              for (const p of visibleProducts) {
                const productSnaps = filtered.filter((s) => s.product_name === p);
                const total = productSnaps.reduce((sum, s) => sum + s.amount, 0);
                // Count unique months for this product
                const months = new Set(productSnaps.map((s) => s.month));
                productTotals.push({ name: p, total, avg: months.size > 0 ? total / months.size : 0, count: months.size });
              }
              const maxTotal = Math.max(1, ...productTotals.map((p) => p.total));

              return productTotals
                .sort((a, b) => b.total - a.total)
                .map((pt, i) => {
                  const pct = stats.total > 0 ? (pt.total / stats.total) * 100 : 0;
                  const color = PRODUCT_COLORS[visibleProducts.indexOf(pt.name) % PRODUCT_COLORS.length];
                  return (
                    <div key={pt.name}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-xs font-medium">{pt.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground/50">
                            {pct.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            avg {fmtMoney(pt.avg)}/mo
                          </span>
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {fmtMoney(pt.total)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(pt.total / maxTotal) * 100}%`,
                            backgroundColor: color,
                            opacity: 0.6,
                          }}
                        />
                      </div>
                    </div>
                  );
                });
            })()}
          </div>
        </div>
      )}

      {/* Monthly Input Grid */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Monthly Revenue</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddProduct(!showAddProduct)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Entry
          </Button>
        </div>

        {/* Quick-add form */}
        {showAddProduct && (
          <div className="mb-3 flex items-end gap-2 rounded-lg border border-border bg-card/40 p-3">
            {allProducts.length > 0 ? (
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-muted-foreground">
                  Product
                </label>
                <select
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                >
                  <option value="">Select or type new...</option>
                  {allProducts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex-1">
              <label className="mb-1 block text-[10px] text-muted-foreground">
                {allProducts.length > 0 ? "Or New Product Name" : "Product Name"}
              </label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g., Elite"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Month
              </label>
              <input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Amount
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
                className="h-8 w-28 text-xs"
              />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleAddMonth}>
              Save
            </Button>
          </div>
        )}

        {/* Grid table */}
        {visibleProducts.length > 0 && gridData.months.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30 bg-card/30">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">
                    Month
                  </th>
                  {visibleProducts.map((p, i) => (
                    <th
                      key={p}
                      className="px-3 py-2 text-right text-[10px] font-semibold"
                      style={{ color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}
                    >
                      {p}
                    </th>
                  ))}
                  {visibleProducts.length > 1 && (
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">
                      Total
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {gridData.months.map((month) => {
                  const row = gridData.grid[month] ?? {};
                  const rowTotal = Object.values(row).reduce(
                    (sum, s) => sum + (s?.amount ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={month}
                      className="border-b border-border/10 transition-colors hover:bg-card/20"
                    >
                      <td className="px-3 py-2 text-xs font-medium">
                        {formatMonth(month)}
                      </td>
                      {visibleProducts.map((p) => {
                        const cellKey = `${month}-${p}`;
                        const snapshot = row[p];
                        const isEditing = editingCell === cellKey;

                        return (
                          <td
                            key={p}
                            className="px-3 py-1.5 text-right"
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(p, month)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleCellSave(p, month);
                                  if (e.key === "Escape") setEditingCell(null);
                                }}
                                className="h-6 w-24 rounded border border-input bg-secondary px-1 text-right text-xs text-foreground"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingCell(cellKey);
                                  setEditValue(
                                    snapshot ? snapshot.amount.toString() : "0"
                                  );
                                }}
                                className="rounded px-1 py-0.5 text-xs font-mono text-foreground/80 hover:bg-secondary"
                              >
                                {snapshot
                                  ? fmtMoney(snapshot.amount)
                                  : "---"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      {visibleProducts.length > 1 && (
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground">
                          {fmtMoney(rowTotal)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 px-4 py-12 text-center">
            <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">
              {data && data.snapshots.length > 0
                ? "No revenue data for this filter"
                : "No revenue data yet"}
            </p>
            {(!data || data.snapshots.length === 0) && (
              <button
                onClick={() => setShowAddProduct(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Add your first product revenue
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Entries Tab (moved from original financials view)
// ===========================================================================

function EntriesTab({ projects }: { projects: Project[] }) {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterType, setFilterType] = useState<EntryType | "">("");
  const [filterMonth, setFilterMonth] = useState("");

  // Form state
  const [formType, setFormType] = useState<EntryType>("income");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formRecurring, setFormRecurring] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterProjectId) params.set("project_id", filterProjectId);
      if (filterType) params.set("entry_type", filterType);
      if (filterMonth) params.set("month", filterMonth);
      const qs = params.toString();
      const res = await fetch(`/api/financials${qs ? `?${qs}` : ""}`);
      if (!res.ok) return;
      const json = await res.json();
      setEntries(
        (json.entries ?? []).map((e: Record<string, unknown>) => ({
          ...e,
          recurring: Boolean(e.recurring),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [filterProjectId, filterType, filterMonth]);

  useEffect(() => {
    setLoading(true);
    fetchEntries();
  }, [fetchEntries]);

  const resetForm = () => {
    setEditingId(null);
    setFormType("income");
    setFormAmount("");
    setFormDescription("");
    setFormCategory("");
    setFormProjectId("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormRecurring(false);
    setShowForm(false);
  };

  const startEditing = (entry: FinancialEntry) => {
    setEditingId(entry.id);
    setFormType(entry.entry_type);
    setFormAmount(entry.amount.toString());
    setFormDescription(entry.description);
    setFormCategory(entry.category);
    setFormProjectId(entry.project_id || "");
    setFormDate(entry.entry_date);
    setFormRecurring(entry.recurring);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) return;

    const payload = {
      entry_type: formType,
      amount,
      description: formDescription,
      category: formCategory,
      project_id: formProjectId || null,
      entry_date: formDate,
      recurring: formRecurring,
    };

    if (editingId) {
      await fetch(`/api/financials/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/financials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    resetForm();
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/financials/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    fetchEntries();
  };

  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  const activeProjects = projects.filter((p) => p.status === "active");
  const categories =
    formType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <>
      {/* Add Entry Button */}
      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            if (showForm) {
              resetForm();
            } else {
              setShowForm(true);
            }
          }}
        >
          {showForm ? (
            <>
              <X className="mr-1.5 h-3.5 w-3.5" /> Close
            </>
          ) : (
            <>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Entry
            </>
          )}
        </Button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-border bg-card/40 p-4"
        >
          {editingId && (
            <div className="mb-3 flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium text-amber-400">
                Editing entry
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
              >
                Cancel edit
              </button>
            </div>
          )}
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFormType("income");
                setFormCategory("");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                formType === "income"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => {
                setFormType("expense");
                setFormCategory("");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs transition-colors",
                formType === "expense"
                  ? "bg-red-500/20 text-red-400"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              Expense
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Amount
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Description
              </label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What for..."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Category
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
              >
                <option value="">Select...</option>
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Project
              </label>
              <select
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
              >
                <option value="">None</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div>
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
              />
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={formRecurring}
                onChange={(e) => setFormRecurring(e.target.checked)}
                className="rounded"
              />
              Recurring
            </label>
            <div className="ml-auto mt-4 flex items-center gap-2">
              {editingId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" size="sm" className="text-xs">
                {editingId ? "Update Entry" : "Save Entry"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="mb-3 flex items-center gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as EntryType | "")}
          className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground"
        >
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
        </select>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground"
        >
          <option value="">All Projects</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
        />
        {filterMonth && (
          <button
            onClick={() => setFilterMonth("")}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear month
          </button>
        )}
      </div>

      {/* Entries List */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
          <DollarSign className="mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">
            {filterMonth || filterType || filterProjectId
              ? "No entries match your filters"
              : "No financial entries yet"}
          </p>
          {!filterMonth && !filterType && !filterProjectId && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Add your first entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const isIncome = entry.entry_type === "income";
            const isBeingEdited = editingId === entry.id;
            const proj = entry.project_id
              ? projectMap[entry.project_id]
              : null;
            const allCats = {
              ...INCOME_CATEGORIES,
              ...EXPENSE_CATEGORIES,
            } as Record<string, string>;
            const catLabel = entry.category
              ? allCats[entry.category] || entry.category
              : "";

            return (
              <div
                key={entry.id}
                onClick={() => startEditing(entry)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md bg-card/30 px-3 py-2 transition-colors hover:bg-card/50",
                  isBeingEdited && "ring-1 ring-amber-400/50 bg-card/50"
                )}
              >
                {isIncome ? (
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-red-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {entry.description || catLabel || entry.entry_type}
                    </span>
                    {entry.recurring && (
                      <RefreshCw className="h-2.5 w-2.5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/50">
                    {catLabel && <span>{catLabel}</span>}
                    {proj && (
                      <span style={{ color: proj.color }}>{proj.name}</span>
                    )}
                    <span>
                      {format(new Date(entry.entry_date), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-sm font-medium",
                    isIncome ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {isIncome ? "+" : "-"}
                  {fmtMoney(entry.amount)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(entry);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground/30 transition-colors hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground/30 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${year}`;
}
