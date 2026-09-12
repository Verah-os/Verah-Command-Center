import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "../supabase/migrations");

// Frozen Release 1.0 staging-applied baseline, copied verbatim from the canonical
// filenames on `main` (d391782, 2026-09-10). This list describes the already-
// applied non-production baseline only. Repository-only migrations prepared
// after that freeze must be listed separately until the Human Gate is handled.
const EXPECTED_VERSIONS = [
  "20260709050000_create_work_orders.sql",
  "20260709053000_create_dispatcher_jobs.sql",
  "20260709060000_create_dispatcher_pipeline.sql",
  "20260709063000_allow_work_order_creation.sql",
  "20260709070000_fix_work_order_insert_rls.sql",
  "20260709071000_ensure_dispatcher_jobs_pipeline.sql",
  "20260709073000_create_ai_agents.sql",
  "20260709080000_dispatcher_engine_runtime_fields.sql",
  "20260709083000_dispatcher_agent_selection_rules.sql",
  "20260709090000_dispatcher_execution_controls.sql",
  "20260709093000_create_system_settings.sql",
  "20260711010000_dispatcher_ai_runtime_completion.sql",
  "20260712000000_create_service_requests.sql",
  "20260712033000_create_concierge_acceptance.sql",
  "20260712043000_create_service_providers.sql",
  "20260712053000_create_service_quotes.sql",
  "20260712190000_quote_integrity_clarity.sql",
  "20260712200000_complete_service_journey.sql",
  "20260712210000_create_user_profiles.sql",
  "20260712220000_secure_provider_actions.sql",
  "20260713000000_add_service_request_state.sql",
  "20260714000000_customer_answers_provider_reassignment.sql",
  "20260714010000_fix_triage_providers_insurance.sql",
  "20260715000000_concierge_lifecycle.sql",
  "20260716000000_create_customer_vehicles.sql",
  "20260727225432_secure_admin_authorization.sql",
  "20260730150101_customer_identity_foundation.sql",
  "20260730153004_secure_customer_identity.sql",
  "20260731022348_alpha_communication_intake_foundation.sql",
  "20260731225632_control_plane_001_dry_run.sql",
  "20260802013920_alpha_intelligent_intake_foundation.sql",
  "20260802035514_quote_intelligence_core.sql",
  "20260803010500_quote_quality_comparison.sql",
  "20260805090000_second_opinion_vehicle_movement.sql",
  "20260819192003_multiple_provider_invitations.sql",
  "20260820025044_whatsapp_worker_media.sql",
  "20260820032446_n8n_notifications_sla.sql",
  "20260826143726_pilot_alpha_custody_foundation.sql",
  "20260826150710_provider_homologation_foundation.sql",
  "20260826193000_whatsapp_production_readiness.sql",
  "20260827013000_identity_onboarding_foundation.sql",
  "20260827040000_vehicle_onboarding.sql",
  "20260904022000_service_request_pickup_location.sql",
  "20260905001000_canonical_service_request_customer_identity.sql",
  "20260905210500_secure_concierge_service_lifecycle.sql",
  "20260905231000_converge_dispatcher_control_plane_authorization.sql",
  "20260907000000_vehicle_mileage_logs.sql",
  "20260907120000_vehicle_fuel_logs.sql",
  "20260907141500_vehicle_replacement_preserving_history.sql",
  "20260908000000_vehicle_expenses_dashboard.sql",
  "20260909005541_vehicle_maintenance_records.sql",
  "20260909120000_vehicle_documents.sql",
  "20260910000000_vehicle_charging_logs.sql",
];

// Versioned repository-only migrations that intentionally remain unapplied
// while the non-production Supabase migration-application Human Gate is open.
const PENDING_REPOSITORY_VERSIONS = [
  "20260912131500_staging_advisor_security_hardening.sql",
];

const MILESTONE = {
  serviceRequests: "20260712000000_create_service_requests.sql",
  customerVehicles: "20260716000000_create_customer_vehicles.sql",
  customerIdentity: "20260730150101_customer_identity_foundation.sql",
  identityOnboarding: "20260827013000_identity_onboarding_foundation.sql",
  vehicleOnboarding: "20260827040000_vehicle_onboarding.sql",
  pickupLocation: "20260904022000_service_request_pickup_location.sql",
  canonicalServiceRequestIdentity: "20260905001000_canonical_service_request_customer_identity.sql",
  mileageLogs: "20260907000000_vehicle_mileage_logs.sql",
  fuelLogs: "20260907120000_vehicle_fuel_logs.sql",
  expensesDashboard: "20260908000000_vehicle_expenses_dashboard.sql",
  maintenanceRecords: "20260909005541_vehicle_maintenance_records.sql",
  chargingLogs: "20260910000000_vehicle_charging_logs.sql",
};

