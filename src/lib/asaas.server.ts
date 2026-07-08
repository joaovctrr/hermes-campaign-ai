// Server-only. Cliente da ASAAS Payment Bridge (FastAPI) rodando no mesmo VPS.
// Fala com a bridge (não com o ASAAS direto). Auth por header X-API-Key.
// Base: ASAAS_API_URL (ex. http://asaas-bridge:8000 na rede interna do Coolify).
//
// Envelopes da bridge: sucesso {data}/{data,meta}; erro {error:{code,message,details}}.

const BASE = () => {
  const url = process.env.ASAAS_API_URL;
  if (!url) throw new Error("ASAAS_API_URL ausente");
  return url.replace(/\/$/, "");
};

function apiKey(): string {
  const k = process.env.ASAAS_API_KEY;
  if (!k) throw new Error("ASAAS_API_KEY ausente");
  return k;
}

type Json = Record<string, unknown>;

async function request<T = Json>(
  method: "GET" | "POST",
  path: string,
  body?: Json,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "X-API-Key": apiKey(),
    Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    /* resposta não-JSON */
  }

  if (!res.ok || payload?.error) {
    const msg = payload?.error?.message ?? `ASAAS bridge ${res.status}`;
    throw new Error(msg);
  }
  return (payload?.data ?? payload) as T;
}

// ---------------------------------------------------------------------------
// Tipos mínimos (só o que o app usa)
// ---------------------------------------------------------------------------
export type AsaasCustomer = { id: string; name?: string; cpfCnpj?: string; email?: string };
export type AsaasPayment = {
  id: string;
  status: string;
  billingType: string;
  value: number;
  dueDate?: string;
  invoiceUrl?: string;
};
export type AsaasSubscription = {
  id: string;
  status: string;
  billingType: string;
  value: number;
  cycle: string;
  nextDueDate?: string;
};
export type AsaasPixQrCode = { encodedImage?: string; payload?: string; expirationDate?: string };
export type AsaasOperation = {
  id: string;
  kind?: string;
  asaas_id?: string;
  status: string;
  externalReference?: string;
  value?: number;
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export const asaas = {
  createCustomer: (input: {
    name: string;
    cpfCnpj: string;
    email?: string;
    externalReference?: string;
  }) => request<AsaasCustomer>("POST", "/v1/customers", input),

  createPayment: (
    input: {
      customer: string;
      billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
      value: number;
      dueDate: string;
      externalReference?: string;
    },
    idempotencyKey?: string,
  ) => request<AsaasPayment>("POST", "/v1/payments", input, idempotencyKey),

  getPixQrCode: (paymentId: string) =>
    request<AsaasPixQrCode>("GET", `/v1/payments/${paymentId}/pix-qrcode`),

  refundPayment: (paymentId: string) =>
    request<AsaasPayment>("POST", `/v1/payments/${paymentId}/refund`),

  createSubscription: (
    input: {
      customer: string;
      billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
      value: number;
      nextDueDate: string;
      cycle:
        | "WEEKLY"
        | "BIWEEKLY"
        | "MONTHLY"
        | "BIMONTHLY"
        | "QUARTERLY"
        | "SEMIANNUALLY"
        | "YEARLY";
      externalReference?: string;
    },
    idempotencyKey?: string,
  ) => request<AsaasSubscription>("POST", "/v1/subscriptions", input, idempotencyKey),

  getSubscription: (subscriptionId: string) =>
    request<AsaasSubscription>("GET", `/v1/subscriptions/${subscriptionId}`),

  // Auditoria/sync — a bridge atualiza operations.status via webhook do ASAAS.
  listOperations: () => request<AsaasOperation[]>("GET", "/v1/operations"),
};
