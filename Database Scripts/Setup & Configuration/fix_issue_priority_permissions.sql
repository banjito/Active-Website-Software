-- Fix issue priority permissions
-- Previously: Only Admins could change priority
-- Now: The original reporter can change priority on their own issues

-- Drop and recreate the permissions trigger function
create or replace function common.enforce_issue_report_permissions()
returns trigger as $$
declare
  jwt jsonb;
  email text;
  user_id uuid;
begin
  -- Extract jwt claims
  begin
    jwt := auth.jwt();
  exception when others then
    jwt := '{}'::jsonb;
  end;
  email := coalesce(jwt ->> 'email', '');
  user_id := (jwt ->> 'sub')::uuid;

  -- If status is changing to a completed state, restrict to John
  if new.status is distinct from old.status and new.status in ('resolved','closed') then
    if email <> 'john.chambers@ampqes.com' then
      raise exception 'Only john.chambers@ampqes.com can mark issues as complete';
    end if;
    -- Set resolved_at when moving to complete if not supplied
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  -- If priority changed, must be the original reporter
  if new.priority is distinct from old.priority then
    if old.reporter_id is null or old.reporter_id <> user_id then
      raise exception 'Only the original reporter can change priority';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- The trigger already exists, this just updates the function it calls

