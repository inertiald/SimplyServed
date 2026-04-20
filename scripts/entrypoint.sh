#!/bin/sh
# SimplyServed entrypoint: wait for postgres, push schema, seed if empty, then exec.
set -e

echo "▶ SimplyServed starting…"

# 1. Apply schema (idempotent — uses prisma db push).
echo "▶ Applying database schema…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss || {
  echo "✖ Failed to push schema (will retry on next start)"
}

# 2. Seed only if the database has no users yet (one-time bootstrap).
USER_COUNT=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.count().then(n => { console.log(n); return p.\$disconnect(); }).catch(() => { console.log(0); process.exit(0); });
" 2>/dev/null || echo "0")

if [ "${USER_COUNT}" = "0" ]; then
  echo "▶ Seeding demo data…"
  node node_modules/tsx/dist/cli.mjs prisma/seed.ts || echo "✖ Seed failed (continuing)"
else
  echo "▶ Database already has data (${USER_COUNT} users). Skipping seed."
fi

echo "▶ Launching Next.js…"
exec "$@"
