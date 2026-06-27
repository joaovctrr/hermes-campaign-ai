# Configuração do Supabase (conta nova, sem Lovable)

Este projeto usa um subconjunto pequeno e bem definido do Supabase. Use o
como checklist ao provisionar a conta nova.

## O que o projeto usa

| Produto | Usado? | Para quê |
|---|---|---|
| Database (Postgres) | Sim | Todas as tabelas de domínio (`profiles`, `news_items`, `generated_posts`, `social_mentions`, `sentiment_snapshots`, `cron_run_logs`, `cron_user_logs`, `user_roles`, `insight_feedback`, `insight_history`) |
| Row Level Security (RLS) | Sim | Toda tabela de usuário tem policy `auth.uid() = user_id` (ou `= id`). Multi-tenant depende disso. |
| Auth — e-mail/senha | Sim | Fluxo nativo, já implementado em `src/routes/auth.tsx`, sem dependência de plataforma. |
| Auth — Google OAuth | Sim | Reescrito para usar `supabase.auth.signInWithOAuth` direto (sem Lovable). Precisa de Client ID/Secret do Google. |
| Postgres Functions / RPC | Sim | `has_role`, `get_my_dashboard_stats`, `get_my_cron_history`, `refresh_dashboard_stats`, `handle_new_user`, `touch_updated_at` |
| Extensões `pg_cron` + `pg_net` | Sim | Disparam os webhooks de refresh (notícias e sentimento) periodicamente, de dentro do banco. |
| **Storage** | **Não** | Nenhum upload de arquivo no código (`grep` sem ocorrências de `.storage.`). |
| **Realtime** | **Não** | Nenhuma subscription (`grep` sem ocorrências de `.channel(`). |
| **Edge Functions** | **Não** | Toda lógica de servidor vive no próprio app (TanStack Start server functions), não em `supabase/functions`. |

Ou seja: plano gratuito ou pago básico do Supabase atende — não precisa de
add-ons de Storage/Realtime.

## Passo a passo

### 1. Criar o projeto

1. Crie a conta/organização nova em [supabase.com](https://supabase.com).
2. Crie um novo projeto. Guarde a **senha do banco** (você não vai
   precisar dela no dia a dia, mas é boa prática guardar em um cofre).
3. Em **Project Settings → API**, anote:
   - `Project URL` → vai virar `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` / `publishable` key → vira `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `service_role` key → vira `SUPABASE_SERVICE_ROLE_KEY` (secreta, nunca vai para o client)
   - O ref do projeto (subdomínio antes de `.supabase.co`) → vira `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID`

### 2. Rodar as migrations

O schema todo está versionado em `supabase/migrations/`, em ordem
cronológica pelo nome do arquivo (9 arquivos). São auto-suficientes —
incluem tabelas, RLS, functions e as extensões `pg_cron`/`pg_net`.

**Opção A — Supabase CLI (recomendado):**
```bash
bun add -g supabase   # ou: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <seu-novo-project-ref>
supabase db push
```

**Opção B — manual, pelo SQL Editor do dashboard:**
Abra cada arquivo de `supabase/migrations/` **em ordem alfabética** (que já
é a ordem cronológica, pelo timestamp no nome) e cole o conteúdo no SQL
Editor, um de cada vez, executando em sequência:
```
20260625170553_*.sql
20260625170609_*.sql
20260625172721_*.sql
20260625172741_*.sql
20260625174855_*.sql
20260625180254_*.sql
20260625182014_*.sql
20260625191500_*.sql
20260626002815_*.sql
```

Depois de rodar, confirme que `pg_cron` e `pg_net` aparecem em
**Database → Extensions** como habilitadas.

### 3. Configurar Auth

Em **Authentication → Sign In / Providers**:

1. **Email** já vem habilitado por padrão — confirme que está ativo.
2. **Google**: habilite o provider, gere um OAuth Client ID/Secret no
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "Web application") e cole aqui. O **Authorized redirect URI** a
   cadastrar no Google é:
   ```
   https://<seu-project-ref>.supabase.co/auth/v1/callback
   ```

Em **Authentication → URL Configuration**:
- **Site URL**: o domínio de produção do app (ex.: `https://app.informaagora.com.br`)
- **Redirect URLs**: adicione o mesmo domínio + `/auth` (ex.: `https://app.informaagora.com.br/auth`), e o `http://localhost:8080/auth` para desenvolvimento local.

### 4. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os valores do passo 1,
mais `GOOGLE_GENERATIVE_AI_API_KEY` (veja
[aistudio.google.com/apikey](https://aistudio.google.com/apikey)) e
`APIFY_TOKEN`. Configure as mesmas variáveis no ambiente de produção
(secrets do Cloudflare Workers, via `wrangler secret put NOME_DA_VAR` ou
pelo dashboard da Cloudflare).

### 5. Recriar os cron jobs (passo manual obrigatório)

**Importante:** os jobs `cron.schedule(...)` nunca foram versionados em
nenhuma migration — eles existiam apenas dentro do projeto Supabase
antigo. Você precisa recriá-los manualmente no projeto novo, no SQL
Editor, depois de ter o app implantado (precisa da URL pública final).

Substitua `SEU_DOMINIO` pela URL de produção do app e `SUA_ANON_KEY`
pela `SUPABASE_PUBLISHABLE_KEY` do projeto novo (a mesma key pública do
passo 1 — o endpoint valida esse header, é seguro expor):

```sql
-- Radar de notícias: a cada 3h
select cron.schedule(
  'refresh-radar',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/public/hooks/refresh-radar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'SUA_ANON_KEY'),
    body := '{}'::jsonb
  );
  $$
);

-- Análise de sentimento: a cada 6h
select cron.schedule(
  'refresh-sentiment',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://SEU_DOMINIO/api/public/hooks/refresh-sentiment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'SUA_ANON_KEY'),
    body := '{}'::jsonb
  );
  $$
);
```

Para conferir que os jobs existem: `select * from cron.job;`
Para remover um job (ex.: para recriar): `select cron.unschedule('refresh-radar');`

### 6. Conferir

- [ ] `bun run build` local funciona (não depende do Supabase, mas confirma que nada ficou referenciando a conta antiga).
- [ ] Login por e-mail/senha funciona.
- [ ] Login com Google funciona e cai em `/dashboard`.
- [ ] `select * from cron.job;` mostra os dois jobs.
- [ ] Esperar um ciclo (ou disparar manualmente via `select net.http_post(...)` à mão) e confirmar linhas novas em `news_items` / `social_mentions`.
- [ ] `get_my_dashboard_stats()` retorna dados pelo RPC (usado no dashboard).

## Sobre o `.env` antigo

O arquivo `.env` deste repositório foi removido do controle de versão
nesta migração (`git rm --cached .env`) — ele estava commitado mesmo
estando no `.gitignore`. As chaves que estavam nele eram apenas a
`anon`/`publishable key` (pública por design, protegida por RLS), não a
`service_role`. Ainda assim, ao trocar de conta Supabase, são valores de
outro projeto e ficam inertes — não há necessidade de revogação, só de
substituição pelos novos valores deste guia.
