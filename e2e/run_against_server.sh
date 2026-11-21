#!/bin/bash
# Runs every browser scenario against the REAL stack (Express + MongoDB). Needs a MongoDB reachable at MONGODB_URI
# (use a dedicated, disposable database: it is wiped between scenarios) and `VITE_API_URL=/api npm run build` done first.
#   MONGODB_URI=mongodb://127.0.0.1:27017/taskit_e2e ./e2e/run_against_server.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_ENV=test PORT=4173 STATIC_DIR="$ROOT/dist" E2E_RESET=1
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/taskit_e2e}"
export UPLOAD_DIR="$(mktemp -d)"
start() { node "$ROOT/server/src/index.js" > /tmp/taskit_e2e_server.log 2>&1 & SPID=$!; for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:4173/api/health && break; sleep 0.5; done; }
start
cd "$ROOT/e2e"; : > results.jsonl
for s in s1_public_auth s2_workspace s3_dashboard_settings s4_calendar s5_team s6_admin s7_responsive s8_robustness; do python3 $s.py | grep -E "FAIL|^=="; done
echo "--- persistence across a full server restart"
python3 s9_persistence_1.py | grep -E "FAIL|^=="
kill $SPID; wait $SPID 2>/dev/null; start
E2E_RESET= python3 s9_persistence_2.py | grep -E "PASS|FAIL|RESULT"
kill $SPID 2>/dev/null
