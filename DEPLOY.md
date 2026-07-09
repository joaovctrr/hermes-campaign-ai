# Deploy — Coolify + Postgres próprio (db_agora) + ASAAS

Migração do Supabase Cloud para infra própria. App = TanStack Start (SSR, Nitro
node-server, Bun). Auth = better-auth. Dados = Postgres `db_agora`. Pagamentos =
ASAAS Payment Bridge (mesmo VPS).

## 0. Pré-requisitos
- Acesso ao `db_agora` (`postgresql-alliance-prod` @ `100.83.44.73:15432`).
- Coolify no VPS; bridge ASAAS (`ASAAS_API/`) já rodando no VPS.
- Node/Bun local para rodar o CLI do better-auth e as migrations.

## 1. Role do app no Postgres
Crie um usuário dedicado e o schema (o schema `app` também é criado pela migration):
```sql
CREATE ROLE agora_app LOGIN PASSWORD 'TROQUE';
GRANT CONNECT ON DATABASE db_agora TO agora_app;
-- após aplicar as migrations:
GRANT USAGE ON SCHEMA app TO agora_app;
GRANT ALL ON ALL TABLES IN SCHEMA app TO agora_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO agora_app;
-- better-auth cria tabelas em public: garanta acesso
GRANT USAGE ON SCHEMA public TO agora_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO agora_app;
```
`DATABASE_URL=postgres://agora_app:TROQUE@100.83.44.73:15432/db_agora`

## 2. Tabelas do better-auth (public."user"/"session"/"account"/"verification")
Rode ANTES da migration do app (a FK do schema app referencia `public."user"`):
```bash
# gera/aplica o schema do better-auth a partir de src/lib/auth.server.ts
DATABASE_URL=... npx @better-auth/cli@latest migrate --config src/lib/auth.server.ts
# (ou `generate` para revisar o SQL antes de aplicar)
```

## 3. Schema da aplicação
```bash
psql "$DATABASE_URL" -f db/migrations/0001_app_schema.sql
```

## 4. Migração de dados do Supabase Cloud (opcional, se há dados/usuários)
O Supabase dá conexão Postgres direta ao projeto (`ldbjhozhvnjsuzwckcbg`).
Defina `SUPA_URL` = connection string do projeto cloud.

**4a. Usuários** — exporte de `auth.users` e insira em `public."user"` + `public."account"`.
Os ids uuid do Supabase são preservados como TEXT.
```bash
# emails + metadata
psql "$SUPA_URL" -Atc "SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email), created_at FROM auth.users" \
  > /tmp/users.tsv
```
Insira em `public."user"` (colunas do better-auth: id, email, name, emailVerified, createdAt,
updatedAt) e crie o profile correspondente em `app.profiles` (ou deixe o app criar no 1º login).

**Senhas:** o GoTrue guarda bcrypt em `auth.users.encrypted_password`. Duas opções:
- **Forçar reset** (recomendado se poucos usuários): não migre senha; peça "esqueci a senha".
- **Migrar bcrypt**: insira em `public."account"` (providerId='credential', password=<hash bcrypt>)
  e configure um verificador bcrypt custom no better-auth (`emailAndPassword.password.verify`).
Usuários que logam com Google apenas re-vinculam por e-mail no 1º login.

**4b. Dados de aplicação** — copie as tabelas (o `user_id` uuid vira TEXT automaticamente):
```bash
for t in profiles news_items generated_posts social_mentions sentiment_snapshots \
         insight_feedback insight_history cron_run_logs cron_user_logs user_roles; do
  psql "$SUPA_URL" -c "\\copy (SELECT * FROM public.$t) TO '/tmp/$t.csv' CSV HEADER"
  psql "$DATABASE_URL" -c "\\copy app.$t FROM '/tmp/$t.csv' CSV HEADER"
done
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW app.dashboard_stats;"
```
Ajuste colunas se o CSV divergir (ex.: `profiles` ganhou defaults). Rode numa janela sem tráfego.

## 5. Google OAuth
- Google Cloud Console → OAuth client (Web). Authorized redirect URI:
  `https://SEU_DOMINIO/api/auth/callback/google`.
- Preencha `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 6. ASAAS
- Provisione a API key deste sistema na bridge:
  `POST /v1/admin/api-clients` com header `X-Root-Key` → guarde `ak_...` em `ASAAS_API_KEY`.
- `ASAAS_API_URL` = endereço interno da bridge (rede Coolify ou Tailscale).
- (Opcional) configure a bridge para encaminhar eventos → `POST /api/public/hooks/asaas`
  com `x-webhook-secret: $ASAAS_WEBHOOK_SECRET`. Caso contrário, use `syncMyBilling` (poll).

## 7. Coolify
- Nova **Application** apontando pro repositório Git; build pack = **Dockerfile**.
- Porta exposta: **3000**. Domínio + TLS (Let's Encrypt). Healthcheck em `/`.
- **Environment variables** (runtime): todas do `.env.example`
  (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_*`, `ASAAS_*`,
  `CRON_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `APIFY_TOKEN`, `ADMIN_EMAILS`).
- **Rede**: garanta que o container alcança o `db_agora` (Tailscale no host/container
  ou rede interna) e a bridge ASAAS. `BETTER_AUTH_URL` = domínio público https.

## 8. Cron (substitui o pg_cron do Supabase)
Agende chamadas aos hooks (Coolify Scheduled Task ou cron do SO):
```bash
# radar a cada 3h
curl -fsS -X POST https://SEU_DOMINIO/api/public/hooks/refresh-radar    -H "x-api-key: $CRON_SECRET"
# sentimento a cada 6h
curl -fsS -X POST https://SEU_DOMINIO/api/public/hooks/refresh-sentiment -H "x-api-key: $CRON_SECRET"
```

## 9. Verificação
- Local: `.env` preenchido, `bun install`, `bun run dev`. Testar signup email/senha,
  login, login Google, CRUD (profile/radar/studio/sentiment), isolamento por usuário,
  dashboard stats, logs de cron.
- Pagamento (sandbox ASAAS): `createMySubscription` → op gravada; `createMyPixCharge`
  → QR PIX; `syncMyBilling` → status atualiza e libera o gating.
- Build: `bun run build` limpo; imagem sobe no Coolify; container 3000 healthy.
