# Budget Expense Tracker

A personal budget and expense tracker where **each user keeps their own data in their own Excel workbook**, stored in OneDrive for work or a SharePoint site.

Built as a Microsoft Power Platform managed app (React 19 + TypeScript + Vite, shadcn/ui, Tailwind CSS v4, TanStack Query, recharts).

## Features

- **Bring-your-own workbook** – first-run setup: paste a link to a blank or existing `.xlsx`; the app creates the sheets and tables it needs.
- **Transactions** – income and expenses with category, payment method, notes, and user-defined extra columns; search, filters, CSV export.
- **Categories (A–Z)** with monthly budgets.
- **Dashboard** – budget vs. actual meter, expenses-by-category donut, daily spending chart, KPIs (budget, spent, remaining, net cash flow).
- **Salary schedule** – two named paydays per month, any start month and length, projected vs. actual savings.

## Workbook schema

| Sheet | Table | Columns |
|-------|-------|---------|
| Transactions | `BudgetTransactions` | ID, Date, Type, Category, Description, Amount, Method, Notes, *(your extra columns)* |
| Categories | `BudgetCategories` | ID, Name, Type, Budget |
| Salary | `BudgetSalary` | ID, Month, Pay1, Pay2, Budget, ActualExpenses, UseTransactions |
| Settings | `BudgetSettings` | Key, Value (`Pay1Label`, `Pay2Label`, `CustomFields`) |

## Data access

All data access goes through Power Platform connectors at runtime, using each signed-in user's own connection:

- **Excel Online (Business)** – read/add/update/delete rows, create worksheets and tables.
- **SharePoint** – resolves a pasted OneDrive/SharePoint link to the workbook's drive and file IDs.

The typed connector clients in `generated/` were produced by the App Builder tooling and depend on the `@microsoft/managed-apps` runtime. **This app does not run as a standalone website**: it needs to be hosted as a Power Platform managed app with those two connections bound.

Key source files:

- `src/lib/workbook.ts` – workbook locating, table setup, row read/write, cell normalization
- `src/lib/budget.ts` – data loading and write actions (TanStack Query)
- `src/components/budget/` – UI (setup screen, charts, transactions, salary, categories)
- `src/pages/home.tsx` – page composition

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build      # output in dist/
```

### Cloudflare Pages

Build command `npm install && npm run build`, output directory `dist`. The site builds and loads, but workbook access only works when hosted as a Power Platform managed app (see *Data access*).

## Notes

- Each workbook is meant for one person. Concurrent edits (two app users, or Excel open for editing while the app saves) can conflict.
- The selected workbook location is remembered per device in browser storage (IDs only, no budget data).
