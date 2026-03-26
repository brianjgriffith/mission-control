"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  UserPlus,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  Users,
  Copy,
} from "lucide-react";

interface SalesRep {
  id: string;
  name: string;
  email: string | null;
  rep_type: string;
  is_active: boolean;
  user_id: string | null;
}

interface ManageRepsProps {
  open: boolean;
  onClose: () => void;
}

export function ManageReps({ open, onClose }: ManageRepsProps) {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form fields
  const [selectedRepId, setSelectedRepId] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const fetchReps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales-reps");
      if (!res.ok) return;
      const json = await res.json();
      setReps(json.reps || []);
    } catch (err) {
      console.error("[ManageReps] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchReps();
  }, [open, fetchReps]);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // Auto-fill email when rep is selected
  useEffect(() => {
    if (selectedRepId) {
      const rep = reps.find((r) => r.id === selectedRepId);
      if (rep?.email) setLoginEmail(rep.email);
    }
  }, [selectedRepId, reps]);

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pwd = "";
    for (let i = 0; i < 10; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(pwd);
    setShowPassword(true);
  };

  const handleCreate = async () => {
    if (!selectedRepId || !loginEmail || !password) return;

    const rep = reps.find((r) => r.id === selectedRepId);
    if (!rep) return;

    setCreating(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/create-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password,
          full_name: rep.name,
          sales_rep_id: selectedRepId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.error || "Failed to create account");
        return;
      }

      setSuccessMessage(
        `Account created for ${rep.name}! Email: ${loginEmail} / Password: ${password}`
      );
      setShowForm(false);
      setSelectedRepId("");
      setLoginEmail("");
      setPassword("");
      await fetchReps();
    } catch (err) {
      setErrorMessage("Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  const copyCredentials = (email: string, pwd: string) => {
    navigator.clipboard.writeText(`Email: ${email}\nPassword: ${pwd}`);
  };

  if (!open) return null;

  const unlinkedReps = reps.filter((r) => !r.user_id);
  const linkedReps = reps.filter((r) => r.user_id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]">
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Manage Sales Reps</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success banner */}
        {successMessage && (
          <div className="mx-5 mt-3 rounded-md bg-emerald-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{successMessage}</span>
              <button
                onClick={() => {
                  const match = successMessage.match(
                    /Email: (.+?) \/ Password: (.+)/
                  );
                  if (match) copyCredentials(match[1], match[2]);
                }}
                className="shrink-0 rounded p-1 hover:bg-emerald-500/20"
                title="Copy credentials"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {errorMessage && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Existing accounts */}
              {linkedReps.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Accounts
                  </h3>
                  <div className="space-y-1.5">
                    {linkedReps.map((rep) => (
                      <div
                        key={rep.id}
                        className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/20 px-3 py-2"
                      >
                        <Shield className="h-3.5 w-3.5 text-emerald-400" />
                        <div className="flex-1">
                          <span className="text-xs font-medium text-foreground">
                            {rep.name}
                          </span>
                          <span className="ml-2 text-[10px] text-muted-foreground capitalize">
                            {rep.rep_type}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-400">
                          Has login
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reps without accounts */}
              {unlinkedReps.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    No Account Yet
                  </h3>
                  <div className="space-y-1.5">
                    {unlinkedReps.map((rep) => (
                      <div
                        key={rep.id}
                        className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/20 px-3 py-2"
                      >
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                        <div className="flex-1">
                          <span className="text-xs font-medium text-foreground">
                            {rep.name}
                          </span>
                          <span className="ml-2 text-[10px] text-muted-foreground capitalize">
                            {rep.rep_type}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/50">
                          No login
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Create Account Form */}
              {!showForm ? (
                <button
                  onClick={() => {
                    setShowForm(true);
                    generatePassword();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Create Rep Login
                </button>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
                  <h3 className="mb-3 text-xs font-semibold text-foreground">
                    Create Rep Login
                  </h3>

                  <div className="space-y-3">
                    {/* Select Rep */}
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Sales Rep
                      </label>
                      <select
                        value={selectedRepId}
                        onChange={(e) => setSelectedRepId(e.target.value)}
                        className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Select a rep...</option>
                        <optgroup label="Sales Team">
                          {unlinkedReps
                            .filter((r) => r.rep_type === "sales")
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Coaches">
                          {unlinkedReps
                            .filter((r) => r.rep_type === "coach")
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Login Email
                      </label>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="rep@thinkmedia.com"
                        className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Password
                        <button
                          onClick={generatePassword}
                          className="normal-case tracking-normal text-primary/70 hover:text-primary"
                        >
                          Generate
                        </button>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring font-mono"
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleCreate}
                        disabled={
                          !selectedRepId ||
                          !loginEmail ||
                          !password ||
                          creating
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                          selectedRepId && loginEmail && password
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        {creating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserPlus className="h-3 w-3" />
                        )}
                        Create Account
                      </button>
                      <button
                        onClick={() => {
                          setShowForm(false);
                          setSelectedRepId("");
                          setLoginEmail("");
                          setPassword("");
                          setErrorMessage(null);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-[10px] text-muted-foreground/60">
                    The rep will log in at the same URL with these credentials.
                    They&apos;ll only see their own sales, meetings, and charges.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
