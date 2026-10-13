import type {
  Bank,
  Batch,
  BatchWithRelations,
  CompanySettings,
  DashboardStats,
  Deposit,
  DepositWithRelations,
  Name,
  Reference,
  User,
  Voucher,
  VoucherCompany,
  VoucherWithRelations,
} from "@shared/schema";

const DATA_KEY = "deposit-tracker-demo-data";
const SESSION_KEY = "deposit-tracker-demo-session";

type DemoState = {
  voucherCompanies: VoucherCompany[];
  names: Name[];
  references: Reference[];
  banks: Bank[];
  vouchers: Voucher[];
  batches: Batch[];
  deposits: Deposit[];
  settings: CompanySettings[];
  users: User[];
};

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

function createDemoState(): DemoState {
  const voucherCompanies: VoucherCompany[] = [
    { id: "company-north", name: "Northside Community Centre", address: "18 Market Street", city: "Manchester", postcode: "M1 2AB", phone: "0161 555 0101", email: "office@northside.example" },
    { id: "company-harbour", name: "Harbour Support Trust", address: "4 Dock Road", city: "Salford", postcode: "M5 3CD", phone: "0161 555 0102", email: "hello@harbour.example" },
    { id: "company-greenfield", name: "Greenfield Relief Fund", address: "72 Chapel Lane", city: "Manchester", postcode: "M14 6EF", phone: "0161 555 0103", email: "team@greenfield.example" },
  ];
  const names: Name[] = [
    { id: "name-amina", name: "Amina Yusuf", address: null, phone: null, email: null },
    { id: "name-daniel", name: "Daniel Brooks", address: null, phone: null, email: null },
    { id: "name-priya", name: "Priya Shah", address: null, phone: null, email: null },
  ];
  const references: Reference[] = [
    { id: "ref-family", reference: "Family support", notes: null, contact: null },
    { id: "ref-winter", reference: "Winter essentials", notes: null, contact: null },
    { id: "ref-emergency", reference: "Emergency assistance", notes: null, contact: null },
  ];
  const banks: Bank[] = [
    { id: "bank-community", name: "Community Bank", accountNumber: "•••• 4821", sortCode: "20-11-30", isArchived: false, archivedAt: null },
    { id: "bank-savings", name: "Reserve Account", accountNumber: "•••• 9074", sortCode: "20-11-30", isArchived: false, archivedAt: null },
  ];
  const vouchers: Voucher[] = [
    { id: "voucher-1", dateReceived: daysAgo(1) as unknown as Date, receivedFromId: "name-amina", referenceId: "ref-family", voucherCompanyId: "company-north", type: "PPV", accountNumber: null, voucherNumber: "NF-1048", amount: "25.00", quantity: 2, notes: null, status: "unposted", batchId: null, depositId: null },
    { id: "voucher-2", dateReceived: daysAgo(2) as unknown as Date, receivedFromId: "name-daniel", referenceId: "ref-emergency", voucherCompanyId: "company-harbour", type: "ACC", accountNumber: null, voucherNumber: "HS-2081", amount: "40.00", quantity: 1, notes: null, status: "unposted", batchId: null, depositId: null },
    { id: "voucher-3", dateReceived: daysAgo(3) as unknown as Date, receivedFromId: "name-priya", referenceId: "ref-winter", voucherCompanyId: "company-greenfield", type: "PPV", accountNumber: null, voucherNumber: "GR-3310", amount: "15.00", quantity: 3, notes: null, status: "unposted", batchId: null, depositId: null },
    { id: "voucher-4", dateReceived: daysAgo(6) as unknown as Date, receivedFromId: "name-amina", referenceId: "ref-family", voucherCompanyId: "company-north", type: "ACC", accountNumber: null, voucherNumber: "NF-1042", amount: "30.00", quantity: 1, notes: null, status: "posted", batchId: "batch-1", depositId: null },
    { id: "voucher-5", dateReceived: daysAgo(8) as unknown as Date, receivedFromId: "name-daniel", referenceId: "ref-emergency", voucherCompanyId: "company-harbour", type: "PPV", accountNumber: null, voucherNumber: "HS-2075", amount: "20.00", quantity: 2, notes: null, status: "posted", batchId: "batch-1", depositId: null },
    { id: "voucher-6", dateReceived: daysAgo(12) as unknown as Date, receivedFromId: "name-priya", referenceId: "ref-winter", voucherCompanyId: "company-greenfield", type: "ACC", accountNumber: null, voucherNumber: "GR-3298", amount: "50.00", quantity: 1, notes: null, status: "deposited", batchId: "batch-2", depositId: "deposit-1" },
    { id: "voucher-7", dateReceived: daysAgo(16) as unknown as Date, receivedFromId: "name-amina", referenceId: "ref-family", voucherCompanyId: "company-north", type: "PPV", accountNumber: null, voucherNumber: "NF-1034", amount: "10.00", quantity: 4, notes: null, status: "deposited", batchId: "batch-2", depositId: "deposit-1" },
    { id: "voucher-8", dateReceived: daysAgo(24) as unknown as Date, receivedFromId: "name-daniel", referenceId: "ref-emergency", voucherCompanyId: "company-harbour", type: "PPV", accountNumber: null, voucherNumber: "HS-2050", amount: "35.00", quantity: 1, notes: null, status: "posted", batchId: "batch-1", depositId: null },
  ];
  const batches: Batch[] = [
    { id: "batch-1", dateSent: daysAgo(4) as unknown as Date, batchDate: daysAgo(4) as unknown as Date, reference: "B-104", voucherCompanyId: null, recipientNameId: "name-daniel", amountSent: "90.00", status: "sent", notes: "Monthly support", bankId: "bank-community" },
    { id: "batch-2", dateSent: daysAgo(11) as unknown as Date, batchDate: daysAgo(11) as unknown as Date, reference: "B-103", voucherCompanyId: "company-greenfield", recipientNameId: null, amountSent: "90.00", status: "sent", notes: null, bankId: "bank-community" },
    { id: "batch-3", dateSent: daysAgo(1) as unknown as Date, batchDate: daysAgo(1) as unknown as Date, reference: "B-105", voucherCompanyId: "company-north", recipientNameId: null, amountSent: "0.00", status: "pending", notes: "Ready to send", bankId: "bank-savings" },
  ];
  const deposits: Deposit[] = [
    { id: "deposit-1", dateDeposited: daysAgo(7) as unknown as Date, bankId: "bank-community", voucherCompanyId: "company-greenfield", recipientNameId: null, amountBanked: "90.00", reference: "DEP-240", notes: null },
  ];
  const settings: CompanySettings[] = [
    { id: "settings-1", businessName: "VoucherFlow Community Fund", address: "10 Central Square", city: "Manchester", postcode: "M1 1AA", phone: "0161 555 0000", email: "hello@voucherflow.example", logoUrl: null, charityNumber: "1234567" },
  ];
  const users: User[] = [
    { id: "demo-user", email: "demo@example.org", firstName: "Alex", lastName: "Morgan", role: "admin", created_at: daysAgo(100) },
    { id: "demo-user-2", email: "team@example.org", firstName: "Sam", lastName: "Taylor", role: "user", created_at: daysAgo(42) },
  ];
  return { voucherCompanies, names, references, banks, vouchers, batches, deposits, settings, users };
}

