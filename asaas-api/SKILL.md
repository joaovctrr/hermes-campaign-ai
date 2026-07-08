---
name: asaas-api
description: >-
  Como usar a ASAAS Payment Bridge API (pasta ASAAS_API) — ponte de pagamento
  genérica entre os sistemas da empresa e o ASAAS. Use ao criar cobranças
  (pagamento único, PIX, boleto, cartão), parcelamentos, assinaturas/recorrência,
  clientes, ou ao consultar/gerar código que integra qualquer software da empresa
  a essa API. Gatilhos: "cobrança", "pagamento", "PIX", "boleto", "assinatura",
  "recorrência", "parcelamento", "ASAAS", "webhook de pagamento".
---

# ASAAS Payment Bridge API — guia rápido

Serviço FastAPI standalone (pasta `ASAAS_API/`) que faz a ponte entre os softwares da
empresa e o ASAAS (conta única). Registra tudo em PostgreSQL e trata webhooks.
Docs interativas completas em `/docs` (Swagger) do serviço rodando.

## Autenticação
- Todos os endpoints `/v1/*` (menos admin): header **`X-API-Key: <key>`** (uma key por sistema).
- Admin (criar sistemas): header **`X-Root-Key: <API_ROOT_KEY>`**.
- Corpos em JSON, campos em **camelCase** (convenção ASAAS).

## Provisionar um novo sistema
```
POST /v1/admin/api-clients        Header X-Root-Key
Body: {"name":"Meu Sistema"}      -> 201 {"api_key":"ak_..."}   # guarde: só aparece aqui
```
Ou via CLI: `python -m scripts.create_api_client "Meu Sistema"`.

## Fluxo típico
1. Criar/obter o cliente (`cus_...`) → `POST /v1/customers`.
2. Criar a cobrança com o `customer` retornado.
3. Guardar o `id` da resposta e/ou usar `externalReference` para reconciliar.
4. Receber webhooks em `/webhooks/asaas` (o serviço atualiza `operations.status`).
5. Auditar via `GET /v1/operations`.

## Receitas (payloads prontos)

Cliente:
```json
POST /v1/customers
{"name":"João Silva","cpfCnpj":"12345678909","email":"joao@ex.com","externalReference":"erp:cliente:1"}
```

Pagamento único (PIX):
```json
POST /v1/payments
{"customer":"cus_000123","billingType":"PIX","value":149.90,"dueDate":"2026-08-01","externalReference":"erp:pedido:42"}
```
`billingType`: `BOLETO` | `PIX` | `CREDIT_CARD` | `UNDEFINED`.
QR Code PIX: `GET /v1/payments/{id}/pix-qrcode`. Estorno: `POST /v1/payments/{id}/refund`.

Parcelamento:
```json
POST /v1/installments
{"customer":"cus_000123","billingType":"CREDIT_CARD","dueDate":"2026-08-10","installmentCount":3,"totalValue":300}
```
Exige `installmentCount` (>=2) e **um de** `totalValue` ou `installmentValue`.

Recorrência (assinatura):
```json
POST /v1/subscriptions
{"customer":"cus_000123","billingType":"BOLETO","value":39.90,"nextDueDate":"2026-08-05","cycle":"MONTHLY"}
```
`cycle`: `WEEKLY|BIWEEKLY|MONTHLY|BIMONTHLY|QUARTERLY|SEMIANNUALLY|YEARLY`.
Gerenciar: `GET/PUT/DELETE /v1/subscriptions/{id}`, pagamentos: `GET /v1/subscriptions/{id}/payments`.

## Respostas e erros
- Sucesso: `{"data": {...}}`; coleção: `{"data":[...], "meta":{...}}`.
- Erro: `{"error":{"code","message","details"}}`.
- `401` auth inválida · `403` key sem scope · `404` recurso de outro sistema/inexistente ·
  `422` validação ou erro 4xx do ASAAS · `502` falha no ASAAS.
- Cada sistema só acessa os recursos que ele mesmo criou (isolamento por API key).
- Reenvio seguro: header opcional `Idempotency-Key` nos `POST` de payments/subscriptions/
  installments — repetir a mesma key retorna `200` com o recurso já criado (não duplica cobrança).

## Webhooks
- ASAAS chama `POST /webhooks/asaas` com header `asaas-access-token`.
- Idempotente por id do evento; sempre responde 200 (não pausa a fila do ASAAS).
- Atualiza automaticamente o status da operação vinculada. Nada a fazer no sistema
  consumidor além de, se quiser, consultar `GET /v1/operations`.

## Onde olhar no código
- Rotas: `app/routers/*.py` · Cliente ASAAS: `app/asaas/client.py`
- Schemas (campos aceitos): `app/schemas/*.py` · Modelos/DB: `app/models/*.py`
- Config/env: `app/config.py` · Webhook: `app/services/webhook_handler.py`
- README com todos os endpoints: `ASAAS_API/README.md`
