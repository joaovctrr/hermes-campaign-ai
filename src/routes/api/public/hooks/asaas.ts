import { createFileRoute } from "@tanstack/react-router";

/**
 * Receptor OPCIONAL de webhooks de status vindos da ASAAS Payment Bridge.
 * A bridge já processa /webhooks/asaas do ASAAS e atualiza a operations.status
 * dela; se você configurar a bridge para ENCAMINHAR o evento para este app,
 * apontamos ela para POST /api/public/hooks/asaas com o header
 * `x-webhook-secret: $ASAAS_WEBHOOK_SECRET`.
 *
 * Se a bridge não suportar forward, não use esta rota — o app sincroniza via
 * `syncMyBilling` (GET /v1/operations) sob demanda / em cron.
 *
 * Body aceito (flexível): { asaasId|id, status, kind?, externalReference? }.
 * Sempre responde 200 para não travar a fila do remetente.
 */
export const Route = createFileRoute("/api/public/hooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-webhook-secret");
        if (!secret || secret !== process.env.ASAAS_WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: true, ignored: "invalid_json" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const asaasId: string | undefined =
          body.asaasId ?? body.id ?? body.payment?.id ?? body.subscription?.id;
        const status: string | undefined =
          body.status ?? body.payment?.status ?? body.subscription?.status;

        if (!asaasId || !status) {
          return new Response(JSON.stringify({ ok: true, ignored: "missing_fields" }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { sql } = await import("@/db/client.server");
          await sql`
            UPDATE app.billing_operations
            SET status = ${status}, raw = ${sql.json(body)}
            WHERE asaas_id = ${asaasId}
          `;
        } catch (e) {
          console.error("[asaas-hook] update failed", e);
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
