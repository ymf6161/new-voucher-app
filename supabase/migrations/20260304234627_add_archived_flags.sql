/*
  # Add archived flags to master data tables

  1. Changes
    - Add `is_archived` column (boolean, default false) to voucher_companies, names, references, and banks
    - Add `archived_at` column (timestamptz, nullable) to voucher_companies, names, references, and banks
  
  2. Purpose
    - Enable soft delete functionality for master data tables
    - Allow users to archive/restore entities instead of hard deleting them
    - Preserve referential integrity by keeping archived entities in database
  
  3. Notes
    - All existing records will have is_archived=false by default
    - archived_at is set when is_archived becomes true
    - Archived entities can be filtered out in queries using WHERE is_archived = false
*/

ALTER TABLE voucher_companies ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE voucher_companies ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE names ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE names ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE "references" ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE "references" ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE banks ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE banks ADD COLUMN IF NOT EXISTS archived_at timestamptz;