function versionPrefix(name) {
  return name.slice(0, 14);
}

function assertContains(actual, needle, label) {
  assert.ok(
    actual.includes(needle),
    `${label}: expected migration to contain ${JSON.stringify(needle)}`,
  );
}

function assertExcludes(actual, needle, label) {
  assert.ok(
    !actual.includes(needle),
    `${label}: expected migration NOT to contain ${JSON.stringify(needle)}`,
  );
}

async function readMigration(name) {
  return readFile(path.join(MIGRATIONS_DIR, name), "utf8");
}

test("staging migration files preserve the frozen applied baseline plus explicit repository-only pending migrations", async () => {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const allowedRepositoryVersions = [
    ...EXPECTED_VERSIONS,
    ...PENDING_REPOSITORY_VERSIONS,
  ].sort();
  const extra = files.filter((name) => !allowedRepositoryVersions.includes(name));
  const missingApplied = EXPECTED_VERSIONS.filter((name) => !files.includes(name));
  const missingPending = PENDING_REPOSITORY_VERSIONS.filter((name) => !files.includes(name));

  assert.equal(
    files.length,
    allowedRepositoryVersions.length,
    `expected ${EXPECTED_VERSIONS.length} applied + ${PENDING_REPOSITORY_VERSIONS.length} pending repository migrations, found ${files.length}`,
  );
  assert.deepEqual(
    missingApplied,
    [],
    "every frozen Release 1.0 staging-applied migration must remain on disk",
  );
  assert.deepEqual(
    missingPending,
    [],
    "every explicitly pending repository-only migration must remain on disk",
  );
  assert.deepEqual(
    extra,
    [],
    "every migration after the frozen staging baseline must be explicitly classified as repository-only pending until the Human Gate is handled",
  );

  for (const name of allowedRepositoryVersions) {
    assert.match(
      name,
      /^\d{14}_[a-z0-9_]+\.sql$/,
      `migration filename must be a 14-digit version + snake_case name: ${name}`,
    );
  }

  const versions = files.map(versionPrefix);
  assert.equal(new Set(versions).size, versions.length, "migration version prefixes must be unique");
  for (let i = 1; i < versions.length; i += 1) {
    assert.ok(
      versions[i] > versions[i - 1],
      `migration versions must strictly increase: ${versions[i - 1]} -> ${versions[i]}`,
    );
  }

  const lastAppliedVersion = versionPrefix(EXPECTED_VERSIONS.at(-1));
  for (const pending of PENDING_REPOSITORY_VERSIONS) {
    assert.ok(
      versionPrefix(pending) > lastAppliedVersion,
      `pending migration must follow the frozen staging-applied baseline: ${pending}`,
    );
  }
});

test("staging sequence respects canonical dependency order", () => {
  const indexOf = (name) => EXPECTED_VERSIONS.indexOf(name);

  const assertBefore = (earlier, later, why) => {
    assert.ok(
      indexOf(earlier) >= 0 && indexOf(later) >= 0 && indexOf(earlier) < indexOf(later),
      `${why}; expected ${earlier} before ${later} (filesystem order on main)`,
    );
  };

  assertBefore(MILESTONE.customerVehicles, MILESTONE.mileageLogs, "telemetry logs FK to customer_vehicles");
  assertBefore(MILESTONE.mileageLogs, MILESTONE.fuelLogs, "fuel log mirrors mileage log semantics");
  assertBefore(MILESTONE.mileageLogs, MILESTONE.chargingLogs, "charging non-regression reads mileage logs");
  assertBefore(MILESTONE.fuelLogs, MILESTONE.chargingLogs, "charging non-regression reads fuel logs");
  assertBefore(MILESTONE.expensesDashboard, MILESTONE.maintenanceRecords, "maintenance adds maintenance_record_id to vehicle_expenses");
  assertBefore(MILESTONE.maintenanceRecords, MILESTONE.chargingLogs, "charging stays last telemetry domain added");
  assertBefore(MILESTONE.serviceRequests, MILESTONE.pickupLocation, "pickup columns alter service_requests");
  assertBefore(MILESTONE.pickupLocation, MILESTONE.canonicalServiceRequestIdentity, "canonical identity binding alters service_requests after pickup");
  assertBefore(MILESTONE.customerIdentity, MILESTONE.identityOnboarding, "verah_identities build on canonical customers");
  assertBefore(MILESTONE.identityOnboarding, MILESTONE.vehicleOnboarding, "vehicle onboarding requires canonical identity");
  assertBefore(MILESTONE.customerVehicles, MILESTONE.vehicleOnboarding, "vehicle provenance alters customer_vehicles and must run after it");
});

