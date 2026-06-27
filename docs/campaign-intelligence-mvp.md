# MVP — Inteligência de Pautas com Memória Legislativa

Este documento descreve a evolução do Informa Ágora para atender o fluxo:

> notícia atualizada + fonte + pauta quente + conexão com atuação anterior do candidato + sugestão responsável de abordagem.

## Objetivo

Criar um módulo que rode automaticamente a cada 2 horas, monitore notícias dentro do universo do candidato, gere um briefing estratégico e envie alertas relevantes no Telegram.

## Fluxo proposto

```text
Temas do candidato
  ↓
Google News RSS / Apify / fontes oficiais
  ↓
news_items
  ↓
IA classifica resumo, urgência e relevância
  ↓
candidate_actions
  ↓
IA cruza notícia com histórico documentado
  ↓
news_briefings
  ↓
Telegram / Dashboard / Estúdio de criação
```

## Entidades novas

### candidate_actions

Memória legislativa/documental do candidato.

Exemplos de registros:

- Projeto de lei apresentado
- Relatoria
- Discurso
- Votação relevante
- Requerimento
- Emenda
- Participação em comissão
- Lei relacionada ao mandato
- Notícia antiga de atuação parlamentar

Campos principais:

- `action_type`
- `title`
- `description`
- `theme`
- `source`
- `source_url`
- `action_date`
- `legislature`
- `keywords`

### news_briefings

Briefing gerado a partir de uma notícia.

Campos principais:

- `news_item_id`
- `relevance_score`
- `connection_level`
- `candidate_connection`
- `suggested_angles`
- `cautions`
- `next_step`
- `telegram_sent_at`

## Template de mensagem Telegram

```text
🚨 PAUTA QUENTE — {tema}

📰 Notícia:
{titulo}

🏛 Fonte:
{fonte}
{url}

🧠 Resumo:
{resumo}

🔗 Relação com atuação anterior:
{candidate_connection}

💬 Abordagens possíveis:
1. {angle_1}
2. {angle_2}
3. {angle_3}

⚠️ Cuidados:
{cautions}

✅ Próximo passo:
{next_step}
```

## Próximos passos técnicos

1. Aplicar a migration `candidate_actions_briefings`.
2. Criar CRUD simples de `candidate_actions` no painel.
3. Criar função server-only para gerar `news_briefings`.
4. Chamar a geração de briefing após o `refreshRadarForUser`.
5. Enviar Telegram apenas quando `relevance_score >= 70` ou `urgency = alta`.
6. Exibir o briefing no detalhe do Estúdio antes da geração de post.
7. Ajustar cron do radar para 2 horas.
