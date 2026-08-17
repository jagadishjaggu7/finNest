-- FinNest: creator-only edit/delete for shared expenses.
-- Household members may create and view shared expenses, but only the creator
-- may edit/delete that shared transaction.

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
for update to authenticated
using (user_id = (select auth.uid()))
with check (
    user_id = (select auth.uid())
    and (
        expense_type = 'personal'
        or (expense_type = 'shared' and household_id is not null and public.is_household_member(household_id))
    )
);

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
for delete to authenticated
using (user_id = (select auth.uid()));

-- Shared split rows belong to the expense creator as well.
drop policy if exists expense_splits_insert_member on public.expense_splits;
create policy expense_splits_insert_member on public.expense_splits
for insert to authenticated
with check (
    public.is_household_member(household_id)
    and exists (
        select 1 from public.expenses e
        where e.id = expense_id
          and e.user_id = (select auth.uid())
          and e.household_id = household_id
          and e.expense_type = 'shared'
    )
);

drop policy if exists expense_splits_update_member on public.expense_splits;
create policy expense_splits_update_member on public.expense_splits
for update to authenticated
using (
    exists (
        select 1 from public.expenses e
        where e.id = expense_id
          and e.user_id = (select auth.uid())
          and e.expense_type = 'shared'
    )
)
with check (
    exists (
        select 1 from public.expenses e
        where e.id = expense_id
          and e.user_id = (select auth.uid())
          and e.expense_type = 'shared'
    )
);

drop policy if exists expense_splits_delete_member on public.expense_splits;
create policy expense_splits_delete_member on public.expense_splits
for delete to authenticated
using (
    exists (
        select 1 from public.expenses e
        where e.id = expense_id
          and e.user_id = (select auth.uid())
          and e.expense_type = 'shared'
    )
);
