# CLAUDE.md — NARE

> **Notification & Automated Reporting Engine**
> This file is for AI assistants working in this repository. It documents codebase structure, design decisions, conventions, and workflows.

---

## Project Overview

**NARE** is one of three differentiating features of the Blunux Linux distribution (Arch-based). It enables users to manage their Linux system through natural language via Telegram messages, backed by Claude PRO/MAX (OAuth/CLI) or DeepSeek API.

- **App type:** Tauri 2 desktop app (Rust backend + React/TypeScript frontend)
- **Tauri crate:** `nare` (`src-tauri/`)
- **Version:** 0.1.0
- **Author:** Jaewoo Joung (정재우)
- **License:** MIT
- **Parent project:** [blunux2SB](https://github.com/nidoit/blunux2SB)

### Repository Status

This repository contains both **design documentation** (PRD.md, TDD.md) and the **Tauri desktop app implementation** (`src/`, `src-tauri/`, `bridge/`). The app is currently at v0.1.0 — setup wizard only (Claude OAuth / DeepSeek API + Telegram bot setup).

---

## Repository Contents

```
nare/
├── CLAUDE.md               # This file
├── readme.md               # Project header
├── PRD.md                  # Product Requirements Document (Korean/English)
├── TDD.md                  # Technical Design Document
│
├── package.json            # npm: Vite + React + Tauri CLI
├── vite.config.ts          # Vite config (dev server port 1420)
├── tsconfig.json           # TypeScript config
├── index.html              # HTML entry point
│
├── src/                    # React + TypeScript frontend
│   ├── main.tsx            # React entry (wraps App in I18nProvider)
│   ├── App.tsx             # App root — checks setup status, renders wizard
│   ├── App.css             # All styles (CSS custom properties, no framework)
│   ├── i18n.tsx            # i18n system (Swedish/Korean, React context)
│   └── components/
│       ├── SetupWizard.tsx # Multi-step wizard shell + progress bar
│       └── steps/
│           ├── WelcomeStep.tsx     # Step 0: intro & feature list
│           ├── ClaudeAuthStep.tsx  # Step 1: Claude OAuth or DeepSeek API key
│           ├── MessengerStep.tsx   # Step 2: Telegram bot setup
│           └── DoneStep.tsx        # Step 3: confirmation & start
│
├── src-tauri/              # Tauri Rust backend
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json     # App config: window size, sidecar, bundle
│   ├── capabilities/
│   │   └── default.json    # Tauri v2 permission declarations
│   ├── binaries/           # Pre-built sidecar binaries (gitignored)
│   │   └── nare-bridge-x86_64-unknown-linux-gnu  # built by npm run build:bridge
│   └── src/
│       ├── main.rs         # Binary entry (calls lib.rs::run)
│       ├── lib.rs          # Plugin registration + invoke_handler
│       └── commands.rs     # All Tauri commands (see §Commands)
│
└── bridge/                 # Node.js Telegram bridge (zero npm deps)
    └── telegram.js         # Telegram Bot API + Claude CLI / DeepSeek API
```

---

## Architecture

### Process model

```
┌──────────────────────────────────────────────────────────┐
│                  NARE Tauri App (Desktop)                 │
│                                                          │
│  ┌────────────────────────┐   ┌────────────────────────┐ │
│  │  React Frontend        │   │  Rust Backend          │ │
│  │  (Tauri WebView)       │◄──│  (src-tauri/)          │ │
│  │                        │   │                        │ │
│  │  • SetupWizard         │   │  • check_setup_status  │ │
│  │  • ClaudeAuthStep      │   │  • open_claude_login   │ │
│  │  • MessengerStep       │   │  • start_telegram_bridge│ │
│  │  • DoneStep            │   │  • start_services      │ │
│  └────────────────────────┘   └──────────┬─────────────┘ │
│                                          │               │
│                              Node.js child process       │
│                                          │               │
│                              ┌───────────▼─────────────┐ │
│                              │  telegram.js (Node.js)  │ │
│                              │  Telegram Bot API       │ │
│                              │  + Claude CLI / DeepSeek│ │
│                              │  stdout → JSON events   │ │
│                              │  stdin  ← JSON commands │ │
│                              └───────────┬─────────────┘ │
└──────────────────────────────────────────┼───────────────┘
                                           │ HTTPS
                                    Telegram API servers
```

### Claude login flow

```
User clicks "Sign in with Claude"
        │
        ▼
Tauri opens embedded webview → https://claude.ai/login
        │
        │  user logs in normally
        ▼
on_navigation() detects post-login URL
(claude.ai/new | claude.ai/chat/... | claude.ai/)
        │
        ▼
Write ~/.config/nare/credentials/claude  ("oauth:browser")
Emit "claude-auth-success" → React frontend
Close webview window
```

### Telegram bot flow

```
User enters bot token from @BotFather
        │
        ▼
Tauri spawns telegram.js bridge (Node.js child process)
        │
bridge validates token → emits { "event": "bot_info", "username": "..." }
        │
bridge emits { "event": "waiting" }
        │
        │  user sends /start in Telegram
        ▼
bridge emits { "event": "ready", "chatId": "..." }
        │
        ▼
Write ~/.config/nare/config.toml with chat_id
Emit "tg-connected" → React advances to Done step
```

### Components

| Component | Language | Role |
|---|---|---|
| `src/` | React + TypeScript | Setup wizard UI (i18n: Swedish/Korean) |
| `src-tauri/` | Rust (Tauri 2) | Window management, bridge spawn, config I/O |
| `bridge/` | Node.js | Telegram bot + AI (Claude CLI or DeepSeek HTTP) |

---

## Development Workflow

### Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js 18+ (for frontend + bridge)
# On Arch: sudo pacman -S nodejs npm

# Tauri system deps (Arch)
sudo pacman -S webkit2gtk base-devel

# Install JS dependencies
npm install

# For Claude PRO/MAX mode: install Claude CLI (native installer, no Node.js needed)
curl -fsSL https://claude.ai/install.sh | bash
# Or via AUR: yay -S claude-code
```

### Running in development

```bash
npm run tauri dev          # starts Vite dev server + Tauri window
```

### Production build

```bash
npm run tauri build        # produces installer in src-tauri/target/release/bundle/
```

### Tauri commands (Rust → frontend IPC)

| Command | Description |
|---|---|
| `check_setup_status` | Returns `{ claude_configured, messenger_configured }` |
| `open_claude_login` | Opens embedded webview to claude.ai; emits `claude-auth-success` on success |
| `save_api_key` | Saves DeepSeek API key to credentials directory |
| `save_provider_choice` | Stores the selected AI provider ("claude" or "deepseek") |
| `start_telegram_bridge` | Spawns Telegram bridge; emits `tg-bot-info`, `tg-waiting`, `tg-connected` events |
| `stop_bridge` | Kills the running bridge process |
| `start_services` | Runs `systemctl --user enable --now nare-agent.service` |

### Tauri events (Rust → React)

| Event | Payload | When |
|---|---|---|
| `claude-auth-success` | `null` | User completes claude.ai login |
| `tg-bot-info` | `string` (bot username) | Bot token validated |
| `tg-waiting` | `null` | Waiting for user to send /start |
| `tg-connected` | `string` (chat ID) | User sent /start to bot |
| `tg-error` | `string` (error message) | Bridge encountered an error |

---

## Planned Module Structure (future CLI — crates/ai-agent/src/)

```
src/
├── main.rs          # CLI entry: chat, setup, status, memory subcommands
├── agent.rs         # Agent orchestrator + tool-use loop
├── error.rs         # Unified error types (AgentError hierarchy)
├── config.rs        # AgentConfig, Language, ModelId, ProviderType
├── strings.rs       # i18n UI strings (Swedish + Korean)
├── providers/
│   ├── mod.rs       # Provider trait + build_provider()
│   ├── claude.rs    # ClaudeOAuthProvider (subprocess via Claude CLI)
│   └── deepseek.rs  # DeepSeekProvider (OpenAI-compatible HTTP)
├── tools/
│   ├── mod.rs       # SystemTool trait + ToolRegistry
│   ├── packages.rs  # PacmanTool, YayTool
│   ├── services.rs  # SystemctlTool
│   ├── system.rs    # DfTool, PsTool, FreeTool, JournalctlTool, NmcliTool
│   └── safety.rs    # SafetyChecker (permission classification)
├── memory.rs        # Memory struct (markdown-based cross-session context)
├── setup.rs         # SetupWizard TUI
└── ipc.rs           # IPC type stubs (runtime implemented in Phase 2)
```

---

## Tech Stack

### Frontend (src/)

| Package | Version | Purpose |
|---|---|---|
| `react` | 18 | UI framework |
| `react-dom` | 18 | DOM rendering |
| `@tauri-apps/api` | 2 | `invoke`, `listen`, `emit` |
| `@tauri-apps/plugin-shell` | 2 | Sidecar spawn (frontend side) |
| `vite` | 5 | Dev server + bundler |
| `typescript` | 5 | Type checking |

### Rust backend (src-tauri/)

```toml
tauri               = "2"          # app framework
tauri-plugin-shell  = "2"          # sidecar spawn
tauri-plugin-opener = "2"          # open URLs
serde               = "1"          # JSON serialization
serde_json          = "1"
dirs                = "5"          # ~/.config path
```

### Node.js bridge (bridge/)

| File | Purpose |
|---|---|
| `telegram.js` | Telegram Bot API bridge + AI agent (Claude CLI or DeepSeek HTTP). Zero npm dependencies — uses only Node.js built-in `https`. |

---

## Key Data Types

### Message / ContentBlock (agent.rs)

```rust
pub struct Message { pub role: Role, pub content: Vec<ContentBlock> }

pub enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: serde_json::Value },
    ToolResult { tool_use_id: String, content: String, is_error: bool },
}
```

### Provider types (providers/mod.rs)

```rust
// Async trait — implement for every AI backend
pub trait Provider: Send + Sync {
    fn name(&self) -> &str;
    async fn complete(&self, system_prompt, messages, tools, max_tokens)
        -> Result<CompletionResult, ProviderError>;
}
```

### Permission levels (tools/safety.rs)

```rust
pub enum PermissionLevel {
    Safe,                  // auto-execute (read-only system info)
    RequiresConfirmation,  // prompt user before executing
    Blocked,               // never execute
}
```

### Error hierarchy (error.rs)

```
AgentError
├── ProviderError   (API, rate limit, auth, network, subprocess, parse)
├── ToolError       (execution failed, timeout, invalid input, IO)
├── MemoryError     (read/write failures)
├── ConfigError     (not found, parse, missing field, invalid value)
├── SafetyBlock     { reason }
├── UserCancelled
└── Io
```

All error types use `thiserror`. Prefer `AgentError` at function boundaries; use specific sub-errors within modules.

---

## CLI Commands

```
blunux-ai [--blunux-config <path>] <COMMAND>

