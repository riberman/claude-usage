# Claude Code Usage

A **Linux Cinnamon** panel applet that displays your **Claude Code** usage percentage, powered by the `/usage` command.

```text
Claude 51%
```

Hovering over the applet shows detailed information:

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

---

## ✨ Features

- 📊 **Session usage** displayed directly on the panel.
- 📈 **Weekly usage** shown in the tooltip.
- ⏱️ **Reset time** for both session and week — shown as a formatted date or as a relative countdown ("in 2 hours", "in 3 days").
- 🎨 **Color indicators** — panel text changes color (green / yellow / red) based on configurable usage thresholds. Colors are fully customizable via a color picker.
- 🌐 **Multilanguage** — automatically uses **PT-BR** when the system language is Portuguese, otherwise defaults to **English**.
- 🔄 **Auto-refresh** at a configurable interval (default: 1 minute).
- 🖱️ **Instant refresh** on mouse hover.
- 🚫 Prevents simultaneous queries.
- ⚡ All queries run **asynchronously** — the Cinnamon panel is never blocked.
- 💾 **Keeps the last valid value** if a query fails.
- ⚙️ **Integrated Cinnamon settings panel** for all options.

---

## 🧠 How it works

The applet runs locally:

```bash
claude -p "/usage"
```

It parses the full output to extract:
- The **usage percentage** for the current session and the current week.
- The **reset date/time** for each (e.g. `Oct 5, 6:59am (America/Sao_Paulo)`).

The reset date is parsed into a `Date` object so it can be:
1. Formatted using a user-defined pattern (e.g. `DD/MM HH:mm` → `05/10 06:59`).
2. Shown as a relative time diff (e.g. `in 3 days`, `in 2 hours`).

The project has **no backend, no database, and no external API**.

---

## 📦 Structure

```text
claude-usage@riberman/
├── applet.js           # Main applet logic
├── metadata.json       # Cinnamon applet metadata
├── settings-schema.json # Settings definitions
├── install.sh          # Installer script
└── README.md
```

### `applet.js`

Core applet implementation: Claude Code querying, output parsing, display updates, timers, color logic, i18n, and error handling.

### `metadata.json`

Metadata used by Cinnamon to identify the applet.

### `settings-schema.json`

Defines all configurable options (see Settings section below).

### `install.sh`

Copies all applet files to:

```text
~/.local/share/cinnamon/applets/claude-usage@riberman
```

---

## 🚀 Installation

### One-liner (no git required)

Install directly from GitHub with a single command — works with `wget` or `curl`:

```bash
# with wget
bash <(wget -qO- https://raw.githubusercontent.com/riberman/claude-usage/main/install-remote.sh)

# with curl
bash <(curl -fsSL https://raw.githubusercontent.com/riberman/claude-usage/main/install-remote.sh)
```

This downloads `applet.js`, `metadata.json` and `settings-schema.json` directly into the Cinnamon applets directory and prints next steps.

### Manual (clone the repo)

```bash
git clone https://github.com/riberman/claude-usage.git
cd claude-usage
chmod +x install.sh
./install.sh
```

### After installing (either method)

Open:

**System Settings → Applets → Claude Code Usage**

and add the applet to your panel. No `sudo` required.

---

## ⚙️ Settings

All settings are accessible by right-clicking the applet on the panel and selecting **Configure**.

### General

| Setting | Default | Description |
|---|---|---|
| Refresh interval | `1 min` | How often usage is auto-refreshed (1–60 min) |

### Reset Time Display

| Setting | Default | Description |
|---|---|---|
| Show relative time | `off` | Show countdown ("in 2 hours") instead of a formatted date |
| Session reset format | `DD/MM HH:mm` | Date format for the session reset time |
| Week reset format | `DD/MM HH:mm` | Date format for the week reset time |

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

Colors can be customized via the native Cinnamon color picker (supports RGBA/HEX).

---

## 🌐 Multilanguage

The applet auto-detects the system language via the `LANG` environment variable.

| Language | Display |
|---|---|
| Portuguese (`pt_*`) | PT-BR — "Sessão", "Semana", "Reseta:", "em 2 horas", etc. |
| Any other | English — "Session", "Week", "Resets:", "in 2 hours", etc. |

The tooltip title also adapts:
- PT-BR: `Claude Code Uso`
- EN: `Claude Code Usage`

---

## 🔧 Requirements

- Linux
- Cinnamon Desktop (tested on Cinnamon 6.4)
- Claude Code installed and authenticated

Test before installing:

```bash
claude -p "/usage"
```

---

## 🐛 Troubleshooting

If the applet shows `Claude --%`, run the command manually in a terminal:

```bash
claude -p "/usage"
```

If it works in the terminal but not in the applet, there may be a `PATH` difference in the graphical session. The applet uses `/bin/bash -lc` to load the login shell profile, which normally resolves this.

---

## 🔐 Privacy

The applet only executes Claude Code locally and processes its output.

No data is sent to any server. No prompts or conversations are stored.

---

## 🗺️ Roadmap

- [x] Session and weekly usage on the panel.
- [x] Reset time (formatted date or relative countdown).
- [x] Color indicators by usage level with configurable thresholds and color picker.
- [x] Multilanguage support (EN / PT-BR).
- [ ] Better support for different Cinnamon versions.
- [ ] Better Claude Code path detection.
- [ ] Publish to Cinnamon Spices.

---

## 👤 Author

**riberman**

## 📄 License

See the `LICENSE` file in this repository.
