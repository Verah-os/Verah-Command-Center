#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ID="verah-command-center-ci"
readonly BASELINE_VERSION="20260716000000"
readonly DATABASE_CONTAINER="supabase_db_${PROJECT_ID}"

cleanup() {
  if command -v supabase >/dev/null 2>&1; then
    supabase stop --no-backup --project-id "${PROJECT_ID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT HUP INT TERM

fail() {
  printf 'Database CI failed: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

run_sql() {
  local file="$1"
  printf 'Running %s\n' "${file}"
  docker exec --interactive "${DATABASE_CONTAINER}" psql \
    --username=postgres \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --file=- <"${file}"
}

run_customer_identity_concurrency() {
  local first_pid
  local first_status=0
  local second_pid
  local second_status=0

  printf 'Running concurrent customer identity resolution\n'

  docker exec --interactive "${DATABASE_CONTAINER}" psql \
    --username=postgres \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --file=- <supabase/tests/customer_identity_concurrency_call.sql &
  first_pid=$!

  docker exec --interactive "${DATABASE_CONTAINER}" psql \
    --username=postgres \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --file=- <supabase/tests/customer_identity_concurrency_call.sql &
  second_pid=$!

  wait "${first_pid}" || first_status=$?
  wait "${second_pid}" || second_status=$?

  if [[ "${first_status}" -ne 0 || "${second_status}" -ne 0 ]]; then
    fail "concurrent customer identity resolution failed"
  fi

  run_sql supabase/tests/customer_identity_concurrency.sql
}

run_quote_intelligence_concurrency() {
  local first_pid
  local first_status=0
  local second_pid
  local second_status=0

  printf 'Running concurrent Quote Intelligence classification\n'
  run_sql supabase/tests/quote_intelligence_concurrency_setup.sql

  docker exec --interactive "${DATABASE_CONTAINER}" psql \
    --username=postgres \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --file=- <supabase/tests/quote_intelligence_concurrency_call.sql &
  first_pid=$!

  docker exec --interactive "${DATABASE_CONTAINER}" psql \
    --username=postgres \
    --dbname=postgres \
    --no-psqlrc \
    --set=ON_ERROR_STOP=1 \
    --file=- <supabase/tests/quote_intelligence_concurrency_call.sql &
  second_pid=$!

  wait "${first_pid}" || first_status=$?
  wait "${second_pid}" || second_status=$?

  if [[ "${first_status}" -ne 0 || "${second_status}" -ne 0 ]]; then
    fail "concurrent Quote Intelligence classification failed"
  fi

  run_sql supabase/tests/quote_intelligence_concurrency_verify.sql
}

assert_local_database_container() {
  local project_label

  project_label="$(
    docker inspect \
      --format='{{ index .Config.Labels "com.supabase.cli.project" }}' \
      "${DATABASE_CONTAINER}"
  )"

  if [[ "${project_label}" != "${PROJECT_ID}" ]]; then
    fail "database container does not belong to the local CI project"
  fi
}

assert_migration_count() {
  local expected_count
  local actual_count

  expected_count="$(
    find supabase/migrations -maxdepth 1 -type f -name '*.sql' |
      wc -l |
      tr -d '[:space:]'
  )"
  actual_count="$(
    docker exec "${DATABASE_CONTAINER}" psql \
      --username=postgres \
      --dbname=postgres \
      --no-psqlrc \
      --tuples-only \
      --no-align \
      --set=ON_ERROR_STOP=1 \
      --command='select count(*) from supabase_migrations.schema_migrations;' |
      tr -d '[:space:]'
  )"

  if [[ "${actual_count}" != "${expected_count}" ]]; then
    fail "expected ${expected_count} applied migrations, found ${actual_count}"
  fi
}

require_command docker
require_command supabase

# Remove only this local CI project's resources left by an interrupted run.
cleanup

printf 'Starting isolated Supabase database\n'
supabase db start
assert_local_database_container

printf 'Replaying migrations through the pre-authorization baseline\n'
supabase db reset --local --version "${BASELINE_VERSION}" --no-seed

run_sql supabase/tests/admin_authorization_pre_migration_fixture.sql

printf 'Applying the administrative authorization migration and later migrations\n'
supabase migration up --local
assert_migration_count

run_sql supabase/tests/admin_authorization_catalog.sql
run_sql supabase/tests/rls_catalog.sql
run_sql supabase/tests/admin_authorization_matrix.sql
run_sql supabase/tests/customer_identity_security.sql
run_sql supabase/tests/communication_intake_security.sql
run_sql supabase/tests/control_plane_dry_run.sql
run_sql supabase/tests/intelligent_intake_security.sql
run_sql supabase/tests/quote_intelligence_security.sql
run_customer_identity_concurrency
run_quote_intelligence_concurrency

printf 'Linting public and private schemas; warnings are reported and errors block CI\n'
supabase db lint --local --schema public,private --level warning --fail-on error

printf 'Replaying every migration again from a clean database\n'
supabase db reset --local --no-seed
assert_migration_count

run_sql supabase/tests/admin_authorization_catalog.sql
run_sql supabase/tests/rls_catalog.sql
run_sql supabase/tests/customer_identity_security.sql
run_sql supabase/tests/communication_intake_security.sql
run_sql supabase/tests/control_plane_dry_run.sql
run_sql supabase/tests/intelligent_intake_security.sql
run_sql supabase/tests/quote_intelligence_security.sql
run_customer_identity_concurrency
run_quote_intelligence_concurrency
supabase db lint --local --schema public,private --level warning --fail-on error

printf 'Database authorization CI completed successfully\n'
