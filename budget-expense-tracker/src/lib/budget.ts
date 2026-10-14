import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addRow, cellBool, cellDate, cellMonth, cellNumber, cellText, deleteRow, readAll, TABLES, updateRow,
  type Row, type WorkbookLocator,
} from "@/lib/workbook";
import { DEFAULT_CATEGORIES, useAppStore, type Category, type SalaryMonth, type Settings, type Transaction, type TxType } from "@/lib/store";
import { round2 } from "@/lib/format";

export interface BudgetData {
  categories: Category[];
  transactions: Transaction[];
  salary: SalaryMonth[];
  settings: Settings;
  customFields: string[];
}

const BASE_TX = new Set<string>(TABLES.transactions.columns);
const txType = (v: unknown): TxType => (/^income$/i.test(cellText(v)) ? "income" : "expense");

async function loadBudget(loc: WorkbookLocator): Promise<BudgetData> {
  const [tx, cats, sal, set] = await Promise.all([
    readAll(loc, "transactions"),
    readAll(loc, "categories"),
    readAll(loc, "salary"),
    readAll(loc, "settings"),
  ]);

  const settingsMap = new Map(set.rows.map((r) => [cellText(r.Key), cellText(r.Value)]));
  const declared = (settingsMap.get("CustomFields") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const customFields = [...new Set([...declared.filter((c) => tx.columns.includes(c)), ...tx.columns.filter((c) => !BASE_TX.has(c))])];

  const categories: Category[] = cats.rows
    .filter((r) => cellText(r.ID) && cellText(r.Name))
    .map((r) => ({ id: cellText(r.ID), name: cellText(r.Name), type: txType(r.Type), budget: cellNumber(r.Budget) }));

  const idCounts = new Map<string, number>();
  for (const r of tx.rows) idCounts.set(cellText(r.ID), (idCounts.get(cellText(r.ID)) ?? 0) + 1);

  const transactions: Transaction[] = tx.rows
    .filter((r) => cellDate(r.Date) && (cellText(r.Description) || cellNumber(r.Amount)))
    .map((r, i) => {
      const id = cellText(r.ID);
      const type = txType(r.Type);
      const categoryName = cellText(r.Category) || "Uncategorized";
      const cat = categories.find((c) => c.type === type && c.name.toLowerCase() === categoryName.toLowerCase());
      const locked = !id || (idCounts.get(id) ?? 0) > 1;
      return {
        id: locked ? `locked-${i}` : id,
        date: cellDate(r.Date),
        type,
        categoryId: cat?.id ?? `missing:${categoryName}`,
        categoryName,
        description: cellText(r.Description),
        amount: cellNumber(r.Amount),
        method: cellText(r.Method) || "Cash",
        notes: cellText(r.Notes),
        custom: Object.fromEntries(customFields.map((f) => [f, cellText(r[f])])),
        locked,
      };
    });

  const salary: SalaryMonth[] = sal.rows
    .filter((r) => cellText(r.ID) && cellMonth(r.Month))
    .map((r) => ({
      id: cellText(r.ID),
      monthKey: cellMonth(r.Month),
      income15th: cellNumber(r.Pay1),
      income30th: cellNumber(r.Pay2),
      totalBudget: cellNumber(r.Budget),
      actualExpenses: cellNumber(r.ActualExpenses),
      autoSync: cellBool(r.UseTransactions),
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  return {
    categories,
    transactions,
    salary,
    settings: {
      pay1Label: settingsMap.get("Pay1Label") || "15th",
      pay2Label: settingsMap.get("Pay2Label") || "30th",
    },
    customFields,
  };
}

const keyFor = (loc: WorkbookLocator | null) => ["budget", loc?.drive, loc?.file] as const;

export function useBudgetQuery() {
  const loc = useAppStore((s) => s.locator);
  return useQuery({
    queryKey: keyFor(loc),
    queryFn: () => loadBudget(loc as WorkbookLocator),
    enabled: !!loc,
    staleTime: 60_000,
    retry: 0,
  });
}

const EMPTY: BudgetData = {
  categories: [],
  transactions: [],
  salary: [],
  settings: { pay1Label: "15th", pay2Label: "30th" },
  customFields: [],
};

/** Loaded workbook data (empty until loaded). */
export function useBudget(): BudgetData {
  return useBudgetQuery().data ?? EMPTY;
}

/* ---------------- writes (each awaits, then re-reads the workbook) ---------------- */

const txRow = (t: Omit<Transaction, "id" | "locked" | "categoryId">, customFields: string[]): Row => ({
  Date: t.date,
  Type: t.type,
  Category: t.categoryName,
  Description: t.description,
  Amount: round2(t.amount),
  Method: t.method,
  Notes: t.notes,
  ...Object.fromEntries(customFields.map((f) => [f, t.custom[f] ?? ""])),
});

const salaryRow = (m: Omit<SalaryMonth, "id">): Row => ({
  Month: m.monthKey,
  Pay1: round2(m.income15th),
  Pay2: round2(m.income30th),
  Budget: round2(m.totalBudget),
  ActualExpenses: round2(m.actualExpenses),
  UseTransactions: m.autoSync ? "TRUE" : "FALSE",
});

export function useBudgetActions() {
  const qc = useQueryClient();
  const loc = useAppStore((s) => s.locator);
  const data = useBudget();

  const need = () => {
    if (!loc) throw new Error("No workbook connected.");
    return loc;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: keyFor(loc) });

  return {
    async addTransaction(t: Omit<Transaction, "id" | "locked" | "categoryId">) {
      await addRow(need(), "transactions", { ID: crypto.randomUUID(), ...txRow(t, data.customFields) });
      await refresh();
    },
    async updateTransaction(id: string, t: Omit<Transaction, "id" | "locked" | "categoryId">, original: Transaction) {
      const next = txRow(t, data.customFields);
      const prev = txRow(original, data.customFields);
      const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => !Object.is(v, prev[k])));
      if (Object.keys(changed).length) await updateRow(need(), "transactions", id, changed);
      await refresh();
    },
    async deleteTransaction(id: string) {
      await deleteRow(need(), "transactions", id);
      await refresh();
    },
    async addCategory(name: string, type: TxType, budget: number): Promise<Category | null> {
      const clean = name.trim();
      if (!clean) return null;
      if (data.categories.some((c) => c.type === type && c.name.toLowerCase() === clean.toLowerCase())) return null;
      const cat: Category = { id: crypto.randomUUID(), name: clean, type, budget: type === "expense" ? budget : 0 };
      await addRow(need(), "categories", { ID: cat.id, Name: cat.name, Type: cat.type, Budget: cat.budget });
      await refresh();
      return cat;
    },
    async setBudget(id: string, budget: number) {
      await updateRow(need(), "categories", id, { Budget: budget });
      await refresh();
    },
    async deleteCategory(id: string) {
      await deleteRow(need(), "categories", id);
      await refresh();
    },
    async saveSalary(next: SalaryMonth[], settings: Settings) {
      const l = need();
      const before = new Map(data.salary.map((m) => [m.id, m]));
      for (const m of next) {
        const prev = before.get(m.id);
        if (!prev) await addRow(l, "salary", { ID: m.id, ...salaryRow(m) });
        else {
          const a = salaryRow(m), b = salaryRow(prev);
          const changed = Object.fromEntries(Object.entries(a).filter(([k, v]) => !Object.is(v, b[k])));
          if (Object.keys(changed).length) await updateRow(l, "salary", m.id, changed);
        }
        before.delete(m.id);
      }
      for (const id of before.keys()) await deleteRow(l, "salary", id);
      if (settings.pay1Label !== data.settings.pay1Label) await upsertSetting(l, "Pay1Label", settings.pay1Label);
      if (settings.pay2Label !== data.settings.pay2Label) await upsertSetting(l, "Pay2Label", settings.pay2Label);
      await refresh();
    },
    refresh,
  };
}

async function upsertSetting(loc: WorkbookLocator, key: string, value: string) {
  try {
    await updateRow(loc, "settings", key, { Value: value });
  } catch {
    await addRow(loc, "settings", { Key: key, Value: value });
  }
}

/** Seed a freshly created workbook with starter categories, salary months and settings. */
export async function seedWorkbook(
  loc: WorkbookLocator,
  opts: { startMonth: string; months: number; pay1Label: string; pay2Label: string; customFields: string[] },
  onStep?: (msg: string) => void,
) {
  onStep?.("Adding starter categories");
  for (const c of DEFAULT_CATEGORIES_FOR_SEED()) await addRow(loc, "categories", c);
  onStep?.("Adding your salary months");
  const [y, m] = opts.startMonth.split("-").map(Number);
  for (let i = 0; i < opts.months; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await addRow(loc, "salary", {
      ID: crypto.randomUUID(),
      ...salaryRow({ monthKey: key, income15th: 0, income30th: 0, totalBudget: 0, actualExpenses: 0, autoSync: true }),
    });
  }
  onStep?.("Saving settings");
  await addRow(loc, "settings", { Key: "Pay1Label", Value: opts.pay1Label });
  await addRow(loc, "settings", { Key: "Pay2Label", Value: opts.pay2Label });
  await addRow(loc, "settings", { Key: "CustomFields", Value: opts.customFields.join(",") });
}

function DEFAULT_CATEGORIES_FOR_SEED(): Row[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ID: crypto.randomUUID(), Name: c.name, Type: c.type, Budget: c.budget }));
}
