/*
# Auto-create account on signup

## Overview
When a new user signs up via Supabase Auth, the existing trigger creates a row in
`public.users`. This migration extends that trigger to also:
1. Create a personal account (named after the user's email prefix).
2. Link the user to that account as owner via `account_users`.
3. Set `current_account_id` on the user row.
4. Create a default `company_settings` row for the account.

This ensures every new user immediately has an account they own, so RLS policies
that check `is_account_member(account_id)` will work from the first login.

## Changes
- Replaces `handle_new_user()` trigger function with expanded version.
- Drops and recreates the `on_auth_user_created` trigger.
- Adds an `account_id` column default of `auth.uid()`-derived account to all data
  tables — NO, instead the frontend will pass `account_id` explicitly from the
  current user's session. We do NOT add a default because there is no single
  "current account" at the DB level.

## Security
- `handle_new_user()` runs as SECURITY DEFINER (elevated privileges) to insert
  into `accounts`, `account_users`, and `company_settings`.
- Search path set to `public` to prevent schema injection.
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
