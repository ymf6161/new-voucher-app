/*
  # Bank part of a voucher line, and record adjustments when banking

  A voucher line can hold several vouchers (quantity > 1). When only some of
  them are banked, the line is split in two: one line with the banked
  quantity goes into the deposit, the rest stays posted in its batch. Both
  lines keep every other detail (company, type, amount, voucher number,
  received from, reference, notes, batch).

  1. vf_split_voucher(voucher, quantity): internal helper, not callable
     through the API.
  2. create_deposit and add_deposit_vouchers take an optional p_quantities
     ({"<voucher id>": <quantity to bank>}). Lines not listed are banked in
     full. Everything happens in one transaction, so a failed deposit leaves
     no split behind.
  3. create_deposit also stores adjustment_amount / adjustment_reason
     (banked amount differing from the vouchers' value, e.g. a bank fee).

  Safe to run more than once.
*/

CREATE OR REPLACE FUNCTION public.vf_split_voucher(p_voucher_id text, p_quantity int)
RETURNS text
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v vouchers%ROWTYPE;
  new_id text;
BEGIN
  SELECT * INTO v FROM vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v.quantity THEN
    RAISE EXCEPTION 'Choose between 1 and % vouchers from this line', v.quantity;
  END IF;
  IF p_quantity = v.quantity THEN
    RETURN v.id;
  END IF;

  v.id := gen_random_uuid()::text;
  v.quantity := p_quantity;
  INSERT INTO vouchers SELECT (v).*;
  UPDATE vouchers SET quantity = quantity - p_quantity WHERE id = p_voucher_id;
  RETURN v.id;
END;
$$;
REVOKE ALL ON FUNCTION public.vf_split_voucher(text, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vf_split_for_deposit(p_account_id uuid, p_voucher_ids text[], p_quantities jsonb)
RETURNS text[]
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  result text[] := '{}';
  vid text;
  wanted int;
  current_qty int;
BEGIN
  FOREACH vid IN ARRAY ARRAY(SELECT DISTINCT unnest(coalesce(p_voucher_ids, '{}')))
  LOOP
    wanted := nullif(coalesce(p_quantities, '{}'::jsonb)->>vid, '')::int;
    SELECT quantity INTO current_qty FROM vouchers
    WHERE id = vid AND account_id = p_account_id AND status = 'posted' AND deposit_id IS NULL
    FOR UPDATE;
    IF wanted IS NOT NULL AND current_qty IS NOT NULL AND wanted <> current_qty THEN
      result := result || vf_split_voucher(vid, wanted);
    ELSE
      result := result || vid;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.vf_split_for_deposit(uuid, text[], jsonb) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.create_deposit(uuid, jsonb, text[]);
DROP FUNCTION IF EXISTS public.add_deposit_vouchers(text, text[]);

CREATE OR REPLACE FUNCTION public.create_deposit(
  p_account_id uuid,
  p_deposit jsonb,
  p_voucher_ids text[],
  p_quantities jsonb DEFAULT '{}'::jsonb
)
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
  IF nullif(p_deposit->>'amount_banked', '') IS NULL THEN
    RAISE EXCEPTION 'Enter the amount banked';
  END IF;
  INSERT INTO deposits (account_id, bank_id, voucher_company_id, recipient_name_id, amount_banked,
                        reference, notes, date_deposited, adjustment_amount, adjustment_reason)
  VALUES (
    p_account_id,
    p_deposit->>'bank_id',
    nullif(p_deposit->>'voucher_company_id', ''),
    nullif(p_deposit->>'recipient_name_id', ''),
    (p_deposit->>'amount_banked')::numeric,
    nullif(p_deposit->>'reference', ''),
    nullif(p_deposit->>'notes', ''),
    coalesce(nullif(p_deposit->>'date_deposited', '')::timestamptz, now()),
    nullif(p_deposit->>'adjustment_amount', '')::numeric,
    nullif(p_deposit->>'adjustment_reason', '')
  )
  RETURNING * INTO d;
  PERFORM vf_attach_deposit_vouchers(d, vf_split_for_deposit(p_account_id, p_voucher_ids, p_quantities));
  RETURN d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_deposit_vouchers(
  p_deposit_id text,
  p_voucher_ids text[],
  p_quantities jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d deposits%ROWTYPE;
BEGIN
  SELECT * INTO d FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  PERFORM vf_require_member(d.account_id);
  PERFORM vf_attach_deposit_vouchers(d, vf_split_for_deposit(d.account_id, p_voucher_ids, p_quantities));
END;
$$;

REVOKE ALL ON FUNCTION public.create_deposit(uuid, jsonb, text[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_deposit_vouchers(text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_deposit(uuid, jsonb, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_deposit_vouchers(text, text[], jsonb) TO authenticated;
