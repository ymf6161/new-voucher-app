-- Security tests: tenant isolation, voucher status rules, roles.
-- Run with supabase/tests/run.sh against a throwaway database. Every check
-- acts through the "authenticated" role with a user id in the JWT claims,
-- exactly like a browser holding the anon key and a user's token.
\set ON_ERROR_STOP 1
\set QUIET 1

-- Helpers -------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO authenticated, anon;

CREATE OR REPLACE FUNCTION tests.ok(cond boolean, what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %', what; END IF;
  RAISE NOTICE 'ok: %', what;
END $$;

-- Runs sql and passes only if it raises an error matching pattern.
CREATE OR REPLACE FUNCTION tests.fails(sql text, pattern text, what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM !~* pattern THEN
      RAISE EXCEPTION 'FAILED: % (wrong error: %)', what, SQLERRM;
    END IF;
    RAISE NOTICE 'ok: % (blocked: %)', what, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAILED: % (was allowed)', what;
END $$;

-- Runs sql and returns how many rows it changed.
CREATE OR REPLACE FUNCTION tests.rows(sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated, anon;

-- Fixtures (as the database owner) -----------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@example.com');

SELECT account_id AS alice_acct FROM account_users WHERE user_id = 'a0000000-0000-0000-0000-00000000000a' \gset
SELECT account_id AS bob_acct FROM account_users WHERE user_id = 'b0000000-0000-0000-0000-00000000000b' \gset
SELECT account_id AS carol_acct FROM account_users WHERE user_id = 'c0000000-0000-0000-0000-00000000000c' \gset

-- Carol also joins Alice's account with the plain "user" role.
INSERT INTO account_users (account_id, user_id, role)
VALUES (:'alice_acct', 'c0000000-0000-0000-0000-00000000000c', 'user');

SELECT tests.ok((SELECT count(*) FROM company_settings WHERE account_id IN (:'alice_acct', :'bob_acct')) = 2,
                'sign-up creates an account with settings for each user');

-- Alice's data --------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);

INSERT INTO voucher_companies (id, account_id, name) VALUES ('a-co1', :'alice_acct', 'Alice Co 1'), ('a-co2', :'alice_acct', 'Alice Co 2');
INSERT INTO names (id, account_id, name) VALUES ('a-name', :'alice_acct', 'Alice Person');
INSERT INTO banks (id, account_id, name) VALUES ('a-bank', :'alice_acct', 'Alice Bank');
INSERT INTO vouchers (id, account_id, voucher_company_id, amount, quantity, received_from_id) VALUES
  ('a-v1', :'alice_acct', 'a-co1', 10, 2, 'a-name'),
  ('a-v2', :'alice_acct', 'a-co1', 5, 1, NULL),
  ('a-v3', :'alice_acct', 'a-co2', 7, 1, NULL),
  ('a-v4', :'alice_acct', 'a-co1', 1, 1, NULL);

SELECT tests.fails($$INSERT INTO vouchers (account_id, voucher_company_id, amount, status) VALUES ('$$ || :'alice_acct' || $$', 'a-co1', 1, 'posted')$$,
  'posted and banked through', 'a voucher cannot be created already posted');
SELECT tests.fails($$INSERT INTO batches (account_id, reference, voucher_company_id, amount_sent) VALUES ('$$ || :'alice_acct' || $$', 'X', 'a-co1', 0)$$,
  'permission denied', 'batches cannot be inserted directly');

-- Bob cannot see or touch Alice's account ------------------------------------
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);

INSERT INTO voucher_companies (id, account_id, name) VALUES ('b-co', :'bob_acct', 'Bob Co');
INSERT INTO banks (id, account_id, name) VALUES ('b-bank', :'bob_acct', 'Bob Bank');
INSERT INTO vouchers (id, account_id, voucher_company_id, amount) VALUES ('b-v1', :'bob_acct', 'b-co', 3);

SELECT tests.ok((SELECT count(*) FROM vouchers WHERE account_id = :'alice_acct') = 0, 'Bob sees none of Alice''s vouchers');
SELECT tests.ok((SELECT count(*) FROM voucher_companies WHERE account_id = :'alice_acct') = 0, 'Bob sees none of Alice''s companies');
SELECT tests.ok((SELECT count(*) FROM company_settings WHERE account_id = :'alice_acct') = 0, 'Bob cannot read Alice''s settings');
SELECT tests.ok((SELECT count(*) FROM accounts WHERE id = :'alice_acct') = 0, 'Bob cannot read Alice''s account');
SELECT tests.ok((SELECT count(*) FROM account_users WHERE account_id = :'alice_acct') = 0, 'Bob cannot list Alice''s members');
SELECT tests.ok(tests.rows($$UPDATE vouchers SET notes = 'hacked' WHERE id = 'a-v1'$$) = 0, 'Bob cannot update Alice''s voucher');
SELECT tests.ok(tests.rows($$DELETE FROM vouchers WHERE id = 'a-v2'$$) = 0, 'Bob cannot delete Alice''s voucher');
SELECT tests.fails($$INSERT INTO vouchers (account_id, voucher_company_id, amount) VALUES ('$$ || :'alice_acct' || $$', 'a-co1', 1)$$,
  'row-level security|does not belong', 'Bob cannot insert into Alice''s account');
SELECT tests.fails($$INSERT INTO vouchers (account_id, voucher_company_id, amount) VALUES ('$$ || :'bob_acct' || $$', 'a-co1', 1)$$,
  'does not belong', 'Bob cannot link his voucher to Alice''s company');
SELECT tests.fails($$UPDATE vouchers SET received_from_id = 'a-name' WHERE id = 'b-v1'$$,
  'does not belong', 'Bob cannot link his voucher to Alice''s name');
SELECT tests.fails($$SELECT save_batch('$$ || :'alice_acct' || $$', NULL, '{"voucher_company_id":"a-co1"}', ARRAY['a-v1'])$$,
  'not allowed', 'Bob cannot create a batch in Alice''s account');
SELECT tests.fails($$SELECT save_batch('$$ || :'bob_acct' || $$', NULL, '{"voucher_company_id":"b-co"}', ARRAY['b-v1','a-v1'])$$,
  'no longer available', 'Bob cannot pull Alice''s voucher into his batch');
SELECT tests.fails($$SELECT * FROM account_members('$$ || :'alice_acct' || $$')$$,
  'not allowed', 'Bob cannot list Alice''s members via function');
SELECT tests.fails($$SELECT bulk_update_vouchers('$$ || :'alice_acct' || $$', ARRAY['a-v1'], '{"notes":"x"}')$$,
  'not allowed', 'Bob cannot bulk edit Alice''s vouchers');
SELECT tests.fails($$UPDATE users SET current_account_id = '$$ || :'alice_acct' || $$' WHERE id = 'b0000000-0000-0000-0000-00000000000b'$$,
  'row-level security', 'Bob cannot switch into Alice''s account');
SELECT tests.fails($$INSERT INTO account_users (account_id, user_id, role) VALUES ('$$ || :'alice_acct' || $$', 'b0000000-0000-0000-0000-00000000000b', 'owner')$$,
  'permission denied', 'Bob cannot add himself to Alice''s account');

-- Alice: batches -----------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);

SELECT tests.fails($$SELECT save_batch('$$ || :'alice_acct' || $$', NULL, '{"voucher_company_id":"a-co1"}', ARRAY['a-v1','a-v3'])$$,
  'no longer available', 'a company batch only takes that company''s vouchers');

SELECT save_batch(:'alice_acct', NULL, '{"voucher_company_id":"a-co1","reference":"B-500","bank_id":"a-bank"}', ARRAY['a-v1','a-v2']) AS batch1 \gset
SELECT tests.ok((SELECT amount_sent FROM batches WHERE id = :'batch1') = 25, 'batch total is worked out in the database (10x2 + 5)');
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE batch_id = :'batch1' AND status = 'posted') = 2, 'batch vouchers are posted');
SELECT tests.fails($$SELECT save_batch('$$ || :'alice_acct' || $$', NULL, '{"voucher_company_id":"a-co1"}', ARRAY['a-v1'])$$,
  'no longer available', 'a posted voucher cannot go into a second batch');

