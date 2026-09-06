/**
 * Shared Telegram sender. Both the daily report and the prune-gate transitions
 * go through here so a notification failure can never fail the pipeline.
 */
export async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping send");
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }

  console.log("✅ Sent message to Telegram");
  return true;
}
