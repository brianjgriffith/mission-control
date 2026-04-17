"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  type Student,
  type StudentProgram,
  type StudentStatus,
  type PaymentPlan,
  type ChurnEvent,
  type ChurnType,
  type EliteSession,
  type EliteAttendance,
  type SessionType,
  type CapacityForecast,
  type CapacityProjection,
  type CoachCapacityDetail,
  type CoachStatus,
  type MrrMonth,
  type MrrHistoryResponse,
  STUDENT_PROGRAM_CONFIG,
  STUDENT_STATUS_CONFIG,
  CHURN_TYPE_CONFIG,
  PAYMENT_PLAN_CONFIG,
  COACH_STATUS_CONFIG,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Search,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  PercentIcon,
  DollarSign,
  Youtube,
  ExternalLink,
  ClipboardList,
  BarChart3,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Gauge,
  AlertTriangle,
  Clock,
  Info,
  ArrowRightLeft,
  Repeat2,
  PauseCircle,
  StickyNote,
  Download,
  Mail,
  Calendar,
  CreditCard,
  ShieldAlert,
} from "lucide-react";
import { EnrollmentQuality } from "@/components/enrollment-quality";
import { format, parseISO, subMonths } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  Legend,
  LineChart,
  Line,
} from "recharts";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

type StudentTab = "roster" | "coaches" | "churn" | "attendance" | "capacity" | "revenue";

const TABS: { id: StudentTab; label: string; icon: typeof Users }[] = [
  { id: "roster", label: "Roster", icon: Users },
  { id: "coaches", label: "Coaches", icon: BarChart3 },
  { id: "churn", label: "Churn", icon: TrendingDown },
  { id: "attendance", label: "Attendance", icon: ClipboardList },
  { id: "capacity", label: "Capacity", icon: Gauge },
  { id: "revenue", label: "Revenue", icon: DollarSign },
];

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

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatRangeLabel(start: string, end: string): string {
  return `${formatMonth(start)} – ${formatMonth(end)}`;
}

function getPresetRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  switch (preset) {
    case "last-quarter": {
      const s = subMonths(now, 3);
      const e = subMonths(now, 1);
      return {
        start: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`,
        end: `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`,
      };
    }
    case "last-year": {
      return { start: `${now.getFullYear() - 1}-01`, end: `${now.getFullYear() - 1}-12` };
    }
    case "ytd": {
      return { start: `${now.getFullYear()}-01`, end: cur };
    }
    case "last-6": {
      const s = subMonths(now, 5);
      return {
        start: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`,
        end: cur,
      };
    }
    case "last-12": {
      const s = subMonths(now, 11);
      return {
        start: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`,
        end: cur,
      };
    }
    case "all-time": {
      return { start: "2020-01", end: cur };
    }
    default:
      return { start: cur, end: cur };
  }
}

const COACH_COLORS: Record<string, string> = {
  Caleb: "#89b4fa",
  Alex: "#cba6f7",
  Sam: "#a6e3a1",
  Melody: "#f9e2af",
  Molly: "#f38ba8",
  Nathan: "#fab387",
};

const COLOR_PALETTE = [
  "#89b4fa", "#cba6f7", "#a6e3a1", "#f9e2af", "#f38ba8",
  "#fab387", "#94e2d5", "#f5c2e7", "#89dceb", "#eba0ac",
];

function getCoachColor(coach: string): string {
  if (COACH_COLORS[coach]) return COACH_COLORS[coach];
  let hash = 0;
  for (let i = 0; i < coach.length; i++) hash = hash * 31 + coach.charCodeAt(i);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Metric Card with info tooltip
// ---------------------------------------------------------------------------

function MetricCard({
  value,
  valueColor,
  label,
  sublabel,
  description,
}: {
  value: string;
  valueColor?: string;
  label: string;
  sublabel?: string;
  description: string;
}) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="group relative rounded-lg border border-border/50 bg-card/40 p-3 text-center">
      {/* Info icon */}
      <button
        onClick={() => setShowInfo((v) => !v)}
        className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground/70"
        aria-label={`Info: ${label}`}
      >
        <Info className="h-3 w-3" />
      </button>

      {/* Card content */}
      <div className={cn("text-lg font-bold", valueColor || "text-foreground")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      {sublabel && <div className="text-[10px] text-muted-foreground">{sublabel}</div>}

      {/* Description popover */}
      {showInfo && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowInfo(false)} />
          <div className="absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-left shadow-lg">
            <div className="mb-1 text-[11px] font-semibold text-foreground">{label}</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentsView() {
  const [activeTab, setActiveTab] = useState<StudentTab>("roster");
  const [qualityPanelOpen, setQualityPanelOpen] = useState(false);
  const [qualityCount, setQualityCount] = useState(0);

  // Fetch data quality count on mount
  useEffect(() => {
    fetch("/api/students/data-quality")
      .then((r) => r.json())
      .then((d) => {
        const count =
          (d.pending_cancellations?.length || 0) +
          (d.unclassified?.length || 0) +
          (d.status_mismatches?.length || 0);
        setQualityCount(count);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === "roster" && "Student roster & management"}
              {activeTab === "coaches" && "Coach breakdown & performance"}
              {activeTab === "churn" && "Monthly churn tracking"}
              {activeTab === "attendance" && "Elite session attendance"}
              {activeTab === "capacity" && "Capacity planning & hire forecasting"}
              {activeTab === "revenue" && "MRR trends, projections & scenario modeling"}
            </p>
          </div>
          {qualityCount > 0 && (
            <button
              onClick={() => setQualityPanelOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {qualityCount} data quality {qualityCount === 1 ? "item" : "items"}
            </button>
          )}
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
        {activeTab === "roster" && <RosterTab />}
        {activeTab === "coaches" && <CoachesTab />}
        {activeTab === "churn" && <ChurnTab />}
        {activeTab === "attendance" && <AttendanceTab />}
        {activeTab === "capacity" && <CapacityTab />}
        {activeTab === "revenue" && <RevenueTab />}
      </div>

      {/* Enrollment Data Quality Panel */}
      <EnrollmentQuality
        open={qualityPanelOpen}
        onClose={() => setQualityPanelOpen(false)}
        onUpdated={() => {
          // Re-fetch quality count
          fetch("/api/students/data-quality")
            .then((r) => r.json())
            .then((d) => {
              const count =
                (d.pending_cancellations?.length || 0) +
                (d.unclassified?.length || 0) +
                (d.status_mismatches?.length || 0);
              setQualityCount(count);
            })
            .catch(() => {});
        }}
      />
    </div>
  );
}

// ===========================================================================
// Sort Header
// ===========================================================================

function SortHeader({
  field,
  label,
  sortBy,
  sortDir,
  onSort,
  align = "left",
}: {
  field: SortField;
  label: string;
  sortBy: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === field;
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider select-none cursor-pointer transition-colors hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
        active ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          sortDir === "asc"
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        )}
      </span>
    </th>
  );
}

// ===========================================================================
// Roster Tab
// ===========================================================================

type SortField = "name" | "program" | "coach" | "monthly_revenue" | "signup_date" | "status";
type SortDir = "asc" | "desc";

function RosterTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProgram, setFilterProgram] = useState<StudentProgram | "">("");
  const [filterStatus, setFilterStatus] = useState<StudentStatus | "">("");
  const [filterCoach, setFilterCoach] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [filterMemberType, setFilterMemberType] = useState<"" | "student" | "partner">("");

  // Sort state
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Export menu state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(["paused", "downgraded", "cancelled"])
  );

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "monthly_revenue" ? "desc" : "asc");
    }
  };

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Confirm archive
  const [archivingId, setArchivingId] = useState<string | null>(null);

  // Student detail drawer
  const [drawerStudentId, setDrawerStudentId] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("archived", showArchived ? "true" : "false");
      const res = await fetch(`/api/students?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setStudents(json.students ?? []);
    } catch (err) {
      console.error("[RosterTab] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    setLoading(true);
    fetchStudents();
  }, [fetchStudents]);

  // Unique coaches from data
  const coaches = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.coach) set.add(s.coach);
    }
    return Array.from(set).sort();
  }, [students]);

  // Filtered students
  const filtered = useMemo(() => {
    let result = [...students];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.coach.toLowerCase().includes(q)
      );
    }

    if (filterProgram) {
      result = result.filter((s) => s.program === filterProgram);
    }

    if (filterStatus) {
      result = result.filter((s) => s.status === filterStatus);
    }

    if (filterCoach) {
      result = result.filter((s) => s.coach === filterCoach);
    }

    if (filterMemberType) {
      result = result.filter((s) => s.member_type === filterMemberType);
    }

    // Sort
    const sortFn = (a: Student, b: Student) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "program":
          cmp = a.program.localeCompare(b.program);
          break;
        case "coach":
          cmp = (a.coach || "").localeCompare(b.coach || "");
          break;
        case "monthly_revenue":
          cmp = a.monthly_revenue - b.monthly_revenue;
          break;
        case "signup_date":
          cmp = (a.signup_date || "").localeCompare(b.signup_date || "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    };
    result.sort(sortFn);

    return result;
  }, [students, searchQuery, filterProgram, filterStatus, filterCoach, filterMemberType, sortBy, sortDir]);

  // Groups for Monday.com-style sections
  const STATUS_GROUPS: { status: StudentStatus; label: string; color: string }[] = [
    { status: "active", label: "Active Students", color: "#22c55e" },
    { status: "paused", label: "Paused", color: "#f59e0b" },
    { status: "downgraded", label: "Downgraded", color: "#f97316" },
    { status: "cancelled", label: "Cancelled", color: "#ef4444" },
  ];

  // Separate partners from regular students
  const nonPartners = useMemo(() => filtered.filter((s) => s.member_type !== "partner"), [filtered]);
  const partners = useMemo(() => filtered.filter((s) => s.member_type === "partner"), [filtered]);

  const groupedStudents = useMemo(() => {
    const map: Record<string, Student[]> = {};
    for (const g of STATUS_GROUPS) {
      map[g.status] = nonPartners.filter((s) => s.status === g.status);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonPartners]);

  const activeCount = students.filter((s) => s.status === "active" && s.member_type !== "partner").length;
  const partnerCount = students.filter((s) => s.member_type === "partner").length;

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingStudent(null);
    setDialogOpen(true);
  };

  const handleArchiveToggle = async (id: string, currentlyArchived: boolean) => {
    if (!currentlyArchived && archivingId !== id) {
      setArchivingId(id);
      return;
    }
    try {
      await fetch(`/api/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !currentlyArchived }),
      });
      setArchivingId(null);
      fetchStudents();
    } catch (err) {
      console.error("[RosterTab] archive:", err);
    }
  };

  const handleDialogSuccess = () => {
    setDialogOpen(false);
    setEditingStudent(null);
    fetchStudents();
  };

  return (
    <>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">
            Student Roster
          </h2>
          {showArchived ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              {students.length} archived
            </span>
          ) : (
            <>
              <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-medium text-[#22c55e]">
                {activeCount} active
              </span>
              {partnerCount > 0 && (
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                  {partnerCount} partners
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {students.length} total
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setExportMenuOpen(false), 150)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
              <ChevronDown className="ml-1.5 h-3 w-3" />
            </Button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                  onMouseDown={() => { window.location.href = "/api/students/export?type=roster"; setExportMenuOpen(false); }}
                >
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Roster CSV
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                  onMouseDown={() => { window.location.href = "/api/students/export?type=full"; setExportMenuOpen(false); }}
                >
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                  Full Report
                </button>
              </div>
            )}
          </div>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Student
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <select
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value as StudentProgram | "")}
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
        >
          <option value="">All Programs</option>
          <option value="elite">Elite</option>
          <option value="accelerator">Accelerator</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StudentStatus | "")}
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="paused">Paused</option>
          <option value="downgraded">Downgraded</option>
        </select>
        <select
          value={filterCoach}
          onChange={(e) => setFilterCoach(e.target.value)}
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
        >
          <option value="">All Coaches</option>
          {coaches.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterMemberType}
          onChange={(e) => setFilterMemberType(e.target.value as "" | "student" | "partner")}
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
        >
          <option value="">All Types</option>
          <option value="student">Students</option>
          <option value="partner">Partners</option>
        </select>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={cn(
            "flex items-center gap-1.5 h-8 rounded-md border px-2.5 text-xs transition-colors",
            showArchived
              ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
              : "border-input bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          <Archive className="h-3 w-3" />
          Archived
        </button>
        {(searchQuery || filterProgram || filterStatus || filterCoach || filterMemberType) && (
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterProgram("");
              setFilterStatus("");
              setFilterCoach("");
              setFilterMemberType("");
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Archived banner */}
      {showArchived && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <Archive className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-amber-400">
            Viewing archived students. These are hidden from the active roster and excluded from stats.
          </span>
        </div>
      )}

      {/* Student list -- grouped by status */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : students.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
          <Users className="mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">No students yet</p>
          <button
            onClick={handleAdd}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Add your first student
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {STATUS_GROUPS.map((group) => {
            const groupStudents = groupedStudents[group.status] ?? [];
            if (groupStudents.length === 0) return null;
            const isCollapsed = collapsedGroups.has(group.status);

            return (
              <div key={group.status} className="overflow-hidden rounded-lg border border-border/50">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.status)}
                  className="flex w-full items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors hover:bg-card/30"
                  style={{ borderLeftWidth: 3, borderLeftColor: group.color }}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold" style={{ color: group.color }}>
                    {group.label}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: group.color + "15", color: group.color }}
                  >
                    {groupStudents.length}
                  </span>
                </button>

                {/* Group Table */}
                {!isCollapsed && (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/20 bg-card/20">
                        <SortHeader field="name" label="Student" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="program" label="Program" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="coach" label="Coach" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <SortHeader field="monthly_revenue" label="Revenue" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                        <SortHeader field="signup_date" label="Sign-up" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Plan
                        </th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Renewal
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupStudents.map((student) => {
                        const programCfg = STUDENT_PROGRAM_CONFIG[student.program];

                        return (
                          <tr
                            key={student.id}
                            className="border-b border-border/10 transition-colors hover:bg-card/30 cursor-pointer"
                            onClick={() => { setArchivingId(null); setDrawerStudentId(student.id); }}
                          >
                            {/* Name & Email */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">
                                    {student.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground/60 truncate">
                                    {student.email || (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const email = prompt(`Enter HubSpot email for ${student.name}:`);
                                          if (!email) return;
                                          const res = await fetch("/api/students/link-contact", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ student_id: student.id, email }),
                                          });
                                          if (res.ok) {
                                            const data = await res.json();
                                            alert(`Linked to ${data.hubspot_name} (${data.email})`);
                                            window.location.reload();
                                          } else {
                                            const err = await res.json();
                                            alert(`Error: ${err.error}`);
                                          }
                                        }}
                                        className="text-primary/60 hover:text-primary hover:underline"
                                      >
                                        + Link to HubSpot
                                      </button>
                                    )}
                                  </p>
                                </div>
                                {student.member_type === "partner" && (
                                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-purple-500/15 text-purple-400">
                                    Partner
                                  </span>
                                )}
                                {student.switch_requested_to && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-orange-500/15 text-orange-400"
                                    title={`Switch requested to ${student.switch_requested_to}`}
                                  >
                                    <ArrowRightLeft className="h-2.5 w-2.5" />
                                    {student.switch_requested_to}
                                  </span>
                                )}
                                {student.youtube_channel && (
                                  <a
                                    href={
                                      student.youtube_channel.startsWith("http")
                                        ? student.youtube_channel
                                        : `https://youtube.com/${student.youtube_channel}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 rounded p-1 text-red-400/60 transition-colors hover:text-red-400"
                                    title="YouTube Channel"
                                  >
                                    <Youtube className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {student.notes && (
                                  <span
                                    className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                                    title={student.notes}
                                  >
                                    <StickyNote className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Program */}
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {programCfg.label}
                            </td>

                            {/* Coach */}
                            <td className="px-3 py-2.5">
                              {student.coach ? (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: getCoachColor(student.coach) + "20",
                                    color: getCoachColor(student.coach),
                                  }}
                                >
                                  {student.coach}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">--</span>
                              )}
                            </td>

                            {/* Revenue */}
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-medium text-foreground">
                              {fmtMoney(student.monthly_revenue)}
                            </td>

                            {/* Sign-up date */}
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {student.signup_date ? formatDate(student.signup_date) : "--"}
                            </td>

                            {/* Payment Plan */}
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {student.payment_plan && PAYMENT_PLAN_CONFIG[student.payment_plan]
                                ? PAYMENT_PLAN_CONFIG[student.payment_plan].shortLabel
                                : "--"}
                            </td>

                            {/* Renewal Date */}
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {student.renewal_date ? formatDate(student.renewal_date) : "--"}
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(student);
                                  }}
                                  className="rounded p-1 text-muted-foreground/30 transition-colors hover:text-foreground"
                                  title="Edit student"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchiveToggle(student.id, student.archived);
                                  }}
                                  className={cn(
                                    "rounded transition-colors",
                                    !student.archived && archivingId === student.id
                                      ? "flex items-center gap-1 bg-amber-500/15 px-2 py-1 text-amber-400 hover:text-amber-300"
                                      : "p-1 text-muted-foreground/30 hover:text-foreground"
                                  )}
                                  title={
                                    student.archived
                                      ? "Unarchive student"
                                      : archivingId === student.id
                                      ? "Click again to confirm archive"
                                      : "Archive student"
                                  }
                                >
                                  {student.archived ? (
                                    <ArchiveRestore className="h-3.5 w-3.5" />
                                  ) : archivingId === student.id ? (
                                    <>
                                      <Archive className="h-3.5 w-3.5" />
                                      <span className="text-[10px] font-medium">Confirm?</span>
                                    </>
                                  ) : (
                                    <Archive className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Partners Section */}
      {!loading && partners.length > 0 && !showArchived && (
        <div className="mt-6 space-y-4">
          <div className="overflow-hidden rounded-lg border border-border/50">
            <button
              onClick={() => toggleGroup("partners")}
              className="flex w-full items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors hover:bg-card/30"
              style={{ borderLeftWidth: 3, borderLeftColor: "#a855f7" }}
            >
              {collapsedGroups.has("partners") ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-semibold text-purple-400">
                Partners
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-500/15 text-purple-400">
                {partners.length}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Accelerator access via a paying student
              </span>
            </button>

            {!collapsedGroups.has("partners") && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/20 bg-card/20">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Partner</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Student</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coach</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sign-up</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => {
                    const linkedStudent = partner.linked_student_id
                      ? students.find((s) => s.id === partner.linked_student_id)
                      : null;

                    return (
                      <tr
                        key={partner.id}
                        className="border-b border-border/10 transition-colors hover:bg-card/30 cursor-pointer"
                        onClick={() => { setArchivingId(null); setDrawerStudentId(partner.id); }}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{partner.name}</p>
                              <p className="text-[10px] text-muted-foreground/60 truncate">{partner.email || "--"}</p>
                            </div>
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-purple-500/15 text-purple-400">
                              Partner
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {linkedStudent ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDrawerStudentId(linkedStudent.id);
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              {linkedStudent.name}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(partner);
                              }}
                              className="text-[10px] text-muted-foreground/50 hover:text-primary"
                            >
                              + Link student
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {partner.coach ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: getCoachColor(partner.coach) + "20",
                                color: getCoachColor(partner.coach),
                              }}
                            >
                              {partner.coach}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {partner.signup_date ? formatDate(partner.signup_date) : "--"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(partner); }}
                              className="rounded p-1 text-muted-foreground/30 transition-colors hover:text-foreground"
                              title="Edit partner"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchiveToggle(partner.id, partner.archived); }}
                              className={cn(
                                "rounded transition-colors",
                                !partner.archived && archivingId === partner.id
                                  ? "flex items-center gap-1 bg-amber-500/15 px-2 py-1 text-amber-400 hover:text-amber-300"
                                  : "p-1 text-muted-foreground/30 hover:text-foreground"
                              )}
                              title={archivingId === partner.id ? "Click again to confirm" : "Archive partner"}
                            >
                              {archivingId === partner.id ? (
                                <>
                                  <Archive className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-medium">Confirm?</span>
                                </>
                              ) : (
                                <Archive className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Renewals */}
      {!loading && <RenewalTracker students={students} />}

      {/* Student Dialog */}
      <StudentDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingStudent(null);
        }}
        student={editingStudent}
        onSuccess={handleDialogSuccess}
        allStudents={students}
      />

      {/* Student Detail Drawer */}
      <StudentDetailDrawer
        studentId={drawerStudentId}
        onClose={() => setDrawerStudentId(null)}
        students={students}
        onEdit={(student) => {
          setDrawerStudentId(null);
          handleEdit(student);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Student Detail Drawer
// ---------------------------------------------------------------------------

interface StudentDetailDrawerProps {
  studentId: string | null;
  onClose: () => void;
  students: Student[];
  onEdit: (student: Student) => void;
}

interface ContactMeeting {
  id: string;
  title: string;
  meeting_date: string;
  duration_minutes: number;
  outcome: string;
  outcome_notes: string;
  sales_reps: { name: string } | null;
}

interface ContactCharge {
  id: string;
  amount: number;
  charge_date: string;
  source_platform: string;
  products: { short_name: string; name: string } | null;
}

const OUTCOME_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pending:       { bg: "bg-zinc-500/15",   text: "text-zinc-400",   label: "Pending" },
  completed:     { bg: "bg-blue-500/15",   text: "text-blue-400",   label: "Completed" },
  no_show:       { bg: "bg-red-500/15",    text: "text-red-400",    label: "No Show" },
  rescheduled:   { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "Rescheduled" },
  not_qualified: { bg: "bg-orange-500/15", text: "text-orange-400", label: "Not Qualified" },
  lead:          { bg: "bg-cyan-500/15",   text: "text-cyan-400",   label: "Lead" },
  sold:          { bg: "bg-green-500/15",  text: "text-green-400",  label: "Sold" },
};

function StudentDetailDrawer({ studentId, onClose, students, onEdit }: StudentDetailDrawerProps) {
  const student = studentId ? students.find((s) => s.id === studentId) : null;
  const [churnEvents, setChurnEvents] = useState<ChurnEvent[]>([]);
  const [attendedSessions, setAttendedSessions] = useState<{ id: string; title: string; session_type: string; session_date: string }[]>([]);
  const [contactMeetings, setContactMeetings] = useState<ContactMeeting[]>([]);
  const [contactCharges, setContactCharges] = useState<ContactCharge[]>([]);
  const [loadingChurn, setLoadingChurn] = useState(false);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);

  useEffect(() => {
    if (!studentId) {
      setChurnEvents([]);
      setAttendedSessions([]);
      setContactMeetings([]);
      setContactCharges([]);
      return;
    }

    setLoadingChurn(true);
    setLoadingAttendance(true);

    fetch(`/api/students/churn?student_id=${studentId}`)
      .then((r) => r.json())
      .then((j) => setChurnEvents(j.events ?? []))
      .catch(() => setChurnEvents([]))
      .finally(() => setLoadingChurn(false));

    fetch(`/api/students/attendance?student_id=${studentId}`)
      .then((r) => r.json())
      .then((j) => setAttendedSessions(j.sessions ?? []))
      .catch(() => setAttendedSessions([]))
      .finally(() => setLoadingAttendance(false));
  }, [studentId]);

  // Fetch meetings and charges via the contact API when student has a contact_id
  useEffect(() => {
    const contactId = student?.contact_id;
    if (!contactId) {
      setContactMeetings([]);
      setContactCharges([]);
      return;
    }

    setLoadingContact(true);
    fetch(`/api/contacts/${contactId}`)
      .then((r) => r.json())
      .then((j) => {
        setContactMeetings(j.meetings ?? []);
        setContactCharges(j.charges ?? []);
      })
      .catch(() => {
        setContactMeetings([]);
        setContactCharges([]);
      })
      .finally(() => setLoadingContact(false));
  }, [student?.contact_id]);

  const tenure = useMemo(() => {
    if (!student?.signup_date) return null;
    const months = (Date.now() - new Date(student.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    return Math.round(months * 10) / 10;
  }, [student]);

  return (
    <Sheet open={!!student} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        {student && (
          <>
            <SheetHeader>
              <SheetTitle className="text-base">{student.name}</SheetTitle>
              <SheetDescription className="text-xs">{student.email}</SheetDescription>
            </SheetHeader>

            {/* Status & Program Badges */}
            <div className="flex flex-wrap gap-2 px-4">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: STUDENT_STATUS_CONFIG[student.status].color + "20",
                  color: STUDENT_STATUS_CONFIG[student.status].color,
                }}
              >
                {STUDENT_STATUS_CONFIG[student.status].label}
              </span>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: STUDENT_PROGRAM_CONFIG[student.program].color + "20",
                  color: STUDENT_PROGRAM_CONFIG[student.program].color,
                }}
              >
                {STUDENT_PROGRAM_CONFIG[student.program].label}
              </span>
              {student.coach && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: getCoachColor(student.coach) + "20",
                    color: getCoachColor(student.coach),
                  }}
                >
                  {student.coach}
                </span>
              )}
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3 px-4">
              <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <DollarSign className="h-3 w-3" />
                  Monthly Revenue
                </div>
                <div className="text-sm font-bold">{fmtMoney(student.monthly_revenue)}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <CreditCard className="h-3 w-3" />
                  Payment Plan
                </div>
                <div className="text-sm font-bold">
                  {PAYMENT_PLAN_CONFIG[student.payment_plan]?.label ?? (student.payment_plan || "—")}
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <Clock className="h-3 w-3" />
                  Tenure
                </div>
                <div className="text-sm font-bold">{tenure !== null ? `${tenure} mo` : "—"}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <Calendar className="h-3 w-3" />
                  Renewal
                </div>
                <div className="text-sm font-bold">
                  {student.renewal_date ? formatDate(student.renewal_date) : "—"}
                </div>
              </div>
            </div>

            {/* Churn Timeline */}
            <div className="px-4">
              <h3 className="mb-2 text-xs font-semibold">Churn Timeline</h3>
              {loadingChurn ? (
                <p className="text-[10px] text-muted-foreground">Loading...</p>
              ) : churnEvents.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50">No churn events</p>
              ) : (
                <div className="space-y-2">
                  {churnEvents.map((e) => {
                    const cfg = CHURN_TYPE_CONFIG[e.event_type];
                    return (
                      <div key={e.id} className="flex items-start gap-2 rounded-md border border-border/30 bg-card/20 p-2">
                        <span
                          className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium shrink-0"
                          style={{ backgroundColor: cfg.color + "20", color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{formatDate(e.event_date)}</span>
                            <span className={cn(
                              "font-mono font-medium",
                              e.event_type === "restart" ? "text-emerald-400" : "text-red-400"
                            )}>
                              {e.event_type === "restart" ? "+" : "-"}{fmtMoney(e.monthly_revenue_impact)}
                            </span>
                          </div>
                          {e.reason && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/60 line-clamp-2">{e.reason}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Attendance */}
            <div className="px-4">
              <h3 className="mb-2 text-xs font-semibold">
                Attendance
                {!loadingAttendance && (
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {attendedSessions.length} session{attendedSessions.length !== 1 ? "s" : ""}
                  </span>
                )}
              </h3>
              {loadingAttendance ? (
                <p className="text-[10px] text-muted-foreground">Loading...</p>
              ) : attendedSessions.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50">No sessions attended</p>
              ) : (
                <div className="space-y-1">
                  {attendedSessions.slice(0, 10).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-md border border-border/20 bg-card/20 px-2.5 py-1.5">
                      <span className="text-[11px] font-medium truncate">{s.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {formatDate(s.session_date)}
                      </span>
                    </div>
                  ))}
                  {attendedSessions.length > 10 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center">
                      +{attendedSessions.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Meetings (from contact) */}
            <div className="px-4">
              <h3 className="mb-2 text-xs font-semibold">
                Meetings
                {!loadingContact && contactMeetings.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {contactMeetings.length}
                  </span>
                )}
              </h3>
              {loadingContact ? (
                <p className="text-[10px] text-muted-foreground">Loading...</p>
              ) : !student.contact_id ? (
                <p className="text-[10px] text-muted-foreground/50">No linked contact</p>
              ) : contactMeetings.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50">No meetings</p>
              ) : (
                <div className="space-y-1.5">
                  {contactMeetings.slice(0, 10).map((mtg) => {
                    const oc = OUTCOME_BADGE[mtg.outcome] || { bg: "bg-muted", text: "text-muted-foreground", label: mtg.outcome };
                    return (
                      <div key={mtg.id} className="rounded-md border border-border/20 bg-card/20 px-2.5 py-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-medium truncate">{mtg.title || "Meeting"}</span>
                          <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium", oc.bg, oc.text)}>
                            {oc.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{formatDate(mtg.meeting_date)}</span>
                          {mtg.sales_reps?.name && <span>with {mtg.sales_reps.name}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {contactMeetings.length > 10 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center">
                      +{contactMeetings.length - 10} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Transaction History (from contact) */}
            <div className="px-4">
              <h3 className="mb-2 text-xs font-semibold">
                Transactions
                {!loadingContact && contactCharges.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {contactCharges.length} &middot; {fmtMoney(contactCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0))}
                  </span>
                )}
              </h3>
              {loadingContact ? (
                <p className="text-[10px] text-muted-foreground">Loading...</p>
              ) : !student.contact_id ? (
                <p className="text-[10px] text-muted-foreground/50">No linked contact</p>
              ) : contactCharges.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50">No transactions</p>
              ) : (
                <div className="space-y-1.5">
                  {contactCharges.slice(0, 15).map((charge) => (
                    <div key={charge.id} className="flex items-center justify-between rounded-md border border-border/20 bg-card/20 px-2.5 py-1.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-medium truncate block">
                          {charge.products?.short_name || charge.products?.name || "Unknown"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(charge.charge_date)}</span>
                      </div>
                      <span className="text-[11px] font-mono font-semibold shrink-0 ml-2">
                        {fmtMoney(Number(charge.amount))}
                      </span>
                    </div>
                  ))}
                  {contactCharges.length > 15 && (
                    <p className="text-[10px] text-muted-foreground/50 text-center">
                      +{contactCharges.length - 15} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            {student.notes && (
              <div className="px-4">
                <h3 className="mb-2 text-xs font-semibold">Notes</h3>
                <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">{student.notes}</p>
              </div>
            )}

            {/* YouTube */}
            {student.youtube_channel && (
              <div className="px-4">
                <a
                  href={student.youtube_channel.startsWith("http") ? student.youtube_channel : `https://youtube.com/${student.youtube_channel}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Youtube className="h-3.5 w-3.5" />
                  YouTube Channel
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Actions */}
            <div className="px-4 pb-4">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onEdit(student)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit Student
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Renewal Tracker
// ---------------------------------------------------------------------------

function RenewalTracker({ students }: { students: Student[] }) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const activeStudents = students.filter((s) => s.status === "active");

  const thisMonthRenewals = activeStudents
    .filter((s) => s.renewal_date && s.renewal_date.startsWith(thisMonth))
    .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));

  const nextMonthRenewals = activeStudents
    .filter((s) => s.renewal_date && s.renewal_date.startsWith(nextMonth))
    .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));

  if (thisMonthRenewals.length === 0 && nextMonthRenewals.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold">Upcoming Renewals</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* This Month */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              This Month
            </h3>
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              {thisMonthRenewals.length}
            </span>
          </div>
          {thisMonthRenewals.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50">No renewals this month</p>
          ) : (
            <div className="space-y-2">
              {thisMonthRenewals.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-background/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {s.coach && (
                        <span style={{ color: getCoachColor(s.coach) }}>{s.coach}</span>
                      )}
                      <span>{fmtMoney(s.monthly_revenue)}/mo</span>
                      {s.payment_plan && PAYMENT_PLAN_CONFIG[s.payment_plan] && (
                        <span className="text-muted-foreground/50">
                          {PAYMENT_PLAN_CONFIG[s.payment_plan].label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-amber-400">
                    {formatDate(s.renewal_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Month */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">
              Next Month
            </h3>
            <span className="rounded-full bg-blue-400/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              {nextMonthRenewals.length}
            </span>
          </div>
          {nextMonthRenewals.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50">No renewals next month</p>
          ) : (
            <div className="space-y-2">
              {nextMonthRenewals.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-background/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {s.coach && (
                        <span style={{ color: getCoachColor(s.coach) }}>{s.coach}</span>
                      )}
                      <span>{fmtMoney(s.monthly_revenue)}/mo</span>
                      {s.payment_plan && PAYMENT_PLAN_CONFIG[s.payment_plan] && (
                        <span className="text-muted-foreground/50">
                          {PAYMENT_PLAN_CONFIG[s.payment_plan].label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-blue-400">
                    {formatDate(s.renewal_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Add/Edit Dialog
// ---------------------------------------------------------------------------

interface StudentDialogProps {
  open: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess: () => void;
  allStudents?: Student[];
}

function StudentDialog({ open, onClose, student, onSuccess, allStudents = [] }: StudentDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [youtubeChannel, setYoutubeChannel] = useState("");
  const [coach, setCoach] = useState("");
  const [program, setProgram] = useState<StudentProgram>("elite");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [signupDate, setSignupDate] = useState("");
  const [status, setStatus] = useState<StudentStatus>("active");
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("");
  const [renewalDate, setRenewalDate] = useState("");
  const [notes, setNotes] = useState("");
  const [switchRequestedTo, setSwitchRequestedTo] = useState("");
  const [switchRequestedDate, setSwitchRequestedDate] = useState("");
  const [memberType, setMemberType] = useState<"student" | "partner" | "unclassified">("student");
  const [linkedStudentId, setLinkedStudentId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    if (student) {
      setName(student.name);
      setEmail(student.email);
      setYoutubeChannel(student.youtube_channel);
      setCoach(student.coach);
      setProgram(student.program);
      setMonthlyRevenue(student.monthly_revenue.toString());
      setSignupDate(student.signup_date);
      setStatus(student.status);
      setPaymentPlan(student.payment_plan || "");
      setRenewalDate(student.renewal_date || "");
      setNotes(student.notes);
      setSwitchRequestedTo(student.switch_requested_to || "");
      setSwitchRequestedDate(student.switch_requested_date || "");
      setMemberType(student.member_type || "student");
      setLinkedStudentId(student.linked_student_id || "");
    } else {
      setName("");
      setEmail("");
      setYoutubeChannel("");
      setCoach("");
      setProgram("elite");
      setMonthlyRevenue("");
      setSignupDate(new Date().toISOString().slice(0, 10));
      setStatus("active");
      setPaymentPlan("");
      setRenewalDate("");
      setNotes("");
      setSwitchRequestedTo("");
      setSwitchRequestedDate("");
      setMemberType("student");
      setLinkedStudentId("");
    }
  }, [open, student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        youtube_channel: youtubeChannel.trim(),
        coach: coach.trim(),
        program,
        monthly_revenue: parseFloat(monthlyRevenue) || 0,
        signup_date: signupDate,
        status,
        payment_plan: paymentPlan,
        renewal_date: renewalDate,
        notes: notes.trim(),
        switch_requested_to: switchRequestedTo.trim(),
        switch_requested_date: switchRequestedDate,
        member_type: memberType,
        linked_student_id: memberType === "partner" && linkedStudentId ? linkedStudentId : null,
      };

      if (student) {
        const res = await fetch(`/api/students/${student.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update student");
        }
      } else {
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create student");
        }
      }

      onSuccess();
    } catch (err) {
      console.error("[StudentDialog] save:", err);
      setSaveError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {student ? "Edit Student" : "Add Student"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Student name"
                className="text-sm"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="text-sm"
              />
            </div>
          </div>

          {/* YouTube & Coach */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                YouTube Channel
              </label>
              <Input
                value={youtubeChannel}
                onChange={(e) => setYoutubeChannel(e.target.value)}
                placeholder="@channel or URL"
                className="text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Coach
              </label>
              <Input
                value={coach}
                onChange={(e) => setCoach(e.target.value)}
                placeholder="Coach name"
                className="text-sm"
              />
            </div>
          </div>

          {/* Program, Status & Member Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Program
              </label>
              <Select value={program} onValueChange={(v) => setProgram(v as StudentProgram)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elite">Elite</SelectItem>
                  <SelectItem value="accelerator">Accelerator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Status
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as StudentStatus)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="downgraded">Downgraded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Member Type
              </label>
              <Select value={memberType} onValueChange={(v) => setMemberType(v as "student" | "partner" | "unclassified")}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="unclassified">Unclassified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Linked Student (shown when partner) */}
          {memberType === "partner" && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Linked Student
              </label>
              <select
                value={linkedStudentId}
                onChange={(e) => setLinkedStudentId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-secondary px-2 text-sm text-foreground"
              >
                <option value="">Select student...</option>
                {allStudents
                  .filter((s) => s.member_type !== "partner" && s.id !== student?.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                The paying student this partner is linked to
              </p>
            </div>
          )}

          {/* Revenue & Signup Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Monthly Revenue
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={monthlyRevenue}
                onChange={(e) => setMonthlyRevenue(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Sign-up Date
              </label>
              <Input
                type="date"
                value={signupDate}
                onChange={(e) => setSignupDate(e.target.value)}
                className="text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Payment Plan & Renewal Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Payment Plan
              </label>
              <Select value={paymentPlan || "__none__"} onValueChange={(v) => setPaymentPlan(v === "__none__" ? "" : v as PaymentPlan)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {Object.entries(PAYMENT_PLAN_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Renewal Date
              </label>
              <Input
                type="date"
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                className="text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Switch Request */}
          {student && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  Switch Requested To
                </label>
                <Input
                  value={switchRequestedTo}
                  onChange={(e) => setSwitchRequestedTo(e.target.value)}
                  placeholder="Coach name"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">
                  Switch Request Date
                </label>
                <Input
                  type="date"
                  value={switchRequestedDate}
                  onChange={(e) => setSwitchRequestedDate(e.target.value)}
                  className="text-sm [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Error message */}
          {saveError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || saving}>
              {saving
                ? "Saving..."
                : student
                ? "Save Changes"
                : "Add Student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Churn Tab
// ===========================================================================

interface ChurnStats {
  total_active_elite: number;
  total_active_accelerator: number;
  monthly_churn_count: number;
  monthly_churn_revenue: number;
  monthly_new_students: number;
  monthly_new_revenue: number;
  churn_rate: number;
  avg_attendance_rate: number;
}

// ===========================================================================
// Coaches Tab
// ===========================================================================

interface CoachSummary {
  name: string;
  color: string;
  total: number;
  active: number;
  paused: number;
  activeRevenue: number;
  pausedRevenue: number;
}

function CoachesTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [allChurnEvents, setAllChurnEvents] = useState<ChurnEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    try {
      const [stuRes, churnRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/students/churn"),
      ]);
      if (stuRes.ok) {
        const json = await stuRes.json();
        setStudents(json.students ?? []);
      }
      if (churnRes.ok) {
        const json = await churnRes.json();
        setAllChurnEvents(json.events ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const coachData = useMemo<CoachSummary[]>(() => {
    const map = new Map<string, CoachSummary>();
    for (const s of students) {
      if (s.status !== "active" && s.status !== "paused") continue;
      const name = s.coach || "Unassigned";
      if (!map.has(name)) {
        map.set(name, {
          name,
          color: getCoachColor(name),
          total: 0,
          active: 0,
          paused: 0,
          activeRevenue: 0,
          pausedRevenue: 0,
        });
      }
      const c = map.get(name)!;
      c.total++;
      if (s.status === "active") {
        c.active++;
        c.activeRevenue += s.monthly_revenue || 0;
      } else if (s.status === "paused") {
        c.paused++;
        c.pausedRevenue += s.monthly_revenue || 0;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.active - a.active);
  }, [students]);

  const totals = useMemo(() => {
    return coachData.reduce(
      (acc, c) => ({
        total: acc.total + c.total,
        active: acc.active + c.active,
        paused: acc.paused + c.paused,
        activeRevenue: acc.activeRevenue + c.activeRevenue,
        pausedRevenue: acc.pausedRevenue + c.pausedRevenue,
      }),
      { total: 0, active: 0, paused: 0, activeRevenue: 0, pausedRevenue: 0 }
    );
  }, [coachData]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <>
      {/* Overview stats */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-foreground">{totals.total}</div>
          <div className="text-[10px] text-muted-foreground">Total Students</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-[#22c55e]">{totals.active}</div>
          <div className="text-[10px] text-muted-foreground">Active</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-[#f59e0b]">{totals.paused}</div>
          <div className="text-[10px] text-muted-foreground">Paused</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-[#22c55e]">{fmtMoney(totals.activeRevenue)}</div>
          <div className="text-[10px] text-muted-foreground">Active MRR</div>
          {totals.active > 0 && (
            <div className="text-[10px] text-muted-foreground">{fmtMoney(Math.round(totals.activeRevenue / totals.active))}/avg</div>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-[#f59e0b]">{fmtMoney(totals.pausedRevenue)}</div>
          <div className="text-[10px] text-muted-foreground">Paused MRR</div>
          {totals.paused > 0 && (
            <div className="text-[10px] text-muted-foreground">{fmtMoney(Math.round(totals.pausedRevenue / totals.paused))}/avg</div>
          )}
        </div>
      </div>

      {/* Coach cards */}
      <h2 className="mb-3 text-sm font-semibold">Coach Breakdown</h2>
      <div className="grid grid-cols-2 gap-4">
        {coachData.map((coach) => {
          const activePercent = coach.total > 0 ? Math.round((coach.active / coach.total) * 100) : 0;

          return (
            <div
              key={coach.name}
              className="rounded-lg border border-border/50 bg-card/40 p-4"
              style={{ borderLeftWidth: 3, borderLeftColor: coach.color }}
            >
              {/* Coach name + total */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: coach.color + "20", color: coach.color }}
                  >
                    {coach.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {coach.total} student{coach.total !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs font-medium" style={{ color: coach.color }}>
                  {activePercent}% active
                </span>
              </div>

              {/* Status bar */}
              <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-border/30">
                {coach.active > 0 && (
                  <div
                    className="h-full"
                    style={{ width: `${(coach.active / coach.total) * 100}%`, backgroundColor: "#22c55e" }}
                  />
                )}
                {coach.paused > 0 && (
                  <div
                    className="h-full"
                    style={{ width: `${(coach.paused / coach.total) * 100}%`, backgroundColor: "#f59e0b" }}
                  />
                )}
              </div>

              {/* Status counts + revenue */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-[#22c55e]">{coach.active}</div>
                  <div className="text-[9px] text-muted-foreground">Active</div>
                  <div className="mt-0.5 text-[10px] font-medium text-[#22c55e]/80">{fmtMoney(coach.activeRevenue)}/mo</div>
                  {coach.active > 0 && (
                    <div className="text-[9px] text-muted-foreground">{fmtMoney(Math.round(coach.activeRevenue / coach.active))}/avg</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#f59e0b]">{coach.paused}</div>
                  <div className="text-[9px] text-muted-foreground">Paused</div>
                  {coach.pausedRevenue > 0 && (
                    <>
                      <div className="mt-0.5 text-[10px] font-medium text-[#f59e0b]/80">{fmtMoney(coach.pausedRevenue)}/mo</div>
                      {coach.paused > 0 && (
                        <div className="text-[9px] text-muted-foreground">{fmtMoney(Math.round(coach.pausedRevenue / coach.paused))}/avg</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-[#22c55e]" /> Active
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Paused
        </span>
      </div>

      {/* Pending Switch Requests (Sprint 2) */}
      {!loading && (() => {
        const switchRequests = students.filter((s) => s.switch_requested_to);
        if (switchRequests.length === 0) return null;

        const handleResolveSwitch = async (student: Student) => {
          try {
            await fetch(`/api/students/${student.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                coach: student.switch_requested_to,
                switch_requested_to: "",
                switch_requested_date: "",
              }),
            });
            fetchStudents();
          } catch (err) {
            console.error("[CoachesTab] resolve switch:", err);
          }
        };

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Pending Switch Requests</h2>
            <div className="overflow-x-auto rounded-lg border border-orange-500/20 bg-orange-500/5">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Coach</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"></th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requested Coach</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Request Date</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {switchRequests.map((s) => (
                    <tr key={s.id} className="border-b border-border/10">
                      <td className="px-3 py-2 text-xs font-medium">{s.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: getCoachColor(s.coach) + "20", color: getCoachColor(s.coach) }}
                        >
                          {s.coach || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <ArrowRightLeft className="mx-auto h-3 w-3 text-orange-400" />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: getCoachColor(s.switch_requested_to) + "20", color: getCoachColor(s.switch_requested_to) }}
                        >
                          {s.switch_requested_to}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {s.switch_requested_date ? formatDate(s.switch_requested_date) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleResolveSwitch(s)}>
                          Resolve
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Coach Renewals */}
      {!loading && <CoachRenewals students={students} coaches={coachData} />}

      {/* Coach Performance Scorecard */}
      {!loading && <CoachPerformanceScorecard students={students} allChurnEvents={allChurnEvents} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Coach Performance Scorecard
// ---------------------------------------------------------------------------

type ScorecardSortField = "coach" | "students" | "avgTenure" | "churnRate3mo" | "mrrManaged" | "avgRev" | "score";

function CoachPerformanceScorecard({
  students,
  allChurnEvents,
}: {
  students: Student[];
  allChurnEvents: ChurnEvent[];
}) {
  const [sortField, setSortField] = useState<ScorecardSortField>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: ScorecardSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "coach" ? "asc" : "desc");
    }
  };

  const scorecard = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

    const activeOrPaused = students.filter((s) => s.status === "active" || s.status === "paused");
    const coachMap = new Map<string, Student[]>();
    for (const s of activeOrPaused) {
      const coach = s.coach || "Unassigned";
      if (!coachMap.has(coach)) coachMap.set(coach, []);
      coachMap.get(coach)!.push(s);
    }

    type ScorecardRow = {
      coach: string;
      students: number;
      avgTenure: number;
      churnRate3mo: number;
      mrrManaged: number;
      avgRev: number;
      score: number;
      churnHistory: { month: string; count: number }[];
    };

    const rows: ScorecardRow[] = [];

    let maxTenure = 0;

    // Build 6-month range for sparklines
    const months6: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    // First pass: compute raw metrics
    const rawRows: ScorecardRow[] = [];
    for (const [coach, coachStudents] of coachMap) {
      const activeStudents = coachStudents.filter((s) => s.status === "active");
      const activeCount = activeStudents.length;
      if (activeCount === 0 && coachStudents.length === 0) continue;

      // Avg tenure
      const tenures = coachStudents
        .filter((s) => s.signup_date)
        .map((s) => (now.getTime() - new Date(s.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      const avgTenure = tenures.length > 0 ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;
      if (avgTenure > maxTenure) maxTenure = avgTenure;

      // 3mo churn rate
      const coachStudentIds = new Set(coachStudents.map((s) => s.id));
      const recentChurn = allChurnEvents.filter(
        (e) =>
          e.event_date >= threeMonthsAgoStr &&
          e.event_type !== "restart" &&
          coachStudentIds.has(e.student_id)
      );
      const denominator = Math.max(activeCount, 1);
      const churnRate3mo = (recentChurn.length / denominator) * 100;

      // Revenue
      const mrrManaged = activeStudents.reduce((s, st) => s + st.monthly_revenue, 0);
      const avgRev = activeCount > 0 ? Math.round(mrrManaged / activeCount) : 0;

      // Per-coach monthly churn for last 6 months
      const churnHistory = months6.map((m) => {
        const count = allChurnEvents.filter(
          (e) =>
            e.event_date.startsWith(m) &&
            e.event_type !== "restart" &&
            coachStudentIds.has(e.student_id)
        ).length;
        return { month: m, count };
      });

      rawRows.push({
        coach,
        students: coachStudents.length,
        avgTenure: Math.round(avgTenure * 10) / 10,
        churnRate3mo: Math.round(churnRate3mo * 10) / 10,
        mrrManaged,
        avgRev,
        score: 0,
        churnHistory,
      });
    }

    // Second pass: compute normalized retention score
    for (const row of rawRows) {
      const tenureNormalized = maxTenure > 0 ? row.avgTenure / maxTenure : 0;
      const churnFactor = 1 - Math.min(row.churnRate3mo / 100, 1);
      row.score = Math.round(churnFactor * tenureNormalized * 100);
      rows.push(row);
    }

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "coach": cmp = a.coach.localeCompare(b.coach); break;
        case "students": cmp = a.students - b.students; break;
        case "avgTenure": cmp = a.avgTenure - b.avgTenure; break;
        case "churnRate3mo": cmp = a.churnRate3mo - b.churnRate3mo; break;
        case "mrrManaged": cmp = a.mrrManaged - b.mrrManaged; break;
        case "avgRev": cmp = a.avgRev - b.avgRev; break;
        case "score": cmp = a.score - b.score; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [students, allChurnEvents, sortField, sortDir]);

  if (scorecard.length === 0) return null;

  const SortTh = ({ field, label, align = "left" }: { field: ScorecardSortField; label: string; align?: "left" | "right" }) => (
    <th
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider select-none cursor-pointer transition-colors hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
        sortField === field ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          sortDir === "asc"
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        )}
      </span>
    </th>
  );

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold">Coach Performance Scorecard</h2>
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30 bg-card/30">
              <SortTh field="coach" label="Coach" />
              <SortTh field="students" label="Students" align="right" />
              <SortTh field="avgTenure" label="Avg Tenure" align="right" />
              <SortTh field="churnRate3mo" label="3mo Churn" align="right" />
              <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Trend
              </th>
              <SortTh field="mrrManaged" label="MRR Managed" align="right" />
              <SortTh field="avgRev" label="Avg Rev" align="right" />
              <SortTh field="score" label="Score" align="right" />
            </tr>
          </thead>
          <tbody>
            {scorecard.map((row) => {
              const scoreColor = row.score > 70 ? "#22c55e" : row.score > 40 ? "#f59e0b" : "#ef4444";
              return (
                <tr key={row.coach} className="border-b border-border/10 hover:bg-card/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: getCoachColor(row.coach) + "20", color: getCoachColor(row.coach) }}
                    >
                      {row.coach}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium">{row.students}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{row.avgTenure} mo</td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    <span className={row.churnRate3mo > 10 ? "text-red-400" : row.churnRate3mo > 5 ? "text-[#f59e0b]" : "text-[#22c55e]"}>
                      {row.churnRate3mo}%
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <ResponsiveContainer width={60} height={20}>
                      <LineChart data={row.churnHistory}>
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={row.churnRate3mo > 10 ? "#ef4444" : row.churnRate3mo > 5 ? "#f59e0b" : "#22c55e"}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium">{fmtMoney(row.mrrManaged)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{fmtMoney(row.avgRev)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ backgroundColor: scoreColor + "15", color: scoreColor }}
                    >
                      {row.score}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Score = (1 - churn rate) × normalized tenure. Higher is better.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach Renewals Section
// ---------------------------------------------------------------------------

function CoachRenewals({
  students,
  coaches,
}: {
  students: Student[];
  coaches: CoachSummary[];
}) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const thisMonthLabel = formatMonth(thisMonth);
  const nextMonthLabel = formatMonth(nextMonth);

  // Active students with renewal dates
  const activeWithRenewal = students.filter(
    (s) => s.status === "active" && s.renewal_date
  );

  const thisMonthRenewals = activeWithRenewal.filter((s) =>
    s.renewal_date.startsWith(thisMonth)
  );
  const nextMonthRenewals = activeWithRenewal.filter((s) =>
    s.renewal_date.startsWith(nextMonth)
  );

  // Group by coach
  const groupByCoach = (list: Student[]) => {
    const map = new Map<string, Student[]>();
    for (const s of list) {
      const coach = s.coach || "Unassigned";
      if (!map.has(coach)) map.set(coach, []);
      map.get(coach)!.push(s);
    }
    // Sort students within each coach by renewal date
    for (const arr of map.values()) {
      arr.sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));
    }
    return map;
  };

  const thisMonthByCoach = groupByCoach(thisMonthRenewals);
  const nextMonthByCoach = groupByCoach(nextMonthRenewals);

  // Get coach names that appear in either month, ordered by coach card order
  const coachOrder = coaches.map((c) => c.name);
  const allCoachNames = new Set([
    ...thisMonthByCoach.keys(),
    ...nextMonthByCoach.keys(),
  ]);
  const orderedCoaches = coachOrder.filter((c) => allCoachNames.has(c));
  // Add any coaches not in the summary (e.g. "Unassigned")
  for (const c of allCoachNames) {
    if (!orderedCoaches.includes(c)) orderedCoaches.push(c);
  }

  if (thisMonthRenewals.length === 0 && nextMonthRenewals.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold">Upcoming Renewals by Coach</h2>
        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          {thisMonthRenewals.length + nextMonthRenewals.length} total
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* This Month */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold text-amber-400">
              {thisMonthLabel}
            </h3>
            <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              {thisMonthRenewals.length}
            </span>
          </div>

          {thisMonthRenewals.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50">No renewals this month</p>
          ) : (
            <div className="space-y-3">
              {orderedCoaches
                .filter((c) => thisMonthByCoach.has(c))
                .map((coachName) => {
                  const coachStudents = thisMonthByCoach.get(coachName)!;
                  const color = getCoachColor(coachName);
                  return (
                    <div
                      key={coachName}
                      className="rounded-lg border border-border/50 bg-card/40 overflow-hidden"
                      style={{ borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color }}
                        >
                          {coachName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {coachStudents.length} renewal{coachStudents.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="divide-y divide-border/10">
                        {coachStudents.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {s.name}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{fmtMoney(s.monthly_revenue)}/mo</span>
                                {s.payment_plan && PAYMENT_PLAN_CONFIG[s.payment_plan] && (
                                  <span className="text-muted-foreground/50">
                                    {PAYMENT_PLAN_CONFIG[s.payment_plan].label}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] font-medium text-amber-400">
                              {formatDate(s.renewal_date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Next Month */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold text-blue-400">
              {nextMonthLabel}
            </h3>
            <span className="rounded-full bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
              {nextMonthRenewals.length}
            </span>
          </div>

          {nextMonthRenewals.length === 0 ? (
            <p className="text-[10px] text-muted-foreground/50">No renewals next month</p>
          ) : (
            <div className="space-y-3">
              {orderedCoaches
                .filter((c) => nextMonthByCoach.has(c))
                .map((coachName) => {
                  const coachStudents = nextMonthByCoach.get(coachName)!;
                  const color = getCoachColor(coachName);
                  return (
                    <div
                      key={coachName}
                      className="rounded-lg border border-border/50 bg-card/40 overflow-hidden"
                      style={{ borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color }}
                        >
                          {coachName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {coachStudents.length} renewal{coachStudents.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="divide-y divide-border/10">
                        {coachStudents.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {s.name}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{fmtMoney(s.monthly_revenue)}/mo</span>
                                {s.payment_plan && PAYMENT_PLAN_CONFIG[s.payment_plan] && (
                                  <span className="text-muted-foreground/50">
                                    {PAYMENT_PLAN_CONFIG[s.payment_plan].label}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 text-[10px] font-medium text-blue-400">
                              {formatDate(s.renewal_date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Churn Comparison Chart
// ===========================================================================

interface MonthData {
  month: string;
  label: string;
  shortLabel: string;
  cancels: number;
  pauses: number;
  downgrades: number;
  restarts: number;
  totalChurn: number;
  revenueLost: number;
  newStudents: number;
  revenueGained: number;
  revenueRestarted: number;
  net: number;
  startOfMonthActive: number;
}

const CHURN_CHART_COLORS: Record<string, string> = {
  Cancels: "#ef4444",
  Pauses: "#f59e0b",
  Downgrades: "#f97316",
  Restarts: "#2dd4bf",
  "New Students": "#22c55e",
};

function ChurnChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const fullLabel = (payload[0]?.payload?.fullLabel as string) ?? label;

  return (
    <div
      style={{
        backgroundColor: "#1e293b",
        border: "1px solid #475569",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc", marginBottom: 8 }}>
        {fullLabel}
      </div>
      {payload.map((entry) => {
        const color = CHURN_CHART_COLORS[entry.name] ?? "#94a3b8";
        return (
          <div
            key={entry.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "3px 0",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: color, fontWeight: 600 }}>
                {entry.name}
              </span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: color }}>
              {entry.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChurnComparisonChart({ data, title = "3-Month Comparison" }: { data: MonthData[]; title?: string }) {
  // Build chart data for Recharts
  const chartData = data.map((d) => ({
    name: d.shortLabel,
    fullLabel: d.label,
    Cancels: d.cancels,
    Pauses: d.pauses,
    Downgrades: d.downgrades,
    Restarts: d.restarts,
    "New Students": d.newStudents,
    revenueLost: d.revenueLost,
    revenueGained: d.revenueGained,
    revenueRestarted: d.revenueRestarted,
    net: d.net,
    startActive: d.startOfMonthActive,
  }));

  return (
    <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
      <h3 className="mb-4 text-xs font-semibold text-foreground">
        {title}
      </h3>

      <div className={data.length <= 6 ? "grid grid-cols-[1fr_auto] gap-6" : ""}>
        {/* Bar chart */}
        <div className={data.length > 6 ? "h-[240px]" : "h-[200px]"}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
              barGap={2}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: data.length > 8 ? 9 : 12, fill: "#e2e8f0", fontWeight: 500 }}
                axisLine={{ stroke: "hsl(var(--border))", opacity: 0.4 }}
                tickLine={false}
                interval={data.length > 12 ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#cbd5e1", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                content={<ChurnChartTooltip />}
              />
              <Bar dataKey="Cancels" stackId="churn" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Pauses" stackId="churn" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Downgrades" stackId="churn" fill="#f97316" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Restarts" fill="#2dd4bf" radius={[2, 2, 0, 0]} />
              <Bar dataKey="New Students" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Side summary - only shown for ≤6 months to avoid clutter */}
        {data.length <= 6 && (
        <div className="flex flex-col justify-center gap-3 min-w-[180px]">
          {data.map((d) => {
            const isPositive = d.net > 0;
            const isNegative = d.net < 0;
            return (
              <div
                key={d.month}
                className="rounded-md border border-border/30 bg-background/30 px-3 py-2"
              >
                <div className="text-[10px] font-medium text-muted-foreground">
                  {d.label}
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground/60">Start:</span>
                    <span className="text-xs font-semibold text-blue-400">{d.startOfMonthActive}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground/60">Net:</span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-muted-foreground"
                      )}
                    >
                      {isPositive ? "+" : ""}{d.net}
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                  <span className="text-red-400/80">-{fmtMoney(d.revenueLost)}</span>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="text-emerald-400/80">+{fmtMoney(d.revenueGained)}</span>
                  {d.revenueRestarted > 0 && (
                    <>
                      <span className="text-muted-foreground/30">/</span>
                      <span className="text-[#2dd4bf]/80">+{fmtMoney(d.revenueRestarted)} restart</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-[#ef4444]" /> Cancels
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-[#f59e0b]" /> Pauses
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-[#f97316]" /> Downgrades
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-[#2dd4bf]" /> Restarts
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm bg-[#22c55e]" /> New Students
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Churn Types
// ===========================================================================

function ChurnTab() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [churnEvents, setChurnEvents] = useState<ChurnEvent[]>([]);
  const [stats, setStats] = useState<ChurnStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [allChurnEvents, setAllChurnEvents] = useState<ChurnEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChurnEvent, setEditingChurnEvent] = useState<ChurnEvent | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [churnSortKey, setChurnSortKey] = useState<"student" | "type" | "date" | "coach" | "revenue" | "tenure" | "plan">("date");
  const [churnSortDir, setChurnSortDir] = useState<"asc" | "desc">("desc");
  const [cohortPaymentFilter, setCohortPaymentFilter] = useState<"all" | "monthly" | "quarterly" | "annual">("all");
  const [churnReductionPct, setChurnReductionPct] = useState(2);
  const [viewMode, setViewMode] = useState<"month" | "range">("month");
  const [rangeStart, setRangeStart] = useState(() => {
    const d = subMonths(new Date(), 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rangeEnd, setRangeEnd] = useState(getCurrentMonth());

  const fetchChurnEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/churn?month=${selectedMonth}`);
      if (!res.ok) return;
      const json = await res.json();
      setChurnEvents(json.events ?? []);
    } catch (err) {
      console.error("[ChurnTab] fetch events:", err);
    }
  }, [selectedMonth]);

  const fetchAllChurnEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/students/churn");
      if (!res.ok) return;
      const json = await res.json();
      setAllChurnEvents(json.events ?? []);
    } catch (err) {
      console.error("[ChurnTab] fetch all events:", err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/stats?month=${selectedMonth}`);
      if (!res.ok) return;
      const json = await res.json();
      setStats(json);
    } catch (err) {
      console.error("[ChurnTab] fetch stats:", err);
    }
  }, [selectedMonth]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch("/api/students");
      if (!res.ok) return;
      const json = await res.json();
      // Exclude partners — they don't pay and shouldn't affect churn/new student metrics
      const all = (json.students ?? []) as Student[];
      setStudents(all.filter((s) => s.member_type !== "partner"));
    } catch (err) {
      console.error("[ChurnTab] fetch students:", err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchChurnEvents(), fetchAllChurnEvents(), fetchStats(), fetchStudents()]).finally(
      () => setLoading(false)
    );
  }, [fetchChurnEvents, fetchAllChurnEvents, fetchStats, fetchStudents]);

  const handleDeleteChurn = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      return;
    }
    try {
      await fetch(`/api/students/churn?id=${id}`, { method: "DELETE" });
      setDeletingId(null);
      fetchChurnEvents();
      fetchAllChurnEvents();
      fetchStats();
    } catch (err) {
      console.error("[ChurnTab] delete:", err);
    }
  };

  const handleChurnSuccess = () => {
    setDialogOpen(false);
    fetchChurnEvents();
    fetchAllChurnEvents();
    fetchStats();
  };

  // Range-filtered events for all views
  const rangeFilteredEvents = useMemo(() => {
    if (viewMode === "month") return churnEvents;
    return allChurnEvents.filter((e) => {
      const m = e.event_date.slice(0, 7);
      return m >= rangeStart && m <= rangeEnd;
    });
  }, [viewMode, churnEvents, allChurnEvents, rangeStart, rangeEnd]);

  // Computed stats from events for the current view
  const negativeChurnEvents = rangeFilteredEvents.filter((e) => e.event_type !== "restart");
  const restartEvents = rangeFilteredEvents.filter((e) => e.event_type === "restart");
  const totalChurned = negativeChurnEvents.length;
  const totalRestarts = restartEvents.length;
  const revenueLost = negativeChurnEvents.reduce(
    (sum, e) => sum + e.monthly_revenue_impact,
    0
  );
  const revenueRestarted = restartEvents.reduce(
    (sum, e) => sum + e.monthly_revenue_impact,
    0
  );

  // New students: in month mode use stats API, in range mode count from students array
  const rangeNewStudents = useMemo(() => {
    if (viewMode === "month") return [];
    return students.filter((s) => {
      const m = s.signup_date.slice(0, 7);
      return m >= rangeStart && m <= rangeEnd;
    });
  }, [viewMode, students, rangeStart, rangeEnd]);

  const newStudents = viewMode === "month" ? (stats?.monthly_new_students ?? 0) : rangeNewStudents.length;
  const newStudentRevenue = viewMode === "month" ? (stats?.monthly_new_revenue ?? 0) : rangeNewStudents.reduce((s, st) => s + st.monthly_revenue, 0);
  const revenueGained = newStudentRevenue + revenueRestarted;
  const netRevenue = revenueGained - revenueLost;

  // Helper: compute start-of-month active count for a given month
  const computeStartOfMonthActive = useCallback((month: string) => {
    const monthStart = `${month}-01`;
    const studentsBeforeMonth = students.filter((s) => s.signup_date < monthStart);
    const eventsBeforeMonth = allChurnEvents.filter((e) => e.event_date < monthStart);
    const churnedBeforeMonth = new Set<string>();
    for (const e of eventsBeforeMonth) {
      if (e.event_type === "restart") {
        churnedBeforeMonth.delete(e.student_id);
      } else {
        churnedBeforeMonth.add(e.student_id);
      }
    }
    const importedInactive = new Set(
      students
        .filter(
          (s) =>
            s.status !== "active" &&
            s.signup_date < monthStart &&
            !allChurnEvents.some((e) => e.student_id === s.id)
        )
        .map((s) => s.id)
    );
    return studentsBeforeMonth.filter(
      (s) => !churnedBeforeMonth.has(s.id) && !importedInactive.has(s.id)
    ).length;
  }, [students, allChurnEvents]);

  // Build comparison data: 3 months in month mode, full range in range mode
  const comparisonData = useMemo(() => {
    const months: string[] = [];
    if (viewMode === "range") {
      // Generate all months from rangeStart to rangeEnd
      let [y, m] = rangeStart.split("-").map(Number);
      const [endY, endM] = rangeEnd.split("-").map(Number);
      while (y < endY || (y === endY && m <= endM)) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) { m = 1; y++; }
      }
    } else {
      const now = new Date();
      for (let i = 2; i >= 0; i--) {
        const d = subMonths(now, i);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    }

    return months.map((month) => {
      const monthEvents = allChurnEvents.filter((e) => e.event_date.startsWith(month));
      const cancels = monthEvents.filter((e) => e.event_type === "cancel");
      const pauses = monthEvents.filter((e) => e.event_type === "pause");
      const downgrades = monthEvents.filter((e) => e.event_type === "downgrade");
      const restarts = monthEvents.filter((e) => e.event_type === "restart");
      const negativeEvents = monthEvents.filter((e) => e.event_type !== "restart");
      const revLost = negativeEvents.reduce((s, e) => s + e.monthly_revenue_impact, 0);
      const revRestarted = restarts.reduce((s, e) => s + e.monthly_revenue_impact, 0);

      const newStudentsInMonth = students.filter((s) => s.signup_date.startsWith(month));
      const newCount = newStudentsInMonth.length;
      const revGained = newStudentsInMonth.reduce((s, st) => s + st.monthly_revenue, 0);

      const startOfMonthActive = computeStartOfMonthActive(month);
      const netChange = newCount + restarts.length - negativeEvents.length;

      return {
        month,
        label: formatMonth(month),
        shortLabel: formatMonth(month).split(" ")[0],
        cancels: cancels.length,
        pauses: pauses.length,
        downgrades: downgrades.length,
        restarts: restarts.length,
        totalChurn: negativeEvents.length,
        revenueLost: revLost,
        newStudents: newCount,
        revenueGained: revGained,
        revenueRestarted: revRestarted,
        net: netChange,
        startOfMonthActive,
      };
    });
  }, [allChurnEvents, students, viewMode, rangeStart, rangeEnd, computeStartOfMonthActive]);

  // Start-of-period active count
  const startOfPeriod = useMemo(() => {
    if (viewMode === "month") {
      const d = comparisonData.find((d) => d.month === selectedMonth);
      return d?.startOfMonthActive ?? 0;
    }
    return computeStartOfMonthActive(rangeStart);
  }, [viewMode, comparisonData, selectedMonth, rangeStart, computeStartOfMonthActive]);

  // Compute churn rate
  const churnRate = startOfPeriod > 0
    ? Math.round((totalChurned / startOfPeriod) * 100 * 100) / 100
    : (stats?.churn_rate ?? 0);

  // Labels that adapt to view mode
  const periodLabel = viewMode === "range" ? formatRangeLabel(rangeStart, rangeEnd) : formatMonth(selectedMonth);
  const startLabel = viewMode === "range" ? "Start of Period" : "Start of Month";

  // Sort toggle helper
  const toggleChurnSort = (key: typeof churnSortKey) => {
    if (churnSortKey === key) {
      setChurnSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setChurnSortKey(key);
      setChurnSortDir(key === "date" || key === "revenue" ? "desc" : "asc");
    }
  };

  // Build a student lookup for sort performance
  const studentById = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  // Sorted events
  const sortedEvents = useMemo(() => {
    const arr = [...rangeFilteredEvents];
    const dir = churnSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (churnSortKey) {
        case "student":
          return dir * (a.student_name || "").localeCompare(b.student_name || "");
        case "type":
          return dir * a.event_type.localeCompare(b.event_type);
        case "date":
          return dir * a.event_date.localeCompare(b.event_date);
        case "coach":
          return dir * (a.coach || "").localeCompare(b.coach || "");
        case "revenue":
          return dir * (a.monthly_revenue_impact - b.monthly_revenue_impact);
        case "tenure": {
          const sa = studentById.get(a.student_id);
          const sb = studentById.get(b.student_id);
          const ta = sa?.signup_date ? (new Date(a.event_date).getTime() - new Date(sa.signup_date).getTime()) : -1;
          const tb = sb?.signup_date ? (new Date(b.event_date).getTime() - new Date(sb.signup_date).getTime()) : -1;
          return dir * (ta - tb);
        }
        case "plan": {
          const pa = studentById.get(a.student_id)?.payment_plan || "";
          const pb = studentById.get(b.student_id)?.payment_plan || "";
          return dir * pa.localeCompare(pb);
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [rangeFilteredEvents, churnSortKey, churnSortDir, studentById]);

  return (
    <>
      {/* Header with view mode toggle + date controls */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Churn Tracker</h2>
            {/* Segmented control */}
            <div className="flex h-8 rounded-md border border-input bg-secondary p-0.5">
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "rounded px-3 text-xs font-medium transition-colors",
                  viewMode === "month"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode("range")}
                className={cn(
                  "rounded px-3 text-xs font-medium transition-colors",
                  viewMode === "range"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Range
              </button>
            </div>
            {/* Date controls */}
            {viewMode === "month" ? (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="month"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="month"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { window.location.href = "/api/students/export?type=churn"; }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button size="sm" onClick={() => { setEditingChurnEvent(undefined); setDialogOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Log Churn Event
            </Button>
          </div>
        </div>
        {/* Preset chips (range mode only) */}
        {viewMode === "range" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60 mr-1">Presets:</span>
            {([
              { key: "last-quarter", label: "Last Quarter" },
              { key: "last-year", label: "Last Year" },
              { key: "ytd", label: "YTD" },
              { key: "last-6", label: "Last 6 Months" },
              { key: "last-12", label: "Last 12 Months" },
              { key: "all-time", label: "All Time" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  const r = getPresetRange(key);
                  setRangeStart(r.start);
                  setRangeEnd(r.end);
                }}
                className="rounded-full border border-border/40 bg-card/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats row 1: People metrics */}
      <div className="mb-3 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <span className="text-[10px] text-muted-foreground">
              {startLabel}
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-blue-400">
            {loading ? "--" : startOfPeriod}
          </p>
          <p className="text-[10px] text-muted-foreground/50">active students</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-red-400" />
            <span className="text-[10px] text-muted-foreground">
              Total Churned
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-red-400">
            {loading ? "--" : totalChurned}
          </p>
          <p className="text-[10px] text-muted-foreground/50">
            {viewMode === "range" ? "in period" : formatMonth(selectedMonth)}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground">
              New Students
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-emerald-400">
            {loading ? "--" : newStudents}
          </p>
          <p className="text-[10px] text-muted-foreground/50">{viewMode === "range" ? "signed up in period" : "signed up this month"}</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <PercentIcon className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] text-muted-foreground">
              Churn Rate
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-amber-400">
            {loading ? "--" : `${churnRate.toFixed(1)}%`}
          </p>
          <p className="text-[10px] text-muted-foreground/50">of active students</p>
        </div>
      </div>

      {/* Stats row 2: Revenue metrics */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-red-400" />
            <span className="text-[10px] text-muted-foreground">
              Revenue Lost
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-red-400">
            {loading ? "--" : `-${fmtMoney(revenueLost)}`}
          </p>
          <p className="text-[10px] text-muted-foreground/50">
            from {totalChurned} churn event{totalChurned !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground">
              Revenue Gained
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold text-emerald-400">
            {loading ? "--" : `+${fmtMoney(revenueGained)}`}
          </p>
          <p className="text-[10px] text-muted-foreground/50">
            {newStudents} new{totalRestarts > 0 ? ` + ${totalRestarts} restart${totalRestarts !== 1 ? "s" : ""}` : ""}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            {netRevenue >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className="text-[10px] text-muted-foreground">
              Net Revenue
            </span>
          </div>
          <p className={cn(
            "mt-1 text-xl font-semibold",
            netRevenue >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {loading ? "--" : `${netRevenue >= 0 ? "+" : "-"}${fmtMoney(Math.abs(netRevenue))}`}
          </p>
          <p className="text-[10px] text-muted-foreground/50">monthly impact</p>
        </div>
      </div>

      {/* Monthly comparison chart */}
      {!loading && comparisonData.length > 0 && (
        <ChurnComparisonChart
          data={comparisonData}
          title={viewMode === "range" ? `${periodLabel} Comparison` : "3-Month Comparison"}
        />
      )}

      {/* Churn events table */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : rangeFilteredEvents.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
          <TrendingDown className="mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">
            No churn events for {periodLabel}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30 bg-card/30">
                {([
                  { key: "student", label: "Student", align: "left" },
                  { key: "type", label: "Type", align: "left" },
                  { key: "date", label: "Date", align: "left" },
                  { key: "coach", label: "Coach", align: "left" },
                  { key: null, label: "Reason", align: "left" },
                  { key: "revenue", label: "Revenue Impact", align: "right" },
                  { key: "tenure", label: "Tenure", align: "right" },
                  { key: "plan", label: "Plan", align: "left" },
                ] as const).map(({ key, label, align }) => (
                  <th
                    key={label}
                    className={cn(
                      "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider",
                      align === "right" ? "text-right" : "text-left",
                      key ? "cursor-pointer select-none hover:text-foreground" : "",
                      key && churnSortKey === key ? "text-foreground" : "text-muted-foreground"
                    )}
                    onClick={key ? () => toggleChurnSort(key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {key && churnSortKey === key && (
                        churnSortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((event) => {
                const typeCfg = CHURN_TYPE_CONFIG[event.event_type];
                const student = studentById.get(event.student_id);
                let tenureMonths: number | null = null;
                if (student?.signup_date && event.event_date) {
                  const diff = (new Date(event.event_date).getTime() - new Date(student.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
                  if (diff >= 0) tenureMonths = Math.round(diff);
                }

                return (
                  <tr
                    key={event.id}
                    className="border-b border-border/10 transition-colors hover:bg-card/30"
                    onClick={() => setDeletingId(null)}
                  >
                    <td className="px-3 py-2.5 text-xs font-medium text-foreground">
                      {event.student_name || "Unknown"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: typeCfg.color + "20",
                          color: typeCfg.color,
                        }}
                      >
                        {typeCfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {event.event_date ? formatDate(event.event_date) : "--"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {event.coach || "--"}
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 text-xs text-muted-foreground">
                      <span className="line-clamp-2">{event.reason || "--"}</span>
                      {event.notes && (
                        <span className="mt-0.5 block line-clamp-2 text-[10px] text-muted-foreground/40">{event.notes}</span>
                      )}
                    </td>
                    <td className={cn(
                      "px-3 py-2.5 text-right font-mono text-xs font-medium",
                      event.event_type === "restart" ? "text-emerald-400" : "text-red-400"
                    )}>
                      {event.event_type === "restart" ? "+" : "-"}{fmtMoney(event.monthly_revenue_impact)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                      {tenureMonths !== null ? `${tenureMonths} mo` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {student?.payment_plan ? (PAYMENT_PLAN_CONFIG[student.payment_plan]?.shortLabel ?? student.payment_plan) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChurnEvent(event);
                            setDialogOpen(true);
                          }}
                          className="rounded p-1 text-muted-foreground/30 transition-colors hover:text-foreground"
                          title="Edit event"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChurn(event.id);
                          }}
                          className={cn(
                            "rounded p-1 transition-colors",
                            deletingId === event.id
                              ? "text-red-400 hover:text-red-300"
                              : "text-muted-foreground/30 hover:text-destructive"
                          )}
                          title={
                            deletingId === event.id
                              ? "Click again to confirm"
                              : "Delete event"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ================================================================ */}
      {/* Sprint 2: Churn by Coach                                       */}
      {/* ================================================================ */}
      {!loading && rangeFilteredEvents.length > 0 && (() => {
        const coachChurn = new Map<string, { cancels: number; pauses: number; downgrades: number; total: number; revenueLost: number }>();
        for (const e of negativeChurnEvents) {
          const coach = e.coach || "Unknown";
          if (!coachChurn.has(coach)) {
            coachChurn.set(coach, { cancels: 0, pauses: 0, downgrades: 0, total: 0, revenueLost: 0 });
          }
          const c = coachChurn.get(coach)!;
          c.total++;
          c.revenueLost += e.monthly_revenue_impact;
          if (e.event_type === "cancel") c.cancels++;
          else if (e.event_type === "pause") c.pauses++;
          else if (e.event_type === "downgrade") c.downgrades++;
        }
        const sorted = Array.from(coachChurn.entries()).sort((a, b) => b[1].total - a[1].total);

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Churn by Coach</h2>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-card/30">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Coach</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cancels</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pauses</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Downgrades</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(([coach, data]) => (
                    <tr key={coach} className="border-b border-border/10">
                      <td className="px-3 py-2 text-xs font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getCoachColor(coach) }} />
                          {coach}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{data.cancels || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{data.pauses || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{data.downgrades || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium text-red-400">{data.total}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-red-400">-{fmtMoney(data.revenueLost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* Sprint 2: Average Tenure at Churn                               */}
      {/* ================================================================ */}
      {!loading && allChurnEvents.length > 0 && (() => {
        // Compute tenure for each churn event (non-restart)
        const tenures: number[] = [];
        for (const e of allChurnEvents) {
          if (e.event_type === "restart") continue;
          const student = students.find((s) => s.id === e.student_id);
          if (!student || !student.signup_date) continue;
          const signup = new Date(student.signup_date);
          const churnDate = new Date(e.event_date);
          const months = (churnDate.getTime() - signup.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
          if (months >= 0) tenures.push(months);
        }

        if (tenures.length === 0) return null;

        tenures.sort((a, b) => a - b);
        const avg = Math.round(tenures.reduce((s, t) => s + t, 0) / tenures.length);
        const median = tenures.length % 2 === 0
          ? Math.round((tenures[Math.floor(tenures.length / 2) - 1] + tenures[Math.floor(tenures.length / 2)]) / 2)
          : Math.round(tenures[Math.floor(tenures.length / 2)]);
        const min = Math.round(Math.min(...tenures));
        const max = Math.round(Math.max(...tenures));

        // Tenure buckets
        const buckets = [
          { label: "0-3 mo", min: 0, max: 3 },
          { label: "3-6 mo", min: 3, max: 6 },
          { label: "6-12 mo", min: 6, max: 12 },
          { label: "12+ mo", min: 12, max: Infinity },
        ];
        const bucketData = buckets.map((b) => ({
          name: b.label,
          count: tenures.filter((t) => t >= b.min && t < b.max).length,
        }));

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Average Tenure at Churn</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="text-lg font-bold text-foreground">{avg} mo</div>
                <div className="text-[10px] text-muted-foreground">Average</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="text-lg font-bold text-foreground">{median} mo</div>
                <div className="text-[10px] text-muted-foreground">Median</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="text-lg font-bold text-foreground">{min}–{max} mo</div>
                <div className="text-[10px] text-muted-foreground">Range</div>
              </div>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/40 p-4">
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={bucketData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7086", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6c7086", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Students" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* Churn by Payment Plan Breakdown                                  */}
      {/* ================================================================ */}
      {!loading && allChurnEvents.length > 0 && (() => {
        // Payment plan group definitions
        const planGroups = [
          { key: "Annual", plans: ["annual", "annual_3pay"], color: "#8b5cf6" },
          { key: "Quarterly", plans: ["quarterly"], color: "#3b82f6" },
          { key: "Monthly", plans: ["monthly"], color: "#f59e0b" },
          { key: "Custom", plans: ["90_day", ""], color: "#6c7086" },
        ] as const;

        const getPlanGroup = (plan: string) => {
          for (const g of planGroups) {
            if ((g.plans as readonly string[]).includes(plan)) return g.key;
          }
          return "Custom";
        };

        // Tenure buckets (same as above)
        const buckets = [
          { label: "0-3 mo", min: 0, max: 3 },
          { label: "3-6 mo", min: 3, max: 6 },
          { label: "6-12 mo", min: 6, max: 12 },
          { label: "12+ mo", min: 12, max: Infinity },
        ];

        // Build per-bucket, per-plan-group counts
        const groupTotals: Record<string, number> = { Annual: 0, Quarterly: 0, Monthly: 0, Custom: 0 };
        const stackedData = buckets.map((b) => {
          const row: Record<string, string | number> = { name: b.label, Annual: 0, Quarterly: 0, Monthly: 0, Custom: 0 };
          for (const e of allChurnEvents) {
            if (e.event_type === "restart") continue;
            const student = students.find((s) => s.id === e.student_id);
            if (!student || !student.signup_date) continue;
            const months = (new Date(e.event_date).getTime() - new Date(student.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
            if (months < b.min || months >= b.max) continue;
            const group = getPlanGroup(student.payment_plan || "");
            (row[group] as number)++;
            groupTotals[group]++;
          }
          return row;
        });

        const totalChurned = Object.values(groupTotals).reduce((s, v) => s + v, 0);
        if (totalChurned === 0) return null;

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Churn by Payment Plan</h2>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {planGroups.map((g) => (
                <div key={g.key} className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="text-lg font-bold" style={{ color: g.color }}>{groupTotals[g.key]}</div>
                  <div className="text-[10px] text-muted-foreground">{g.key} ({totalChurned > 0 ? Math.round((groupTotals[g.key] / totalChurned) * 100) : 0}%)</div>
                </div>
              ))}
            </div>
            {/* Stacked bar chart */}
            <div className="rounded-lg border border-border/50 bg-card/40 p-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stackedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7086", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6c7086", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }} />
                  {planGroups.map((g) => (
                    <Bar key={g.key} dataKey={g.key} stackId="plan" fill={g.color} name={g.key} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                {planGroups.map((g) => (
                  <span key={g.key} className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: g.color }} /> {g.key}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================================================================ */}
      {/* Sprint 2: Pause Outcomes                                        */}
      {/* ================================================================ */}
      {!loading && (() => {
        // Find all students who have at least one pause event
        const pauseStudentIds = new Set(
          allChurnEvents.filter((e) => e.event_type === "pause").map((e) => e.student_id)
        );
        if (pauseStudentIds.size === 0) return null;

        let restarted = 0;
        let cancelledAfterPause = 0;
        let stillPaused = 0;
        const stillPausedStudents: { name: string; pauseDate: string }[] = [];

        for (const sid of pauseStudentIds) {
          const events = allChurnEvents
            .filter((e) => e.student_id === sid)
            .sort((a, b) => a.event_date.localeCompare(b.event_date));
          // Find last pause, then check what happened after
          let lastPauseIdx = -1;
          for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].event_type === "pause") { lastPauseIdx = i; break; }
          }
          if (lastPauseIdx === -1) continue;

          const afterPause = events.slice(lastPauseIdx + 1);
          if (afterPause.some((e) => e.event_type === "restart")) {
            restarted++;
          } else if (afterPause.some((e) => e.event_type === "cancel")) {
            cancelledAfterPause++;
          } else {
            // Check if student is currently paused
            const student = students.find((s) => s.id === sid);
            if (student?.status === "paused") {
              stillPaused++;
              stillPausedStudents.push({ name: student.name, pauseDate: events[lastPauseIdx].event_date });
            } else {
              // Student may have been updated directly without a churn event
              restarted++;
            }
          }
        }

        const total = restarted + cancelledAfterPause + stillPaused;

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Pause Outcomes</h2>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Repeat2 className="h-4 w-4 text-[#22c55e]" />
                </div>
                <div className="text-lg font-bold text-[#22c55e]">{restarted}</div>
                <div className="text-[10px] text-muted-foreground">Restarted ({total > 0 ? Math.round((restarted / total) * 100) : 0}%)</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <X className="h-4 w-4 text-red-400" />
                </div>
                <div className="text-lg font-bold text-red-400">{cancelledAfterPause}</div>
                <div className="text-[10px] text-muted-foreground">Cancelled ({total > 0 ? Math.round((cancelledAfterPause / total) * 100) : 0}%)</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <PauseCircle className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-lg font-bold text-amber-400">{stillPaused}</div>
                <div className="text-[10px] text-muted-foreground">Still Paused ({total > 0 ? Math.round((stillPaused / total) * 100) : 0}%)</div>
              </div>
            </div>
            {stillPausedStudents.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                <h3 className="mb-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Currently Paused</h3>
                <div className="space-y-1">
                  {stillPausedStudents.map((s) => {
                    const days = Math.round((Date.now() - new Date(s.pauseDate).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">paused {days} days ago</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Cohort Retention Curves */}
      {(() => {
        const COHORT_COLORS = ["#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7", "#fab387", "#94e2d5", "#74c7ec", "#b4befe", "#f5c2e7", "#eba0ac", "#f2cdcd"];

        // Filter students by payment plan
        const cohortStudents = cohortPaymentFilter === "all"
          ? students
          : students.filter((s) => {
              if (cohortPaymentFilter === "monthly") return s.payment_plan === "monthly";
              if (cohortPaymentFilter === "quarterly") return s.payment_plan === "quarterly";
              return s.payment_plan === "annual" || s.payment_plan === "annual_3pay";
            });

        // Group by signup month
        const cohorts = new Map<string, typeof cohortStudents>();
        for (const s of cohortStudents) {
          if (!s.signup_date) continue;
          const m = s.signup_date.slice(0, 7);
          if (!cohorts.has(m)) cohorts.set(m, []);
          cohorts.get(m)!.push(s);
        }

        // Filter to cohorts with 1+ students, last 12 months
        const now = new Date();
        const twelveMonthsAgo = new Date(now);
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        const cutoff = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}`;

        const validCohorts = Array.from(cohorts.entries())
          .filter(([m, ss]) => ss.length >= 1 && m >= cutoff)
          .sort(([a], [b]) => a.localeCompare(b));

        // Build retention curve data
        // For each cohort, compute % retained at month 0, 1, 2, ...
        const maxMonthsOut = 12;
        const chartPoints: Record<string, number | string>[] = [];

        for (let offset = 0; offset <= maxMonthsOut; offset++) {
          const point: Record<string, number | string> = { month: offset };
          for (const [cohortMonth, cohortMembers] of validCohorts) {
            // Target date = cohortMonth + offset months
            const [cy, cm] = cohortMonth.split("-").map(Number);
            const targetDate = new Date(cy, cm - 1 + offset + 1, 1); // start of the month AFTER offset
            const targetStr = targetDate.toISOString().slice(0, 10);

            // Only include if target date is in the past
            if (targetDate > now) continue;

            // Check who was still active at targetStr
            let retained = 0;
            for (const s of cohortMembers) {
              // A student is retained if they don't have a net-negative churn event before targetStr
              const studentChurnEvents = allChurnEvents
                .filter((e) => e.student_id === s.id && e.event_date < targetStr)
                .sort((a, b) => a.event_date.localeCompare(b.event_date));

              let churned = false;
              for (const e of studentChurnEvents) {
                if (e.event_type === "restart") churned = false;
                else churned = true;
              }

              // Also check: if student was imported as inactive (no churn event but not active)
              if (!churned && s.status !== "active" && studentChurnEvents.length === 0) {
                // Check if signup was before targetStr
                if (s.signup_date < targetStr) churned = true;
              }

              if (!churned) retained++;
            }

            const pct = Math.round((retained / cohortMembers.length) * 100);
            point[cohortMonth] = pct;
          }
          chartPoints.push(point);
        }

        // Cohort summary table
        const cohortSummary = validCohorts.map(([month, members]) => {
          const activeNow = members.filter((s) => s.status === "active").length;
          const retentionPct = Math.round((activeNow / members.length) * 100);
          const tenures = members
            .filter((s) => s.signup_date)
            .map((s) => (now.getTime() - new Date(s.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
          const medianTenure = tenures.length > 0
            ? Math.round(tenures.sort((a, b) => a - b)[Math.floor(tenures.length / 2)] * 10) / 10
            : 0;
          return { month, label: formatMonth(month), size: members.length, retentionPct, medianTenure };
        });

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Cohort Retention Curves</h2>

            {/* Payment plan filter */}
            <div className="mb-4 flex items-center gap-1 rounded-lg border border-border/50 bg-card/20 p-1" style={{ width: "fit-content" }}>
              {([
                { id: "all", label: "All" },
                { id: "monthly", label: "Monthly" },
                { id: "quarterly", label: "Quarterly" },
                { id: "annual", label: "Annual" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setCohortPaymentFilter(opt.id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    cohortPaymentFilter === opt.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {validCohorts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
                No cohorts found for this filter.
              </div>
            ) : (
              <>
                {/* Retention chart */}
                <div className="mb-4 rounded-lg border border-border/50 bg-card/40 p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartPoints}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: "#6c7086", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        label={{ value: "Months Since Signup", position: "insideBottom", offset: -5, fill: "#6c7086", fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fill: "#6c7086", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 11 }}
                        formatter={((value: number, name: string) => [`${value}%`, formatMonth(name)]) as never}
                        labelFormatter={(label) => `Month ${label}`}
                      />
                      {validCohorts.map(([month], i) => (
                        <Line
                          key={month}
                          type="monotone"
                          dataKey={month}
                          stroke={COHORT_COLORS[i % COHORT_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          name={month}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  {/* Legend */}
                  <div className="mt-2 flex flex-wrap gap-3 justify-center">
                    {validCohorts.map(([month, members], i) => (
                      <span key={month} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COHORT_COLORS[i % COHORT_COLORS.length] }} />
                        {formatMonth(month)} ({members.length})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cohort summary table */}
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/30 bg-card/30">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cohort</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Size</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Retention</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Median Tenure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortSummary.map((c, i) => (
                        <tr key={c.month} className="border-b border-border/10 hover:bg-card/20 transition-colors">
                          <td className="px-3 py-2 text-xs">
                            <span className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COHORT_COLORS[i % COHORT_COLORS.length] }} />
                              {c.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs">{c.size}</td>
                          <td className="px-3 py-2 text-right text-xs">
                            <span className={c.retentionPct >= 70 ? "text-[#22c55e]" : c.retentionPct >= 40 ? "text-[#f59e0b]" : "text-red-400"}>
                              {c.retentionPct}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{c.medianTenure} mo</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Churn Prevention What-If */}
      {(() => {
        const activeStudents = students.filter((s) => s.status === "active");
        const currentMrr = activeStudents.reduce((s, st) => s + st.monthly_revenue, 0);
        const currentCount = activeStudents.length;

        // Historical churn rate: average monthly churn over last 3 months
        const now = new Date();
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const recentNegative = allChurnEvents.filter(
          (e) => e.event_date >= threeMonthsAgo.toISOString().slice(0, 10) && e.event_type !== "restart"
        );
        const baseChurnRate = currentCount > 0
          ? Math.round((recentNegative.length / 3 / currentCount) * 1000) / 10
          : 0;
        const adjustedRate = Math.max(0, baseChurnRate - churnReductionPct);

        // Avg new students per month (last 3 months)
        const threeMonthsAgoMonth = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}`;
        const recentNewStudents = students.filter((s) => s.signup_date && s.signup_date.slice(0, 7) >= threeMonthsAgoMonth);
        const avgNewPerMonth = Math.round(recentNewStudents.length / 3);
        const avgRevPerStudent = currentCount > 0 ? currentMrr / currentCount : 0;

        // Project 12 months
        const projection: { month: number; baseline: number; improved: number; baselineCount: number; improvedCount: number }[] = [];
        let baseMrr = currentMrr;
        let impMrr = currentMrr;
        let baseCount = currentCount;
        let impCount = currentCount;

        for (let i = 1; i <= 12; i++) {
          // Baseline
          const baseLost = Math.round(baseCount * (baseChurnRate / 100));
          baseCount = baseCount - baseLost + avgNewPerMonth;
          baseMrr = Math.round((baseCount) * avgRevPerStudent);

          // Improved
          const impLost = Math.round(impCount * (adjustedRate / 100));
          impCount = impCount - impLost + avgNewPerMonth;
          impMrr = Math.round((impCount) * avgRevPerStudent);

          projection.push({ month: i, baseline: baseMrr, improved: impMrr, baselineCount: baseCount, improvedCount: impCount });
        }

        const finalBaseline = projection[projection.length - 1];
        const studentsRetained = finalBaseline.improvedCount - finalBaseline.baselineCount;
        const revenueSaved = finalBaseline.improved - finalBaseline.baseline;

        return (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Churn Prevention What-If</h2>
            <div className="rounded-lg border border-border/50 bg-card/40 p-4">
              {/* Slider */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">If we reduce monthly churn by:</label>
                  <span className="text-sm font-bold text-foreground">{churnReductionPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={churnReductionPct}
                  onChange={(e) => setChurnReductionPct(Number(e.target.value))}
                  className="w-full accent-[#22c55e]"
                />
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Current churn rate: <span className="text-foreground font-medium">{baseChurnRate}%</span></span>
                  <span>Adjusted: <span className="text-[#22c55e] font-medium">{adjustedRate}%</span></span>
                </div>
              </div>

              {/* Projection chart */}
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={projection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#6c7086", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: "Months", position: "insideBottom", offset: -5, fill: "#6c7086", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#6c7086", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }}
                    formatter={((value: number, name: string) => [fmtMoney(value), name === "baseline" ? "Baseline" : "Improved"]) as never}
                    labelFormatter={(label) => `Month ${label}`}
                  />
                  <Line type="monotone" dataKey="baseline" stroke="#6c7086" strokeWidth={2} dot={false} name="baseline" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="improved" stroke="#22c55e" strokeWidth={2} dot={false} name="improved" />
                  <Legend
                    formatter={(value: string) => value === "baseline" ? "Baseline" : "Improved"}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Summary stats */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                  <div className="text-lg font-bold text-[#22c55e]">+{studentsRetained}</div>
                  <div className="text-[10px] text-muted-foreground">Students Retained</div>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                  <div className="text-lg font-bold text-[#22c55e]">+{fmtMoney(revenueSaved)}</div>
                  <div className="text-[10px] text-muted-foreground">Revenue Saved</div>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{fmtMoney(finalBaseline.improved)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Projected MRR <span className="text-muted-foreground/50">(vs {fmtMoney(finalBaseline.baseline)})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Churn Event Dialog */}
      <ChurnEventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingChurnEvent(undefined); }}
        students={students}
        selectedMonth={selectedMonth}
        onSuccess={() => { setEditingChurnEvent(undefined); handleChurnSuccess(); }}
        event={editingChurnEvent}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Churn Event Dialog
// ---------------------------------------------------------------------------

interface ChurnEventDialogProps {
  open: boolean;
  onClose: () => void;
  students: Student[];
  selectedMonth: string;
  onSuccess: () => void;
  event?: ChurnEvent;
}

function ChurnEventDialog({
  open,
  onClose,
  students,
  selectedMonth,
  onSuccess,
  event,
}: ChurnEventDialogProps) {
  const isEditing = !!event;
  const [studentId, setStudentId] = useState("");
  const [eventType, setEventType] = useState<ChurnType>("cancel");
  const [eventDate, setEventDate] = useState("");
  const [reason, setReason] = useState("");
  const [revenueImpact, setRevenueImpact] = useState("");
  const [coach, setCoach] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Students eligible for the selected event type
  const eligibleStudents = useMemo(() => {
    if (isEditing) return students;
    if (eventType === "restart") {
      // Restarts: show paused or downgraded students
      return students.filter((s) => s.status === "paused" || s.status === "downgraded");
    }
    // Churn events: show active students
    return students.filter((s) => s.status === "active");
  }, [students, eventType, isEditing]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return eligibleStudents;
    const q = studentSearch.toLowerCase();
    return eligibleStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [eligibleStudents, studentSearch]);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setStudentId(event.student_id);
      setEventType(event.event_type);
      setEventDate(event.event_date);
      setReason(event.reason || "");
      setRevenueImpact(event.monthly_revenue_impact.toString());
      setCoach(event.coach || "");
      setNotes(event.notes || "");
      setStudentSearch(event.student_name || "");
    } else {
      setStudentId("");
      setEventType("cancel");
      setEventDate(`${selectedMonth}-01`);
      setReason("");
      setRevenueImpact("");
      setCoach("");
      setNotes("");
      setStudentSearch("");
    }
  }, [open, selectedMonth, event]);

  // Clear student selection when switching event type (different eligible lists)
  const [prevEventType, setPrevEventType] = useState(eventType);
  if (eventType !== prevEventType) {
    setPrevEventType(eventType);
    if (!isEditing) {
      setStudentId("");
      setStudentSearch("");
    }
  }

  // Auto-fill coach and revenue when student is selected (only for new events)
  useEffect(() => {
    if (!studentId || isEditing) return;
    const student = students.find((s) => s.id === studentId);
    if (student) {
      setCoach(student.coach);
      setRevenueImpact(student.monthly_revenue.toString());
    }
  }, [studentId, students, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !eventDate) return;

    setSaving(true);
    try {
      if (isEditing) {
        const payload = {
          event_type: eventType,
          event_date: eventDate,
          reason: reason.trim(),
          monthly_revenue_impact: parseFloat(revenueImpact) || 0,
          coach: coach.trim(),
          notes: notes.trim(),
        };
        const res = await fetch(`/api/students/churn/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to update churn event");
      } else {
        const payload = {
          student_id: studentId,
          event_type: eventType,
          event_date: eventDate,
          reason: reason.trim(),
          monthly_revenue_impact: parseFloat(revenueImpact) || 0,
          coach: coach.trim(),
          notes: notes.trim(),
        };
        const res = await fetch("/api/students/churn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create churn event");
      }

      onSuccess();
    } catch (err) {
      console.error("[ChurnEventDialog] save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {isEditing ? "Edit Churn Event" : "Log Churn Event"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Student picker */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Student
            </label>
            {isEditing ? (
              <Input
                value={studentSearch}
                disabled
                className="text-sm opacity-60"
              />
            ) : (
            <div className="space-y-2">
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students..."
                className="text-sm"
              />
              {studentSearch && filteredStudents.length > 0 && !studentId && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-card/60">
                  {filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStudentId(s.id);
                        setStudentSearch(s.name);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-card/80"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground/50">{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {!studentSearch && (
                <Select
                  value={studentId}
                  onValueChange={(v) => {
                    setStudentId(v);
                    const s = students.find((st) => st.id === v);
                    if (s) setStudentSearch(s.name);
                  }}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            )}
          </div>

          {/* Event type & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Event Type
              </label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as ChurnType)}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cancel">Cancel</SelectItem>
                  <SelectItem value="downgrade">Downgrade</SelectItem>
                  <SelectItem value="pause">Pause</SelectItem>
                  <SelectItem value="restart">Restart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="text-sm [color-scheme:dark]"
                required
              />
            </div>
          </div>

          {/* Revenue Impact & Coach */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Monthly Revenue Impact
              </label>
              <Input
                type="number"
                min="0"
                step="1"
                value={revenueImpact}
                onChange={(e) => setRevenueImpact(e.target.value)}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Coach
              </label>
              <Input
                value={coach}
                onChange={(e) => setCoach(e.target.value)}
                placeholder="Coach name"
                className="text-sm"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Reason
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this student churning?"
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Additional Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional..."
              className="min-h-[40px] resize-none text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!studentId || !eventDate || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Log Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Attendance Tab
// ===========================================================================

function AttendanceTab() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [sessions, setSessions] = useState<EliteSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<EliteSession | undefined>(undefined);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/sessions?month=${selectedMonth}`);
      if (!res.ok) return;
      const json = await res.json();
      setSessions(json.sessions ?? []);
    } catch (err) {
      console.error("[AttendanceTab] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    setLoading(true);
    setExpandedSessionId(null);
    fetchSessions();
  }, [fetchSessions]);

  const handleSessionSuccess = () => {
    setDialogOpen(false);
    setEditingSession(undefined);
    fetchSessions();
  };

  const handleDeleteSession = async (id: string) => {
    if (deletingSessionId !== id) {
      setDeletingSessionId(id);
      return;
    }
    try {
      await fetch(`/api/students/sessions/${id}`, { method: "DELETE" });
      setDeletingSessionId(null);
      fetchSessions();
    } catch (err) {
      console.error("[AttendanceTab] delete session:", err);
    }
  };

  const toggleExpanded = (sessionId: string) => {
    setExpandedSessionId((prev) => (prev === sessionId ? null : sessionId));
  };

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Elite Attendance</h2>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground [color-scheme:dark]"
          />
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
          <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/50">
            No sessions for {formatMonth(selectedMonth)}
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Create a session
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const isExpanded = expandedSessionId === session.id;
            const attendCount = session.attendance_count ?? 0;
            const totalStudents = session.total_students ?? 0;
            const attendPct =
              totalStudents > 0
                ? Math.round((attendCount / totalStudents) * 100)
                : 0;

            const sessionTypeCfg =
              session.session_type === "workshop"
                ? { label: "Workshop", color: "#3b82f6" }
                : { label: "Mastermind", color: "#a855f7" };

            return (
              <div
                key={session.id}
                className="rounded-xl border border-border/50 bg-card/40 overflow-hidden"
              >
                {/* Session header */}
                <button
                  onClick={() => toggleExpanded(session.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {session.title}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: sessionTypeCfg.color + "20",
                          color: sessionTypeCfg.color,
                        }}
                      >
                        {sessionTypeCfg.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>
                        {session.session_date
                          ? formatDate(session.session_date)
                          : "--"}
                      </span>
                      {session.facilitator && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span>Facilitator: {session.facilitator}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Attendance bar */}
                  <div className="shrink-0 w-40">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                      <span>
                        {attendCount}/{totalStudents} attended
                      </span>
                      <span className="font-medium text-foreground">
                        {attendPct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${attendPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSession(session);
                        setDialogOpen(true);
                      }}
                      className="rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                      title="Edit session"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className={cn(
                        "rounded p-1 transition-colors",
                        deletingSessionId === session.id
                          ? "text-red-400 hover:text-red-300"
                          : "text-muted-foreground/40 hover:text-red-400"
                      )}
                      title={deletingSessionId === session.id ? "Click again to confirm" : "Delete session"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="shrink-0 text-muted-foreground/40">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* Expanded attendance checklist */}
                {isExpanded && (
                  <AttendanceChecklist
                    sessionId={session.id}
                    onUpdate={fetchSessions}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Session Dialog (create / edit) */}
      <SessionDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingSession(undefined); }}
        selectedMonth={selectedMonth}
        onSuccess={handleSessionSuccess}
        session={editingSession}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Attendance Checklist (expanded session view)
// ---------------------------------------------------------------------------

interface AttendanceChecklistProps {
  sessionId: string;
  onUpdate: () => void;
}

function AttendanceChecklist({ sessionId, onUpdate }: AttendanceChecklistProps) {
  const [attendance, setAttendance] = useState<EliteAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/students/attendance?session_id=${sessionId}`
      );
      if (!res.ok) return;
      const json = await res.json();
      setAttendance(json.attendance ?? []);
    } catch (err) {
      console.error("[AttendanceChecklist] fetch attendance:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    fetchAttendance().finally(() => setLoading(false));
  }, [fetchAttendance]);

  const handleToggle = async (studentId: string, currentlyAttended: boolean) => {
    const record = attendance.find((a) => a.student_id === studentId);
    try {
      await fetch("/api/students/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          attended: !currentlyAttended,
          notes: record?.notes ?? "",
        }),
      });
      // Optimistic update
      setAttendance((prev) =>
        prev.map((a) =>
          a.student_id === studentId
            ? { ...a, attended: !currentlyAttended }
            : a
        )
      );
      onUpdate();
    } catch (err) {
      console.error("[AttendanceChecklist] toggle:", err);
      // Revert on error
      fetchAttendance();
    }
  };

  const handleSaveNote = async (studentId: string) => {
    const record = attendance.find((a) => a.student_id === studentId);
    try {
      await fetch("/api/students/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          attended: record?.attended ?? false,
          notes: noteText.trim(),
        }),
      });
      setAttendance((prev) =>
        prev.map((a) =>
          a.student_id === studentId ? { ...a, notes: noteText.trim() } : a
        )
      );
      setEditingNoteId(null);
    } catch (err) {
      console.error("[AttendanceChecklist] save note:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center border-t border-border/20">
        <span className="text-xs text-muted-foreground">
          Loading attendance...
        </span>
      </div>
    );
  }

  if (attendance.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center border-t border-border/20">
        <span className="text-xs text-muted-foreground/50">
          No active Elite students found
        </span>
      </div>
    );
  }

  return (
    <div className="border-t border-border/20">
      <div className="grid grid-cols-2 gap-0 sm:grid-cols-3">
        {attendance.map((record) => {
          const attended = !!record.attended;
          const isEditingNote = editingNoteId === record.student_id;

          return (
            <div
              key={record.student_id}
              className={cn(
                "border-b border-r border-border/10",
                attended
                  ? "bg-emerald-500/5"
                  : ""
              )}
            >
              <div className="flex items-center">
                <button
                  onClick={() => handleToggle(record.student_id, attended)}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                    attended
                      ? "hover:bg-emerald-500/10"
                      : "hover:bg-card/60"
                  )}
                >
                  {attended ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                  )}
                  <span
                    className={cn(
                      "text-xs truncate",
                      attended
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {record.student_name}
                  </span>
                </button>
                <button
                  onClick={() => {
                    if (isEditingNote) {
                      setEditingNoteId(null);
                    } else {
                      setEditingNoteId(record.student_id);
                      setNoteText(record.notes || "");
                    }
                  }}
                  className={cn(
                    "shrink-0 p-2 transition-colors",
                    record.notes
                      ? "text-muted-foreground/40 hover:text-muted-foreground"
                      : "text-muted-foreground/15 hover:text-muted-foreground/40"
                  )}
                  title={record.notes || "Add note"}
                >
                  <StickyNote className="h-3 w-3" />
                </button>
              </div>
              {isEditingNote && (
                <div className="px-3 pb-2">
                  <Input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    className="h-7 text-[11px]"
                    autoFocus
                    onBlur={() => handleSaveNote(record.student_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveNote(record.student_id);
                      }
                      if (e.key === "Escape") {
                        setEditingNoteId(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Dialog
// ---------------------------------------------------------------------------

interface SessionDialogProps {
  open: boolean;
  onClose: () => void;
  selectedMonth: string;
  onSuccess: () => void;
  session?: EliteSession;
}

function SessionDialog({
  open,
  onClose,
  selectedMonth,
  onSuccess,
  session,
}: SessionDialogProps) {
  const isEditing = !!session;
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("workshop");
  const [sessionDate, setSessionDate] = useState("");
  const [facilitator, setFacilitator] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (session) {
      setTitle(session.title);
      setSessionType(session.session_type);
      setSessionDate(session.session_date ?? `${selectedMonth}-01`);
      setFacilitator(session.facilitator ?? "");
      setNotes(session.notes ?? "");
    } else {
      setTitle("");
      setSessionType("workshop");
      setSessionDate(`${selectedMonth}-01`);
      setFacilitator("");
      setNotes("");
    }
  }, [open, selectedMonth, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sessionDate) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        session_type: sessionType,
        session_date: sessionDate,
        facilitator: facilitator.trim(),
        notes: notes.trim(),
      };

      const url = isEditing
        ? `/api/students/sessions/${session.id}`
        : "/api/students/sessions";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to ${isEditing ? "update" : "create"} session`);

      onSuccess();
    } catch (err) {
      console.error("[SessionDialog] save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            {isEditing ? "Edit Elite Session" : "New Elite Session"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Session title"
              className="text-sm"
              autoFocus
              required
            />
          </div>

          {/* Session type & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Session Type
              </label>
              <Select
                value={sessionType}
                onValueChange={(v) => setSessionType(v as SessionType)}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="mastermind">Mastermind</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="text-sm [color-scheme:dark]"
                required
              />
            </div>
          </div>

          {/* Facilitator */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Facilitator
            </label>
            <Input
              value={facilitator}
              onChange={(e) => setFacilitator(e.target.value)}
              placeholder="Facilitator name"
              className="text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || !sessionDate || saving}
            >
              {saving
                ? isEditing ? "Saving..." : "Creating..."
                : isEditing ? "Save Changes" : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Capacity Tab
// ===========================================================================

interface ScenarioBoost {
  id: string;
  month: string;       // "YYYY-MM"
  extraSignups: number;
  label: string;       // optional event name
}

function CapacityTab() {
  const [forecast, setForecast] = useState<CapacityForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCoach, setEditingCoach] = useState<CoachCapacityDetail | null>(null);
  const [scenarioBoosts, setScenarioBoosts] = useState<ScenarioBoost[]>([]);

  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch("/api/students/capacity");
      if (!res.ok) return;
      const json = await res.json();
      setForecast(json);
    } catch (err) {
      console.error("[CapacityTab] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Recompute projections when scenario boosts change
  const adjustedForecast = useMemo(() => {
    if (!forecast) return null;
    if (scenarioBoosts.length === 0) return forecast;

    const HIRING_PROCESS_DAYS = 42;
    const ONBOARDING_DAYS = 90;

    // Build a map of month → total extra signups for that month
    const boostMap = new Map<string, number>();
    for (const b of scenarioBoosts) {
      boostMap.set(b.month, (boostMap.get(b.month) ?? 0) + b.extraSignups);
    }

    // Recalculate projections with cumulative boosts
    let cumulativeBoost = 0;
    let newCapacityFullDate: string | null = null;
    let newPreferredFullDate: string | null = null;

    const adjustedProjections = forecast.projections.map((proj, i) => {
      cumulativeBoost += boostMap.get(proj.month) ?? 0;
      const adjusted = proj.projected_students + cumulativeBoost;
      if (!newPreferredFullDate && adjusted >= forecast.preferred_capacity && i > 0) {
        newPreferredFullDate = proj.month;
      }
      if (!newCapacityFullDate && adjusted >= forecast.total_capacity && i > 0) {
        newCapacityFullDate = proj.month;
      }
      return {
        ...proj,
        adjusted_students: adjusted,
      };
    });

    // Recompute hiring dates
    let newPostJobDate: string | null = null;
    let newHireByDate: string | null = null;
    if (newCapacityFullDate) {
      const [y, mo] = (newCapacityFullDate as string).split("-").map(Number);
      const fullDate = new Date(y, mo - 1, 1);
      const hireDateObj = new Date(fullDate);
      hireDateObj.setDate(hireDateObj.getDate() - ONBOARDING_DAYS);
      newHireByDate = `${hireDateObj.getFullYear()}-${String(hireDateObj.getMonth() + 1).padStart(2, "0")}-${String(hireDateObj.getDate()).padStart(2, "0")}`;
      const postDateObj = new Date(hireDateObj);
      postDateObj.setDate(postDateObj.getDate() - HIRING_PROCESS_DAYS);
      newPostJobDate = `${postDateObj.getFullYear()}-${String(postDateObj.getMonth() + 1).padStart(2, "0")}-${String(postDateObj.getDate()).padStart(2, "0")}`;
    }

    return {
      ...forecast,
      projections: adjustedProjections,
      capacity_full_date: newCapacityFullDate,
      preferred_full_date: newPreferredFullDate,
      post_job_date: newPostJobDate,
      hire_by_date: newHireByDate,
    };
  }, [forecast, scenarioBoosts]);

  const hasBoosts = scenarioBoosts.length > 0;

  // Compute second hire timeline — assumes adding a new coach with capacity
  // equal to the average max_students of current active/limited coaches
  const secondHire = useMemo(() => {
    if (!adjustedForecast || !forecast) return null;
    if (!adjustedForecast.capacity_full_date) return null;

    const HIRING_PROCESS_DAYS = 42;
    const ONBOARDING_DAYS = 90;

    // Assumed new coach capacity = average of active/limited coaches' max_students
    const activeCoaches = forecast.coaches.filter((c) => c.status !== "inactive");
    const assumedMax = activeCoaches.length > 0
      ? Math.round(activeCoaches.reduce((sum, c) => sum + c.max_students, 0) / activeCoaches.length)
      : 20;
    const expandedCapacity = forecast.total_capacity + assumedMax;

    // Scan adjusted projections for when students exceed expanded capacity
    const projections = adjustedForecast.projections;
    let secondFullDate: string | null = null;
    for (let i = 1; i < projections.length; i++) {
      const students = (projections[i] as CapacityProjection & { adjusted_students?: number }).adjusted_students ?? projections[i].projected_students;
      if (students >= expandedCapacity) {
        secondFullDate = projections[i].month;
        break;
      }
    }

    if (!secondFullDate) return { assumedMax, expandedCapacity, capacity_full_date: null, hire_by_date: null, post_job_date: null };

    const [y, mo] = secondFullDate.split("-").map(Number);
    const fullDate = new Date(y, mo - 1, 1);
    const hireDateObj = new Date(fullDate);
    hireDateObj.setDate(hireDateObj.getDate() - ONBOARDING_DAYS);
    const hireByDate = `${hireDateObj.getFullYear()}-${String(hireDateObj.getMonth() + 1).padStart(2, "0")}-${String(hireDateObj.getDate()).padStart(2, "0")}`;
    const postDateObj = new Date(hireDateObj);
    postDateObj.setDate(postDateObj.getDate() - HIRING_PROCESS_DAYS);
    const postJobDate = `${postDateObj.getFullYear()}-${String(postDateObj.getMonth() + 1).padStart(2, "0")}-${String(postDateObj.getDate()).padStart(2, "0")}`;

    return { assumedMax, expandedCapacity, capacity_full_date: secondFullDate, hire_by_date: hireByDate, post_job_date: postJobDate };
  }, [adjustedForecast, forecast]);

  // Chart data: include adjusted_students field when boosts exist
  const chartData = useMemo(() => {
    if (!adjustedForecast) return [];
    return adjustedForecast.projections.map((p) => ({
      ...p,
      adjusted_students: (p as CapacityProjection & { adjusted_students?: number }).adjusted_students ?? p.projected_students,
    }));
  }, [adjustedForecast]);

  // Per-coach projection breakdown — distributes projected total across coaches
  // and introduces "New Coach" after first hire onboarding completes
  const coachProjections = useMemo(() => {
    if (!forecast || !adjustedForecast) return null;

    const activeCoaches = forecast.coaches.filter((c) => c.status !== "inactive");
    if (activeCoaches.length === 0) return null;

    // New coach becomes ready at capacity_full_date (hire_by + 90 days onboarding)
    const newCoachReadyMonth = adjustedForecast.capacity_full_date;
    const newCoachMax = secondHire?.assumedMax ?? 20;

    // Mutable simulation state
    const coaches = activeCoaches.map((c) => ({
      name: c.coach_name,
      count: c.active_students,
      max: c.max_students,
      isNew: false,
    }));

    const rows: {
      month: string;
      label: string;
      coaches: { name: string; count: number; max: number; isNew: boolean }[];
      total: number;
    }[] = [];

    for (let i = 0; i < adjustedForecast.projections.length; i++) {
      const proj = adjustedForecast.projections[i];
      const targetTotal =
        (proj as CapacityProjection & { adjusted_students?: number }).adjusted_students ??
        proj.projected_students;

      if (i === 0) {
        rows.push({
          month: proj.month,
          label: proj.label,
          coaches: coaches.map((c) => ({ ...c })),
          total: coaches.reduce((s, c) => s + c.count, 0),
        });
        continue;
      }

      // Add new coach when onboarding completes
      if (
        newCoachReadyMonth &&
        proj.month >= newCoachReadyMonth &&
        !coaches.some((c) => c.isNew)
      ) {
        coaches.push({ name: "New Coach", count: 0, max: newCoachMax, isNew: true });
      }

      const currentTotal = coaches.reduce((s, c) => s + c.count, 0);
      let delta = Math.round(targetTotal - currentTotal);

      if (delta > 0) {
        // Pass 1: fill coaches up to their max
        const withRoom = coaches.filter((c) => c.count < c.max);
        if (withRoom.length > 0) {
          const totalRoom = withRoom.reduce((s, c) => s + (c.max - c.count), 0);
          const toFill = Math.min(delta, totalRoom);
          let given = 0;
          for (let j = 0; j < withRoom.length; j++) {
            const room = withRoom[j].max - withRoom[j].count;
            const share =
              j === withRoom.length - 1
                ? toFill - given
                : Math.round((toFill * room) / totalRoom);
            const actual = Math.min(share, room);
            withRoom[j].count += actual;
            given += actual;
          }
          delta -= given;
        }
        // Pass 2: overflow — everyone shares the excess
        if (delta > 0) {
          const totalMax = coaches.reduce((s, c) => s + c.max, 0);
          let given = 0;
          for (let j = 0; j < coaches.length; j++) {
            const share =
              j === coaches.length - 1
                ? delta - given
                : Math.round((delta * coaches[j].max) / totalMax);
            coaches[j].count += share;
            given += share;
          }
        }
      } else if (delta < 0) {
        // Churn: remove proportionally from current counts
        let toRemove = Math.abs(delta);
        const total = coaches.reduce((s, c) => s + c.count, 0);
        if (total > 0) {
          let removed = 0;
          for (let j = 0; j < coaches.length; j++) {
            const share =
              j === coaches.length - 1
                ? toRemove - removed
                : Math.round((toRemove * coaches[j].count) / total);
            const actual = Math.min(share, coaches[j].count);
            coaches[j].count -= actual;
            removed += actual;
          }
        }
      }

      rows.push({
        month: proj.month,
        label: proj.label,
        coaches: coaches.map((c) => ({ ...c })),
        total: coaches.reduce((s, c) => s + c.count, 0),
      });
    }

    return rows;
  }, [forecast, adjustedForecast, secondHire]);

  // All coach names that appear across all projection rows (including New Coach)
  const allCoachNames = useMemo(() => {
    if (!coachProjections) return [];
    const names = new Set<string>();
    for (const row of coachProjections) {
      for (const c of row.coaches) names.add(c.name);
    }
    return Array.from(names);
  }, [coachProjections]);

  // Helpers for scenario management
  const addBoost = () => {
    if (!forecast) return;
    // Default to next month after today
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const defaultMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setScenarioBoosts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), month: defaultMonth, extraSignups: 0, label: "" },
    ]);
  };

  const removeBoost = (id: string) => {
    setScenarioBoosts((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBoost = (id: string, updates: Partial<ScenarioBoost>) => {
    setScenarioBoosts((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!forecast || !adjustedForecast) {
    return (
      <div className="flex h-32 items-center justify-center">
        <span className="text-xs text-muted-foreground">Failed to load capacity data.</span>
      </div>
    );
  }

  return (
    <>
      {/* A) Summary Stats */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-foreground">{forecast.current_active}</div>
          <div className="text-[10px] text-muted-foreground">Active Students</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-foreground">{forecast.total_capacity}</div>
          <div className="text-[10px] text-muted-foreground">Total Capacity</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold text-[#22c55e]">{forecast.available_slots}</div>
          <div className="text-[10px] text-muted-foreground">Available Slots</div>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
          <div className="text-lg font-bold" style={{ color: forecast.utilization_pct >= 90 ? "#ef4444" : forecast.utilization_pct >= 75 ? "#f59e0b" : "#22c55e" }}>
            {forecast.utilization_pct}%
          </div>
          <div className="text-[10px] text-muted-foreground">Utilization</div>
        </div>
      </div>

      {/* B) Hire-By Alert Banner — uses adjusted forecast when boosts exist */}
      <HireByBanner forecast={adjustedForecast} secondHire={secondHire} />

      {/* C) What-If Scenarios */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">What-If Scenarios</h2>
          {hasBoosts && (
            <button
              onClick={() => setScenarioBoosts([])}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset All
            </button>
          )}
        </div>
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          {scenarioBoosts.length > 0 && (
            <div className="space-y-2 mb-3">
              {scenarioBoosts.map((boost) => (
                <div key={boost.id} className="flex items-center gap-2">
                  <Select
                    value={boost.month}
                    onValueChange={(v) => updateBoost(boost.id, { month: v })}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {forecast.projections.slice(1).map((p) => (
                        <SelectItem key={p.month} value={p.month}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={boost.extraSignups || ""}
                    onChange={(e) =>
                      updateBoost(boost.id, {
                        extraSignups: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-[70px] h-8 text-xs text-center"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">students</span>
                  <Input
                    value={boost.label}
                    onChange={(e) => updateBoost(boost.id, { label: e.target.value })}
                    className="flex-1 h-8 text-xs"
                    placeholder="Event name"
                  />
                  <button
                    onClick={() => removeBoost(boost.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-border/30 hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={addBoost}
            className="text-xs h-7"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      {/* D) Projection Chart */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">12-Month Capacity Projection</h2>
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24,24,27,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#e4e4e7", fontWeight: 600 }}
              />
              <ReferenceLine
                y={forecast.total_capacity}
                stroke="#ef4444"
                strokeDasharray="6 3"
                label={{
                  value: `Max (${forecast.total_capacity})`,
                  position: "right",
                  fill: "#ef4444",
                  fontSize: 10,
                }}
              />
              <ReferenceLine
                y={forecast.preferred_capacity}
                stroke="#f59e0b"
                strokeDasharray="6 3"
                label={{
                  value: `Preferred (${forecast.preferred_capacity})`,
                  position: "right",
                  fill: "#f59e0b",
                  fontSize: 10,
                }}
              />
              {secondHire && secondHire.expandedCapacity && (
                <ReferenceLine
                  y={secondHire.expandedCapacity}
                  stroke="#8b5cf6"
                  strokeDasharray="6 3"
                  label={{
                    value: `+1 Coach (${secondHire.expandedCapacity})`,
                    position: "right",
                    fill: "#8b5cf6",
                    fontSize: 10,
                  }}
                />
              )}
              {hasBoosts ? (
                <>
                  {/* Baseline as thin dashed line */}
                  <Area
                    type="monotone"
                    dataKey="projected_students"
                    name="Baseline"
                    stroke="#3b82f6"
                    strokeDasharray="4 4"
                    fill="none"
                    strokeWidth={1.5}
                  />
                  {/* Adjusted as solid purple area */}
                  <Area
                    type="monotone"
                    dataKey="adjusted_students"
                    name="With Events"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="projected_students"
                  name="Projected Students"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* E) Projection Breakdown Table */}
      {coachProjections && coachProjections.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Projection Breakdown</h2>
          <div className="rounded-lg border border-border/50 bg-card/40 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="sticky left-0 bg-card/95 px-3 py-2 text-left font-semibold text-muted-foreground">Month</th>
                  {allCoachNames.map((name) => (
                    <th
                      key={name}
                      className="px-3 py-2 text-center font-semibold whitespace-nowrap"
                      style={{ color: name === "New Coach" ? "#8b5cf6" : getCoachColor(name) }}
                    >
                      {name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {coachProjections.map((row, rowIdx) => {
                  const isCurrentMonth = rowIdx === 0;
                  const isNewCoachStart =
                    adjustedForecast?.capacity_full_date &&
                    row.month === adjustedForecast.capacity_full_date;
                  return (
                    <tr
                      key={row.month}
                      className={cn(
                        "border-b border-border/20 transition-colors",
                        isCurrentMonth && "bg-foreground/[0.03]",
                        isNewCoachStart && "bg-[#8b5cf6]/[0.04]"
                      )}
                    >
                      <td className="sticky left-0 bg-card/95 px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap">
                        {row.label}
                        {isCurrentMonth && (
                          <span className="ml-1.5 text-[9px] text-muted-foreground/60">(now)</span>
                        )}
                        {isNewCoachStart && (
                          <span className="ml-1.5 text-[9px] text-[#8b5cf6]">+coach</span>
                        )}
                      </td>
                      {allCoachNames.map((name) => {
                        const coachData = row.coaches.find((c) => c.name === name);
                        if (!coachData) {
                          return (
                            <td key={name} className="px-3 py-1.5 text-center text-muted-foreground/40">
                              —
                            </td>
                          );
                        }
                        const overMax = coachData.count > coachData.max;
                        const atMax = coachData.count === coachData.max;
                        return (
                          <td
                            key={name}
                            className={cn(
                              "px-3 py-1.5 text-center tabular-nums",
                              overMax
                                ? "font-bold text-[#ef4444]"
                                : atMax
                                ? "font-semibold text-[#f59e0b]"
                                : "text-foreground"
                            )}
                          >
                            {coachData.count}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-center font-semibold tabular-nums text-foreground">
                        {row.total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
            <span><span className="text-[#f59e0b]">Yellow</span> = at max</span>
            <span><span className="text-[#ef4444]">Red</span> = over max</span>
            {adjustedForecast?.capacity_full_date && (
              <span><span className="text-[#8b5cf6]">+coach</span> = new hire starts</span>
            )}
          </div>
        </div>
      )}

      {/* F) Coach Capacity Cards (current) */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">Coach Capacity</h2>
        <div className="grid grid-cols-2 gap-4">
          {forecast.coaches.map((coach) => (
            <CoachCapacityCard
              key={coach.id}
              coach={coach}
              onEdit={() => setEditingCoach(coach)}
            />
          ))}
        </div>
      </div>

      {/* G) Edit Dialog */}
      {editingCoach && (
        <CoachEditDialog
          coach={editingCoach}
          open={!!editingCoach}
          onClose={() => setEditingCoach(null)}
          onSuccess={() => {
            setEditingCoach(null);
            fetchForecast();
          }}
        />
      )}

      {/* H) Growth Assumptions */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">Growth Assumptions</h2>
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-sm font-bold text-[#22c55e]">
                +{forecast.avg_monthly_signups}
              </div>
              <div className="text-[10px] text-muted-foreground">Avg Monthly Signups</div>
            </div>
            <div>
              <div className="text-sm font-bold text-[#ef4444]">
                -{forecast.avg_monthly_churn}
              </div>
              <div className="text-[10px] text-muted-foreground">Avg Monthly Churn</div>
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: forecast.net_monthly_growth >= 0 ? "#3b82f6" : "#ef4444" }}>
                {forecast.net_monthly_growth >= 0 ? "+" : ""}{forecast.net_monthly_growth}
              </div>
              <div className="text-[10px] text-muted-foreground">Net Monthly Growth</div>
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">
                {forecast.months_of_data}
              </div>
              <div className="text-[10px] text-muted-foreground">Months of Data</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hire-By Alert Banner
// ---------------------------------------------------------------------------

interface SecondHireData {
  assumedMax: number;
  expandedCapacity: number;
  capacity_full_date: string | null;
  hire_by_date: string | null;
  post_job_date: string | null;
}

function HireByBanner({ forecast, secondHire }: { forecast: CapacityForecast; secondHire?: SecondHireData | null }) {
  if (!forecast.hire_by_date && !forecast.preferred_full_date) {
    // No hiring needed in the projection window
    return (
      <div className="mb-6 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e]/20">
            <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#22c55e]">No Hiring Needed</div>
            <div className="text-xs text-muted-foreground">
              Current capacity can absorb projected growth for the next 12 months.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate urgency based on the EARLIEST action date (post job listing)
  const now = new Date();
  let daysUntilPost: number | null = null;
  let daysUntilHire: number | null = null;
  if (forecast.post_job_date) {
    daysUntilPost = Math.ceil((new Date(forecast.post_job_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  if (forecast.hire_by_date) {
    daysUntilHire = Math.ceil((new Date(forecast.hire_by_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Urgency is based on when you need to post the job (the first action)
  const daysUntilAction = daysUntilPost ?? daysUntilHire;
  const isPast = daysUntilAction !== null && daysUntilAction <= 0;
  const isUrgent = daysUntilAction !== null && daysUntilAction <= 30;
  const isWarning = daysUntilAction !== null && daysUntilAction <= 90;

  const borderColor = isPast || isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : "#3b82f6";
  const bgColor = isPast || isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : "#3b82f6";
  const IconComponent = isPast || isUrgent ? AlertTriangle : isWarning ? Clock : Info;

  // Second hire urgency (always informational, never urgent — it's farther out)
  let daysUntilSecondPost: number | null = null;
  if (secondHire?.post_job_date) {
    daysUntilSecondPost = Math.ceil((new Date(secondHire.post_job_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div
      className="mb-6 rounded-lg border p-4"
      style={{ borderColor: `${borderColor}30`, backgroundColor: `${bgColor}08` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${bgColor}20` }}
        >
          <IconComponent className="h-4 w-4" style={{ color: bgColor }} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: bgColor }}>
            {isPast
              ? "Hiring Overdue!"
              : !forecast.post_job_date && !forecast.hire_by_date
              ? "Preferred Capacity Approaching"
              : `Post Job By: ${forecast.post_job_date ? formatDate(forecast.post_job_date) : "—"}`}
          </div>
          {isPast && (
            <div className="mt-1 text-xs text-muted-foreground">
              You should already be recruiting — capacity will be exceeded soon.
            </div>
          )}

          {/* First hire timeline */}
          {(forecast.post_job_date || forecast.hire_by_date) && !isPast && (
            <div className="mt-3 flex items-center gap-0 text-xs">
              {/* Step 1: Post Job */}
              {forecast.post_job_date && (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: bgColor }}>1</div>
                    <div className="mt-1 font-medium" style={{ color: bgColor }}>{formatDate(forecast.post_job_date)}</div>
                    <div className="text-muted-foreground">Post job listing</div>
                    {daysUntilPost !== null && <div className="text-muted-foreground/70">{daysUntilPost} days from now</div>}
                  </div>
                  <div className="relative mx-2 flex-1 min-w-[24px] flex flex-col items-center justify-center">
                    <div className="h-px w-full" style={{ backgroundColor: `${bgColor}40` }} />
                    <div className="absolute text-[9px] text-muted-foreground/60 -top-2.5">~6 wks</div>
                  </div>
                </>
              )}
              {/* Step 2: Start Onboarding */}
              {forecast.hire_by_date && (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: bgColor }}>2</div>
                    <div className="mt-1 font-medium" style={{ color: bgColor }}>{formatDate(forecast.hire_by_date)}</div>
                    <div className="text-muted-foreground">Start onboarding</div>
                    <div className="text-muted-foreground/70">New coach hired</div>
                  </div>
                  <div className="relative mx-2 flex-1 min-w-[24px] flex flex-col items-center justify-center">
                    <div className="h-px w-full" style={{ backgroundColor: `${bgColor}40` }} />
                    <div className="absolute text-[9px] text-muted-foreground/60 -top-2.5">90 days</div>
                  </div>
                </>
              )}
              {/* Step 3: Coach Ready / At Capacity */}
              {forecast.capacity_full_date && (
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: bgColor }}>3</div>
                  <div className="mt-1 font-medium" style={{ color: bgColor }}>{formatMonth(forecast.capacity_full_date)}</div>
                  <div className="text-muted-foreground">Coach ready</div>
                  <div className="text-muted-foreground/70">At capacity ({forecast.total_capacity})</div>
                </div>
              )}
            </div>
          )}

          {/* Additional context */}
          <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
            {forecast.preferred_full_date && (
              <div>Preferred capacity full: {formatMonth(forecast.preferred_full_date)}</div>
            )}
            <div>
              Net growth: {forecast.net_monthly_growth >= 0 ? "+" : ""}{forecast.net_monthly_growth} students/month
            </div>
          </div>

          {/* Second hire timeline */}
          {secondHire && secondHire.capacity_full_date && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <div className="text-xs font-semibold text-[#8b5cf6] mb-2">
                Second Hire (assuming new coach takes {secondHire.assumedMax} students)
              </div>
              <div className="flex items-center gap-0 text-xs">
                {secondHire.post_job_date && (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white bg-[#8b5cf6]">1</div>
                      <div className="mt-1 font-medium text-[#8b5cf6]">{formatDate(secondHire.post_job_date)}</div>
                      <div className="text-muted-foreground">Post job listing</div>
                      {daysUntilSecondPost !== null && <div className="text-muted-foreground/70">{daysUntilSecondPost} days from now</div>}
                    </div>
                    <div className="relative mx-2 flex-1 min-w-[24px] flex flex-col items-center justify-center">
                      <div className="h-px w-full bg-[#8b5cf6]/40" />
                      <div className="absolute text-[9px] text-muted-foreground/60 -top-2.5">~6 wks</div>
                    </div>
                  </>
                )}
                {secondHire.hire_by_date && (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white bg-[#8b5cf6]">2</div>
                      <div className="mt-1 font-medium text-[#8b5cf6]">{formatDate(secondHire.hire_by_date)}</div>
                      <div className="text-muted-foreground">Start onboarding</div>
                      <div className="text-muted-foreground/70">New coach hired</div>
                    </div>
                    <div className="relative mx-2 flex-1 min-w-[24px] flex flex-col items-center justify-center">
                      <div className="h-px w-full bg-[#8b5cf6]/40" />
                      <div className="absolute text-[9px] text-muted-foreground/60 -top-2.5">90 days</div>
                    </div>
                  </>
                )}
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white bg-[#8b5cf6]">3</div>
                  <div className="mt-1 font-medium text-[#8b5cf6]">{formatMonth(secondHire.capacity_full_date)}</div>
                  <div className="text-muted-foreground">Coach ready</div>
                  <div className="text-muted-foreground/70">At capacity ({secondHire.expandedCapacity})</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach Capacity Card
// ---------------------------------------------------------------------------

function CoachCapacityCard({
  coach,
  onEdit,
}: {
  coach: CoachCapacityDetail;
  onEdit: () => void;
}) {
  const color = getCoachColor(coach.coach_name);
  const fillPct = coach.max_students > 0
    ? Math.min((coach.active_students / coach.max_students) * 100, 100)
    : 0;
  const preferredPct = coach.max_students > 0
    ? (coach.preferred_max / coach.max_students) * 100
    : 0;

  const statusCfg = COACH_STATUS_CONFIG[coach.status as CoachStatus] ?? COACH_STATUS_CONFIG.active;

  return (
    <div
      className="rounded-lg border border-border/50 bg-card/40 p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: color + "20", color }}
          >
            {coach.coach_name}
          </span>
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{ backgroundColor: statusCfg.color + "20", color: statusCfg.color }}
          >
            {statusCfg.label}
          </span>
        </div>
        <button
          onClick={onEdit}
          className="rounded p-1 text-muted-foreground hover:bg-border/30 hover:text-foreground transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      {/* Progress bar with preferred marker */}
      <div className="relative mb-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/30">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${fillPct}%`,
              backgroundColor: fillPct >= 100 ? "#ef4444" : fillPct >= preferredPct ? "#f59e0b" : color,
            }}
          />
        </div>
        {/* Preferred max marker line */}
        {preferredPct < 100 && (
          <div
            className="absolute top-0 h-3 w-0.5 bg-foreground/40"
            style={{ left: `${preferredPct}%` }}
            title={`Preferred max: ${coach.preferred_max}`}
          />
        )}
      </div>

      {/* Counts */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{coach.active_students}</span>
          {" / "}
          {coach.max_students} (preferred: {coach.preferred_max})
        </span>
        <span className="font-medium" style={{ color: fillPct >= preferredPct ? "#f59e0b" : "#22c55e" }}>
          {Math.round(fillPct)}%
        </span>
      </div>

      {/* Notes */}
      {coach.notes && (
        <div className="mt-2 text-[10px] text-muted-foreground italic">
          {coach.notes}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach Edit Dialog
// ---------------------------------------------------------------------------

// ===========================================================================
// Revenue Tab (Sprint 1 + Sprint 3)
// ===========================================================================

function RevenueTab() {
  const [mrrData, setMrrData] = useState<MrrHistoryResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [allChurnEvents, setAllChurnEvents] = useState<ChurnEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Scenario state (Sprint 3)
  const [scenarioPriceIncrease, setScenarioPriceIncrease] = useState(0);
  const [scenarioApplyTo, setScenarioApplyTo] = useState<"all" | "elite" | "accelerator">("all");
  const [scenarioNewStudents, setScenarioNewStudents] = useState("");
  const [scenarioChurnRate, setScenarioChurnRate] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/students/mrr-history").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/students/churn").then((r) => r.json()),
    ])
      .then(([mrr, stu, churn]) => {
        setMrrData(mrr);
        setStudents(stu.students ?? []);
        setAllChurnEvents(churn.events ?? []);
      })
      .catch((err) => console.error("[RevenueTab] fetch:", err))
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // A) MRR Summary Cards
  // -------------------------------------------------------------------------
  const summaryStats = useMemo(() => {
    if (!mrrData || mrrData.months.length === 0) return null;
    const latest = mrrData.months[mrrData.months.length - 1];
    const prev = mrrData.months.length > 1 ? mrrData.months[mrrData.months.length - 2] : null;
    const growth = prev ? latest.total_mrr - prev.total_mrr : 0;
    const growthPct = prev && prev.total_mrr > 0 ? (growth / prev.total_mrr) * 100 : 0;
    return {
      currentMrr: latest.total_mrr,
      growth,
      growthPct,
      avgRevenue: mrrData.concentration.avg_revenue,
      medianRevenue: mrrData.concentration.median_revenue,
    };
  }, [mrrData]);

  // -------------------------------------------------------------------------
  // NRR (Net Revenue Retention) computation
  // -------------------------------------------------------------------------
  const nrrData = useMemo(() => {
    if (!mrrData || mrrData.months.length < 2) return null;
    const months = mrrData.months;
    const nrrValues: { month: string; nrr: number }[] = [];
    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1].total_mrr;
      if (prev > 0) {
        nrrValues.push({
          month: months[i].month,
          nrr: Math.round((months[i].total_mrr / prev) * 1000) / 10,
        });
      }
    }
    const latest = nrrValues.length > 0 ? nrrValues[nrrValues.length - 1].nrr : 100;
    const last3 = nrrValues.slice(-3);
    const trailing3mo = last3.length > 0 ? Math.round(last3.reduce((s, v) => s + v.nrr, 0) / last3.length * 10) / 10 : latest;
    const sparkline = nrrValues.slice(-6);
    return { latest, trailing3mo, sparkline };
  }, [mrrData]);

  // -------------------------------------------------------------------------
  // B) Chart data (last 12 months + 6 month projection)
  // -------------------------------------------------------------------------
  const chartData = useMemo(() => {
    if (!mrrData || mrrData.months.length === 0) return [];
    const last12 = mrrData.months.slice(-12);

    // Compute trailing 3-month avg growth rate
    const recent = mrrData.months.slice(-4); // need 4 to get 3 deltas
    let avgGrowthRate = 0;
    if (recent.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        if (recent[i - 1].total_mrr > 0) {
          deltas.push((recent[i].total_mrr - recent[i - 1].total_mrr) / recent[i - 1].total_mrr);
        }
      }
      if (deltas.length > 0) {
        avgGrowthRate = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      }
    }

    // Build historical entries
    const entries = last12.map((m) => ({
      month: m.month,
      label: formatMonth(m.month),
      total_mrr: m.total_mrr,
      elite_mrr: m.elite_mrr,
      accelerator_mrr: m.accelerator_mrr,
      projected_mrr: null as number | null,
    }));

    // Add 6 projected months
    const lastMonth = mrrData.months[mrrData.months.length - 1];
    let projMrr = lastMonth.total_mrr;
    let [py, pm] = lastMonth.month.split("-").map(Number);
    for (let i = 0; i < 6; i++) {
      pm++;
      if (pm > 12) { pm = 1; py++; }
      projMrr = Math.round(projMrr * (1 + avgGrowthRate));
      const monthStr = `${py}-${String(pm).padStart(2, "0")}`;
      entries.push({
        month: monthStr,
        label: formatMonth(monthStr),
        total_mrr: null as unknown as number,
        elite_mrr: null as unknown as number,
        accelerator_mrr: null as unknown as number,
        projected_mrr: projMrr,
      });
    }

    return entries;
  }, [mrrData]);

  // -------------------------------------------------------------------------
  // C) Concentration: Top 5 students
  // -------------------------------------------------------------------------
  const top5Students = useMemo(() => {
    return [...students]
      .filter((s) => s.status === "active")
      .sort((a, b) => b.monthly_revenue - a.monthly_revenue)
      .slice(0, 5);
  }, [students]);

  // -------------------------------------------------------------------------
  // E) Program Comparison (Sprint 3)
  // -------------------------------------------------------------------------
  const programComparison = useMemo(() => {
    const active = students.filter((s) => s.status === "active");
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

    const compute = (program: string) => {
      const programStudents = active.filter((s) => s.program === program);
      const mrr = programStudents.reduce((s, st) => s + st.monthly_revenue, 0);
      const avgRev = programStudents.length > 0 ? Math.round(mrr / programStudents.length) : 0;

      // Churn rate: churn events for program students in last 3 months / active count
      const programStudentIds = new Set(programStudents.map((s) => s.id));
      const recentChurn = allChurnEvents.filter(
        (e) =>
          e.event_date >= threeMonthsAgoStr &&
          e.event_type !== "restart" &&
          programStudentIds.has(e.student_id)
      );
      const churnRate = programStudents.length > 0
        ? Math.round((recentChurn.length / programStudents.length) * 1000) / 10
        : 0;

      // Avg tenure
      const tenures = programStudents
        .filter((s) => s.signup_date)
        .map((s) => {
          const diff = now.getTime() - new Date(s.signup_date).getTime();
          return diff / (1000 * 60 * 60 * 24 * 30.44);
        });
      const avgTenure = tenures.length > 0
        ? Math.round(tenures.reduce((s, t) => s + t, 0) / tenures.length)
        : 0;

      return { count: programStudents.length, mrr, avgRev, churnRate, avgTenure };
    };

    return { elite: compute("elite"), accelerator: compute("accelerator") };
  }, [students, allChurnEvents]);

  // -------------------------------------------------------------------------
  // LTV & Unit Economics
  // -------------------------------------------------------------------------
  const [ltvSegment, setLtvSegment] = useState<"all" | "coach" | "program" | "payment_plan">("all");

  const ltvData = useMemo(() => {
    const now = new Date();
    const active = students.filter((s) => s.status === "active");

    const tenureMonths = (signup: string, endDate?: string) => {
      const end = endDate ? new Date(endDate) : now;
      return Math.max(0, (end.getTime() - new Date(signup).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    };

    // Build map of student_id -> churn date (latest non-restart event)
    const churnDateMap = new Map<string, string>();
    for (const e of allChurnEvents) {
      if (e.event_type !== "restart") {
        const existing = churnDateMap.get(e.student_id);
        if (!existing || e.event_date > existing) {
          churnDateMap.set(e.student_id, e.event_date);
        }
      }
    }

    type LtvRow = { segment: string; students: number; avgRev: number; avgTenure: number; ltv: number };

    const computeSegment = (label: string, segStudents: Student[]): LtvRow => {
      const segActive = segStudents.filter((s) => s.status === "active");
      const avgRev = segActive.length > 0
        ? Math.round(segActive.reduce((s, st) => s + st.monthly_revenue, 0) / segActive.length)
        : 0;

      // Tenure: use churn date for churned students, now for active
      const tenures = segStudents
        .filter((s) => s.signup_date)
        .map((s) => {
          const churnDate = churnDateMap.get(s.id);
          return tenureMonths(s.signup_date, s.status !== "active" && churnDate ? churnDate : undefined);
        });
      const avgTenure = tenures.length > 0
        ? Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length * 10) / 10
        : 0;

      return {
        segment: label,
        students: segStudents.length,
        avgRev,
        avgTenure,
        ltv: Math.round(avgRev * avgTenure),
      };
    };

    let rows: LtvRow[] = [];

    if (ltvSegment === "all") {
      rows = [computeSegment("All Students", students)];
    } else if (ltvSegment === "coach") {
      const coaches = new Map<string, Student[]>();
      for (const s of students) {
        const c = s.coach || "Unassigned";
        if (!coaches.has(c)) coaches.set(c, []);
        coaches.get(c)!.push(s);
      }
      rows = Array.from(coaches.entries())
        .map(([c, ss]) => computeSegment(c, ss))
        .sort((a, b) => b.ltv - a.ltv);
    } else if (ltvSegment === "program") {
      const programs = new Map<string, Student[]>();
      for (const s of students) {
        const p = s.program || "unknown";
        if (!programs.has(p)) programs.set(p, []);
        programs.get(p)!.push(s);
      }
      rows = Array.from(programs.entries())
        .map(([p, ss]) => computeSegment(STUDENT_PROGRAM_CONFIG[p as StudentProgram]?.label ?? p, ss))
        .sort((a, b) => b.ltv - a.ltv);
    } else {
      const plans = new Map<string, Student[]>();
      for (const s of students) {
        const p = s.payment_plan || "unknown";
        if (!plans.has(p)) plans.set(p, []);
        plans.get(p)!.push(s);
      }
      rows = Array.from(plans.entries())
        .map(([p, ss]) => computeSegment(PAYMENT_PLAN_CONFIG[p]?.label ?? p, ss))
        .sort((a, b) => b.ltv - a.ltv);
    }

    return rows;
  }, [students, allChurnEvents, ltvSegment]);

  // -------------------------------------------------------------------------
  // Renewal Calendar
  // -------------------------------------------------------------------------
  const [expandedRenewalMonth, setExpandedRenewalMonth] = useState<string | null>(null);

  const renewalCalendar = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Generate next 6 months
    const monthKeys: string[] = [];
    let [y, m] = currentMonth.split("-").map(Number);
    for (let i = 0; i < 6; i++) {
      monthKeys.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }

    const renewalsByMonth: { month: string; label: string; students: Student[]; totalRevenue: number }[] = [];
    for (const month of monthKeys) {
      const monthStudents = students
        .filter((s) => s.status === "active" && s.renewal_date && s.renewal_date.startsWith(month))
        .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));
      const totalRevenue = monthStudents.reduce((s, st) => s + st.monthly_revenue, 0);
      renewalsByMonth.push({ month, label: formatMonth(month), students: monthStudents, totalRevenue });
    }

    // Auto-expand first month with renewals
    if (expandedRenewalMonth === null) {
      const first = renewalsByMonth.find((r) => r.students.length > 0);
      if (first) setExpandedRenewalMonth(first.month);
    }

    // Check for overdue (renewal_date before today)
    const todayStr = now.toISOString().slice(0, 10);
    const overdueStudents = students.filter(
      (s) => s.status === "active" && s.renewal_date && s.renewal_date < todayStr
    );

    return { months: renewalsByMonth, overdueStudents, currentMonth };
  }, [students, expandedRenewalMonth]);

  // -------------------------------------------------------------------------
  // F) Revenue Scenario Modeling (Sprint 3)
  // -------------------------------------------------------------------------
  const scenarioData = useMemo(() => {
    if (!mrrData || mrrData.months.length === 0) return null;

    const active = students.filter((s) => s.status === "active");
    const lastMonth = mrrData.months[mrrData.months.length - 1];

    // Compute baseline growth rate
    const recent = mrrData.months.slice(-4);
    let baseGrowthRate = 0;
    if (recent.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        if (recent[i - 1].total_mrr > 0) {
          deltas.push((recent[i].total_mrr - recent[i - 1].total_mrr) / recent[i - 1].total_mrr);
        }
      }
      if (deltas.length > 0) baseGrowthRate = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    }

    // Price increase impact: how many students are affected?
    const affectedStudents = active.filter((s) => {
      if (scenarioApplyTo === "all") return true;
      return s.program === scenarioApplyTo;
    });
    const priceBoost = scenarioPriceIncrease * affectedStudents.length;
    const additionalAnnualRevenue = priceBoost * 12;

    // Override growth parameters
    const overrideNewStudents = scenarioNewStudents ? parseFloat(scenarioNewStudents) : null;
    const overrideChurnRate = scenarioChurnRate ? parseFloat(scenarioChurnRate) / 100 : null;

    // Build 6-month projection: baseline vs scenario
    const baselineMrr = lastMonth.total_mrr;
    let baselineCount = lastMonth.student_count;

    // Historical avg monthly signups + churn from last 3 months
    const last3 = mrrData.months.slice(-3);
    let avgSignups = 0;
    let avgChurn = 0;
    if (last3.length >= 2) {
      const countDeltas = [];
      for (let i = 1; i < last3.length; i++) {
        countDeltas.push(last3[i].student_count - last3[i - 1].student_count);
      }
      const avgNetGrowth = countDeltas.reduce((s, d) => s + d, 0) / countDeltas.length;
      // Approximate: net = signups - churn
      avgSignups = Math.max(0, Math.round(avgNetGrowth + 1)); // rough estimate
      avgChurn = Math.max(0, avgSignups - avgNetGrowth);
    }

    const projection: { month: string; label: string; baseline: number; scenario: number }[] = [];
    let baseMrr = baselineMrr;
    let scenMrr = baselineMrr + priceBoost;
    let [py, pm] = lastMonth.month.split("-").map(Number);
    const avgRevPerStudent = active.length > 0 ? baselineMrr / active.length : 0;

    for (let i = 0; i < 6; i++) {
      pm++;
      if (pm > 12) { pm = 1; py++; }
      const monthStr = `${py}-${String(pm).padStart(2, "0")}`;

      // Baseline
      baseMrr = Math.round(baseMrr * (1 + baseGrowthRate));

      // Scenario
      const monthSignups = overrideNewStudents ?? avgSignups;
      const monthChurnRate = overrideChurnRate ?? (baselineCount > 0 ? avgChurn / baselineCount : 0);
      const monthChurnCount = Math.round(baselineCount * monthChurnRate);
      baselineCount = baselineCount + monthSignups - monthChurnCount;
      const monthlyRevFromNew = monthSignups * (avgRevPerStudent + scenarioPriceIncrease);
      const monthlyRevLost = monthChurnCount * avgRevPerStudent;
      scenMrr = Math.round(scenMrr + monthlyRevFromNew - monthlyRevLost);

      projection.push({
        month: monthStr,
        label: formatMonth(monthStr),
        baseline: baseMrr,
        scenario: Math.max(0, scenMrr),
      });
    }

    return {
      projection,
      projectedMrr6mo: projection.length > 0 ? projection[projection.length - 1].scenario : 0,
      additionalAnnualRevenue,
      priceBoost,
    };
  }, [mrrData, students, scenarioPriceIncrease, scenarioApplyTo, scenarioNewStudents, scenarioChurnRate]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!mrrData || mrrData.months.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
        <DollarSign className="mb-2 h-6 w-6 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground/50">No revenue data yet</p>
      </div>
    );
  }

  return (
    <>
      {/* A) MRR Summary Cards */}
      {summaryStats && (
        <div className="mb-6 grid grid-cols-5 gap-3">
          <MetricCard
            value={fmtMoney(summaryStats.currentMrr)}
            label="Current MRR"
            description="Monthly Recurring Revenue — the total monthly revenue from all currently active students. Calculated by summing every active student's monthly_revenue."
          />
          <MetricCard
            value={`${summaryStats.growth >= 0 ? "+" : ""}${fmtMoney(summaryStats.growth)}`}
            valueColor={summaryStats.growth >= 0 ? "text-[#22c55e]" : "text-red-400"}
            label={`MRR Growth (${summaryStats.growthPct >= 0 ? "+" : ""}${summaryStats.growthPct.toFixed(1)}%)`}
            description="The dollar and percentage change in MRR compared to the previous month. Positive = growing revenue, negative = shrinking. Calculated as (current month MRR − previous month MRR)."
          />
          <MetricCard
            value={fmtMoney(summaryStats.avgRevenue)}
            label="Avg Revenue / Student"
            description="The mean monthly revenue per active student. Calculated by dividing total MRR by the number of active students. Useful for spotting pricing trends."
          />
          <MetricCard
            value={fmtMoney(summaryStats.medianRevenue)}
            label="Median Revenue / Student"
            description="The middle value when all active students' monthly revenues are sorted. Unlike the average, the median isn't skewed by a few high or low payers — it shows what a 'typical' student pays."
          />
          {nrrData && (
            <MetricCard
              value={`${nrrData.latest}%`}
              valueColor={nrrData.latest >= 100 ? "text-[#22c55e]" : "text-red-400"}
              label="Net Revenue Retention"
              sublabel={`3mo avg: ${nrrData.trailing3mo}%`}
              description="NRR measures how much revenue you keep + expand from existing customers month-over-month. Calculated as (current month MRR ÷ previous month MRR × 100). Above 100% means you're growing from existing customers even without new signups. Below 100% means churn/downgrades are outpacing any expansion."
            />
          )}
        </div>
      )}

      {/* NRR Sparkline */}
      {nrrData && nrrData.sparkline.length >= 2 && (
        <div className="mb-6 rounded-lg border border-border/50 bg-card/40 px-4 py-3">
          <div className="mb-1 text-[10px] font-medium text-muted-foreground">NRR Trend (Last 6 Months)</div>
          <ResponsiveContainer width="100%" height={48}>
            <LineChart data={nrrData.sparkline}>
              <Tooltip
                contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 11 }}
                formatter={((value: number) => [`${value}%`, "NRR"]) as never}
                labelFormatter={(label) => formatMonth(String(label))}
              />
              <ReferenceLine y={100} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="nrr"
                stroke={nrrData.latest >= 100 ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* B) MRR Trend Chart */}
      <h2 className="mb-1 text-sm font-semibold">MRR Trend</h2>
      <p className="mb-3 text-[10px] text-muted-foreground/60">
        Estimated from signup dates and churn events using each student&apos;s current monthly revenue. Does not reflect historical rate changes.
      </p>
      <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6c7086", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#6c7086", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }}
              formatter={((value: number | undefined, name: string) => {
                if (value === null || value === undefined) return ["-", name];
                return [fmtMoney(value), name === "elite_mrr" ? "Elite" : name === "accelerator_mrr" ? "Accelerator" : name === "projected_mrr" ? "Projected" : "Total"];
              }) as never}
            />
            <Area
              type="monotone"
              dataKey="elite_mrr"
              stackId="1"
              stroke="#a855f7"
              fill="#a855f7"
              fillOpacity={0.3}
              name="Elite"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="accelerator_mrr"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
              name="Accelerator"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="projected_mrr"
              stroke="#22c55e"
              fill="none"
              strokeDasharray="6 3"
              strokeWidth={2}
              name="Projected"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* C) Revenue Concentration */}
      <h2 className="mb-3 text-sm font-semibold">Revenue Concentration</h2>

      {mrrData.concentration.top_5_pct > 30 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-amber-200">
            Top 5 students represent {mrrData.concentration.top_5_pct}% of MRR — high concentration risk
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4">
        {/* Tier distribution */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">Revenue Tier Distribution</h3>
          <div className="space-y-2">
            {mrrData.concentration.revenue_tiers.map((tier) => {
              const maxCount = Math.max(...mrrData.concentration.revenue_tiers.map((t) => t.count), 1);
              return (
                <div key={tier.range} className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-muted-foreground">{tier.range}</span>
                  <div className="flex-1 h-4 bg-border/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#a855f7] rounded-full"
                      style={{ width: `${(tier.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-[10px] text-muted-foreground">
                    {tier.count} ({fmtMoney(tier.mrr)})
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
            <span>Top 5: {mrrData.concentration.top_5_pct}%</span>
            <span>Top 10: {mrrData.concentration.top_10_pct}%</span>
          </div>
        </div>

        {/* Top 5 students */}
        <div className="rounded-lg border border-border/50 bg-card/40 p-4">
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">Top 5 Students by Revenue</h3>
          <div className="space-y-2">
            {top5Students.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50">{i + 1}.</span>
                  <span className="text-xs font-medium">{s.name}</span>
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{
                      backgroundColor: getCoachColor(s.coach) + "20",
                      color: getCoachColor(s.coach),
                    }}
                  >
                    {s.coach || "—"}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {STUDENT_PROGRAM_CONFIG[s.program]?.label}
                  </span>
                </div>
                <span className="font-mono text-xs font-medium text-foreground">
                  {fmtMoney(s.monthly_revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* E) Program Comparison (Sprint 3) */}
      <h2 className="mb-3 text-sm font-semibold">Program Comparison</h2>
      <div className="mb-6 grid grid-cols-2 gap-4">
        {(["elite", "accelerator"] as const).map((prog) => {
          const data = programComparison[prog];
          const cfg = STUDENT_PROGRAM_CONFIG[prog];
          return (
            <div
              key={prog}
              className="rounded-lg border border-border/50 bg-card/40 p-4"
              style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
            >
              <h3 className="mb-3 text-sm font-semibold" style={{ color: cfg.color }}>
                {cfg.label}
              </h3>
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Students</div>
                  <div className="font-semibold">{data.count}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">MRR</div>
                  <div className="font-semibold">{fmtMoney(data.mrr)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg Revenue</div>
                  <div className="font-semibold">{fmtMoney(data.avgRev)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Churn Rate (3mo)</div>
                  <div className="font-semibold">{data.churnRate}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg Tenure</div>
                  <div className="font-semibold">{data.avgTenure} months</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* LTV & Unit Economics */}
      <h2 className="mb-3 text-sm font-semibold">LTV & Unit Economics</h2>
      <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
        {/* Segment toggle */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border/50 bg-background/30 p-1">
          {([
            { id: "all", label: "All" },
            { id: "coach", label: "By Coach" },
            { id: "program", label: "By Program" },
            { id: "payment_plan", label: "By Payment Plan" },
          ] as const).map((seg) => (
            <button
              key={seg.id}
              onClick={() => setLtvSegment(seg.id)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                ltvSegment === seg.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {seg.label}
            </button>
          ))}
        </div>

        {/* LTV table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Segment</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Students</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Rev</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Tenure</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Est. LTV</th>
              </tr>
            </thead>
            <tbody>
              {ltvData.map((row) => (
                <tr key={row.segment} className="border-b border-border/10 hover:bg-card/20 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-medium">
                    {ltvSegment === "coach" ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: getCoachColor(row.segment) + "20", color: getCoachColor(row.segment) }}
                      >
                        {row.segment}
                      </span>
                    ) : (
                      row.segment
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs">{row.students}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium">{fmtMoney(row.avgRev)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{row.avgTenure} mo</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold text-[#22c55e]">{fmtMoney(row.ltv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LTV bar chart */}
        {ltvData.length > 1 && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={Math.max(120, ltvData.length * 36)}>
              <BarChart data={ltvData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#6c7086", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="segment"
                  tick={{ fill: "#cdd6f4", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }}
                  formatter={((value: number) => [fmtMoney(value), "Est. LTV"]) as never}
                />
                <Bar dataKey="ltv" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Renewal Calendar */}
      <h2 className="mb-3 text-sm font-semibold">Renewal Calendar (Next 6 Months)</h2>
      <div className="mb-6 space-y-2">
        {/* Overdue renewals */}
        {renewalCalendar.overdueStudents.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-400">
                {renewalCalendar.overdueStudents.length} Overdue Renewal{renewalCalendar.overdueStudents.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-red-400/70">
                {fmtMoney(renewalCalendar.overdueStudents.reduce((s, st) => s + st.monthly_revenue, 0))} at risk
              </span>
            </div>
            <div className="space-y-1">
              {renewalCalendar.overdueStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ backgroundColor: getCoachColor(s.coach) + "20", color: getCoachColor(s.coach) }}
                    >
                      {s.coach || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{fmtMoney(s.monthly_revenue)}</span>
                    <span className="text-red-400">{formatDate(s.renewal_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Month sections */}
        {renewalCalendar.months.map((rm) => {
          const isExpanded = expandedRenewalMonth === rm.month;
          const isCurrentMonth = rm.month === renewalCalendar.currentMonth;
          const hasRenewals = rm.students.length > 0;

          return (
            <div
              key={rm.month}
              className={cn(
                "rounded-lg border overflow-hidden",
                isCurrentMonth ? "border-[#f59e0b]/30" : "border-border/50",
                !hasRenewals && "opacity-50"
              )}
            >
              <button
                onClick={() => hasRenewals && setExpandedRenewalMonth(isExpanded ? null : rm.month)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors",
                  hasRenewals ? "hover:bg-card/30 cursor-pointer" : "cursor-default",
                  isCurrentMonth && "bg-[#f59e0b]/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {hasRenewals ? (
                    isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                  )}
                  <span className={cn("text-xs font-semibold", isCurrentMonth ? "text-[#f59e0b]" : "text-foreground")}>
                    {rm.label}
                  </span>
                  {hasRenewals && (
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {rm.students.length} renewal{rm.students.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {hasRenewals && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {fmtMoney(rm.totalRevenue)} at stake
                  </span>
                )}
              </button>

              {isExpanded && hasRenewals && (
                <div className="border-t border-border/30 px-4 py-2 space-y-1.5">
                  {rm.students.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <span
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: getCoachColor(s.coach) + "20", color: getCoachColor(s.coach) }}
                        >
                          {s.coach || "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {PAYMENT_PLAN_CONFIG[s.payment_plan]?.shortLabel ?? s.payment_plan}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{fmtMoney(s.monthly_revenue)}</span>
                        <span className="text-muted-foreground">{formatDate(s.renewal_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* F) Revenue Scenarios (Sprint 3) */}
      <h2 className="mb-3 text-sm font-semibold">Revenue Scenarios</h2>
      <div className="mb-6 rounded-lg border border-border/50 bg-card/40 p-4">
        {/* Controls */}
        <div className="mb-4 grid grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">
              Price Increase ($/mo)
            </label>
            <input
              type="range"
              min={0}
              max={500}
              step={25}
              value={scenarioPriceIncrease}
              onChange={(e) => setScenarioPriceIncrease(Number(e.target.value))}
              className="w-full accent-[#a855f7]"
            />
            <div className="mt-0.5 text-center text-xs font-medium text-foreground">
              +{fmtMoney(scenarioPriceIncrease)}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">
              Apply To
            </label>
            <Select value={scenarioApplyTo} onValueChange={(v) => setScenarioApplyTo(v as "all" | "elite" | "accelerator")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Students</SelectItem>
                <SelectItem value="elite">Elite Only</SelectItem>
                <SelectItem value="accelerator">Accelerator Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">
              New Students/mo
            </label>
            <Input
              type="number"
              min={0}
              value={scenarioNewStudents}
              onChange={(e) => setScenarioNewStudents(e.target.value)}
              placeholder="Auto"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">
              Churn Rate %
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={scenarioChurnRate}
              onChange={(e) => setScenarioChurnRate(e.target.value)}
              placeholder="Auto"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Scenario chart */}
        {scenarioData && scenarioData.projection.length > 0 && (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={scenarioData.projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#6c7086", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6c7086", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8, fontSize: 12 }}
                  formatter={((value: number | undefined, name: string) => [
                    fmtMoney(value ?? 0),
                    name === "baseline" ? "Baseline" : "Scenario",
                  ]) as never}
                />
                <Legend />
                <Line type="monotone" dataKey="baseline" stroke="#6c7086" strokeWidth={2} dot={false} name="Baseline" />
                <Line type="monotone" dataKey="scenario" stroke="#a855f7" strokeWidth={2} dot={false} name="Scenario" />
              </LineChart>
            </ResponsiveContainer>

            {/* Scenario stats */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                <div className="text-lg font-bold text-[#a855f7]">{fmtMoney(scenarioData.projectedMrr6mo)}</div>
                <div className="text-[10px] text-muted-foreground">Projected MRR in 6mo</div>
              </div>
              <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                <div className="text-lg font-bold text-[#22c55e]">+{fmtMoney(scenarioData.priceBoost)}</div>
                <div className="text-[10px] text-muted-foreground">Immediate Monthly Boost</div>
              </div>
              <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                <div className="text-lg font-bold text-[#22c55e]">+{fmtMoney(scenarioData.additionalAnnualRevenue)}</div>
                <div className="text-[10px] text-muted-foreground">Additional Annual Revenue</div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Coach Edit Dialog
// ===========================================================================

function CoachEditDialog({
  coach,
  open,
  onClose,
  onSuccess,
}: {
  coach: CoachCapacityDetail;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [maxStudents, setMaxStudents] = useState(String(coach.max_students));
  const [preferredMax, setPreferredMax] = useState(String(coach.preferred_max));
  const [status, setStatus] = useState<string>(coach.status);
  const [notes, setNotes] = useState(coach.notes);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/students/capacity/coaches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: coach.id,
          max_students: Number.isNaN(parseInt(maxStudents, 10)) ? 20 : parseInt(maxStudents, 10),
          preferred_max: Number.isNaN(parseInt(preferredMax, 10)) ? 17 : parseInt(preferredMax, 10),
          status,
          notes,
        }),
      });
      if (res.ok) onSuccess();
    } catch (err) {
      console.error("[CoachEditDialog] save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {coach.coach_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Max Students
            </label>
            <Input
              type="number"
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
              min={1}
              max={50}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Preferred Max
            </label>
            <Input
              type="number"
              value={preferredMax}
              onChange={(e) => setPreferredMax(e.target.value)}
              min={1}
              max={50}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about this coach..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