function readState(): DemoState {
  try {
    const saved = localStorage.getItem(DATA_KEY);
    if (saved) return { ...createDemoState(), ...JSON.parse(saved) };
  } catch {
    localStorage.removeItem(DATA_KEY);
  }
  return createDemoState();
}

function writeState(state: DemoState) {
  localStorage.setItem(DATA_KEY, JSON.stringify(state));
}

export function hasDemoSession() {
  return localStorage.getItem(SESSION_KEY) === "active";
}

export function setDemoSession(active: boolean) {
  if (active) localStorage.setItem(SESSION_KEY, "active");
  else localStorage.removeItem(SESSION_KEY);
}

export function getDemoUser(): User {
  return { id: "demo-user", email: "demo@example.org", firstName: "Alex", lastName: "Morgan", role: "admin", created_at: daysAgo(100) };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function addRelations(state: DemoState, voucher: Voucher): VoucherWithRelations {
  return {
    ...voucher,
    voucherCompany: state.voucherCompanies.find((company) => company.id === voucher.voucherCompanyId)!,
    receivedFrom: state.names.find((name) => name.id === voucher.receivedFromId) || undefined,
    reference: state.references.find((reference) => reference.id === voucher.referenceId) || undefined,
  };
}

function addBatchRelations(state: DemoState, batch: Batch): BatchWithRelations {
  const batchVouchers = state.vouchers.filter((voucher) => voucher.batchId === batch.id);
  const companyIds = [...new Set(batchVouchers.map((voucher) => voucher.voucherCompanyId))];
  return {
    ...batch,
    voucherCompany: state.voucherCompanies.find((company) => company.id === batch.voucherCompanyId) || null,
    recipient: state.names.find((name) => name.id === batch.recipientNameId) || null,
    bank: state.banks.find((bank) => bank.id === batch.bankId) || null,
    companyNames: companyIds.map((id) => state.voucherCompanies.find((company) => company.id === id)?.name || "").filter(Boolean),
    vouchers: batchVouchers,
  };
}

function addDepositRelations(state: DemoState, deposit: Deposit): DepositWithRelations {
  return {
    ...deposit,
    bank: state.banks.find((bank) => bank.id === deposit.bankId)!,
    voucherCompany: state.voucherCompanies.find((company) => company.id === deposit.voucherCompanyId) || null,
    recipient: state.names.find((name) => name.id === deposit.recipientNameId) || null,
    vouchers: state.vouchers.filter((voucher) => voucher.depositId === deposit.id),
  };
}

function groupVouchers(state: DemoState, vouchers: Voucher[], groupKey: "company" | "recipient") {
  const grouped = new Map<string, { entity: VoucherCompany | Name | undefined; voucherCount: number; totalQuantity: number; totalAmount: number }>();
  for (const voucher of vouchers) {
    const groupId = groupKey === "company"
      ? voucher.voucherCompanyId
      : state.batches.find((batch) => batch.id === voucher.batchId)?.recipientNameId || "";
    if (!groupId) continue;
    const entity = groupKey === "company"
      ? state.voucherCompanies.find((company) => company.id === groupId)
      : state.names.find((name) => name.id === groupId);
    const bucket = grouped.get(groupId) || { entity, voucherCount: 0, totalQuantity: 0, totalAmount: 0 };
    bucket.voucherCount += 1;
    bucket.totalQuantity += voucher.quantity;
    bucket.totalAmount += Number(voucher.amount) * voucher.quantity;
    grouped.set(groupId, bucket);
  }
  return [...grouped.values()].filter((item) => item.entity).map(({ entity, ...totals }) => ({ [groupKey]: entity, ...totals }));
}

function dashboardStats(state: DemoState): DashboardStats {
  const bucket = (rows: Voucher[]) => ({
    count: rows.length,
    quantity: rows.reduce((sum, voucher) => sum + voucher.quantity, 0),
    value: rows.reduce((sum, voucher) => sum + Number(voucher.amount) * voucher.quantity, 0),
  });
  const active = state.vouchers.filter((voucher) => voucher.status !== "cancelled");
  const statuses = ["unposted", "posted", "deposited"] as const;
  const byStatus = Object.fromEntries(statuses.map((status) => [status, bucket(active.filter((voucher) => voucher.status === status))])) as DashboardStats["byStatus"];
  const month = new Date().toISOString().slice(0, 7);
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = date.toISOString().slice(0, 7);
    return { month: key, ...bucket(active.filter((voucher) => String(voucher.dateReceived).slice(0, 7) === key)) };
  });
  const unposted = byStatus.unposted;
  const posted = byStatus.posted;
  const deposited = byStatus.deposited;
  return {
    totalUnposted: unposted.count,
    totalUnpostedAmount: unposted.value.toFixed(2),
    totalPosted: posted.count,
    totalPostedAmount: posted.value.toFixed(2),
    totalDeposited: deposited.count,
    totalDepositedAmount: deposited.value.toFixed(2),
    byStatus,
    thisMonth: bucket(active.filter((voucher) => String(voucher.dateReceived).slice(0, 7) === month)),
    monthly,
    recentVouchers: [...state.vouchers].sort((a, b) => String(b.dateReceived).localeCompare(String(a.dateReceived))).slice(0, 6).map((voucher) => addRelations(state, voucher)),
    pendingBatches: state.batches.filter((batch) => batch.status === "pending").map((batch) => addBatchRelations(state, batch)),
  };
}

