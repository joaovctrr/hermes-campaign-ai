## 1. Corrigir erro do `/dashboard`

**Causa:** `src/lib/insight-feedback.functions.ts` faz `import { createHash } from "crypto"` no topo. O Dashboard importa esse módulo para usar `saveInsightFeedback` / `listMyFeedback`, e o splitter do TanStack só remove o corpo do `.handler()` — imports de topo continuam indo pro bundle do browser, quebrando com "Module 'crypto' has been externalized".

**Correção:** remover o import de Node `crypto` e calcular o hash dentro do `.handler()` usando Web Crypto (`globalThis.crypto.subtle.digest`), que funciona tanto no Workers quanto no Node 20. A função `hashRecommendation` exportada (não usada em outro lugar) vira `async` interna do handler.

## 2. Termômetro Social — filtro por rede

- Adicionar estado `network` (todas | instagram | twitter | tiktok | facebook) controlado por chips clicáveis nos cards de "Distribuição por rede".
- Repassar `network` para `listMyMentions` (o backend já suporta o filtro).
- Chip ativo destacado; clicar de novo limpa o filtro.
- Filtros de rede e sentimento se combinam.

## 3. Modal do post original ao clicar em "Em resposta a"

- Trocar o `<a>` atual por um `<button>` que abre um `Dialog` (shadcn).
- O modal mostra: thumbnail grande, rede + autor, caption completa, data, link "Abrir no <rede>" (target=_blank) usando `parent_post_url`.
- Mantém comportamento atual de abrir externo como ação secundária.
- Nada novo no backend — usa os campos `parent_post_*` já retornados por `listMyMentions`.

## Arquivos tocados

- `src/lib/insight-feedback.functions.ts` — remove import `crypto`, hash via Web Crypto dentro do handler.
- `src/routes/_authenticated/sentiment.tsx` — filtro por rede + modal de post.

Sem migração de banco. Só frontend + um ajuste cirúrgico em um server function.
