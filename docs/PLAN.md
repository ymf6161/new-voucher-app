# Deposit Tracker: cleanup and UX plan

Status: draft for owner approval. Sources: owner interview (2026-10-13), `/health` run (composite 2.5/10), code read of the screens named below.

## Product in one line

One operator records vouchers as they arrive (keyboard-first), posts them in batches to voucher companies (or hands a mix to someone for cash), banks the money, and needs reports that answer any question about that pipeline.

Flow: **Receive → Post (batch) → Deposit (bank)**. Voucher statuses: `unposted → posted → deposited` (plus `cancelled`, `completed`).

## Already done (commit 4975f36)

- Removed 8 one-off DB scripts, `client/src/lib/api.ts` (628 dead lines), `auth-utils.ts`, 22 unused UI components.
- Removed 45 unused npm packages (passport, express-session, drizzle, pg, recharts, framer-motion, ...).
- Merged six overlapping deployment docs into `README.md`. Stopped tracking test images in `uploads/`.
- Verified: type check unchanged (30 pre-existing errors), client build and Netlify function bundle succeed, knip reports zero unused files or deps.

## P0: Security (do first, ~small)

1. **Rotate the Supabase service-role key.** It was committed in `ENV_SETUP.txt` / `BOLT_DEPLOYMENT_SOLUTION.md` and pasted into Bolt/Replit. The repo is private, but the key bypasses all database security. Rotate in Supabase → Settings → API, update Netlify env, redeploy. (Owner action; deleting the files does not remove it from git history.)
2. **Scope every by-id API query to the current account.** 20 handlers in `server/routes.ts` (e.g. `PATCH /api/vouchers/:id`, line ~1247) look up rows by `id` only, using the service-role client. Add `.eq('account_id', accountId)` to each; return 404 otherwise.

## P1: Owner-requested changes

### 1. Received vouchers table: sort, filter, search
Today: search only looks at voucher # and notes (`vouchers.tsx:372`); only Date and Amount sort; no filters.
Plan:
- Search across all visible text: received from, reference, company, type, voucher #, notes, amount.
- Every column sortable (sort on the displayed value, so related names sort correctly).
- Filter bar: status (multi), company (multi), type, received from, reference, date range, amount range. Show active filters as removable chips; "Clear all".
- Footer totals for the filtered rows (count, quantity, value).
- Keep filters in the URL so a filtered view can be bookmarked and survives refresh.
- Build once in `components/data-table.tsx` so Batches and Deposits get the same table.

### 2. Bulk edit unposted vouchers
Today: only single edit and bulk delete.
Plan: select rows → "Edit selected" → set any of date received, received from, reference, company, type, notes, status (unposted/cancelled/completed). Only unposted vouchers are editable; posted/deposited rows in the selection are listed and skipped. One server endpoint (`PATCH /api/vouchers/bulk`) so it is all-or-nothing.

### 3. Single voucher entry: find and fix the errors
Owner reports errors on this screen but isn't sure what. Known from the type checker: the inline "create new company / name / reference" path builds fake records missing fields (`voucher-form.tsx:157,177,197`) and the notes box wires a textarea into an input-only focus helper (`:701`). Plan: run `/qa-only` against the live app to reproduce, fix, then keep keyboard flow intact (Enter/Tab advances, nothing needs a mouse).

### 4. Post vouchers: aggregate properly
Today: inside a company, vouchers are grouped by **amount only** (`batches.tsx` ~line 803), and every label counts database rows ("3 vouchers") instead of quantity. The company picker also shows row counts (`server/routes.ts` `/unposted-by-company`).
Plan:
- Replace row counts with **quantity and value** everywhere on this screen.
- Group rows by **company → type → amount → reference → received from**; each group line shows qty and total and selects as one unit, expandable to individual vouchers.
- Allow choosing which of those keys to group by (default: all).

