/*
  # Create User Trigger for Auth

  1. New Functions
    - `handle_new_user()` - Trigger function to create user record on signup
  
  2. Changes
    - Creates a trigger that automatically creates a user record in public.users
      when a new user signs up via Supabase Auth
  
  3. Security
    - Function runs with security definer privileges
    - Automatically creates user record with proper defaults
*/

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id::varchar,
    NEW.email,
    'user',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user record on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
