/**
 * NARE Telegram Bridge
 *
 * Uses the official Telegram Bot API via Node.js built-in https.
 * Zero npm dependencies required.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather
 *
 * Outbound events (stdout → Tauri):
 *   { "event": "ready",        "chatId": "<chat_id>" }
 *   { "event": "message",      "from": "<chat_id>", "body": "<text>" }
 *   { "event": "error",        "message": "<string>" }
 *
 * Inbound commands (stdin → bridge):
 *   { "command": "send",  "to": "<chat_id>", "body": "<text>" }
 *   { "command": "stop" }
 */

const https = require("https");

// ── Config ─────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  emit({ event: "error", message: "TELEGRAM_BOT_TOKEN not set" });
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let running = true;

// ── Output helpers ─────────────────────────────────────────────────────────

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ── HTTP helpers (built-in https, no dependencies) ─────────────────────────

function apiGet(method, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const url = `${API_BASE}/${method}${qs ? "?" + qs : ""}`;

    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
          }
        });
      })
      .on("error", reject);
  });
}

function apiPost(method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(`${API_BASE}/${method}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Validate token on startup ──────────────────────────────────────────────

async function validateToken() {
  try {
    const me = await apiGet("getMe");
    if (!me.ok) {
      emit({ event: "error", message: `Invalid bot token: ${me.description || "unknown error"}` });
      process.exit(1);
    }
    emit({ event: "bot_info", username: me.result.username, name: me.result.first_name });
    return me.result;
  } catch (e) {
    emit({ event: "error", message: `Cannot reach Telegram API: ${e.message}` });
    process.exit(1);
  }
}

// ── Long-polling loop ──────────────────────────────────────────────────────

async function poll() {
  while (running) {
    try {
      const result = await apiGet("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: "message",
      });

      if (!result.ok) {
        emit({ event: "error", message: `getUpdates failed: ${result.description}` });
        await sleep(5000);
        continue;
      }

      for (const update of result.result || []) {
        offset = update.update_id + 1;

        if (update.message && update.message.text) {
          const chatId = String(update.message.chat.id);
          const text = update.message.text;

          if (text === "/start") {
            // User initiated connection — emit ready event
            emit({ event: "ready", chatId });
            await apiPost("sendMessage", {
              chat_id: chatId,
              text: "NARE connected! I will manage your Linux system through this chat.",
            });
          } else {
            emit({ event: "message", from: chatId, body: text });
          }
        }
      }
    } catch (e) {
      emit({ event: "error", message: `Poll error: ${e.message}` });
      await sleep(5000);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Stdin command handler ──────────────────────────────────────────────────

let stdinBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuf += chunk;
  const lines = stdinBuf.split("\n");
  stdinBuf = lines.pop();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const cmd = JSON.parse(trimmed);
      handleCommand(cmd);
    } catch {
      // ignore malformed input
    }
  }
});

async function handleCommand(cmd) {
  switch (cmd.command) {
    case "send":
      if (cmd.to && cmd.body) {
        await apiPost("sendMessage", {
          chat_id: cmd.to,
          text: cmd.body,
        }).catch(() => {});
      }
      break;
    case "stop":
      running = false;
      process.exit(0);
      break;
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

(async () => {
  await validateToken();
  emit({ event: "waiting", message: "Send /start to the bot on Telegram to connect" });
  poll().catch((err) => {
    emit({ event: "error", message: String(err) });
    process.exit(1);
  });
})();
