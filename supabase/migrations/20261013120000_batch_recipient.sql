/*
  # Post vouchers to a person, across several voucher companies

  A batch (and the deposit that banks it) can now be sent to a person from the
  Names list instead of a single voucher company. Such a batch may hold
  vouchers from several companies, so its voucher company becomes optional.

  1. Changes
    - `batches.recipient_name_id`  (varchar, nullable, references names)
    - `deposits.recipient_name_id` (varchar, nullable, references names)
    - `batches.voucher_company_id` and `deposits.voucher_company_id` become nullable
    - Each row must still name a company or a recipient
*/

ALTER TABLE batches ADD COLUMN IF NOT EXISTS recipient_name_id varchar REFERENCES names(id);
ALTER TABLE batches ALTER COLUMN voucher_company_id DROP NOT NULL;

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS recipient_name_id varchar REFERENCES names(id);
ALTER TABLE deposits ALTER COLUMN voucher_company_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_company_or_recipient') THEN
    ALTER TABLE batches ADD CONSTRAINT batches_company_or_recipient
      CHECK (voucher_company_id IS NOT NULL OR recipient_name_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposits_company_or_recipient') THEN
    ALTER TABLE deposits ADD CONSTRAINT deposits_company_or_recipient
      CHECK (voucher_company_id IS NOT NULL OR recipient_name_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_batches_recipient_name_id ON batches(recipient_name_id);
CREATE INDEX IF NOT EXISTS idx_deposits_recipient_name_id ON deposits(recipient_name_id);
