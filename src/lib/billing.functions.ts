import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";
import type { Sql } from "@/db/client.server";

// Status ASAAS que contam como "pago/ativo".
const RECEIVED = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];
const SUB_ACTIVE = ["ACTIVE"];

function todayPlus(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function getUserContact(sql: Sql, userId: string): Promise<{ email: string; name: string }> {
  const [u] = await sql`SELECT email, name FROM public."user" WHERE id = ${userId}`;
  return { email: u?.email ?? "", name: u?.name ?? u?.email ?? "Cliente" };
}

async function ensureCustomer(sql: Sql, userId: string, cpfCnpj: string): Promise<string> {
  const [existing] = await sql`
    SELECT asaas_customer_id FROM app.billing_customers WHERE user_id = ${userId}
  `;
  if (existing?.asaas_customer_id) return existing.asaas_customer_id;

  const { asaas } = await import("@/lib/asaas.server");
  const { email, name } = await getUserContact(sql, userId);
  const customer = await asaas.createCustomer({
    name,
    cpfCnpj,
    email: email || undefined,
    externalReference: `erp:user:${userId}`,
  });
  await sql`
    INSERT INTO app.billing_customers (user_id, asaas_customer_id, cpf_cnpj)
    VALUES (${userId}, ${customer.id}, ${cpfCnpj})
    ON CONFLICT (user_id) DO UPDATE SET asaas_customer_id = EXCLUDED.asaas_customer_id, cpf_cnpj = EXCLUDED.cpf_cnpj
  `;
  return customer.id;
}

/** Regra de acesso: assinatura ativa OU pagamento recebido nos últimos 35 dias. */
export async function computeAccess(
  sql: Sql,
  userId: string,
): Promise<{ active: boolean; reason: string }> {
  const [subActive] = await sql`
    SELECT 1 FROM app.billing_operations
    WHERE user_id = ${userId} AND kind = 'subscription' AND status = ANY(${SUB_ACTIVE})
    LIMIT 1
  `;
  if (subActive) return { active: true, reason: "subscription" };

  const [recentPayment] = await sql`
    SELECT 1 FROM app.billing_operations
    WHERE user_id = ${userId} AND kind = 'payment' AND status = ANY(${RECEIVED})
      AND updated_at >= now() - interval '35 days'
    LIMIT 1
  `;
  if (recentPayment) return { active: true, reason: "payment" };

  return { active: false, reason: "none" };
}

export const getMyBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const access = await computeAccess(context.sql, context.userId);
    const ops = await context.sql`
      SELECT id, kind, asaas_id, status, billing_type, value, cycle, due_date, created_at, updated_at
      FROM app.billing_operations
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const [customer] = await context.sql`
      SELECT asaas_customer_id, cpf_cnpj FROM app.billing_customers WHERE user_id = ${context.userId}
    `;
    return { access, operations: ops ?? [], customer: customer ?? null };
  });

const SubscribeInput = z.object({
  cpfCnpj: z.string().min(11).max(14),
  value: z.number().positive().max(100000),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]).default("PIX"),
  cycle: z
    .enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"])
    .default("MONTHLY"),
});

export const createMySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => SubscribeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { asaas } = await import("@/lib/asaas.server");
    const customerId = await ensureCustomer(context.sql, context.userId, data.cpfCnpj);
    const externalReference = `erp:user:${context.userId}`;
    const sub = await asaas.createSubscription(
      {
        customer: customerId,
        billingType: data.billingType,
        value: data.value,
        nextDueDate: todayPlus(3),
        cycle: data.cycle,
        externalReference,
      },
      `sub:${context.userId}`,
    );
    await context.sql`
      INSERT INTO app.billing_operations
        (user_id, kind, asaas_id, external_reference, billing_type, status, value, cycle, due_date, raw)
      VALUES
        (${context.userId}, 'subscription', ${sub.id}, ${externalReference}, ${data.billingType},
         ${sub.status}, ${data.value}, ${data.cycle}, ${sub.nextDueDate ?? null}, ${context.sql.json(sub as any)})
      ON CONFLICT (kind, asaas_id) DO UPDATE SET status = EXCLUDED.status, raw = EXCLUDED.raw
    `;
    return { id: sub.id, status: sub.status };
  });

const PixInput = z.object({
  cpfCnpj: z.string().min(11).max(14),
  value: z.number().positive().max(100000),
  dueInDays: z.number().int().min(0).max(30).default(3),
});

export const createMyPixCharge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => PixInput.parse(d))
  .handler(async ({ data, context }) => {
    const { asaas } = await import("@/lib/asaas.server");
    const customerId = await ensureCustomer(context.sql, context.userId, data.cpfCnpj);
    const externalReference = `erp:user:${context.userId}`;
    const payment = await asaas.createPayment(
      {
        customer: customerId,
        billingType: "PIX",
        value: data.value,
        dueDate: todayPlus(data.dueInDays),
        externalReference,
      },
      `pix:${context.userId}:${data.value}:${todayPlus(data.dueInDays)}`,
    );
    await context.sql`
      INSERT INTO app.billing_operations
        (user_id, kind, asaas_id, external_reference, billing_type, status, value, due_date, raw)
      VALUES
        (${context.userId}, 'payment', ${payment.id}, ${externalReference}, 'PIX',
         ${payment.status}, ${data.value}, ${payment.dueDate ?? null}, ${context.sql.json(payment as any)})
      ON CONFLICT (kind, asaas_id) DO UPDATE SET status = EXCLUDED.status, raw = EXCLUDED.raw
    `;
    const qr = await asaas.getPixQrCode(payment.id);
    return { id: payment.id, status: payment.status, qrcode: qr };
  });

/** Sincroniza status a partir da bridge (GET /v1/operations) para o usuário atual. */
export const syncMyBilling = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { asaas } = await import("@/lib/asaas.server");
    const ref = `erp:user:${context.userId}`;
    let updated = 0;
    try {
      const ops = await asaas.listOperations();
      for (const op of ops) {
        if (op.externalReference && op.externalReference !== ref) continue;
        const asaasId = op.asaas_id ?? op.id;
        if (!asaasId) continue;
        const res = await context.sql`
          UPDATE app.billing_operations
          SET status = ${op.status}, raw = ${context.sql.json(op as any)}
          WHERE user_id = ${context.userId} AND asaas_id = ${asaasId}
        `;
        updated += res.count ?? 0;
      }
    } catch (e) {
      console.error("[billing] sync failed", e);
    }
    const access = await computeAccess(context.sql, context.userId);
    return { updated, access };
  });
