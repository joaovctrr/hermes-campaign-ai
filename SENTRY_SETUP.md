# Integração com Sentry — passo a passo

Documentação apenas — nenhum pacote foi instalado e nenhum arquivo de
código foi alterado. Siga os passos abaixo quando quiser ativar.

## Aviso importante: NÃO use `@sentry/tanstackstart-react` no servidor

A doc oficial do Sentry para TanStack Start recomenda o pacote
`@sentry/tanstackstart-react` também no servidor (`wrapFetchWithSentry`,
`sentryGlobalFunctionMiddleware`, `sentryGlobalRequestMiddleware`). **Não
siga essa parte da doc oficial neste projeto.** Esse pacote anuncia
suporte a `workerd` (runtime do Cloudflare Workers) no `package.json`,
mas todas as condições de export do servidor (`workerd`, `worker`,
`node`) resolvem para o mesmo arquivo, que reexporta `@sentry/node` —
que não roda em Workers (sem APIs Node). É bug confirmado e fechado como
"not planned" pelo time do Sentry
([getsentry/sentry-javascript#20038](https://github.com/getsentry/sentry-javascript/issues/20038)).
Como este projeto builda com o preset `cloudflare-module` do Nitro
(confirmado em `.output/server/wrangler.json` gerado no build), importar
esse pacote no servidor quebra o Worker.

**Workaround recomendado pelo próprio time do Sentry** (usado abaixo):
- Cliente → `@sentry/react` (exporta `init`, `tanstackRouterBrowserTracingIntegration`, igual ao `@sentry/tanstackstart-react`).
- Servidor → `@sentry/cloudflare` (nativo para `workerd`, sem dependência de Node).
- Perde-se apenas os helpers específicos de tracing automático de server functions do TanStack Start — captura de erro manual (`Sentry.captureException`) nos pontos que já existem no código cobre o que importa.

## 1. Criar o projeto no Sentry

1. Crie conta/organização em [sentry.io](https://sentry.io).
2. Crie um projeto plataforma **React**, e anote o **DSN** (em
   **Settings → Projects → [seu projeto] → Client Keys**).
3. Gere um **Auth Token** em **Settings → Auth Tokens** (escopo
   `project:releases` é suficiente) — usado só no build, para subir
   source maps. Nunca exponha esse token ao client.

## 2. Instalar pacotes

```bash
bun add @sentry/react @sentry/cloudflare
bun add -d @sentry/vite-plugin
```

## 3. Variáveis de ambiente

Adicione ao `.env` (e ao `.env.example`, sem valores reais):

```
# DSN do Sentry — público por design (vai para o bundle do client)
VITE_SENTRY_DSN="https://<key>@o<orgId>.ingest.sentry.io/<projectId>"
# Mesmo DSN, lido no Worker (servidor)
SENTRY_DSN="https://<key>@o<orgId>.ingest.sentry.io/<projectId>"
```

E, **só no ambiente de build/CI** (nunca como `VITE_`, nunca em runtime
do Worker):
```
SENTRY_AUTH_TOKEN="seu-auth-token"
SENTRY_ORG="sua-org-slug"
SENTRY_PROJECT="seu-project-slug"
```

Configure `SENTRY_DSN` também como secret do Worker em produção:
```bash
wrangler secret put SENTRY_DSN
```

## 4. Cliente — `src/router.tsx`

Hoje o arquivo é:
```ts
export const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({ ... });
  return router;
};
```

Inicialize o Sentry só no browser (`router.isServer` é `false` no
client), antes do `return router`:
```ts
import * as Sentry from "@sentry/react";
// ...
export const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  if (!router.isServer) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      tracesSampleRate: 0.2,
    });
  }

  return router;
};
```

## 5. Boundary de erro do client — `src/routes/__root.tsx`

O `ErrorComponent` já existe e centraliza todo erro de rota/render no
client. É o mesmo lugar onde antes vivia `reportLovableError` (removido
nesta migração). Adicione a captura ao lado do `console.error` que já
está lá:

```ts
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  Sentry.captureException(error); // adicionar
  const router = useRouter();
  // ...resto inalterado
}
```
(`import * as Sentry from "@sentry/react";` no topo do arquivo.)

## 6. Servidor — `src/server.ts` (entrypoint do Cloudflare Worker)

Hoje o `export default` é:
```ts
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), { status: 500, ... });
    }
  },
};
```

Envolva com `Sentry.withSentry(...)` (de `@sentry/cloudflare`, **não**
`@sentry/tanstackstart-react`) e adicione `captureException` nos dois
pontos que já fazem `console.error` (o catch principal e dentro de
`normalizeCatastrophicSsrResponse`, que existe justamente para recuperar
erros que o h3 engole):

```ts
import * as Sentry from "@sentry/cloudflare";

// ...normalizeCatastrophicSsrResponse: troque o console.error por
// console.error(...) seguido de Sentry.captureException(...)

export default Sentry.withSentry(
  (env: { SENTRY_DSN?: string }) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.2,
  }),
  {
    async fetch(request: Request, env: unknown, ctx: unknown) {
      try {
        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      } catch (error) {
        console.error(error);
        Sentry.captureException(error); // adicionar
        return new Response(renderErrorPage(), { status: 500, ... });
      }
    },
  },
);
```

`Sentry.withSentry` recebe `env` no primeiro argumento — é assim que o
DSN chega sem precisar de `VITE_` (que só existe no bundle do client).

**Sobre o `wrangler.json`:** este projeto não versiona um
`wrangler.toml`/`.jsonc` manual — o Nitro gera `.output/server/wrangler.json`
do zero a cada build, já com `compatibility_flags: ["nodejs_compat"]`
(confirmado no último build). Esse é o único requisito de runtime do
`@sentry/cloudflare`, e já está atendido — nada a configurar aqui.

## 7. Server functions — `src/start.ts`

O `errorMiddleware` já captura qualquer erro não tratado de server
function. Adicione a captura no mesmo catch:

```ts
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    Sentry.captureException(error); // adicionar — import * as Sentry from "@sentry/cloudflare"
    return new Response(renderErrorPage(), { status: 500, ... });
  }
});
```

## 8. Source maps — `vite.config.ts`

Adicione o plugin **depois** de todos os outros no array `plugins`, e
ative `build.sourcemap`:

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

// dentro do array `plugins`, por último:
plugins.push(
  sentryVitePlugin({
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: { filesToDeleteAfterUpload: ["./**/*.map"] },
  }),
);

// no objeto de config retornado por mergeConfig:
build: { sourcemap: "hidden" },
```

`filesToDeleteAfterUpload` evita publicar os `.map` no `.output/public`
final — eles são enviados ao Sentry e depois apagados do build.

## 9. Verificar

1. `bun run build` continua passando.
2. Rode local com `wrangler dev` (ou `vite preview` para o client) e
   force um erro — por exemplo um `throw new Error("teste sentry")`
   temporário em qualquer rota.
3. Confirme que o evento aparece no projeto Sentry em segundos.
4. Confirme no painel do Sentry que o stack trace mostra código-fonte
   legível (não minificado) — valida que o source map subiu certo.
5. Remova o erro de teste.

## Resumo dos pontos de captura

| Camada | Arquivo | O que já existe lá |
|---|---|---|
| Client init | `src/router.tsx` | `getRouter()` — adicionar `Sentry.init` |
| Client error boundary | `src/routes/__root.tsx` | `ErrorComponent` — já tem `console.error`, ex-lugar do `reportLovableError` |
| Worker entrypoint | `src/server.ts` | `export default { fetch }` + `normalizeCatastrophicSsrResponse` — já tem 2 `console.error` |
| Server functions | `src/start.ts` | `errorMiddleware` — já tem `console.error` |
| Source maps | `vite.config.ts` | plugin novo, build-time apenas |
