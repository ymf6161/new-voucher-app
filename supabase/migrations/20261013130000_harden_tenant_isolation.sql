/*
  # Harden tenant isolation

  Earlier migrations were applied by hand and overlap: some dropped
  "USING (true)" policies, others recreated them, and the account_users
  SELECT policy referred to account_users itself (Postgres rejects that
  with "infinite recursion detected in policy"). This migration replaces
  every policy on the app's tables with one clean set so that a signed-in
  user can only ever reach rows of accounts they are a member of.

  The app server uses the service-role key, which bypasses RLS; it scopes
  every query to the caller's account in code. These policies protect the
  database from direct access with the public anon key + a user's token.

  1. Helper functions (SECURITY DEFINER, so policies don't recurse)
     - is_account_member(account) / is_account_owner(account)
  2. Data tables (voucher_companies, names, references, banks, vouchers,
     batches, deposits, company_settings): members of the row's account only
  3. accounts: members can read; owners/admins can rename; no client inserts
     (sign-up creates accounts through the handle_new_user trigger)
  4. account_users: see your own memberships and your accounts' members;
     only owners manage membership
  5. users: read and update your own row only, and only current_account_id,
     which must point at an account you belong to
  6. sessions (unused leftover): no client access

  Safe to run more than once.
*/

-- 1. Helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_member(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_users WHERE account_id = target AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_owner(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_users WHERE account_id = target AND user_id = auth.uid() AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_admin(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_users WHERE account_id = target AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_account_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_account_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_admin(uuid) TO authenticated;

-- Drop every existing policy on the app's tables, whatever its name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('voucher_companies', 'names', 'references', 'banks', 'vouchers', 'batches',
                        'deposits', 'company_settings', 'accounts', 'account_users', 'users', 'sessions')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Data tables: account members only ----------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voucher_companies', 'names', 'references', 'banks', 'vouchers', 'batches',
                           'deposits', 'company_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Account members only" ON public.%I FOR ALL TO authenticated
         USING (public.is_account_member(account_id))
         WITH CHECK (public.is_account_member(account_id))', t);
  END LOOP;
END $$;

-- 3. accounts -------------------------------------------------------------
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their accounts" ON public.accounts
  FOR SELECT TO authenticated USING (public.is_account_member(id));
CREATE POLICY "Admins can update their accounts" ON public.accounts
  FOR UPDATE TO authenticated USING (public.is_account_admin(id)) WITH CHECK (public.is_account_admin(id));

-- 4. account_users --------------------------------------------------------
ALTER TABLE public.account_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own and fellow memberships" ON public.account_users
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_account_member(account_id));
CREATE POLICY "Owners add members" ON public.account_users
  FOR INSERT TO authenticated WITH CHECK (public.is_account_owner(account_id));
CREATE POLICY "Owners change members" ON public.account_users
  FOR UPDATE TO authenticated
  USING (public.is_account_owner(account_id)) WITH CHECK (public.is_account_owner(account_id));
CREATE POLICY "Owners remove members" ON public.account_users
  FOR DELETE TO authenticated USING (public.is_account_owner(account_id));

-- 5. users: own row only; clients may change only current_account_id -----
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own user row" ON public.users
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid())::text);
CREATE POLICY "Switch own current account" ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())::text)
  WITH CHECK (
    id = (SELECT auth.uid())::text
    AND (current_account_id IS NULL OR public.is_account_member(current_account_id))
  );
REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT UPDATE (current_account_id) ON public.users TO authenticated;

-- 6. sessions (left over from an old login system): no client access -------
DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.sessions FROM anon, authenticated;
  END IF;
END $$;

-- Nothing in the app reads tables as an anonymous (signed-out) visitor.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voucher_companies', 'names', 'references', 'banks', 'vouchers', 'batches',
                           'deposits', 'company_settings', 'accounts', 'account_users', 'users']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
