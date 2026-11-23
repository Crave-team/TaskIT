#!/bin/bash
# Runs every browser scenario against a running preview build (http://127.0.0.1:4173).
#   npm run build && npx vite preview --port 4173 --host 127.0.0.1 &
#   pip install playwright && playwright install chromium
cd "$(dirname "$0")"; : > results.jsonl
for s in s1_public_auth s2_workspace s3_dashboard_settings s4_calendar s5_team s6_admin s7_responsive s8_robustness; do
  python3 $s.py | grep -E "FAIL|^=="
done