test("mileage logs invariant: append-only, owner-scoped, non-regressive odometer", async () => {
  const sql = await readMigration(MILESTONE.mileageLogs);
  assertContains(sql, "create table public.vehicle_mileage_logs", "mileage");
  assertContains(sql, "mileage_value integer not null", "mileage");
  assertContains(sql, "public.register_vehicle_mileage", "mileage");
  assertContains(sql, "reject_vehicle_mileage_log_mutation", "mileage");
  assertContains(sql, "before update or delete on public.vehicle_mileage_logs", "mileage append-only");
  assertContains(sql, "Mileage cannot regress below the latest logged reading", "mileage non-regression");
  assertContains(sql, "enable row level security", "mileage RLS");
  assertContains(sql, '"Customers read own vehicle mileage logs"', "mileage ownership");
  assertContains(sql, '"Admins read vehicle mileage logs"', "mileage admin read");
  assertContains(sql, "vehicle.owner_id = (select auth.uid())", "mileage owner scope");
});

test("fuel logs invariant: liters/km-L only, no kWh, append-only, owner-scoped", async () => {
  const sql = await readMigration(MILESTONE.fuelLogs);
  assertContains(sql, "create table public.vehicle_fuel_logs", "fuel");
  assertContains(sql, "liters numeric(10,3) not null", "fuel liters");
  assertContains(sql, "consumption_kmpl numeric(8,2)", "fuel km/L");
  assertContains(sql, "fuel_type in ('gasolina', 'etanol', 'diesel', 'gnv')", "fuel types");
  assertContains(sql, "public.register_vehicle_fuel", "fuel");
  assertContains(sql, "reject_vehicle_fuel_log_mutation", "fuel append-only");
  assertContains(sql, "before update or delete on public.vehicle_fuel_logs", "fuel append-only");
  assertContains(sql, "Fuel odometer cannot regress below the latest logged reading", "fuel non-regression");
  assertContains(sql, "enable row level security", "fuel RLS");
  assertContains(sql, '"Customers read own vehicle fuel logs"', "fuel ownership");
  assertContains(sql, '"Admins read vehicle fuel logs"', "fuel admin read");
  assertContains(sql, "vehicle.owner_id = (select auth.uid())", "fuel owner scope");
  assertExcludes(sql, "kwh numeric", "no kWh in fuel domain");
});

test("charging logs invariant: kWh/km-kWh only, no liters, cross-domain non-regression", async () => {
  const sql = await readMigration(MILESTONE.chargingLogs);
  assertContains(sql, "create table public.vehicle_charging_logs", "charging");
  assertContains(sql, "kwh numeric(10,3) not null", "charging kWh");
  assertContains(sql, "consumption_km_kwh numeric(8,3)", "charging km/kWh");
  assertContains(sql, "charging_type in ('recarga_domestica', 'recarga_publica', 'recarga_rapida', 'outro')", "charging types");
  assertContains(sql, "public.register_vehicle_charging", "charging");
  assertContains(sql, "before update or delete on public.vehicle_charging_logs", "charging append-only");
  assertContains(sql, "Charging odometer cannot regress below the latest logged reading", "charging non-regression");
  assertContains(sql, "from public.vehicle_mileage_logs", "charging cross-domain guard");
  assertContains(sql, "from public.vehicle_fuel_logs", "charging cross-domain guard");
  assertContains(sql, "reject_vehicle_mileage_log_mutation", "charging shared append-only guard");
  assertContains(sql, "enable row level security", "charging RLS");
  assertContains(sql, '"Customers read own vehicle charging logs"', "charging ownership");
  assertContains(sql, '"Admins read vehicle charging logs"', "charging admin read");
  assertContains(sql, "vehicle.owner_id = (select auth.uid())", "charging owner scope");
  assertExcludes(sql, "liters numeric", "no liters in charging domain");
});