SELECT tests.fails($$UPDATE vouchers SET amount = 999 WHERE id = 'a-v1'$$, 'cannot be changed', 'a posted voucher cannot be edited');
SELECT tests.fails($$DELETE FROM vouchers WHERE id = 'a-v1'$$, 'cannot be changed', 'a posted voucher cannot be deleted');
SELECT tests.fails($$UPDATE vouchers SET batch_id = '$$ || :'batch1' || $$', status = 'posted' WHERE id = 'a-v4'$$,
  'cannot be changed|posted and banked', 'a voucher cannot be posted by a direct update');
SELECT tests.fails($$UPDATE batches SET amount_sent = 0 WHERE id = '$$ || :'batch1' || $$'$$, 'permission denied', 'batches cannot be updated directly');

-- Edit the batch: swap a-v2 for a-v4.
SELECT save_batch(:'alice_acct', :'batch1', '{"notes":"edited"}', ARRAY['a-v1','a-v4']);
SELECT tests.ok((SELECT status FROM vouchers WHERE id = 'a-v2') = 'unposted' AND (SELECT batch_id FROM vouchers WHERE id = 'a-v2') IS NULL,
  'a voucher removed from a batch is unposted again');
SELECT tests.ok((SELECT amount_sent FROM batches WHERE id = :'batch1') = 21, 'batch total follows the edit');

