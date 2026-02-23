/**
 * NARE WhatsApp Bridge
 *
 * Communicates with the Tauri backend via stdout/stdin (JSON lines).
 *
 * Outbound events (stdout → Tauri):
 *   { "event": "qr",           "data": "<base64 PNG data URL>" }
 *   { "event": "ready",        "phone": "<phone number>" }
 *   { "event": "disconnected", "reason": "<string>" }
 *   { "event": "message",      "from": "<jid>", "body": "<text>" }
 *
 * Inbound commands (stdin → bridge):
 *   { "command": "send",  "to": "<jid>", "body": "<text>" }
 *   { "command": "stop" }
 */

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const path = require("path");
const os = require("os");
const pino = require("pino");

// ── Config ─────────────────────────────────────────────────────────────────

const SESSION_DIR =
  process.env.WA_SESSION_DIR ||
  path.join(os.homedir(), ".config", "nare", "whatsapp", "session");

// Silent logger — Baileys is noisy by default
const logger = pino({ level: "silent" });

// ── Output helpers ─────────────────────────────────────────────────────────

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

let sock = null;

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    // Keep alive ping every 25 s
    keepAliveIntervalMs: 25_000,
  });

  // ── Connection lifecycle ──────────────────────────────────────────────

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const dataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 256 });
        emit({ event: "qr", data: dataUrl });
      } catch (err) {
        emit({ event: "error", message: String(err) });
      }
    }

    if (connection === "open") {
      const phone = (sock.user?.id ?? "").split(":")[0].split("@")[0];
      emit({ event: "ready", phone });
    }

    if (connection === "close") {
      const reason =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : -1;

      if (reason === DisconnectReason.loggedOut) {
        emit({ event: "disconnected", reason: "logged_out" });
        process.exit(0);
      } else {
        // Transient disconnect — reconnect automatically
        emit({ event: "reconnecting", reason: String(reason) });
        setTimeout(connect, 3_000);
      }
    }
  });

  // ── Credentials update ────────────────────────────────────────────────

  sock.ev.on("creds.update", saveCreds);

  // ── Incoming messages ─────────────────────────────────────────────────

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      if (!body) continue;
      emit({ event: "message", from: msg.key.remoteJid, body });
    }
  });
}

// ── Stdin command handler ──────────────────────────────────────────────────

let stdinBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuf += chunk;
  const lines = stdinBuf.split("\n");
  stdinBuf = lines.pop(); // keep partial line
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
      if (sock && cmd.to && cmd.body) {
        await sock.sendMessage(cmd.to, { text: cmd.body }).catch(() => {});
      }
      break;
    case "stop":
      if (sock) await sock.end().catch(() => {});
      process.exit(0);
      break;
  }
}

// ── Start ──────────────────────────────────────────────────────────────────

connect().catch((err) => {
  emit({ event: "error", message: String(err) });
  process.exit(1);
});
