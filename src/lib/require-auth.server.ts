// Middleware de função (TanStack Start) que substitui `requireSupabaseAuth`.
// Valida a sessão better-auth (cookie) e injeta `userId` + `sql` no contexto.
// Sem RLS: a autorização é feita nas queries filtrando por userId.
//
// Imports server-only (auth/pg/postgres) são carregados dinamicamente DENTRO do
// callback .server() para não vazarem para o bundle do cliente — os
// *.functions.ts que usam este middleware são co-empacotados no client.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { Sql } from "@/db/client.server";

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { auth } = await import("@/lib/auth.server");
  const { sql } = await import("@/db/client.server");

  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: No request headers available");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw new Error("Unauthorized");

  return next({
    context: {
      userId: session.user.id as string,
      sql: sql as Sql,
    },
  });
});
