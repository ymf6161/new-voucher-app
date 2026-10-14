import { supabase } from "./supabase";
import type {
  Bank,
  Batch,
  BatchWithRelations,
  CompanySettings,
  Deposit,
  DepositWithRelations,
  Name,
  Reference,
  Voucher,
  VoucherCompany,
  VoucherWithRelations,
  DashboardStats,
  StatsBucket,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Current account helpers
// ---------------------------------------------------------------------------

let cachedAccountId: string | null = null;

export function setAccountId(id: string | null) {
  cachedAccountId = id;
}

function accountId(): string {
  if (!cachedAccountId) throw new Error("No account selected. Please sign in again.");
  return cachedAccountId;
}

// ---------------------------------------------------------------------------
// Column-name → JS-key mapping (snake_case → camelCase)
// ---------------------------------------------------------------------------

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRow<T>(row: Record<string, any>): T {
  if (!row) return row;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] = v;
    if (k.includes("_") && !out[k]) out[k] = v;
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Response helper that mimics the old fetch Response
// ---------------------------------------------------------------------------

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return jsonResponse({ error: "Not found" }, 404);
}

// ---------------------------------------------------------------------------
// Paging and database functions
// ---------------------------------------------------------------------------

// Supabase returns at most 1,000 rows per request (the project's "max rows"
// setting), so every list is read page by page. `build` must return a fresh
// query each time, ordered by a unique column so pages don't overlap.
const PAGE_SIZE = 1000;

async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Every row of a table in the current account, archived rows included.
function fetchAccountRows<T = any>(table: string, columns = "*"): Promise<T[]> {
  const aid = accountId();
  return fetchAll<T>(() => supabase.from(table).select(columns).eq("account_id", aid).order("id"));
}

// Multi-step writes run as one database transaction that re-checks the rules
// (see supabase/migrations/20261014120000_enforce_voucher_rules.sql).
async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Queries (GET)
// ---------------------------------------------------------------------------

async function fetchActive<T>(table: string, orderBy: string): Promise<T[]> {
  const aid = accountId();
  const rows = await fetchAll(() =>
    supabase.from(table).select("*").eq("account_id", aid).eq("is_archived", false).order(orderBy).order("id"),
  );
  return rows.map((r: any) => mapRow<T>(r));
}

const fetchVoucherCompanies = () => fetchActive<VoucherCompany>("voucher_companies", "name");
const fetchNames = () => fetchActive<Name>("names", "name");
const fetchReferences = () => fetchActive<Reference>("references", "reference");
const fetchBanks = () => fetchActive<Bank>("banks", "name");

// id → row lookups for a whole table, archived rows included, so old
// vouchers still show the company or person they were recorded against.
async function lookup<T>(table: string, columns = "*"): Promise<Record<string, T>> {
  const rows = await fetchAccountRows(table, columns);
  return Object.fromEntries(rows.map((r: any) => [r.id, mapRow<T>(r)]));
}

async function fetchSettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("account_id", accountId())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow<CompanySettings>(data) : null;
}

async function fetchVouchers(params: URLSearchParams): Promise<VoucherWithRelations[]> {
  const aid = accountId();
  const status = params.get("status");
  const companyIds = (params.get("companyId") || "").split(",").filter(Boolean);

  let batchIds: string[] | null = null;
  if (params.has("recipientId")) {
    const batches = await fetchAll(() =>
      supabase.from("batches").select("id").eq("account_id", aid).eq("recipient_name_id", params.get("recipientId")).order("id"),
    );
    batchIds = batches.map((b: any) => b.id);
    if (!batchIds.length) return [];
  }

  const build = () => {
    let q = supabase.from("vouchers").select("*").eq("account_id", aid);
    if (status) q = q.eq("status", status);
    if (companyIds.length) q = q.in("voucher_company_id", companyIds);
    if (params.has("batchId")) q = q.eq("batch_id", params.get("batchId"));
    if (params.has("depositId")) q = q.eq("deposit_id", params.get("depositId"));
    if (batchIds) q = q.in("batch_id", batchIds);
    if (status === "unposted") q = q.is("batch_id", null);
    return q.order("date_received", { ascending: false }).order("id");
  };

  const [voucherRows, companies, names, references] = await Promise.all([
    fetchAll(build),
    lookup<VoucherCompany>("voucher_companies"),
    lookup<Name>("names"),
    lookup<Reference>("references"),
  ]);

  return voucherRows.map((row: any) => ({
    ...mapRow<Voucher>(row),
    voucherCompany: companies[row.voucher_company_id],
    receivedFrom: names[row.received_from_id],
    reference: references[row.reference_id],
  }) as VoucherWithRelations);
}

