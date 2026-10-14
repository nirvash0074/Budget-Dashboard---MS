import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { byName, type Category, type TxType } from "@/lib/store";
import { useBudget, useBudgetActions } from "@/lib/budget";
import { pesoRound } from "@/lib/format";

function BudgetInput({ category }: { category: Category }) {
  const { setBudget } = useBudgetActions();
  const [value, setValue] = useState(String(category.budget));
  const [saving, setSaving] = useState(false);
  async function commit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setValue(String(category.budget));
      toast.error("Budget must be zero or more.");
      return;
    }
    if (Math.round(n) !== category.budget) {
      setSaving(true);
      try {
        await setBudget(category.id, Math.round(n));
        toast.success(`${category.name} budget set to ${pesoRound(Math.round(n))}`);
      } catch (e) {
        setValue(String(category.budget));
        toast.error(e instanceof Error ? e.message : "Couldn't save the budget.");
      } finally {
        setSaving(false);
      }
    }
  }
  return (
    <Input
      type="number"
      min="0"
      step="100"
      inputMode="numeric"
      aria-label={`Monthly budget for ${category.name}`}
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-8 w-28 text-right tabular-nums"
    />
  );
}

export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { categories, transactions } = useBudget();
  const { addCategory, deleteCategory } = useBudgetActions();
  const confirm = useConfirm();
  const [type, setType] = useState<TxType>("expense");
  const [busy, setBusy] = useState(false);

  async function add(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "");
    const budget = Number(fd.get("budget") ?? 0);
    setBusy(true);
    try {
      const created = await addCategory(name, type, Number.isFinite(budget) && budget > 0 ? Math.round(budget) : 0);
      if (!created) {
        toast.error("Enter a category name that isn't already in the list.");
        return;
      }
      toast.success(`Added ${created.name}`);
      form.reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the category.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Category) {
    const used = transactions.filter((t) => t.categoryId === c.id).length;
    if (used > 0) {
      toast.error(`${c.name} is used by ${used} transaction${used > 1 ? "s" : ""}. Recategorize or delete them first.`);
      return;
    }
    const ok = await confirm({ title: `Delete ${c.name}?`, confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteCategory(c.id);
      toast.success(`${c.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the category.");
    } finally {
      setBusy(false);
    }
  }

  const groups: { type: TxType; title: string }[] = [
    { type: "expense", title: "Expense categories" },
    { type: "income", title: "Income categories" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categories & monthly budgets (A–Z)</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void add(e)} className="grid gap-3 rounded-xl border border-border bg-muted p-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-end">
          <div className="grid gap-1">
            <Label htmlFor="cat-name">New category</Label>
            <Input id="cat-name" name="name" required maxLength={40} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cat-type">Type</Label>
            <NativeSelect id="cat-type" value={type} onChange={(e) => setType(e.target.value as TxType)} className="w-full">
              <NativeSelectOption value="expense">Expense</NativeSelectOption>
              <NativeSelectOption value="income">Income</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="cat-budget">Budget (₱)</Label>
            <Input id="cat-budget" name="budget" type="number" min="0" step="100" disabled={type === "income"} />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add"}</Button>
        </form>
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {groups.map((g) => (
            <section key={g.type} aria-label={g.title} className="mt-2">
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <ul className="mt-1 divide-y divide-border">
                {categories
                  .filter((c) => c.type === g.type)
                  .sort(byName)
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.type === "expense" && <BudgetInput key={`${c.id}-${c.budget}`} category={c} />}
                      <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} disabled={busy} onClick={() => void remove(c)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
