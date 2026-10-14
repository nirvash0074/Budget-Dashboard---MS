import { cn } from "@/lib/utils";
import { pesoRound } from "@/lib/format";

export interface MeterRow {
  id: string;
  name: string;
  budget: number;
  spent: number;
}

/** Horizontal budget-vs-actual meter; bar = spent, vertical tick = budget. */
export function BudgetMeter({ rows, monthLabel }: { rows: MeterRow[]; monthLabel: string }) {
  const rowH = 46;
  const labelW = 150;
  const valueW = 180;
  const width = 720;
  const trackW = width - labelW - valueW;
  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.budget, r.spent)));
  const height = rows.length * rowH + 8;
  const over = rows.filter((r) => r.spent > r.budget);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby="meter-title meter-desc">
        <title id="meter-title">{`Spending against budget by category, ${monthLabel}`}</title>
        <desc id="meter-desc">
          {rows.map((r) => `${r.name}: ${pesoRound(r.spent)} spent of ${pesoRound(r.budget)} budget`).join(". ")}
        </desc>
        {rows.map((r, i) => {
          const y = i * rowH + 8;
          const budgetW = (r.budget / scaleMax) * trackW;
          const spentW = (Math.min(r.spent, r.budget) / scaleMax) * trackW;
          const overW = r.spent > r.budget ? ((r.spent - r.budget) / scaleMax) * trackW : 0;
          const isOver = r.spent > r.budget;
          const ratio = r.budget > 0 ? r.spent / r.budget : r.spent > 0 ? 2 : 0;
          return (
            <g key={r.id}>
              <text x={0} y={y + 20} className="fill-foreground text-[14px] font-medium">
                {r.name.length > 20 ? r.name.slice(0, 19) + "…" : r.name}
              </text>
              <rect x={labelW} y={y + 6} width={Math.max(budgetW, 2)} height={20} rx={10} className="fill-muted stroke-border" />
              <rect
                x={labelW}
                y={y + 6}
                width={spentW}
                height={20}
                rx={10}
                className={ratio >= 0.8 && !isOver ? "fill-amber-600" : "fill-primary"}
              />
              {overW > 0 && (
                <rect x={labelW + budgetW - 4} y={y + 6} width={overW + 4} height={20} rx={10} className="fill-destructive" />
              )}
              <line x1={labelW + budgetW} x2={labelW + budgetW} y1={y + 1} y2={y + 31} className="stroke-foreground" strokeWidth={2} />
              <text x={width} y={y + 15} textAnchor="end" className="fill-foreground text-[13px] font-semibold tabular-nums">
                {`${pesoRound(r.spent)} / ${pesoRound(r.budget)}`}
              </text>
              <text
                x={width}
                y={y + 32}
                textAnchor="end"
                className={cn("text-[12px] tabular-nums", isOver ? "fill-destructive font-semibold" : "fill-muted-foreground")}
              >
                {isOver ? `${pesoRound(r.spent - r.budget)} over` : `${pesoRound(r.budget - r.spent)} left`}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-sm text-muted-foreground">
        Bar = spent (amber from 80% of budget); vertical line = monthly budget.
        {over.length > 0 && (
          <span className="font-medium text-destructive"> Over budget: {over.map((o) => o.name).join(", ")}.</span>
        )}
      </figcaption>
    </figure>
  );
}