async function fetchBatches(): Promise<BatchWithRelations[]> {
  const aid = accountId();
  const [batches, vouchers, companies, names, banks] = await Promise.all([
    fetchAll(() => supabase.from("batches").select("*").eq("account_id", aid).order("date_sent", { ascending: false }).order("id")),
    fetchAccountRows("vouchers", "id, voucher_company_id, quantity, amount, status, batch_id, deposit_id"),
    lookup<VoucherCompany>("voucher_companies"),
    lookup<Name>("names", "id, name"),
    lookup<Bank>("banks"),
  ]);

  const vouchersByBatch = groupBy(vouchers, "batch_id");
  return batches.map((batch: any) => {
    const batchVouchers = vouchersByBatch[batch.id] || [];
    const idsInBatch = [...new Set(batchVouchers.map((v: any) => v.voucher_company_id).filter(Boolean))];
    return {
      ...mapRow<Batch>(batch),
      voucherCompany: batch.voucher_company_id ? (companies[batch.voucher_company_id] || null) : null,
      recipient: batch.recipient_name_id ? { id: batch.recipient_name_id, name: names[batch.recipient_name_id]?.name } as Name : null,
      bank: batch.bank_id ? (banks[batch.bank_id] || null) : null,
      companyNames: idsInBatch.map((id: string) => companies[id]?.name).filter(Boolean),
      vouchers: batchVouchers.map((v: any) => mapRow<Voucher>(v)),
    } as BatchWithRelations;
  });
}

async function fetchDeposits(): Promise<DepositWithRelations[]> {
  const aid = accountId();
  const [deposits, vouchers, companies, names, banks] = await Promise.all([
    fetchAll(() => supabase.from("deposits").select("*").eq("account_id", aid).order("date_deposited", { ascending: false }).order("id")),
    fetchAll(() => supabase.from("vouchers").select("*").eq("account_id", aid).not("deposit_id", "is", null).order("id")),
    lookup<VoucherCompany>("voucher_companies"),
    lookup<Name>("names", "id, name"),
    lookup<Bank>("banks"),
  ]);

  const vouchersByDeposit = groupBy(vouchers, "deposit_id");
  return deposits.map((deposit: any) => ({
    ...mapRow<Deposit>(deposit),
    bank: banks[deposit.bank_id],
    voucherCompany: deposit.voucher_company_id ? (companies[deposit.voucher_company_id] || null) : null,
    recipient: deposit.recipient_name_id ? (names[deposit.recipient_name_id] || null) : null,
    vouchers: (vouchersByDeposit[deposit.id] || []).map((v: any) => mapRow<Voucher>(v)),
  }) as DepositWithRelations);
}

function groupBy(rows: any[], key: string): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const row of rows) {
    const k = row[key];
    if (k) (out[k] ||= []).push(row);
  }
  return out;
}

