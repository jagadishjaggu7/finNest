-- FinNest security hardening and FK indexes.
-- SECURITY DEFINER RPCs are intentionally callable only by signed-in users where needed.
revoke execute on function public.accept_household_invite(uuid) from anon;
revoke execute on function public.create_household_invite(uuid, text, text) from anon;
revoke execute on function public.revoke_household_invite(uuid) from anon;
revoke execute on function public.remove_household_member(uuid) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.is_household_member(uuid) from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
grant execute on function public.accept_household_invite(uuid) to authenticated;
grant execute on function public.create_household_invite(uuid, text, text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;

create index if not exists idx_expenses_account_id on public.expenses(account_id);
create index if not exists idx_expenses_paid_by_member_id on public.expenses(paid_by_member_id);
create index if not exists idx_households_owner_id on public.households(owner_id);
create index if not exists idx_household_invites_accepted_by on public.household_invites(accepted_by);
create index if not exists idx_household_invites_invited_by on public.household_invites(invited_by);
