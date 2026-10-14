import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { peso, pesoRound, pct } from "@/lib/format";

export interface Slice {
  id: string;
  name: string;
  value: number;
  color: string;
}

export function CategoryDonut({ slices, monthLabel }: { slices: Slice[]; monthLabel: string }) {
  const total = slices.reduce((t, s) => t + s.value, 0);
  const shown = slices.filter((s) => s.value > 0);
  const config: ChartConfig = Object.fromEntries(shown.map((s) => [s.id, { label: s.name, color: s.color }]));
  const top = [...shown].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
      <div className="relative mx-auto w-full max-w-[220px]">
        <ChartContainer config={config} className="aspect-square w-full" aria-hidden="true">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="id" hideLabel formatter={(v, _n, item) => `${item.payload.name}: ${peso(Number(v))}`} />} />
            <Pie data={shown} dataKey="value" nameKey="id" innerRadius="62%" outerRadius="100%" strokeWidth={2} isAnimationActive={false}>
              {shown.map((s) => (
                <Cell key={s.id} fill={s.color} className="stroke-card" />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
          <span className="text-xs text-muted-foreground">Spent</span>
          <span className="text-lg font-bold tabular-nums">{pesoRound(total)}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-sm">
          {total > 0 && top
            ? `${top.name} is the largest share at ${pct((top.value / total) * 100)} of ${peso(total)} spent in ${monthLabel}.`
            : `No expenses logged in ${monthLabel}.`}
        </p>
        <ul className="grid gap-1.5 text-sm" aria-label={`Expenses by category, ${monthLabel}`}>
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="tabular-nums font-medium">{peso(s.value)}</span>
              <span className="w-10 text-right tabular-nums text-muted-foreground">{total > 0 ? pct((s.value / total) * 100) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export interface DayPoint {
  day: number;
  label: string;
  amount: number;
}

const trendConfig: ChartConfig = { amount: { label: "Spent", color: "var(--primary)" } };

export function DailyTrend({ points, monthLabel }: { points: DayPoint[]; monthLabel: string }) {
  const active = points.filter((p) => p.amount > 0);
  const peak = [...active].sort((a, b) => b.amount - a.amount)[0];
  const avg = active.length ? active.reduce((t, p) => t + p.amount, 0) / active.length : 0;

  return (
    <div>
      <p className="text-sm">
        {peak
          ? `Highest day: ${peak.label} at ${peso(peak.amount)}. Average on spending days: ${peso(avg)} across ${active.length} days.`
          : `No expenses logged in ${monthLabel}.`}
      </p>
      <ChartContainer config={trendConfig} className="mt-3 h-56 w-full" aria-hidden="true">
        <BarChart data={points} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={2} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `₱${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_l, p) => p?.[0]?.payload?.label} formatter={(v) => peso(Number(v))} />} />
          <Bar dataKey="amount" fill="var(--color-amount)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Daily amounts table</summary>
        <table className="mt-2 w-full max-w-sm">
          <caption className="sr-only">{`Daily expenses, ${monthLabel}`}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-1 font-semibold">Day</th>
              <th scope="col" className="py-1 text-right font-semibold">Spent</th>
            </tr>
          </thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.day} className="border-b border-border last:border-0">
                <th scope="row" className="py-1 text-left font-normal">{p.label}</th>
                <td className="py-1 text-right tabular-nums">{peso(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