Commands:
  chat              Interactive REPL (default when no subcommand given)
  setup             First-time setup wizard (TUI with dialoguer)
  status            Show provider, model, memory size, service status
  memory show       Print all memory file contents
  memory clear      Prompt confirmation then delete daily/ and MEMORY.md
  memory refresh    Re-detect system info and rewrite SYSTEM.md
```

---

## Configuration Files

### ~/.config/blunux-ai/config.toml (per-user agent config)

```toml
[ai_agent]
enabled          = true
provider         = "claude"    # "claude" | "deepseek"
messenger        = "telegram"
language         = "auto"      # "auto" | "ko" | "sv"
safe_mode        = true

[telegram]
chat_id          = "123456789"
session_timeout  = 3600
```

### ~/.config/blunux-ai/ directory layout

```
~/.config/blunux-ai/
├── config.toml
├── credentials/             # chmod 600 — never store in config.toml
│   ├── claude               # "oauth:browser" (Claude PRO/MAX login token)
│   ├── deepseek             # DEEPSEEK_API_KEY value
│   └── provider             # Selected provider name ("claude" or "deepseek")
├── automations.toml         # cron-style automation rules
├── memory/
│   ├── SYSTEM.md            # auto-refreshed on startup
│   ├── USER.md              # learned user preferences
│   ├── MEMORY.md            # long-term persistent facts
│   └── daily/YYYY-MM-DD.md
└── logs/commands.log        # append-only command audit log
```

### /usr/share/blunux/config.toml (blunux2SB system config)

The `blunux-config` crate parses this. The `[ai_agent]` section is optional (`#[serde(default)]`) for full backward compatibility.

