/*
  # Multi-Tenant Support Migration

  ## Overview
  Adds multi-tenant functionality allowing:
  - Users to belong to multiple accounts
  - Each account to have multiple users with different roles
  - All data to be scoped to specific accounts

  ## New Tables

  ###

 `accounts`
  - `id` (uuid, primary key)
  - `name` (text) - Account/organization name
  - `slug` (text, unique) - URL-friendly identifier
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `account_users`
  - `id` (uuid, primary key)
  - `account_id` (uuid, foreign key to accounts)
  - `user_id` (uuid, foreign key to auth.users)
  - `role` (text) - user role within this account (owner, admin, user)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - Unique constraint on (account_id, user_id)

  ## Changes to Existing Tables

  All data tables now include:
  - `account_id` (uuid, foreign key to accounts) - Required for all data

  Modified tables:
  - voucher_companies
  - names
  - references
  - banks
  - vouchers
  - batches
  - deposits
  - company_settings

  ## Security

  - Enable RLS on all new tables
  - Update RLS policies to be account-scoped
  - Users can only access data for accounts they belong to
  - Account owners can manage users
*/

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create account_users junction table
CREATE TABLE IF NOT EXISTS account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, user_id)
);

-- Add account_id to existing tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_companies' AND column_name = 'account_id') THEN
    ALTER TABLE voucher_companies ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'names' AND column_name = 'account_id') THEN
    ALTER TABLE names ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'references' AND column_name = 'account_id') THEN
    ALTER TABLE "references" ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'banks' AND column_name = 'account_id') THEN
    ALTER TABLE banks ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name = 'account_id') THEN
    ALTER TABLE vouchers ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'account_id') THEN
    ALTER TABLE batches ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'account_id') THEN
    ALTER TABLE deposits ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'account_id') THEN
    ALTER TABLE company_settings ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'current_account_id') THEN
    ALTER TABLE users ADD COLUMN current_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create default account and migrate existing data
DO $$
DECLARE
  default_account_id uuid;
BEGIN
  SELECT id INTO default_account_id FROM accounts WHERE slug = 'default' LIMIT 1;
  IF default_account_id IS NULL THEN
    INSERT INTO accounts (name, slug) VALUES ('Default Account', 'default') RETURNING id INTO default_account_id;
  END IF;
  
  INSERT INTO account_users (account_id, user_id, role)
  SELECT default_account_id, id, 'owner' FROM auth.users
  ON CONFLICT (account_id, user_id) DO NOTHING;
  
  UPDATE users SET current_account_id = default_account_id WHERE current_account_id IS NULL;
  UPDATE voucher_companies SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE names SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE "references" SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE banks SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE vouchers SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE batches SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE deposits SET account_id = default_account_id WHERE account_id IS NULL;
  UPDATE company_settings SET account_id = default_account_id WHERE account_id IS NULL;
END $$;

-- Make account_id NOT NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voucher_companies' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE voucher_companies ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'names' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE names ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'references' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE "references" ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'banks' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE banks ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vouchers' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE vouchers ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'batches' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE batches ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposits' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE deposits ALTER COLUMN account_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_settings' AND column_name = 'account_id' AND is_nullable = 'YES') THEN
    ALTER TABLE company_settings ALTER COLUMN account_id SET NOT NULL;
  END IF;
END $$;

-- Add unique constraint for company_settings per account
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_account_id_key') THEN
    ALTER TABLE company_settings ADD CONSTRAINT company_settings_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts
DROP POLICY IF EXISTS "Users can view their accounts" ON accounts;
CREATE POLICY "Users can view their accounts" ON accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = accounts.id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Account owners can update their accounts" ON accounts;
CREATE POLICY "Account owners can update their accounts" ON accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = accounts.id AND account_users.user_id = auth.uid() AND account_users.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = accounts.id AND account_users.user_id = auth.uid() AND account_users.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "Account owners can create accounts" ON accounts;
CREATE POLICY "Account owners can create accounts" ON accounts FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for account_users
DROP POLICY IF EXISTS "Users can view account memberships" ON account_users;
CREATE POLICY "Users can view account memberships" ON account_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM account_users au WHERE au.account_id = account_users.account_id AND au.user_id = auth.uid() AND au.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "Account owners can manage users" ON account_users;
CREATE POLICY "Account owners can manage users" ON account_users FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users au WHERE au.account_id = account_users.account_id AND au.user_id = auth.uid() AND au.role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM account_users au WHERE au.account_id = account_users.account_id AND au.user_id = auth.uid() AND au.role IN ('owner', 'admin')));