-- Person batch across companies.
SELECT save_batch(:'alice_acct', NULL, '{"recipient_name_id":"a-name"}', ARRAY['a-v2','a-v3']) AS batch2 \gset
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE batch_id = :'batch2') = 2, 'a person batch can hold several companies');
SELECT set_batch_status(:'batch2', 'sent');
SELECT tests.ok((SELECT status FROM batches WHERE id = :'batch2') = 'sent', 'batch can be marked sent');

-- Bulk edit ---------------------------------------------------------------
INSERT INTO vouchers (id, account_id, voucher_company_id, amount) VALUES ('a-v5', :'alice_acct', 'a-co1', 2);
SELECT bulk_update_vouchers(:'alice_acct', ARRAY['a-v1','a-v5'], '{"notes":"bulk"}') AS bulk \gset
SELECT tests.ok((:'bulk'::jsonb)->>'updated' = '1' AND (:'bulk'::jsonb)->'skipped' = '["a-v1"]', 'bulk edit reports real count and skips posted vouchers');
SELECT tests.ok((SELECT notes FROM vouchers WHERE id = 'a-v1') IS NULL, 'bulk edit left the posted voucher alone');
SELECT tests.fails($$SELECT bulk_update_vouchers('$$ || :'alice_acct' || $$', ARRAY['a-v5'], '{"status":"posted"}')$$,
  'unposted, cancelled or completed', 'bulk edit cannot set posted');
SELECT tests.fails($$SELECT bulk_update_vouchers('$$ || :'alice_acct' || $$', ARRAY['a-v5'], '{"batch_id":"x"}')$$,
  'cannot be bulk edited', 'bulk edit cannot touch batch_id');

-- Deposits -----------------------------------------------------------------
SELECT tests.fails($$SELECT create_deposit('$$ || :'alice_acct' || $$', '{"bank_id":"a-bank","voucher_company_id":"a-co1","amount_banked":"1"}', ARRAY['a-v5'])$$,
  'no longer available', 'an unposted voucher cannot be banked');
SELECT tests.fails($$SELECT create_deposit('$$ || :'alice_acct' || $$', '{"bank_id":"b-bank","voucher_company_id":"a-co1","amount_banked":"1"}', ARRAY['a-v1'])$$,
  'does not belong', 'a deposit cannot use another account''s bank');

SELECT create_deposit(:'alice_acct', '{"bank_id":"a-bank","voucher_company_id":"a-co1","amount_banked":"21"}', ARRAY['a-v1','a-v4']) AS dep1 \gset
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE deposit_id = :'dep1' AND status = 'deposited') = 2, 'deposit banks its vouchers');
SELECT tests.fails($$SELECT save_batch('$$ || :'alice_acct' || $$', '$$ || :'batch1' || $$', '{}', ARRAY['a-v1'])$$,
  'banked vouchers', 'a batch with banked vouchers cannot be edited');
SELECT tests.fails($$SELECT delete_batch('$$ || :'batch1' || $$')$$, 'banked vouchers', 'a batch with banked vouchers cannot be deleted');

SELECT create_deposit(:'alice_acct', '{"bank_id":"a-bank","recipient_name_id":"a-name","amount_banked":"12"}', ARRAY['a-v2','a-v3']) AS dep2 \gset
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE deposit_id = :'dep2') = 2, 'a person deposit banks that person''s vouchers');

SELECT update_deposit(:'dep1', '{"amount_banked":"20","adjustment_amount":"-1","adjustment_reason":"Bank fee","notes":"n"}');
SELECT tests.ok((SELECT amount_banked = 20 AND adjustment_amount = -1 AND adjustment_reason = 'Bank fee' FROM deposits WHERE id = :'dep1'),
  'deposit edit stores the adjustment');

