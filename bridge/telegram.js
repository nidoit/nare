/**
 * NARE Telegram Bridge + AI Agent
 *
 * Uses the official Telegram Bot API via Node.js built-in https.
 * Processes messages through Claude API (Anthropic) and responds.
 * Zero npm dependencies required.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN   — Bot token from @BotFather
 *   ANTHROPIC_API_KEY    — Anthropic API key (optional, for AI responses)
 *   NARE_SYSTEM_INFO     — System info string (optional)
 *
 * Outbound events (stdout → Tauri):
 *   { "event": "ready",        "chatId": "<chat_id>" }
 *   { "event": "bot_info",     "username": "<name>", "name": "<name>" }
 *   { "event": "waiting",      "message": "<string>" }
 *   { "event": "message",      "from": "<chat_id>", "body": "<text>" }
 *   { "event": "error",        "message": "<string>" }
 *
 * Inbound commands (stdin → bridge):
 *   { "command": "send",  "to": "<chat_id>", "body": "<text>" }
 *   { "command": "stop" }
 */

const https = require("https");
const { execSync } = require("child_process");
const os = require("os");

// ── Config ─────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  emit({ event: "error", message: "TELEGRAM_BOT_TOKEN not set" });
  process.exit(1);
}

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let running = true;
let connectedChatId = null;

// ── System info for AI context ─────────────────────────────────────────────

function getSystemInfo() {
  const info = [];
  info.push(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  info.push(`Hostname: ${os.hostname()}`);
  info.push(`User: ${os.userInfo().username}`);
  info.push(`Uptime: ${Math.floor(os.uptime() / 3600)}h`);
  info.push(`Memory: ${Math.floor(os.freemem() / 1e9)}GB free / ${Math.floor(os.totalmem() / 1e9)}GB total`);

  try {
    const distro = execSync("cat /etc/os-release 2>/dev/null | head -2", { encoding: "utf8", timeout: 3000 }).trim();
    if (distro) info.push(distro);
  } catch {}

  return info.join("\n");
}

const SYSTEM_INFO = process.env.NARE_SYSTEM_INFO || getSystemInfo();

const SYSTEM_PROMPT = `You are NARE (Notification & Automated Reporting Engine), a helpful Linux system assistant communicating via Telegram.

You help the user manage their Linux system through natural language commands. You can:
- Check system status (disk, memory, processes, network)
- Install/remove packages
- Manage systemd services
- Read system logs
- Run safe system commands

System Information:
${SYSTEM_INFO}

Rules:
- Keep responses concise (Telegram messages should be brief)
- For destructive commands (rm, package removal, etc.), always warn and ask for confirmation
- Never execute: rm -rf /, dd, mkfs, fork bombs, or chmod 777 /
- Use markdown formatting compatible with Telegram (bold, code blocks)
- If you need to run a command, show the command and its output
- Respond in the same language the user writes in`;

// ── Output helpers ─────────────────────────────────────────────────────────

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

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
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse: ${data.slice(0, 200)}`)); }
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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Claude API ─────────────────────────────────────────────────────────────

// Per-chat conversation history (last N messages for context)
const conversations = new Map();
const MAX_HISTORY = 20;

async function callClaude(chatId, userMessage) {
  if (!API_KEY) {
    return "I'm connected but no Anthropic API key is configured. Please add your API key in NARE settings to enable AI responses.\n\nYou can get one at: https://console.anthropic.com/settings/keys";
  }

  // Get or create conversation history
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  const history = conversations.get(chatId);

  // Check if user wants to run a command
  const cmdMatch = userMessage.match(/^\/run\s+(.+)$/);
  if (cmdMatch) {
    return executeCommand(cmdMatch[1]);
  }

  // Add user message
  history.push({ role: "user", content: userMessage });

  // Trim history if too long
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {
    const response = await claudeRequest(history);
    // Add assistant response to history
    history.push({ role: "assistant", content: response });
    return response;
  } catch (e) {
    return `Error calling Claude API: ${e.message}`;
  }
}

function claudeRequest(messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else if (json.content && json.content[0]) {
            resolve(json.content[0].text);
          } else {
            reject(new Error(`Unexpected response: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Request timed out (120s)"));
    });
    req.write(payload);
    req.end();
  });
}

