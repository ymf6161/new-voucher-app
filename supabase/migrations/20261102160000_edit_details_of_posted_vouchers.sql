/*
  # Edit the details of posted and banked vouchers

  Posted or banked vouchers stay locked, except for three fields that don't
  affect money or where the voucher is:
    - received_from_id  (who it came from)
    - reference_id      (reference)
    - notes

  1. vf_guard_voucher_writes: a direct update to a posted or banked voucher is
     allowed when nothing but those three fields changes. Deleting it is still
     refused.
  2. bulk_update_vouchers: when the changes touch only those three fields,
     posted and banked vouchers are updated too. Changes to any other field
     still skip them.

  Safe to run more than once.
*/

CREATE OR REPLACE FUNCTION public.vf_guard_voucher_writes()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  -- Fields that may change on any voucher, posted or not.
  free_fields text[] := ARRAY['received_from_id', 'reference_id', 'notes'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE')
     AND NOT (OLD.status IN ('unposted', 'cancelled', 'completed') AND OLD.batch_id IS NULL AND OLD.deposit_id IS NULL) THEN
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - free_fields) = (to_jsonb(OLD) - free_fields) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This voucher is posted or banked: only Received from, Reference and Notes can be changed'
      USING ERRCODE = '42501', HINT = 'Remove it from its batch or deposit to change anything else.';
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

CREATE OR REPLACE FUNCTION public.bulk_update_vouchers(p_account_id uuid, p_ids text[], p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  updated_ids text[];
  bad_key text;
  -- Only who/reference/notes change: posted and banked vouchers can take that.
  details_only boolean := NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_changes, '{}')) k
    WHERE k NOT IN ('received_from_id', 'reference_id', 'notes')
  );
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
      AND (details_only
           OR (v.status IN ('unposted', 'cancelled', 'completed') AND v.batch_id IS NULL AND v.deposit_id IS NULL))
    RETURNING v.id
  )
  SELECT coalesce(array_agg(id), '{}') INTO updated_ids FROM changed;

  RETURN jsonb_build_object(
    'updated', coalesce(array_length(updated_ids, 1), 0),
    'skipped', to_jsonb(ARRAY(SELECT DISTINCT x FROM unnest(p_ids) x WHERE NOT (x = ANY(updated_ids))))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vf_guard_voucher_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_update_vouchers(uuid, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_vouchers(uuid, text[], jsonb) TO authenticated;
