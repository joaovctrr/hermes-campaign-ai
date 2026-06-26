# Acesso de administrador para desenvolvimento

Objetivo: dar ao seu email (`rb.joaoalves.dev@gmail.com`) poder de admin para alternar livremente entre os planos (`basic`, `advanced`, `enterprise`) e o status de trial, sem precisar passar pelo Stripe durante o desenvolvimento.

## 1. Modelo de roles (seguro)

Seguindo o padrão recomendado (roles em tabela separada, nunca no `profiles`):

- Criar enum `public.app_role` com valores `admin`, `user`.
- Criar tabela `public.user_roles` (id, user_id → auth.users, role, unique(user_id, role)) com RLS.
- `GRANT SELECT ON public.user_roles TO authenticated` + `GRANT ALL ... TO service_role`.
- Policy: usuário autenticado lê apenas as próprias roles.
- Função `public.has_role(_user_id uuid, _role app_role)` como `SECURITY DEFINER STABLE` com `search_path = public` para evitar recursão em RLS.
- Seed na migração: inserir role `admin` para o `user_id` correspondente ao email `rb.joaoalves.dev@gmail.com` lido de `auth.users` (idempotente via `ON CONFLICT DO NOTHING`). Se o usuário ainda não existir em `auth.users` no momento da migração, a migração não falha — basta rodar novamente após o primeiro login, ou usar a UI de admin (passo 3) depois.

## 2. Server functions de admin

Novo arquivo `src/lib/admin.functions.ts`:

- `amIAdmin()` — `requireSupabaseAuth`, retorna boolean checando `has_role(userId, 'admin')`.
- `setMyPlan({ plan, trialDays? })` — `requireSupabaseAuth` + verificação `has_role(userId, 'admin')`; atualiza `profiles.plan` e, opcionalmente, `profiles.trial_ends_at = now() + interval 'N days'` (ou `null` para encerrar trial). Não usa `supabaseAdmin` — opera no próprio perfil via RLS do usuário autenticado.
- `setMyTrial({ days | endNow })` — mesmo padrão, só mexe em `trial_ends_at`.

Todas validadas com Zod. Retornam erro 403 se não for admin.

## 3. UI de dev tools no Settings

Em `src/routes/_authenticated/settings.tsx`, adicionar um card **"Ferramentas de desenvolvedor"** que só renderiza quando `amIAdmin()` retorna true:

- Select de plano: Básico / Avançado / Enterprise → chama `setMyPlan`.
- Botões rápidos de trial: "Iniciar trial 7 dias", "Encerrar trial agora".
- Badge mostrando plano atual + dias restantes de trial.
- Após cada ação: `invalidateQueries` para que cooldowns, limites de plano e banner de trial reflitam imediatamente.

Para usuários comuns o card simplesmente não aparece — zero impacto visual ou de segurança.

## Detalhes técnicos

- Migração única que cria enum, tabela, grants, RLS, policy, função `has_role` e faz o seed do admin via `INSERT ... SELECT id FROM auth.users WHERE email = 'rb.joaoalves.dev@gmail.com' ON CONFLICT DO NOTHING`.
- `has_role` precisa ser `SECURITY DEFINER` (única exceção justificada — é o padrão Supabase para evitar recursão em RLS) com `search_path` fixo.
- Nenhum uso de `supabaseAdmin` no client path; tudo passa por `requireSupabaseAuth`.
- Sem mudança no fluxo de Stripe/trial em produção: a UI de override é puramente para admins.
