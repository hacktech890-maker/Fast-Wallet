type CsvValue = string | number | Date | null | undefined;

const escapeCell = (value: CsvValue): string => {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build an RFC-4180 compatible CSV document. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return "﻿" + lines.join("\r\n");
}
