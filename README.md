# AI Usage (Claude / AGY / Codex)

A **Linux Cinnamon** panel applet that displays AI tool usage — **Claude Code**, **AGY (Antigravity CLI)**, or **OpenAI Codex** — directly in the panel. Monitor several tools at once.

---

## 📸 Panel examples

**Claude Code:**
```text
Claude 51%
```

**AGY (Antigravity CLI):**
```text
AGY G:16% C:49%
```
*(G = Gemini Models used, C = Claude & GPT models used)*

**OpenAI Codex (not installed):**
```text
Codex N/A
```

---

## 🪟 Tooltip examples

### Claude Code
```text
Claude Code Usage

Session
█████░░░░░ 51%
Resets: 01/10 20:49

Week
██████░░░░ 57%
Resets: in 3 days

Auto update: 1 min
Hover again to refresh
```

### AGY (Antigravity CLI)
```text
AGY (Antigravity) Usage

Gemini (weekly)
████████░░ 84%
Resets: 31/10 21:36

Claude & GPT (weekly)
█████░░░░░ 49%
Resets: 31/10 22:35

Auto update: 1 min
Hover again to refresh
```

---

## ✨ Features

- 🔍 **Multi-tool**: for each of Claude Code, AGY and Codex choose Off, Show in panel, or Tooltip only (the tooltip lists every enabled tool).
- 📊 **Claude Code** — Session + weekly usage with reset times.
- 🤖 **AGY (Antigravity CLI)** — Gemini Models and Claude & GPT Models weekly quotas, both shown simultaneously.
- 🧩 **OpenAI Codex** — Detects installation; usage data surfaced when the CLI exposes it.
- ⏱️ **Reset time** — shown as a formatted date or a relative countdown ("in 2 hours", "in 3 days").
- 🎨 **Color indicators** — panel text changes color (green / yellow / red) based on configurable usage thresholds.
- 🌐 **Multilanguage** — auto PT-BR / EN based on the system `LANG`.
- 🔄 **Auto-refresh** at a configurable interval (default: 1 minute).
- 🖱️ **Instant refresh** on mouse hover.
- ⚡ All queries run **asynchronously** — the Cinnamon panel is never blocked.
- 💾 **Keeps the last valid value** if a query fails.
- ⚙️ **Integrated Cinnamon settings panel** for all options.

---

## 🧠 How it works

### Claude Code

```bash
claude -p "/usage"
```

Parses text output:
- **Session** usage % and reset date (e.g. `Oct 5, 6:59am`).
- **Weekly** usage % and reset date.

### AGY (Antigravity CLI)

```bash
agy --output-format json -p "/usage"
```

Parses JSON response — richer than text mode:
- **`command.data.groups[]`** — one entry per quota group.
- `remaining_fraction` (0–1) converted to **used %** (`(1 − remaining) × 100`).
- `reset_time` in ISO 8601 (e.g. `2026-10-31T01:35:17Z`) — no month-name parsing needed.
- Two groups displayed: **Gemini Models** and **Claude & GPT models**.

### OpenAI Codex

```bash
codex --help  # path-check only; no /usage equivalent yet
```

Detected via `GLib.find_program_in_path`. Panel shows `Codex N/A` when not installed.

---

## 📦 Structure

```text
claude-usage@riberman/
├── applet.js            # Main applet logic
├── metadata.json        # Cinnamon applet metadata
├── settings-schema.json  # Settings definitions
├── install.sh           # Installer script
└── README.md
```

---

## 🚀 Installation

### One-liner (no git required)

```bash
# with wget
bash <(wget -qO- https://raw.githubusercontent.com/riberman/claude-usage/main/install-remote.sh)

# with curl
bash <(curl -fsSL https://raw.githubusercontent.com/riberman/claude-usage/main/install-remote.sh)
```

### Manual (clone the repo)

```bash
git clone https://github.com/riberman/claude-usage.git
cd claude-usage
chmod +x install.sh
./install.sh
```

### After installing

