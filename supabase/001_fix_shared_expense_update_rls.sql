-- FinNest RLS patch
-- Run AFTER supabase/schema.sql.
-- Allows either household member to edit a shared expense while keeping
-- personal expenses restricted to their owner.

alter table public.expenses enable row level security;

drop policy if exists expenses_update on public.expenses;

create policy expenses_update on public.expenses
for update to authenticated
using (
    user_id = (select auth.uid())
    or (
        expense_type = 'shared'
        and household_id is not null
        and public.is_household_member(household_id)
    )
)
with check (
    (
        expense_type = 'personal'
        and user_id = (select auth.uid())
        and household_id is null
    )
    or (
        expense_type = 'shared'
        and household_id is not null
        and public.is_household_member(household_id)
    )
);