// public.users only lets people read their own row, so the member list comes
// from a database function that checks the caller belongs to the account.
async function fetchUsers(): Promise<any[]> {
  const rows = await rpc<any[]>("account_members", { p_account_id: accountId() });
  return (rows || []).map((r) => mapRow<any>(r));
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const [vouchers, batches, companies, names] = await Promise.all([
    fetchAccountRows("vouchers"),
    fetchAccountRows("batches"),
    fetchAccountRows("voucher_companies"),
    fetchAccountRows("names"),
  ]);

  const active = vouchers.filter((v: any) => v.status !== "cancelled");

  const bucket = (rows: any[]): StatsBucket => ({
    count: rows.length,
    quantity: rows.reduce((sum, v) => sum + (v.quantity || 0), 0),
    value: rows.reduce((sum, v) => sum + Number(v.amount) * (v.quantity || 0), 0),
  });

  const statuses = ["unposted", "posted", "deposited"] as const;
  const byStatus = Object.fromEntries(
    statuses.map((status) => [status, bucket(active.filter((v: any) => v.status === status))])
  ) as DashboardStats["byStatus"];

  const month = new Date().toISOString().slice(0, 7);
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);
    return { month: key, ...bucket(active.filter((v: any) => String(v.date_received).slice(0, 7) === key)) };
  });

  const companyMap = Object.fromEntries(companies.map((c: any) => [c.id, c]));
  const nameMap = Object.fromEntries(names.map((n: any) => [n.id, n]));
  const vouchersByBatch = groupBy(vouchers, "batch_id");

  const recentVouchers = [...active]
    .sort((a: any, b: any) => String(b.date_received).localeCompare(String(a.date_received)))
    .slice(0, 6)
    .map((v: any) => ({
      ...mapRow<Voucher>(v),
      voucherCompany: companyMap[v.voucher_company_id] ? mapRow<VoucherCompany>(companyMap[v.voucher_company_id]) : undefined,
      receivedFrom: v.received_from_id && nameMap[v.received_from_id] ? mapRow<Name>(nameMap[v.received_from_id]) : undefined,
      reference: undefined,
    } as VoucherWithRelations));

  const pendingBatches = batches
    .filter((b: any) => b.status === "pending")
    .map((b: any) => {
      const batchVouchers = vouchersByBatch[b.id] || [];
      const idsInBatch = [...new Set(batchVouchers.map((v: any) => v.voucher_company_id).filter(Boolean))];
      return {
        ...mapRow<Batch>(b),
        voucherCompany: b.voucher_company_id && companyMap[b.voucher_company_id] ? mapRow<VoucherCompany>(companyMap[b.voucher_company_id]) : null,
        recipient: b.recipient_name_id && nameMap[b.recipient_name_id] ? { id: b.recipient_name_id, name: nameMap[b.recipient_name_id].name } as Name : null,
        companyNames: idsInBatch.map((id: string) => companyMap[id]?.name).filter(Boolean),
        vouchers: batchVouchers.map((v: any) => mapRow<Voucher>(v)),
      } as BatchWithRelations;
    });

  return {
    totalUnposted: byStatus.unposted.count,
    totalUnpostedAmount: byStatus.unposted.value.toFixed(2),
    totalPosted: byStatus.posted.count,
    totalPostedAmount: byStatus.posted.value.toFixed(2),
    totalDeposited: byStatus.deposited.count,
    totalDepositedAmount: byStatus.deposited.value.toFixed(2),
    byStatus,
    thisMonth: bucket(active.filter((v: any) => String(v.date_received).slice(0, 7) === month)),
    monthly,
    recentVouchers,
    pendingBatches,
  };
}

async function fetchNextBatchReference(): Promise<{ reference: string }> {
  const rows = await fetchAccountRows("batches", "id, reference");
  const last = Math.max(100, ...rows.map((b: any) => Number(String(b.reference).replace(/\D/g, "")) || 0));
  return { reference: `B-${last + 1}` };
}

