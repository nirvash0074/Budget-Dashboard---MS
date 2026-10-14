import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { seedWorkbook } from "@/lib/budget";
import {
  createTables, listTables, locateWorkbook, missingTables, TABLES, type TableKey, type WorkbookLocator,
} from "@/lib/workbook";

type Phase =
  | { kind: "link" }
  | { kind: "found"; loc: WorkbookLocator; missing: TableKey[] };

const FIELD_RE = /^[A-Za-z][A-Za-z0-9 ]{0,29}$/;
const RESERVED = new Set<string>(TABLES.transactions.columns.map((c) => c.toLowerCase()));

/** Workbook diagram: the four tables the app keeps in the user's file. */
function WorkbookDiagram() {
  const tabs = [TABLES.transactions, TABLES.categories, TABLES.salary, TABLES.settings];
  return (
    <figure className="m-0">
      <svg viewBox="0 0 520 250" className="h-auto w-full" role="img" aria-labelledby="wb-title wb-desc">
        <title id="wb-title">Your budget workbook</title>
        <desc id="wb-desc">
          One Excel workbook with four sheets: Transactions, Categories, Salary and Settings, each holding one table the app reads and writes.
        </desc>
        <rect x="8" y="8" width="504" height="234" rx="18" className="fill-card stroke-border" strokeWidth="2" />
        <rect x="8" y="8" width="504" height="40" rx="18" className="fill-primary" />
        <rect x="8" y="30" width="504" height="18" className="fill-primary" />
        <text x="28" y="34" className="fill-primary-foreground text-[15px] font-semibold">Budget.xlsx</text>
        {[0, 1, 2, 3, 4].map((r) => (
          <g key={r}>
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <rect key={c} x={28 + c * 78} y={64 + r * 26} width={74} height={22} rx={3}
                className={r === 0 ? "fill-accent stroke-border" : "fill-background stroke-border"} />
            ))}
          </g>
        ))}
        {TABLES.transactions.columns.slice(1, 7).map((c, i) => (
          <text key={c} x={34 + i * 78} y={79} className="fill-accent-foreground text-[11px] font-semibold">{c}</text>
        ))}
        {tabs.map((t, i) => (
          <g key={t.sheet}>
            <rect x={28 + i * 118} y={202} width={110} height={28} rx={6}
              className={i === 0 ? "fill-primary" : "fill-muted stroke-border"} />
            <text x={83 + i * 118} y={221} textAnchor="middle"
              className={i === 0 ? "fill-primary-foreground text-[12px] font-semibold" : "fill-foreground text-[12px]"}>
              {t.sheet}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-muted-foreground">
        The app keeps your data in four tables inside one workbook you own.
      </figcaption>
    </figure>
  );
}

export function WorkbookSetup() {
  const setLocator = useAppStore((s) => s.setLocator);
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "link" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function find(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const link = String(new FormData(ev.currentTarget).get("link") ?? "").trim();
    if (!link) return;
    setError(null);
    setBusy("Finding your workbook…");
    try {
      const loc = await locateWorkbook(link);
      setBusy("Checking its tables…");
      const missing = missingTables(await listTables(loc));
      if (missing.length === 0) {
        setLocator(loc);
        await qc.invalidateQueries({ queryKey: ["budget"] });
        toast.success(`Connected to ${loc.fileName}`);
        return;
      }
      setPhase({ kind: "found", loc, missing });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that workbook.");
    } finally {
      setBusy(null);
    }
  }

  async function setup(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (phase.kind !== "found") return;
    const fd = new FormData(ev.currentTarget);
    const pay1Label = String(fd.get("pay1") ?? "").trim() || "15th";
    const pay2Label = String(fd.get("pay2") ?? "").trim() || "30th";
    const startMonth = String(fd.get("start") ?? "");
    const months = Number(fd.get("months") ?? 10);
    const customFields = String(fd.get("custom") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = customFields.find((f) => !FIELD_RE.test(f) || RESERVED.has(f.toLowerCase()));
    if (bad) {
      setError(`"${bad}" can't be used as a column name. Use letters, numbers and spaces, starting with a letter, and avoid the built-in column names.`);
      return;
    }
    if (new Set(customFields.map((f) => f.toLowerCase())).size !== customFields.length) {
      setError("Each extra column needs a different name.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !Number.isInteger(months) || months < 1 || months > 36) {
      setError("Choose a start month and between 1 and 36 months.");
      return;
    }
    setError(null);
    try {
      const fresh = phase.missing.length === Object.keys(TABLES).length;
      await createTables(phase.loc, phase.missing, customFields, setBusy);
      if (fresh) await seedWorkbook(phase.loc, { startMonth, months, pay1Label, pay2Label, customFields }, setBusy);
      setLocator(phase.loc);
      await qc.invalidateQueries({ queryKey: ["budget"] });
      toast.success(`${phase.loc.fileName} is ready`);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Setup didn't finish.") +
          " Anything already added stays in the workbook; run setup again to add what's missing.",
      );
      const missing = missingTables(await listTables(phase.loc).catch(() => []));
      setPhase({ ...phase, missing: missing.length ? missing : phase.missing });
    } finally {
      setBusy(null);
    }
  }

  const fresh = phase.kind === "found" && phase.missing.length === Object.keys(TABLES).length;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-14">
      <section aria-labelledby="setup-heading" className="flex flex-col gap-6">
        <h1 id="setup-heading" className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Connect your budget workbook
        </h1>

        {phase.kind === "link" && (
          <>
            <ol className="grid gap-3 text-sm">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                <span>
                  <strong>New database:</strong> in OneDrive or a SharePoint site, choose <strong>New → Excel workbook</strong> and give it a name.
                  <br />
                  <strong>Existing database:</strong> open the workbook you already use with this app.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                <span>Copy its link (<strong>Share → Copy link</strong>, or the browser address bar) and paste it below.</span>
              </li>
            </ol>
            <form onSubmit={(e) => void find(e)} className="grid gap-3" aria-busy={!!busy}>
              <div className="grid gap-1.5">
                <Label htmlFor="wb-link">Workbook link</Label>
                <Input id="wb-link" name="link" type="url" required placeholder="https://…sharepoint.com/…" autoComplete="off" />
              </div>
              <Button type="submit" disabled={!!busy}>
                {busy ? <Spinner aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
                {busy ?? "Open workbook"}
              </Button>
            </form>
          </>
        )}

        {phase.kind === "found" && (
          <form onSubmit={(e) => void setup(e)} className="grid gap-4" aria-busy={!!busy}>
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
              <span>
                Found <strong>{phase.loc.fileName}</strong>.{" "}
                {fresh
                  ? "It doesn't have the budget tables yet; set them up below."
                  : `It's missing: ${phase.missing.map((k) => TABLES[k].sheet).join(", ")}.`}
              </span>
            </p>
            {fresh && (
              <>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-1 text-sm font-semibold">Salary schedule</legend>
                  <div className="grid gap-1">
                    <Label htmlFor="pay1">First payday</Label>
                    <Input id="pay1" name="pay1" defaultValue="15th" maxLength={20} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="pay2">Second payday</Label>
                    <Input id="pay2" name="pay2" defaultValue="30th" maxLength={20} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="start">First month</Label>
                    <Input id="start" name="start" type="month" defaultValue={format(new Date(), "yyyy-MM")} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="months">Number of months</Label>
                    <Input id="months" name="months" type="number" min={1} max={36} defaultValue={10} required />
                  </div>
                </fieldset>
                <div className="grid gap-1">
                  <Label htmlFor="custom">Extra transaction columns (optional)</Label>
                  <Input id="custom" name="custom" placeholder="e.g. Project, Receipt No" maxLength={200} />
                  <p className="text-xs text-muted-foreground">
                    Separate with commas. You can also add columns to the Transactions table in Excel later; the app picks them up.
                  </p>
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!!busy}>
                {busy ? <Spinner aria-hidden="true" /> : null}
                {busy ?? (fresh ? "Set up workbook" : "Add missing tables")}
              </Button>
              <Button type="button" variant="ghost" disabled={!!busy} onClick={() => { setPhase({ kind: "link" }); setError(null); }}>
                Use a different workbook
              </Button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <p className="sr-only" aria-live="polite">{busy ?? ""}</p>
      </section>

      <div className="self-center rounded-3xl border border-border bg-card p-5 sm:p-7">
        <WorkbookDiagram />
      </div>
    </div>
  );
}
