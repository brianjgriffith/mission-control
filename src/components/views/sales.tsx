"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { type RepSale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type RepQuota, type Deal } from "@/lib/types";
import { RepChargesModal } from "@/components/rep-charges-modal";
import { ManageReps } from "@/components/manage-reps";
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  GitCompareArrows,
  Users,
  ChevronDown,
  ArrowLeft,
  Phone,
  Pencil,
  Check,
  X,
  FileText,
  Trophy,
  Star,
  Trash2,
  Download,
  Target,
} from "lucide-react";
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
  Cell,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// Constants (duplicated from financials — small, avoids shared-constants refactor)
// ---------------------------------------------------------------------------

const PRODUCT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#3b82f6",
  "#ef4444", "#a855f7", "#14b8a6", "#f97316",
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const YEAR_COLORS: Record<string, string> = {
  "2022": "#94a3b8",
  "2023": "#a855f7",
  "2024": "#3b82f6",
  "2025": "#22c55e",
  "2026": "#f59e0b",
  "2027": "#ef4444",
};

type TimeFrame = "all" | "ytd" | "custom" | string;

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${year}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SalesData {
  sales: RepSale[];
  reps: string[];
  products: string[];
}

// ===========================================================================
// Rep Profile View
// ===========================================================================

interface RepProfileViewProps {
  repName: string;
  allSales: RepSale[];
  allProducts: string[];
  onBack: () => void;
  onUpsert: (repName: string, product: string, month: string, amount: number, dealCount: number, newAmount?: number, recurringAmount?: number, bookedCalls?: number, refundAmount?: number, notes?: string) => Promise<void>;
  fetchSales: () => void;
  quotas: RepQuota[];
  onSetQuota: (repName: string, month: string, targetAmount: number) => Promise<void>;
  deals: Deal[];
  onAddDeal: (deal: { rep_name: string; product: string; client_name: string; amount: number; deal_date: string; notes?: string }) => Promise<void>;
  onDeleteDeal: (id: string) => Promise<void>;
}

interface LineItem {
  product: string;
  newAmount: string;
  recurringAmount: string;
  refundAmount: string;
  amount: string;
  dealCount: string;
  notes: string;
}

const emptyLine = (): LineItem => ({ product: "", newAmount: "", recurringAmount: "", refundAmount: "", amount: "", dealCount: "", notes: "" });

interface EditingCell {
  month: string;
  product: string;
  newAmount: string;
  recurringAmount: string;
  refundAmount: string;
  amount: string;
  dealCount: string;
  notes: string;
}

interface EditingCalls {
  month: string;
  value: string;
}