async function fetchGroupedVouchers(groupKey: "company" | "recipient", status: string): Promise<any[]> {
  const aid = accountId();
  const [vouchers, batches] = await Promise.all([
    fetchAll(() => {
      let q = supabase.from("vouchers").select("*").eq("account_id", aid).eq("status", status);
      if (status === "unposted") q = q.is("batch_id", null);
      return q.order("id");
    }),
    fetchAccountRows("batches", "id, recipient_name_id"),
  ]);

  if (groupKey === "company") {
    const companyMap = await lookup<VoucherCompany>("voucher_companies");
    const grouped = new Map<string, { company: VoucherCompany; voucherCount: number; totalQuantity: number; totalAmount: number }>();
    for (const v of vouchers) {
      const id = v.voucher_company_id;
      if (!id) continue;
      const bucket = grouped.get(id) || { company: companyMap[id], voucherCount: 0, totalQuantity: 0, totalAmount: 0 };
      bucket.voucherCount += 1;
      bucket.totalQuantity += v.quantity || 0;
      bucket.totalAmount += Number(v.amount) * (v.quantity || 0);
      grouped.set(id, bucket);
    }
    return [...grouped.values()];
  } else {
    const batchMap = Object.fromEntries(batches.map((b: any) => [b.id, b.recipient_name_id]));
    const nameMap = await lookup<Name>("names");
    const grouped = new Map<string, { recipient: Name; voucherCount: number; totalQuantity: number; totalAmount: number }>();
    for (const v of vouchers) {
      const recipientId = batchMap[v.batch_id];
      if (!recipientId) continue;
      const bucket = grouped.get(recipientId) || { recipient: nameMap[recipientId], voucherCount: 0, totalQuantity: 0, totalAmount: 0 };
      bucket.voucherCount += 1;
      bucket.totalQuantity += v.quantity || 0;
      bucket.totalAmount += Number(v.amount) * (v.quantity || 0);
      grouped.set(recipientId, bucket);
    }
    return [...grouped.values()];
  }
}

// ---------------------------------------------------------------------------
// GET dispatcher
// ---------------------------------------------------------------------------

async function handleGet(path: string): Promise<Response> {
  const url = new URL(path, window.location.origin);
  const params = url.searchParams;
  const cleanPath = url.pathname.replace(/\/$/, "") || "/";

  if (cleanPath === "/api/dashboard/stats") return jsonResponse(await fetchDashboardStats());
  if (cleanPath === "/api/settings") return jsonResponse(await fetchSettings());
  if (cleanPath === "/api/batches/next-reference") return jsonResponse(await fetchNextBatchReference());
  if (cleanPath === "/api/vouchers/unposted-by-company") return jsonResponse(await fetchGroupedVouchers("company", "unposted"));
  if (cleanPath === "/api/vouchers/posted-by-company") return jsonResponse(await fetchGroupedVouchers("company", "posted"));
  if (cleanPath === "/api/vouchers/posted-by-recipient") return jsonResponse(await fetchGroupedVouchers("recipient", "posted"));
  if (cleanPath === "/api/vouchers") return jsonResponse(await fetchVouchers(params));
  if (cleanPath === "/api/batches") return jsonResponse(await fetchBatches());
  if (cleanPath === "/api/deposits") return jsonResponse(await fetchDeposits());
  if (cleanPath === "/api/users") return jsonResponse(await fetchUsers());

  const collections: Record<string, () => Promise<any[]>> = {
    "voucher-companies": fetchVoucherCompanies,
    names: fetchNames,
    references: fetchReferences,
    banks: fetchBanks,
  };

  for (const [name, fn] of Object.entries(collections)) {
    if (cleanPath === `/api/${name}`) return jsonResponse(await fn());
    if (cleanPath.startsWith(`/api/${name}/`)) {
      const id = cleanPath.split("/").at(-1);
      const rows = await fn();
      const row = rows.find((r: any) => r.id === id);
      return row ? jsonResponse(row) : notFound();
    }
  }

  return notFound();
}

// ---------------------------------------------------------------------------
// Mutations (POST / PATCH / DELETE)
// ---------------------------------------------------------------------------

function snakeCase(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snake] = v;
  }
  return out;
}

// Batch fields the database accepts; amount_sent and status are set there.
function batchFields(batchData: Record<string, any>): Record<string, any> {
  const { amountSent, status, voucherIds, ...fields } = batchData;
  return snakeCase(fields);
}

async function batchVoucherIds(batchId: string): Promise<string[]> {
  const aid = accountId();
  const rows = await fetchAll(() =>
    supabase.from("vouchers").select("id").eq("account_id", aid).eq("batch_id", batchId).order("id"),
  );
  return rows.map((r: any) => r.id);
}

function saveBatch(batchId: string, batchData: Record<string, any>, voucherIds: string[]) {
  return rpc<string>("save_batch", {
    p_account_id: accountId(),
    p_batch_id: batchId,
    p_batch: batchFields(batchData),
    p_voucher_ids: voucherIds,
  });
}

