import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { byName, PAYMENT_METHODS, type Transaction, type TxType } from "@/lib/store";
import { useBudget, useBudgetActions } from "@/lib/budget";
import { round2 } from "@/lib/format";

const NEW_CATEGORY = "__new__";

export type TransactionInput = Omit<Transaction, "id" | "locked" | "categoryId">;

export function TransactionForm({
  initial,
  defaultDate,
  submitLabel,
  onSubmit,
}: {
  initial?: Transaction;
  defaultDate: string;
  submitLabel: string;
  onSubmit: (tx: TransactionInput) => Promise<void>;
}) {
  const { categories, customFields } = useBudget();
  const actions = useBudgetActions();
  const [type, setType] = useState<TxType>(initial?.type ?? "expense");
  const options = categories.filter((c) => c.type === type).sort(byName);
  const initialCat = initial ? categories.find((c) => c.id === initial.categoryId)?.id : undefined;
  const [categoryId, setCategoryId] = useState(initialCat ?? options[0]?.id ?? NEW_CATEGORY);
  const [newName, setNewName] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const idp = initial ? `edit-${initial.id}` : "new";

  function switchType(next: TxType) {
    if (!next || next === type) return;
    setType(next);
    const first = categories.filter((c) => c.type === next).sort(byName)[0];
    setCategoryId(first?.id ?? NEW_CATEGORY);
  }

  async function handle(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (saving) return;
    const fd = new FormData(ev.currentTarget);
    const amount = Number(fd.get("amount"));
    const description = String(fd.get("description") ?? "").trim();
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a description and an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      let categoryName = categories.find((c) => c.id === categoryId)?.name ?? initial?.categoryName ?? "";
      if (categoryId === NEW_CATEGORY) {
        const budget = Number(newBudget || 0);
        const created = await actions.addCategory(newName, type, Number.isFinite(budget) && budget > 0 ? Math.round(budget) : 0);
        if (!created) {
          toast.error("Enter a new category name that isn't already in the list.");
          return;
        }
        categoryName = created.name;
        setCategoryId(created.id);
      }
      await onSubmit({
        type,
        date: String(fd.get("date")),
        description,
        categoryName,
        amount: round2(amount),
        method: String(fd.get("method") ?? "Cash"),
        notes: String(fd.get("notes") ?? "").trim(),
        custom: Object.fromEntries(customFields.map((f) => [f, String(fd.get(`custom:${f}`) ?? "").trim()])),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the transaction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handle} className="grid gap-3 sm:grid-cols-2" aria-busy={saving}>
      <div className="grid gap-1.5 sm:col-span-2">
        <span id={`${idp}-type`} className="text-sm font-medium">Type</span>
        <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => switchType(v as TxType)} aria-labelledby={`${idp}-type`} className="w-full">
          <ToggleGroupItem value="expense" className="flex-1">Expense</ToggleGroupItem>
          <ToggleGroupItem value="income" className="flex-1">Income</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${idp}-desc`}>Description</Label>
        <Input id={`${idp}-desc`} name="description" required maxLength={120} defaultValue={initial?.description} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idp}-amount`}>Amount (₱)</Label>
        <Input id={`${idp}-amount`} name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={initial?.amount} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idp}-date`}>Date</Label>
        <Input id={`${idp}-date`} name="date" type="date" required defaultValue={initial?.date ?? defaultDate} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idp}-cat`}>Category</Label>
        <NativeSelect id={`${idp}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full">
          {options.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
          ))}
          <NativeSelectOption value={NEW_CATEGORY}>+ New category…</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idp}-method`}>Payment method</Label>
        <NativeSelect id={`${idp}-method`} name="method" defaultValue={initial?.method ?? "Debit Card"} className="w-full">
          {[...new Set([...PAYMENT_METHODS, ...(initial?.method ? [initial.method] : [])])].map((m) => (
            <NativeSelectOption key={m} value={m}>{m}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {categoryId === NEW_CATEGORY && (
        <div className="grid gap-3 rounded-xl border border-border bg-muted p-3 sm:col-span-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idp}-newcat`}>New category name</Label>
            <Input id={`${idp}-newcat`} value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} />
          </div>
          {type === "expense" && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${idp}-newbud`}>Monthly budget (₱)</Label>
              <Input id={`${idp}-newbud`} type="number" min="0" step="100" inputMode="numeric" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} />
            </div>
          )}
        </div>
      )}
      {customFields.map((f, i) => (
        <div key={f} className="grid gap-1.5">
          <Label htmlFor={`${idp}-cf-${i}`}>{f}</Label>
          <Input id={`${idp}-cf-${i}`} name={`custom:${f}`} maxLength={200} defaultValue={initial?.custom[f]} />
        </div>
      ))}
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${idp}-notes`}>Notes</Label>
        <Textarea id={`${idp}-notes`} name="notes" rows={2} maxLength={200} defaultValue={initial?.notes} />
      </div>
      <Button type="submit" className="sm:col-span-2" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
