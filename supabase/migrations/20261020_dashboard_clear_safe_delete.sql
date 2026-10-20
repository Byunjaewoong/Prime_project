-- Reapply this function if 20261020_dashboard_clear.sql was run before the
-- DELETE WHERE fix. Supabase's safe-update guard rejects DELETE without WHERE.
create or replace function public.dashboard_clear(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  board public.dashboard_board%rowtype;
  next_generation bigint;
begin
  select * into board from public.dashboard_board where id = 1 for update;
  if board.blocked_until is not null and board.blocked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  if p_password is null or md5(p_password) <> '00f80c0962fb37ea8fb72accc75546c8' then
    update public.dashboard_board
    set failed_attempts = case when board.blocked_until is not null and board.blocked_until <= now()
      then 1 else board.failed_attempts + 1 end,
        blocked_until = case when board.failed_attempts >= 4 and
          (board.blocked_until is null or board.blocked_until <= now())
          then now() + interval '1 minute' else null end
    where id = 1;
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;

  delete from public.dashboard_strokes where id > 0;
  update public.dashboard_board
  set generation = generation + 1, failed_attempts = 0, blocked_until = null
  where id = 1 returning generation into next_generation;
  return jsonb_build_object('ok', true, 'generation', next_generation);
end;
$$;

revoke all on function public.dashboard_clear(text) from public;
grant execute on function public.dashboard_clear(text) to anon, authenticated;
notify pgrst, 'reload schema';