async function handlePost(path: string, body: any): Promise<Response> {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const aid = accountId();
  const data = typeof body === "object" && body !== null ? body : {};

  // --- Batches ---
  if (cleanPath === "/api/batches") {
    const { voucherIds = [], ...batchData } = data;
    const id = await rpc<string>("save_batch", {
      p_account_id: aid,
      p_batch_id: null,
      p_batch: batchFields(batchData),
      p_voucher_ids: voucherIds,
    });
    return jsonResponse({ id }, 201);
  }

  // --- Deposits ---
  if (cleanPath === "/api/deposits") {
    const { voucherIds = [], ...depositData } = data;
    const id = await rpc<string>("create_deposit", {
      p_account_id: aid,
      p_deposit: snakeCase(depositData),
      p_voucher_ids: voucherIds,
    });
    return jsonResponse({ id }, 201);
  }

  // --- Add vouchers to batch ---
  const batchVouchersMatch = cleanPath.match(/^\/api\/batches\/([^/]+)\/vouchers$/);
  if (batchVouchersMatch) {
    const batchId = batchVouchersMatch[1];
    const current = await batchVoucherIds(batchId);
    await saveBatch(batchId, {}, [...current, ...(data.voucherIds || [])]);
    return jsonResponse({ ok: true });
  }

  // --- Add vouchers to deposit ---
  const depositVouchersMatch = cleanPath.match(/^\/api\/deposits\/([^/]+)\/vouchers$/);
  if (depositVouchersMatch) {
    await rpc("add_deposit_vouchers", { p_deposit_id: depositVouchersMatch[1], p_voucher_ids: data.voucherIds || [] });
    return jsonResponse({ ok: true });
  }

  // --- Generic resource creation ---
  const resource = cleanPath.split("/")[2];
  const tableMap: Record<string, string> = {
    "voucher-companies": "voucher_companies",
    names: "names",
    references: "references",
    banks: "banks",
    vouchers: "vouchers",
  };

  if (cleanPath === "/api/settings") {
    const insert = { ...snakeCase(data), account_id: aid };
    const { data: row, error } = await supabase.from("company_settings").insert(insert).select("*").single();
    if (error) throw new Error(error.message);
    return jsonResponse(mapRow(row), 201);
  }

  const tableName = tableMap[resource];
  if (tableName) {
    const insert: Record<string, any> = { ...snakeCase(data), account_id: aid };
    if (tableName === "vouchers") {
      insert.status = data.status || "unposted";
      insert.date_received = data.dateReceived || new Date().toISOString();
      delete insert.batch_id;
      delete insert.deposit_id;
    }
    if (tableName === "voucher_companies" || tableName === "names" || tableName === "references" || tableName === "banks") {
      insert.is_archived = false;
    }
    const { data: row, error } = await supabase.from(tableName).insert(insert).select("*").single();
    if (error) throw new Error(error.message);
    return jsonResponse(mapRow(row), 201);
  }

  return notFound();
}

