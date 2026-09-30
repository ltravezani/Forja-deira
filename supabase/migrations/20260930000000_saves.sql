-- =============================================================================
-- Forja-deira: save na nuvem.
-- Uma linha por conta na tabela public.saves, com Row Level Security: cada
-- jogador só lê, cria, altera e apaga a PRÓPRIA linha (user_id = auth.uid()).
-- O jogo usa apenas a chave pública (anon); sem login, nada é acessível.
--
-- Como aplicar: Supabase → SQL Editor → New query → cole este arquivo → Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =============================================================================

create table if not exists public.saves (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  rev        integer not null default 1 check (rev > 0),  -- revisão: evita que dois aparelhos se sobrescrevam
  updated_at timestamptz not null default now(),
  constraint saves_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint saves_data_size check (octet_length(data::text) <= 2000000)  -- ~2 MB por conta
);

comment on table public.saves is 'Forja-deira: save do jogo de cada conta (protegido por RLS).';

-- Row Level Security: sem política que permita, ninguém acessa nada.
alter table public.saves enable row level security;

-- Visitantes sem login (papel anon) não têm acesso algum; contas logadas, só via políticas.
revoke all on table public.saves from anon;
revoke all on table public.saves from public;
grant select, insert, update, delete on table public.saves to authenticated;

drop policy if exists "saves: ler o próprio" on public.saves;
create policy "saves: ler o próprio" on public.saves
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "saves: criar o próprio" on public.saves;
create policy "saves: criar o próprio" on public.saves
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "saves: alterar o próprio" on public.saves;
create policy "saves: alterar o próprio" on public.saves
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "saves: apagar o próprio" on public.saves;
create policy "saves: apagar o próprio" on public.saves
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- updated_at sempre com a hora do servidor.
create or replace function public.saves_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch
  before insert or update on public.saves
  for each row execute function public.saves_touch();