---

## IPC Protocol (Unix Domain Socket)

Socket path: `/run/user/{uid}/blunux-ai.sock`

```json
// Bridge → Agent: user message
{ "type": "message", "from": "821012345678", "body": "...", "timestamp": "..." }

// Agent → Bridge: AI reply
{ "type": "response", "to": "821012345678", "body": "...", "actions": ["yes_install", "skip"] }

// Bridge → Agent: user selected quick-reply
{ "type": "action", "from": "821012345678", "action": "yes_install" }
```

All IPC messages use `IpcMessage` with `skip_serializing_if = "Option::is_none"` on optional fields.

---

## Tool Inventory

| Tool | Permission | System command |
|---|---|---|
| `check_disk` | Safe | `df -h` |
| `check_memory` | Safe | `free -h` |
| `check_processes` | Safe | `ps aux --sort=-%mem` |
| `read_logs` | Safe | `journalctl --since ... -p ...` |
| `check_network` | Safe | `nmcli device wifi list` |
| `list_packages` | Safe | `pacman -Q` |
| `install_package` | RequiresConfirmation | `yay -S --noconfirm <pkg>` |
| `remove_package` | RequiresConfirmation | `yay -Rns --noconfirm <pkg>` |
| `update_system` | RequiresConfirmation | `sudo pacman -Syu --noconfirm` |
| `manage_service` | RequiresConfirmation | `systemctl {enable,disable,start,stop} <svc>` |
| `run_command` | RequiresConfirmation | generic shell command |