test("maintenance records invariant: append-only, owner-scoped, expense link unforgeable", async () => {
  const sql = await readMigration(MILESTONE.maintenanceRecords);
  assertContains(sql, "create table public.vehicle_maintenance_records", "maintenance");
  assertContains(sql, "public.register_vehicle_maintenance", "maintenance");
  assertContains(sql, "before update or delete", "maintenance append-only");
  assertContains(sql, "reject_vehicle_mileage_log_mutation", "maintenance shared append-only guard");
  assertContains(sql, "maintenance_record_id uuid", "maintenance expense link");
  assertContains(sql, '"Customers read own maintenance"', "maintenance ownership");
  assertContains(sql, "owner_id = (select auth.uid())", "maintenance owner scope");
  assertContains(sql, "Clients cannot forge links", "maintenance expense link unforgeable");
  assertContains(sql, "enable row level security", "maintenance RLS");
});

test("expenses dashboard invariant: owner/customer/vehicle canonical, RLS owner-checked", async () => {
  const sql = await readMigration(MILESTONE.expensesDashboard);
  assertContains(sql, "create table public.vehicle_expenses", "expenses");
  assertContains(sql, "amount_cents integer not null", "expenses amount");
  assertContains(sql, "owner_id uuid not null references auth.users", "expenses owner FK");
  assertContains(sql, "customer_id uuid not null references public.customers", "expenses customer FK");
  assertContains(sql, "vehicle_id uuid not null references public.customer_vehicles", "expenses vehicle FK");
  assertContains(sql, "enable row level security", "expenses RLS");
  assertContains(sql, '"Customers read own vehicle expenses"', "expenses ownership");
  assertContains(sql, "owner_id = (select auth.uid())", "expenses owner scope");
  assertContains(sql, "vehicle.owner_id = (select auth.uid())", "expenses vehicle scope");
});

test("canonical identity, vehicle and service_request contracts stay canonical", async () => {
  const identity = await readMigration(MILESTONE.customerIdentity);
  const onboarding = await readMigration(MILESTONE.identityOnboarding);
  const vehicle = await readMigration(MILESTONE.vehicleOnboarding);
  const vehicles = await readMigration(MILESTONE.customerVehicles);
  const serviceRequests = await readMigration(MILESTONE.serviceRequests);
  const pickup = await readMigration(MILESTONE.pickupLocation);
  const canonicalServiceRequest = await readMigration(MILESTONE.canonicalServiceRequestIdentity);

  assertContains(identity, "create table public.customers", "canonical customer");
  assertContains(identity, "customers_auth_user_id_uidx", "auth binding unique");
  assertContains(identity, "create table public.customer_channels", "customer channels");

  assertContains(onboarding, "create table public.verah_identities", "canonical identity");
  assertContains(onboarding, "user_profiles", "identity on user_profiles");
  assertContains(onboarding, "assign_user_profile_identity", "identity assignment");
  assertContains(onboarding, "create table public.identity_relations", "identity relations");

  assertContains(vehicles, "create table if not exists public.customer_vehicles", "canonical vehicle");
  assertContains(vehicles, "customer_vehicles_owner_plate_uidx", "owner+plate uniqueness");
  assertContains(vehicle, "data_source text not null default 'legacy'", "vehicle provenance");
  assertContains(vehicle, "lookup_source text not null default 'manual'", "vehicle provenance");
  assertContains(vehicle, "public.confirm_customer_vehicle", "RPC-only vehicle create");

  assertContains(serviceRequests, "create table if not exists public.service_requests", "canonical service_request");
  assertContains(serviceRequests, '"Customers can create their service requests"', "service_request ownership");
  assertContains(serviceRequests, "service_stage = 'solicitado'", "service_request creation stage");
  assertContains(pickup, "pickup_address", "service_request pickup");
  assertContains(pickup, "pickup_location_source", "service_request pickup provenance");
  assertContains(canonicalServiceRequest, "customer_id uuid references public.customers", "service_request canonical customer");
  assertContains(canonicalServiceRequest, "bind_service_request_customer_identity", "service_request identity binding");
  assertContains(canonicalServiceRequest, "service_requests_bind_customer_identity", "service_request identity trigger");
});