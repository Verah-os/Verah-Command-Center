create table public.quote_rule_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft',
  description text not null,
  effective_from timestamptz,
  effective_to timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_rule_sets_version_not_blank_check
    check (btrim(version) <> ''),
  constraint quote_rule_sets_status_check
    check (status in ('draft', 'active', 'retired')),
  constraint quote_rule_sets_effective_window_check
    check (effective_to is null or effective_from is null or effective_to > effective_from),
  constraint quote_rule_sets_publication_check check (
    (status = 'draft' and published_at is null)
    or (status in ('active', 'retired') and published_at is not null)
  )
);

create unique index quote_rule_sets_one_active_idx
  on public.quote_rule_sets ((status))
  where status = 'active';

create table public.service_taxonomy_entries (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null
    references public.quote_rule_sets(id) on delete restrict,
  service_code text not null,
  category text not null,
  subcategory text not null,
  service_name text not null,
  service_description text not null,
  entry_type text not null default 'service',
  parent_id uuid references public.service_taxonomy_entries(id) on delete restrict,
  minimum_minutes integer,
  typical_minutes integer,
  maximum_minutes integer,
  complexity text not null default 'medium',
  requires_lift boolean not null default false,
  requires_scanner boolean not null default false,
  requires_special_tool boolean not null default false,
  requires_alignment_after boolean not null default false,
  requires_calibration boolean not null default false,
  curing_minutes integer,
  stock_dependency boolean not null default false,
  dismantling_level text not null default 'none',
  hidden_cost_risk text not null default 'low',
  mobile_service_possible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_taxonomy_entries_code_not_blank_check
    check (btrim(service_code) <> ''),
  constraint service_taxonomy_entries_category_not_blank_check
    check (btrim(category) <> '' and btrim(subcategory) <> ''),
  constraint service_taxonomy_entries_name_not_blank_check
    check (btrim(service_name) <> '' and btrim(service_description) <> ''),
  constraint service_taxonomy_entries_type_check
    check (entry_type in ('service', 'symptom', 'accessory', 'emergency')),
  constraint service_taxonomy_entries_complexity_check
    check (complexity in ('low', 'medium', 'high', 'specialist')),
  constraint service_taxonomy_entries_dismantling_check
    check (dismantling_level in ('none', 'light', 'partial', 'major')),
  constraint service_taxonomy_entries_hidden_cost_check
    check (hidden_cost_risk in ('low', 'medium', 'high')),
  constraint service_taxonomy_entries_labor_time_check check (
    (minimum_minutes is null and typical_minutes is null and maximum_minutes is null)
    or (
      minimum_minutes is not null
      and typical_minutes is not null
      and maximum_minutes is not null
      and minimum_minutes > 0
      and minimum_minutes <= typical_minutes
      and typical_minutes <= maximum_minutes
    )
  ),
  constraint service_taxonomy_entries_curing_time_check
    check (curing_minutes is null or curing_minutes >= 0),
  constraint service_taxonomy_entries_rule_code_key
    unique (rule_set_id, service_code),
  constraint service_taxonomy_entries_id_rule_key
    unique (id, rule_set_id)
);

create index service_taxonomy_entries_category_idx
  on public.service_taxonomy_entries (rule_set_id, category, subcategory)
  where active;

create index service_taxonomy_entries_name_search_idx
  on public.service_taxonomy_entries
  using gin (to_tsvector('simple', service_name || ' ' || service_description));

create table public.service_quoteability_rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null
    references public.quote_rule_sets(id) on delete restrict,
  taxonomy_entry_id uuid not null,
  quote_mode text not null,
  diagnostic_confidence_required text not null default 'unknown',
  comparison_readiness_required text not null default 'not_ready',
  inspection_required boolean not null default false,
  dismantling_may_be_required boolean not null default false,
  second_opinion_allowed boolean not null default true,
  vehicle_movement_policy text not null default 'not_assessed',
  recommended_specialty text not null,
  risk_level text not null default 'low',
  compatibility_required boolean not null default false,
  default_compatibility_status text not null default 'not_applicable',
  commercial_scope text not null default 'service_only',
  product_included boolean,
  installation_included boolean,
  electrical_risk text not null default 'low',
  warranty_risk text not null default 'low',
  sensor_interference_risk text not null default 'low',
  airbag_interference_risk text not null default 'low',
  homologation_required boolean not null default false,
  legal_review_required boolean not null default false,
  requires_human_review boolean not null default true,
  priority integer not null default 100,
  reason_template text not null,
  next_action_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_quoteability_rules_taxonomy_rule_fkey
    foreign key (taxonomy_entry_id, rule_set_id)
    references public.service_taxonomy_entries(id, rule_set_id)
    on delete restrict,
  constraint service_quoteability_rules_mode_check check (quote_mode in (
    'direct_quote', 'inspection_first', 'second_opinion', 'emergency',
    'manual_review', 'direct_accessory_quote',
    'compatibility_check_required', 'inspection_before_installation',
    'installation_only', 'product_and_installation'
  )),
  constraint service_quoteability_rules_diagnostic_confidence_check
    check (diagnostic_confidence_required in ('unknown', 'low', 'medium', 'high', 'confirmed')),
  constraint service_quoteability_rules_comparison_readiness_check
    check (comparison_readiness_required in ('not_ready', 'partially_ready', 'ready', 'blocked')),
  constraint service_quoteability_rules_vehicle_movement_check check (vehicle_movement_policy in (
    'not_assessed', 'do_not_move', 'tow_recommended',
    'movement_requires_human_review', 'inspection_location_required'
  )),
  constraint service_quoteability_rules_risk_check
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint service_quoteability_rules_compatibility_check
    check (default_compatibility_status in ('not_applicable', 'unknown', 'confirmed', 'incompatible')),
  constraint service_quoteability_rules_commercial_scope_check
    check (commercial_scope in ('service_only', 'product_only', 'installation_only', 'product_and_installation', 'undetermined')),
  constraint service_quoteability_rules_accessory_risk_check check (
    electrical_risk in ('low', 'medium', 'high')
    and warranty_risk in ('low', 'medium', 'high')
    and sensor_interference_risk in ('low', 'medium', 'high')
    and airbag_interference_risk in ('low', 'medium', 'high')
  ),
  constraint service_quoteability_rules_human_review_check
    check (requires_human_review is true),
  constraint service_quoteability_rules_priority_check
    check (priority between 1 and 1000),
  constraint service_quoteability_rules_text_check check (
    btrim(recommended_specialty) <> ''
    and btrim(reason_template) <> ''
    and btrim(next_action_template) <> ''
  ),
  constraint service_quoteability_rules_one_per_entry_key
    unique (rule_set_id, taxonomy_entry_id)
);

create index service_quoteability_rules_mode_idx
  on public.service_quoteability_rules (rule_set_id, quote_mode, priority)
  where active;

create index service_quoteability_rules_specialty_idx
  on public.service_quoteability_rules (recommended_specialty)
  where active;

create table public.quote_rule_requirements (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null
    references public.service_quoteability_rules(id) on delete cascade,
  requirement_type text not null,
  requirement_code text not null,
  label text not null,
  required boolean not null default true,
  blocking boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint quote_rule_requirements_type_check check (requirement_type in (
    'vehicle_data', 'service_data', 'product_data', 'question',
    'evidence', 'measurement', 'document', 'comparison_field', 'risk_flag'
  )),
  constraint quote_rule_requirements_code_not_blank_check
    check (btrim(requirement_code) <> '' and btrim(label) <> ''),
  constraint quote_rule_requirements_sort_check
    check (sort_order between 1 and 10000),
  constraint quote_rule_requirements_rule_code_key
    unique (rule_id, requirement_type, requirement_code)
);

