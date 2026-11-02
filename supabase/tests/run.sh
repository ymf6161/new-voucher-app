#!/usr/bin/env bash
# Runs the database security tests on a throwaway local Postgres database.
#
#   supabase/tests/run.sh                 # uses PG* env vars / local defaults
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
#
# It creates (and drops) a database called voucherflow_test, applies a stub of
# Supabase's auth schema, every migration in order, then security_test.sql.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-voucherflow_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
trap '"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT

"${PSQL[@]}" -d "$DB" -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" 2>&1 | { grep -v NOTICE || true; }
done
"${PSQL[@]}" -d "$DB" -f supabase/tests/security_test.sql 2>&1 | sed -n 's/^.*NOTICE:  //p; /FAILED\|ERROR\|passed/p'
