/*
  # Fix handle_new_user trigger - missing slug on account insert

  ## Problem
  The handle_new_user trigger inserts into accounts without providing the required
  `slug` column (which has a UNIQUE NOT NULL constraint), causing user registration
  to fail with a database error.

  ## Fix
  Update the trigger function to generate a unique slug from the user's email +
  a short random suffix to satisfy the NOT NULL UNIQUE constraint.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_account_id uuid;
  base_slug text;
  final_slug text;
BEGIN
  -- Build a slug from the email local-part, stripping non-alphanumeric chars,
  -- then append a random suffix to guarantee uniqueness.
  base_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g'));
  final_slug := base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Create a new account for the user
  INSERT INTO accounts (name, slug)
  VALUES (NEW.email || '''s Account', final_slug)
  RETURNING id INTO new_account_id;

  -- Create the user record
  INSERT INTO users (id, email, current_account_id)
  VALUES (NEW.id, NEW.email, new_account_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    current_account_id = EXCLUDED.current_account_id;

  -- Add user as owner of the account
  INSERT INTO account_users (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner')
  ON CONFLICT (account_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recreate the trigger to ensure it points to the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
