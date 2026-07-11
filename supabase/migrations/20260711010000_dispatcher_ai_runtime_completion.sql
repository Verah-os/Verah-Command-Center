create or replace function public.dispatcher_complete_ai_runtime_job(
  job_id uuid,
  execution_id text,
  succeeded boolean,
  duration_ms integer,
  result_message text default null,
  error_code text default null,
  error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text := case when succeeded then 'completed' else 'failed' end;
  log_message text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if execution_id is null or btrim(execution_id) = '' then
    raise exception 'Execution ID is required';
  end if;

  if succeeded then
    log_message := format(
      'AI Runtime executionId=%s status=success message=%s durationMs=%s',
      execution_id,
      coalesce(nullif(result_message, ''), '-'),
      greatest(duration_ms, 0)
    );
  else
    log_message := format(
      'AI Runtime executionId=%s status=error code=%s message=%s durationMs=%s',
      execution_id,
      coalesce(nullif(error_code, ''), 'ADAPTER_FAILURE'),
      coalesce(nullif(error_message, ''), '-'),
      greatest(duration_ms, 0)
    );
  end if;

  update public.dispatcher_jobs
  set status = next_status,
      assigned_agent = 'mock_agent',
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      logs = coalesce(logs, '[]'::jsonb) || public.dispatcher_engine_log_entry(log_message)
  where id = job_id
    and status in ('queued', 'failed');

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', next_status,
    'jobId', job_id,
    'executionId', execution_id
  );
end;
$$;

revoke all on function public.dispatcher_complete_ai_runtime_job(uuid, text, boolean, integer, text, text, text) from public;
revoke all on function public.dispatcher_complete_ai_runtime_job(uuid, text, boolean, integer, text, text, text) from anon;
grant execute on function public.dispatcher_complete_ai_runtime_job(uuid, text, boolean, integer, text, text, text) to authenticated;