Open **System Settings → Applets → AI Usage (Claude / AGY / Codex)** and add the applet to your panel. No `sudo` required.

---

## ⚙️ Settings

All settings are accessible by right-clicking the applet → **Configure**.

### General

| Setting | Default | Description |
|---|---|---|
| Claude / AGY / Codex mode | panel / tooltip | Off, Show in panel, or Tooltip only (per tool) |
| Refresh interval | `1 min` | How often usage is auto-refreshed (1–60 min) |


### Reset Time Display

| Setting | Default | Description |
|---|---|---|
| Show relative time | `off` | Show countdown ("in 2 hours") instead of a formatted date |
| Session reset format | `DD/MM HH:mm` | Date format for the Claude session reset time |
| Week reset format | `DD/MM HH:mm` | Date format for the weekly reset time (all tools) |

**Format tokens:**

| Token | Meaning |
|---|---|
| `DD` | Day (zero-padded) |
| `MM` | Month number (zero-padded) |
| `YYYY` | Full year |
| `YY` | 2-digit year |
| `HH` | Hour, 24h (zero-padded) |
| `hh` | Hour, 12h (zero-padded) |
| `mm` | Minutes (zero-padded) |
| `ss` | Seconds (zero-padded) |
| `A` | `AM` or `PM` |

### Colors and Thresholds

| Setting | Default | Description |
|---|---|---|
| Enable colors | `off` | Colorize the panel text based on usage level |
| Yellow threshold | `30%` | Usage above this % switches from green to yellow |
| Red threshold | `50%` | Usage above this % switches to red |
| Green color | `rgba(135,195,79,1)` | Color for low usage |
| Yellow color | `rgba(246,180,50,1)` | Color for medium usage |
| Red color | `rgba(230,90,90,1)` | Color for high usage |

> **AGY color:** uses the **Claude & GPT** group as the primary indicator (higher cost models).

---

## 🌐 Multilanguage

| Language | Display |
|---|---|
| Portuguese (`pt_*`) | PT-BR — "Sessão", "Semana", "Reseta:", "Gemini (semanal)", "Claude & GPT (semanal)", "em 2 horas" |
| Any other | English — "Session", "Week", "Resets:", "Gemini (weekly)", "Claude & GPT (weekly)", "in 2 hours" |

---

## 🔧 Requirements

- Linux
- Cinnamon Desktop (tested on Cinnamon 6.4)
- At least one of:
  - **Claude Code** installed and authenticated (`claude -p "/usage"` works)
  - **AGY (Antigravity CLI)** installed (`agy --output-format json -p "/usage"` works)
  - **OpenAI Codex** installed (detection only for now)

Test before installing:

```bash
# Claude
claude -p "/usage"

# AGY
agy --output-format json -p "/usage"
```

---

## 🐛 Troubleshooting

If the applet shows `--%`, run the relevant command manually:

```bash
claude -p "/usage"
# or
agy --output-format json -p "/usage"
```

If it works in the terminal but not in the applet, there may be a `PATH` difference in the graphical session. The applet uses `/bin/bash -lc` to load the login shell profile, which normally resolves this.

---

## 🔐 Privacy

The applet only executes CLI tools locally and processes their output.

No data is sent to any server. No prompts or conversations are stored.

---

## 🗺️ Roadmap

- [x] Session and weekly usage on the panel (Claude Code).
- [x] Reset time (formatted date or relative countdown).
- [x] Color indicators by usage level with configurable thresholds.
- [x] Multilanguage support (EN / PT-BR).
- [x] **AGY (Antigravity CLI)** support — Gemini + Claude/GPT weekly quotas.
- [x] **OpenAI Codex** detection.
- [x] **Auto-detect** active tool from PATH.
- [ ] OpenAI Codex usage data (pending CLI support).
- [ ] Better support for different Cinnamon versions.
- [ ] Publish to Cinnamon Spices.

---

## 👤 Author

**riberman**

## 📄 License

See the `LICENSE` file in this repository.
