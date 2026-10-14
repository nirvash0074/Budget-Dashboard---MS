import { format, parseISO } from "date-fns";

const pesoFmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const pesoWhole = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

/** ₱1,234.56 — negative values render with a leading minus sign. */
export const peso = (n: number) => (n < 0 ? `−${pesoFmt.format(-n)}` : pesoFmt.format(n));
export const pesoRound = (n: number) => (n < 0 ? `−${pesoWhole.format(-n)}` : pesoWhole.format(n));
export const pct = (n: number) => `${Math.round(n)}%`;
export const monthLabel = (key: string) => format(parseISO(`${key}-01`), "MMMM yyyy");
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct fill colors, assigned by a category's position in the A–Z list. */
const PALETTE = [
  "#b45309", "#0f766e", "#1d4ed8", "#be123c", "#7e22ce",
  "#15803d", "#c2410c", "#0369a1", "#9d174d", "#4d7c0f", "#475569", "#a16207",
];
export const paletteColor = (i: number) => PALETTE[i % PALETTE.length];