-- Update RLS policies for data tables
DROP POLICY IF EXISTS "Users can view voucher companies" ON voucher_companies;
CREATE POLICY "Users can view voucher companies" ON voucher_companies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = voucher_companies.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert voucher companies" ON voucher_companies;
CREATE POLICY "Users can insert voucher companies" ON voucher_companies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = voucher_companies.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update voucher companies" ON voucher_companies;
CREATE POLICY "Users can update voucher companies" ON voucher_companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = voucher_companies.account_id AND account_users.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = voucher_companies.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete voucher companies" ON voucher_companies;
CREATE POLICY "Users can delete voucher companies" ON voucher_companies FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = voucher_companies.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view names" ON names;
CREATE POLICY "Users can view names" ON names FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = names.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert names" ON names;
CREATE POLICY "Users can insert names" ON names FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = names.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update names" ON names;
CREATE POLICY "Users can update names" ON names FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = names.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete names" ON names;
CREATE POLICY "Users can delete names" ON names FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = names.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view references" ON "references";
CREATE POLICY "Users can view references" ON "references" FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = "references".account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert references" ON "references";
CREATE POLICY "Users can insert references" ON "references" FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = "references".account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update references" ON "references";
CREATE POLICY "Users can update references" ON "references" FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = "references".account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete references" ON "references";
CREATE POLICY "Users can delete references" ON "references" FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = "references".account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view banks" ON banks;
CREATE POLICY "Users can view banks" ON banks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = banks.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert banks" ON banks;
CREATE POLICY "Users can insert banks" ON banks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = banks.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update banks" ON banks;
CREATE POLICY "Users can update banks" ON banks FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = banks.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete banks" ON banks;
CREATE POLICY "Users can delete banks" ON banks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = banks.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view vouchers" ON vouchers;
CREATE POLICY "Users can view vouchers" ON vouchers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = vouchers.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert vouchers" ON vouchers;
CREATE POLICY "Users can insert vouchers" ON vouchers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = vouchers.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update vouchers" ON vouchers;
CREATE POLICY "Users can update vouchers" ON vouchers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = vouchers.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete vouchers" ON vouchers;
CREATE POLICY "Users can delete vouchers" ON vouchers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = vouchers.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view batches" ON batches;
CREATE POLICY "Users can view batches" ON batches FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = batches.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert batches" ON batches;
CREATE POLICY "Users can insert batches" ON batches FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = batches.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update batches" ON batches;
CREATE POLICY "Users can update batches" ON batches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = batches.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete batches" ON batches;
CREATE POLICY "Users can delete batches" ON batches FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = batches.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view deposits" ON deposits;
CREATE POLICY "Users can view deposits" ON deposits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = deposits.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert deposits" ON deposits;
CREATE POLICY "Users can insert deposits" ON deposits FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = deposits.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update deposits" ON deposits;
CREATE POLICY "Users can update deposits" ON deposits FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = deposits.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete deposits" ON deposits;
CREATE POLICY "Users can delete deposits" ON deposits FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = deposits.account_id AND account_users.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view company settings" ON company_settings;
CREATE POLICY "Users can view company settings" ON company_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = company_settings.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert company settings" ON company_settings;
CREATE POLICY "Users can insert company settings" ON company_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = company_settings.account_id AND account_users.user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update company settings" ON company_settings;
CREATE POLICY "Users can update company settings" ON company_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM account_users WHERE account_users.account_id = company_settings.account_id AND account_users.user_id = auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_users_account_id ON account_users(account_id);
CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_companies_account_id ON voucher_companies(account_id);
CREATE INDEX IF NOT EXISTS idx_names_account_id ON names(account_id);
CREATE INDEX IF NOT EXISTS idx_references_account_id ON "references"(account_id);
CREATE INDEX IF NOT EXISTS idx_banks_account_id ON banks(account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_account_id ON vouchers(account_id);
CREATE INDEX IF NOT EXISTS idx_batches_account_id ON batches(account_id);
CREATE INDEX IF NOT EXISTS idx_deposits_account_id ON deposits(account_id);
CREATE INDEX IF NOT EXISTS idx_company_settings_account_id ON company_settings(account_id);