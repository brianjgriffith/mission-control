"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Phone,
  GraduationCap,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { ContactDetail } from "@/components/contact-detail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  hubspot_contact_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  lifecycle_stage: string;
  created_at: string;
  charge_count: number;
  total_spend: number;
  meeting_count: number;
  programs: string[];
  is_active_student: boolean;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const PROGRAM_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  accelerator: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Accelerator" },
  elite: { bg: "bg-purple-500/15", text: "text-purple-400", label: "Elite" },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("full_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Detail panel
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (programFilter) params.set("program", programFilter);
      if (activityFilter === "has_meetings") params.set("has_meetings", "true");
      if (activityFilter === "has_charges") params.set("has_charges", "true");
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      params.set("page", String(page));
      params.set("per_page", "50");

      const res = await fetch(`/api/contacts?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setContacts(json.contacts ?? []);
      setPagination(json.pagination);
    } catch (err) {
      console.error("[ContactsView] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, programFilter, activityFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, programFilter, activityFilter, sortBy, sortDir]);

  // Sort handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pagination.total.toLocaleString()} contacts &middot; Search, filter, and explore customer journeys
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-border bg-card/40 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring w-64"
            />
          </div>

          {/* Program filter */}
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Programs</option>
            <option value="accelerator">Accelerator</option>
            <option value="elite">Elite</option>
          </select>

          {/* Activity filter */}
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className="rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Contacts</option>
            <option value="has_charges">Has Purchases</option>
            <option value="has_meetings">Has Meetings</option>
          </select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 bg-card/40 overflow-hidden">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              Loading contacts...
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
              No contacts found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/20 bg-card/20">
                    {([
                      { key: "full_name", label: "Name", align: "left", sortable: true },
                      { key: "email", label: "Email", align: "left", sortable: true },
                      { key: "programs", label: "Programs", align: "left", sortable: false },
                      { key: "total_spend", label: "Total Spend", align: "right", sortable: false },
                      { key: "charge_count", label: "Purchases", align: "center", sortable: false },
                      { key: "meeting_count", label: "Meetings", align: "center", sortable: false },
                    ] as const).map((col) => {
                      const active = sortBy === col.key;
                      return (
                        <th
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider",
                            col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                            col.sortable ? "cursor-pointer select-none hover:text-foreground transition-colors" : "",
                            active ? "text-primary" : "text-muted-foreground"
                          )}
                          onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        >
                          <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                            {col.label}
                            {col.sortable && (
                              active
                                ? sortDir === "asc"
                                  ? <ArrowUp className="h-3 w-3" />
                                  : <ArrowDown className="h-3 w-3" />
                                : <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="border-b border-border/10 transition-colors hover:bg-card/20 cursor-pointer"
                      onClick={() => setSelectedContactId(contact.id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                            {contact.first_name?.[0]?.toUpperCase() || contact.email?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-foreground block truncate">
                              {contact.full_name || contact.email}
                            </span>
                            {contact.is_active_student && (
                              <span className="text-[9px] text-green-400 font-medium">Active Student</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[200px]">
                        {contact.email}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {contact.programs.map((p) => {
                            const style = PROGRAM_STYLES[p] || { bg: "bg-muted", text: "text-muted-foreground", label: p };
                            return (
                              <span
                                key={p}
                                className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium", style.bg, style.text)}
                              >
                                {style.label}
                              </span>
                            );
                          })}
                          {contact.programs.length === 0 && (
                            <span className="text-[10px] text-muted-foreground/30">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {contact.total_spend > 0 ? (
                          <span className="text-xs font-mono font-medium text-foreground">
                            {fmtCurrency(contact.total_spend)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {contact.charge_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <DollarSign className="h-3 w-3" />
                            {contact.charge_count}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {contact.meeting_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {contact.meeting_count}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-border/20 px-3 py-2.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  page <= 1
                    ? "cursor-not-allowed text-muted-foreground/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-[11px] text-muted-foreground">
                Page {pagination.page} of {pagination.total_pages.toLocaleString()}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page >= pagination.total_pages}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  page >= pagination.total_pages
                    ? "cursor-not-allowed text-muted-foreground/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact Detail Slide-over */}
      {selectedContactId && (
        <ContactDetail
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}
    </div>
  );
}