function nextReference(state: DemoState) {
  const last = Math.max(100, ...state.batches.map((batch) => Number(batch.reference.replace(/\D/g, "")) || 0));
  return `B-${last + 1}`;
}

export async function demoApiRequest(method: string, input: string, body?: unknown): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const params = url.searchParams;
  const state = readState();
  const data = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const id = path.split("/").at(-1) || "";
  const collections: Record<string, keyof DemoState> = {
    "voucher-companies": "voucherCompanies", names: "names", references: "references", banks: "banks",
    vouchers: "vouchers", batches: "batches", deposits: "deposits", settings: "settings", users: "users",
  };

  if (method === "GET") {
    if (path === "/api/health") return jsonResponse({ ok: true, mode: "frontend-demo" });
    if (path === "/api/dashboard/stats") return jsonResponse(dashboardStats(state));
    if (path === "/api/settings") return jsonResponse(state.settings[0] || null);
    if (path === "/api/batches/next-reference") return jsonResponse({ reference: nextReference(state) });
    if (path === "/api/vouchers/unposted-by-company") {
      return jsonResponse(groupVouchers(state, state.vouchers.filter((voucher) => voucher.status === "unposted" && !voucher.batchId), "company").map((row: any) => ({ ...row, company: row.company })));
    }
    if (path === "/api/vouchers/posted-by-company") return jsonResponse(groupVouchers(state, state.vouchers.filter((voucher) => voucher.status === "posted"), "company"));
    if (path === "/api/vouchers/posted-by-recipient") return jsonResponse(groupVouchers(state, state.vouchers.filter((voucher) => voucher.status === "posted"), "recipient"));
    if (path === "/api/vouchers") {
      let rows = [...state.vouchers];
      const status = params.get("status");
      const companyIds = (params.get("companyId") || "").split(",").filter(Boolean);
      if (status) rows = rows.filter((voucher) => voucher.status === status);
      if (companyIds.length) rows = rows.filter((voucher) => companyIds.includes(voucher.voucherCompanyId));
      if (params.has("batchId")) rows = rows.filter((voucher) => voucher.batchId === params.get("batchId"));
      if (params.has("depositId")) rows = rows.filter((voucher) => voucher.depositId === params.get("depositId"));
      if (params.has("recipientId")) {
        const batchIds = state.batches.filter((batch) => batch.recipientNameId === params.get("recipientId")).map((batch) => batch.id);
        rows = rows.filter((voucher) => batchIds.includes(voucher.batchId || ""));
      }
      if (status === "unposted") rows = rows.filter((voucher) => !voucher.batchId);
      return jsonResponse(rows.sort((a, b) => String(b.dateReceived).localeCompare(String(a.dateReceived))).map((voucher) => addRelations(state, voucher)));
    }
    if (path === "/api/batches") return jsonResponse([...state.batches].sort((a, b) => String(b.dateSent).localeCompare(String(a.dateSent))).map((batch) => addBatchRelations(state, batch)));
    if (path === "/api/deposits") return jsonResponse([...state.deposits].sort((a, b) => String(b.dateDeposited).localeCompare(String(a.dateDeposited))).map((deposit) => addDepositRelations(state, deposit)));
    if (path === "/api/users") return jsonResponse(state.users);

    const collectionEntry = Object.entries(collections).find(([name]) => path === `/api/${name}` || path.startsWith(`/api/${name}/`));
    if (collectionEntry) {
      const [name, stateKey] = collectionEntry;
      const rows = state[stateKey] as Array<Record<string, any>>;
      if (path === `/api/${name}`) return jsonResponse(rows.filter((row) => !row.isArchived));
      const row = rows.find((item) => item.id === id);
      return row ? jsonResponse(row) : jsonResponse({ error: "Not found" }, 404);
    }
    return jsonResponse({ error: "Not found" }, 404);
  }

  if (method === "POST") {
    if (path === "/api/batches") {
      const batchId = crypto.randomUUID();
      const batch: Batch = {
        ...data,
        id: batchId,
        dateSent: data.dateSent || new Date().toISOString(),
        batchDate: data.batchDate || new Date().toISOString(),
        reference: data.reference || nextReference(state),
        voucherCompanyId: data.voucherCompanyId || null,
        recipientNameId: data.recipientNameId || null,
        amountSent: String(data.amountSent || "0.00"),
        status: data.status || "pending",
        notes: data.notes || null,
        bankId: data.bankId || null,
      };
      state.batches.unshift(batch);
      for (const voucherId of data.voucherIds || []) {
        const voucher = state.vouchers.find((item) => item.id === voucherId);
        if (voucher) Object.assign(voucher, { batchId, status: "posted" });
      }
      writeState(state);
      return jsonResponse(addBatchRelations(state, batch), 201);
    }
    if (path === "/api/deposits") {
      const depositId = crypto.randomUUID();
      const deposit: Deposit = {
        ...data,
        id: depositId,
        dateDeposited: data.dateDeposited || new Date().toISOString(),
        bankId: data.bankId,
        voucherCompanyId: data.voucherCompanyId || null,
        recipientNameId: data.recipientNameId || null,
        amountBanked: String(data.amountBanked || "0.00"),
        reference: data.reference || null,
        notes: data.notes || null,
      };
      state.deposits.unshift(deposit);
      for (const voucherId of data.voucherIds || []) {
        const voucher = state.vouchers.find((item) => item.id === voucherId);
        if (voucher) Object.assign(voucher, { depositId, status: "deposited" });
      }
      writeState(state);
      return jsonResponse(addDepositRelations(state, deposit), 201);
    }
    if (path.endsWith("/vouchers") && path.startsWith("/api/batches/")) {
      const batch = state.batches.find((item) => item.id === path.split("/")[3]);
      for (const voucherId of data.voucherIds || []) {
        const voucher = state.vouchers.find((item) => item.id === voucherId);
        if (voucher && batch) Object.assign(voucher, { batchId: batch.id, status: "posted" });
      }
      writeState(state);
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/vouchers") && path.startsWith("/api/deposits/")) {
      const depositId = path.split("/")[3];
      for (const voucherId of data.voucherIds || []) {
        const voucher = state.vouchers.find((item) => item.id === voucherId);
        if (voucher) Object.assign(voucher, { depositId, status: "deposited" });
      }
      writeState(state);
      return jsonResponse({ ok: true });
    }
    const resource = path.split("/")[2];
    const stateKey = collections[resource];
    if (!stateKey) return jsonResponse({ error: "Not found" }, 404);
    const rows = state[stateKey] as Array<Record<string, any>>;
    const created = { ...data, id: crypto.randomUUID() };
    if (resource === "vouchers") Object.assign(created, { dateReceived: data.dateReceived || new Date().toISOString(), status: data.status || "unposted", batchId: null, depositId: null });
    if (resource === "batches") Object.assign(created, { dateSent: new Date().toISOString(), batchDate: data.batchDate || new Date().toISOString(), reference: data.reference || nextReference(state), status: data.status || "pending" });
    if (resource === "deposits") Object.assign(created, { dateDeposited: new Date().toISOString() });
    rows.unshift(created);
    writeState(state);
    return jsonResponse(created, 201);
  }

  if (method === "PATCH") {
    if (path === "/api/vouchers/bulk") {
      for (const voucher of state.vouchers) if ((data.ids || []).includes(voucher.id)) Object.assign(voucher, data.changes || {});
      writeState(state);
      return jsonResponse({ updated: (data.ids || []).length });
    }
    const resource = path.split("/")[2];
    const stateKey = collections[resource];
    if (!stateKey) return jsonResponse({ error: "Not found" }, 404);
    const rows = state[stateKey] as Array<Record<string, any>>;
    const rowId = resource === "users" && path.endsWith("/role") ? path.split("/").at(-2) : id;
    const row = rows.find((item) => item.id === rowId);
    if (!row) return jsonResponse({ error: "Not found" }, 404);
    Object.assign(row, data);
    if (resource === "batches" && data.status) {
      for (const voucher of state.vouchers) if (voucher.batchId === id) voucher.status = data.status === "cancelled" ? "unposted" : "posted";
    }
    writeState(state);
    return jsonResponse(row);
  }

  if (method === "DELETE") {
    const parts = path.split("/");
    if (parts.includes("vouchers") && parts.length >= 5) {
      const voucherId = parts.at(-1);
      const parentId = parts[3];
      const voucher = state.vouchers.find((item) => item.id === voucherId);
      if (voucher) {
        if (path.startsWith("/api/batches/")) Object.assign(voucher, { batchId: null, status: "unposted" });
        if (path.startsWith("/api/deposits/")) Object.assign(voucher, { depositId: null, status: "posted" });
      }
      writeState(state);
      return jsonResponse({ ok: true, parentId });
    }
    const resource = parts[2];
    const stateKey = collections[resource];
    if (!stateKey) return jsonResponse({ error: "Not found" }, 404);
    const rows = state[stateKey] as Array<Record<string, any>>;
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) return jsonResponse({ error: "Not found" }, 404);
    rows.splice(index, 1);
    if (resource === "batches") for (const voucher of state.vouchers) if (voucher.batchId === id) Object.assign(voucher, { batchId: null, status: "unposted" });
    if (resource === "deposits") for (const voucher of state.vouchers) if (voucher.depositId === id) Object.assign(voucher, { depositId: null, status: "posted" });
    writeState(state);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export function resetDemoData() {
  localStorage.removeItem(DATA_KEY);
}