### 5. Post several companies together to one recipient
Today: a batch belongs to exactly one voucher company (schema `batches.voucher_company_id`), and so does a deposit.
Decided (D1): the recipient is picked from the existing **Names** list, with the same type-to-add shortcut used on voucher entry when the person isn't there yet. A batch gets a **recipient** (a voucher company *or* a Name) and may contain vouchers from several companies. Remittance PDF lists vouchers grouped by company with subtotals. Deposits follow the same rule. Needs a migration and changes to batch/deposit create, edit, PDF and reports.

### 6. Reports: slice and dice, export
Today: three fixed tabs (submitters, companies, status), date presets only, CSV only.
Plan: one **report builder** plus saved standard reports.
- Builder: pick rows (group by any of: company, type, received from, reference, status, batch, deposit, bank, day/week/month/quarter/year), optional column pivot, measures (count, quantity, value, average), filters (same as the vouchers table), custom date range on received/posted/deposited date.
- Every report exports to **PDF** (with business header/logo, filters printed at the top, totals row), **CSV**, and **Excel**.
- **Running balance ledger** (owner request): pick a date range, see every movement in date order with an opening balance, money-in, money-out and running balance columns, and a closing balance. Confirmed (D4): *in* = vouchers received (value), *out* = vouchers posted in a batch, so the balance is the value of vouchers on hand; a second column pair tracks posted → deposited so "posted but not yet banked" also has a running balance. Filterable by company and recipient, exportable like every other report.
- Standard reports (all 8 confirmed by owner, D2):
  1. Vouchers received by period (daily/weekly/monthly totals)
  2. Received by submitter (who brought what, by company)
  3. Outstanding unposted vouchers (aged: 0-7, 8-30, 31-60, 60+ days)
  4. Posted but not banked (batches sent, money not yet received)
  5. Batch register (every batch with reference, recipient, qty, value, status)
  6. Deposit register / bank reconciliation (deposits vs the batches/vouchers they cover, differences flagged)
  7. Company statement (all activity for one voucher company over a period)
  8. Voucher audit trail (one voucher: received → posted → deposited, with dates)

### 7. PDF generation
Owner believes it works. Plan: regression-check the remittance PDF after the multi-company change (#5), and reuse its layout for report PDFs (#6).

### 8. Deposit (banking) screen
Not yet used by the owner, so no changes are planned now. After #5 lands, run `/qa-only` on it with real data and come back with findings.

## P2: Code health

- Fix the 30 type errors (9 disappear by setting `"target": "ES2020"` in `tsconfig.json`; the rest are the quick-add issues in #3 and `use-auth.ts` using `createdAt` vs `created_at`).
- Split `server/routes.ts` (1,924 lines) by resource; dedupe the copy-pasted `unposted-by-company` / `posted-by-company` handlers.
- Split `batches.tsx` (1,124 lines) and `batch-voucher-entry.tsx` (988 lines) into smaller components.
- Code-split the 1.3 MB client bundle (lazy-load pages and jsPDF).
- Add a test runner (Vitest) with tests for the money paths: totals, grouping, status transitions.
- Duplicate migration `20260304120000_add_archived_flags.sql` / `20260304234627_add_archived_flags.sql`: harmless (`IF NOT EXISTS`). Leave as is since both may already be recorded as applied.

## Decisions

- **D1 (decided):** multi-company recipient comes from the Names list (add inline if missing).
- **D2 (decided):** keep all 8 standard reports, plus the running balance ledger.
- **D3 (provided):** live app is hosted on Hostinger; owner supplied a test login out of band. `/qa-only` is blocked until the host is allowed in the cloud environment's network settings.
- **D4 (decided):** running balance ledger: in = vouchers received, out = vouchers posted.

## Suggested order

P0 → #1 table → #4 aggregation → #2 bulk edit → #3 voucher-form fixes → #5 multi-company (migration) → #6 reports → #7 PDF check → P2.
Each step: `/plan-eng-review` on the slice, build, `/qa` on the live preview, `/review`, `/ship`.
