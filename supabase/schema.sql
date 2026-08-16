-- FinNest Supabase schema
-- Phase 4: PostgreSQL + Auth + RLS
-- Run this in Supabase SQL Editor AFTER creating a new project.
-- Do not put a service-role/secret key in the frontend.

create extension if not exists pgcrypto;

-- ================================
-- Profiles
-- ================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default 'FinNest User',
    currency text not null default 'INR',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ================================
-- Household / Family
-- ================================
create table if not exists public.households (
    id uuid primary key default gen_random_uuid(),
    name text not null default 'My Family',
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    display_name text not null,
    role text not null default 'member' check (role in ('owner', 'member')),
    created_at timestamptz not null default now(),
    unique (household_id, user_id)
);

-- ================================
-- Accounts
-- ================================
create table if not exists public.accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    account_type text not null check (account_type in ('UPI', 'Bank Account', 'Cash', 'Credit Card', 'Other')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, name)
);

-- ================================
-- Expenses
-- ================================
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    household_id uuid references public.households(id) on delete cascade,
    paid_by_member_id uuid references public.household_members(id) on delete set null,
    amount numeric(12,2) not null check (amount > 0),
    category text not null,
    account_id uuid references public.accounts(id) on delete set null,
    expense_type text not null default 'personal' check (expense_type in ('personal', 'shared')),
    note text,
    expense_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (expense_type = 'personal' and household_id is null)
        or
        (expense_type = 'shared' and household_id is not null)
    )
);

-- ================================
-- Income
-- ================================
create table if not exists public.incomes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    amount numeric(12,2) not null check (amount > 0),
    source text not null default 'Other income',
    income_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ================================
-- Budgets
-- ================================
create table if not exists public.budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    category text not null,
    month_start date not null,
    amount numeric(12,2) not null check (amount >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, category, month_start)
);

-- ================================
-- Indexes
-- ================================
create index if not exists idx_expenses_user_date on public.expenses(user_id, expense_date desc);
create index if not exists idx_expenses_household_date on public.expenses(household_id, expense_date desc);
create index if not exists idx_expenses_category on public.expenses(user_id, category);
create index if not exists idx_incomes_user_date on public.incomes(user_id, income_date desc);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month_start);
create index if not exists idx_household_members_user on public.household_members(user_id);
create index if not exists idx_household_members_household on public.household_members(household_id);

-- ================================
-- Updated-at trigger
-- ================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists incomes_set_updated_at on public.incomes;
create trigger incomes_set_updated_at
before update on public.incomes
for each row execute function public.set_updated_at();

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

-- ================================
-- Helper: household membership
-- SECURITY DEFINER avoids RLS recursion when policies check membership.
-- ================================
create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.household_members hm
        where hm.household_id = target_household
          and hm.user_id = auth.uid()
    );
$$;

-- ================================
-- New-user bootstrap
-- Creates profile + personal household + owner membership.
-- ================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_household uuid;
    display_name_value text;
begin
    display_name_value := coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(new.email, 'FinNest User'), '@', 1),
        'FinNest User'
    );

    insert into public.profiles (id, display_name)
    values (new.id, display_name_value)
    on conflict (id) do nothing;

    insert into public.households (name, owner_id)
    values (display_name_value || '''s Family', new.id)
    returning id into new_household;

    insert into public.household_members (household_id, user_id, display_name, role)
    values (new_household, new.id, 'Me', 'owner');

    insert into public.accounts (user_id, name, account_type)
    values
        (new.id, 'UPI', 'UPI'),
        (new.id, 'Bank Account', 'Bank Account'),
        (new.id, 'Cash', 'Cash'),
        (new.id, 'Credit Card', 'Credit Card')
    on conflict (user_id, name) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ================================
-- RLS
-- ================================
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.budgets enable row level security;

-- Profiles: own row only.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Households: members can read; owner can create/update/delete.
drop policy if exists households_select_member on public.households;
create policy households_select_member on public.households
for select to authenticated
using (public.is_household_member(id));

drop policy if exists households_insert_owner on public.households;
create policy households_insert_owner on public.households
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists households_update_owner on public.households;
create policy households_update_owner on public.households
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists households_delete_owner on public.households;
create policy households_delete_owner on public.households
for delete to authenticated
using (owner_id = (select auth.uid()));

-- Household members: members can see their household; owners manage membership.
drop policy if exists household_members_select_member on public.household_members;
create policy household_members_select_member on public.household_members
for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists household_members_insert_owner on public.household_members;
create policy household_members_insert_owner on public.household_members
for insert to authenticated
with check (
    exists (
        select 1 from public.households h
        where h.id = household_id and h.owner_id = (select auth.uid())
    )
);

drop policy if exists household_members_update_owner on public.household_members;
create policy household_members_update_owner on public.household_members
for update to authenticated
using (
    exists (
        select 1 from public.households h
        where h.id = household_id and h.owner_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1 from public.households h
        where h.id = household_id and h.owner_id = (select auth.uid())
    )
);

drop policy if exists household_members_delete_owner on public.household_members;
create policy household_members_delete_owner on public.household_members
for delete to authenticated
using (
    exists (
        select 1 from public.households h
        where h.id = household_id and h.owner_id = (select auth.uid())
    )
);

-- Accounts: private to the owner.
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own on public.accounts
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists accounts_delete_own on public.accounts;
create policy accounts_delete_own on public.accounts
for delete to authenticated
using (user_id = (select auth.uid()));

-- Expenses: personal = owner only; shared = household members.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
for select to authenticated
using (
    user_id = (select auth.uid())
    or (expense_type = 'shared' and household_id is not null and public.is_household_member(household_id))
);

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
for insert to authenticated
with check (
    user_id = (select auth.uid())
    and (
        expense_type = 'personal'
        or (expense_type = 'shared' and household_id is not null and public.is_household_member(household_id))
    )
);

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
for update to authenticated
using (
    user_id = (select auth.uid())
    or (expense_type = 'shared' and household_id is not null and public.is_household_member(household_id))
)
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
using (
    user_id = (select auth.uid())
    or (expense_type = 'shared' and household_id is not null and public.is_household_member(household_id))
);

-- Income: private to owner.
drop policy if exists incomes_select_own on public.incomes;
create policy incomes_select_own on public.incomes
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists incomes_insert_own on public.incomes;
create policy incomes_insert_own on public.incomes
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists incomes_update_own on public.incomes;
create policy incomes_update_own on public.incomes
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists incomes_delete_own on public.incomes;
create policy incomes_delete_own on public.incomes
for delete to authenticated
using (user_id = (select auth.uid()));

-- Budgets: private to owner.
drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
for delete to authenticated
using (user_id = (select auth.uid()));

-- Verification helpers
-- select * from public.profiles;
-- select * from public.households;
-- select * from public.household_members;
-- select * from public.accounts;
