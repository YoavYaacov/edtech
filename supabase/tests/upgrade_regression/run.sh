#!/bin/bash
# Upgrade regression: Production-shaped data at migration 20260929000100 -> apply the new migrations
# -> the historical snapshots must be byte-identical and old behaviour must be preserved.
# Usage:  PSQL="psql -q -v ON_ERROR_STOP=1 -d <empty db with the Supabase stub>" ./run.sh
# (the caller has already applied migrations up to 20260929000100)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; MIG="$HERE/../../migrations"
: "${PSQL:?set PSQL}"
$PSQL < "$HERE/seed_legacy.sql" >/dev/null
$PSQL < "$HERE/publish_legacy.sql" >/dev/null
$PSQL -A -F' ' -t < "$HERE/fingerprint.sql" > /tmp/fp_before.txt
for f in 20260930000100 20260930000200 20260930000300 20260930000400 20261001000100 20261002000100; do
  $PSQL < "$MIG/${f}_"*.sql >/dev/null
done
$PSQL -A -F' ' -t < "$HERE/fingerprint.sql" > /tmp/fp_after.txt
if diff /tmp/fp_before.txt /tmp/fp_after.txt >/dev/null; then echo "PASS fingerprints identical before/after the upgrade"; cat /tmp/fp_after.txt | sed 's/^/   /'; else echo "FAIL fingerprints differ"; diff /tmp/fp_before.txt /tmp/fp_after.txt; exit 1; fi
$PSQL < "$HERE/check_after.sql"
