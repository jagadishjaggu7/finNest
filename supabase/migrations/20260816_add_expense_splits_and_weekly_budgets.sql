-- FinNest: shared expense splits + weekly budgets
-- Applied to the active Supabase project as part of Phase 4.

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount > 0),
  created_at timestamptz not null default now(),
  unique (expense_id, member_id)
);

create index if not exists idx_expense_splits_expense on public.expense_splits(expense_id);
create index if not exists idx_expense_splits_member on public.expense_splits(member_id);
create index if not exists idx_expense_splits_household on public.expense_splits(household_id);

alter table public.expense_splits enable row level security;

drop policy if exists expense_splits_select_member on public.expense_splits;
create policy expense_splits_select_member on public.expense_splits
for select to authenticated using (public.is_household_member(household_id));

drop policy if exists expense_splits_insert_member on public.expense_splits;
create policy expense_splits_insert_member on public.expense_splits
for insert to authenticated with check (public.is_household_member(household_id));

drop policy if exists expense_splits_update_member on public.expense_splits;
create policy expense_splits_update_member on public.expense_splits
for update to authenticated using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists expense_splits_delete_member on public.expense_splits;
create policy expense_splits_delete_member on public.expense_splits
for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, update, delete on public.expense_splits to authenticated;

alter table public.budgets add column if not exists period_type text not null default 'monthly' check (period_type in ('monthly','weekly'));
alter table public.budgets add column if not exists period_start date;
update public.budgets set period_start = coalesce(period_start, month_start) where period_start is null;
alter table public.budgets alter column period_start set not null;
create index if not exists idx_budgets_user_period on public.budgets(user_id, period_type, period_start);
create unique index if not exists budgets_user_category_period_unique on public.budgets(user_id, category, period_type, period_start);
grant select, insert, update, delete on public.budgets to authenticated;
