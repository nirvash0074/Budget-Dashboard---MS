/**
 * Excel workbook "database" adapter.
 * Each user points the app at their own workbook (OneDrive or a SharePoint
 * site). Locators (source/drive/file) are resolved once and remembered on this
 * device; every row read/write goes through the Excel Online (Business) actions.
 */
import { ExcelOnline_Business_Service, SharePointService } from "../../generated";

export interface WorkbookLocator {
  source: string;
  drive: string;
  file: string;
  fileName: string;
  siteUrl: string;
  webUrl: string;
}

const LOCATOR_KEY = "budget-workbook-locator-v1";

export function loadLocator(): WorkbookLocator | null {
  try {
    const raw = localStorage.getItem(LOCATOR_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<WorkbookLocator>;
    if (v && v.source && v.drive && v.file) return v as WorkbookLocator;
  } catch {
    /* ignore corrupt value */
  }
  return null;
}

export function saveLocator(loc: WorkbookLocator | null) {
  if (loc) localStorage.setItem(LOCATOR_KEY, JSON.stringify(loc));
  else localStorage.removeItem(LOCATOR_KEY);
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const TABLES = {
  transactions: {
    sheet: "Transactions",
    table: "BudgetTransactions",
    columns: ["ID", "Date", "Type", "Category", "Description", "Amount", "Method", "Notes"],
  },
  categories: { sheet: "Categories", table: "BudgetCategories", columns: ["ID", "Name", "Type", "Budget"] },
  salary: {
    sheet: "Salary",
    table: "BudgetSalary",
    columns: ["ID", "Month", "Pay1", "Pay2", "Budget", "ActualExpenses", "UseTransactions"],
  },
  settings: { sheet: "Settings", table: "BudgetSettings", columns: ["Key", "Value"] },
} as const;

export type TableKey = keyof typeof TABLES;
export const ID_COLUMN: Record<TableKey, string> = {
  transactions: "ID",
  categories: "ID",
  salary: "ID",
  settings: "Key",
};

export class WorkbookError extends Error {
  constructor(message: string, readonly kind: "locate" | "access" | "shape" | "write" = "access") {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function asJson(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Locating a workbook from a pasted link                              */
/* ------------------------------------------------------------------ */

/** Derive the SharePoint site URL (dataset) a OneDrive/SharePoint link belongs to. */
export function siteFromLink(link: string): { siteUrl: string; personal: boolean } {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new WorkbookError("That doesn't look like a link. Paste the full https:// link to the workbook.", "locate");
  }
  if (url.protocol !== "https:" || !/\.sharepoint\.com$/i.test(url.hostname)) {
    throw new WorkbookError("Use a link to a workbook in OneDrive for work or a SharePoint site (…sharepoint.com).", "locate");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  // Sharing links: /:x:/g/personal/<user>/…, /:x:/r/sites/<site>/…, /:x:/s/<site>/…
  let i = 0;
  if (parts[0]?.startsWith(":")) i = 2;
  const kind = parts[i];
  const name = parts[i + 1];
  const personal = /-my\.sharepoint\.com$/i.test(url.hostname);
  if ((kind === "personal" || kind === "sites" || kind === "teams") && name) {
    return { siteUrl: `${url.origin}/${kind}/${name}`, personal };
  }
  if (parts[0] === ":x:" && parts[1] === "s" && name) {
    return { siteUrl: `${url.origin}/sites/${parts[2]}`, personal };
  }
  return { siteUrl: url.origin, personal };
}

function encodeShareId(link: string) {
  const b64 = btoa(unescape(encodeURIComponent(link)));
  return "u!" + b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

async function spGet(siteUrl: string, uri: string): Promise<unknown> {
  const result = await SharePointService.HttpRequest(siteUrl, {
    method: "GET",
    uri,
    headers: { Accept: "application/json" },
  });
  if (!result.success) {
    console.error("SharePoint request failed", result.error);
    throw new WorkbookError("Couldn't open that link. Check you have access to the workbook and that you're signed in.", "access");
  }
  return asJson(result.data as unknown);
}

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  driveId: string;
}

function toDriveItem(data: unknown): DriveItem {
  if (!isObj(data)) throw new WorkbookError("Unexpected response while locating the workbook.", "shape");
  const parent = isObj(data.parentReference) ? data.parentReference : {};
  const id = typeof data.id === "string" ? data.id : "";
  const driveId = typeof parent.driveId === "string" ? parent.driveId : "";
  const name = typeof data.name === "string" ? data.name : "";
  const webUrl = typeof data.webUrl === "string" ? data.webUrl : "";
  if (!id || !driveId) throw new WorkbookError("Unexpected response while locating the workbook.", "shape");
  return { id, name, webUrl, driveId };
}

async function resolveDriveItem(siteUrl: string, link: string): Promise<DriveItem> {
  const select = "?$select=id,name,webUrl,parentReference";
  // Browser links (Doc.aspx?sourcedoc={guid}) → find the file's path first.
  const u = new URL(link.trim());
  const sourcedoc = u.searchParams.get("sourcedoc")?.replace(/[{}]/g, "");
  let target = link.trim();
  if (sourcedoc && /^[0-9a-f-]{36}$/i.test(sourcedoc)) {
    const f = await spGet(siteUrl, `_api/web/GetFileById('${sourcedoc}')?$select=ServerRelativeUrl`);
    const fd = isObj(f) && isObj(f.d) ? f.d : f;
    const rel = isObj(fd) && typeof fd.ServerRelativeUrl === "string" ? fd.ServerRelativeUrl : "";
    if (!rel) throw new WorkbookError("Couldn't find that workbook. Try the link from Share → Copy link.", "locate");
    target = `${u.origin}${rel}`;
  }
  const data = await spGet(siteUrl, `_api/v2.0/shares/${encodeShareId(target)}/driveItem${select}`);
  return toDriveItem(data);
}

/** Resolve a pasted link to Excel locators and confirm the connector can open it. */
export async function locateWorkbook(link: string): Promise<WorkbookLocator> {
  const { siteUrl, personal } = siteFromLink(link);
  const item = await resolveDriveItem(siteUrl, link);
  if (!/\.xlsx$/i.test(item.name)) {
    throw new WorkbookError("That file isn't an Excel workbook (.xlsx).", "locate");
  }
  const candidates = personal ? ["me", siteUrl] : [siteUrl];
  for (const source of candidates) {
    const r = await ExcelOnline_Business_Service.GetAllWorksheets(source, item.driveId, item.id);
    if (r.success) {
      return { source, drive: item.driveId, file: item.id, fileName: item.name, siteUrl, webUrl: item.webUrl };
    }
    console.error("Excel open failed", r.error);
  }
  throw new WorkbookError("Found the file but Excel couldn't open it. Make sure it's closed for editing elsewhere and try again.", "access");
}

/* ------------------------------------------------------------------ */
/* Workbook structure                                                  */
/* ------------------------------------------------------------------ */

function namesFrom(data: unknown, label: string): string[] {
  const d = asJson(data);
  const entries: unknown = Array.isArray(d) ? d : isObj(d) ? d.value : undefined;
  if (!Array.isArray(entries)) throw new WorkbookError(`Unexpected ${label} response.`, "shape");
  return entries.map((e) => {
    if (!isObj(e)) throw new WorkbookError(`Unexpected ${label} entry.`, "shape");
    const n = [e.Name, e.name, e.DisplayName, e.displayName].find((x) => typeof x === "string" && x.trim());
    if (typeof n !== "string") throw new WorkbookError(`Unexpected ${label} entry.`, "shape");
    return n;
  });
}

export async function listTables(loc: WorkbookLocator): Promise<string[]> {
  const r = await ExcelOnline_Business_Service.GetTables(loc.source, loc.drive, loc.file);
  if (!r.success) {
    console.error("GetTables failed", r.error);
    throw new WorkbookError("Couldn't read the workbook's tables.", "access");
  }
  return namesFrom(r.data, "table list");
}

async function listSheets(loc: WorkbookLocator): Promise<string[]> {
  const r = await ExcelOnline_Business_Service.GetAllWorksheets(loc.source, loc.drive, loc.file);
  if (!r.success) {
    console.error("GetAllWorksheets failed", r.error);
    throw new WorkbookError("Couldn't read the workbook's sheets.", "access");
  }
  return namesFrom(r.data, "worksheet list");
}

const colLetter = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export function missingTables(existing: string[]): TableKey[] {
  const have = new Set(existing.map((t) => t.toLowerCase()));
  return (Object.keys(TABLES) as TableKey[]).filter((k) => !have.has(TABLES[k].table.toLowerCase()));
}

/** Create the missing worksheets and tables. Never touches tables that already exist. */
export async function createTables(
  loc: WorkbookLocator,
  keys: TableKey[],
  customFields: string[],
  onStep?: (msg: string) => void,
) {
  const sheets = new Set((await listSheets(loc)).map((s) => s.toLowerCase()));
  for (const key of keys) {
    const def = TABLES[key];
    const cols: string[] = key === "transactions" ? [...def.columns, ...customFields] : [...def.columns];
    if (!sheets.has(def.sheet.toLowerCase())) {
      onStep?.(`Adding the ${def.sheet} sheet`);
      const ws = await ExcelOnline_Business_Service.CreateWorksheet({ name: def.sheet }, loc.source, loc.drive, loc.file);
      if (!ws.success) {
        console.error("CreateWorksheet failed", ws.error);
        throw new WorkbookError(`Couldn't add the ${def.sheet} sheet.`, "write");
      }
    }
    onStep?.(`Creating the ${def.table} table`);
    const t = await ExcelOnline_Business_Service.CreateTable(loc.source, loc.drive, loc.file, {
      TableName: def.table,
      Range: `'${def.sheet}'!A1:${colLetter(cols.length)}1`,
      ColumnsNames: cols.join(","),
    });
    if (!t.success) {
      console.error("CreateTable failed", t.error);
      throw new WorkbookError(`Couldn't create the ${def.table} table.`, "write");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type Row = Record<string, unknown>;

const isSystemKey = (k: string) => k.startsWith("@") || k === "ItemInternalId" || k === "dynamicProperties";

/** Flatten one row: cells may be top-level or under dynamicProperties. */
function flattenRow(row: unknown): Row {
  if (!isObj(row)) throw new WorkbookError("Unexpected row shape.", "shape");
  const nested = isObj(row.dynamicProperties) ? row.dynamicProperties : {};
  const out: Row = {};
  for (const [k, v] of Object.entries(nested)) if (!isSystemKey(k)) out[k] = v;
  for (const [k, v] of Object.entries(row)) {
    if (isSystemKey(k)) continue;
    if (k in out && !Object.is(out[k], v)) throw new WorkbookError("Conflicting row values.", "shape");
    out[k] = v;
  }
  return out;
}

const PAGE = 500;

/** Read every row of a table (the user's workbooks are small; agreed to load all). */
export async function readAll(loc: WorkbookLocator, key: TableKey): Promise<{ rows: Row[]; columns: string[] }> {
  const def = TABLES[key];
  const rows: Row[] = [];
  let skip = 0;
  for (let page = 0; page < 40; page++) {
    const r = await ExcelOnline_Business_Service.GetItems(
      loc.source, loc.drive, loc.file, def.table,
      undefined, undefined, PAGE, skip || undefined, undefined, undefined, "ISO 8601",
    );
    if (!r.success) {
      console.error(`GetItems ${def.table} failed`, r.error);
      throw new WorkbookError(`Couldn't read the ${def.sheet} table.`, "access");
    }
    const data = asJson(r.data as unknown);
    const list: unknown = Array.isArray(data) ? data : isObj(data) ? data.value : undefined;
    if (!Array.isArray(list)) throw new WorkbookError(`Unexpected ${def.sheet} response.`, "shape");
    rows.push(...list.map(flattenRow));
    const next = isObj(data) && typeof data["@odata.nextLink"] === "string";
    if (!next && list.length < PAGE) break;
    if (list.length === 0) break;
    skip += list.length;
  }
  return { rows, columns: checkColumns(key, rows) };
}

export async function addRow(loc: WorkbookLocator, key: TableKey, item: Row) {
  const r = await ExcelOnline_Business_Service.AddRowV2(item, loc.source, loc.drive, loc.file, TABLES[key].table, "ISO 8601");
  if (!r.success) {
    console.error(`AddRowV2 ${key} failed`, r.error);
    throw new WorkbookError(`Couldn't save to the ${TABLES[key].sheet} table.`, "write");
  }
}

export async function updateRow(loc: WorkbookLocator, key: TableKey, id: string, item: Row) {
  const r = await ExcelOnline_Business_Service.PatchItem(
    loc.source, loc.drive, loc.file, TABLES[key].table, ID_COLUMN[key], id, item, undefined, "ISO 8601",
  );
  if (!r.success) {
    console.error(`PatchItem ${key} failed`, r.error);
    throw new WorkbookError(`Couldn't update the ${TABLES[key].sheet} table.`, "write");
  }
}

export async function deleteRow(loc: WorkbookLocator, key: TableKey, id: string) {
  const r = await ExcelOnline_Business_Service.DeleteItem(loc.source, loc.drive, loc.file, TABLES[key].table, ID_COLUMN[key], id);
  if (!r.success) {
    console.error(`DeleteItem ${key} failed`, r.error);
    throw new WorkbookError(`Couldn't delete from the ${TABLES[key].sheet} table.`, "write");
  }
}

/** Check every base column exists and collect the table's column list. */
function checkColumns(key: TableKey, rows: Row[]): string[] {
  const def = TABLES[key];
  const columns = new Set<string>(def.columns);
  for (const r of rows) for (const k of Object.keys(r)) columns.add(k);
  for (const c of def.columns) {
    if (rows.some((r) => !(c in r))) throw new WorkbookError(`The ${def.sheet} table is missing the "${c}" column.`, "shape");
  }
  return [...columns];
}

/* ------------------------------------------------------------------ */
/* Cell conversions                                                    */
/* ------------------------------------------------------------------ */

export const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

export function cellNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(cellText(v).replace(/[₱$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function cellBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return /^(true|yes|1|y)$/i.test(cellText(v));
}

/** Excel serial day → ISO date (yyyy-MM-dd). */
function serialToIso(serial: number) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Normalize a date cell to yyyy-MM-dd ("" when unreadable). */
export function cellDate(v: unknown): string {
  if (typeof v === "number") return serialToIso(v);
  const s = cellText(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(s)) return serialToIso(Number(s));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Normalize a month cell to yyyy-MM (Excel may turn "2026-10" into a date). */
export function cellMonth(v: unknown): string {
  const s = cellText(v);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = cellDate(v);
  return d ? d.slice(0, 7) : "";
}
