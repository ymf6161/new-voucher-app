/*
  # Remove 'received' batch status

  1. Data cleanup
    - Convert any existing batches with status='received' to status='sent'

  2. Purpose
    - Align database values with app behavior after removing the 'received' option
*/

UPDATE batches
SET status = 'sent'
WHERE status = 'received';
