-- FinNest Family invitation flow
-- Applied to the connected Supabase project.

create index if not exists idx_household_invites_household_created
on public.household_invites(household_id, created_at desc);

create or replace function public.create_household_invite(
    p_household_id uuid,
    p_invited_name text default null,
    p_invited_contact text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_token uuid := gen_random_uuid();
    v_id uuid;
    v_expires timestamptz := now() + interval '7 days';
begin
    if not exists (select 1 from public.households where id = p_household_id and owner_id = auth.uid()) then
        raise exception 'Only the household owner can create invitations.';
    end if;

    insert into public.household_invites (household_id, invited_by, invite_token, invited_name, invited_contact, expires_at)
    values (p_household_id, auth.uid(), v_token, nullif(trim(p_invited_name), ''), nullif(trim(p_invited_contact), ''), v_expires)
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

grant execute on function public.create_household_invite(uuid,text,text) to authenticated;

create or replace function public.revoke_household_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.household_invites hi
    set expires_at = now()
    where hi.id = p_invite_id
      and hi.accepted_at is null
      and exists (select 1 from public.households h where h.id = hi.household_id and h.owner_id = auth.uid());
    return found;
end;
$$;

grant execute on function public.revoke_household_invite(uuid) to authenticated;

create or replace function public.remove_household_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.household_members hm
    where hm.id = p_member_id
      and hm.role <> 'owner'
      and exists (select 1 from public.households h where h.id = hm.household_id and h.owner_id = auth.uid());
    return found;
end;
$$;

grant execute on function public.remove_household_member(uuid) to authenticated;
