// Server-only. Instância do better-auth (substitui o Supabase Auth/GoTrue).
// Email+senha e Google OAuth, sessões via cookie. Backend Postgres (db_agora).
//
// Tabelas public."user"/"session"/"account"/"verification" são criadas pelo
// better-auth CLI:  npx @better-auth/cli migrate   (rodar ANTES da migration app).
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

// Pool node-postgres dedicado ao better-auth (o resto do app usa postgres.js).
const pool = new Pool({ connectionString: required("DATABASE_URL") });

// Emails que recebem papel admin automaticamente ao criar conta (lista CSV).
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    // Verificação de e-mail desligada por padrão (Supabase permitia signup direto).
    requireEmailVerification: false,
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  databaseHooks: {
    user: {
      create: {
        // Replica o antigo trigger handle_new_user: cria o profile e, se o email
        // estiver em ADMIN_EMAILS, concede papel admin.
        after: async (user) => {
          const { sql } = await import("@/db/client.server");
          await sql`
            INSERT INTO app.profiles (id, full_name)
            VALUES (${user.id}, ${user.name ?? user.email})
            ON CONFLICT (id) DO NOTHING
          `;
          if (adminEmails.includes((user.email ?? "").toLowerCase())) {
            await sql`
              INSERT INTO app.user_roles (user_id, role)
              VALUES (${user.id}, 'admin')
              ON CONFLICT (user_id, role) DO NOTHING
            `;
          }
        },
      },
    },
  },
  // Deve ser o último plugin: garante que os cookies de sessão sejam setados
  // corretamente nas server functions do TanStack Start.
  plugins: [tanstackStartCookies()],
});

export type Auth = typeof auth;
