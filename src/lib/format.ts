/* Display formatting helpers — UI only, all ledger math happens server-side. */

const moneyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1234567.89000000" -> "1,234,567.89" */
export function formatAmount(value: string | number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return moneyFmt.format(n) + (suffix ? ` ${suffix}` : "");
}

/** Trim trailing zeros of an 8dp string for compact display. */
export function compactAmount(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(n);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "0x8ba1f109551bD432803012645Ac136ddd64DBA72" -> "0x8ba1…BA72" */
export function shortAddress(address: string | null | undefined, head = 6, tail = 4): string {
  if (!address) return "—";
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const SIGNED_RE = /^-/;
export function isDebit(amount: string): boolean {
  return SIGNED_RE.test(amount);
}

export function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return (a + b).toUpperCase() || "AX";
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