function RepProfileView({ repName, allSales, allProducts, onBack, onUpsert, fetchSales, quotas, onSetQuota, deals, onAddDeal, onDeleteDeal }: RepProfileViewProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formMonth, setFormMonth] = useState("");
  const [formBookedCalls, setFormBookedCalls] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [expandedProfileCell, setExpandedProfileCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [savingCell, setSavingCell] = useState(false);
  const [editingCalls, setEditingCalls] = useState<EditingCalls | null>(null);
  const [savingCalls, setSavingCalls] = useState(false);
  const [profileTimeFrame, setProfileTimeFrame] = useState<string>("all");
  const [profileCustomStart, setProfileCustomStart] = useState("");
  const [profileCustomEnd, setProfileCustomEnd] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState<{ month: string; value: string } | null>(null);
  const [showDeals, setShowDeals] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [dealForm, setDealForm] = useState({ date: "", client: "", product: "", amount: "", notes: "" });

  const repSales = useMemo(() => allSales.filter((s) => s.rep_name === repName), [allSales, repName]);

  const repYears = useMemo(() => {
    const years = new Set<string>();
    for (const s of repSales) years.add(s.month.slice(0, 4));
    return Array.from(years).sort();
  }, [repSales]);

  const parseQuarter = (qStr: string): { start: string; end: string } | null => {
    const m = qStr.match(/^(\d{4})-Q([1-4])$/);
    if (!m) return null;
    const year = m[1];
    const q = parseInt(m[2], 10);
    const startMonth = String((q - 1) * 3 + 1).padStart(2, "0");
    const endMonth = String(q * 3).padStart(2, "0");
    return { start: `${year}-${startMonth}`, end: `${year}-${endMonth}` };
  };

  const quarterPresets = useMemo(() => {
    const quarters = new Set<string>();
    for (const s of repSales) {
      const year = s.month.slice(0, 4);
      const monthNum = parseInt(s.month.slice(5, 7), 10);
      const q = Math.ceil(monthNum / 3);
      quarters.add(`${year}-Q${q}`);
    }
    return Array.from(quarters).sort().reverse();
  }, [repSales]);

  const filteredRepSales = useMemo(() => {
    if (profileTimeFrame === "all") return repSales;
    const currentYear = new Date().getFullYear().toString();
    if (profileTimeFrame === "ytd") {
      return repSales.filter((s) => s.month.startsWith(currentYear));
    }
    if (profileTimeFrame === "custom") {
      let sales = repSales;
      if (profileCustomStart) sales = sales.filter((s) => s.month >= profileCustomStart);
      if (profileCustomEnd) sales = sales.filter((s) => s.month <= profileCustomEnd);
      return sales;
    }
    const qRange = parseQuarter(profileTimeFrame);
    if (qRange) {
      return repSales.filter((s) => s.month >= qRange.start && s.month <= qRange.end);
    }
    return repSales.filter((s) => s.month.startsWith(profileTimeFrame));
  }, [repSales, profileTimeFrame, profileCustomStart, profileCustomEnd]);

  const profileTimeLabel = useMemo(() => {
    if (profileTimeFrame === "all") return "All Time";
    if (profileTimeFrame === "ytd") return "YTD";
    if (profileTimeFrame === "custom") return "Custom Range";
    const qRange = parseQuarter(profileTimeFrame);
    if (qRange) return profileTimeFrame;
    return profileTimeFrame;
  }, [profileTimeFrame]);

  const profileStats = useMemo(() => {
    const totalRevenue = filteredRepSales.reduce((sum, s) => sum + s.amount, 0);
    const totalNew = filteredRepSales.reduce((sum, s) => sum + (s.new_amount ?? 0), 0);
    const totalRecurring = filteredRepSales.reduce((sum, s) => sum + (s.recurring_amount ?? 0), 0);
    const totalRefunds = filteredRepSales.reduce((sum, s) => sum + (s.refund_amount ?? 0), 0);
    const totalDeals = filteredRepSales.reduce((sum, s) => sum + s.deal_count, 0);
    // Booked calls: take max per rep+month (same value repeated across products)
    const callsByMonth: Record<string, number> = {};
    for (const s of filteredRepSales) {
      callsByMonth[s.month] = Math.max(callsByMonth[s.month] ?? 0, s.booked_calls ?? 0);
    }
    const totalBookedCalls = Object.values(callsByMonth).reduce((sum, c) => sum + c, 0);
    const closeRate = totalBookedCalls > 0 ? (totalDeals / totalBookedCalls) * 100 : 0;
    const months = new Set(filteredRepSales.map((s) => s.month));
    const avgDealSize = totalDeals > 0 ? totalNew / totalDeals : 0;
    return {
      totalRevenue,
      totalNew,
      totalRecurring,
      totalRefunds,
      totalDeals,
      totalBookedCalls,
      closeRate,
      avgDealSize,
      monthsActive: months.size,
      newPct: (totalNew + totalRecurring) > 0 ? (totalNew / (totalNew + totalRecurring)) * 100 : 0,
      recurringPct: (totalNew + totalRecurring) > 0 ? (totalRecurring / (totalNew + totalRecurring)) * 100 : 0,
      refundPct: totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0,
    };
  }, [filteredRepSales]);

  const trendData = useMemo(() => {
    const monthMap: Record<string, { total: number; newRev: number; recurRev: number; refunds: number }> = {};
    for (const s of filteredRepSales) {
      if (!monthMap[s.month]) monthMap[s.month] = { total: 0, newRev: 0, recurRev: 0, refunds: 0 };
      monthMap[s.month].total += s.amount;
      monthMap[s.month].newRev += (s.new_amount ?? 0);
      monthMap[s.month].recurRev += (s.recurring_amount ?? 0);
      monthMap[s.month].refunds += (s.refund_amount ?? 0);
    }
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        label: formatMonth(month),
        Total: d.total,
        "New Revenue": d.newRev,
        "Recurring Revenue": d.recurRev,
        Refunds: d.refunds > 0 ? -d.refunds : 0,
      }));
  }, [filteredRepSales]);

  const productMix = useMemo(() => {
    const map: Record<string, { total: number; newAmt: number; recurAmt: number; refundAmt: number; deals: number }> = {};
    for (const s of filteredRepSales) {
      if (!map[s.product]) map[s.product] = { total: 0, newAmt: 0, recurAmt: 0, refundAmt: 0, deals: 0 };
      map[s.product].total += s.amount;
      map[s.product].newAmt += (s.new_amount ?? 0);
      map[s.product].recurAmt += (s.recurring_amount ?? 0);
      map[s.product].refundAmt += (s.refund_amount ?? 0);
      map[s.product].deals += s.deal_count;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([product, d]) => ({ product, ...d }));
  }, [filteredRepSales]);

  const profileGrid = useMemo(() => {
    const months = new Set<string>();
    const products = new Set<string>();
    const grid: Record<string, Record<string, { amount: number; new_amount: number; recurring_amount: number; refund_amount: number; deal_count: number; notes: string; saleId: string }>> = {};
    // Booked calls per month (same value repeated across products, take max)
    const bookedCallsByMonth: Record<string, number> = {};
    for (const s of filteredRepSales) {
      months.add(s.month);
      products.add(s.product);
      if (!grid[s.month]) grid[s.month] = {};
      if (!grid[s.month][s.product]) grid[s.month][s.product] = { amount: 0, new_amount: 0, recurring_amount: 0, refund_amount: 0, deal_count: 0, notes: "", saleId: "" };
      grid[s.month][s.product].amount += s.amount;
      grid[s.month][s.product].new_amount += (s.new_amount ?? 0);
      grid[s.month][s.product].recurring_amount += (s.recurring_amount ?? 0);
      grid[s.month][s.product].refund_amount += (s.refund_amount ?? 0);
      grid[s.month][s.product].deal_count += s.deal_count;
      grid[s.month][s.product].notes = s.notes || "";
      grid[s.month][s.product].saleId = s.id;
      bookedCallsByMonth[s.month] = Math.max(bookedCallsByMonth[s.month] ?? 0, s.booked_calls ?? 0);
    }
    const sortedMonths = Array.from(months).sort().reverse();
    const sortedProducts = Array.from(products).sort();
    return { months: sortedMonths, products: sortedProducts, grid, bookedCallsByMonth };
  }, [filteredRepSales]);

  const startEditing = (month: string, product: string) => {
    const cell = profileGrid.grid[month]?.[product];
    setEditingCell({
      month,
      product,
      newAmount: (cell?.new_amount ?? 0).toString(),
      recurringAmount: (cell?.recurring_amount ?? 0).toString(),
      refundAmount: (cell?.refund_amount ?? 0).toString(),
      amount: (cell?.amount ?? 0).toString(),
      dealCount: (cell?.deal_count ?? 0).toString(),
      notes: cell?.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    setSavingCell(true);
    const na = parseFloat(editingCell.newAmount) || 0;
    const ra = parseFloat(editingCell.recurringAmount) || 0;
    const ref = parseFloat(editingCell.refundAmount) || 0;
    await onUpsert(
      repName,
      editingCell.product,
      editingCell.month,
      parseFloat(editingCell.amount) || 0,
      parseInt(editingCell.dealCount, 10) || 0,
      na,
      ra,
      undefined,
      ref,
      editingCell.notes
    );
    setEditingCell(null);
    setSavingCell(false);
  };

  const handleDelete = async (saleId: string) => {
    if (!saleId) return;
    setDeletingId(saleId);
    try {
      const res = await fetch(`/api/financials/sales/${saleId}`, { method: "DELETE" });
      if (res.ok) fetchSales();
    } catch (err) {
      console.error("[RepProfile] delete failed:", err);
    }
    setDeletingId(null);
  };

  const handleSaveQuota = async (month: string) => {
    if (!editingQuota) return;
    const target = parseFloat(editingQuota.value) || 0;
    await onSetQuota(repName, month, target);
    setEditingQuota(null);
  };

  const handleAddDealSubmit = async () => {
    if (!dealForm.date || !dealForm.product || !dealForm.amount) return;
    await onAddDeal({
      rep_name: repName,
      product: dealForm.product,
      client_name: dealForm.client,
      amount: parseFloat(dealForm.amount) || 0,
      deal_date: dealForm.date,
      notes: dealForm.notes,
    });
    setDealForm({ date: "", client: "", product: "", amount: "", notes: "" });
    setShowAddDeal(false);
  };

  const repQuotas = useMemo(() => quotas.filter((q) => q.rep_name === repName), [quotas, repName]);
  const quotaMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of repQuotas) map[q.month] = q.target_amount;
    return map;
  }, [repQuotas]);

  const repDeals = useMemo(() => deals.filter((d) => d.rep_name === repName), [deals, repName]);

  const saveCalls = async () => {
    if (!editingCalls) return;
    setSavingCalls(true);
    const bc = parseInt(editingCalls.value, 10) || 0;
    // Save calls on the first product for this month (calls are per rep+month)
    const firstProduct = profileGrid.products.find((p) => profileGrid.grid[editingCalls.month]?.[p]) ?? profileGrid.products[0];
    if (firstProduct) {
      const cell = profileGrid.grid[editingCalls.month]?.[firstProduct];
      await onUpsert(
        repName,
        firstProduct,
        editingCalls.month,
        cell?.amount ?? 0,
        cell?.deal_count ?? 0,
        cell?.new_amount ?? 0,
        cell?.recurring_amount ?? 0,
        bc,
        cell?.refund_amount ?? 0
      );
    }
    setEditingCalls(null);
    setSavingCalls(false);
  };

  const updateEditField = (field: keyof EditingCell, value: string) => {
    setEditingCell((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "newAmount" || field === "recurringAmount" || field === "refundAmount") {
        const na = parseFloat(field === "newAmount" ? value : next.newAmount) || 0;
        const ra = parseFloat(field === "recurringAmount" ? value : next.recurringAmount) || 0;
        const ref = parseFloat(field === "refundAmount" ? value : next.refundAmount) || 0;
        next.amount = (na + ra - ref).toString();
      }
      return next;
    });
  };

  const updateLine = (index: number, field: keyof LineItem, value: string) => {
    setLineItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Auto-compute total when new/recurring/refund change
      if (field === "newAmount" || field === "recurringAmount" || field === "refundAmount") {
        const na = parseFloat(field === "newAmount" ? value : next[index].newAmount) || 0;
        const ra = parseFloat(field === "recurringAmount" ? value : next[index].recurringAmount) || 0;
        const ref = parseFloat(field === "refundAmount" ? value : next[index].refundAmount) || 0;
        next[index].amount = (na + ra - ref).toString();
      }
      return next;
    });
  };

  const handleProfileAdd = async () => {
    const validLines = lineItems.filter((l) => l.product && l.amount && formMonth);
    if (validLines.length === 0 || !formMonth) return;
    const bc = parseInt(formBookedCalls, 10) || 0;
    for (let i = 0; i < validLines.length; i++) {
      const l = validLines[i];
      const na = parseFloat(l.newAmount) || 0;
      const ra = parseFloat(l.recurringAmount) || 0;
      const ref = parseFloat(l.refundAmount) || 0;
      // Only pass booked calls on first line (it's per rep+month, not per product)
      await onUpsert(repName, l.product, formMonth, parseFloat(l.amount), parseInt(l.dealCount, 10) || 0, na, ra, i === 0 ? bc : 0, ref, l.notes);
    }
    setFormMonth("");
    setFormBookedCalls("");
    setLineItems([emptyLine()]);
    setShowAddForm(false);
  };

  const maxProductTotal = Math.max(1, ...productMix.map((p) => p.total));

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold">{repName}</h2>
        {profileTimeFrame !== "all" && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {profileTimeLabel}
          </span>
        )}
      </div>

      {/* Time Frame Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/20 p-0.5">
          {[
            { id: "all", label: "All Time" },
            { id: "ytd", label: "YTD" },
            ...repYears.map((y) => ({ id: y, label: y })),
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setProfileTimeFrame(opt.id)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                profileTimeFrame === opt.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {quarterPresets.length > 0 && (
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-card/20 p-0.5">
            {quarterPresets.slice(0, 8).map((q) => (
              <button
                key={q}
                onClick={() => setProfileTimeFrame(q)}
                className={cn(
                  "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                  profileTimeFrame === q
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setProfileTimeFrame("custom")}
          className={cn(
            "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            profileTimeFrame === "custom"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary"
          )}
        >
          Custom
        </button>
        {profileTimeFrame === "custom" && (
          <>
            <input
              type="month"
              value={profileCustomStart}
              onChange={(e) => setProfileCustomStart(e.target.value)}
              placeholder="Start"
              className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="month"
              value={profileCustomEnd}
              onChange={(e) => setProfileCustomEnd(e.target.value)}
              placeholder="End"
              className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
            />
          </>
        )}
      </div>

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Row 1: Revenue */}
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">{profileTimeFrame === "all" ? "Total" : profileTimeLabel} Revenue</span>
          <p className={cn("text-lg font-semibold", profileStats.totalRevenue >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(profileStats.totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">New Revenue</span>
          <p className={cn("text-lg font-semibold", profileStats.totalNew >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(profileStats.totalNew)}</p>
          {profileStats.totalRevenue > 0 && (
            <p className="text-[10px] text-muted-foreground/50">{profileStats.newPct.toFixed(1)}% of total</p>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Recurring Revenue</span>
          <p className="text-lg font-semibold text-blue-400">{fmtMoney(profileStats.totalRecurring)}</p>
          {profileStats.totalRevenue > 0 && (
            <p className="text-[10px] text-muted-foreground/50">{profileStats.recurringPct.toFixed(1)}% of total</p>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Refunds</span>
          <p className={cn("text-lg font-semibold", profileStats.totalRefunds > 0 ? "text-red-400" : "text-foreground")}>
            {profileStats.totalRefunds > 0 ? `-${fmtMoney(profileStats.totalRefunds)}` : fmtMoney(0)}
          </p>
          {profileStats.totalRefunds > 0 && profileStats.totalRevenue > 0 && (
            <p className="text-[10px] text-muted-foreground/50">{profileStats.refundPct.toFixed(1)}% of total</p>
          )}
        </div>
        {/* Row 2: Deals & Calls */}
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">New Deals</span>
          <p className="text-lg font-semibold text-foreground">{profileStats.totalDeals}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Meetings</span>
          <p className="text-lg font-semibold text-foreground">{profileStats.totalBookedCalls}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Close Rate</span>
          <p className={cn("text-lg font-semibold", profileStats.closeRate > 0 ? "text-amber-400" : "text-foreground")}>
            {profileStats.totalBookedCalls > 0 ? `${profileStats.closeRate.toFixed(1)}%` : "---"}
          </p>
          {profileStats.totalBookedCalls > 0 && (
            <p className="text-[10px] text-muted-foreground/50">
              {profileStats.totalDeals} new deals from {profileStats.totalBookedCalls} meetings
            </p>
          )}
        </div>
        {/* Row 3: Averages */}
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Avg Deal Size</span>
          <p className="text-lg font-semibold text-foreground">{fmtMoney(profileStats.avgDealSize)}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Months Active</span>
          <p className="text-lg font-semibold text-foreground">{profileStats.monthsActive}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
          <span className="text-[10px] text-muted-foreground">Revenue Split</span>
          {(profileStats.totalNew > 0 || profileStats.totalRecurring > 0) ? (
            <>
              <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                {profileStats.totalNew > 0 && (
                  <div className="h-full bg-emerald-400" style={{ width: `${profileStats.newPct}%` }} />
                )}
                {profileStats.totalRecurring > 0 && (
                  <div className="h-full bg-blue-400" style={{ width: `${profileStats.recurringPct}%` }} />
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/50">
                <span>{profileStats.newPct.toFixed(0)}% new</span>
                <span>{profileStats.recurringPct.toFixed(0)}% recurring</span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/50">No split data</p>
          )}
        </div>
      </div>

      {/* Revenue Trend Chart */}
      {trendData.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold">Revenue Trend</h3>
          <div className="rounded-lg border border-border/50 bg-card/40 p-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                <Line type="monotone" dataKey="Total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="New Revenue" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Recurring Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Refunds" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Product Mix & Revenue Split */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground">Product Mix</h3>
          <div className="space-y-2.5">
            {productMix.map((p, i) => {
              const hasRevSplit = p.newAmt > 0 || p.recurAmt > 0 || p.refundAmt > 0;
              return (
                <div key={p.product}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium">{p.product}</span>
                    <span className="font-mono text-sm font-semibold">{fmtMoney(p.total)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(p.total / maxProductTotal) * 100}%`,
                        backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
                        opacity: 0.6,
                      }}
                    />
                  </div>
                  {hasRevSplit && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground/50">
                      New: {fmtMoney(p.newAmt)} + Recurring: {fmtMoney(p.recurAmt)}
                      {p.refundAmt > 0 && <span className="text-red-400"> &minus; Refunds: {fmtMoney(p.refundAmt)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <h3 className="mb-3 text-xs font-semibold text-muted-foreground">Revenue Split</h3>
          {(profileStats.totalNew > 0 || profileStats.totalRecurring > 0) ? (
            <>
              <div className="mb-4 flex items-center justify-between text-sm">
                <div>
                  <span className="text-emerald-400 font-semibold">{fmtMoney(profileStats.totalNew)}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">new</span>
                </div>
                <div>
                  <span className="text-blue-400 font-semibold">{fmtMoney(profileStats.totalRecurring)}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">recurring</span>
                </div>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary">
                {profileStats.totalNew > 0 && (
                  <div className="h-full bg-emerald-400" style={{ width: `${profileStats.newPct}%` }} />
                )}
                {profileStats.totalRecurring > 0 && (
                  <div className="h-full bg-blue-400" style={{ width: `${profileStats.recurringPct}%` }} />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground/50">
                <span>{profileStats.newPct.toFixed(1)}% new</span>
                <span>{profileStats.recurringPct.toFixed(1)}% recurring</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground/50">No split data yet — add new/recurring amounts to see the breakdown.</p>
          )}
        </div>
      </div>

      {/* Monthly Detail Grid */}
      {profileGrid.months.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Monthly Detail</h3>
            <span className="text-[10px] text-muted-foreground/50">Click any cell to edit</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30 bg-card/30">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Month</th>
                  {profileGrid.products.map((p, i) => (
                    <th key={p} className="px-3 py-2 text-right text-[10px] font-semibold" style={{ color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>
                      {p}
                    </th>
                  ))}
                  {profileGrid.products.length > 1 && (
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">Total</th>
                  )}
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">Meetings</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">Target</th>
                </tr>
              </thead>
              <tbody>
                {profileGrid.months.map((month) => {
                  const row = profileGrid.grid[month] ?? {};
                  const rowTotal = Object.values(row).reduce((sum, c) => sum + (c?.amount ?? 0), 0);
                  const rowDeals = Object.values(row).reduce((sum, c) => sum + (c?.deal_count ?? 0), 0);
                  const monthCalls = profileGrid.bookedCallsByMonth[month] ?? 0;
                  const isEditingThisMonth = editingCell?.month === month;
                  return (
                    <Fragment key={month}>
                      <tr className={cn("border-b border-border/10 transition-colors", isEditingThisMonth ? "bg-primary/5" : "hover:bg-card/20")}>
                        <td className="px-3 py-2 text-xs font-medium">{formatMonth(month)}</td>
                        {profileGrid.products.map((p) => {
                          const cell = row[p];
                          const hasData = cell && (cell.amount !== 0 || cell.deal_count > 0);
                          const isEditingThis = editingCell?.month === month && editingCell?.product === p;
                          const isExpanded = expandedProfileCell === `${month}-${p}`;
                          const hasRevSplit = cell && (cell.new_amount > 0 || cell.recurring_amount > 0 || cell.refund_amount > 0);
                          return (
                            <td key={p} className="px-3 py-1.5 text-right">
                              {hasData ? (
                                <div>
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => startEditing(month, p)}
                                      className={cn(
                                        "group inline-flex items-center gap-1 font-mono text-xs transition-colors",
                                        isEditingThis ? "text-primary" : "hover:text-primary"
                                      )}
                                    >
                                      {fmtMoney(cell.amount)}
                                      <Pencil className="hidden h-2.5 w-2.5 text-muted-foreground/40 group-hover:inline-block" />
                                    </button>
                                    {cell.saleId && (
                                      deletingId === cell.saleId ? (
                                        <span className="text-[10px] text-red-400">deleting...</span>
                                      ) : (
                                        <button
                                          onClick={() => handleDelete(cell.saleId)}
                                          className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-red-400"
                                          title="Delete record"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )
                                    )}
                                  </div>
                                  {cell.deal_count > 0 && (
                                    <div className="text-[10px] text-muted-foreground/50">
                                      ({cell.deal_count} new deal{cell.deal_count !== 1 ? "s" : ""})
                                    </div>
                                  )}
                                  {(isExpanded || isEditingThis) && hasRevSplit && (
                                    <div className="mt-0.5 text-[10px] text-muted-foreground/50">
                                      New: {fmtMoney(cell.new_amount)} + Rec: {fmtMoney(cell.recurring_amount)}
                                      {cell.refund_amount > 0 && <span className="text-red-400"> &minus; Ref: {fmtMoney(cell.refund_amount)}</span>}
                                    </div>
                                  )}
                                  {cell.notes && (
                                    <div className="mt-0.5 text-[10px] text-muted-foreground/40 italic truncate max-w-[140px]" title={cell.notes}>
                                      {cell.notes}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditing(month, p)}
                                  className="text-xs text-muted-foreground/30 transition-colors hover:text-primary"
                                >
                                  ---
                                </button>
                              )}
                            </td>
                          );
                        })}
                        {profileGrid.products.length > 1 && (
                          <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtMoney(rowTotal)}</td>
                        )}
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                          {editingCalls?.month === month ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number" step="1" min="0"
                                value={editingCalls.value}
                                onChange={(e) => setEditingCalls({ ...editingCalls, value: e.target.value })}
                                className="h-7 w-16 text-xs text-right"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter") saveCalls(); if (e.key === "Escape") setEditingCalls(null); }}
                              />
                              <button onClick={saveCalls} disabled={savingCalls} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingCalls(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingCalls({ month, value: (monthCalls || "").toString() })}
                              className="group inline-flex items-center gap-1 transition-colors hover:text-primary"
                            >
                              {monthCalls > 0 ? (
                                <span>
                                  {monthCalls}
                                  {rowDeals > 0 && (
                                    <span className="ml-1 text-[10px] text-amber-400/60">
                                      ({((rowDeals / monthCalls) * 100).toFixed(0)}%)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30">---</span>
                              )}
                              <Pencil className="hidden h-2.5 w-2.5 text-muted-foreground/40 group-hover:inline-block" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                          {editingQuota?.month === month ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number" step="100" min="0"
                                value={editingQuota.value}
                                onChange={(e) => setEditingQuota({ ...editingQuota, value: e.target.value })}
                                className="h-7 w-20 text-xs text-right"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveQuota(month); if (e.key === "Escape") setEditingQuota(null); }}
                              />
                              <button onClick={() => handleSaveQuota(month)} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingQuota(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingQuota({ month, value: (quotaMap[month] || "").toString() })}
                              className="group inline-flex items-center gap-1 transition-colors hover:text-primary"
                            >
                              {quotaMap[month] ? (
                                <span>
                                  {fmtMoney(quotaMap[month])}
                                  {rowTotal > 0 && (
                                    <span className={cn("ml-1 text-[10px]", rowTotal >= quotaMap[month] ? "text-emerald-400/60" : "text-amber-400/60")}>
                                      ({((rowTotal / quotaMap[month]) * 100).toFixed(0)}%)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30">
                                  <Target className="inline h-3 w-3" />
                                </span>
                              )}
                              <Pencil className="hidden h-2.5 w-2.5 text-muted-foreground/40 group-hover:inline-block" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Inline edit row */}
                      {isEditingThisMonth && (
                        <tr className="border-b border-primary/20 bg-primary/5">
                          <td colSpan={profileGrid.products.length + (profileGrid.products.length > 1 ? 2 : 1) + 2} className="px-3 py-2.5">
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="mr-2 text-[10px] font-medium text-primary">
                                Editing {editingCell.product} &middot; {formatMonth(month)}
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">New Rev</label>
                                <Input
                                  type="number" step="0.01"
                                  value={editingCell.newAmount}
                                  onChange={(e) => updateEditField("newAmount", e.target.value)}
                                  className="h-7 w-24 text-xs"
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">Recurring Rev</label>
                                <Input
                                  type="number" step="0.01"
                                  value={editingCell.recurringAmount}
                                  onChange={(e) => updateEditField("recurringAmount", e.target.value)}
                                  className="h-7 w-24 text-xs"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-red-400/70">Refund</label>
                                <Input
                                  type="number" step="0.01" min="0"
                                  value={editingCell.refundAmount}
                                  onChange={(e) => updateEditField("refundAmount", e.target.value)}
                                  className="h-7 w-24 text-xs"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">Total</label>
                                <Input
                                  type="number" step="0.01"
                                  value={editingCell.amount}
                                  onChange={(e) => updateEditField("amount", e.target.value)}
                                  className="h-7 w-24 text-xs"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">New Deals</label>
                                <Input
                                  type="number" step="1" min="0"
                                  value={editingCell.dealCount}
                                  onChange={(e) => updateEditField("dealCount", e.target.value)}
                                  className="h-7 w-16 text-xs"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">Notes</label>
                                <Input
                                  value={editingCell.notes}
                                  onChange={(e) => updateEditField("notes", e.target.value)}
                                  className="h-7 w-36 text-xs"
                                  placeholder="Optional notes"
                                />
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEdit} disabled={savingCell}>
                                  <Check className="mr-1 h-3 w-3" />
                                  {savingCell ? "Saving..." : "Save"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingCell(null)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick-add form (multi-line) */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Entry for {repName}</h3>
          <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(!showAddForm); if (showAddForm) setLineItems([emptyLine()]); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {showAddForm ? "Cancel" : "Add Entry"}
          </Button>
        </div>
        {showAddForm && (
          <div className="rounded-lg border border-border bg-card/40 p-3">
            {/* Shared: Month + Booked Calls (per rep+month) */}
            <div className="mb-3 flex items-end gap-3">
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Month</label>
                <input type="month" value={formMonth} onChange={(e) => setFormMonth(e.target.value)} className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Meetings (this month)</label>
                <Input type="number" step="1" min="0" value={formBookedCalls} onChange={(e) => setFormBookedCalls(e.target.value)} placeholder="0" className="h-8 w-24 text-xs" />
              </div>
            </div>

            {/* Column headers */}
            <div className="mb-1.5 grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem_5.5rem_4rem_6rem_2rem] items-end gap-2 px-0.5">
              <span className="text-[10px] text-muted-foreground">Product</span>
              <span className="text-[10px] text-muted-foreground">New Rev</span>
              <span className="text-[10px] text-muted-foreground">Recurring</span>
              <span className="text-[10px] text-red-400/70">Refund</span>
              <span className="text-[10px] text-muted-foreground">Total</span>
              <span className="text-[10px] text-muted-foreground">New Deals</span>
              <span className="text-[10px] text-muted-foreground">Notes</span>
              <span />
            </div>

            {/* Line items */}
            <div className="space-y-1.5">
              {lineItems.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_5.5rem_5.5rem_5.5rem_5.5rem_4rem_6rem_2rem] items-center gap-2">
                  {allProducts.length > 0 ? (
                    <select
                      value={line.product}
                      onChange={(e) => updateLine(idx, "product", e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                    >
                      <option value="">Select...</option>
                      {allProducts.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={line.product} onChange={(e) => updateLine(idx, "product", e.target.value)} placeholder="e.g., Elite" className="h-8 text-xs" />
                  )}
                  <Input type="number" step="0.01" value={line.newAmount} onChange={(e) => updateLine(idx, "newAmount", e.target.value)} placeholder="0" className="h-8 text-xs" />
                  <Input type="number" step="0.01" value={line.recurringAmount} onChange={(e) => updateLine(idx, "recurringAmount", e.target.value)} placeholder="0" className="h-8 text-xs" />
                  <Input type="number" step="0.01" min="0" value={line.refundAmount} onChange={(e) => updateLine(idx, "refundAmount", e.target.value)} placeholder="0" className="h-8 text-xs" />
                  <Input type="number" step="0.01" value={line.amount} onChange={(e) => updateLine(idx, "amount", e.target.value)} placeholder="0" className="h-8 text-xs" />
                  <Input type="number" step="1" min="0" value={line.dealCount} onChange={(e) => updateLine(idx, "dealCount", e.target.value)} placeholder="0" className="h-8 text-xs" />
                  <Input value={line.notes} onChange={(e) => updateLine(idx, "notes", e.target.value)} placeholder="" className="h-8 text-xs" />
                  {lineItems.length > 1 ? (
                    <button
                      onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Remove line"
                    >
                      &times;
                    </button>
                  ) : <span />}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setLineItems((prev) => [...prev, emptyLine()])}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10"
              >
                <Plus className="h-3 w-3" />
                Add Another Line
              </button>
              <div className="flex-1" />
              <span className="text-[10px] text-muted-foreground">
                {lineItems.filter((l) => l.product && l.amount).length} line{lineItems.filter((l) => l.product && l.amount).length !== 1 ? "s" : ""} ready
              </span>
              <Button size="sm" className="h-8 text-xs" onClick={handleProfileAdd}>
                Save All
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deals Section */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setShowDeals(!showDeals)}
            className="flex items-center gap-2 text-sm font-semibold transition-colors hover:text-primary"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDeals && "rotate-180")} />
            Deals ({repDeals.length})
          </button>
          {showDeals && (
            <Button size="sm" variant="ghost" onClick={() => { setShowAddDeal(!showAddDeal); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {showAddDeal ? "Cancel" : "Add Deal"}
            </Button>
          )}
        </div>
        {showDeals && (
          <>
            {showAddDeal && (
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card/40 p-3">
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Date</label>
                  <input type="date" value={dealForm.date} onChange={(e) => setDealForm({ ...dealForm, date: e.target.value })} className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Client</label>
                  <Input value={dealForm.client} onChange={(e) => setDealForm({ ...dealForm, client: e.target.value })} placeholder="Client name" className="h-8 w-32 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Product</label>
                  {allProducts.length > 0 ? (
                    <select value={dealForm.product} onChange={(e) => setDealForm({ ...dealForm, product: e.target.value })} className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground">
                      <option value="">Select...</option>
                      {allProducts.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <Input value={dealForm.product} onChange={(e) => setDealForm({ ...dealForm, product: e.target.value })} placeholder="Product" className="h-8 w-24 text-xs" />
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Amount</label>
                  <Input type="number" step="0.01" value={dealForm.amount} onChange={(e) => setDealForm({ ...dealForm, amount: e.target.value })} placeholder="0" className="h-8 w-24 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Notes</label>
                  <Input value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} placeholder="" className="h-8 w-32 text-xs" />
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={handleAddDealSubmit}>Save</Button>
              </div>
            )}
            {repDeals.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30 bg-card/30">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Client</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">Amount</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Notes</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {repDeals.map((deal) => (
                      <tr key={deal.id} className="border-b border-border/10 transition-colors hover:bg-card/20">
                        <td className="px-3 py-1.5 text-xs">{deal.deal_date}</td>
                        <td className="px-3 py-1.5 text-xs font-medium">{deal.client_name || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{deal.product}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">{fmtMoney(deal.amount)}</td>
                        <td className="px-3 py-1.5 text-[10px] text-muted-foreground/60 truncate max-w-[140px]">{deal.notes || "—"}</td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => onDeleteDeal(deal.id)}
                            className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">No deals recorded yet. Add individual deals to track client-level data.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Sales View (top-level page)
// ===========================================================================

export function SalesView() {
  const [data, setData] = useState<SalesData | null>(null);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [yoyMode, setYoyMode] = useState(false);
  const [filterRep, setFilterRep] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newRepName, setNewRepName] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDealCount, setNewDealCount] = useState("");
  const [newNewAmount, setNewNewAmount] = useState("");
  const [newRecurringAmount, setNewRecurringAmount] = useState("");
  const [newBookedCalls, setNewBookedCalls] = useState("");
  const [newRefundAmount, setNewRefundAmount] = useState("");
  const [addEntryError, setAddEntryError] = useState("");
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [revenueTypeMode, setRevenueTypeMode] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editDealCount, setEditDealCount] = useState("");
  const [editGuardCell, setEditGuardCell] = useState<string | null>(null);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [reportMonth, setReportMonth] = useState("");
  const [showHighlights, setShowHighlights] = useState(true);
  const [quotas, setQuotas] = useState<RepQuota[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [drillDownRep, setDrillDownRep] = useState<{ id: string; name: string; month?: string } | null>(null);
  const [manageRepsOpen, setManageRepsOpen] = useState(false);
  const [repIdMap, setRepIdMap] = useState<Record<string, string>>({});

  // Fetch sales rep IDs for drill-down
  useEffect(() => {
    fetch("/api/sales-reps")
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, string> = {};
        for (const r of j.reps || []) map[r.name] = r.id;
        setRepIdMap(map);
      })
      .catch(() => {});
  }, []);

  const openDrillDown = useCallback((repName: string, month?: string) => {
    const id = repIdMap[repName];
    if (id) setDrillDownRep({ id, name: repName, month });
  }, [repIdMap]);

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch("/api/financials/sales");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[SalesView] fetch:", err);
    }
  }, []);

  const fetchQuotas = useCallback(async () => {
    try {
      const res = await fetch("/api/financials/quotas");
      if (!res.ok) return;
      const json = await res.json();
      setQuotas(json.quotas);
    } catch (err) {
      console.error("[SalesView] fetch quotas:", err);
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/financials/deals");
      if (!res.ok) return;
      const json = await res.json();
      setDeals(json.deals);
    } catch (err) {
      console.error("[SalesView] fetch deals:", err);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    fetchQuotas();
    fetchDeals();
  }, [fetchSales, fetchQuotas, fetchDeals]);

  // 4.1: Clear editing state when filters change
  useEffect(() => {
    setEditingCell(null);
    setEditGuardCell(null);
    setExpandedCell(null);
  }, [filterRep, filterProduct, timeFrame, customStart, customEnd]);

  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set<string>();
    for (const s of data.sales) years.add(s.month.slice(0, 4));
    return Array.from(years).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let sales = data.sales;
    if (filterRep) sales = sales.filter((s) => s.rep_name === filterRep);
    if (filterProduct) sales = sales.filter((s) => s.product === filterProduct);
    const currentYear = new Date().getFullYear().toString();
    if (timeFrame === "ytd") {
      sales = sales.filter((s) => s.month.startsWith(currentYear));
    } else if (timeFrame === "custom") {
      if (customStart) sales = sales.filter((s) => s.month >= customStart);
      if (customEnd) sales = sales.filter((s) => s.month <= customEnd);
    } else if (timeFrame !== "all") {
      sales = sales.filter((s) => s.month.startsWith(timeFrame));
    }
    return sales;
  }, [data, filterRep, filterProduct, timeFrame, customStart, customEnd]);

  const visibleReps = useMemo(() => {
    const set = new Set<string>();
    for (const s of filtered) set.add(s.rep_name);
    return Array.from(set).sort();
  }, [filtered]);

  const chartData = useMemo(() => {
    const monthMap: Record<string, Record<string, number>> = {};
    for (const s of filtered) {
      if (!monthMap[s.month]) monthMap[s.month] = {};
      monthMap[s.month][s.rep_name] = (monthMap[s.month][s.rep_name] ?? 0) + s.amount;
    }
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, reps]) => ({ month, label: formatMonth(month), ...reps }));
  }, [filtered]);

  const yoyChartData = useMemo(() => {
    if (!yoyMode) return [];
    const yearMonthTotals: Record<string, Record<string, number>> = {};
    for (const s of filtered) {
      const year = s.month.slice(0, 4);
      const monthIdx = s.month.slice(5, 7);
      if (!yearMonthTotals[monthIdx]) yearMonthTotals[monthIdx] = {};
      yearMonthTotals[monthIdx][year] = (yearMonthTotals[monthIdx][year] ?? 0) + s.amount;
    }
    return Array.from({ length: 12 }, (_, i) => {
      const key = String(i + 1).padStart(2, "0");
      return { month: key, label: MONTH_LABELS[i], ...(yearMonthTotals[key] ?? {}) };
    }).filter((d) => Object.keys(d).length > 2);
  }, [filtered, yoyMode]);

  const yoyYears = useMemo(() => {
    const years = new Set<string>();
    for (const s of filtered) years.add(s.month.slice(0, 4));
    return Array.from(years).sort();
  }, [filtered]);

  const gridData = useMemo(() => {
    const months = new Set<string>();
    const grid: Record<string, Record<string, {
      amount: number;
      new_amount: number;
      recurring_amount: number;
      refund_amount: number;
      deal_count: number;
      booked_calls: number;
      sale: RepSale | null;
      products: { product: string; amount: number; new_amount: number; recurring_amount: number; refund_amount: number; deal_count: number }[];
    }>> = {};
    for (const s of filtered) {
      months.add(s.month);
      if (!grid[s.month]) grid[s.month] = {};
      if (!grid[s.month][s.rep_name]) {
        grid[s.month][s.rep_name] = { amount: 0, new_amount: 0, recurring_amount: 0, refund_amount: 0, deal_count: 0, booked_calls: 0, sale: null, products: [] };
      }
      grid[s.month][s.rep_name].amount += s.amount;
      grid[s.month][s.rep_name].new_amount += (s.new_amount ?? 0);
      grid[s.month][s.rep_name].recurring_amount += (s.recurring_amount ?? 0);
      grid[s.month][s.rep_name].refund_amount += (s.refund_amount ?? 0);
      grid[s.month][s.rep_name].deal_count += s.deal_count;
      grid[s.month][s.rep_name].booked_calls = Math.max(grid[s.month][s.rep_name].booked_calls, s.booked_calls ?? 0);
      grid[s.month][s.rep_name].products.push({
        product: s.product,
        amount: s.amount,
        new_amount: s.new_amount ?? 0,
        recurring_amount: s.recurring_amount ?? 0,
        refund_amount: s.refund_amount ?? 0,
        deal_count: s.deal_count,
      });
      grid[s.month][s.rep_name].sale = s;
    }
    const sortedMonths = Array.from(months).sort().reverse();
    for (const m of sortedMonths) {
      if (!grid[m]) grid[m] = {};
      for (const r of visibleReps) {
        if (!grid[m][r]) grid[m][r] = { amount: 0, new_amount: 0, recurring_amount: 0, refund_amount: 0, deal_count: 0, booked_calls: 0, sale: null, products: [] };
      }
    }
    return { months: sortedMonths, grid };
  }, [filtered, visibleReps]);

  const stats = useMemo(() => {
    const empty = {
      total: 0, totalNew: 0, totalRecurring: 0, totalRefunds: 0, totalDeals: 0, totalBookedCalls: 0, closeRate: 0,
      avg: 0, bestMonth: "", bestAmount: 0,
      momGrowth: 0, momFrom: "", momTo: "",
      avgMomGrowth: 0, momCount: 0, hasMom: false,
    };
    if (filtered.length === 0) return empty;

    const total = filtered.reduce((sum, s) => sum + s.amount, 0);
    const totalNew = filtered.reduce((sum, s) => sum + (s.new_amount ?? 0), 0);
    const totalRecurring = filtered.reduce((sum, s) => sum + (s.recurring_amount ?? 0), 0);
    const totalRefunds = filtered.reduce((sum, s) => sum + (s.refund_amount ?? 0), 0);
    const totalDeals = filtered.reduce((sum, s) => sum + s.deal_count, 0);

    // Booked calls: deduplicate per rep+month (take max across products)
    const callsMap: Record<string, number> = {};
    for (const s of filtered) {
      const key = `${s.rep_name}|${s.month}`;
      callsMap[key] = Math.max(callsMap[key] ?? 0, s.booked_calls ?? 0);
    }
    const totalBookedCalls = Object.values(callsMap).reduce((sum, c) => sum + c, 0);
    const closeRate = totalBookedCalls > 0 ? (totalDeals / totalBookedCalls) * 100 : 0;

    const monthTotals: Record<string, number> = {};
    for (const s of filtered) {
      monthTotals[s.month] = (monthTotals[s.month] ?? 0) + s.amount;
    }
    const sortedMonths = Object.entries(monthTotals).sort(([a], [b]) => a.localeCompare(b));

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

    const hasMom = sortedMonths.length >= 2;
    return { total, totalNew, totalRecurring, totalRefunds, totalDeals, totalBookedCalls, closeRate, avg, bestMonth, bestAmount, momGrowth, momFrom, momTo, avgMomGrowth, momCount, hasMom };
  }, [filtered]);

  const repTotals = useMemo(() => {
    if (visibleReps.length <= 1 || filterRep) return [];
    const result: { name: string; total: number; avg: number; count: number; deals: number }[] = [];
    for (const r of visibleReps) {
      const repSales = filtered.filter((s) => s.rep_name === r);
      const total = repSales.reduce((sum, s) => sum + s.amount, 0);
      const deals = repSales.reduce((sum, s) => sum + s.deal_count, 0);
      const months = new Set(repSales.map((s) => s.month));
      result.push({ name: r, total, avg: months.size > 0 ? total / months.size : 0, count: months.size, deals });
    }
    return result.sort((a, b) => b.total - a.total);
  }, [filtered, visibleReps, filterRep]);

  const newRecChartData = useMemo(() => {
    if (!revenueTypeMode) return [];
    const monthMap: Record<string, { total: number; newRev: number; recurRev: number; refunds: number }> = {};
    for (const s of filtered) {
      if (!monthMap[s.month]) monthMap[s.month] = { total: 0, newRev: 0, recurRev: 0, refunds: 0 };
      monthMap[s.month].total += s.amount;
      monthMap[s.month].newRev += (s.new_amount ?? 0);
      monthMap[s.month].recurRev += (s.recurring_amount ?? 0);
      monthMap[s.month].refunds += (s.refund_amount ?? 0);
    }
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, label: formatMonth(month), Total: d.total, "New Revenue": d.newRev, "Recurring Revenue": d.recurRev, Refunds: d.refunds > 0 ? -d.refunds : 0 }));
  }, [filtered, revenueTypeMode]);

  const totalLabel = useMemo(() => {
    if (timeFrame === "all") return "Lifetime";
    if (timeFrame === "ytd") return "YTD";
    if (timeFrame === "custom") return "Range Total";
    return timeFrame;
  }, [timeFrame]);

  const handleUpsert = async (
    repName: string,
    product: string,
    month: string,
    amount: number,
    dealCount: number,
    newAmount?: number,
    recurringAmount?: number,
    bookedCalls?: number,
    refundAmount?: number,
    notes?: string
  ) => {
    const res = await fetch("/api/financials/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rep_name: repName,
        product,
        month,
        amount,
        deal_count: dealCount,
        new_amount: newAmount ?? 0,
        recurring_amount: recurringAmount ?? 0,
        booked_calls: bookedCalls ?? 0,
        refund_amount: refundAmount ?? 0,
        notes: notes ?? "",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[SalesView] upsert failed:", res.status, err);
    }
    await fetchSales();
  };

  const handleSetQuota = async (repName: string, month: string, targetAmount: number) => {
    const res = await fetch("/api/financials/quotas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rep_name: repName, month, target_amount: targetAmount }),
    });
    if (res.ok) await fetchQuotas();
  };

  const handleAddDeal = async (deal: { rep_name: string; product: string; client_name: string; amount: number; deal_date: string; notes?: string }) => {
    const res = await fetch("/api/financials/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deal),
    });
    if (res.ok) await fetchDeals();
  };

  const handleDeleteDeal = async (id: string) => {
    const res = await fetch(`/api/financials/deals/${id}`, { method: "DELETE" });
    if (res.ok) await fetchDeals();
  };

  const handleAddEntry = async () => {
    const repVal = newRepName === "__new__" ? "" : newRepName;
    const prodVal = newProduct === "__new__" ? "" : newProduct;
    const missing: string[] = [];
    if (!repVal) missing.push("Rep");
    if (!prodVal) missing.push("Product");
    if (!newMonth) missing.push("Month");
    if (!newAmount) missing.push("Amount");
    if (missing.length > 0) {
      setAddEntryError(`Required: ${missing.join(", ")}`);
      return;
    }
    setAddEntryError("");
    const na = parseFloat(newNewAmount) || 0;
    const ra = parseFloat(newRecurringAmount) || 0;
    const bc = parseInt(newBookedCalls, 10) || 0;
    const ref = parseFloat(newRefundAmount) || 0;
    await handleUpsert(
      repVal,
      prodVal,
      newMonth,
      parseFloat(newAmount),
      parseInt(newDealCount, 10) || 0,
      na,
      ra,
      bc,
      ref
    );
    setNewRepName("");
    setNewProduct("");
    setNewMonth("");
    setNewAmount("");
    setNewDealCount("");
    setNewNewAmount("");
    setNewRecurringAmount("");
    setNewBookedCalls("");
    setNewRefundAmount("");
    setShowAddEntry(false);
  };

  const handleCellSave = async (rep: string, month: string) => {
    const amount = parseFloat(editValue);
    if (isNaN(amount)) {
      setEditingCell(null);
      return;
    }
    const dealCount = parseInt(editDealCount, 10) || 0;
    const cell = gridData.grid[month]?.[rep];
    // Determine the correct product: use filter, or the single product if only one exists
    const product = filterProduct
      || (cell?.products.length === 1 ? cell.products[0].product : null)
      || data?.products?.[0]
      || "General";
    // Get sub-amounts from the specific product entry, not the aggregated cell totals
    const productEntry = cell?.products.find((p) => p.product === product);
    await handleUpsert(rep, product, month, amount, dealCount,
      productEntry?.new_amount, productEntry?.recurring_amount, cell?.booked_calls, productEntry?.refund_amount);
    setEditingCell(null);
  };

  const allReps = data?.reps ?? [];
  const allProducts = data?.products ?? [];
  const allSales = data?.sales ?? [];

  // Current period quota target (sum across all reps, or single rep if filtered)
  const currentQuotaTarget = useMemo(() => {
    if (quotas.length === 0) return null;
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const relevant = quotas.filter((q) => q.month === currentMonth && (!filterRep || q.rep_name === filterRep));
    if (relevant.length === 0) return null;
    return relevant.reduce((sum, q) => sum + q.target_amount, 0);
  }, [quotas, filterRep]);

  // Current month actual total (for quota progress)
  const currentMonthActual = useMemo(() => {
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    return filtered.filter((s) => s.month === currentMonth).reduce((sum, s) => sum + s.amount, 0);
  }, [filtered]);

  // Quota for single rep in chart (reference line)
  const chartQuotaTarget = useMemo(() => {
    if (!filterRep || quotas.length === 0) return null;
    const repQuotas = quotas.filter((q) => q.rep_name === filterRep);
    if (repQuotas.length === 0) return null;
    // Use average quota across months for the reference line
    return repQuotas.reduce((sum, q) => sum + q.target_amount, 0) / repQuotas.length;
  }, [quotas, filterRep]);

  // --- Monthly Report ---
  const latestMonth = useMemo(() => {
    if (!data) return "";
    const months = new Set<string>();
    for (const s of data.sales) months.add(s.month);
    const sorted = Array.from(months).sort();
    return sorted[sorted.length - 1] || "";
  }, [data]);

  const effectiveReportMonth = reportMonth || latestMonth;

  const reportData = useMemo(() => {
    if (!data || !effectiveReportMonth) return null;
    let reportSales = data.sales;
    if (filterRep) reportSales = reportSales.filter((s) => s.rep_name === filterRep);
    if (filterProduct) reportSales = reportSales.filter((s) => s.product === filterProduct);
    const monthSales = reportSales.filter((s) => s.month === effectiveReportMonth);
    if (monthSales.length === 0) return null;

    const repMap: Record<string, {
      newAmount: number; recurringAmount: number; refundAmount: number;
      amount: number; dealCount: number; bookedCalls: number;
      products: { product: string; newAmount: number; recurringAmount: number; refundAmount: number; amount: number; dealCount: number }[];
    }> = {};

    for (const s of monthSales) {
      if (!repMap[s.rep_name]) {
        repMap[s.rep_name] = { newAmount: 0, recurringAmount: 0, refundAmount: 0, amount: 0, dealCount: 0, bookedCalls: 0, products: [] };
      }
      const rep = repMap[s.rep_name];
      rep.newAmount += s.new_amount ?? 0;
      rep.recurringAmount += s.recurring_amount ?? 0;
      rep.refundAmount += s.refund_amount ?? 0;
      rep.amount += s.amount;
      rep.dealCount += s.deal_count;
      rep.bookedCalls = Math.max(rep.bookedCalls, s.booked_calls ?? 0);
      rep.products.push({
        product: s.product,
        newAmount: s.new_amount ?? 0,
        recurringAmount: s.recurring_amount ?? 0,
        refundAmount: s.refund_amount ?? 0,
        amount: s.amount,
        dealCount: s.deal_count,
      });
    }

    const reps = Object.entries(repMap)
      .map(([name, d]) => ({
        name,
        ...d,
        closeRate: d.bookedCalls > 0 ? (d.dealCount / d.bookedCalls) * 100 : 0,
        avgDealSize: d.dealCount > 0 ? d.newAmount / d.dealCount : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const totalAmount = reps.reduce((s, r) => s + r.amount, 0);
    const totalNew = reps.reduce((s, r) => s + r.newAmount, 0);
    const totalRecurring = reps.reduce((s, r) => s + r.recurringAmount, 0);
    const totalRefunds = reps.reduce((s, r) => s + r.refundAmount, 0);
    const totalDeals = reps.reduce((s, r) => s + r.dealCount, 0);
    const totalCalls = reps.reduce((s, r) => s + r.bookedCalls, 0);
    const totalCloseRate = totalCalls > 0 ? (totalDeals / totalCalls) * 100 : 0;
    const totalAvgDealSize = totalDeals > 0 ? totalNew / totalDeals : 0;

    return {
      reps,
      totals: {
        amount: totalAmount, newAmount: totalNew, recurringAmount: totalRecurring,
        refundAmount: totalRefunds, dealCount: totalDeals, bookedCalls: totalCalls,
        closeRate: totalCloseRate, avgDealSize: totalAvgDealSize,
      },
    };
  }, [data, effectiveReportMonth, filterRep, filterProduct]);

  // Trailing 12-month chart for report view
  const reportChartData = useMemo(() => {
    if (!data || !effectiveReportMonth) return [];
    // Build list of 12 months ending at effectiveReportMonth
    const [ey, em] = effectiveReportMonth.split("-").map(Number);
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ey, em - 1 - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      months.push(`${yyyy}-${mm}`);
    }
    // Aggregate total sales per month across all reps
    const monthTotals: Record<string, number> = {};
    for (const s of data.sales) {
      if (months.includes(s.month)) {
        monthTotals[s.month] = (monthTotals[s.month] ?? 0) + s.amount;
      }
    }
    return months.map((m) => ({
      month: m,
      label: formatMonth(m),
      total: monthTotals[m] ?? 0,
      isCurrent: m === effectiveReportMonth,
    }));
  }, [data, effectiveReportMonth]);

  // Computed highlights for the report month
  const reportHighlights = useMemo(() => {
    if (!data || !reportData || !effectiveReportMonth) return [];

    const highlights: { icon: "trophy" | "up" | "star"; text: string }[] = [];

    // Helper: get previous month string
    const [ey, em] = effectiveReportMonth.split("-").map(Number);
    const prevDate = new Date(ey, em - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    // Previous month per-rep data for comparisons
    const prevSales = data.sales.filter((s) => s.month === prevMonth);
    const prevRepMap: Record<string, { amount: number; dealCount: number; bookedCalls: number; newAmount: number }> = {};
    for (const s of prevSales) {
      if (!prevRepMap[s.rep_name]) prevRepMap[s.rep_name] = { amount: 0, dealCount: 0, bookedCalls: 0, newAmount: 0 };
      prevRepMap[s.rep_name].amount += s.amount;
      prevRepMap[s.rep_name].dealCount += s.deal_count;
      prevRepMap[s.rep_name].bookedCalls = Math.max(prevRepMap[s.rep_name].bookedCalls, s.booked_calls ?? 0);
      prevRepMap[s.rep_name].newAmount += s.new_amount ?? 0;
    }

    const reps = reportData.reps;
    if (reps.length === 0) return highlights;

    // 1. Top performer overall
    const topRep = reps[0]; // already sorted by amount desc
    if (reps.length > 1) {
      highlights.push({ icon: "trophy", text: `${topRep.name} led the team with ${fmtMoney(topRep.amount)} total revenue` });
    }

    // 2. Top performer per product
    const productLeaders: Record<string, { rep: string; amount: number }> = {};
    for (const rep of reps) {
      for (const p of rep.products) {
        if (!productLeaders[p.product] || p.amount > productLeaders[p.product].amount) {
          productLeaders[p.product] = { rep: rep.name, amount: p.amount };
        }
      }
    }
    for (const [product, leader] of Object.entries(productLeaders)) {
      if (leader.amount > 0 && reps.length > 1) {
        highlights.push({ icon: "star", text: `${leader.rep} had the highest ${product} revenue at ${fmtMoney(leader.amount)}` });
      }
    }

    // 3. Most new deals
    const topDeals = [...reps].sort((a, b) => b.dealCount - a.dealCount)[0];
    if (topDeals.dealCount > 0 && reps.length > 1) {
      highlights.push({ icon: "star", text: `${topDeals.name} closed the most new deals (${topDeals.dealCount})` });
    }

    // 4. Highest close rate (min 3 meetings to qualify)
    const qualifiedReps = reps.filter((r) => r.bookedCalls >= 3);
    if (qualifiedReps.length > 0) {
      const topClose = [...qualifiedReps].sort((a, b) => b.closeRate - a.closeRate)[0];
      if (topClose.closeRate > 0) {
        highlights.push({ icon: "trophy", text: `${topClose.name} had the best close rate at ${topClose.closeRate.toFixed(0)}%` });
      }
    }

    // 5. Close rate improvements vs last month
    for (const rep of reps) {
      const prev = prevRepMap[rep.name];
      if (prev && prev.bookedCalls >= 3 && rep.bookedCalls >= 3) {
        const prevRate = (prev.dealCount / prev.bookedCalls) * 100;
        const currRate = rep.closeRate;
        const diff = currRate - prevRate;
        if (diff >= 5) {
          highlights.push({ icon: "up", text: `${rep.name}'s close rate went from ${prevRate.toFixed(0)}% to ${currRate.toFixed(0)}%` });
        }
      }
    }

    // 6. Revenue growth vs last month per rep
    for (const rep of reps) {
      const prev = prevRepMap[rep.name];
      if (prev && prev.amount > 0) {
        const growth = ((rep.amount - prev.amount) / prev.amount) * 100;
        if (growth >= 20) {
          highlights.push({ icon: "up", text: `${rep.name}'s revenue was up ${growth.toFixed(0)}% from last month` });
        }
      }
    }

    // 7. Team record — best month in trailing 12
    const teamTotal = reportData.totals.amount;
    const trailing12 = reportChartData.filter((d) => !d.isCurrent);
    const maxPrior = Math.max(0, ...trailing12.map((d) => d.total));
    if (teamTotal > maxPrior && maxPrior > 0) {
      highlights.push({ icon: "trophy", text: `Team total of ${fmtMoney(teamTotal)} was the best month in the last 12` });
    }

    // 8. Highest avg deal size (min 2 deals)
    const qualifiedAvg = reps.filter((r) => r.dealCount >= 2);
    if (qualifiedAvg.length > 0 && reps.length > 1) {
      const topAvg = [...qualifiedAvg].sort((a, b) => b.avgDealSize - a.avgDealSize)[0];
      if (topAvg.avgDealSize > 0) {
        highlights.push({ icon: "star", text: `${topAvg.name} had the largest avg deal size at ${fmtMoney(topAvg.avgDealSize)}` });
      }
    }

    return highlights;
  }, [data, reportData, effectiveReportMonth, reportChartData]);

  // Projected annual based on YoY growth rate
  const projectionData = useMemo(() => {
    if (!data || !effectiveReportMonth || !reportData) return null;

    const [year, monthNum] = effectiveReportMonth.split("-").map(Number);
    const lastYear = year - 1;
    const currentMonthKey = effectiveReportMonth;
    const lastYearSameMonthKey = `${lastYear}-${String(monthNum).padStart(2, "0")}`;

    // Aggregate totals per month for current year and last year
    const monthTotals: Record<string, number> = {};
    for (const s of data.sales) {
      monthTotals[s.month] = (monthTotals[s.month] ?? 0) + s.amount;
    }

    const currentMonthTotal = monthTotals[currentMonthKey] ?? 0;
    const lastYearSameMonthTotal = monthTotals[lastYearSameMonthKey] ?? 0;

    // Can't project without last year's baseline
    if (lastYearSameMonthTotal <= 0) return null;

    const growthRate = (currentMonthTotal - lastYearSameMonthTotal) / lastYearSameMonthTotal;

    // Build month-by-month projection for the full year
    const months: { month: string; label: string; actual: number | null; projected: number | null; isActual: boolean }[] = [];
    let actualYTD = 0;
    let projectedRemaining = 0;

    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      const lastYearKey = `${lastYear}-${String(m).padStart(2, "0")}`;
      const actual = monthTotals[key] ?? 0;
      const lastYearActual = monthTotals[lastYearKey] ?? 0;
      const hasActual = m <= monthNum && actual > 0;

      if (hasActual) {
        months.push({
          month: key,
          label: formatMonth(key),
          actual,
          projected: null,
          isActual: true,
        });
        actualYTD += actual;
      } else {
        const proj = lastYearActual > 0 ? lastYearActual * (1 + growthRate) : 0;
        months.push({
          month: key,
          label: formatMonth(key),
          actual: null,
          projected: Math.round(proj),
          isActual: false,
        });
        projectedRemaining += Math.round(proj);
      }
    }

    // Last year's annual total for comparison
    let lastYearAnnual = 0;
    for (let m = 1; m <= 12; m++) {
      const key = `${lastYear}-${String(m).padStart(2, "0")}`;
      lastYearAnnual += monthTotals[key] ?? 0;
    }

    return {
      growthRate,
      growthPct: growthRate * 100,
      currentMonthTotal,
      lastYearSameMonthTotal,
      months,
      actualYTD,
      projectedRemaining,
      projectedAnnual: actualYTD + projectedRemaining,
      lastYearAnnual,
      annualGrowth: lastYearAnnual > 0 ? ((actualYTD + projectedRemaining - lastYearAnnual) / lastYearAnnual) * 100 : 0,
    };
  }, [data, effectiveReportMonth, reportData]);

  // Rep profile sub-view
  if (selectedRep) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <RepProfileView
            repName={selectedRep}
            allSales={allSales}
            allProducts={allProducts}
            onBack={() => setSelectedRep(null)}
            onUpsert={handleUpsert}
            fetchSales={fetchSales}
            quotas={quotas}
            onSetQuota={handleSetQuota}
            deals={deals}
            onAddDeal={handleAddDeal}
            onDeleteDeal={handleDeleteDeal}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sales performance by rep</p>
          </div>
          <button
            onClick={() => setManageRepsOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Manage Reps
          </button>
        </div>

        {/* Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={filterRep}
            onChange={(e) => setFilterRep(e.target.value)}
            className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground"
          >
            <option value="">All Reps</option>
            {allReps.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

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

          <button
            onClick={() => {
              const next = !yoyMode;
              setYoyMode(next);
              if (next) setTimeFrame("all");
            }}
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

          <button
            onClick={() => setShowMonthlyReport(!showMonthlyReport)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              showMonthlyReport
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <FileText className="h-3 w-3" />
            Monthly Report
          </button>

          {showMonthlyReport && (
            <input
              type="month"
              value={effectiveReportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="h-7 rounded-md border border-input bg-secondary px-2 text-[10px] text-foreground [color-scheme:dark]"
            />
          )}

          <button
            onClick={() => {
              const rows = filtered.map((s) => [
                s.rep_name, s.month, s.product,
                s.amount, s.new_amount ?? 0, s.recurring_amount ?? 0,
                s.refund_amount ?? 0, s.deal_count, s.booked_calls ?? 0, s.notes ?? "",
              ]);
              const header = "rep_name,month,product,amount,new_amount,recurring_amount,refund_amount,deal_count,booked_calls,notes";
              const csv = [header, ...rows.map((r) => r.map((v) => typeof v === "string" && (v.includes(",") || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v).join(","))].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
            title="Export CSV"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
        </div>

        {showMonthlyReport ? (
          <div className="mb-6">
            {/* Report Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {effectiveReportMonth ? (() => {
                    const [y, m] = effectiveReportMonth.split("-");
                    const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                    return `${names[parseInt(m, 10) - 1]} ${y}`;
                  })() : "Monthly"} — Sales Report
                </h2>
                {(filterRep || filterProduct) && (
                  <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                    Filtered{filterRep ? `: ${filterRep}` : ""}{filterProduct ? `${filterRep ? ", " : ": "}${filterProduct}` : ""}
                  </span>
                )}
              </div>
              {reportHighlights.length > 0 && (
                <button
                  onClick={() => setShowHighlights(!showHighlights)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    showHighlights
                      ? "bg-amber-400/10 text-amber-400"
                      : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <Trophy className="h-3 w-3" />
                  Highlights
                </button>
              )}
            </div>

            {/* Trailing 12-Month Bar Chart */}
            {reportChartData.length > 0 && (
              <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reportChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                    <Bar dataKey="total" name="Total Sales" radius={[4, 4, 0, 0]}>
                      {reportChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isCurrent ? "#22c55e" : "#6366f1"} fillOpacity={entry.isCurrent ? 0.9 : 0.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Team Totals */}
            {reportData && (
              <div className="mb-6 rounded-lg border border-white/[0.06] bg-white/[0.03] p-5">
                <div className="mb-4 flex items-baseline justify-between">
                  <h3 className="text-base font-bold text-white/90">Team Total</h3>
                  <span className="font-mono text-2xl font-bold text-emerald-400">{fmtMoney(reportData.totals.amount)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">New Rev</span>
                    <p className="font-mono text-sm font-semibold text-white/80">{fmtMoney(reportData.totals.newAmount)}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">New Deals</span>
                    <p className="text-sm font-semibold text-white/80">{reportData.totals.dealCount}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Meetings</span>
                    <p className="text-sm font-semibold text-white/80">{reportData.totals.bookedCalls}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Close %</span>
                    <p className="text-sm font-semibold text-amber-400">
                      {reportData.totals.bookedCalls > 0
                        ? `${reportData.totals.closeRate.toFixed(0)}%`
                        : "\u2014"}
                    </p>
                    {reportData.totals.bookedCalls > 0 && (
                      <p className="text-[10px] text-white/25">{reportData.totals.dealCount} / {reportData.totals.bookedCalls} meetings</p>
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Avg Deal</span>
                    <p className="font-mono text-sm font-semibold text-white/80">
                      {reportData.totals.dealCount > 0 ? fmtMoney(reportData.totals.avgDealSize) : "\u2014"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Highlights */}
            {showHighlights && reportHighlights.length > 0 && (
              <div className="mb-6 rounded-lg border border-amber-400/10 bg-amber-400/[0.03] px-5 py-4">
                <div className="space-y-2">
                  {reportHighlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      {h.icon === "trophy" ? (
                        <Trophy className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                      ) : h.icon === "star" ? (
                        <Star className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
                      ) : h.icon === "up" ? (
                        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                      ) : (
                        <Trophy className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-white/20" />
                      )}
                      <span className="text-[13px] text-white/70">{h.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rep Cards */}
            {reportData ? (
              <>
                <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {reportData.reps.map((rep) => (
                    <div key={rep.name} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-5">
                      {/* Rep name + total */}
                      <div className="mb-4 flex items-baseline justify-between">
                        <h3 className="text-base font-semibold text-white/90">{rep.name}</h3>
                        <span className="font-mono text-2xl font-bold text-emerald-400">{fmtMoney(rep.amount)}</span>
                      </div>
                      {/* Key metrics */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">New Rev</span>
                          <p className="font-mono text-sm font-semibold text-white/80">{fmtMoney(rep.newAmount)}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">New Deals</span>
                          <p className="text-sm font-semibold text-white/80">{rep.dealCount}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Meetings</span>
                          <p className="text-sm font-semibold text-white/80">{rep.bookedCalls || "\u2014"}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Close %</span>
                          <p className="text-sm font-semibold text-amber-400">
                            {rep.bookedCalls > 0 ? `${rep.closeRate.toFixed(0)}%` : "\u2014"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Avg Deal</span>
                          <p className="font-mono text-sm font-semibold text-white/80">
                            {rep.dealCount > 0 ? fmtMoney(rep.avgDealSize) : "\u2014"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-white/[0.06] px-4 py-12 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-white/10" />
                <p className="text-sm text-white/30">No sales data for this month</p>
              </div>
            )}

            {/* Projected Annual */}
            {projectionData && (
              <div className="mt-6">
                <div className="mb-4 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-white/70">
                    Projected {effectiveReportMonth.split("-")[0]} Annual
                    <span className="ml-2 text-[11px] font-normal text-white/30">
                      based on {projectionData.growthPct >= 0 ? "+" : ""}{projectionData.growthPct.toFixed(0)}% YoY growth
                    </span>
                  </h3>
                  <span className="font-mono text-xl font-bold text-emerald-400/70">{fmtMoney(projectionData.projectedAnnual)}</span>
                </div>

                {/* Projection chart — actual bars + projected bars */}
                <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={projectionData.months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => value ? fmtMoney(Number(value)) : "\u2014"} />
                      <Bar dataKey="actual" name="Actual" fill="#22c55e" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="projected" name="Projected" fill="#22c55e" fillOpacity={0.25} radius={[4, 4, 0, 0]} strokeDasharray="4 2" stroke="#22c55e" strokeOpacity={0.4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Actual YTD</span>
                    <p className="font-mono text-sm font-semibold text-white/80">{fmtMoney(projectionData.actualYTD)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Projected Remaining</span>
                    <p className="font-mono text-sm font-semibold text-white/40">{fmtMoney(projectionData.projectedRemaining)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">Last Year Total</span>
                    <p className="font-mono text-sm font-semibold text-white/50">{fmtMoney(projectionData.lastYearAnnual)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-white/30">vs Last Year</span>
                    <p className={cn("text-sm font-semibold", projectionData.annualGrowth >= 0 ? "text-emerald-400/70" : "text-red-400/70")}>
                      {projectionData.annualGrowth >= 0 ? "+" : ""}{projectionData.annualGrowth.toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (<>
        {/* Charts */}
        {(revenueTypeMode ? newRecChartData : yoyMode ? yoyChartData : chartData).length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {yoyMode ? "Year-over-Year Comparison" : revenueTypeMode ? "New vs Recurring Revenue" : "Sales Trends"}
                {filterRep && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({filterRep})</span>
                )}
              </h2>
              {!yoyMode && (
                <div className="flex gap-1">
                  <button
                    onClick={() => { setRevenueTypeMode(false); setChartType("line"); }}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] transition-colors",
                      !revenueTypeMode && chartType === "line" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => { setRevenueTypeMode(false); setChartType("bar"); }}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] transition-colors",
                      !revenueTypeMode && chartType === "bar" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Stacked Bar
                  </button>
                  <button
                    onClick={() => setRevenueTypeMode(!revenueTypeMode)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] transition-colors",
                      revenueTypeMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    New vs Recurring
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/50 bg-card/40 p-4">
              <ResponsiveContainer width="100%" height={280}>
                {revenueTypeMode ? (
                  <LineChart data={newRecChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                    <Line type="monotone" dataKey="Total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="New Revenue" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Recurring Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Refunds" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="4 2" />
                  </LineChart>
                ) : yoyMode ? (
                  <LineChart data={yoyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                    {visibleReps.map((rep, i) => (
                      <Line key={rep} type="monotone" dataKey={rep} stroke={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                    {chartQuotaTarget && (
                      <ReferenceLine y={chartQuotaTarget} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Target: ${fmtMoney(chartQuotaTarget)}`, position: "right", fill: "#f59e0b", fontSize: 10 }} />
                    )}
                  </LineChart>
                ) : (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)" }} labelStyle={{ color: "rgba(255,255,255,0.6)" }} itemStyle={{ color: "rgba(255,255,255,0.85)" }} formatter={(value) => fmtMoney(Number(value ?? 0))} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                    {visibleReps.map((rep, i) => (
                      <Bar key={rep} dataKey={rep} stackId="sales" fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} radius={i === visibleReps.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {filtered.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">{totalLabel} Sales</span>
              <p className={cn("text-lg font-semibold", stats.total >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(stats.total)}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">Monthly Avg</span>
              <p className="text-lg font-semibold text-foreground">{fmtMoney(stats.avg)}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">Best Month</span>
              <p className="text-lg font-semibold text-foreground">{fmtMoney(stats.bestAmount)}</p>
              {stats.bestMonth && (
                <p className="text-[10px] text-muted-foreground/50">{formatMonth(stats.bestMonth)}</p>
              )}
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">Latest MoM</span>
              {stats.hasMom ? (
                <>
                  <p className={cn("flex items-center gap-1 text-lg font-semibold", stats.momGrowth >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {stats.momGrowth >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {Math.abs(stats.momGrowth).toFixed(1)}%
                  </p>
                  {stats.momFrom && (
                    <p className="text-[10px] text-muted-foreground/50">{formatMonth(stats.momFrom)} &rarr; {formatMonth(stats.momTo)}</p>
                  )}
                </>
              ) : (
                <p className="text-lg font-semibold text-muted-foreground">---</p>
              )}
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">Revenue Split</span>
              {(stats.totalNew > 0 || stats.totalRecurring > 0 || stats.totalRefunds > 0) ? (
                <>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="text-emerald-400">{fmtMoney(stats.totalNew)} new</span>
                    <span className="text-muted-foreground/40">+</span>
                    <span className="text-blue-400">{fmtMoney(stats.totalRecurring)} recurring</span>
                    {stats.totalRefunds > 0 && (
                      <>
                        <span className="text-red-400/60">&minus;</span>
                        <span className="text-red-400">{fmtMoney(stats.totalRefunds)} refunds</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    {stats.totalNew > 0 && (
                      <div className="h-full bg-emerald-400" style={{ width: `${(stats.totalNew / (stats.totalNew + stats.totalRecurring)) * 100}%` }} />
                    )}
                    {stats.totalRecurring > 0 && (
                      <div className="h-full bg-blue-400" style={{ width: `${(stats.totalRecurring / (stats.totalNew + stats.totalRecurring)) * 100}%` }} />
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground/50">No split data</p>
              )}
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <span className="text-[10px] text-muted-foreground">Close Rate</span>
              <p className={cn("text-lg font-semibold", stats.closeRate > 0 ? "text-amber-400" : "text-foreground")}>
                {stats.totalBookedCalls > 0 ? `${stats.closeRate.toFixed(1)}%` : "---"}
              </p>
              {stats.totalBookedCalls > 0 && (
                <p className="text-[10px] text-muted-foreground/50">
                  {stats.totalDeals} new deals from {stats.totalBookedCalls} meetings
                </p>
              )}
            </div>
          </div>
        )}

        {/* Quota Progress */}
        {currentQuotaTarget && currentQuotaTarget > 0 && (
          <div className="mb-6 rounded-lg border border-border/50 bg-card/40 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Current Month Target
              </span>
              <span className="text-xs text-muted-foreground">
                {fmtMoney(currentMonthActual)} / {fmtMoney(currentQuotaTarget)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full transition-all", currentMonthActual >= currentQuotaTarget ? "bg-emerald-400" : "bg-primary")}
                style={{ width: `${Math.min(100, (currentMonthActual / currentQuotaTarget) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/50">
              {((currentMonthActual / currentQuotaTarget) * 100).toFixed(0)}% of target
              {currentMonthActual >= currentQuotaTarget && " — Target reached!"}
            </p>
          </div>
        )}

        {/* Per-rep breakdown */}
        {filtered.length > 0 && visibleReps.length > 1 && !filterRep && (
          <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground">Sales by Rep</h3>
            <div className="space-y-2.5">
              {(() => {
                const maxTotal = Math.max(1, ...repTotals.map((r) => r.total));
                return repTotals.map((rt) => {
                  const pct = stats.total > 0 ? (rt.total / stats.total) * 100 : 0;
                  const color = PRODUCT_COLORS[visibleReps.indexOf(rt.name) % PRODUCT_COLORS.length];
                  return (
                    <div key={rt.name}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <button
                            onClick={() => setSelectedRep(rt.name)}
                            className="text-xs font-medium hover:text-primary hover:underline"
                          >
                            {rt.name}
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground/50">{pct.toFixed(1)}%</span>
                          <span className="text-[10px] text-muted-foreground/50">{rt.deals} new deal{rt.deals !== 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-muted-foreground/50">avg {fmtMoney(rt.avg)}/mo</span>
                          <span className="font-mono text-sm font-semibold text-foreground">{fmtMoney(rt.total)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openDrillDown(rt.name); }}
                            className="text-[10px] text-primary/60 hover:text-primary hover:underline"
                          >
                            View
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(rt.total / maxTotal) * 100}%`, backgroundColor: color, opacity: 0.6 }}
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
            <h2 className="text-sm font-semibold">Monthly Sales</h2>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddEntry(!showAddEntry); setAddEntryError(""); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Entry
            </Button>
          </div>

          {/* Quick-add form */}
          {showAddEntry && (
            <div
              className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card/40 p-3"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddEntry(); } }}
            >
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-muted-foreground">Rep</label>
                {allReps.length > 0 && newRepName !== "__new__" ? (
                  <select
                    value={newRepName}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setNewRepName("__new__");
                      else setNewRepName(e.target.value);
                    }}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  >
                    <option value="">Select rep...</option>
                    {allReps.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                    <option value="__new__">+ Add new...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={newRepName === "__new__" ? "" : newRepName}
                      onChange={(e) => setNewRepName(e.target.value || (allReps.length > 0 ? "__new__" : ""))}
                      placeholder="e.g., John Smith"
                      className="h-8 text-xs"
                    />
                    {allReps.length > 0 && (
                      <button onClick={() => setNewRepName("")} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-muted-foreground">Product</label>
                {allProducts.length > 0 && newProduct !== "__new__" ? (
                  <select
                    value={newProduct}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setNewProduct("__new__");
                      else setNewProduct(e.target.value);
                    }}
                    className="h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
                  >
                    <option value="">Select product...</option>
                    {allProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="__new__">+ Add new...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={newProduct === "__new__" ? "" : newProduct}
                      onChange={(e) => setNewProduct(e.target.value || (allProducts.length > 0 ? "__new__" : ""))}
                      placeholder="e.g., Elite"
                      className="h-8 text-xs"
                    />
                    {allProducts.length > 0 && (
                      <button onClick={() => setNewProduct("")} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Month</label>
                <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">New Rev</label>
                <Input
                  type="number" step="0.01" value={newNewAmount}
                  onChange={(e) => {
                    setNewNewAmount(e.target.value);
                    const na = parseFloat(e.target.value) || 0;
                    const ra = parseFloat(newRecurringAmount) || 0;
                    const ref = parseFloat(newRefundAmount) || 0;
                    setNewAmount((na + ra - ref).toString());
                  }}
                  placeholder="0" className="h-8 w-24 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Recurring Rev</label>
                <Input
                  type="number" step="0.01" value={newRecurringAmount}
                  onChange={(e) => {
                    setNewRecurringAmount(e.target.value);
                    const na = parseFloat(newNewAmount) || 0;
                    const ra = parseFloat(e.target.value) || 0;
                    const ref = parseFloat(newRefundAmount) || 0;
                    setNewAmount((na + ra - ref).toString());
                  }}
                  placeholder="0" className="h-8 w-24 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-red-400/70">Refund</label>
                <Input
                  type="number" step="0.01" min="0" value={newRefundAmount}
                  onChange={(e) => {
                    setNewRefundAmount(e.target.value);
                    const na = parseFloat(newNewAmount) || 0;
                    const ra = parseFloat(newRecurringAmount) || 0;
                    const ref = parseFloat(e.target.value) || 0;
                    setNewAmount((na + ra - ref).toString());
                  }}
                  placeholder="0" className="h-8 w-24 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Total Amount</label>
                <Input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" className="h-8 w-28 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">New Deals</label>
                <Input type="number" step="1" min="0" value={newDealCount} onChange={(e) => setNewDealCount(e.target.value)} placeholder="0" className="h-8 w-20 text-xs" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground">Meetings</label>
                <Input type="number" step="1" min="0" value={newBookedCalls} onChange={(e) => setNewBookedCalls(e.target.value)} placeholder="0" className="h-8 w-20 text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleAddEntry}>
                Save
              </Button>
              {addEntryError && (
                <p className="w-full text-[11px] text-red-400">{addEntryError}</p>
              )}
            </div>
          )}

          {/* Grid table */}
          {visibleReps.length > 0 && gridData.months.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-card/30">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground">Month</th>
                    {visibleReps.map((r, i) => (
                      <th key={r} className="px-3 py-2 text-right text-[10px] font-semibold" style={{ color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>
                        <button onClick={() => setSelectedRep(r)} className="hover:underline">{r}</button>
                      </th>
                    ))}
                    {visibleReps.length > 1 && (
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground">Total</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {gridData.months.map((month) => {
                    const row = gridData.grid[month] ?? {};
                    const rowTotal = Object.values(row).reduce((sum, cell) => sum + (cell?.amount ?? 0), 0);
                    const expandedRep = visibleReps.find((r) => expandedCell === `${month}-${r}`);
                    const expandedProducts = expandedRep
                      ? (row[expandedRep]?.products ?? []).sort((a, b) => b.amount - a.amount)
                      : [];

                    return (
                      <Fragment key={month}>
                        <tr className="border-b border-border/10 transition-colors hover:bg-card/20">
                          <td className="px-3 py-2 text-xs font-medium">{formatMonth(month)}</td>
                          {visibleReps.map((r) => {
                            const cellKey = `${month}-${r}`;
                            const cell = row[r];
                            const isEditing = editingCell === cellKey;
                            const isExpanded = expandedCell === cellKey;
                            const hasData = cell && (cell.amount !== 0 || cell.deal_count > 0);

                            return (
                              <td key={r} className="px-3 py-1.5 text-right">
                                {isEditing ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <input
                                      type="number"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleCellSave(r, month);
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                      className="h-6 w-24 rounded border border-input bg-secondary px-1 text-right text-xs text-foreground"
                                      autoFocus
                                      placeholder="Amount"
                                    />
                                    <input
                                      type="number"
                                      value={editDealCount}
                                      onChange={(e) => setEditDealCount(e.target.value)}
                                      onBlur={() => handleCellSave(r, month)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleCellSave(r, month);
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                      className="h-5 w-16 rounded border border-input bg-secondary px-1 text-right text-[10px] text-foreground"
                                      placeholder="New deals"
                                    />
                                  </div>
                                ) : (
                                  <div className="relative flex items-center justify-end gap-1">
                                    {hasData && cell.products.length > 1 && (
                                      <button
                                        onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                                        className={cn("rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-foreground/70", isExpanded && "text-primary")}
                                        title="View product breakdown"
                                      >
                                        <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        if (!filterProduct && cell && cell.products.length > 1) {
                                          setEditGuardCell(cellKey);
                                          setTimeout(() => setEditGuardCell(null), 2500);
                                          return;
                                        }
                                        setEditingCell(cellKey);
                                        setEditValue(cell && cell.amount !== 0 ? cell.amount.toString() : "0");
                                        setEditDealCount(cell && cell.deal_count > 0 ? cell.deal_count.toString() : "0");
                                      }}
                                      className="rounded px-1 py-0.5 text-xs font-mono text-foreground/80 hover:bg-secondary"
                                    >
                                      {hasData ? (
                                        <div>
                                          <div className={cell.amount < 0 ? "text-red-400" : ""}>
                                            {fmtMoney(cell.amount)}
                                          </div>
                                          {cell.deal_count > 0 && (
                                            <div className="text-[10px] text-muted-foreground/50">
                                              ({cell.deal_count} new deal{cell.deal_count !== 1 ? "s" : ""})
                                            </div>
                                          )}
                                          {cell.booked_calls > 0 && (
                                            <div className="text-[10px] text-muted-foreground/50">
                                              {cell.booked_calls} meetings &middot; {cell.deal_count > 0 && cell.booked_calls > 0
                                                ? `${((cell.deal_count / cell.booked_calls) * 100).toFixed(0)}% close`
                                                : "0% close"}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        "---"
                                      )}
                                    </button>
                                    {editGuardCell === cellKey && (
                                      <span className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-amber-500/90 px-2 py-1 text-[10px] font-medium text-black shadow-lg">
                                        Filter by product to edit
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          {visibleReps.length > 1 && (
                            <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground">
                              {fmtMoney(rowTotal)}
                            </td>
                          )}
                        </tr>
                        {/* Expanded product breakdown row */}
                        {expandedRep && expandedProducts.length > 0 && (
                          <tr className="border-b border-border/10 bg-card/30">
                            <td colSpan={visibleReps.length + 1 + (visibleReps.length > 1 ? 1 : 0)} className="px-4 py-2.5">
                              <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                                {expandedRep} — {formatMonth(month)} Breakdown
                              </div>
                              <div className="space-y-1">
                                {expandedProducts.map((p) => {
                                  const maxAmt = Math.max(1, ...expandedProducts.map((x) => Math.abs(x.amount)));
                                  const barWidth = Math.abs(p.amount) / maxAmt * 100;
                                  const hasRevSplit = (p.new_amount > 0 || p.recurring_amount > 0 || p.refund_amount > 0);
                                  return (
                                    <div key={p.product}>
                                      <div className="flex items-center gap-3">
                                        <span className="w-28 truncate text-xs font-medium">{p.product}</span>
                                        <div className="flex-1">
                                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                            <div
                                              className="h-full rounded-full transition-all"
                                              style={{ width: `${barWidth}%`, backgroundColor: p.amount < 0 ? "#ef4444" : "#6366f1", opacity: 0.6 }}
                                            />
                                          </div>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground/50">
                                          {p.deal_count} new deal{p.deal_count !== 1 ? "s" : ""}
                                        </span>
                                        <span className={cn("w-20 text-right font-mono text-xs font-semibold", p.amount < 0 ? "text-red-400" : "text-foreground")}>
                                          {fmtMoney(p.amount)}
                                        </span>
                                      </div>
                                      {hasRevSplit && (
                                        <div className="ml-[7.5rem] mt-0.5 text-[10px] text-muted-foreground/50">
                                          New: {fmtMoney(p.new_amount)} + Recurring: {fmtMoney(p.recurring_amount)}
                                          {p.refund_amount > 0 && <span className="text-red-400"> &minus; Refunds: {fmtMoney(p.refund_amount)}</span>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/50 px-4 py-12 text-center">
              <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/50">
                {data && data.sales.length > 0 ? "No sales data for this filter" : "No sales data yet"}
              </p>
              {(!data || data.sales.length === 0) && (
                <button onClick={() => setShowAddEntry(true)} className="mt-2 text-xs text-primary hover:underline">
                  Add your first sales entry
                </button>
              )}
            </div>
          )}
        </div>
        </>)}
      </div>

      {/* Rep Charges Drill-Down Modal */}
      {drillDownRep && (
        <RepChargesModal
          repId={drillDownRep.id}
          repName={drillDownRep.name}
          month={drillDownRep.month}
          onClose={() => setDrillDownRep(null)}
        />
      )}

      <ManageReps
        open={manageRepsOpen}
        onClose={() => setManageRepsOpen(false)}
      />
    </div>
  );
}
