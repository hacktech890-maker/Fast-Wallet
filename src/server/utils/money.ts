import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN, toExpPos: 30, toExpNeg: -12 });

export type MoneyInput = string | number | Decimal;

export const SCALE = 8;

const toD = (v: MoneyInput): Decimal => (v instanceof Decimal ? v : new Decimal(v));

/** Normalize any input to a fixed 8-decimal string (canonical storage form). */
export const money = (v: MoneyInput): string => toD(v).toFixed(SCALE);

export const add = (a: MoneyInput, b: MoneyInput): string => money(toD(a).plus(b));
export const sub = (a: MoneyInput, b: MoneyInput): string => money(toD(a).minus(b));
export const mul = (a: MoneyInput, b: MoneyInput): string => money(toD(a).times(b));

export const cmp = (a: MoneyInput, b: MoneyInput): number => toD(a).comparedTo(b);
export const gt = (a: MoneyInput, b: MoneyInput): boolean => toD(a).gt(toD(b));
export const gte = (a: MoneyInput, b: MoneyInput): boolean => toD(a).gte(toD(b));
export const isPositive = (a: MoneyInput): boolean => toD(a).gt(0);
export const isZero = (a: MoneyInput): boolean => toD(a).isZero();

/** Regex for a plain positive decimal with up to 8 fractional digits. */
export const AMOUNT_RE = /^\d+(\.\d{1,8})?$/;

export const isValidAmountString = (v: string): boolean => AMOUNT_RE.test(v.trim());

/** BEP20 / EVM style address. */
export const isValidBep20Address = (v: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(v);

/** TRC20 base58check-style address ( T + 33 base58 chars = 34 chars ). */
export const isValidTrc20Address = (v: string): boolean => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v);

/** Stable short hash (FNV-1a) for suffixing seeded data. */
export const shortHash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h).toString(16);
};
