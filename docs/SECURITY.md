# Security

VoucherFlow has no server of its own. The browser talks to Supabase with the
public anon key and the signed-in user's token, so **the database is the only
place rules can be enforced**. Anything checked only in the React code can be
skipped by calling the Supabase API directly.

## What the database enforces

| Rule | Where |
| --- | --- |
| A user only reaches rows of accounts they belong to | RLS, `20261013130000_harden_tenant_isolation.sql` |
| Signed-out visitors can read nothing | same |
| Rows can't point at another account's company, name, reference, bank, batch or deposit | `vf_check_links` trigger |
| Rows can't be moved to another account | `vf_check_links` trigger |
| Posted or banked vouchers can't be edited or deleted; vouchers can't be posted or banked by a direct write | `vf_guard_voucher_writes` trigger |
| Batches and deposits change only through functions that run as one transaction and re-check status rules | `save_batch`, `set_batch_status`, `delete_batch`, `create_deposit`, `update_deposit`, `add_deposit_vouchers`, `remove_deposit_voucher`, `delete_deposit` |
| A batch's total is worked out from its vouchers | `save_batch` |
| Bulk edit only touches unposted/cancelled/completed vouchers outside any batch or deposit, and only safe fields | `bulk_update_vouchers` |
| Bank details and business settings (printed on remittances) can be changed by owners and admins only | RLS on `banks`, `company_settings` |
| Only owners change roles; an account always keeps an owner | `set_member_role`, `vf_keep_an_owner` trigger |

The functions and triggers are in
`supabase/migrations/20261014120000_enforce_voucher_rules.sql`. The app calls
them from `client/src/lib/supabase-api.ts`.

### Roles

- **owner**: everything, including changing roles and removing members.
- **admin**: everything except roles and membership.
- **user**: records and posts vouchers, makes batches and deposits; can read
  but not change banks and business settings.

## Tests

`supabase/tests/run.sh` builds a throwaway database from every migration and
runs `security_test.sql`. That script acts as three users (two separate
accounts, plus a plain `user` in one of them), each through the same
`authenticated` role the browser uses. It checks every rule above, both
that the allowed action works and that the blocked one is refused. CI
(`.github/workflows/checks.yml`) runs it on every pull request.

```sh
# needs a local Postgres you can create databases in
PGHOST=localhost PGUSER=postgres supabase/tests/run.sh
```

## Steps to do in the Supabase dashboard

These can't be done from the repository.

1. **Apply the migrations** to the production project (`supabase db push`, or
   paste any not yet applied into the SQL editor, in order). Then check:
   ```sql
   select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1;
   select proname from pg_proc where proname in ('save_batch', 'create_deposit', 'bulk_update_vouchers');
   ```
2. **Rotate the old project's service-role key** (it is in Deposit-Tracker's
   git history), or delete that project.
3. **Auth → URL configuration**: set the Site URL to the live domain and add
   `<domain>/login` and `<domain>/reset-password` as redirect URLs. Remove any
   localhost or old-domain entries.
4. **Auth → Providers → Email**: keep "Confirm email" on.
5. **Auth → Attack protection**: turn on leaked-password protection, and set a
   minimum password length (12 or more is a good default).
6. **Never** put the service-role key in the frontend or in a `VITE_` variable.
   Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong there.

## Known gaps

- The business logo is stored as a data URL in `company_settings` (up to 5 MB).
  Writes are admin-only, but it should move to Supabase Storage with
  per-account storage policies.
- Team invites aren't built. Clients can no longer insert `account_users`
  rows, so invites need a database function or Edge Function.
- The dashboard and reports load every voucher of the account (page by page)
  and total them in the browser. That is correct, but it will get slow with
  very large accounts; SQL views or functions should do the totals.
