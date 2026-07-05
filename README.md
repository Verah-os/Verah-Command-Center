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
- `services`: external integrations
- `hooks`: client hooks
- `types`: shared types
- `lib`: utilities and configuration
