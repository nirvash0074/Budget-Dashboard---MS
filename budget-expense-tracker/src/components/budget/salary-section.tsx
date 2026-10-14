import { useMemo, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type SalaryMonth, type Settings } from "@/lib/store";
import { useBudget, useBudgetActions } from "@/lib/budget";
import { monthLabel, peso, pct, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ComputedRow extends SalaryMonth {
  income: number;
  actual: number;
  remaining: number;
  remainingPct: number | null;
  projected: number;
  saved: number;
}

function signClass(n: number) {
  return n < 0 ? "text-destructive font-semibold" : n > 0 ? "text-emerald-800 dark:text-emerald-300 font-semibold" : "";
}

export function SalarySection() {
  const { salary, transactions, settings } = useBudget();
  const p1 = settings.pay1Label;
  const p2 = settings.pay2Label;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);

  const rows: ComputedRow[] = useMemo(
    () =>
      salary.map((m) => {
        const actual = m.autoSync
          ? transactions.filter((t) => t.type === "expense" && t.date.startsWith(m.monthKey)).reduce((s, t) => s + t.amount, 0)
          : m.actualExpenses;
        const income = m.income15th + m.income30th;
        const remaining = m.totalBudget - actual;
        return {
          ...m,
          income,
          actual,
          remaining,
          remainingPct: m.totalBudget > 0 ? (remaining / m.totalBudget) * 100 : null,
          projected: income - m.totalBudget,
          saved: income - actual,
        };
      }),
    [salary, transactions],
  );

  const sum = (k: keyof ComputedRow) => rows.reduce((t, r) => t + (r[k] as number), 0);
  const tot = {
    i15: sum("income15th"),
    i30: sum("income30th"),
    income: sum("income"),
    budget: sum("totalBudget"),
    actual: sum("actual"),
    remaining: sum("remaining"),
    projected: sum("projected"),
    saved: sum("saved"),
  };
  const of = (n: number, d: number) => (d > 0 ? pct((n / d) * 100) : "—");
  const first = rows[0] ? monthLabel(rows[0].monthKey) : "";
  const last = rows.length ? monthLabel(rows[rows.length - 1].monthKey) : "";

  const kpis = [
    { label: `Income ${p1}`, value: peso(tot.i15) },
    { label: `Income ${p2}`, value: peso(tot.i30) },
    { label: "Total income", value: peso(tot.income), strong: true },
    { label: "Remaining (budget − actual)", value: peso(tot.remaining), note: `${of(tot.remaining, tot.budget)} of budget left`, tone: tot.remaining },
    { label: "Projected savings (income − budget)", value: peso(tot.projected), note: `${of(tot.projected, tot.income)} of income`, tone: tot.projected },
    { label: "Actual savings (income − actual)", value: peso(tot.saved), note: `${of(tot.saved, tot.income)} of income saved`, tone: tot.saved },
  ];

  return (
    <section aria-labelledby="salary-heading" className="rounded-3xl border border-border bg-card p-5 sm:p-7">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="salary-heading" className="font-heading text-xl font-bold">Salary allocation & savings</h2>
            <p className="text-sm text-muted-foreground">
              {rows.length ? `${first} – ${last} · paid on the ${p1} and ${p2}` : "No salary months yet"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" /> Edit allocation
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" aria-expanded={open}>
                {open ? "Hide" : "Show"}
                <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="bg-card p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</dt>
                <dd className={cn("mt-1 text-lg font-bold tabular-nums", k.strong && "text-primary", k.tone !== undefined && signClass(k.tone))}>
                  {k.value}
                </dd>
                {k.note && <dd className="text-xs text-muted-foreground">{k.note}</dd>}
              </div>
            ))}
          </dl>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">{`Monthly salary, budget and savings, ${first} to ${last}`}</caption>
              <thead>
                <tr className="border-b border-border text-right text-xs uppercase tracking-wide">
                  <th scope="col" className="py-2 pr-3 text-left font-semibold">Month</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Income {p1}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Income {p2}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Total budget</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Actual expenses</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Remaining</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">% rem.</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Projected savings</th>
                  <th scope="col" className="py-2 font-semibold">Actual savings</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.monthKey} className="border-b border-border text-right hover:bg-muted/50">
                    <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap">
                      {monthLabel(r.monthKey)}
                      {r.autoSync && <span className="ml-2 text-xs font-normal text-muted-foreground">(from transactions)</span>}
                    </th>
                    <td className="py-2 pr-3">{peso(r.income15th)}</td>
                    <td className="py-2 pr-3">{peso(r.income30th)}</td>
                    <td className="py-2 pr-3">{peso(r.totalBudget)}</td>
                    <td className="py-2 pr-3">{peso(r.actual)}</td>
                    <td className={cn("py-2 pr-3", signClass(r.remaining))}>{peso(r.remaining)}</td>
                    <td className={cn("py-2 pr-3", r.remainingPct !== null && signClass(r.remainingPct))}>
                      {r.remainingPct === null ? "—" : pct(r.remainingPct)}
                    </td>
                    <td className={cn("py-2 pr-3", signClass(r.projected))}>{peso(r.projected)}</td>
                    <td className={cn("py-2", signClass(r.saved))}>{peso(r.saved)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="tabular-nums">
                <tr className="text-right font-bold">
                  <th scope="row" className="py-3 pr-3 text-left">Total</th>
                  <td className="py-3 pr-3">{peso(tot.i15)}</td>
                  <td className="py-3 pr-3">{peso(tot.i30)}</td>
                  <td className="py-3 pr-3">{peso(tot.budget)}</td>
                  <td className="py-3 pr-3">{peso(tot.actual)}</td>
                  <td className={cn("py-3 pr-3", signClass(tot.remaining))}>{peso(tot.remaining)}</td>
                  <td className={cn("py-3 pr-3", signClass(tot.remaining))}>{of(tot.remaining, tot.budget)}</td>
                  <td className={cn("py-3 pr-3", signClass(tot.projected))}>{peso(tot.projected)}</td>
                  <td className={cn("py-3", signClass(tot.saved))}>{peso(tot.saved)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit salary schedule & budget</DialogTitle>
          </DialogHeader>
          {editing && <SalaryEditor rows={salary} settings={settings} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function nextMonth(key: string | undefined) {
  const d = key ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 1) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function SalaryEditor({ rows, settings, onDone }: { rows: SalaryMonth[]; settings: Settings; onDone: () => void }) {
  const { saveSalary } = useBudgetActions();
  const [draft, setDraft] = useState<SalaryMonth[]>(() => rows.map((r) => ({ ...r })));
  const [labels, setLabels] = useState<Settings>(settings);
  const [quick, setQuick] = useState({ i15: "", i30: "", budget: "" });
  const [saving, setSaving] = useState(false);

  const setField = (i: number, k: keyof SalaryMonth, v: number | boolean) =>
    setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  function applyQuick() {
    const i15 = Number(quick.i15 || 0), i30 = Number(quick.i30 || 0), b = Number(quick.budget || 0);
    if (![i15, i30, b].every((n) => Number.isFinite(n) && n >= 0)) {
      toast.error("Quick-apply amounts must be zero or more.");
      return;
    }
    const isEmpty = (r: SalaryMonth) => !r.income15th && !r.income30th && !r.totalBudget;
    const count = draft.filter(isEmpty).length;
    setDraft(draft.map((r) => (isEmpty(r) ? { ...r, income15th: round2(i15), income30th: round2(i30), totalBudget: round2(b) } : r)));
    toast.success(count ? `Filled ${count} empty month${count > 1 ? "s" : ""}` : "No empty months to fill");
  }

  function addMonth() {
    const sorted = [...draft].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const key = nextMonth(sorted[sorted.length - 1]?.monthKey);
    setDraft([...draft, { id: crypto.randomUUID(), monthKey: key, income15th: 0, income30th: 0, totalBudget: 0, actualExpenses: 0, autoSync: true }]);
  }

  async function save() {
    const keys = draft.map((d) => d.monthKey);
    if (keys.some((k) => !/^\d{4}-\d{2}$/.test(k))) {
      toast.error("Every row needs a month.");
      return;
    }
    if (new Set(keys).size !== keys.length) {
      toast.error("Each month can only appear once.");
      return;
    }
    const l1 = labels.pay1Label.trim(), l2 = labels.pay2Label.trim();
    if (!l1 || !l2) {
      toast.error("Name both paydays.");
      return;
    }
    setSaving(true);
    try {
      await saveSalary(draft, { pay1Label: l1, pay2Label: l2 });
      toast.success("Salary schedule saved to your workbook");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the salary schedule.");
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? round2(n) : 0;
  };
  const p1 = labels.pay1Label || "Pay 1";
  const p2 = labels.pay2Label || "Pay 2";

  return (
    <div className="grid gap-4" aria-busy={saving}>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Paydays</legend>
        <div className="grid gap-1">
          <Label htmlFor="pay1">First payday name</Label>
          <Input id="pay1" maxLength={20} value={labels.pay1Label} onChange={(e) => setLabels({ ...labels, pay1Label: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pay2">Second payday name</Label>
          <Input id="pay2" maxLength={20} value={labels.pay2Label} onChange={(e) => setLabels({ ...labels, pay2Label: e.target.value })} />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-border bg-muted p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
        <legend className="px-1 text-sm font-semibold">Quick-apply to empty months</legend>
        <div className="grid gap-1">
          <Label htmlFor="q15">{p1} pay (₱)</Label>
          <Input id="q15" type="number" min="0" step="0.01" value={quick.i15} onChange={(e) => setQuick({ ...quick, i15: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="q30">{p2} pay (₱)</Label>
          <Input id="q30" type="number" min="0" step="0.01" value={quick.i30} onChange={(e) => setQuick({ ...quick, i30: e.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="qb">Monthly budget (₱)</Label>
          <Input id="qb" type="number" min="0" step="0.01" value={quick.budget} onChange={(e) => setQuick({ ...quick, budget: e.target.value })} />
        </div>
        <Button type="button" variant="secondary" onClick={applyQuick}>Apply</Button>
      </fieldset>

      <div className="max-h-[45vh] overflow-auto">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Editable salary schedule by month</caption>
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
              <th scope="col" className="py-2 pr-2 font-semibold">Month</th>
              <th scope="col" className="py-2 pr-2 font-semibold">{p1} (₱)</th>
              <th scope="col" className="py-2 pr-2 font-semibold">{p2} (₱)</th>
              <th scope="col" className="py-2 pr-2 font-semibold">Budget (₱)</th>
              <th scope="col" className="py-2 pr-2 font-semibold">Actual expenses (₱)</th>
              <th scope="col" className="py-2 pr-2 font-semibold">Use transactions</th>
              <th scope="col" className="py-2 font-semibold"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const m = /^\d{4}-\d{2}$/.test(r.monthKey) ? monthLabel(r.monthKey) : `Row ${i + 1}`;
              return (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-2 pr-2">
                    <Input aria-label={`Month for row ${i + 1}`} type="month" className="h-8 w-40" value={r.monthKey}
                      onChange={(e) => setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, monthKey: e.target.value } : x)))} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input aria-label={`${m} ${p1} pay`} type="number" min="0" step="0.01" className="h-8 text-right tabular-nums" value={r.income15th} onChange={(e) => setField(i, "income15th", num(e.target.value))} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input aria-label={`${m} ${p2} pay`} type="number" min="0" step="0.01" className="h-8 text-right tabular-nums" value={r.income30th} onChange={(e) => setField(i, "income30th", num(e.target.value))} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input aria-label={`${m} total budget`} type="number" min="0" step="0.01" className="h-8 text-right tabular-nums" value={r.totalBudget} onChange={(e) => setField(i, "totalBudget", num(e.target.value))} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input aria-label={`${m} actual expenses`} type="number" min="0" step="0.01" className="h-8 text-right tabular-nums" value={r.actualExpenses} disabled={r.autoSync} onChange={(e) => setField(i, "actualExpenses", num(e.target.value))} />
                  </td>
                  <td className="py-2 pr-2">
                    <Switch aria-label={`Use logged transactions for ${m} actual expenses`} checked={r.autoSync} onCheckedChange={(v) => setField(i, "autoSync", v)} />
                  </td>
                  <td className="py-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${m}`} onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={addMonth}>
          <Plus aria-hidden="true" /> Add month
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}
