-- FinNest: separate personal and family budgets while retaining weekly/monthly periods.
alter table public.budgets add column if not exists budget_scope text not null default 'personal' check (budget_scope in ('personal','family'));
alter table public.budgets add column if not exists household_id uuid references public.households(id) on delete cascade;
update public.budgets set budget_scope='personal', household_id=null where budget_scope is null;
alter table public.budgets drop constraint if exists budgets_user_category_month_start_key;
drop index if exists budgets_user_category_period_unique;
create unique index if not exists budgets_personal_unique on public.budgets(user_id, category, period_type, period_start) where budget_scope='personal';
create unique index if not exists budgets_family_unique on public.budgets(household_id, category, period_type, period_start) where budget_scope='family';

drop policy if exists budgets_select_own on public.budgets;
drop policy if exists budgets_insert_own on public.budgets;
drop policy if exists budgets_update_own on public.budgets;
drop policy if exists budgets_delete_own on public.budgets;

create policy budgets_select_scoped on public.budgets
for select to authenticated
using (
    user_id = (select auth.uid())
    or (budget_scope = 'family' and household_id is not null and public.is_household_member(household_id))
);

create policy budgets_insert_scoped on public.budgets
for insert to authenticated
with check (
    user_id = (select auth.uid())
    and (
        (budget_scope = 'personal' and household_id is null)
        or (budget_scope = 'family' and household_id is not null and public.is_household_member(household_id))
    )
);

create policy budgets_update_scoped on public.budgets
for update to authenticated
using (
    user_id = (select auth.uid())
    or (budget_scope = 'family' and household_id is not null and public.is_household_member(household_id))
)
with check (
    (budget_scope = 'personal' and household_id is null and user_id = (select auth.uid()))
    or (budget_scope = 'family' and household_id is not null and public.is_household_member(household_id))
);

create policy budgets_delete_scoped on public.budgets
for delete to authenticated
using (
    user_id = (select auth.uid())
    or (budget_scope = 'family' and household_id is not null and public.is_household_member(household_id))
);

create index if not exists idx_budgets_household_period on public.budgets(household_id, period_type, period_start) where budget_scope='family';