All tools must: capture stdout/stderr separately, return readable string output, timeout after 60s (300s for `update_system`).

---

## Safety Checker Rules

**Blocked (never execute):**
- `rm -rf /` or any absolute path prefixed rm -rf
- `dd if=...` (raw disk write)
- `chmod 777 /`
- Fork bomb: `:(){ :|:& };:`
- `mkfs.*` on block devices
- Pipe to `/dev/sda`, `/dev/nvme*`

**RequiresConfirmation:**
- `pacman -R`, `yay -R` (package removal)
- `pacman -Syu`, `yay -Syu` (system update)
- `systemctl enable/disable/start/stop`
- Any `sudo` command not in the safe list
- `curl ... | sh`, `wget ... | sh`

**Command log format** (`~/.config/blunux-ai/logs/commands.log`):
```
[2026-02-20T09:15:32Z] SAFE        df -h
[2026-02-20T09:16:01Z] CONFIRMED   yay -S google-chrome
[2026-02-20T09:17:45Z] BLOCKED     rm -rf /home/blu
[2026-02-20T09:18:12Z] CANCELLED   sudo pacman -Syu
```

---

## Agent Tool-Use Loop

The core loop in `Agent::chat()`:

```
User message → append to conversation
Build system prompt from memory files
loop (max 10 iterations):
    provider.complete(system, conversation, tools) → CompletionResult
    if StopReason::EndTurn  → return text to user
    if StopReason::ToolUse  →
        for each ToolUse block:
            safety.check(command)
            → Blocked          : append error ToolResult
            → RequiresConfirm  : prompt_confirmation()
                No  : append "cancelled" ToolResult
                Yes : execute, append result ToolResult
            → Safe             : execute, append result ToolResult
        continue loop
```

---

## Memory System

Memory files are read at the start of each conversation to build the system prompt:

```
[System prompt prefix]

## System Information
{SYSTEM.md}

## User Preferences
{USER.md}

## Long-term Memory
{MEMORY.md}

## Today's Session (YYYY-MM-DD)
{daily/YYYY-MM-DD.md}
```

`SYSTEM.md` is auto-refreshed on startup via `detect_system_info()` which reads `/etc/os-release`, `uname`, `lscpu`, etc.

---

## Provider Details

### Claude PRO/MAX (CLI subprocess)

- Spawns: `claude -p "<prompt>" --output-format text`
- Requires `claude` CLI installed (`curl -fsSL https://claude.ai/install.sh | bash` or `yay -S claude-code`)
- Requires Claude PRO or MAX subscription (OAuth login via embedded webview)
- Multi-turn conversation flattened to single prompt string
- Timeout: 120s
- No direct API key needed — uses Claude Code's OAuth session

### DeepSeek

- Endpoint: `https://api.deepseek.com/v1/chat/completions`
- OpenAI-compatible format with tools support
- Auth: `Authorization: Bearer <api_key>`
- Credential: file `~/.config/blunux-ai/credentials/deepseek` (chmod 600)

### Available Models

| Enum variant | API name |
|---|---|
| `ClaudeSonnet46` | `claude-sonnet-4-6` |
| `ClaudeOpus46` | `claude-opus-4-6` |
| `DeepSeekChat` | `deepseek-chat` |
| `DeepSeekCoder` | `deepseek-coder` |

---

## i18n

The frontend uses a React context-based i18n system (`src/i18n.tsx`) supporting **Swedish (sv)** and **Korean (ko)**.

- Language preference is stored in `localStorage` (key: `nare-lang`)
- Default language: Korean
- Users can switch languages in the Settings view
- All UI strings are defined in `src/i18n.tsx` as a `strings` map keyed by string ID
- Components access translations via the `useI18n()` hook: `const { t, lang, setLang } = useI18n()`
- When adding new UI strings, always add both `ko` and `sv` variants
- Never hardcode UI strings directly in components

For the future CLI agent, strings will live in `src/strings.rs` via the `UiKey` enum with Korean and Swedish variants.

