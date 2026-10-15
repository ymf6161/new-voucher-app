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
// Queries (GET)
// ---------------------------------------------------------------------------

async function fetchVoucherCompanies(): Promise<VoucherCompany[]> {
  const { data, error } = await supabase
    .from("voucher_companies")
    .select("*")
    .eq("account_id", accountId())
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => mapRow<VoucherCompany>(r));
}

async function fetchNames(): Promise<Name[]> {
  const { data, error } = await supabase
    .from("names")
    .select("*")
    .eq("account_id", accountId())
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => mapRow<Name>(r));
}

async function fetchReferences(): Promise<Reference[]> {
  const { data, error } = await supabase
    .from("references")
    .select("*")
    .eq("account_id", accountId())
    .eq("is_archived", false)
    .order("reference");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => mapRow<Reference>(r));
}

async function fetchBanks(): Promise<Bank[]> {
  const { data, error } = await supabase
    .from("banks")
    .select("*")
    .eq("account_id", accountId())
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => mapRow<Bank>(r));
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
  let q = supabase
    .from("vouchers")
    .select("*")
    .eq("account_id", accountId());

  const status = params.get("status");
  if (status) q = q.eq("status", status);

  const companyIds = (params.get("companyId") || "").split(",").filter(Boolean);
  if (companyIds.length) q = q.in("voucher_company_id", companyIds);

  if (params.has("batchId")) q = q.eq("batch_id", params.get("batchId"));
  if (params.has("depositId")) q = q.eq("deposit_id", params.get("depositId"));

  if (params.has("recipientId")) {
    const { data: batchData } = await supabase
      .from("batches")
      .select("id")
      .eq("account_id", accountId())
      .eq("recipient_name_id", params.get("recipientId"));
    const batchIds = (batchData || []).map((b: any) => b.id);
    if (batchIds.length) q = q.in("batch_id", batchIds);
    else return [];
  }

  if (status === "unposted") q = q.is("batch_id", null);

  q = q.order("date_received", { ascending: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const voucherRows = data || [];
  const relatedCompanyIds = [...new Set(voucherRows.map((row: any) => row.voucher_company_id).filter(Boolean))];
  const receivedFromIds = [...new Set(voucherRows.map((row: any) => row.received_from_id).filter(Boolean))];
  const referenceIds = [...new Set(voucherRows.map((row: any) => row.reference_id).filter(Boolean))];
  const currentAccountId = accountId();

  const [companiesResult, namesResult, referencesResult] = await Promise.all([
    relatedCompanyIds.length
      ? supabase.from("voucher_companies").select("*").eq("account_id", currentAccountId).in("id", relatedCompanyIds)
      : Promise.resolve({ data: [], error: null }),
    receivedFromIds.length
      ? supabase.from("names").select("*").eq("account_id", currentAccountId).in("id", receivedFromIds)
      : Promise.resolve({ data: [], error: null }),
    referenceIds.length
      ? supabase.from("references").select("*").eq("account_id", currentAccountId).in("id", referenceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (companiesResult.error) throw new Error(companiesResult.error.message);
  if (namesResult.error) throw new Error(namesResult.error.message);
  if (referencesResult.error) throw new Error(referencesResult.error.message);

  const companies = Object.fromEntries((companiesResult.data || []).map((row: any) => [row.id, mapRow<VoucherCompany>(row)]));
  const names = Object.fromEntries((namesResult.data || []).map((row: any) => [row.id, mapRow<Name>(row)]));
  const references = Object.fromEntries((referencesResult.data || []).map((row: any) => [row.id, mapRow<Reference>(row)]));

  return voucherRows.map((row: any) => {
    const v = mapRow<Voucher>(row);
    return {
      ...v,
      voucherCompany: companies[row.voucher_company_id],
      receivedFrom: names[row.received_from_id],
      reference: references[row.reference_id],
    } as VoucherWithRelations;
  });
}

async function fetchBatches(): Promise<BatchWithRelations[]> {
  const { data: batches, error } = await supabase
    .from("batches")
    .select("*")
    .eq("account_id", accountId())
    .order("batch_date", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("id, voucher_company_id, quantity, batch_id")
    .eq("account_id", accountId());

  const companyIds = [...new Set((vouchers || []).map((v: any) => v.voucher_company_id).filter(Boolean))];
  let companies: Record<string, string> = {};
  if (companyIds.length) {
    const { data: compData } = await supabase
      .from("voucher_companies")
      .select("id, name")
      .in("id", companyIds);
    companies = Object.fromEntries((compData || []).map((c: any) => [c.id, c.name]));
  }

  const nameIds = [...new Set((batches || []).map((b: any) => b.recipient_name_id).filter(Boolean))];
  let names: Record<string, string> = {};
  if (nameIds.length) {
    const { data: nameData } = await supabase
      .from("names")
      .select("id, name")
      .in("id", nameIds);
    names = Object.fromEntries((nameData || []).map((n: any) => [n.id, n.name]));
  }

  const bankIds = [...new Set((batches || []).map((b: any) => b.bank_id).filter(Boolean))];
  let banks: Record<string, any> = {};
  if (bankIds.length) {
    const { data: bankData } = await supabase
      .from("banks")
      .select("*")
      .in("id", bankIds);
    banks = Object.fromEntries((bankData || []).map((b: any) => [b.id, mapRow<Bank>(b)]));
  }

  const companyIdsInBatches = [...new Set((batches || []).filter((b: any) => b.voucher_company_id).map((b: any) => b.voucher_company_id))];
  let batchCompanies: Record<string, any> = {};
  if (companyIdsInBatches.length) {
    const { data: compData } = await supabase
      .from("voucher_companies")
      .select("*")
      .in("id", companyIdsInBatches);
    batchCompanies = Object.fromEntries((compData || []).map((c: any) => [c.id, mapRow<VoucherCompany>(c)]));
  }

  return (batches || []).map((batch: any) => {
    const b = mapRow<Batch>(batch);
    const batchVouchers = (vouchers || []).filter((v: any) => v.batch_id === batch.id);
    const idsInBatch = [...new Set(batchVouchers.map((v: any) => v.voucher_company_id).filter(Boolean))];
    return {
      ...b,
      voucherCompany: batch.voucher_company_id ? (batchCompanies[batch.voucher_company_id] || null) : null,
      recipient: batch.recipient_name_id ? { id: batch.recipient_name_id, name: names[batch.recipient_name_id] } as Name : null,
      bank: batch.bank_id ? (banks[batch.bank_id] || null) : null,
      companyNames: idsInBatch.map((id: string) => companies[id]).filter(Boolean),
      vouchers: batchVouchers.map(mapRow),
    } as BatchWithRelations;
  });
}

async function fetchDeposits(): Promise<DepositWithRelations[]> {
  const { data: deposits, error } = await supabase
    .from("deposits")
    .select("*")
    .eq("account_id", accountId())
    .order("date_deposited", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("*")
    .eq("account_id", accountId());

  const bankIds = [...new Set((deposits || []).map((d: any) => d.bank_id).filter(Boolean))];
  let banks: Record<string, any> = {};
  if (bankIds.length) {
    const { data: bankData } = await supabase
      .from("banks")
      .select("*")
      .in("id", bankIds);
    banks = Object.fromEntries((bankData || []).map((b: any) => [b.id, mapRow<Bank>(b)]));
  }

  const companyIds = [...new Set((deposits || []).map((d: any) => d.voucher_company_id).filter(Boolean))];
  let companies: Record<string, any> = {};
  if (companyIds.length) {
    const { data: compData } = await supabase
      .from("voucher_companies")
      .select("*")
      .in("id", companyIds);
    companies = Object.fromEntries((compData || []).map((c: any) => [c.id, mapRow<VoucherCompany>(c)]));
  }

  const nameIds = [...new Set((deposits || []).map((d: any) => d.recipient_name_id).filter(Boolean))];
  let names: Record<string, any> = {};
  if (nameIds.length) {
    const { data: nameData } = await supabase
      .from("names")
      .select("id, name")
      .in("id", nameIds);
    names = Object.fromEntries((nameData || []).map((n: any) => [n.id, mapRow<Name>(n)]));
  }

  return (deposits || []).map((deposit: any) => {
    const d = mapRow<Deposit>(deposit);
    return {
      ...d,
      bank: banks[deposit.bank_id],
      voucherCompany: deposit.voucher_company_id ? (companies[deposit.voucher_company_id] || null) : null,
      recipient: deposit.recipient_name_id ? (names[deposit.recipient_name_id] || null) : null,
      vouchers: (vouchers || []).filter((v: any) => v.deposit_id === deposit.id).map(mapRow),
    } as DepositWithRelations;
  });
}

async function fetchUsers(): Promise<any[]> {
  const { data: accountUsers, error } = await supabase
    .from("account_users")
    .select("user_id, role")
    .eq("account_id", accountId());
  if (error) throw new Error(error.message);

  const userIds = (accountUsers || []).map((au: any) => au.user_id);
  if (!userIds.length) return [];

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("*")
    .in("id", userIds.map(String));
  if (usersErr) throw new Error(usersErr.message);

  const roleMap = Object.fromEntries((accountUsers || []).map((au: any) => [String(au.user_id), au.role]));
  return (users || []).map((u: any) => {
    const mapped = mapRow<any>(u);
    mapped.role = roleMap[u.id] || u.role || "user";
    return mapped;
  });
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data: vouchers, error } = await supabase
    .from("vouchers")
    .select("*")
    .eq("account_id", accountId());
  if (error) throw new Error(error.message);

  const { data: batches, error: batchesErr } = await supabase
    .from("batches")
    .select("*")
    .eq("account_id", accountId());
  if (batchesErr) throw new Error(batchesErr.message);

  const { data: companies, error: compErr } = await supabase
    .from("voucher_companies")
    .select("*")
    .eq("account_id", accountId());
  if (compErr) throw new Error(compErr.message);

  const { data: names } = await supabase
    .from("names")
    .select("*")
    .eq("account_id", accountId());

  const active = (vouchers || []).filter((v: any) => v.status !== "cancelled");

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

  const companyMap = Object.fromEntries((companies || []).map((c: any) => [c.id, c]));
  const nameMap = Object.fromEntries((names || []).map((n: any) => [n.id, n]));

  const recentVouchers = [...active]
    .sort((a: any, b: any) => String(b.date_received).localeCompare(String(a.date_received)))
    .slice(0, 6)
    .map((v: any) => ({
      ...mapRow<Voucher>(v),
      voucherCompany: companyMap[v.voucher_company_id] ? mapRow<VoucherCompany>(companyMap[v.voucher_company_id]) : undefined,
      receivedFrom: v.received_from_id && nameMap[v.received_from_id] ? mapRow<Name>(nameMap[v.received_from_id]) : undefined,
      reference: undefined,
    } as VoucherWithRelations));

  const pendingBatches = (batches || [])
    .filter((b: any) => b.status === "pending")
    .map((b: any) => {
      const batchVouchers = (vouchers || []).filter((v: any) => v.batch_id === b.id);
      const idsInBatch = [...new Set(batchVouchers.map((v: any) => v.voucher_company_id).filter(Boolean))];
      return {
        ...mapRow<Batch>(b),
        voucherCompany: b.voucher_company_id && companyMap[b.voucher_company_id] ? mapRow<VoucherCompany>(companyMap[b.voucher_company_id]) : null,
        recipient: b.recipient_name_id && nameMap[b.recipient_name_id] ? { id: b.recipient_name_id, name: nameMap[b.recipient_name_id].name } as Name : null,
        companyNames: idsInBatch.map((id: string) => companyMap[id]?.name).filter(Boolean),
        vouchers: batchVouchers.map(mapRow),
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
  const { data, error } = await supabase
    .from("batches")
    .select("reference")
    .eq("account_id", accountId());
  if (error) throw new Error(error.message);
  const last = Math.max(100, ...(data || []).map((b: any) => Number(b.reference.replace(/\D/g, "")) || 0));
  return { reference: `B-${last + 1}` };
}

async function fetchGroupedVouchers(groupKey: "company" | "recipient", status: string): Promise<any[]> {
  let q = supabase
    .from("vouchers")
    .select("*")
    .eq("account_id", accountId())
    .eq("status", status);

  if (status === "unposted") q = q.is("batch_id", null);

  const { data: vouchers, error } = await q;
  if (error) throw new Error(error.message);

  const { data: batches } = await supabase
    .from("batches")
    .select("id, recipient_name_id")
    .eq("account_id", accountId());

  if (groupKey === "company") {
    const companyIds = [...new Set((vouchers || []).map((v: any) => v.voucher_company_id).filter(Boolean))];
    const { data: companies } = await supabase
      .from("voucher_companies")
      .select("*")
      .in("id", companyIds);
    const companyMap = Object.fromEntries((companies || []).map((c: any) => [c.id, mapRow<VoucherCompany>(c)]));

    const grouped = new Map<string, { company: VoucherCompany; voucherCount: number; totalQuantity: number; totalAmount: number }>();
    for (const v of (vouchers || [])) {
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
    const batchMap = Object.fromEntries((batches || []).map((b: any) => [b.id, b.recipient_name_id]));
    const recipientIds = [...new Set(
      (vouchers || [])
        .map((v: any) => batchMap[v.batch_id])
        .filter(Boolean)
    )];
    const { data: names } = await supabase
      .from("names")
      .select("*")
      .in("id", recipientIds);
    const nameMap = Object.fromEntries((names || []).map((n: any) => [n.id, mapRow<Name>(n)]));

    const grouped = new Map<string, { recipient: Name; voucherCount: number; totalQuantity: number; totalAmount: number }>();
    for (const v of (vouchers || [])) {
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

async function handlePost(path: string, body: any): Promise<Response> {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const aid = accountId();
  const data = typeof body === "object" && body !== null ? body : {};

  if (cleanPath === "/api/vouchers/import") {
    if (!Array.isArray(data.vouchers) || data.vouchers.length === 0) {
      return jsonResponse({ error: "At least one voucher is required." }, 400);
    }
    if (data.vouchers.length > 500) {
      return jsonResponse({ error: "Import is limited to 500 vouchers at a time." }, 400);
    }
    const inserts = data.vouchers.map((voucher: Record<string, any>) => {
      const insert: Record<string, any> = { ...snakeCase(voucher), account_id: aid, status: "unposted" };
      delete insert.batch_id;
      delete insert.deposit_id;
      return insert;
    });
    const { data: inserted, error } = await supabase.from("vouchers").insert(inserts).select("id");
    if (error) throw new Error(error.message);
    return jsonResponse({ imported: inserted?.length || 0 }, 201);
  }

  // --- Batches ---
  if (cleanPath === "/api/batches") {
    const { voucherIds = [], ...batchData } = data;
    const insert: Record<string, any> = {
      ...snakeCase(batchData),
      account_id: aid,
      status: batchData.status || "pending",
      date_sent: batchData.dateSent || new Date().toISOString(),
      reference: batchData.reference || (await fetchNextBatchReference()).reference,
    };
    delete insert.voucher_ids;
    const { data: batch, error } = await supabase.from("batches").insert(insert).select("*").single();
    if (error) throw new Error(error.message);

    if (voucherIds.length) {
      const { error: vErr } = await supabase
        .from("vouchers")
        .update({ batch_id: batch.id, status: "posted" })
        .in("id", voucherIds)
        .eq("account_id", aid);
      if (vErr) throw new Error(vErr.message);
    }

    return jsonResponse(await fetchBatches().then((bs) => bs.find((b) => b.id === batch.id)), 201);
  }

  // --- Deposits ---
  if (cleanPath === "/api/deposits") {
    const { voucherIds = [], ...depositData } = data;
    const insert: Record<string, any> = {
      ...snakeCase(depositData),
      account_id: aid,
      date_deposited: depositData.dateDeposited || new Date().toISOString(),
    };
    delete insert.voucher_ids;
    const { data: deposit, error } = await supabase.from("deposits").insert(insert).select("*").single();
    if (error) throw new Error(error.message);

    if (voucherIds.length) {
      const { error: vErr } = await supabase
        .from("vouchers")
        .update({ deposit_id: deposit.id, status: "deposited" })
        .in("id", voucherIds)
        .eq("account_id", aid);
      if (vErr) throw new Error(vErr.message);
    }

    return jsonResponse(await fetchDeposits().then((ds) => ds.find((d) => d.id === deposit.id)), 201);
  }

  // --- Add vouchers to batch ---
  const batchVouchersMatch = cleanPath.match(/^\/api\/batches\/([^/]+)\/vouchers$/);
  if (batchVouchersMatch) {
    const batchId = batchVouchersMatch[1];
    const { error } = await supabase
      .from("vouchers")
      .update({ batch_id: batchId, status: "posted" })
      .in("id", data.voucherIds || [])
      .eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  }

  // --- Add vouchers to deposit ---
  const depositVouchersMatch = cleanPath.match(/^\/api\/deposits\/([^/]+)\/vouchers$/);
  if (depositVouchersMatch) {
    const depositId = depositVouchersMatch[1];
    const { error } = await supabase
      .from("vouchers")
      .update({ deposit_id: depositId, status: "deposited" })
      .in("id", data.voucherIds || [])
      .eq("account_id", aid);
    if (error) throw new Error(error.message);
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
    const snakeChanges = snakeCase(changes);
    const { data: result, error } = await supabase
      .from("vouchers")
      .update(snakeChanges)
      .in("id", ids)
      .eq("account_id", aid)
      .neq("status", "deposited");
    if (error) throw new Error(error.message);
    return jsonResponse({ updated: ids.length });
  }

  // --- User role update ---
  const roleMatch = cleanPath.match(/^\/api\/users\/([^/]+)\/role$/);
  if (roleMatch) {
    const userId = roleMatch[1];
    const { data: accountUser, error: findErr } = await supabase
      .from("account_users")
      .select("id")
      .eq("account_id", aid)
      .eq("user_id", userId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!accountUser) return notFound();
    const { error } = await supabase
      .from("account_users")
      .update({ role: data.role })
      .eq("id", accountUser.id);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  }

  // --- Deposit update (with adjustment fields) ---
  const depositMatch = cleanPath.match(/^\/api\/deposits\/([^/]+)$/);
  if (depositMatch) {
    const id = depositMatch[1];
    const update = snakeCase(data);
    const { data: row, error } = await supabase
      .from("deposits")
      .update(update)
      .eq("id", id)
      .eq("account_id", aid)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return jsonResponse(mapRow(row));
  }

  // --- Batch update (status change updates member vouchers) ---
  const batchMatch = cleanPath.match(/^\/api\/batches\/([^/]+)$/);
  if (batchMatch) {
    const id = batchMatch[1];
    const update = snakeCase(data);
    const { data: row, error } = await supabase
      .from("batches")
      .update(update)
      .eq("id", id)
      .eq("account_id", aid)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.status) {
      const newVoucherStatus = data.status === "cancelled" ? "unposted" : "posted";
      await supabase
        .from("vouchers")
        .update({ status: newVoucherStatus })
        .eq("batch_id", id)
        .eq("account_id", aid);
    }

    return jsonResponse(mapRow(row));
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
    const voucherId = parts.at(-1)!;
    const { error } = await supabase
      .from("vouchers")
      .update({ batch_id: null, status: "unposted" })
      .eq("id", voucherId)
      .eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, parentId: parts[3] });
  }

  // --- Remove voucher from deposit ---
  if (parts.includes("deposits") && parts.includes("vouchers") && parts.length >= 5) {
    const voucherId = parts.at(-1)!;
    const { error } = await supabase
      .from("vouchers")
      .update({ deposit_id: null, status: "posted" })
      .eq("id", voucherId)
      .eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true, parentId: parts[3] });
  }

  // --- Delete batch (unlink vouchers) ---
  if (parts[2] === "batches" && parts.length === 4) {
    const id = parts[3];
    await supabase
      .from("vouchers")
      .update({ batch_id: null, status: "unposted" })
      .eq("batch_id", id)
      .eq("account_id", aid);
    const { error } = await supabase.from("batches").delete().eq("id", id).eq("account_id", aid);
    if (error) throw new Error(error.message);
    return jsonResponse({ ok: true });
  }

  // --- Delete deposit (unlink vouchers) ---
  if (parts[2] === "deposits" && parts.length === 4) {
    const id = parts[3];
    await supabase
      .from("vouchers")
      .update({ deposit_id: null, status: "posted" })
      .eq("deposit_id", id)
      .eq("account_id", aid);
    const { error } = await supabase.from("deposits").delete().eq("id", id).eq("account_id", aid);
    if (error) throw new Error(error.message);
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
    if (method === "GET") return await handleGet(`${path}${url.search}`);
    if (method === "POST") return await handlePost(path, body);
    if (method === "PATCH") return await handlePatch(path, body);
    if (method === "DELETE") return await handleDelete(path);
    return notFound();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
}
