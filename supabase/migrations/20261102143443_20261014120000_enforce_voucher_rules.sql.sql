-- VoucherFlow: database changes to apply in the Supabase SQL editor.
--
-- Contains, in order:
--   20261013120000_batch_recipient.sql          post batches to a person
--   20261013130000_harden_tenant_isolation.sql  accounts can't see each other
--   20261013231150_auto_account_on_signup.sql   sign-up creates an account
--   20261014120000_enforce_voucher_rules.sql    status rules, batch/deposit functions, roles
--

-- ===================================================================
-- 20261013120000_batch_recipient.sql
-- ===================================================================
/*
  # Post vouchers to a person, across several voucher companies

  A batch (and the deposit that banks it) can now be sent to a person from the
  Names list instead of a single voucher company. Such a batch may hold
  vouchers from several companies, so its voucher company becomes optional.

  1. Changes
    - `batches.recipient_name_id`  (varchar, nullable, references names)
    - `deposits.recipient_name_id` (varchar, nullable, references names)
    - `batches.voucher_company_id` and `deposits.voucher_company_id` become nullable
    - Each row must still name a company or a recipient
*/

ALTER TABLE batches ADD COLUMN IF NOT EXISTS recipient_name_id varchar REFERENCES names(id);
ALTER TABLE batches ALTER COLUMN voucher_company_id DROP NOT NULL;

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS recipient_name_id varchar REFERENCES names(id);
ALTER TABLE deposits ALTER COLUMN voucher_company_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_company_or_recipient') THEN
    ALTER TABLE batches ADD CONSTRAINT batches_company_or_recipient
      CHECK (voucher_company_id IS NOT NULL OR recipient_name_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposits_company_or_recipient') THEN
    ALTER TABLE deposits ADD CONSTRAINT deposits_company_or_recipient
      CHECK (voucher_company_id IS NOT NULL OR recipient_name_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_batches_recipient_name_id ON batches(recipient_name_id);
CREATE INDEX IF NOT EXISTS idx_deposits_recipient_name_id ON deposits(recipient_name_id);


-- ===================================================================
-- 20261013130000_harden_tenant_isolation.sql
-- ===================================================================
/*
  # Harden tenant isolation

  1. Helper functions (SECURITY DEFINER, so policies don't recurse)
     - is_account_member(account) / is_account_owner(account) / is_account_admin(account)
  2. Data tables: members of the row's account only
  3. accounts: members can read; owners/admins can rename; no client inserts
  4. account_users: see your own memberships and your accounts' members;
     only owners manage membership
  5. users: read and update your own row only, and only current_account_id
  6. sessions (unused leftover): no client access
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


-- ===================================================================
-- 20261013231150_auto_account_on_signup.sql
-- ===================================================================
/*
# Auto-create account on signup
- Replaces handle_new_user() trigger function with expanded version.
- Creates a personal account, links user as owner, sets current_account_id,
  creates default company_settings.
- SECURITY DEFINER with search_path set to public.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_account_id uuid;
  account_name text;
BEGIN
  -- Create the user profile row
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id::varchar,
    NEW.email,
    'admin',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Derive a friendly account name from the email prefix
  account_name := split_part(NEW.email, '@', 1);
  IF account_name = '' OR account_name IS NULL THEN
    account_name := 'My Organisation';
  END IF;

  -- Create a personal account for this user
  INSERT INTO public.accounts (name, slug)
  VALUES (account_name, replace(lower(NEW.email), '@', '_at_') || '_' || substr(NEW.id::text, 1, 8))
  RETURNING id INTO new_account_id;

  -- Link user to account as owner
  INSERT INTO public.account_users (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  -- Set current_account_id on user profile
  UPDATE public.users SET current_account_id = new_account_id WHERE id = NEW.id::varchar;

  -- Create default company_settings for the account
  INSERT INTO public.company_settings (account_id, business_name, address, city, postcode, phone, email, logo_url, charity_number)
  VALUES (new_account_id, account_name, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===================================================================
-- 20261014120000_enforce_voucher_rules.sql
-- ===================================================================
/*
  # Enforce voucher rules in the database

  1. Same-account links via trigger on all data tables
  2. Voucher status rules: posted/banked vouchers can't be edited/deleted directly
  3. Batches and deposits written only through SECURITY DEFINER functions
  4. Roles: banks and business settings admin-only; membership via set_member_role
  5. Deposits get adjustment columns
*/

-- 0. Columns and constraints ---------------------------------------------
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS adjustment_amount numeric(10, 2);
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS adjustment_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_status_check') THEN
    ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_status_check
      CHECK (status IN ('unposted', 'posted', 'deposited', 'cancelled', 'completed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_status_check') THEN
    ALTER TABLE public.batches ADD CONSTRAINT batches_status_check
      CHECK (status IN ('pending', 'sent', 'cancelled')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vouchers_account_id ON public.vouchers(account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_batch_id ON public.vouchers(batch_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_deposit_id ON public.vouchers(deposit_id);
CREATE INDEX IF NOT EXISTS idx_batches_account_id ON public.batches(account_id);
CREATE INDEX IF NOT EXISTS idx_deposits_account_id ON public.deposits(account_id);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON public.account_users(user_id);

-- 1. Same-account links ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.vf_check_links()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  link record;
  found boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'Records cannot be moved to another account' USING ERRCODE = '42501';
  END IF;

  FOR link IN
    SELECT * FROM (VALUES
      ('voucher_company_id', 'voucher_companies'),
      ('received_from_id', 'names'),
      ('recipient_name_id', 'names'),
      ('reference_id', 'references'),
      ('bank_id', 'banks'),
      ('batch_id', 'batches'),
      ('deposit_id', 'deposits')
    ) AS l(col, tbl)
  LOOP
    CONTINUE WHEN NOT new_row ? link.col OR new_row->>link.col IS NULL;
    CONTINUE WHEN new_row->>link.col IS NOT DISTINCT FROM old_row->>link.col;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND account_id = $2)', link.tbl)
      INTO found USING new_row->>link.col, NEW.account_id;
    IF NOT found THEN
      RAISE EXCEPTION '% does not belong to this account', link.col USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voucher_companies', 'names', 'references', 'banks', 'vouchers', 'batches',
                           'deposits', 'company_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS vf_check_links ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER vf_check_links BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.vf_check_links()', t);
  END LOOP;
END $$;

-- 2. Voucher status rules for direct writes -------------------------------
CREATE OR REPLACE FUNCTION public.vf_guard_voucher_writes()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE')
     AND NOT (OLD.status IN ('unposted', 'cancelled', 'completed') AND OLD.batch_id IS NULL AND OLD.deposit_id IS NULL) THEN
    RAISE EXCEPTION 'This voucher is posted or banked and cannot be changed'
      USING ERRCODE = '42501', HINT = 'Remove it from its batch or deposit first.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.status NOT IN ('unposted', 'cancelled', 'completed') OR NEW.batch_id IS NOT NULL OR NEW.deposit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Vouchers are posted and banked through batches and deposits'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vf_guard_voucher_writes ON public.vouchers;
CREATE TRIGGER vf_guard_voucher_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.vf_guard_voucher_writes();

-- Batches and deposits: read directly, write through the functions only.
REVOKE INSERT, UPDATE, DELETE ON public.batches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.deposits FROM anon, authenticated;

-- 3. Functions for multi-step writes ---------------------------------------

CREATE OR REPLACE FUNCTION public.vf_require_member(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_account_id IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'Not found or not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.vf_next_batch_reference(p_account_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'B-' || (greatest(100, coalesce(max(nullif(regexp_replace(reference, '\D', '', 'g'), '')::bigint), 0)) + 1)
  FROM batches WHERE account_id = p_account_id;
$$;

CREATE OR REPLACE FUNCTION public.save_batch(
  p_account_id uuid,
  p_batch_id text,
  p_batch jsonb,
  p_voucher_ids text[]
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b batches%ROWTYPE;
  ids text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_voucher_ids, '{}')));
  usable int;
  company_id text;
  recipient_id text;
BEGIN
  PERFORM vf_require_member(p_account_id);
  IF coalesce(array_length(ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one voucher for the batch';
  END IF;

  IF p_batch_id IS NOT NULL THEN
    SELECT * INTO b FROM batches WHERE id = p_batch_id AND account_id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch not found' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM vouchers WHERE batch_id = b.id AND (status = 'deposited' OR deposit_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'This batch has banked vouchers and can no longer be edited';
    END IF;
  END IF;

  company_id := CASE WHEN p_batch ? 'voucher_company_id' THEN nullif(p_batch->>'voucher_company_id', '') ELSE b.voucher_company_id END;
  recipient_id := CASE WHEN p_batch ? 'recipient_name_id' THEN nullif(p_batch->>'recipient_name_id', '') ELSE b.recipient_name_id END;
  IF company_id IS NULL AND recipient_id IS NULL THEN
    RAISE EXCEPTION 'A batch goes to a voucher company or a person';
  END IF;

  PERFORM 1 FROM vouchers WHERE id = ANY(ids) AND account_id = p_account_id FOR UPDATE;
  SELECT count(*) INTO usable FROM vouchers v
  WHERE v.id = ANY(ids) AND v.account_id = p_account_id AND v.deposit_id IS NULL
    AND ((p_batch_id IS NOT NULL AND v.batch_id = p_batch_id)
         OR (v.batch_id IS NULL AND v.status = 'unposted'))
    AND (recipient_id IS NOT NULL OR v.voucher_company_id = company_id);
  IF usable <> array_length(ids, 1) THEN
    RAISE EXCEPTION 'Some vouchers are no longer available for this batch. Refresh and try again.';
  END IF;

  IF p_batch_id IS NULL THEN
    INSERT INTO batches (account_id, reference, voucher_company_id, recipient_name_id, bank_id,
                         batch_date, date_sent, notes, status, amount_sent)
    VALUES (
      p_account_id,
      coalesce(nullif(trim(p_batch->>'reference'), ''), vf_next_batch_reference(p_account_id)),
      company_id,
      recipient_id,
      nullif(p_batch->>'bank_id', ''),
      coalesce(nullif(p_batch->>'batch_date', '')::date, CURRENT_DATE),
      coalesce(nullif(p_batch->>'date_sent', '')::timestamptz, now()),
      nullif(p_batch->>'notes', ''),
      'pending',
      0
    )
    RETURNING * INTO b;
  ELSE
    UPDATE batches SET
      reference = CASE WHEN p_batch ? 'reference' THEN coalesce(nullif(trim(p_batch->>'reference'), ''), reference) ELSE reference END,
      voucher_company_id = company_id,
      recipient_name_id = recipient_id,
      bank_id = CASE WHEN p_batch ? 'bank_id' THEN nullif(p_batch->>'bank_id', '') ELSE bank_id END,
      batch_date = CASE WHEN p_batch ? 'batch_date' THEN coalesce(nullif(p_batch->>'batch_date', '')::date, batch_date) ELSE batch_date END,
      notes = CASE WHEN p_batch ? 'notes' THEN nullif(p_batch->>'notes', '') ELSE notes END
    WHERE id = b.id
    RETURNING * INTO b;

    UPDATE vouchers SET batch_id = NULL, status = 'unposted'
    WHERE batch_id = b.id AND NOT (id = ANY(ids));
  END IF;

  UPDATE vouchers SET batch_id = b.id, status = 'posted'
  WHERE id = ANY(ids) AND account_id = p_account_id;

  UPDATE batches SET amount_sent = (
    SELECT coalesce(sum(amount * quantity), 0) FROM vouchers WHERE batch_id = b.id
  ) WHERE id = b.id;

  RETURN b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_batch_status(p_batch_id text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM batches WHERE id = p_batch_id FOR UPDATE;
  PERFORM vf_require_member(b.account_id);
  IF p_status NOT IN ('pending', 'sent', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown batch status %', p_status;
  END IF;
  IF p_status = 'cancelled' THEN
    IF EXISTS (SELECT 1 FROM vouchers WHERE batch_id = b.id AND (status = 'deposited' OR deposit_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'This batch has banked vouchers and cannot be cancelled';
    END IF;
    UPDATE vouchers SET batch_id = NULL, status = 'unposted' WHERE batch_id = b.id;
    UPDATE batches SET amount_sent = 0 WHERE id = b.id;
  END IF;
  UPDATE batches SET status = p_status WHERE id = b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_batch(p_batch_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  b batches%ROWTYPE;
BEGIN
  SELECT * INTO b FROM batches WHERE id = p_batch_id FOR UPDATE;
  PERFORM vf_require_member(b.account_id);
  IF EXISTS (SELECT 1 FROM vouchers WHERE batch_id = b.id AND (status = 'deposited' OR deposit_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'This batch has banked vouchers. Delete or edit the deposit first.';
  END IF;
  UPDATE vouchers SET batch_id = NULL, status = 'unposted' WHERE batch_id = b.id;
  DELETE FROM batches WHERE id = b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vf_attach_deposit_vouchers(d deposits, p_voucher_ids text[])
RETURNS void
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  ids text[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_voucher_ids, '{}')));
  usable int;
BEGIN
  IF coalesce(array_length(ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one voucher to bank';
  END IF;
  PERFORM 1 FROM vouchers WHERE id = ANY(ids) AND account_id = d.account_id FOR UPDATE;
  SELECT count(*) INTO usable FROM vouchers v
  JOIN batches bt ON bt.id = v.batch_id
  WHERE v.id = ANY(ids) AND v.account_id = d.account_id
    AND v.status = 'posted' AND v.deposit_id IS NULL
    AND (CASE WHEN d.recipient_name_id IS NOT NULL THEN bt.recipient_name_id = d.recipient_name_id
              ELSE v.voucher_company_id = d.voucher_company_id END);
  IF usable <> array_length(ids, 1) THEN
    RAISE EXCEPTION 'Some vouchers are no longer available to bank. Refresh and try again.';
  END IF;
  UPDATE vouchers SET deposit_id = d.id, status = 'deposited' WHERE id = ANY(ids) AND account_id = d.account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.vf_attach_deposit_vouchers(deposits, text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_deposit(p_account_id uuid, p_deposit jsonb, p_voucher_ids text[])
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  PERFORM vf_require_member(p_account_id);
  IF nullif(p_deposit->>'bank_id', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the bank account';
  END IF;
  INSERT INTO deposits (account_id, bank_id, voucher_company_id, recipient_name_id, amount_banked,
                        reference, notes, date_deposited)
  VALUES (
    p_account_id,
    p_deposit->>'bank_id',
    nullif(p_deposit->>'voucher_company_id', ''),
    nullif(p_deposit->>'recipient_name_id', ''),
    (p_deposit->>'amount_banked')::numeric,
    nullif(p_deposit->>'reference', ''),
    nullif(p_deposit->>'notes', ''),
    coalesce(nullif(p_deposit->>'date_deposited', '')::timestamptz, now())
  )
  RETURNING * INTO d;
  PERFORM vf_attach_deposit_vouchers(d, p_voucher_ids);
  RETURN d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_deposit(p_deposit_id text, p_deposit jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  SELECT * INTO d FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  PERFORM vf_require_member(d.account_id);
  UPDATE deposits SET
    amount_banked = CASE WHEN p_deposit ? 'amount_banked' THEN (p_deposit->>'amount_banked')::numeric ELSE amount_banked END,
    bank_id = CASE WHEN p_deposit ? 'bank_id' THEN p_deposit->>'bank_id' ELSE bank_id END,
    date_deposited = CASE WHEN p_deposit ? 'date_deposited' THEN (p_deposit->>'date_deposited')::timestamptz ELSE date_deposited END,
    reference = CASE WHEN p_deposit ? 'reference' THEN nullif(p_deposit->>'reference', '') ELSE reference END,
    notes = CASE WHEN p_deposit ? 'notes' THEN nullif(p_deposit->>'notes', '') ELSE notes END,
    adjustment_amount = CASE WHEN p_deposit ? 'adjustment_amount' THEN nullif(p_deposit->>'adjustment_amount', '')::numeric ELSE adjustment_amount END,
    adjustment_reason = CASE WHEN p_deposit ? 'adjustment_reason' THEN nullif(p_deposit->>'adjustment_reason', '') ELSE adjustment_reason END
  WHERE id = d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_deposit_vouchers(p_deposit_id text, p_voucher_ids text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  SELECT * INTO d FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  PERFORM vf_require_member(d.account_id);
  PERFORM vf_attach_deposit_vouchers(d, p_voucher_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_deposit_voucher(p_deposit_id text, p_voucher_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  SELECT * INTO d FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  PERFORM vf_require_member(d.account_id);
  UPDATE vouchers SET deposit_id = NULL, status = 'posted'
  WHERE id = p_voucher_id AND deposit_id = d.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That voucher is not in this deposit';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_deposit(p_deposit_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  SELECT * INTO d FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  PERFORM vf_require_member(d.account_id);
  UPDATE vouchers SET deposit_id = NULL, status = 'posted' WHERE deposit_id = d.id;
  DELETE FROM deposits WHERE id = d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_vouchers(p_account_id uuid, p_ids text[], p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  updated_ids text[];
  bad_key text;
BEGIN
  PERFORM vf_require_member(p_account_id);

  SELECT k INTO bad_key FROM jsonb_object_keys(coalesce(p_changes, '{}')) k
  WHERE k NOT IN ('date_received', 'voucher_company_id', 'received_from_id', 'reference_id', 'type', 'status', 'notes')
  LIMIT 1;
  IF bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field % cannot be bulk edited', bad_key;
  END IF;
  IF p_changes ? 'status' AND p_changes->>'status' NOT IN ('unposted', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'Bulk edit can set status to unposted, cancelled or completed only';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_changes) e
             WHERE e.key IN ('date_received', 'voucher_company_id', 'type', 'status') AND nullif(e.value, '') IS NULL) THEN
    RAISE EXCEPTION 'Date, company, type and status cannot be empty';
  END IF;

  WITH changed AS (
    UPDATE vouchers v SET
      date_received = CASE WHEN p_changes ? 'date_received' THEN (p_changes->>'date_received')::timestamptz ELSE v.date_received END,
      voucher_company_id = CASE WHEN p_changes ? 'voucher_company_id' THEN p_changes->>'voucher_company_id' ELSE v.voucher_company_id END,
      received_from_id = CASE WHEN p_changes ? 'received_from_id' THEN nullif(p_changes->>'received_from_id', '') ELSE v.received_from_id END,
      reference_id = CASE WHEN p_changes ? 'reference_id' THEN nullif(p_changes->>'reference_id', '') ELSE v.reference_id END,
      type = CASE WHEN p_changes ? 'type' THEN p_changes->>'type' ELSE v.type END,
      status = CASE WHEN p_changes ? 'status' THEN p_changes->>'status' ELSE v.status END,
      notes = CASE WHEN p_changes ? 'notes' THEN nullif(p_changes->>'notes', '') ELSE v.notes END
    WHERE v.account_id = p_account_id AND v.id = ANY(p_ids)
      AND v.status IN ('unposted', 'cancelled', 'completed') AND v.batch_id IS NULL AND v.deposit_id IS NULL
    RETURNING v.id
  )
  SELECT coalesce(array_agg(id), '{}') INTO updated_ids FROM changed;

  RETURN jsonb_build_object(
    'updated', coalesce(array_length(updated_ids, 1), 0),
    'skipped', to_jsonb(ARRAY(SELECT DISTINCT x FROM unnest(p_ids) x WHERE NOT (x = ANY(updated_ids))))
  );
END;
$$;

-- 4. Roles ---------------------------------------------------------------

-- Banks and business settings: members read, owners/admins write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['banks', 'company_settings']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Account members only" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Members read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Members read" ON public.%I FOR SELECT TO authenticated
                      USING (public.is_account_member(account_id))', t);
    EXECUTE format('CREATE POLICY "Admins insert" ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.is_account_admin(account_id))', t);
    EXECUTE format('CREATE POLICY "Admins update" ON public.%I FOR UPDATE TO authenticated
                      USING (public.is_account_admin(account_id)) WITH CHECK (public.is_account_admin(account_id))', t);
    EXECUTE format('CREATE POLICY "Admins delete" ON public.%I FOR DELETE TO authenticated
                      USING (public.is_account_admin(account_id))', t);
  END LOOP;
END $$;

-- Membership: roles change through set_member_role; owners may remove members.
REVOKE INSERT, UPDATE ON public.account_users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.vf_keep_an_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner'
     AND EXISTS (SELECT 1 FROM accounts WHERE id = OLD.account_id)
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM account_users WHERE account_id = OLD.account_id AND role = 'owner') THEN
    RAISE EXCEPTION 'An account must keep at least one owner';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vf_keep_an_owner ON public.account_users;
CREATE TRIGGER vf_keep_an_owner
  AFTER UPDATE OR DELETE ON public.account_users
  FOR EACH ROW EXECUTE FUNCTION public.vf_keep_an_owner();

CREATE OR REPLACE FUNCTION public.account_members(p_account_id uuid)
RETURNS TABLE (id text, email text, first_name text, last_name text, profile_image_url text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM vf_require_member(p_account_id);
  RETURN QUERY
    SELECT au.user_id::text, coalesce(u.email, au_auth.email)::text, u.first_name::text, u.last_name::text,
           u.profile_image_url::text, au.role
    FROM account_users au
    LEFT JOIN users u ON u.id = au.user_id::text
    LEFT JOIN auth.users au_auth ON au_auth.id = au.user_id
    WHERE au.account_id = p_account_id
    ORDER BY au.created_at, au.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_role(p_account_id uuid, p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_account_owner(p_account_id) THEN
    RAISE EXCEPTION 'Only an owner can change roles' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('owner', 'admin', 'user') THEN
    RAISE EXCEPTION 'Unknown role %', p_role;
  END IF;
  UPDATE account_users SET role = p_role, updated_at = now()
  WHERE account_id = p_account_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not a member of this account';
  END IF;
END;
$$;

-- 5. Sign-up: never fail on a missing email (e.g. phone sign-up) -----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  account_name text := coalesce(nullif(split_part(NEW.email, '@', 1), ''), 'My Organisation');
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (NEW.id::varchar, NEW.email, 'user', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts (name, slug)
  VALUES (account_name, 'acct-' || replace(NEW.id::text, '-', ''))
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_users (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  UPDATE public.users SET current_account_id = new_account_id WHERE id = NEW.id::varchar;

  INSERT INTO public.company_settings (account_id, business_name)
  VALUES (new_account_id, account_name);

  RETURN NEW;
END;
$$;

-- 6. Function permissions -------------------------------------------------
REVOKE ALL ON FUNCTION public.vf_check_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vf_guard_voucher_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vf_keep_an_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vf_next_batch_reference(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vf_require_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vf_require_member(uuid) TO authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'save_batch(uuid, text, jsonb, text[])',
    'set_batch_status(text, text)',
    'delete_batch(text)',
    'create_deposit(uuid, jsonb, text[])',
    'update_deposit(text, jsonb)',
    'add_deposit_vouchers(text, text[])',
    'remove_deposit_voucher(text, text)',
    'delete_deposit(text)',
    'bulk_update_vouchers(uuid, text[], jsonb)',
    'account_members(uuid)',
    'set_member_role(uuid, uuid, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
