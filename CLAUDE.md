# CLAUDE.md — Blunux AI Agent (NARE)

> **Notification & Automated Reporting Engine**
> This file is for AI assistants working in this repository. It documents codebase structure, design decisions, conventions, and workflows.

---

## Project Overview

**Blunux AI Agent** is one of three differentiating features of the Blunux Linux distribution (Arch-based). It enables users to manage their Linux system through natural language via WhatsApp messages, backed by Claude or DeepSeek AI.

- **Binary name:** `blunux-ai`
- **Crate name:** `ai-agent`
- **Version:** 1.0.0
- **Author:** Jaewoo Joung (정재우)
- **License:** MIT
- **Parent project:** [blunux2SB](https://github.com/nidoit/blunux2SB)

### Repository Status

This repository (`nidoit/nare`) currently contains **design documentation only**. The full spec is in `PRD.md` (product requirements) and `TDD.md` (technical design). No source code has been committed yet — implementation goes into the `blunux2SB` monorepo as a new Rust crate.

---

## Repository Contents

```
nare/
├── CLAUDE.md         # This file
├── readme.md         # One-line project header
├── PRD.md            # Product Requirements Document (841 lines, Korean/English)
└── TDD.md            # Technical Design Document (1191 lines)
```

---

## Architecture

The system has two processes communicating over a Unix Domain Socket:

```
WhatsApp <──WebSocket──> blunux-whatsapp-bridge (Node.js)
                                │
                    /run/user/$UID/blunux-ai.sock
                                │
                         blunux-ai-agent (Rust)
                                │
                    ┌───────────┴───────────┐
                    │      Provider Layer   │
                    │  Claude API / OAuth   │
                    │  DeepSeek API         │
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │     System Tools      │
                    │  pacman/yay, systemctl│
                    │  journalctl, nmcli    │
                    └───────────────────────┘
```

### Components

| Component | Language | Role |
|---|---|---|
| `crates/ai-agent` | Rust | Core agent: AI provider, tools, memory, CLI |
| `blunux-whatsapp-bridge` | Node.js | WhatsApp ↔ agent IPC bridge |
| `blunux-ai-installer` | Bash | App Installer card script |
| `crates/blunux-config` | Rust | Config parsing (shared, extended with `AiAgent`) |

---

## Planned Module Structure (crates/ai-agent/src/)

```
src/
├── main.rs          # CLI entry: chat, setup, status, memory subcommands
├── agent.rs         # Agent orchestrator + tool-use loop
├── error.rs         # Unified error types (AgentError hierarchy)
├── config.rs        # AgentConfig, Language, ModelId, ProviderType
├── strings.rs       # i18n UI strings (Korean + English)
├── providers/
│   ├── mod.rs       # Provider trait + build_provider()
│   ├── claude.rs    # ClaudeApiProvider (HTTP) + ClaudeOAuthProvider (subprocess)
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

### Rust crate dependencies (Cargo.toml)

```toml
tokio          = { version = "1", features = ["full"] }   # async runtime
reqwest        = { version = "0.12", features = ["json"] } # HTTP (Claude/DeepSeek)
serde          = { version = "1", features = ["derive"] }
serde_json     = "1"
clap           = { version = "4", features = ["derive"] }  # CLI
anyhow         = "1"
thiserror      = "1"
async-trait    = "0.1"
dialoguer      = "0.11"   # setup wizard prompts
crossterm      = "0.27"   # terminal control
indicatif      = "0.17"   # progress bars
toml           = "0.8"
chrono         = { version = "0.4", features = ["serde"] }
dirs           = "5"
blunux-config  = { path = "../blunux-config" }
```

### Node.js bridge

- `whatsapp-web.js` — WhatsApp Web API (unofficial, unofficial risk documented)
- Unix domain socket (Node.js `net` module) for IPC

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
claude_mode      = "oauth"     # "oauth" | "api"
whatsapp_enabled = true
language         = "auto"      # "auto" | "ko" | "en"
safe_mode        = true

[whatsapp]
allowed_numbers  = ["+821012345678"]
require_prefix   = false
session_timeout  = 3600
```

### ~/.config/blunux-ai/ directory layout

```
~/.config/blunux-ai/
├── config.toml
├── credentials/             # chmod 600 — never store in config.toml
│   ├── claude               # ANTHROPIC_API_KEY value
│   └── deepseek             # DEEPSEEK_API_KEY value
├── automations.toml         # cron-style automation rules
├── memory/
│   ├── SYSTEM.md            # auto-refreshed on startup
│   ├── USER.md              # learned user preferences
│   ├── MEMORY.md            # long-term persistent facts
│   └── daily/YYYY-MM-DD.md
├── logs/commands.log        # append-only command audit log
└── whatsapp/session/        # whatsapp-web.js session data
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

### Claude — Mode A: Direct HTTP API

- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Credential: file `~/.config/blunux-ai/credentials/claude` (chmod 600)
- Timeout: 120s

### Claude — Mode B: OAuth (subprocess)

- Spawns: `claude -p "<message>" --output-format json --model <model>`
- Requires `claude` CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Multi-turn conversation flattened to single prompt string
- Timeout: 120s

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

Language is detected from `config.toml`'s `locale.language` list — Korean if any entry starts with `"ko"`, otherwise English.

All user-facing strings live in `src/strings.rs` via the `UiKey` enum. Always add both Korean and English variants. Never hardcode UI strings directly in business logic.

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
- WhatsApp bridge must validate sender against `allowed_numbers` whitelist

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
| Claude Code CLI | No | App Installer |
| `blunux-whatsapp-bridge` | No | App Installer |
| WhatsApp session data | No | User QR scan |
| API credentials | Never | User input |

---

## systemd Services (post-install)

```ini
# blunux-ai-agent.service
[Service]
ExecStart=/usr/bin/blunux-ai daemon
Environment=BLUNUX_AI_HOME=%h/.config/blunux-ai

# blunux-wa-bridge.service
[Unit]
Requires=blunux-ai-agent.service
[Service]
ExecStart=/usr/bin/blunux-wa-bridge
Environment=BLUNUX_AI_SOCK=%t/blunux-ai.sock
```

Both are **systemd user services** (`systemctl --user`), not system-level.

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
| `whatsapp-web.js` is unofficial | Recommend dedicated WhatsApp number; rate-limit messages to ≤5/min; Telegram is the planned alternative |
| Claude Code OAuth policy changes | API mode is the fallback; DeepSeek is the secondary fallback |
| AI executing destructive system commands | Three-level permission model + SafetyChecker blocked patterns — never bypass |
| API keys exposed in config or logs | Credentials always in separate chmod-600 files; commands.log omits key values |
