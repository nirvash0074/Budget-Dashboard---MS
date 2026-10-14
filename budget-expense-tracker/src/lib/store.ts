import { create } from "zustand";
import { loadLocator, saveLocator, type WorkbookLocator } from "@/lib/workbook";

export type TxType = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  /** Monthly budget in pesos (expense categories only). */
  budget: number;
}

export interface Transaction {
  id: string;
  date: string; // yyyy-MM-dd
  type: TxType;
  categoryId: string;
  /** Category name as stored in the workbook (shown if the category was removed). */
  categoryName: string;
  description: string;
  amount: number;
  method: string;
  notes: string;
  /** Values for the user's own extra columns. */
  custom: Record<string, string>;
  /** Row has a blank or duplicate ID in the workbook, so it can't be safely edited. */
  locked?: boolean;
}

export interface SalaryMonth {
  id: string;
  monthKey: string; // yyyy-MM
  income15th: number;
  income30th: number;
  totalBudget: number;
  actualExpenses: number;
  autoSync: boolean;
}

export interface Settings {
  pay1Label: string;
  pay2Label: string;
}

export const PAYMENT_METHODS = ["Bank Transfer", "Cash", "Credit Card", "Debit Card", "E-Wallet"];

export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  { name: "Entertainment", type: "expense", budget: 2000 },
  { name: "Food & Dining", type: "expense", budget: 5500 },
  { name: "Groceries", type: "expense", budget: 7500 },
  { name: "Health", type: "expense", budget: 2000 },
  { name: "Housing", type: "expense", budget: 9000 },
  { name: "Other", type: "expense", budget: 1000 },
  { name: "Shopping", type: "expense", budget: 2500 },
  { name: "Transportation", type: "expense", budget: 3000 },
  { name: "Utilities", type: "expense", budget: 3500 },
  { name: "Freelance", type: "income", budget: 0 },
  { name: "Investments", type: "income", budget: 0 },
  { name: "Other Income", type: "income", budget: 0 },
  { name: "Salary", type: "income", budget: 0 },
];

interface AppState {
  locator: WorkbookLocator | null;
  setLocator: (loc: WorkbookLocator | null) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  locator: loadLocator(),
  setLocator: (locator) => {
    saveLocator(locator);
    set({ locator });
  },
}));
