import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Uso: npm run admin:promote -- email@dominio.com");
  process.exit(1);
}

loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.");
  process.exit(1);
}

if (supabaseUrl.includes("your-project-ref") || serviceRoleKey.includes("your-service-role-key")) {
  console.error(
    "Atualize o .env com as credenciais reais do Supabase antes de rodar este comando.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  global: {
    fetch: createSupabaseFetch(serviceRoleKey),
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

let user;
try {
  user = await findUserByEmail(email);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!user) {
  console.error(`Usuario nao encontrado no Supabase Auth: ${email}`);
  console.error(
    "Crie a conta primeiro pela tela /auth ou pelo painel do Supabase e rode novamente.",
  );
  process.exit(1);
}

const { error } = await supabase.from("user_roles").upsert(
  {
    user_id: user.id,
    role: "admin",
  },
  { onConflict: "user_id,role" },
);

if (error) {
  if (error.message.includes("public.user_roles")) {
    console.error("A tabela public.user_roles ainda nao existe no Supabase remoto.");
    console.error(
      "Aplique as migrations em supabase/migrations antes de promover um administrador.",
    );
  }
  console.error(`Erro ao promover admin: ${error.message}`);
  process.exit(1);
}

console.log(`OK: ${email} agora tem papel admin.`);

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw new Error(`Erro ao listar usuarios: ${error.message}`);

    const user = data.users.find((item) => item.email?.toLowerCase() === targetEmail);
    if (user) return user;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    if (key in process.env) continue;

    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");

    process.env[key] = value;
  }
}

function createSupabaseFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}