create index quote_rule_requirements_rule_type_idx
  on public.quote_rule_requirements (rule_id, requirement_type, sort_order);

create table public.service_taxonomy_related_services (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null
    references public.quote_rule_sets(id) on delete restrict,
  service_id uuid not null,
  related_service_id uuid not null,
  relationship_type text not null default 'frequent',
  reason text not null,
  created_at timestamptz not null default now(),
  constraint service_taxonomy_related_service_fkey
    foreign key (service_id, rule_set_id)
    references public.service_taxonomy_entries(id, rule_set_id)
    on delete cascade,
  constraint service_taxonomy_related_related_fkey
    foreign key (related_service_id, rule_set_id)
    references public.service_taxonomy_entries(id, rule_set_id)
    on delete cascade,
  constraint service_taxonomy_related_type_check
    check (relationship_type in ('frequent', 'conditional', 'prerequisite', 'alternative')),
  constraint service_taxonomy_related_distinct_check
    check (service_id <> related_service_id),
  constraint service_taxonomy_related_reason_check
    check (btrim(reason) <> ''),
  constraint service_taxonomy_related_key
    unique (rule_set_id, service_id, related_service_id, relationship_type)
);

create index service_taxonomy_related_source_idx
  on public.service_taxonomy_related_services (rule_set_id, service_id);

