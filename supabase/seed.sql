insert into public.work_orders (
  id,
  title,
  description,
  category,
  status,
  priority,
  owner,
  origin,
  created_at,
  updated_at
)
values
  (
    'WO-008',
    'Work Orders Foundation',
    'Implementar a fundacao operacional do modulo de Work Orders do VERAH Command Center.',
    'Product Operations',
    'In Progress',
    'High',
    'Ethan',
    'Manual',
    '2026-07-09 00:00:00+00',
    '2026-07-09 00:00:00+00'
  ),
  (
    'WO-CENTER-001',
    'GitHub Dashboard Card',
    'Transformar o card GitHub do Dashboard em dado real usando a GitHub API.',
    'Integration',
    'Done',
    'High',
    'Codex',
    'Manual',
    '2026-07-07 00:00:00+00',
    '2026-07-08 00:00:00+00'
  ),
  (
    'WO-CENTER-002',
    'GitHub Diagnostics',
    'Melhorar logs de diagnostico para falhas ao consultar a GitHub API.',
    'Observability',
    'Review',
    'Medium',
    'Codex',
    'Manual',
    '2026-07-08 00:00:00+00',
    '2026-07-08 00:00:00+00'
  ),
  (
    'WO-AIOS-003',
    'Dispatcher Operating System',
    'Preparar workflows do Dispatcher para roteamento, reviews e sincronizacao do Atlas.',
    'Automation',
    'Backlog',
    'Critical',
    'Xavier',
    'Dispatcher',
    '2026-07-05 00:00:00+00',
    '2026-07-05 00:00:00+00'
  ),
  (
    'WO-DEPLOY-003',
    'Auth Dashboard Flow',
    'Concluir o fluxo autenticado inicial do VERAH Command Center.',
    'Deployment',
    'Done',
    'High',
    'Codex',
    'GitHub',
    '2026-07-07 00:00:00+00',
    '2026-07-07 00:00:00+00'
  ),
  (
    'WO-OPS-001',
    'Partner Onboarding Review',
    'Mapear requisitos operacionais para cadastro de parceiros da rede VERAH.',
    'Operations',
    'Blocked',
    'Medium',
    'Claude',
    'AI',
    '2026-07-04 00:00:00+00',
    '2026-07-06 00:00:00+00'
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  priority = excluded.priority,
  owner = excluded.owner,
  origin = excluded.origin,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
