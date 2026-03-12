import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a UTC datetime string from SQLite (e.g. "2026-02-11 00:44:38")
 * and format it in America/Los_Angeles (PST/PDT).
 */
export function formatUTC(utcString: string, fmt: Intl.DateTimeFormatOptions): string {
  const date = new Date(utcString + "Z"); // append Z to treat as UTC
  return date.toLocaleString("en-US", { ...fmt, timeZone: "America/Los_Angeles" });
}

/** Format a UTC timestamp as "4:44 PM" in PST */
export function formatTimePST(utcString: string): string {
  return formatUTC(utcString, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Format a UTC timestamp as "Feb 10, 2026 4:44 PM" in PST */
export function formatDateTimePST(utcString: string): string {
  return formatUTC(utcString, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