create table public.quote_intelligence_assessments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null
    references public.service_requests(id) on delete restrict,
  intake_assessment_id uuid
    references public.intake_assessments(id) on delete set null,
  taxonomy_entry_id uuid not null
    references public.service_taxonomy_entries(id) on delete restrict,
  rule_id uuid not null
    references public.service_quoteability_rules(id) on delete restrict,
  idempotency_key text not null unique,
  input_fingerprint text not null,
  input_snapshot jsonb not null,
  quote_mode text not null,
  confidence numeric(4,3) not null,
  diagnostic_confidence text not null,
  comparison_readiness text not null,
  risk_level text not null,
  vehicle_movement text not null,
  recommended_specialty text not null,
  required_questions jsonb not null default '[]'::jsonb,
  required_evidence jsonb not null default '[]'::jsonb,
  required_measurements jsonb not null default '[]'::jsonb,
  required_documents jsonb not null default '[]'::jsonb,
  compatibility_status text not null,
  commercial_scope text not null,
  reason text not null,
  next_action text not null,
  requires_human_review boolean not null default true,
  rule_version text not null,
  engine_version text not null default 'quote-intelligence-1.0.0',
  evidence_refs jsonb not null default '[]'::jsonb,
  human_review_status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quote_intelligence_assessments_idempotency_not_blank_check
    check (btrim(idempotency_key) <> '' and char_length(idempotency_key) <= 200),
  constraint quote_intelligence_assessments_fingerprint_check
    check (input_fingerprint ~ '^[0-9a-f]{32}$'),
  constraint quote_intelligence_assessments_input_object_check
    check (jsonb_typeof(input_snapshot) = 'object'),
  constraint quote_intelligence_assessments_arrays_check check (
    jsonb_typeof(required_questions) = 'array'
    and jsonb_typeof(required_evidence) = 'array'
    and jsonb_typeof(required_measurements) = 'array'
    and jsonb_typeof(required_documents) = 'array'
    and jsonb_typeof(evidence_refs) = 'array'
  ),
  constraint quote_intelligence_assessments_mode_check check (quote_mode in (
    'direct_quote', 'inspection_first', 'second_opinion', 'emergency',
    'manual_review', 'direct_accessory_quote',
    'compatibility_check_required', 'inspection_before_installation',
    'installation_only', 'product_and_installation'
  )),
  constraint quote_intelligence_assessments_confidence_check
    check (confidence between 0 and 1),
  constraint quote_intelligence_assessments_diagnostic_check
    check (diagnostic_confidence in ('unknown', 'low', 'medium', 'high', 'confirmed')),
  constraint quote_intelligence_assessments_readiness_check
    check (comparison_readiness in ('not_ready', 'partially_ready', 'ready', 'blocked')),
  constraint quote_intelligence_assessments_risk_check
    check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint quote_intelligence_assessments_movement_check check (vehicle_movement in (
    'not_assessed', 'do_not_move', 'tow_recommended',
    'movement_requires_human_review', 'inspection_location_required'
  )),
  constraint quote_intelligence_assessments_compatibility_check
    check (compatibility_status in ('not_applicable', 'unknown', 'confirmed', 'incompatible')),
  constraint quote_intelligence_assessments_scope_check
    check (commercial_scope in ('service_only', 'product_only', 'installation_only', 'product_and_installation', 'undetermined')),
  constraint quote_intelligence_assessments_human_review_check
    check (requires_human_review is true),
  constraint quote_intelligence_assessments_review_status_check
    check (human_review_status in ('pending', 'reviewed', 'rejected')),
  constraint quote_intelligence_assessments_review_metadata_check check (
    (human_review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (human_review_status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint quote_intelligence_assessments_engine_check
    check (engine_version = 'quote-intelligence-1.0.0')
);

create index quote_intelligence_assessments_request_created_idx
  on public.quote_intelligence_assessments (service_request_id, created_at desc);

create index quote_intelligence_assessments_review_idx
  on public.quote_intelligence_assessments (human_review_status, risk_level, created_at)
  where human_review_status = 'pending';

comment on table public.quote_intelligence_assessments is
  'Append-only deterministic guidance for obtaining a comparable quote. It is not a diagnosis, price, repair authorization, or vehicle safety declaration.';

insert into public.quote_rule_sets (
  version,
  status,
  description,
  effective_from,
  published_at
)
values (
  'quoteability-alpha-1',
  'active',
  'Initial deterministic VERAH quoteability and labor intelligence catalog.',
  now(),
  now()
);

with active_set as (
  select id from public.quote_rule_sets where version = 'quoteability-alpha-1'
), catalog(service_code, category, subcategory, service_name, entry_type) as (
  values
    ('preventive.oil_change', 'manutencao_preventiva', 'lubrificacao', 'Troca de óleo', 'service'),
    ('preventive.oil_filter', 'manutencao_preventiva', 'filtros', 'Filtro de óleo', 'service'),
    ('preventive.air_filter', 'manutencao_preventiva', 'filtros', 'Filtro de ar', 'service'),
    ('preventive.cabin_filter', 'manutencao_preventiva', 'filtros', 'Filtro de cabine', 'service'),
    ('preventive.fuel_filter', 'manutencao_preventiva', 'filtros', 'Filtro de combustível', 'service'),
    ('preventive.brake_fluid', 'manutencao_preventiva', 'fluidos', 'Troca de fluido de freio', 'service'),
    ('preventive.coolant', 'manutencao_preventiva', 'fluidos', 'Troca de fluido de arrefecimento', 'service'),
    ('preventive.spark_plugs', 'manutencao_preventiva', 'ignicao', 'Troca de velas', 'service'),
    ('preventive.known_belt', 'manutencao_preventiva', 'correias', 'Troca de correia com especificação conhecida', 'service'),
    ('preventive.mileage_service', 'manutencao_preventiva', 'revisao', 'Revisão por quilometragem', 'service'),
    ('preventive.ac_sanitization', 'manutencao_preventiva', 'ar_condicionado', 'Higienização do ar-condicionado', 'service'),
    ('preventive.injector_cleaning', 'manutencao_preventiva', 'alimentacao', 'Limpeza de bicos', 'service'),
    ('tires.purchase_replacement', 'pneus_rodagem', 'pneus', 'Compra e troca de pneus', 'service'),
    ('tires.rotation', 'pneus_rodagem', 'pneus', 'Rodízio de pneus', 'service'),
    ('tires.alignment', 'pneus_rodagem', 'geometria', 'Alinhamento', 'service'),
    ('tires.balancing', 'pneus_rodagem', 'geometria', 'Balanceamento', 'service'),
    ('tires.simple_repair', 'pneus_rodagem', 'pneus', 'Reparo simples de pneu', 'service'),
    ('tires.wheel_damage', 'pneus_rodagem', 'rodas', 'Roda danificada', 'symptom'),
    ('tires.irregular_wear', 'pneus_rodagem', 'sintomas', 'Desgaste irregular dos pneus', 'symptom'),
    ('tires.vibration', 'pneus_rodagem', 'sintomas', 'Vibração em rodagem', 'symptom'),
    ('brakes.pad_confirmed', 'freios', 'componentes_confirmados', 'Troca de pastilhas confirmada', 'service'),
    ('brakes.disc_confirmed', 'freios', 'componentes_confirmados', 'Troca de discos confirmada', 'service'),
    ('brakes.noise', 'freios', 'sintomas', 'Ruído nos freios', 'symptom'),
    ('brakes.efficiency_loss', 'freios', 'emergencia', 'Perda de eficiência de frenagem', 'emergency'),
    ('brakes.fluid_leak', 'freios', 'emergencia', 'Vazamento no sistema de freios', 'emergency'),
    ('suspension.shock_confirmed', 'suspensao_direcao', 'componentes_confirmados', 'Troca de amortecedores confirmada', 'service'),
    ('suspension.noise', 'suspensao_direcao', 'sintomas', 'Ruído na suspensão', 'symptom'),
    ('steering.heavy', 'suspensao_direcao', 'direcao', 'Direção pesada', 'symptom'),
    ('suspension.instability', 'suspensao_direcao', 'sintomas', 'Instabilidade do veículo', 'symptom'),
    ('engine.starting_difficulty', 'motor', 'partida', 'Dificuldade de partida', 'symptom'),
    ('engine.power_loss', 'motor', 'funcionamento', 'Perda de potência', 'symptom'),
    ('engine.overheating', 'motor', 'emergencia', 'Superaquecimento', 'emergency'),
    ('engine.intense_smoke', 'motor', 'emergencia', 'Fumaça intensa', 'emergency'),
    ('engine.oil_leak', 'motor', 'vazamentos', 'Vazamento de óleo', 'symptom'),
    ('engine.warning_light', 'motor', 'eletronica', 'Luz de injeção ou alerta do motor', 'symptom'),
    ('engine.intermittent_failure', 'motor', 'funcionamento', 'Falha intermitente do motor', 'symptom'),
    ('transmission.clutch_slip', 'cambio_embreagem', 'embreagem', 'Patinação de embreagem', 'symptom'),
    ('transmission.automatic_fault', 'cambio_embreagem', 'cambio_automatico', 'Falha em câmbio automático', 'symptom'),
    ('transmission.engagement_difficulty', 'cambio_embreagem', 'engate', 'Dificuldade de engate', 'symptom'),
    ('electrical.battery_confirmed', 'eletrica_eletronica', 'bateria', 'Substituição de bateria confirmada', 'service'),
    ('electrical.alternator_fault', 'eletrica_eletronica', 'carga', 'Falha de alternador', 'symptom'),
    ('electrical.parasitic_drain', 'eletrica_eletronica', 'consumo', 'Consumo parasita de bateria', 'symptom'),
    ('electrical.communication_fault', 'eletrica_eletronica', 'modulos', 'Falha de comunicação eletrônica', 'symptom'),
    ('ac.not_cooling', 'ar_condicionado', 'sintomas', 'Ar-condicionado não gela', 'symptom'),
    ('glass.windshield_repair', 'vidros_chaves_travas', 'vidros', 'Reparo de para-brisa', 'service'),
    ('body.collision_repair', 'carroceria_sinistro', 'colisao', 'Funilaria e pintura após colisão', 'service'),
    ('body.structural_damage', 'carroceria_sinistro', 'estrutura', 'Suspeita de dano estrutural', 'emergency'),
    ('aesthetic.full_detailing', 'estetica_conservacao', 'detalhamento', 'Higienização e detalhamento', 'service'),
    ('accessory.tint', 'acessorios', 'pelicula', 'Película automotiva / insulfilm', 'accessory'),
    ('accessory.multimedia', 'acessorios', 'multimidia', 'Central multimídia', 'accessory'),
    ('accessory.rear_camera', 'acessorios', 'cameras', 'Câmera de ré', 'accessory'),
    ('accessory.audio', 'acessorios', 'audio', 'Som automotivo', 'accessory'),
    ('accessory.parking_sensor', 'acessorios', 'sensores', 'Sensor de estacionamento', 'accessory'),
    ('accessory.tracker', 'acessorios', 'seguranca', 'Rastreador', 'accessory'),
    ('accessory.alarm', 'acessorios', 'seguranca', 'Alarme', 'accessory'),
    ('accessory.immobilizer', 'acessorios', 'seguranca', 'Bloqueador', 'accessory'),
    ('accessory.hitch', 'acessorios', 'exterior', 'Engate', 'accessory'),
    ('accessory.dashcam', 'acessorios', 'cameras', 'Dashcam', 'accessory'),
    ('accessory.accessibility_adaptation', 'acessorios', 'acessibilidade', 'Adaptação de acessibilidade', 'accessory')
)
insert into public.service_taxonomy_entries (
  rule_set_id,
  service_code,
  category,
  subcategory,
  service_name,
  service_description,
  entry_type,
  minimum_minutes,
  typical_minutes,
  maximum_minutes
)
select
  active_set.id,
  catalog.service_code,
  catalog.category,
  catalog.subcategory,
  catalog.service_name,
  catalog.service_name || '. Tempo e requisitos são referências para revisão humana, não promessa comercial.',
  catalog.entry_type,
  30,
  60,
  120
from active_set cross join catalog;

update public.service_taxonomy_entries
set
  minimum_minutes = 20,
  typical_minutes = 45,
  maximum_minutes = 90,
  complexity = 'low',
  hidden_cost_risk = 'low',
  mobile_service_possible = service_code in (
    'preventive.oil_change', 'preventive.air_filter',
    'preventive.cabin_filter', 'electrical.battery_confirmed'
  )
where rule_set_id = (select id from public.quote_rule_sets where version = 'quoteability-alpha-1')
  and category = 'manutencao_preventiva';

update public.service_taxonomy_entries
set
  minimum_minutes = 45,
  typical_minutes = 90,
  maximum_minutes = 180,
  complexity = case when category in ('motor', 'cambio_embreagem', 'eletrica_eletronica') then 'high' else 'medium' end,
  requires_lift = category in ('freios', 'suspensao_direcao', 'cambio_embreagem'),
  requires_scanner = category in ('motor', 'cambio_embreagem', 'eletrica_eletronica'),
  requires_special_tool = category in ('motor', 'cambio_embreagem', 'suspensao_direcao'),
  requires_alignment_after = category = 'suspensao_direcao',
  dismantling_level = case when category in ('motor', 'cambio_embreagem') then 'partial' else 'light' end,
  hidden_cost_risk = case when category in ('motor', 'cambio_embreagem') then 'high' else 'medium' end
where rule_set_id = (select id from public.quote_rule_sets where version = 'quoteability-alpha-1')
  and entry_type = 'symptom';

update public.service_taxonomy_entries
set
  minimum_minutes = 15,
  typical_minutes = 30,
  maximum_minutes = 60,
  complexity = 'specialist',
  hidden_cost_risk = 'high',
  mobile_service_possible = false
where rule_set_id = (select id from public.quote_rule_sets where version = 'quoteability-alpha-1')
  and entry_type = 'emergency';

update public.service_taxonomy_entries
set
  minimum_minutes = case service_code
    when 'accessory.tint' then 120
    when 'accessory.accessibility_adaptation' then 240
    else 60
  end,
  typical_minutes = case service_code
    when 'accessory.tint' then 240
    when 'accessory.multimedia' then 180
    when 'accessory.audio' then 240
    when 'accessory.accessibility_adaptation' then 480
    else 120
  end,
  maximum_minutes = case service_code
    when 'accessory.tint' then 480
    when 'accessory.multimedia' then 360
    when 'accessory.audio' then 480
    when 'accessory.accessibility_adaptation' then 960
    else 240
  end,
  complexity = case
    when service_code = 'accessory.accessibility_adaptation' then 'specialist'
    when service_code in ('accessory.multimedia', 'accessory.audio', 'accessory.tracker', 'accessory.alarm', 'accessory.immobilizer') then 'high'
    else 'medium'
  end,
  requires_special_tool = service_code in (
    'accessory.multimedia', 'accessory.audio', 'accessory.tracker',
    'accessory.alarm', 'accessory.immobilizer', 'accessory.hitch',
    'accessory.accessibility_adaptation'
  ),
  requires_calibration = service_code in (
    'accessory.multimedia', 'accessory.rear_camera',
    'accessory.parking_sensor', 'accessory.accessibility_adaptation'
  ),
  curing_minutes = case when service_code = 'accessory.tint' then 1440 else null end,
  stock_dependency = true,
  dismantling_level = case
    when service_code = 'accessory.accessibility_adaptation' then 'major'
    when service_code in ('accessory.multimedia', 'accessory.audio', 'accessory.hitch') then 'partial'
    else 'light'
  end,
  hidden_cost_risk = case
    when service_code in ('accessory.audio', 'accessory.multimedia', 'accessory.accessibility_adaptation') then 'high'
    else 'medium'
  end,
  mobile_service_possible = service_code in (
    'accessory.tint', 'accessory.rear_camera', 'accessory.parking_sensor',
    'accessory.tracker', 'accessory.alarm', 'accessory.immobilizer',
    'accessory.dashcam'
  )
where rule_set_id = (select id from public.quote_rule_sets where version = 'quoteability-alpha-1')
  and category = 'acessorios';

with catalog as (
  select entry.*
  from public.service_taxonomy_entries as entry
  join public.quote_rule_sets as rule_set on rule_set.id = entry.rule_set_id
  where rule_set.version = 'quoteability-alpha-1'
)
insert into public.service_quoteability_rules (
  rule_set_id,
  taxonomy_entry_id,
  quote_mode,
  diagnostic_confidence_required,
  comparison_readiness_required,
  inspection_required,
  dismantling_may_be_required,
  second_opinion_allowed,
  vehicle_movement_policy,
  recommended_specialty,
  risk_level,
  compatibility_required,
  default_compatibility_status,
  commercial_scope,
  electrical_risk,
  warranty_risk,
  sensor_interference_risk,
  airbag_interference_risk,
  homologation_required,
  legal_review_required,
  priority,
  reason_template,
  next_action_template
)
select
  catalog.rule_set_id,
  catalog.id,
  case
    when catalog.entry_type = 'emergency' then 'emergency'
    when catalog.service_code in ('body.structural_damage', 'accessory.accessibility_adaptation') then 'manual_review'
    when catalog.service_code = 'accessory.tint' then 'direct_accessory_quote'
    when catalog.entry_type = 'accessory' then 'compatibility_check_required'
    when catalog.service_code in (
      'preventive.oil_change', 'preventive.oil_filter', 'preventive.air_filter',
      'preventive.cabin_filter', 'preventive.fuel_filter', 'preventive.brake_fluid',
      'preventive.coolant', 'preventive.spark_plugs', 'preventive.known_belt',
      'preventive.mileage_service', 'preventive.ac_sanitization',
      'preventive.injector_cleaning', 'tires.purchase_replacement',
      'tires.rotation', 'tires.alignment', 'tires.balancing',
      'tires.simple_repair', 'brakes.pad_confirmed', 'brakes.disc_confirmed',
      'suspension.shock_confirmed', 'electrical.battery_confirmed',
      'glass.windshield_repair', 'aesthetic.full_detailing'
    ) then 'direct_quote'
    else 'inspection_first'
  end,
  case
    when catalog.service_code like '%.%_confirmed' escape '\' then 'confirmed'
    when catalog.entry_type = 'symptom' then 'low'
    else 'unknown'
  end,
  case
    when catalog.entry_type = 'emergency' then 'blocked'
    when catalog.entry_type = 'symptom' then 'not_ready'
    else 'partially_ready'
  end,
  catalog.entry_type = 'symptom'
    or catalog.service_code in ('body.collision_repair', 'body.structural_damage', 'accessory.accessibility_adaptation'),
  catalog.dismantling_level in ('partial', 'major'),
  catalog.entry_type <> 'emergency',
  case
    when catalog.service_code in ('engine.overheating', 'engine.intense_smoke', 'brakes.efficiency_loss', 'brakes.fluid_leak') then 'do_not_move'
    when catalog.service_code = 'body.structural_damage' then 'tow_recommended'
    when catalog.entry_type = 'symptom' then 'inspection_location_required'
    when catalog.service_code = 'accessory.accessibility_adaptation' then 'movement_requires_human_review'
    else 'not_assessed'
  end,
  case catalog.category
    when 'manutencao_preventiva' then 'manutencao_preventiva'
    when 'pneus_rodagem' then 'pneus_alinhamento'
    when 'freios' then 'freios'
    when 'suspensao_direcao' then 'suspensao_direcao'
    when 'motor' then 'motor_diagnostico'
    when 'cambio_embreagem' then 'cambio_embreagem'
    when 'eletrica_eletronica' then 'eletrica_eletronica'
    when 'ar_condicionado' then 'ar_condicionado'
    when 'vidros_chaves_travas' then 'vidros'
    when 'carroceria_sinistro' then 'funilaria_estrutura'
    when 'estetica_conservacao' then 'estetica_automotiva'
    when 'acessorios' then case
      when catalog.service_code = 'accessory.tint' then 'peliculas_automotivas'
      when catalog.service_code = 'accessory.accessibility_adaptation' then 'adaptacao_veicular_homologada'
      else 'acessorios_eletrica_automotiva'
    end
    else 'revisao_manual'
  end,
  case
    when catalog.entry_type = 'emergency' then 'critical'
    when catalog.category in ('motor', 'cambio_embreagem', 'freios') and catalog.entry_type = 'symptom' then 'high'
    when catalog.service_code = 'accessory.accessibility_adaptation' then 'high'
    when catalog.entry_type in ('symptom', 'accessory') then 'medium'
    else 'low'
  end,
  catalog.entry_type = 'accessory',
  case when catalog.entry_type = 'accessory' then 'unknown' else 'not_applicable' end,
  case when catalog.entry_type = 'accessory' then 'undetermined' else 'service_only' end,
  case
    when catalog.service_code in ('accessory.audio', 'accessory.tracker', 'accessory.alarm', 'accessory.immobilizer') then 'high'
    when catalog.service_code in ('accessory.multimedia', 'accessory.rear_camera', 'accessory.parking_sensor', 'accessory.dashcam') then 'medium'
    else 'low'
  end,
  case
    when catalog.service_code in ('accessory.multimedia', 'accessory.audio', 'accessory.tracker', 'accessory.alarm', 'accessory.immobilizer', 'accessory.hitch', 'accessory.accessibility_adaptation') then 'high'
    when catalog.entry_type = 'accessory' then 'medium'
    else 'low'
  end,
  case
    when catalog.service_code in ('accessory.multimedia', 'accessory.rear_camera', 'accessory.parking_sensor', 'accessory.hitch', 'accessory.accessibility_adaptation') then 'high'
    else 'low'
  end,
  case
    when catalog.service_code = 'accessory.accessibility_adaptation' then 'high'
    when catalog.service_code in ('accessory.multimedia', 'accessory.audio') then 'medium'
    else 'low'
  end,
  catalog.service_code in ('accessory.hitch', 'accessory.accessibility_adaptation'),
  catalog.service_code in ('accessory.tint', 'accessory.hitch', 'accessory.accessibility_adaptation'),
  case when catalog.entry_type = 'emergency' then 10 when catalog.entry_type = 'symptom' then 50 else 100 end,
  case
    when catalog.entry_type = 'emergency' then 'Há sinais que exigem contenção de risco e decisão humana antes de orçamento ou movimentação.'
    when catalog.entry_type = 'symptom' then 'O relato descreve um sintoma, não um diagnóstico confirmado; inspeção é necessária para delimitar o escopo.'
    when catalog.entry_type = 'accessory' then 'A cotação depende de compatibilidade, escopo comercial, materiais e instalação claramente definidos.'
    else 'O serviço possui escopo normalmente cotável quando veículo, especificação e evidências mínimas estão disponíveis.'
  end,
  case
    when catalog.entry_type = 'emergency' then 'Interromper a cotação e encaminhar o caso para revisão imediata do Concierge; não afirmar que o veículo pode circular.'
    when catalog.entry_type = 'symptom' then 'Coletar evidências e agendar inspeção com a especialidade indicada antes de comparar reparos.'
    when catalog.entry_type = 'accessory' then 'Confirmar compatibilidade, produto, materiais, instalação, garantias e riscos antes de solicitar proposta.'
    else 'Confirmar os requisitos mínimos e solicitar uma proposta itemizada ao prestador homologado.'
  end
from catalog;

insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  requirement.requirement_type,
  requirement.requirement_code,
  requirement.label,
  true,
  case when entry.entry_type = 'emergency' then false else true end,
  requirement.sort_order
from public.service_quoteability_rules as rule
join public.service_taxonomy_entries as entry on entry.id = rule.taxonomy_entry_id
join public.quote_rule_sets as rule_set on rule_set.id = rule.rule_set_id
cross join (values
  ('vehicle_data', 'vehicle_brand', 'Marca do veículo', 10),
  ('vehicle_data', 'vehicle_model', 'Modelo do veículo', 20),
  ('vehicle_data', 'vehicle_year', 'Ano do veículo', 30)
) as requirement(requirement_type, requirement_code, label, sort_order)
where rule_set.version = 'quoteability-alpha-1';

insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  'question',
  'service_scope',
  'Confirmar exatamente o serviço ou resultado esperado',
  true,
  entry.entry_type <> 'emergency',
  40
from public.service_quoteability_rules as rule
join public.service_taxonomy_entries as entry on entry.id = rule.taxonomy_entry_id
join public.quote_rule_sets as rule_set on rule_set.id = rule.rule_set_id
where rule_set.version = 'quoteability-alpha-1';

insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  requirement.requirement_type,
  requirement.requirement_code,
  requirement.label,
  true,
  true,
  requirement.sort_order
from public.service_quoteability_rules as rule
join public.service_taxonomy_entries as entry on entry.id = rule.taxonomy_entry_id
join public.quote_rule_sets as rule_set on rule_set.id = rule.rule_set_id
cross join (values
  ('question', 'symptom_conditions', 'Em quais condições o sintoma ocorre?', 50),
  ('question', 'symptom_frequency', 'Com qual frequência o sintoma ocorre?', 60),
  ('evidence', 'symptom_media', 'Foto, vídeo ou áudio adequado ao sintoma', 70)
) as requirement(requirement_type, requirement_code, label, sort_order)
where rule_set.version = 'quoteability-alpha-1'
  and entry.entry_type = 'symptom';

insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  requirement.requirement_type,
  requirement.requirement_code,
  requirement.label,
  true,
  false,
  requirement.sort_order
from public.service_quoteability_rules as rule
join public.service_taxonomy_entries as entry on entry.id = rule.taxonomy_entry_id
join public.quote_rule_sets as rule_set on rule_set.id = rule.rule_set_id
cross join (values
  ('question', 'current_location', 'Localização operacional atual do veículo', 10),
  ('question', 'risk_description', 'Descrição objetiva do sinal de risco', 20),
  ('evidence', 'risk_evidence', 'Evidência do sinal de risco quando puder ser coletada sem exposição', 30)
) as requirement(requirement_type, requirement_code, label, sort_order)
where rule_set.version = 'quoteability-alpha-1'
  and entry.entry_type = 'emergency';

insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  requirement.requirement_type,
  requirement.requirement_code,
  requirement.label,
  true,
  true,
  requirement.sort_order
from public.service_quoteability_rules as rule
join public.service_taxonomy_entries as entry on entry.id = rule.taxonomy_entry_id
join public.quote_rule_sets as rule_set on rule_set.id = rule.rule_set_id
cross join (values
  ('vehicle_data', 'vehicle_version', 'Versão e configuração do veículo', 50),
  ('product_data', 'product_reference', 'Marca, modelo ou referência do produto', 60),
  ('question', 'commercial_scope', 'Confirmar produto, instalação ou ambos', 70),
  ('evidence', 'installation_area_photo', 'Foto da área de instalação e componentes originais', 80)
) as requirement(requirement_type, requirement_code, label, sort_order)
where rule_set.version = 'quoteability-alpha-1'
  and entry.entry_type = 'accessory';

with requirement_seed(service_code, requirement_type, requirement_code, label, blocking, sort_order) as (
  values
    ('preventive.oil_change', 'vehicle_data', 'current_mileage', 'Quilometragem atual', true, 50),
    ('preventive.oil_change', 'product_data', 'oil_specification', 'Viscosidade e especificação do óleo', true, 60),
    ('preventive.mileage_service', 'vehicle_data', 'current_mileage', 'Quilometragem atual', true, 50),
    ('tires.purchase_replacement', 'measurement', 'tire_size', 'Medida completa do pneu', true, 50),
    ('tires.purchase_replacement', 'question', 'tire_quantity', 'Quantidade de pneus', true, 60),
    ('tires.alignment', 'measurement', 'alignment_measurement', 'Medição de alinhamento quando disponível', false, 80),
    ('brakes.pad_confirmed', 'measurement', 'brake_measurement', 'Medição ou evidência de desgaste das pastilhas', true, 50),
    ('brakes.disc_confirmed', 'measurement', 'disc_measurement', 'Medição ou laudo dos discos', true, 50),
    ('suspension.shock_confirmed', 'evidence', 'inspection_report', 'Laudo ou evidência da inspeção', true, 50),
    ('electrical.battery_confirmed', 'measurement', 'battery_test', 'Teste de bateria', true, 50),
    ('glass.windshield_repair', 'evidence', 'windshield_damage_photo', 'Foto do dano e sua posição', true, 50),
    ('body.collision_repair', 'evidence', 'collision_photos', 'Fotos amplas e detalhadas do dano', true, 50),
    ('accessory.tint', 'question', 'window_count', 'Quantidade de vidros', true, 90),
    ('accessory.tint', 'product_data', 'film_type', 'Tipo, transparência, marca e linha da película', true, 100),
    ('accessory.tint', 'document', 'legal_transparency_check', 'Conformidade legal da transparência', true, 110),
    ('accessory.tint', 'question', 'previous_film_removal', 'Necessidade de remover película anterior', true, 120),
    ('accessory.multimedia', 'measurement', 'dashboard_opening', 'Dimensão do espaço no painel', true, 90),
    ('accessory.multimedia', 'product_data', 'can_interface', 'Necessidade de interface CAN e comandos do volante', true, 100),
    ('accessory.multimedia', 'question', 'original_features', 'Funções originais que precisam ser preservadas', true, 110),
    ('accessory.rear_camera', 'product_data', 'existing_display_input', 'Central existente e entrada de vídeo compatível', true, 90),
    ('accessory.rear_camera', 'question', 'camera_mount_type', 'Câmera embutida ou externa', true, 100),
    ('accessory.audio', 'question', 'audio_objective', 'Objetivo de potência e qualidade sonora', true, 90),
    ('accessory.audio', 'product_data', 'current_audio_equipment', 'Equipamentos atuais e integração necessária', true, 100),
    ('accessory.audio', 'measurement', 'electrical_capacity', 'Capacidade de bateria, alternador e proteção elétrica', true, 110),
    ('accessory.parking_sensor', 'question', 'sensor_count', 'Quantidade e tipo de sensores', true, 90),
    ('accessory.parking_sensor', 'question', 'bumper_finish', 'Cor, pintura e acabamento do para-choque', true, 100),
    ('accessory.tracker', 'document', 'device_homologation', 'Homologação e política de recorrência do equipamento', true, 90),
    ('accessory.tracker', 'question', 'monitoring_subscription', 'Aplicativo, central e eventual mensalidade', true, 100),
    ('accessory.alarm', 'document', 'device_homologation', 'Homologação do equipamento', true, 90),
    ('accessory.alarm', 'measurement', 'electrical_capacity', 'Avaliação de alimentação e proteção elétrica', true, 100),
    ('accessory.immobilizer', 'document', 'device_homologation', 'Homologação do equipamento', true, 90),
    ('accessory.immobilizer', 'question', 'interference_policy', 'Política para evitar interferência em módulos e chicote', true, 100),
    ('accessory.hitch', 'question', 'intended_use', 'Uso pretendido e capacidade necessária', true, 90),
    ('accessory.hitch', 'document', 'hitch_homologation', 'Homologação e documentação do engate', true, 100),
    ('accessory.hitch', 'question', 'bumper_sensor_impact', 'Impacto em sensores, chicote e para-choque', true, 110),
    ('accessory.dashcam', 'question', 'recording_modes', 'Câmeras, modo estacionamento e retenção desejados', true, 90),
    ('accessory.dashcam', 'measurement', 'battery_consumption', 'Consumo em espera e proteção da bateria', true, 100),
    ('accessory.dashcam', 'document', 'privacy_requirements', 'Requisitos de privacidade e acesso às gravações', true, 110),
    ('accessory.accessibility_adaptation', 'document', 'technical_homologation', 'Homologação e documentação da adaptação', true, 90),
    ('accessory.accessibility_adaptation', 'evidence', 'specialist_assessment', 'Avaliação técnica por profissional especializado', true, 100),
    ('accessory.accessibility_adaptation', 'question', 'safety_system_impact', 'Impacto em direção, freios, bancos, comandos e airbags', true, 110)
)
insert into public.quote_rule_requirements (
  rule_id,
  requirement_type,
  requirement_code,
  label,
  required,
  blocking,
  sort_order
)
select
  rule.id,
  requirement_seed.requirement_type,
  requirement_seed.requirement_code,
  requirement_seed.label,
  true,
  requirement_seed.blocking,
  requirement_seed.sort_order
from requirement_seed
join public.service_taxonomy_entries as entry
  on entry.service_code = requirement_seed.service_code
join public.quote_rule_sets as rule_set
  on rule_set.id = entry.rule_set_id
  and rule_set.version = 'quoteability-alpha-1'
join public.service_quoteability_rules as rule
  on rule.taxonomy_entry_id = entry.id;

with related_seed(source_code, target_code, relationship_type, reason) as (
  values
    ('preventive.oil_change', 'preventive.oil_filter', 'frequent', 'O filtro costuma integrar o mesmo escopo, sem ser venda obrigatória.'),
    ('tires.purchase_replacement', 'tires.balancing', 'frequent', 'Pneus substituídos normalmente exigem balanceamento.'),
    ('tires.purchase_replacement', 'tires.alignment', 'conditional', 'Alinhamento depende do desgaste e da geometria observados.'),
    ('tires.irregular_wear', 'tires.alignment', 'conditional', 'Desgaste irregular pode exigir medição de geometria.'),
    ('brakes.pad_confirmed', 'brakes.disc_confirmed', 'conditional', 'Discos só entram no escopo quando medição ou inspeção indicar.'),
    ('suspension.noise', 'tires.alignment', 'conditional', 'Alinhamento posterior depende do reparo executado.'),
    ('suspension.shock_confirmed', 'tires.alignment', 'frequent', 'Intervenções na suspensão frequentemente exigem alinhamento posterior.'),
    ('engine.warning_light', 'electrical.communication_fault', 'alternative', 'Falhas de comunicação podem produzir alertas sem confirmar causa mecânica.'),
    ('electrical.battery_confirmed', 'electrical.alternator_fault', 'conditional', 'O sistema de carga deve ser verificado quando houver sinais relacionados.'),
    ('accessory.multimedia', 'accessory.rear_camera', 'conditional', 'A câmera pode integrar o projeto quando escopo e compatibilidade forem explícitos.'),
    ('accessory.multimedia', 'accessory.parking_sensor', 'conditional', 'Integração com sensores depende da central e interfaces.'),
    ('accessory.audio', 'electrical.battery_confirmed', 'conditional', 'Projetos de maior potência podem exigir revisão de capacidade elétrica.'),
    ('accessory.audio', 'electrical.alternator_fault', 'conditional', 'A capacidade do sistema de carga deve ser medida, não presumida.'),
    ('accessory.hitch', 'accessory.parking_sensor', 'conditional', 'O engate pode interferir nos sensores e exigir solução compatível.'),
    ('accessory.dashcam', 'electrical.parasitic_drain', 'conditional', 'Modo estacionamento exige proteção contra consumo parasita.')
)
insert into public.service_taxonomy_related_services (
  rule_set_id,
  service_id,
  related_service_id,
  relationship_type,
  reason
)
select
  rule_set.id,
  source.id,
  target.id,
  related_seed.relationship_type,
  related_seed.reason
from related_seed
join public.quote_rule_sets as rule_set
  on rule_set.version = 'quoteability-alpha-1'
join public.service_taxonomy_entries as source
  on source.rule_set_id = rule_set.id and source.service_code = related_seed.source_code
join public.service_taxonomy_entries as target
  on target.rule_set_id = rule_set.id and target.service_code = related_seed.target_code;

alter table public.quote_rule_sets enable row level security;
alter table public.service_taxonomy_entries enable row level security;
alter table public.service_quoteability_rules enable row level security;
alter table public.quote_rule_requirements enable row level security;
alter table public.service_taxonomy_related_services enable row level security;
alter table public.quote_intelligence_assessments enable row level security;

revoke all on table public.quote_rule_sets from public, anon, authenticated, service_role;
revoke all on table public.service_taxonomy_entries from public, anon, authenticated, service_role;
revoke all on table public.service_quoteability_rules from public, anon, authenticated, service_role;
revoke all on table public.quote_rule_requirements from public, anon, authenticated, service_role;
revoke all on table public.service_taxonomy_related_services from public, anon, authenticated, service_role;
revoke all on table public.quote_intelligence_assessments from public, anon, authenticated, service_role;

grant select on table public.quote_rule_sets to authenticated, service_role;
grant select on table public.service_taxonomy_entries to authenticated, service_role;
grant select on table public.service_quoteability_rules to authenticated, service_role;
grant select on table public.quote_rule_requirements to authenticated, service_role;
grant select on table public.service_taxonomy_related_services to authenticated, service_role;
grant select on table public.quote_intelligence_assessments to authenticated, service_role;

create policy "Operations read quote rule sets"
  on public.quote_rule_sets
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read service taxonomy"
  on public.service_taxonomy_entries
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quoteability rules"
  on public.service_quoteability_rules
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quote rule requirements"
  on public.quote_rule_requirements
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read related services"
  on public.service_taxonomy_related_services
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create policy "Operations read quote intelligence assessments"
  on public.quote_intelligence_assessments
  for select
  to authenticated
  using ((select public.current_verah_role()) in ('concierge', 'admin'));

create or replace function private.reject_quote_intelligence_assessment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Quote Intelligence assessments are append-only';
end;
$$;

revoke execute on function private.reject_quote_intelligence_assessment_mutation()
  from public, anon, authenticated, service_role;

create trigger quote_intelligence_assessments_immutable
before update or delete on public.quote_intelligence_assessments
for each row execute function private.reject_quote_intelligence_assessment_mutation();

create or replace function public.classify_quote_intelligence(
  p_service_request_id uuid,
  p_service_code text,
  p_input jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table (
  assessment_id uuid,
  quote_mode text,
  confidence numeric,
  diagnostic_confidence text,
  comparison_readiness text,
  risk_level text,
  vehicle_movement text,
  recommended_specialty text,
  required_questions jsonb,
  required_evidence jsonb,
  required_measurements jsonb,
  required_documents jsonb,
  compatibility_status text,
  commercial_scope text,
  reason text,
  next_action text,
  requires_human_review boolean,
  rule_version text,
  engine_version text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  operational_role text := (select public.current_verah_role());
  normalized_service_code text := pg_catalog.btrim(p_service_code);
  normalized_input jsonb := coalesce(p_input, '{}'::jsonb);
  safe_input jsonb;
  available_tokens text[];
  selected_entry public.service_taxonomy_entries%rowtype;
  selected_rule public.service_quoteability_rules%rowtype;
  selected_entry_id uuid;
  selected_rule_id uuid;
  selected_rule_version text;
  selected_intake_assessment_id uuid;
  normalized_key text;
  fingerprint text;
  effective_quote_mode text;
  effective_readiness text;
  effective_compatibility text;
  effective_scope text;
  effective_reason text;
  effective_next_action text;
  calculated_confidence numeric(4,3);
  missing_questions jsonb := '[]'::jsonb;
  missing_evidence jsonb := '[]'::jsonb;
  missing_measurements jsonb := '[]'::jsonb;
  missing_documents jsonb := '[]'::jsonb;
  missing_count integer := 0;
  blocking_count integer := 0;
  created_assessment_id uuid;
  existing_assessment public.quote_intelligence_assessments%rowtype;
begin
  if request_role <> 'service_role'
    and (
      (select auth.uid()) is null
      or operational_role not in ('concierge', 'admin')
    ) then
    raise exception using
      errcode = '42501',
      message = 'Quote Intelligence authorization required';
  end if;

  if p_service_request_id is null then
    raise exception using errcode = '22023', message = 'Service request is required';
  end if;

  if normalized_service_code is null or normalized_service_code = ''
    or char_length(normalized_service_code) > 120 then
    raise exception using errcode = '22023', message = 'Valid service code is required';
  end if;

  if jsonb_typeof(normalized_input) <> 'object' then
    raise exception using errcode = '22023', message = 'Input must be a JSON object';
  end if;

  if jsonb_typeof(coalesce(normalized_input -> 'available_data', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(normalized_input -> 'available_evidence', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(normalized_input -> 'available_measurements', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(normalized_input -> 'available_documents', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(normalized_input -> 'evidence_refs', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Input collections must be JSON arrays';
  end if;

  if jsonb_array_length(coalesce(normalized_input -> 'available_data', '[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(normalized_input -> 'available_evidence', '[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(normalized_input -> 'available_measurements', '[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(normalized_input -> 'available_documents', '[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(normalized_input -> 'evidence_refs', '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'Input collections are too large';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(normalized_input -> 'available_data', '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 120
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(normalized_input -> 'available_evidence', '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 120
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(normalized_input -> 'available_measurements', '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 120
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(normalized_input -> 'available_documents', '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 120
  ) then
    raise exception using errcode = '22023', message = 'Input collection entries must be short strings';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(normalized_input -> 'evidence_refs', '[]'::jsonb)) as item
    where jsonb_typeof(item) <> 'string'
      or (item #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '22023', message = 'Evidence references must be UUIDs';
  end if;

  perform 1
  from public.service_requests as request
  where request.id = p_service_request_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Service request not found';
  end if;

  select entry.id, rule.id, rule_set.version
  into selected_entry_id, selected_rule_id, selected_rule_version
  from public.quote_rule_sets as rule_set
  join public.service_taxonomy_entries as entry
    on entry.rule_set_id = rule_set.id
  join public.service_quoteability_rules as rule
    on rule.rule_set_id = rule_set.id
    and rule.taxonomy_entry_id = entry.id
  where rule_set.status = 'active'
    and rule_set.effective_from <= now()
    and (rule_set.effective_to is null or rule_set.effective_to > now())
    and entry.service_code = normalized_service_code
    and entry.active
    and rule.active
  order by rule.priority, rule.id
  limit 1;

  if selected_rule_id is null then
    raise exception using errcode = 'P0002', message = 'Active quoteability rule not found';
  end if;

  select entry.*
  into selected_entry
  from public.service_taxonomy_entries as entry
  where entry.id = selected_entry_id;

  select rule.*
  into selected_rule
  from public.service_quoteability_rules as rule
  where rule.id = selected_rule_id;

  if exists (
    select 1
    from (
      select jsonb_array_elements_text(coalesce(normalized_input -> 'available_data', '[]'::jsonb)) as token
      union
      select jsonb_array_elements_text(coalesce(normalized_input -> 'available_evidence', '[]'::jsonb))
      union
      select jsonb_array_elements_text(coalesce(normalized_input -> 'available_measurements', '[]'::jsonb))
      union
      select jsonb_array_elements_text(coalesce(normalized_input -> 'available_documents', '[]'::jsonb))
    ) as supplied
    where supplied.token !~ '^[a-z0-9_.:-]{1,120}$'
      or supplied.token ~ '[0-9]{7,}'
      or not exists (
        select 1
        from public.quote_rule_requirements as known_requirement
        join public.service_quoteability_rules as known_rule
          on known_rule.id = known_requirement.rule_id
        where known_rule.rule_set_id = selected_rule.rule_set_id
          and known_requirement.requirement_code = supplied.token
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Input contains an unknown or sensitive token';
  end if;

  effective_compatibility := coalesce(
    nullif(normalized_input ->> 'compatibility_status', ''),
    selected_rule.default_compatibility_status
  );
  if effective_compatibility not in ('not_applicable', 'unknown', 'confirmed', 'incompatible') then
    raise exception using errcode = '22023', message = 'Invalid compatibility status';
  end if;

  effective_scope := coalesce(
    nullif(normalized_input ->> 'commercial_scope', ''),
    selected_rule.commercial_scope
  );
  if effective_scope not in ('service_only', 'product_only', 'installation_only', 'product_and_installation', 'undetermined') then
    raise exception using errcode = '22023', message = 'Invalid commercial scope';
  end if;

  safe_input := jsonb_build_object(
    'available_data', coalesce(normalized_input -> 'available_data', '[]'::jsonb),
    'available_evidence', coalesce(normalized_input -> 'available_evidence', '[]'::jsonb),
    'available_measurements', coalesce(normalized_input -> 'available_measurements', '[]'::jsonb),
    'available_documents', coalesce(normalized_input -> 'available_documents', '[]'::jsonb),
    'compatibility_status', effective_compatibility,
    'commercial_scope', effective_scope,
    'evidence_refs', coalesce(normalized_input -> 'evidence_refs', '[]'::jsonb)
  );

  select coalesce(array_agg(token), array[]::text[])
  into available_tokens
  from (
    select jsonb_array_elements_text(safe_input -> 'available_data') as token
    union
    select jsonb_array_elements_text(safe_input -> 'available_evidence')
    union
    select jsonb_array_elements_text(safe_input -> 'available_measurements')
    union
    select jsonb_array_elements_text(safe_input -> 'available_documents')
  ) as tokens;

  select
    coalesce(jsonb_agg(requirement.label order by requirement.sort_order)
      filter (where requirement.requirement_type = 'question'), '[]'::jsonb),
    coalesce(jsonb_agg(requirement.label order by requirement.sort_order)
      filter (where requirement.requirement_type = 'evidence'), '[]'::jsonb),
    coalesce(jsonb_agg(requirement.label order by requirement.sort_order)
      filter (where requirement.requirement_type = 'measurement'), '[]'::jsonb),
    coalesce(jsonb_agg(requirement.label order by requirement.sort_order)
      filter (where requirement.requirement_type = 'document'), '[]'::jsonb),
    count(*)::integer,
    count(*) filter (where requirement.blocking)::integer
  into
    missing_questions,
    missing_evidence,
    missing_measurements,
    missing_documents,
    missing_count,
    blocking_count
  from public.quote_rule_requirements as requirement
  where requirement.rule_id = selected_rule.id
    and requirement.required
    and not (requirement.requirement_code = any(available_tokens));

  effective_quote_mode := selected_rule.quote_mode;
  if selected_rule.compatibility_required and effective_compatibility <> 'confirmed' then
    effective_quote_mode := 'compatibility_check_required';
  end if;

  effective_readiness := selected_rule.comparison_readiness_required;
  if selected_rule.quote_mode = 'emergency' or effective_compatibility = 'incompatible' then
    effective_readiness := 'blocked';
  elsif blocking_count > 0 or (selected_rule.compatibility_required and effective_compatibility <> 'confirmed') then
    effective_readiness := 'not_ready';
  end if;

  calculated_confidence := greatest(
    0.400,
    least(
      0.990,
      0.960
        - (missing_count * 0.060)
        - case when selected_rule.compatibility_required and effective_compatibility <> 'confirmed' then 0.150 else 0 end
    )
  );

  effective_reason := selected_rule.reason_template;
  if effective_compatibility = 'incompatible' then
    effective_reason := effective_reason || ' A compatibilidade informada é incompatível; a cotação está bloqueada.';
  elsif blocking_count > 0 then
    effective_reason := effective_reason || format(' Ainda existem %s requisito(s) bloqueante(s).', blocking_count);
  end if;

  effective_next_action := selected_rule.next_action_template;
  if effective_compatibility = 'incompatible' then
    effective_next_action := 'Bloquear a proposta e encaminhar a incompatibilidade para revisão humana.';
  elsif blocking_count > 0 and selected_rule.quote_mode <> 'emergency' then
    effective_next_action := 'Coletar os requisitos bloqueantes antes de solicitar ou comparar uma proposta.';
  end if;

  fingerprint := md5(normalized_service_code || ':' || safe_input::text);
  normalized_key := coalesce(
    nullif(pg_catalog.btrim(p_idempotency_key), ''),
    'quote-intelligence:' || p_service_request_id::text || ':' || normalized_service_code || ':' || fingerprint
  );

  if char_length(normalized_key) > 200 then
    raise exception using errcode = '22023', message = 'Idempotency key is too long';
  end if;

  select assessment.*
  into existing_assessment
  from public.quote_intelligence_assessments as assessment
  where assessment.idempotency_key = normalized_key;

  if found then
    if existing_assessment.service_request_id <> p_service_request_id
      or existing_assessment.taxonomy_entry_id <> selected_entry.id
      or existing_assessment.input_fingerprint <> fingerprint then
      raise exception using errcode = '23505', message = 'Idempotency key was already used for different input';
    end if;
    created_assessment_id := existing_assessment.id;
  else
    select assessment.id
    into selected_intake_assessment_id
    from public.intake_assessments as assessment
    where assessment.service_request_id = p_service_request_id
    order by assessment.created_at desc
    limit 1;

    insert into public.quote_intelligence_assessments (
      service_request_id,
      intake_assessment_id,
      taxonomy_entry_id,
      rule_id,
      idempotency_key,
      input_fingerprint,
      input_snapshot,
      quote_mode,
      confidence,
      diagnostic_confidence,
      comparison_readiness,
      risk_level,
      vehicle_movement,
      recommended_specialty,
      required_questions,
      required_evidence,
      required_measurements,
      required_documents,
      compatibility_status,
      commercial_scope,
      reason,
      next_action,
      rule_version,
      evidence_refs
    ) values (
      p_service_request_id,
      selected_intake_assessment_id,
      selected_entry.id,
      selected_rule.id,
      normalized_key,
      fingerprint,
      safe_input,
      effective_quote_mode,
      calculated_confidence,
      selected_rule.diagnostic_confidence_required,
      effective_readiness,
      selected_rule.risk_level,
      selected_rule.vehicle_movement_policy,
      selected_rule.recommended_specialty,
      missing_questions,
      missing_evidence,
      missing_measurements,
      missing_documents,
      effective_compatibility,
      effective_scope,
      effective_reason,
      effective_next_action,
      selected_rule_version,
      coalesce(normalized_input -> 'evidence_refs', '[]'::jsonb)
    )
    on conflict (idempotency_key) do nothing
    returning id into created_assessment_id;

    if created_assessment_id is null then
      select assessment.*
      into existing_assessment
      from public.quote_intelligence_assessments as assessment
      where assessment.idempotency_key = normalized_key;

      if existing_assessment.service_request_id <> p_service_request_id
        or existing_assessment.taxonomy_entry_id <> selected_entry.id
        or existing_assessment.input_fingerprint <> fingerprint then
        raise exception using errcode = '23505', message = 'Concurrent idempotency conflict';
      end if;
      created_assessment_id := existing_assessment.id;
    else
      insert into public.service_request_events (
        service_request_id,
        event_type,
        actor_user_id,
        actor_role,
        channel,
        audience,
        idempotency_key,
        payload
      ) values (
        p_service_request_id,
        'quoteability.assessed',
        case when request_role = 'service_role' then null else (select auth.uid()) end,
        case when request_role = 'service_role' then 'system' else operational_role end,
        'system',
        'operations',
        'quoteability.assessed:' || created_assessment_id::text,
        jsonb_build_object(
          'assessment_id', created_assessment_id,
          'service_code', normalized_service_code,
          'quote_mode', effective_quote_mode,
          'rule_version', selected_rule_version,
          'requires_human_review', true
        )
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return query
  select
    assessment.id,
    assessment.quote_mode,
    assessment.confidence,
    assessment.diagnostic_confidence,
    assessment.comparison_readiness,
    assessment.risk_level,
    assessment.vehicle_movement,
    assessment.recommended_specialty,
    assessment.required_questions,
    assessment.required_evidence,
    assessment.required_measurements,
    assessment.required_documents,
    assessment.compatibility_status,
    assessment.commercial_scope,
    assessment.reason,
    assessment.next_action,
    assessment.requires_human_review,
    assessment.rule_version,
    assessment.engine_version
  from public.quote_intelligence_assessments as assessment
  where assessment.id = created_assessment_id;
end;
$$;

revoke execute on function public.classify_quote_intelligence(uuid, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.classify_quote_intelligence(uuid, text, jsonb, text)
  to authenticated, service_role;
