-- Public function to get the maximum numeric job number from neta_ops.jobs
-- Extracts digits from job_number when it contains non-digits; treats missing/invalid as 0
-- Returns 0 when there are no numeric job numbers

create or replace function public.get_max_job_number()
returns bigint
language sql
stable
as $$
  select coalesce(
    max(
      case
        when job_number ~ '^[0-9]+$' then job_number::bigint
        else nullif(regexp_replace(job_number::text, '\\D', '', 'g'), '')::bigint
      end
    ),
    0
  )
  from neta_ops.jobs;
$$;



