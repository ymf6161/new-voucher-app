/*
  # Add batch date and bank account fields

  1. Changes
    - Add `batch_date` column (date, not null, default to current date) to batches table
    - Add `bank_id` column (varchar, nullable, foreign key to banks) to batches table
  
  2. Purpose
    - Allow users to specify the date when creating a batch
    - Link batches to specific bank accounts for payment remittance
  
  3. Notes
    - batch_date defaults to current date for backward compatibility
    - bank_id is optional to allow batches without specific bank details
*/

ALTER TABLE batches ADD COLUMN IF NOT EXISTS batch_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bank_id varchar REFERENCES banks(id);

CREATE INDEX IF NOT EXISTS idx_batches_bank_id ON batches(bank_id);