/**
 * NARE Telegram Bridge + AI Agent
 *
 * Uses the official Telegram Bot API via Node.js built-in https.
 * Processes messages through:
 *   - Claude PRO/MAX via Claude CLI (subprocess, OAuth-based)
 *   - DeepSeek API (HTTP, API key)
 * Zero npm dependencies required.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN   — Bot token from @BotFather
 *   AI_PROVIDER          — "claude" or "deepseek" (default: auto-detect)
 *   DEEPSEEK_API_KEY     — DeepSeek API key (for DeepSeek)
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
const { execSync, execFileSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ── Config ─────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  emit({ event: "error", message: "TELEGRAM_BOT_TOKEN not set" });
  process.exit(1);
}

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

// Resolve claude CLI binary — check PATH first, then common install locations
function findClaudeCli() {
  // 1) Try PATH (works if user's shell profile set it up)
  try {
    const result = spawnSync("which", ["claude"], { encoding: "utf8", timeout: 3000 });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  } catch {}

  // 2) Check common installation paths
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "local", "claude"),
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

const CLAUDE_BIN = findClaudeCli();

// Auto-detect provider: explicit env > whichever key is set > claude (CLI)
let AI_PROVIDER = process.env.AI_PROVIDER
  || (DEEPSEEK_KEY ? "deepseek" : "claude");

// Validate the selected provider is actually usable
if (AI_PROVIDER === "claude" && !CLAUDE_BIN) {
  if (DEEPSEEK_KEY) {
    AI_PROVIDER = "deepseek";
    emit({ event: "info", message: "Claude CLI not found in PATH or ~/.local/bin, falling back to DeepSeek" });
  } else {
    emit({ event: "error", message: "Claude CLI not found. Checked PATH and ~/.local/bin/claude. Install it (curl -fsSL https://claude.ai/install.sh | bash) or configure a DeepSeek API key." });
    process.exit(1);
  }
} else if (AI_PROVIDER === "deepseek" && !DEEPSEEK_KEY) {
  emit({ event: "error", message: "DeepSeek selected but no API key configured." });
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let running = true;
let connectedChatId = null;

// ── Permissions ──────────────────────────────────────────────────────────

const PERMS_PATH = path.join(os.homedir(), ".config", "nare", "permissions.json");
const DEFAULT_PERMS = {
  install_packages: false,
  remove_packages: false,
  system_update: false,
  manage_services: false,
  general_commands: false,
};

function loadPermissions() {
  try {
    const data = fs.readFileSync(PERMS_PATH, "utf8");
    return { ...DEFAULT_PERMS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_PERMS };
  }
}

// Safe commands — always auto-executed, no permission needed
const SAFE_PATTERNS = [
  /^\s*df\b/,
  /^\s*free\b/,
  /^\s*ps\b/,
  /^\s*uptime\b/,
  /^\s*uname\b/,
  /^\s*hostname\b/,
  /^\s*lscpu\b/,
  /^\s*lsblk\b/,
  /^\s*ip\s+(addr|link|route)\b/,
  /^\s*nmcli\b/,
  /^\s*journalctl\b/,
  /^\s*pacman\s+-Q/,
  /^\s*cat\s+\/etc\//,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*wc\b/,
  /^\s*whoami\b/,
  /^\s*id\b/,
  /^\s*date\b/,
  /^\s*top\s+-b\b/,
  /^\s*echo\b/,
];

function isSafeCommand(cmd) {
  return SAFE_PATTERNS.some(p => p.test(cmd));
}

function isCommandAllowed(cmd) {
  // Always blocked
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) return { allowed: false, reason: "blocked" };
  }
  const firstWord = cmd.trim().split(/\s+/)[0];
  if (BLOCKED_COMMANDS.includes(firstWord)) return { allowed: false, reason: "blocked" };

  // Always safe
  if (isSafeCommand(cmd)) return { allowed: true };

  // Check permissions for elevated commands
  const perms = loadPermissions();

  if (/\bpacman\s+-S[yu]/i.test(cmd) || /\byay\s+-S[yu]/i.test(cmd)) {
    return { allowed: perms.system_update, reason: "system_update" };
  }
  if (/\bpacman\s+-S\b/.test(cmd) || /\byay\s+-S\b/.test(cmd)) {
    return { allowed: perms.install_packages, reason: "install_packages" };
  }
  if (/\bpacman\s+-R/.test(cmd) || /\byay\s+-R/.test(cmd)) {
    return { allowed: perms.remove_packages, reason: "remove_packages" };
  }
  if (/\bsystemctl\s+(enable|disable|start|stop|restart)\b/.test(cmd)) {
    return { allowed: perms.manage_services, reason: "manage_services" };
  }

  // General command (including sudo)
  return { allowed: perms.general_commands, reason: "general_commands" };
}

// ── i18n ──────────────────────────────────────────────────────────────────

const DEFAULT_LANG = "en";
const chatLanguages = new Map(); // chatId → "ko" | "en" | "sv"

const STRINGS = {
  start: {
    en: "NARE connected! I'm your Linux system assistant.\n\nSend me any question about your system, or use:\n/run <command> — Execute a shell command\n/status — System overview\n/lang — Change language\n/help — Show available commands",
    ko: "NARE 연결 완료! 리눅스 시스템 어시스턴트입니다.\n\n시스템에 대해 자유롭게 질문하거나 명령어를 사용하세요:\n/run <명령어> — 쉘 명령어 실행\n/status — 시스템 상태\n/lang — 언어 변경\n/help — 명령어 목록",
    sv: "NARE ansluten! Jag är din Linux-systemassistent.\n\nStäll frågor om ditt system, eller använd:\n/run <kommando> — Kör ett skalkommando\n/status — Systemöversikt\n/lang — Byt språk\n/help — Visa tillgängliga kommandon",
  },
  help: {
    en: "*NARE Commands:*\n\n/run `<cmd>` — Execute a shell command\n/status — System overview\n/lang — Change language\n/help — This message\n\nOr just ask me anything in natural language:\n• \"How much disk space is left?\"\n• \"Install htop\"\n• \"Show recent error logs\"",
    ko: "*NARE 명령어:*\n\n/run `<명령어>` — 쉘 명령어 실행\n/status — 시스템 상태\n/lang — 언어 변경\n/help — 이 메시지\n\n자연어로 자유롭게 질문할 수도 있습니다:\n• \"디스크 용량 얼마나 남았어?\"\n• \"htop 설치해줘\"\n• \"최근 에러 로그 보여줘\"",
    sv: "*NARE-kommandon:*\n\n/run `<cmd>` — Kör ett skalkommando\n/status — Systemöversikt\n/lang — Byt språk\n/help — Detta meddelande\n\nEller fråga mig vad som helst på naturligt språk:\n• \"Hur mycket diskutrymme finns kvar?\"\n• \"Installera htop\"\n• \"Visa senaste felloggarna\"",
  },
  lang_prompt: {
    en: "Choose your language:",
    ko: "언어를 선택하세요:",
    sv: "Välj ditt språk:",
  },
  lang_set: {
    en: "Language set to *English*.",
    ko: "언어가 *한국어*로 설정되었습니다.",
    sv: "Språket är inställt på *svenska*.",
  },
};

const LANG_LABELS = { en: "English", ko: "한국어", sv: "Svenska" };

function t(chatId, key) {
  const lang = chatLanguages.get(chatId) || DEFAULT_LANG;
  return (STRINGS[key] && STRINGS[key][lang]) || STRINGS[key]?.en || key;
}

function getLang(chatId) {
  return chatLanguages.get(chatId) || DEFAULT_LANG;
}

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

const LANG_INSTRUCTIONS = {
  en: "You MUST respond in English.",
  ko: "반드시 한국어로 답변하세요.",
  sv: "Du MÅSTE svara på svenska.",
};

function buildSystemPrompt(lang) {
  const perms = loadPermissions();
  const allowed = [];
  const denied = [];

  // Categorize permissions
  if (perms.install_packages) allowed.push("install packages (pacman -S, yay -S)");
  else denied.push("install packages");
  if (perms.remove_packages) allowed.push("remove packages (pacman -R, yay -R)");
  else denied.push("remove packages");
  if (perms.system_update) allowed.push("system update (pacman -Syu)");
  else denied.push("system update");
  if (perms.manage_services) allowed.push("manage services (systemctl start/stop/enable/disable)");
  else denied.push("manage services");
  if (perms.general_commands) allowed.push("run other shell commands (including sudo)");
  else denied.push("other shell commands / sudo");

  return `You are NARE (Notification & Automated Reporting Engine), a helpful Linux system assistant communicating via Telegram.

System Information:
${SYSTEM_INFO}

## Command Execution
To run a command, wrap it in <cmd> tags. The system will execute it and return the output.
Example: <cmd>df -h /</cmd>

ALWAYS AUTO-ALLOWED (no permission needed):
- System info: df, free, ps, uptime, uname, hostname, lscpu, lsblk, top -b
- Network: nmcli, ip addr/link/route
- Logs: journalctl
- Packages list: pacman -Q
- File reading: cat /etc/*, head, tail, wc
- Identity: whoami, id, date

PRE-APPROVED by user:
${allowed.length ? allowed.map(a => `- ${a}`).join("\n") : "- (none)"}

NOT APPROVED (do NOT attempt these):
${denied.length ? denied.map(d => `- ${d}`).join("\n") : "- (none)"}

ALWAYS BLOCKED (never execute):
- rm -rf /, dd, mkfs, fork bombs, chmod 777 /, init, reboot, shutdown, halt, poweroff

## Rules
- When you need system information, USE <cmd> tags to get real data — do NOT guess or ask the user to run commands manually
- Keep responses concise (Telegram messages should be brief)
- Use Telegram-compatible markdown (bold, code blocks)
- For NOT APPROVED commands: tell the user to enable the permission in the NARE Settings panel
- ${LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.en}`;
}

// ── Command tag processor ─────────────────────────────────────────────────

function processCommandTags(text) {
  const cmdRegex = /<cmd>([\s\S]*?)<\/cmd>/g;
  let result = text;
  let match;
  let executed = false;

  while ((match = cmdRegex.exec(text)) !== null) {
    const cmd = match[1].trim();
    const check = isCommandAllowed(cmd);

    let replacement;
    if (check.allowed) {
      replacement = executeCommand(cmd);
      executed = true;
    } else if (check.reason === "blocked") {
      replacement = `🚫 *BLOCKED:* \`${cmd}\` is not allowed for safety reasons.`;
    } else {
      replacement = `🔒 *Permission needed:* \`${cmd}\`\nEnable "${check.reason}" in NARE Settings panel.`;
    }
    result = result.replace(match[0], replacement);
  }

  return { text: result, executed };
}

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

// ── AI API ──────────────────────────────────────────────────────────────────

// Per-chat conversation history (last N messages for context)
const conversations = new Map();
const MAX_HISTORY = 20;

async function callAI(chatId, userMessage) {
  // Get or create conversation history
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  const history = conversations.get(chatId);

  // Check if user wants to run a command
  const cmdMatch = userMessage.match(/^\/run\s+(.+)$/);
  if (cmdMatch) {
    const cmd = cmdMatch[1];
    const confirmLabel = needsConfirmation(cmd);
    if (confirmLabel) {
      // Return special marker — caller will handle confirmation UI
      return { needsConfirm: true, cmd, label: confirmLabel };
    }
    return executeCommand(cmd);
  }

  // Add user message
  history.push({ role: "user", content: userMessage });

  // Trim history if too long
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {
    const lang = getLang(chatId);
    const systemPrompt = buildSystemPrompt(lang);
    const MAX_ROUNDS = 3; // max command execution rounds per message

    let response = AI_PROVIDER === "deepseek"
      ? await deepseekRequest(history, systemPrompt)
      : await claudeCliRequest(history, systemPrompt);

    // Process <cmd> tags — loop so AI can see output and do follow-ups
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { text, executed } = processCommandTags(response);
      response = text;
      if (!executed) break; // no commands were executed, done

      // Feed command output back to AI for analysis (only if more rounds left)
      if (round < MAX_ROUNDS - 1 && /<cmd>/.test(response) === false) {
        // AI already has a complete response with inline outputs, done
        break;
      }

      // If the processed text still has <cmd> tags, do another round
      if (/<cmd>/.test(response)) {
        history.push({ role: "assistant", content: response });
        response = AI_PROVIDER === "deepseek"
          ? await deepseekRequest(history, systemPrompt)
          : await claudeCliRequest(history, systemPrompt);
      }
    }

    // Clean up any remaining <cmd> tags that weren't processed
    response = response.replace(/<\/?cmd>/g, "");

    // Add final response to history
    history.push({ role: "assistant", content: response });
    return response;
  } catch (e) {
    return `AI error: ${e.message}`;
  }
}

// ── Claude CLI (PRO/MAX via OAuth) ──────────────────────────────────────────

function claudeCliRequest(history, systemPrompt) {
  return new Promise((resolve, reject) => {
    try {
      // Build prompt with system context and full conversation history
      let conversationText = "";
      for (const msg of history) {
        if (msg.role === "user") {
          conversationText += `Human: ${msg.content}\n\n`;
        } else if (msg.role === "assistant") {
          conversationText += `Assistant: ${msg.content}\n\n`;
        }
      }

      const prompt = `${systemPrompt}\n\nConversation so far:\n${conversationText}Respond to the latest human message.`;

      const output = execFileSync(CLAUDE_BIN, [
        "-p", prompt,
        "--output-format", "text",
      ], {
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });

      resolve(output.trim());
    } catch (e) {
      if (e.status) {
        reject(new Error(`Claude CLI exited with code ${e.status}: ${(e.stderr || "").slice(0, 500)}`));
      } else if (e.killed) {
        reject(new Error("Claude CLI timed out (120s)"));
      } else {
        reject(new Error(`Claude CLI error: ${e.message}. Is 'claude' CLI installed? (curl -fsSL https://claude.ai/install.sh | bash)`));
      }
    }
  });
}

// ── DeepSeek (OpenAI-compatible) ────────────────────────────────────────────

function deepseekRequest(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    if (!DEEPSEEK_KEY) {
      reject(new Error("DeepSeek API key not set"));
      return;
    }

    // DeepSeek uses OpenAI-compatible format with system as a message
    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const payload = JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 1024,
      messages: fullMessages,
    });

    const options = {
      hostname: "api.deepseek.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
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
          } else if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve(json.choices[0].message.content);
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
  /\bcurl\b.*\|\s*\b(sh|bash)\b/,
  /\bwget\b.*\|\s*\b(sh|bash)\b/,
];

// Commands that are always blocked (exact match on first word)
const BLOCKED_COMMANDS = [
  "init", "telinit", "reboot", "shutdown", "halt", "poweroff",
];

// Patterns that require user confirmation before executing
const CONFIRM_PATTERNS = [
  { pattern: /\bsudo\b/,                label: "sudo" },
  { pattern: /\bpacman\s+-S/,           label: "pacman install" },
  { pattern: /\bpacman\s+-R/,           label: "pacman remove" },
  { pattern: /\bpacman\s+-Syu/,         label: "system update" },
  { pattern: /\byay\s+-S/,              label: "yay install" },
  { pattern: /\byay\s+-R/,              label: "yay remove" },
  { pattern: /\byay\s+-Syu/,            label: "system update" },
  { pattern: /\bsystemctl\s+(enable|disable|start|stop|restart)\b/, label: "systemctl" },
];

// Track pending confirmations: chatId → { cmd, timer }
const pendingConfirm = new Map();

function executeCommand(cmd) {
  // Safety check: blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return `🚫 *BLOCKED:* This command is not allowed for safety reasons.\n\`${cmd}\``;
    }
  }

  // Safety check: blocked commands (first word)
  const firstWord = cmd.trim().split(/\s+/)[0];
  if (BLOCKED_COMMANDS.includes(firstWord)) {
    return `🚫 *BLOCKED:* \`${firstWord}\` is not allowed for safety reasons.`;
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

function needsConfirmation(cmd) {
  for (const { pattern, label } of CONFIRM_PATTERNS) {
    if (pattern.test(cmd)) return label;
  }
  return null;
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
        allowed_updates: JSON.stringify(["message", "callback_query"]),
      });

      if (!result.ok) {
        emit({ event: "error", message: `getUpdates failed: ${result.description}` });
        await sleep(5000);
        continue;
      }

      for (const update of result.result || []) {
        offset = update.update_id + 1;

        // Handle inline keyboard callbacks (language selection + command confirmation)
        if (update.callback_query) {
          const cb = update.callback_query;
          const cbChatId = String(cb.message.chat.id);
          const data = cb.data;

          if (data && data.startsWith("lang:")) {
            const lang = data.split(":")[1];
            if (LANG_LABELS[lang]) {
              chatLanguages.set(cbChatId, lang);
              await apiPost("answerCallbackQuery", { callback_query_id: cb.id });
              await sendTelegram(cbChatId, t(cbChatId, "lang_set"));
            }
          } else if (data === "confirm:yes") {
            await apiPost("answerCallbackQuery", { callback_query_id: cb.id });
            const pending = pendingConfirm.get(cbChatId);
            if (pending) {
              clearTimeout(pending.timer);
              pendingConfirm.delete(cbChatId);
              const result = executeCommand(pending.cmd);
              await sendTelegram(cbChatId, result);
            } else {
              await sendTelegram(cbChatId, "No pending command.");
            }
          } else if (data === "confirm:no") {
            await apiPost("answerCallbackQuery", { callback_query_id: cb.id });
            const pending = pendingConfirm.get(cbChatId);
            if (pending) {
              clearTimeout(pending.timer);
              pendingConfirm.delete(cbChatId);
            }
            await sendTelegram(cbChatId, "Cancelled.");
          }
          continue;
        }

        if (update.message && update.message.text) {
          const chatId = String(update.message.chat.id);
          const text = update.message.text;

          if (text === "/start") {
            connectedChatId = chatId;
            emit({ event: "ready", chatId });
            await sendTelegram(chatId, t(chatId, "start"));
            continue;
          }

          if (text === "/help") {
            await sendTelegram(chatId, t(chatId, "help"));
            continue;
          }

          if (text === "/lang") {
            const keyboard = {
              inline_keyboard: [
                [
                  { text: "English", callback_data: "lang:en" },
                  { text: "한국어", callback_data: "lang:ko" },
                  { text: "Svenska", callback_data: "lang:sv" },
                ],
              ],
            };
            await apiPost("sendMessage", {
              chat_id: chatId,
              text: t(chatId, "lang_prompt"),
              reply_markup: JSON.stringify(keyboard),
            });
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

          const reply = await callAI(chatId, text);

          // Handle confirmation-required commands
          if (reply && typeof reply === "object" && reply.needsConfirm) {
            const timer = setTimeout(() => pendingConfirm.delete(chatId), 60000);
            pendingConfirm.set(chatId, { cmd: reply.cmd, timer });
            const keyboard = {
              inline_keyboard: [[
                { text: "Yes, run it", callback_data: "confirm:yes" },
                { text: "Cancel", callback_data: "confirm:no" },
              ]],
            };
            await apiPost("sendMessage", {
              chat_id: chatId,
              text: `⚠️ *${reply.label}* requires confirmation:\n\`${reply.cmd}\`\n\nExecute this command?`,
              parse_mode: "Markdown",
              reply_markup: JSON.stringify(keyboard),
            });
          } else {
            // Send response (split if too long for Telegram's 4096 char limit)
            const chunks = splitMessage(reply, 4000);
            for (const chunk of chunks) {
              await sendTelegram(chatId, chunk);
            }
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
  const providerName = AI_PROVIDER === "deepseek" ? "DeepSeek (API)" : "Claude (CLI/PRO/MAX)";
  emit({ event: "info", message: `AI provider: ${providerName}` });
  poll().catch((err) => {
    emit({ event: "error", message: String(err) });
    process.exit(1);
  });
})();
