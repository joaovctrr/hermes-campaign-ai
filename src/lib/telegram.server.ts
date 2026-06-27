type TelegramSendMessageResult = {
  ok: boolean;
  result?: unknown;
  description?: string;
};

export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const payload = (await response.json().catch(() => null)) as TelegramSendMessageResult | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(`Erro ao enviar Telegram: ${payload?.description ?? response.statusText}`);
  }

  return payload;
}