SELECT remove_deposit_voucher(:'dep1', 'a-v4');
SELECT tests.ok((SELECT status FROM vouchers WHERE id = 'a-v4') = 'posted', 'a voucher removed from a deposit is posted again');
SELECT add_deposit_vouchers(:'dep1', ARRAY['a-v4']);
SELECT tests.ok((SELECT deposit_id FROM vouchers WHERE id = 'a-v4') = :'dep1', 'vouchers can be added to a deposit');

SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);
SELECT tests.fails($$SELECT delete_deposit('$$ || :'dep1' || $$')$$, 'not allowed', 'Bob cannot delete Alice''s deposit');
SELECT tests.fails($$SELECT update_deposit('$$ || :'dep1' || $$', '{"amount_banked":"0"}')$$, 'not allowed', 'Bob cannot edit Alice''s deposit');
SELECT tests.fails($$SELECT set_batch_status('$$ || :'batch1' || $$', 'sent')$$, 'not allowed', 'Bob cannot change Alice''s batch');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);

SELECT delete_deposit(:'dep1');
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE id IN ('a-v1','a-v4') AND status = 'posted' AND deposit_id IS NULL) = 2,
  'deleting a deposit returns its vouchers to posted');
SELECT delete_batch(:'batch1');
SELECT tests.ok((SELECT count(*) FROM vouchers WHERE id IN ('a-v1','a-v4') AND status = 'unposted' AND batch_id IS NULL) = 2,
  'deleting a batch returns its vouchers to unposted');

-- Roles --------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', false);
SELECT tests.ok((SELECT count(*) FROM banks WHERE account_id = :'alice_acct') = 1, 'a plain user can read banks');
SELECT tests.ok(tests.rows($$UPDATE banks SET account_number = '666' WHERE id = 'a-bank'$$) = 0, 'a plain user cannot change bank details');
SELECT tests.fails($$INSERT INTO banks (account_id, name) VALUES ('$$ || :'alice_acct' || $$', 'Mine')$$, 'row-level security', 'a plain user cannot add a bank');
SELECT tests.ok(tests.rows($$UPDATE company_settings SET business_name = 'x' WHERE account_id = '$$ || :'alice_acct' || $$'$$) = 0,
  'a plain user cannot change business settings');
SELECT tests.ok((SELECT count(*) FROM account_members(:'alice_acct')) = 2, 'members can list their account''s people');
SELECT tests.fails($$SELECT set_member_role('$$ || :'alice_acct' || $$', 'c0000000-0000-0000-0000-00000000000c', 'owner')$$,
  'only an owner', 'a plain user cannot promote themselves');
INSERT INTO vouchers (id, account_id, voucher_company_id, amount) VALUES ('c-v1', :'alice_acct', 'a-co1', 4);
SELECT tests.ok(true, 'a plain user can record vouchers');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT tests.fails($$UPDATE account_users SET role = 'admin' WHERE user_id = 'c0000000-0000-0000-0000-00000000000c'$$,
  'permission denied', 'roles cannot be changed by a direct update');
SELECT tests.fails($$SELECT set_member_role('$$ || :'alice_acct' || $$', 'a0000000-0000-0000-0000-00000000000a', 'admin')$$,
  'at least one owner', 'the last owner cannot be demoted');
SELECT tests.fails($$DELETE FROM account_users WHERE user_id = 'a0000000-0000-0000-0000-00000000000a' AND account_id = '$$ || :'alice_acct' || $$'$$,
  'at least one owner', 'the last owner cannot be removed');
SELECT set_member_role(:'alice_acct', 'c0000000-0000-0000-0000-00000000000c', 'admin');
SELECT tests.ok((SELECT role FROM account_members(:'alice_acct') WHERE id = 'c0000000-0000-0000-0000-00000000000c') = 'admin', 'an owner can change roles');

SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', false);
SELECT tests.ok(tests.rows($$UPDATE banks SET account_number = '123' WHERE id = 'a-bank'$$) = 1, 'an admin can change bank details');
-- Carol belongs to two accounts; rows still cannot be moved between them.
SELECT tests.fails($$UPDATE vouchers SET account_id = '$$ || :'carol_acct' || $$' WHERE id = 'c-v1'$$,
  'another account', 'a voucher cannot be moved to another account');

-- Signed-out visitors see nothing ------------------------------------------
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT tests.fails('SELECT count(*) FROM vouchers', 'permission denied', 'anonymous visitors cannot read vouchers');
SELECT tests.fails($$SELECT save_batch('$$ || :'alice_acct' || $$', NULL, '{}', ARRAY['a-v5'])$$, 'permission denied', 'anonymous visitors cannot call functions');
RESET ROLE;

\echo 'All security tests passed.'
