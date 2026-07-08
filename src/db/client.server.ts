// Server-only Postgres client (postgres.js) — substitui o Supabase.
// Conecta ao db_agora via DATABASE_URL. Todas as queries de aplicação passam
// por aqui; a autorização é feita explicitamente por user_id (não há mais RLS).
//
// NUNCA importar em código que vai para o bundle do cliente. Carregue dentro de
// server functions / server routes:  const { sql } = await import("@/db/client.server");
import postgres from "postgres";

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const message = "DATABASE_URL ausente — configure a conexão do db_agora.";
    console.error(`[db] ${message}`);
    throw new Error(message);
  }
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: true,
  });
}

let _sql: ReturnType<typeof createSql> | undefined;

export type Sql = ReturnType<typeof createSql>;

// Singleton lazy. Uso: const { sql } = await import("@/db/client.server");
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    if (!_sql) _sql = createSql();
    // @ts-expect-error — encaminha template tag / chamada para o client real
    return _sql(...args);
  },
  get(_target, prop, receiver) {
    if (!_sql) _sql = createSql();
    return Reflect.get(_sql, prop, receiver);
  },
}) as Sql;
