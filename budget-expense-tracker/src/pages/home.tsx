import { useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, parseISO, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus, RefreshCw, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetMeter } from "@/components/budget/budget-meter";
import { CategoryDonut, DailyTrend, type DayPoint, type Slice } from "@/components/budget/charts";
import { CategoriesDialog } from "@/components/budget/categories-dialog";
import { SalarySection } from "@/components/budget/salary-section";
import { TransactionForm } from "@/components/budget/transaction-form";
import { TransactionsPanel } from "@/components/budget/transactions-panel";
import { WorkbookSetup } from "@/components/budget/workbook-setup";
import { ErrorState, LoadingState } from "@/components/states";
import { useConfirm } from "@/hooks/use-confirm";
import { byName, useAppStore, type Transaction } from "@/lib/store";
import { useBudget, useBudgetActions, useBudgetQuery } from "@/lib/budget";
import { safeUrl } from "@/lib/safe-url";
import { paletteColor, peso, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HomePage() {
  const locator = useAppStore((s) => s.locator);
  const setLocator = useAppStore((s) => s.setLocator);
  const query = useBudgetQuery();

  if (!locator) return <WorkbookSetup />;
  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Budget Expense Tracker</h1>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">Loading {locator.fileName}…</p>
        <LoadingState rows={4} className="mt-6" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Budget Expense Tracker</h1>
        <ErrorState
          title={`Couldn't load ${locator.fileName}`}
          description={query.error instanceof Error ? query.error.message : "The workbook couldn't be read."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
                <RefreshCw aria-hidden="true" /> {query.isFetching ? "Retrying…" : "Try again"}
              </Button>
              <Button variant="outline" onClick={() => setLocator(null)}>Use a different workbook</Button>
            </div>
          }
        />
      </div>
    );
  }
  return <Dashboard />;
}

function WorkbookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const locator = useAppStore((s) => s.locator);
  const setLocator = useAppStore((s) => s.setLocator);
  const query = useBudgetQuery();
  const confirm = useConfirm();
  if (!locator) return null;
  const href = safeUrl(locator.webUrl);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your workbook</DialogTitle>
        </DialogHeader>
        <dl className="grid gap-1 text-sm">
          <dt className="text-muted-foreground">File</dt>
          <dd className="font-medium break-all">{locator.fileName}</dd>
          <dt className="mt-2 text-muted-foreground">Location</dt>
          <dd className="break-all">{locator.source === "me" ? "Your OneDrive" : locator.siteUrl}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          {href && (
            <Button asChild variant="outline">
              <a href={href} target="_blank" rel="noopener noreferrer">Open in Excel</a>
            </Button>
          )}
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw aria-hidden="true" /> {query.isFetching ? "Reloading…" : "Reload data"}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await confirm({
                title: "Switch to a different workbook?",
                description: "Nothing is deleted. This device just stops using this file until you connect it again.",
                confirmLabel: "Switch",
              });
              if (ok) {
                onOpenChange(false);
                setLocator(null);
              }
            }}
          >
            Switch workbook
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Dashboard() {
  const { categories, transactions } = useBudget();
  const { addTransaction, updateTransaction } = useBudgetActions();
  const [wbOpen, setWbOpen] = useState(false);

  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);

  const monthKey = format(month, "yyyy-MM");
  const monthLabel = format(month, "MMMM yyyy");
  const todayKey = format(new Date(), "yyyy-MM");
  const defaultDate = monthKey === todayKey ? format(new Date(), "yyyy-MM-dd") : `${monthKey}-01`;

  const monthTx = useMemo(() => transactions.filter((t) => t.date.startsWith(monthKey)), [transactions, monthKey]);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === "expense").sort(byName), [categories]);

  const rows = expenseCats.map((c, i) => ({
    id: c.id,
    name: c.name,
    budget: c.budget,
    color: paletteColor(i),
    spent: monthTx.filter((t) => t.type === "expense" && t.categoryId === c.id).reduce((s, t) => s + t.amount, 0),
  }));

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpent = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const remaining = totalBudget - totalSpent;
  const net = totalIncome - totalSpent;

  const slices: Slice[] = rows.map((r) => ({ id: r.id, name: r.name, value: r.spent, color: r.color }));
  const days: DayPoint[] = Array.from({ length: getDaysInMonth(month) }, (_, i) => {
    const d = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
    return {
      day: i + 1,
      label: format(parseISO(d), "MMM d"),
      amount: monthTx.filter((t) => t.type === "expense" && t.date === d).reduce((s, t) => s + t.amount, 0),
    };
  });

  const kpis = [
    { label: "Monthly budget", value: peso(totalBudget), note: `${expenseCats.length} expense categories` },
    {
      label: "Expenses",
      value: peso(totalSpent),
      note: totalBudget > 0 ? `${pct((totalSpent / totalBudget) * 100)} of budget used` : "No budget set",
    },
    {
      label: "Remaining budget",
      value: peso(remaining),
      note: remaining < 0 ? "Over budget" : "On track",
      tone: remaining < 0 ? "bad" : "good",
    },
    {
      label: "Net cash flow",
      value: peso(net),
      note: totalIncome > 0 ? `${pct((net / totalIncome) * 100)} savings rate · ${peso(totalIncome)} income` : "No income logged",
      tone: net < 0 ? "bad" : "good",
    },
  ];

  const afterSave = (date: string) => {
    if (!date.startsWith(monthKey)) setMonth(parseISO(`${date.slice(0, 7)}-01`));
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Budget Expense Tracker</h1>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Month" className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Previous month" onClick={() => setMonth((m) => subMonths(m, 1))}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="min-w-36 text-center font-semibold" aria-live="polite">{monthLabel}</span>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
          <Button variant="outline" onClick={() => setWbOpen(true)}>
            <FileSpreadsheet aria-hidden="true" /> Workbook
          </Button>
          <Button variant="outline" onClick={() => setCatsOpen(true)}>
            <Tags aria-hidden="true" /> Categories
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" /> Add transaction
          </Button>
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card p-5">
            <dt className="text-sm font-medium text-muted-foreground">{k.label}</dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-bold tabular-nums",
                k.tone === "bad" && "text-destructive",
                k.tone === "good" && "text-primary",
              )}
            >
              {k.value}
            </dd>
            <dd className={cn("text-sm", k.tone === "bad" ? "font-medium text-destructive" : "text-muted-foreground")}>{k.note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="meter-heading" className="rounded-3xl border border-border bg-card p-5 sm:p-7">
          <h2 id="meter-heading" className="font-heading text-xl font-bold">Budget vs actual by category</h2>
          <div className="mt-5">
            <BudgetMeter rows={rows} monthLabel={monthLabel} />
          </div>
        </section>

        <section aria-labelledby="donut-heading" className="rounded-3xl border border-border bg-card p-5 sm:p-7">
          <h2 id="donut-heading" className="font-heading text-xl font-bold">Expenses by category</h2>
          <div className="mt-5">
            <CategoryDonut slices={slices} monthLabel={monthLabel} />
          </div>
        </section>
      </div>

      <section aria-labelledby="trend-heading" className="mt-6 rounded-3xl border border-border bg-card p-5 sm:p-7">
        <h2 id="trend-heading" className="font-heading text-xl font-bold">Daily spending</h2>
        <div className="mt-3">
          <DailyTrend points={days} monthLabel={monthLabel} />
        </div>
      </section>

      <div className="mt-6">
        <TransactionsPanel monthKey={monthKey} monthLabel={monthLabel} onEdit={setEditing} />
      </div>

      <div className="mt-6">
        <SalarySection />
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          {adding && (
            <TransactionForm
              defaultDate={defaultDate}
              submitLabel="Add transaction"
              onSubmit={async (tx) => {
                await addTransaction(tx);
                toast.success(`Added ${peso(tx.amount)} ${tx.type}`);
                setAdding(false);
                afterSave(tx.date);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          {editing && (
            <TransactionForm
              initial={editing}
              defaultDate={editing.date}
              submitLabel="Save changes"
              onSubmit={async (tx) => {
                await updateTransaction(editing.id, tx, editing);
                toast.success("Transaction updated");
                setEditing(null);
                afterSave(tx.date);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CategoriesDialog open={catsOpen} onOpenChange={setCatsOpen} />
      <WorkbookDialog open={wbOpen} onOpenChange={setWbOpen} />
    </div>
  );
}
