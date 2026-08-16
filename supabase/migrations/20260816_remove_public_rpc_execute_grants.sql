-- SECURITY DEFINER functions must not be executable by PUBLIC/anon.
revoke execute on function public.accept_household_invite(uuid) from public;
revoke execute on function public.create_household_invite(uuid, text, text) from public;
revoke execute on function public.revoke_household_invite(uuid) from public;
revoke execute on function public.remove_household_member(uuid) from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.rls_auto_enable() from public;

grant execute on function public.accept_household_invite(uuid) to authenticated;
grant execute on function public.create_household_invite(uuid, text, text) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