// ── Command execution ──────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /dd\s+if=/,
  /chmod\s+777\s+\//,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,
  /mkfs\./,
  />\s*\/dev\/sd/,
  />\s*\/dev\/nvme/,
];

function executeCommand(cmd) {
  // Safety check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return `BLOCKED: This command is not allowed for safety reasons.\n\`${cmd}\``;
    }
  }

  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
    const trimmed = output.trim();
    return trimmed
      ? `\`\`\`\n$ ${cmd}\n${trimmed.slice(0, 3000)}\n\`\`\``
      : `Command executed (no output):\n\`${cmd}\``;
  } catch (e) {
    const stderr = e.stderr ? e.stderr.trim() : e.message;
    return `\`\`\`\n$ ${cmd}\nError: ${stderr.slice(0, 2000)}\n\`\`\``;
  }
}

// ── Validate token on startup ──────────────────────────────────────────────

async function validateToken() {
  try {
    const me = await apiGet("getMe");
    if (!me.ok) {
      emit({ event: "error", message: `Invalid bot token: ${me.description || "unknown"}` });
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
            connectedChatId = chatId;
            emit({ event: "ready", chatId });
            await sendTelegram(chatId,
              "NARE connected! I'm your Linux system assistant.\n\n" +
              "Send me any question about your system, or use:\n" +
              "/run <command> — Execute a shell command\n" +
              "/status — System overview\n" +
              "/help — Show available commands"
            );
            continue;
          }

          if (text === "/help") {
            await sendTelegram(chatId,
              "*NARE Commands:*\n\n" +
              "/run `<cmd>` — Execute a shell command\n" +
              "/status — System overview\n" +
              "/help — This message\n\n" +
              "Or just ask me anything in natural language:\n" +
              '• "How much disk space is left?"\n' +
              '• "Install htop"\n' +
              '• "Show recent error logs"'
            );
            continue;
          }

          if (text === "/status") {
            const status = executeCommand("echo '── Disk ──' && df -h / && echo && echo '── Memory ──' && free -h && echo && echo '── Load ──' && uptime");
            await sendTelegram(chatId, status);
            continue;
          }

          // Emit event for Tauri frontend
          emit({ event: "message", from: chatId, body: text });

          // Process with AI (send typing indicator first)
          await apiPost("sendChatAction", { chat_id: chatId, action: "typing" });

          const reply = await callClaude(chatId, text);

          // Send response (split if too long for Telegram's 4096 char limit)
          const chunks = splitMessage(reply, 4000);
          for (const chunk of chunks) {
            await sendTelegram(chatId, chunk);
          }
        }
      }
    } catch (e) {
      emit({ event: "error", message: `Poll error: ${e.message}` });
      await sleep(5000);
    }
  }
}

async function sendTelegram(chatId, text) {
  return apiPost("sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  }).catch(async () => {
    // Retry without parse_mode if Markdown fails
    return apiPost("sendMessage", { chat_id: chatId, text: text });
  });
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  while (text.length > 0) {
    let end = maxLen;
    if (text.length > maxLen) {
      // Try to split at a newline
      const nlIdx = text.lastIndexOf("\n", maxLen);
      if (nlIdx > maxLen / 2) end = nlIdx;
    }
    chunks.push(text.slice(0, end));
    text = text.slice(end);
  }
  return chunks;
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
      handleCommand(JSON.parse(trimmed));
    } catch {}
  }
});

async function handleCommand(cmd) {
  switch (cmd.command) {
    case "send":
      if (cmd.to && cmd.body) {
        await sendTelegram(cmd.to, cmd.body).catch(() => {});
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
  if (API_KEY) {
    emit({ event: "info", message: "AI responses enabled (Claude API)" });
  } else {
    emit({ event: "info", message: "No API key — AI responses disabled. Set Anthropic API key to enable." });
  }
  poll().catch((err) => {
    emit({ event: "error", message: String(err) });
    process.exit(1);
  });
})();
