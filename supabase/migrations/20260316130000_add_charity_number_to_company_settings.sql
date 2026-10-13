-- Add registered charity number to business settings
ALTER TABLE company_settings
ADD COLUMN IF NOT EXISTS charity_number text;