async function handlePatch(path: string, body: any): Promise<Response> {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const aid = accountId();
  const data = typeof body === "object" && body !== null ? body : {};

  // --- Bulk edit vouchers ---
  if (cleanPath === "/api/vouchers/bulk") {
    const { ids = [], changes = {} } = data;
    return jsonResponse(
      await rpc("bulk_update_vouchers", { p_account_id: aid, p_ids: ids, p_changes: snakeCase(changes) }),
    );
  }

  // --- User role update ---
  const roleMatch = cleanPath.match(/^\/api\/users\/([^/]+)\/role$/);
  if (roleMatch) {
    await rpc("set_member_role", { p_account_id: aid, p_user_id: roleMatch[1], p_role: data.role });
    return jsonResponse({ ok: true });
  }

  // --- Deposit update (with adjustment fields) ---
  const depositMatch = cleanPath.match(/^\/api\/deposits\/([^/]+)$/);
  if (depositMatch) {
    await rpc("update_deposit", { p_deposit_id: depositMatch[1], p_deposit: snakeCase(data) });
    return jsonResponse({ ok: true });
  }

  // --- Batch update: a status change on its own, or details plus the voucher list ---
  const batchMatch = cleanPath.match(/^\/api\/batches\/([^/]+)$/);
  if (batchMatch) {
    const id = batchMatch[1];
    const { voucherIds, status, ...batchData } = data;
    if (Object.keys(batchData).length > 0 || voucherIds) {
      await saveBatch(id, batchData, voucherIds ?? (await batchVoucherIds(id)));
    }
    if (status) await rpc("set_batch_status", { p_batch_id: id, p_status: status });
    return jsonResponse({ ok: true });
  }

  // --- Settings update ---
  const settingsMatch = cleanPath.match(/^\/api\/settings\/([^/]+)$/);
  if (settingsMatch) {
    const id = settingsMatch[1];
    const update = snakeCase(data);
    const { data: row, error } = await supabase
      .from("company_settings")
      .update(update)
      .eq("id", id)
      .eq("account_id", aid)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return jsonResponse(mapRow(row));
  }

  // --- Generic resource update ---
  const resource = cleanPath.split("/")[2];
  const tableMap: Record<string, string> = {
    "voucher-companies": "voucher_companies",
    names: "names",
    references: "references",
    banks: "banks",
    vouchers: "vouchers",
  };

  const tableName = tableMap[resource];
  if (tableName) {
    const id = cleanPath.split("/").at(-1);
    const update = snakeCase(data);
    const { data: row, error } = await supabase
      .from(tableName)
      .update(update)
      .eq("id", id)
      .eq("account_id", aid)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return jsonResponse(mapRow(row));
  }

  return notFound();
}

async function handleDelete(path: string): Promise<Response> {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const aid = accountId();
  const parts = cleanPath.split("/");

  // --- Remove voucher from batch ---
  if (parts.includes("batches") && parts.includes("vouchers") && parts.length >= 5) {
    const batchId = parts[3];
    const voucherId = parts.at(-1)!;
    const current = await batchVoucherIds(batchId);
    await saveBatch(batchId, {}, current.filter((id) => id !== voucherId));
    return jsonResponse({ ok: true, parentId: batchId });
  }

  // --- Remove voucher from deposit ---
  if (parts.includes("deposits") && parts.includes("vouchers") && parts.length >= 5) {
    await rpc("remove_deposit_voucher", { p_deposit_id: parts[3], p_voucher_id: parts.at(-1)! });
    return jsonResponse({ ok: true, parentId: parts[3] });
  }

  // --- Delete batch (its vouchers go back to unposted) ---
  if (parts[2] === "batches" && parts.length === 4) {
    await rpc("delete_batch", { p_batch_id: parts[3] });
    return jsonResponse({ ok: true });
  }

  // --- Delete deposit (its vouchers go back to posted) ---
  if (parts[2] === "deposits" && parts.length === 4) {
    await rpc("delete_deposit", { p_deposit_id: parts[3] });
    return jsonResponse({ ok: true });
  }

  // --- Generic resource: hard delete for vouchers, soft-delete for others ---
  const resource = parts[2];
  const id = parts[3];
  const softDeleteTables: Record<string, string> = {
    "voucher-companies": "voucher_companies",
    names: "names",
    references: "references",
    banks: "banks",
  };

  if (softDeleteTables[resource]) {
    const { error } = await supabase
      .from(softDeleteTables[resource])
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  }

  if (resource === "vouchers") {
    const { error } = await supabase.from("vouchers").delete().eq("id", id).eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  }

  return notFound();
}

// ---------------------------------------------------------------------------
// Public API: apiRequest + getQueryFn (drop-in replacements for demo-store)
// ---------------------------------------------------------------------------

export async function supabaseApiRequest(method: string, input: string, body?: unknown): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const path = url.pathname;

  try {
    // Keep the query string for reads: filters like ?batchId= live there.
    if (method === "GET") return await handleGet(path + url.search);
    if (method === "POST") return await handlePost(path, body);
    if (method === "PATCH") return await handlePatch(path, body);
    if (method === "DELETE") return await handleDelete(path);
    return notFound();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
}
