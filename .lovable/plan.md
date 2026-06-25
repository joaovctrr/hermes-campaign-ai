
## Ajustes solicitados

### 1. Menções com referência ao post de origem
- Migração em `social_mentions`: adicionar colunas `parent_post_id` (text, id do post no Instagram/TikTok/Facebook), `parent_post_url` (text), `parent_post_caption` (text, truncado) e `parent_post_thumbnail` (text, opcional).
- `src/lib/apify.server.ts`: ao normalizar comentários do Instagram/TikTok/Facebook, popular esses campos a partir do payload do actor (ex.: `postUrl`, `videoUrl`, `caption`). Para Twitter (menções), `parent_post_url` = URL do tweet do candidato citado quando existir, senão fica nulo.
- `src/lib/sentiment-refresh.server.ts`: persistir os novos campos no insert.
- UI em `src/routes/_authenticated/sentiment.tsx`: em cada card de menção, mostrar "Em resposta a:" com link para o post original + caption truncada. Adicionar filtro/agrupamento opcional "por post".

### 2. Plano básico sem refresh manual ilimitado
- Regra: plano `basico` só pode disparar refresh manual 1× a cada 24h (Termômetro e Radar). `avancado` 1× a cada 12h. `enterprise` livre.
- Backend: em `src/lib/sentiment.functions.ts` (`refreshSentimentNow`) e `src/lib/news.functions.ts` (`refreshRadar`), checar o último snapshot/última news_item do usuário e o `plan`; bloquear com erro claro ("Disponível em Xh — faça upgrade para liberar refresh manual sob demanda").
- UI: nos botões "Atualizar agora" em `sentiment.tsx` e `radar.tsx`, desabilitar quando dentro da janela, mostrar tooltip com tempo restante e CTA de upgrade. Mostrar selo do plano e regra atual.

### 3. Feedback (útil / não útil) nas recomendações
- Nova tabela `insight_feedback`:
  - `user_id`, `recommendation_text`, `recommendation_hash` (sha256 do texto p/ deduplicar), `context_window` ('24h'|'7d'), `useful` (boolean), `created_at`.
  - RLS por `auth.uid()`; GRANTs padrão authenticated/service_role.
- Server fn `saveInsightFeedback({ text, window, useful })` em novo `src/lib/insight-feedback.functions.ts` + `getRecentFeedback()` que retorna agregados (taxa de aprovação, últimos "não úteis" para alimentar o prompt).
- `src/lib/insights.functions.ts`: incluir no prompt do Gemini um bloco "Recomendações marcadas como NÃO úteis recentemente — não repita esse tom/conteúdo" usando até 10 exemplos do próprio usuário. Recomendações marcadas como úteis viram exemplos "estilo desejado".
- UI no Dashboard: dois botões discretos (👍/👎) por recomendação. Estado persistido; tras o clique mostra "Obrigado — vou ajustar as próximas".

### 4. Histórico de insights (30 dias) no Dashboard
- Nova tabela `insight_history`:
  - `user_id`, `window` ('24h'|'7d'), `generated_at`, `sentiment_trend` (text: 'melhorando'|'estavel'|'piorando'), `positivo_pct`, `neutro_pct`, `negativo_pct`, `top_themes` (jsonb), `recommendations` (jsonb), `refresh_source` (text: 'manual'|'cron').
  - RLS por `auth.uid()`; índice por `(user_id, generated_at desc)`.
- `getMyInsights` em `insights.functions.ts`: depois de gerar, gravar uma linha em `insight_history` (uma para 24h e uma para 7d). Retornar também `last_refresh_at` (timestamp do último registro).
- Server fn `getInsightHistory({ window, days=30 })`.
- UI no Dashboard:
  - Header da seção Insights: "Atualizado em <data/hora>" + botão "Ver histórico".
  - Drawer/painel com timeline (lista por data) mostrando tendência, % positivo/neutro/negativo e top 3 temas. Filtro 24h/7d.

### 5. Tela de logs do cron `refresh-sentiment`
- Nova tabela `cron_run_logs`:
  - `id`, `hook` (text: 'refresh-sentiment'|'refresh-radar'), `started_at`, `finished_at`, `status` (text: 'ok'|'error'), `users_total`, `users_processed`, `users_skipped`, `error` (text, nullable).
- Nova tabela `cron_user_logs` (por perfil disparado):
  - `run_id` (fk), `user_id`, `action` (text: 'processed'|'skipped'), `reason` (text: 'within_interval'|'plan_floor'|'no_handles'|...), `interval_hours`, `plan`, `inserted_count` (int, nullable), `error` (text, nullable).
- RLS: usuário vê apenas suas próprias linhas em `cron_user_logs` (join por user_id); `cron_run_logs` é admin-only (sem policy pra authenticated, só service_role). Para a tela do usuário, criar função SECURITY DEFINER `get_my_cron_history()` que retorna runs em que o usuário aparece + sua ação/motivo.
- `src/routes/api/public/hooks/refresh-sentiment.ts`: instrumentar — abrir run, escrever 1 linha por perfil (processado ou pulado com motivo), fechar run no fim. Mesmo tratamento opcional para `refresh-radar` (escopo: só sentiment se quiser limitar; plano inclui ambos por consistência).
- Nova rota `src/routes/_authenticated/logs.tsx` (item na sidebar "Logs de coleta"):
  - Tabela das últimas execuções relevantes ao usuário com colunas: data/hora, hook, ação (Processado/Pulado), motivo, intervalo configurado, plano, itens novos inseridos.
  - Filtros por hook e por status. Paginação simples (últimos 50).

### Migrações necessárias (em ordem)
1. Alter `social_mentions` (+ 4 colunas de parent post).
2. Create `insight_feedback` + grants + RLS + policies.
3. Create `insight_history` + grants + RLS + policies + índice.
4. Create `cron_run_logs` + `cron_user_logs` + grants + RLS + função `get_my_cron_history()`.

### Arquivos a criar/alterar
- Criar: `src/lib/insight-feedback.functions.ts`, `src/lib/cron-logs.functions.ts`, `src/routes/_authenticated/logs.tsx`.
- Alterar: `src/lib/apify.server.ts`, `src/lib/sentiment-refresh.server.ts`, `src/lib/sentiment.functions.ts`, `src/lib/news.functions.ts`, `src/lib/insights.functions.ts`, `src/routes/api/public/hooks/refresh-sentiment.ts`, `src/routes/_authenticated/sentiment.tsx`, `src/routes/_authenticated/radar.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/components/app-shell.tsx`.

### Perguntas que assumi (me avise se quiser mudar)
- Janela do refresh manual: **básico 24h, avançado 12h, enterprise livre**.
- Histórico mantém 30 dias (pode crescer; sem TTL automático por enquanto).
- Logs do cron são visíveis ao próprio usuário (apenas suas linhas), não há tela global de admin.
- Aplico a regra de cooldown manual também ao **Radar** (Fase 1), não só ao Termômetro — pra consistência de monetização.
