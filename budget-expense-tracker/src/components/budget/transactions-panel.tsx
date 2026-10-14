import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Download, Pencil, ReceiptText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EmptyState } from "@/components/states";
import { useConfirm } from "@/hooks/use-confirm";
import { byName, type Transaction } from "@/lib/store";
import { useBudget, useBudgetActions } from "@/lib/budget";
import { peso } from "@/lib/format";
import { cn } from "@/lib/utils";

function csvCell(v: string | number) {
  let s = String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function TransactionsPanel({
  monthKey,
  monthLabel,
  onEdit,
}: {
  monthKey: string;
  monthLabel: string;
  onEdit: (tx: Transaction) => void;
}) {
  const { transactions, categories, customFields } = useBudget();
  const { deleteTransaction } = useBudgetActions();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [cat, setCat] = useState("all");

  const catName = (t: Transaction) => categories.find((c) => c.id === t.categoryId)?.name ?? t.categoryName;
  const q = query.trim().toLowerCase();
  const visible = transactions
    .filter((t) => t.date.startsWith(monthKey))
    .filter((t) => type === "all" || t.type === type)
    .filter((t) => cat === "all" || t.categoryId === cat)
    .filter(
      (t) =>
        !q ||
        t.description.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        catName(t).toLowerCase().includes(q) ||
        Object.values(t.custom).some((v) => v.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const filterCats = categories.filter((c) => type === "all" || c.type === type).sort(byName);

  async function remove(t: Transaction) {
    const ok = await confirm({
      title: "Delete this transaction?",
      description: `${t.description} · ${peso(t.amount)}`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(t.id);
    try {
      await deleteTransaction(t.id);
      toast.success("Transaction deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the transaction.");
    } finally {
      setDeleting(null);
    }
  }

  function exportCsv() {
    const header = ["Date", "Type", "Category", "Description", "Amount", "Payment Method", "Notes", ...customFields].map(csvCell);
    const lines = visible.map((t) =>
      [t.date, t.type, catName(t), t.description, t.amount.toFixed(2), t.method, t.notes, ...customFields.map((f) => t.custom[f] ?? "")]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${monthKey}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Exported ${visible.length} transaction${visible.length === 1 ? "" : "s"}`);
  }

  return (
    <section aria-labelledby="tx-heading" className="rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tx-heading" className="font-heading text-xl font-bold">Transactions</h2>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download aria-hidden="true" /> Export CSV
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem]">
        <div className="relative">
          <Label htmlFor="tx-search" className="sr-only">Search transactions</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id="tx-search" type="search" placeholder="Search description, notes, category" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <div>
          <Label htmlFor="tx-type" className="sr-only">Type</Label>
          <NativeSelect id="tx-type" value={type} onChange={(e) => { setType(e.target.value); setCat("all"); }} className="w-full">
            <NativeSelectOption value="all">All types</NativeSelectOption>
            <NativeSelectOption value="expense">Expenses</NativeSelectOption>
            <NativeSelectOption value="income">Income</NativeSelectOption>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="tx-cat" className="sr-only">Category</Label>
          <NativeSelect id="tx-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="w-full">
            <NativeSelectOption value="all">All categories</NativeSelectOption>
            {filterCats.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={ReceiptText} title={`No matching transactions in ${monthLabel}`} className="py-10" />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{`Transactions in ${monthLabel}`}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
                <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Category</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Method</th>
                {customFields.map((f) => (
                  <th key={f} scope="col" className="py-2 pr-3 font-semibold">{f}</th>
                ))}
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Amount</th>
                <th scope="col" className="py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{format(parseISO(t.date), "MMM d")}</td>
                  <td className="max-w-[18rem] py-2 pr-3">
                    <p className="truncate font-medium">{t.description}</p>
                    {t.notes && <p className="truncate text-xs text-muted-foreground">{t.notes}</p>}
                  </td>
                  <td className="py-2 pr-3">{catName(t)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{t.method}</td>
                  {customFields.map((f) => (
                    <td key={f} className="max-w-[12rem] truncate py-2 pr-3">{t.custom[f]}</td>
                  ))}
                  <td
                    className={cn(
                      "py-2 pr-3 text-right font-semibold tabular-nums whitespace-nowrap",
                      t.type === "income" && "text-emerald-800 dark:text-emerald-300",
                    )}
                  >
                    {t.type === "income" ? `+${peso(t.amount)}` : `−${peso(t.amount)}`}
                    <span className="sr-only">{t.type === "income" ? " income" : " expense"}</span>
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {t.locked ? (
                      <span className="text-xs text-muted-foreground">Fix ID in workbook to edit</span>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${t.description}`} onClick={() => onEdit(t)}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${t.description}`}
                          disabled={deleting === t.id}
                          onClick={() => void remove(t)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
