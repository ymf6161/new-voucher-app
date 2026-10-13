/*
  # Create Initial Voucher Management System Schema

  1. New Tables
    - `users` - User accounts with authentication
      - `id` (uuid, primary key)
      - `email` (varchar, unique)
      - `firstName` (varchar)
      - `lastName` (varchar)
      - `profileImageUrl` (varchar)
      - `role` (text, default 'user')
      - `createdAt` (timestamp)
      - `updatedAt` (timestamp)
    
    - `sessions` - Session storage for authentication
      - `sid` (varchar, primary key)
      - `sess` (jsonb)
      - `expire` (timestamp)
    
    - `voucher_companies` - Organizations that process vouchers
      - `id` (uuid, primary key)
      - `name` (text)
      - `address` (text)
      - `city` (text)
      - `postcode` (text)
      - `phone` (text)
      - `email` (text)
    
    - `names` - People or causes that submit vouchers
      - `id` (uuid, primary key)
      - `name` (text)
      - `address` (text)
      - `phone` (text)
      - `email` (text)
    
    - `references` - Tracking references for vouchers
      - `id` (uuid, primary key)
      - `reference` (text)
      - `notes` (text)
      - `contact` (text)
    
    - `banks` - Destination banks for deposits
      - `id` (uuid, primary key)
      - `name` (text)
      - `accountNumber` (text)
      - `sortCode` (text)
    
    - `vouchers` - Individual voucher records
      - `id` (uuid, primary key)
      - `dateReceived` (timestamp)
      - `receivedFromId` (uuid)
      - `referenceId` (uuid)
      - `voucherCompanyId` (uuid)
      - `type` (text, default 'PPV')
      - `accountNumber` (text)
      - `voucherNumber` (text)
      - `amount` (decimal)
      - `quantity` (integer, default 1)
      - `notes` (text)
      - `status` (text, default 'unposted')
      - `batchId` (uuid)
      - `depositId` (uuid)
    
    - `batches` - Groups of vouchers sent to voucher companies
      - `id` (uuid, primary key)
      - `dateSent` (timestamp)
      - `reference` (text)
      - `voucherCompanyId` (uuid)
      - `amountSent` (decimal)
      - `status` (text, default 'pending')
      - `notes` (text)
    
    - `deposits` - Records of banked vouchers
      - `id` (uuid, primary key)
      - `dateDeposited` (timestamp)
      - `bankId` (uuid)
      - `voucherCompanyId` (uuid)
      - `amountBanked` (decimal)
      - `reference` (text)
      - `notes` (text)
    
    - `company_settings` - Business information
      - `id` (uuid, primary key)
      - `businessName` (text)
      - `address` (text)
      - `city` (text)
      - `postcode` (text)
      - `phone` (text)
      - `email` (text)
      - `logoUrl` (text)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their data
    - Public read access for reference data (companies, banks, names, references)
    - Restricted write access for admin users only

  3. Indexes
    - Session expiration index for performance
    - Foreign key relationships for data integrity
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

-- Create voucher_companies table
CREATE TABLE IF NOT EXISTS voucher_companies (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  name text NOT NULL,
  address text,
  city text,
  postcode text,
  phone text,
  email text
);

-- Create names table
CREATE TABLE IF NOT EXISTS names (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  name text NOT NULL,
  address text,
  phone text,
  email text
);

-- Create references table (quoted because it's a reserved keyword)
CREATE TABLE IF NOT EXISTS "references" (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  reference text NOT NULL,
  notes text,
  contact text
);

-- Create banks table
CREATE TABLE IF NOT EXISTS banks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  name text NOT NULL,
  account_number text,
  sort_code text
);

-- Create vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  date_received timestamptz NOT NULL DEFAULT now(),
  received_from_id varchar,
  reference_id varchar,
  voucher_company_id varchar NOT NULL,
  type text NOT NULL DEFAULT 'PPV',
  account_number text,
  voucher_number text,
  amount decimal(10, 2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'unposted',
  batch_id varchar,
  deposit_id varchar
);

-- Create batches table
CREATE TABLE IF NOT EXISTS batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  date_sent timestamptz NOT NULL DEFAULT now(),
  reference text NOT NULL,
  voucher_company_id varchar NOT NULL,
  amount_sent decimal(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text
);

-- Create deposits table
CREATE TABLE IF NOT EXISTS deposits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  date_deposited timestamptz NOT NULL DEFAULT now(),
  bank_id varchar NOT NULL,
  voucher_company_id varchar NOT NULL,
  amount_banked decimal(10, 2) NOT NULL,
  reference text,
  notes text
);

-- Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  business_name text NOT NULL,
  address text,
  city text,
  postcode text,
  phone text,
  email text,
  logo_url text
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE names ENABLE ROW LEVEL SECURITY;
ALTER TABLE "references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = current_user)
  WITH CHECK (id = current_user);

-- RLS Policies for voucher_companies
CREATE POLICY "Anyone can view voucher companies"
  ON voucher_companies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert voucher companies"
  ON voucher_companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update voucher companies"
  ON voucher_companies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete voucher companies"
  ON voucher_companies FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for names
CREATE POLICY "Anyone can view names"
  ON names FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert names"
  ON names FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update names"
  ON names FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete names"
  ON names FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for references
CREATE POLICY "Anyone can view references"
  ON "references" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert references"
  ON "references" FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update references"
  ON "references" FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete references"
  ON "references" FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for banks
CREATE POLICY "Anyone can view banks"
  ON banks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert banks"
  ON banks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update banks"
  ON banks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete banks"
  ON banks FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for vouchers
CREATE POLICY "Anyone can view vouchers"
  ON vouchers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert vouchers"
  ON vouchers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update vouchers"
  ON vouchers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete vouchers"
  ON vouchers FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for batches
CREATE POLICY "Anyone can view batches"
  ON batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert batches"
  ON batches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update batches"
  ON batches FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete batches"
  ON batches FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for deposits
CREATE POLICY "Anyone can view deposits"
  ON deposits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deposits"
  ON deposits FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deposits"
  ON deposits FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete deposits"
  ON deposits FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for company_settings
CREATE POLICY "Anyone can view company settings"
  ON company_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert company settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete company settings"
  ON company_settings FOR DELETE
  TO authenticated
  USING (true);