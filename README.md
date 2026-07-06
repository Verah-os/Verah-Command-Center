# VERAH Command Center

Operational command center for VERAH OS.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-compatible primitives
- Supabase Auth
- GitHub API
- n8n Webhooks

## Local Setup

```bash
npm install
npm run dev
```

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GITHUB_TOKEN=
GITHUB_OWNER=Verah-os
N8N_DISPATCHER_WEBHOOK_URL=
```

## Architecture

- `app`: routes and route states
- `components`: shared shell and UI
- `modules`: product modules
- `hooks`: client hooks
- `types`: shared types
- `lib`: utilities, configuration and external integration clients

## Vercel Deploy

Deploy this repository as a single Next.js application.

Use the default Vercel Next.js preset:

- Framework Preset: `Next.js`
- Root Directory: repository root
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: leave empty/default

Required Vercel environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GITHUB_TOKEN=
GITHUB_OWNER=Verah-os
N8N_DISPATCHER_WEBHOOK_URL=
```

All external integration clients live under `lib/` so Vercel treats the repository as one Next.js app.
