# Deposit Tracker

Voucher management frontend for recording received vouchers, grouping them into batches, recording deposits, and producing reports and remittance PDFs.

## Run The Frontend

This project currently runs as a standalone React/Vite frontend. No `.env` file, API server, or database is needed for the local preview.

```bash
npm install
npm run dev
npm run check
npm run build
npm run preview
```

Vite serves the app at `http://localhost:5173`. The production build is written to `dist/public`.

Sign in with any email and password to open the preview. It uses seeded sample data stored in this browser's local storage; it is not real authentication, shared storage, or production persistence.

## Bolt.new Handoff

The React screens and workflows are the importable frontend. The current data boundary is `client/src/lib/queryClient.ts`; it routes requests to `client/src/lib/demo-store.ts` for the local preview. Replace that demo adapter and the demo auth in `client/src/hooks/use-auth.ts` with Bolt's database and authentication integration while keeping the existing screens and domain types.

Use `shared/schema.ts` as the current domain-shape reference. The SQL under `supabase/migrations/` is legacy schema history, not a configured database; review it before using any of it. Do not reuse credentials from an existing deployment.

This repository contains no API server or configured production database. The historical SQL in `supabase/migrations/` is reference material only. Let Bolt create and own the production database, authentication, and server before using real user data.