---

## Code Conventions

### General Rust

- Edition 2021
- Async-first: all I/O must be `async` (tokio runtime)
- Error propagation via `?`; add context with `.map_err(|e| ConfigError::Parse(e.to_string()))`
- Use `thiserror` for library-style errors, `anyhow` only in `main.rs` if needed
- All serialized types derive `Serialize, Deserialize` via serde
- `serde(rename_all = "snake_case")` or `serde(rename_all = "lowercase")` on enums

### Trait implementations

- `Provider` and `SystemTool` use `#[async_trait]`
- Both traits require `Send + Sync` bounds
- Keep trait methods minimal; add helpers as inherent methods on structs

### Security rules

- **Never** store API keys in `config.toml` — always use separate credential files (chmod 600)
- **Never** execute a command without running it through `SafetyChecker` first
- `RequiresConfirmation` tools must call `prompt_confirmation()` before `execute()`
- Log every executed command to `commands.log`

### File permissions

- `~/.config/blunux-ai/credentials/` files: chmod 600
- `~/.config/blunux-ai/` directory: chmod 700

### blunux2SB compatibility

- ISO runtime contains **only** Rust binaries + Bash scripts — no Node.js, no Python
- Node.js bridge is a post-install component (installed via App Installer card)
- All Rust code must compile as a standalone static-friendly binary
- Config parsing must be backward-compatible (`#[serde(default)]` on all new fields)

---

## Testing

### Unit tests

Place `#[cfg(test)]` blocks inside the same module file being tested.

Key test targets per module:
- `error.rs` — error display strings
- `config.rs` — `Language::from_locale`, `ModelId::api_name`
- `tools/safety.rs` — blocked patterns, RequiresConfirmation triggers, safe commands
- `memory.rs` — file read/write round-trips (use `tempfile` crate), `build_context` with empty files
- `agent.rs` — `Message::user`, `CompletionResult::text`, `CompletionResult::has_tool_use`
- `ipc.rs` — `IpcMessage` JSON serde round-trip

### Integration tests

Place in `crates/ai-agent/tests/`.

Network tests must be skipped when env vars are absent:
```rust
#[cfg_attr(not(env = "INTEGRATION"), ignore)]
async fn test_claude_api_provider() {
    let key = std::env::var("ANTHROPIC_API_KEY").expect("ANTHROPIC_API_KEY required");
    // ...
}
```

Use `tempfile` crate for all filesystem fixtures.

### Running tests

```bash
cargo test -p ai-agent           # unit tests only
INTEGRATION=1 cargo test -p ai-agent   # include network/integration tests
```

---

## Build Integration (blunux2SB)

The `build.jl` Julia script conditionally includes the `blunux-ai` binary in the ISO:

```julia
ai = get(get(cfg, "ai_agent", Dict()), "enabled", false)
if ai
    run(`cargo build --release -p ai-agent`)
    cp("target/release/blunux-ai", "$airootfs/usr/bin/blunux-ai")
end
```

The workspace `Cargo.toml` must include `"crates/ai-agent"` in `members`.

---

## ISO Inclusion Policy

| Component | In ISO? | When installed |
|---|---|---|
| `blunux-ai` binary | Conditional (`ai_agent.enabled`) | ISO build |
| `install-ai-agent.sh` | Yes | ISO build |
| App Installer card JSON | Yes | ISO build |
| Node.js | No | App Installer |
| Claude CLI | No | Native installer or AUR (`yay -S claude-code`) |
| API credentials | Never | User input |

---

## systemd Services (post-install)

```ini
# nare-agent.service
[Service]
ExecStart=/usr/bin/blunux-ai daemon
Environment=BLUNUX_AI_HOME=%h/.config/blunux-ai
```

This is a **systemd user service** (`systemctl --user`), not system-level.

---

## Design Documents

| File | Purpose |
|---|---|
| `PRD.md` | Full product requirements, user stories, architecture diagrams, roadmap, competitive analysis |
| `TDD.md` | Technical design: all data types, trait interfaces, error types, module structure, test plan, build integration |

When implementing a module, read the corresponding section in `TDD.md` first. All Rust type signatures and trait interfaces are specified there and should be followed as written.

---

## Key Risks to Keep in Mind

| Risk | Mitigation |
|---|---|
| Claude Code OAuth policy changes | DeepSeek API is the fallback provider |
| AI executing destructive system commands | Three-level permission model + SafetyChecker blocked patterns — never bypass |
| API keys exposed in config or logs | Credentials always in separate chmod-600 files; commands.log omits key values |
