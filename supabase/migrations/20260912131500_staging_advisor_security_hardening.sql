-- Issue #259 — repository-only staging advisor hardening.
--
-- This migration intentionally contains only privilege/search_path hardening.
-- It does not add permissive RLS policies, alter canonical ownership, or change
-- service_request / vehicle / telemetry business semantics.

-- Trigger-only canonical identity binding must not be directly callable by
-- client roles. Trigger execution itself does not require EXECUTE privileges
-- for the invoking role.
revoke execute on function public.bind_service_request_customer_identity()
  from public, anon, authenticated;

-- Advisor-reported mutable search_path functions use only PostgreSQL built-ins
-- in their bodies. Restrict resolution to pg_catalog without changing their
-- signatures, trigger bindings, grants, or business behavior.
alter function public.set_ai_agent_updated_at()
  set search_path = pg_catalog;

alter function public.dispatcher_engine_log_entry(text)
  set search_path = pg_catalog;

alter function public.set_dispatcher_job_updated_at()
  set search_path = pg_catalog;

alter function public.set_system_setting_updated_at()
  set search_path = pg_catalog;
