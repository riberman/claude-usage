const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const UUID = "claude-usage@riberman";

// Hard limits to prevent abuse via settings
const MIN_REFRESH_INTERVAL = 1;   // minutes
const MAX_REFRESH_INTERVAL = 60;  // minutes
const MAX_FORMAT_LENGTH     = 40; // chars — prevents tooltip overflow from user input
const MAX_OUTPUT_BYTES      = 65536; // 64 KB ceiling
const SUBPROCESS_TIMEOUT_MS = 30000; // 30 s hard timeout for the child process

// Tools
const TOOLS = ["claude", "agy", "codex"];
const MODE_OFF = "off", MODE_PANEL = "panel", MODE_TOOLTIP = "tooltip";
const TOOL_CLAUDE = "claude";
const TOOL_AGY    = "agy";
const TOOL_CODEX  = "codex";

function ClaudeUsageApplet(orientation, panelHeight, instanceId) {
    this._init(orientation, panelHeight, instanceId);
}

ClaudeUsageApplet.prototype = {
    // Plain Applet: we build our own box with one icon + label per tool
    __proto__: Applet.Applet.prototype,

    _init: function(orientation, panelHeight, instanceId) {
        Applet.Applet.prototype._init.call(
            this,
            orientation,
            panelHeight,
            instanceId
        );

        this.instanceId = instanceId;

        // ── Resolve icons directory (relative to this file) ──────────────
        const metaPath = GLib.build_filenamev([
            GLib.get_home_dir(),
            ".local", "share", "cinnamon", "applets", UUID
        ]);
        this._iconsDir = GLib.build_filenamev([metaPath, "icons"]);

        // ── Settings defaults ─────────────────────────────────────────────
        this.refreshInterval    = MIN_REFRESH_INTERVAL;
        this.claudeShowDay      = true;
        this.claudeShowWeek     = true;
        this.agyShowGoogle      = true;
        this.agyShowOther       = true;
        this.claudeMode         = MODE_PANEL;
        this.agyMode            = MODE_TOOLTIP;
        this.codexMode          = MODE_TOOLTIP;
        this.showIcons          = true;          // icon vs text label
        this.useRelativeTime    = false;
        this.sessionResetFormat = "DD/MM HH:mm";
        this.weekResetFormat    = "DD/MM HH:mm";
        this.useColors          = false;
        this.thresholdYellow    = 30;
        this.thresholdRed       = 50;
        this.colorGreen         = "rgba(135,195,79,1)";
        this.colorYellow        = "rgba(246,180,50,1)";
        this.colorRed           = "rgba(230,90,90,1)";

        this.settings = new Settings.AppletSettings(this, UUID, instanceId);

        const bindings = [
            "refreshInterval",
            "claudeShowDay",
            "claudeShowWeek",
            "agyShowGoogle",
            "agyShowOther",
            "claudeMode",
            "agyMode",
            "codexMode",
            "showIcons",
            "useRelativeTime",
            "sessionResetFormat",
            "weekResetFormat",
            "useColors",
            "thresholdYellow",
            "thresholdRed",
            "colorGreen",
            "colorYellow",
            "colorRed",
        ];
        for (let key of bindings) {
            this.settings.bindProperty(
                Settings.BindingDirection.IN,
                key, key,
                this._onSettingsChanged,
                null
            );
        }

        // ── i18n ─────────────────────────────────────────────────────────
        const lang = GLib.getenv("LANG") || "";
        const isPtBr = lang.toLowerCase().startsWith("pt");

        this.i18n = {
            title:          isPtBr ? "Uso de IA"                              : "AI Usage",
            loading:        isPtBr ? "Carregando..."                           : "Loading...",
            autoUpdate:     isPtBr ? "Atualização automática:"                 : "Auto update:",
            min:            "min",
            hoverToRefresh: isPtBr ? "Passe o mouse novamente para atualizar"  : "Hover again to refresh",
            error:          isPtBr ? "Não foi possível obter o uso."           : "Could not fetch usage.",
            resets:         isPtBr ? "Reseta:"                                 : "Resets:",
            notInstalled:   isPtBr ? "Não instalado."                          : "Not installed.",
            noSession:      isPtBr ? "Sem sessão ativa"                        : "No active session",
            // Claude
            claudeTitle:    isPtBr ? "Claude Code Uso"                         : "Claude Code Usage",
            session:        isPtBr ? "Sessão"                                  : "Session",
            week:           isPtBr ? "Semana"                                  : "Week",
            // AGY
            agyTitle:       isPtBr ? "Antigravity CLI Uso"                   : "Antigravity CLI Usage",
            gemini:         isPtBr ? "Gemini (semanal)"                        : "Gemini (weekly)",
            claudeGpt:      isPtBr ? "Claude & GPT (semanal)"                  : "Claude & GPT (weekly)",
            // Codex
            codexTitle:     isPtBr ? "OpenAI Codex Uso"                        : "OpenAI Codex Usage",
            codexBurst:     isPtBr ? "Janela (5 horas)"                        : "Window (5-hour)",
            codexWeekly:    isPtBr ? "Semanal"                                 : "Weekly",
            // Relative time
            inDays:         isPtBr ? "em %d dias"    : "in %d days",
            inDay:          isPtBr ? "em 1 dia"      : "in 1 day",
            inHours:        isPtBr ? "em %d horas"   : "in %d hours",
            inHour:         isPtBr ? "em 1 hora"     : "in 1 hour",
            inMinutes:      isPtBr ? "em %d minutos" : "in %d minutes",
            inMinute:       isPtBr ? "em 1 minuto"   : "in 1 minute",
            codexReady:     isPtBr ? "Codex CLI detectado.\nAguardando atividade da sessão..." : "Codex CLI detected.\nWaiting for session activity...",
            noneEnabled:    isPtBr ? "Nenhuma ferramenta ativada nas configurações." : "No tool enabled in settings.",
            justNow:        isPtBr ? "agora mesmo"   : "just now",
        };

        // ── Runtime state — Claude ────────────────────────────────────────
        this.sessionUsage   = null;
        this.sessionReset   = null;
        this.weekUsage      = null;
        this.weekReset      = null;
        this.hasSession     = false;

        // ── Runtime state — AGY ───────────────────────────────────────────
        this.agyGeminiUsage = null;
        this.agyGeminiReset = null;
        this.agyClaudeUsage = null;
        this.agyClaudeReset = null;

        // ── Runtime state — Codex ─────────────────────────────────────────
        this.codexAvailable    = null;
        this.codexSessionUsage = null;
        this.codexSessionReset = null;
        this.codexWeekUsage    = null;
        this.codexWeekReset    = null;

        // ── Internal ──────────────────────────────────────────────────────
        this._status          = {};   // tool -> "ok" | "error" | "missing"
        this._panelItems      = {};   // tool -> {box, icon, label}
        this._queue           = [];
        this.isUpdating       = false;
        this.hoverRefreshDone = false;
        this.refreshTimeoutId = null;
        this._timeoutGuardId  = null;

        this._box = new St.BoxLayout({ style_class: "applet-box", y_align: Clutter.ActorAlign.CENTER, y_expand: true });
        this.actor.add_actor(this._box);

        this.set_applet_tooltip(this.i18n.title + "\n" + this.i18n.loading);
        this._renderPanel();

        this.updateUsage();
        this._scheduleNextUpdate();

        this.actor.connect("enter-event", () => { this._onMouseEnter(); });
        this.actor.connect("leave-event", () => { this.hoverRefreshDone = false; });
    },

    // ─── Settings ────────────────────────────────────────────────────────────

    _onSettingsChanged: function() {
        this.refreshInterval = Math.min(
            MAX_REFRESH_INTERVAL,
            Math.max(MIN_REFRESH_INTERVAL, parseInt(this.refreshInterval) || MIN_REFRESH_INTERVAL)
        );
        this.thresholdYellow = Math.min(99,  Math.max(1,  parseInt(this.thresholdYellow) || 30));
        this.thresholdRed    = Math.min(100, Math.max(2,  parseInt(this.thresholdRed)    || 50));

        if (typeof this.sessionResetFormat !== "string") this.sessionResetFormat = "DD/MM HH:mm";
        if (typeof this.weekResetFormat    !== "string") this.weekResetFormat    = "DD/MM HH:mm";
        this.sessionResetFormat = this.sessionResetFormat.substring(0, MAX_FORMAT_LENGTH);
        this.weekResetFormat    = this.weekResetFormat.substring(0, MAX_FORMAT_LENGTH);

        for (let t of TOOLS) {
            const k = t + "Mode";
            if ([MODE_OFF, MODE_PANEL, MODE_TOOLTIP].indexOf(this[k]) < 0) this[k] = MODE_OFF;
        }

        this._cancelScheduledUpdate();
        this._scheduleNextUpdate();

        this._renderPanel();
        this.updateUsage();
    },

    _mode: function(tool) { return this[tool + "Mode"]; },

    // ─── Scheduling ──────────────────────────────────────────────────────────

    _scheduleNextUpdate: function() {
        this._cancelScheduledUpdate();
        const seconds = this.refreshInterval * 60;
        this.refreshTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            seconds,
            () => {
                this.updateUsage();
                return GLib.SOURCE_CONTINUE;
            }
        );
    },

    _cancelScheduledUpdate: function() {
        if (this.refreshTimeoutId !== null) {
            GLib.source_remove(this.refreshTimeoutId);
            this.refreshTimeoutId = null;
        }
    },

    // ─── Mouse hover ─────────────────────────────────────────────────────────

    _onMouseEnter: function() {
        if (this.hoverRefreshDone) return;
        this.hoverRefreshDone = true;
        this.updateUsage();
    },

    // ─── Icon helpers ─────────────────────────────────────────────────────────

    _iconPath: function(name) {
        return GLib.build_filenamev([this._iconsDir, name + ".png"]);
    },

    _makeIcon: function(tool) {
        const path = this._iconPath(tool);
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) return null;
        try {
            return new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(path) }),
                icon_size: this.getPanelIconSize(St.IconType.FULLCOLOR),
                style_class: "applet-icon",
                y_align: Clutter.ActorAlign.CENTER, y_expand: true,
            });
        } catch (_) {
            return null;
        }
    },

    // ─── Data fetching ───────────────────────────────────────────────────────

    updateUsage: function() {
        if (this.isUpdating) return;
        this._queue = TOOLS.filter((t) => this._mode(t) !== MODE_OFF);
        this._fetchNext();
    },

    _fetchNext: function() {
        if (this._queue.length === 0) {
            this._updateDisplay();
            return;
        }
        const tool = this._queue.shift();
        const done = () => { this._fetchNext(); };
        if (tool === TOOL_CLAUDE)   this._fetchClaude(done);
        else if (tool === TOOL_AGY) this._fetchAgy(done);
        else                        this._fetchCodex(done);
    },

    _spawnAndRead: function(argv, onSuccess, onError) {
        this.isUpdating = true;

        let subprocess;
        try {
            subprocess = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this.isUpdating = false;
            onError();
            return;
        }

        this._timeoutGuardId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            SUBPROCESS_TIMEOUT_MS,
            () => {
                try { subprocess.force_exit(); } catch (_) {}
                this._timeoutGuardId = null;
                return GLib.SOURCE_REMOVE;
            }
        );

        subprocess.communicate_utf8_async(null, null, (proc, result) => {
            if (this._timeoutGuardId !== null) {
                GLib.source_remove(this._timeoutGuardId);
                this._timeoutGuardId = null;
            }
            this.isUpdating = false;

            try {
                const [, stdout] = proc.communicate_utf8_finish(result);
                if (stdout && stdout.length <= MAX_OUTPUT_BYTES && stdout.trim().length > 0) {
                    onSuccess(stdout);
                } else {
                    onError();
                }
            } catch (_) {
                onError();
            }
        });
    },

    // ─── Fetching ────────────────────────────────────────────────────────────

    _fetchClaude: function(done) {
        this._spawnAndRead(
            ["/bin/bash", "-lc", 'claude -p "/usage"'],
            (stdout) => {
                this._status.claude = this._processClaudeOutput(stdout) ? "ok" : "error";
                done();
            },
            () => { this._status.claude = "error"; done(); }
        );
    },

    _fetchAgy: function(done) {
        this._spawnAndRead(
            ["/bin/bash", "-lc", 'agy -p "/usage"'],
            (stdout) => {
                this._status.agy = this._processAgyOutput(stdout) ? "ok" : "error";
                done();
            },
            () => { this._status.agy = "error"; done(); }
        );
    },

    _fetchCodex: function(done) {
        this._spawnAndRead(
            ["/bin/bash", "-lc", 'codex -p "/status" 2>/dev/null || codex exec "/status" 2>/dev/null'],
            (stdout) => {
                this._processCodexOutput(stdout);
                this.codexAvailable = true;
                this._status.codex = "ok";
                done();
            },
            () => {
                this.codexAvailable = GLib.find_program_in_path("codex") !== null;
                this._status.codex = this.codexAvailable ? "ok" : "missing";
                done();
            }
        );
    },

    // ─── Parsing — Claude ────────────────────────────────────────────────────

    _parseClaudeDate: function(dateStr) {
        if (typeof dateStr !== "string" || dateStr.length === 0) return null;

        const monthMap = {
            jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4,
            jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9,
            nov: 10, dec: 11, dez: 11,
        };

        const lower = dateStr.toLowerCase();
        let month = -1;
        for (let m in monthMap) {
            if (lower.indexOf(m) >= 0) { month = monthMap[m]; break; }
        }
        if (month === -1) return null;

        const match = dateStr.match(/(\d{1,2})\s*,\s*(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i);
        if (!match) return null;

        const day    = parseInt(match[1], 10);
        let hour     = parseInt(match[2], 10);
        const minute = match[3] ? parseInt(match[3], 10) : 0;
        const ampm   = match[4].toLowerCase();

        if (day < 1 || day > 31 || hour > 12 || minute > 59) return null;
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;

        const now  = new Date();
        let year   = now.getFullYear();
        if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) year++;

        const d = new Date(year, month, day, hour, minute, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    },

    _processClaudeOutput: function(output) {
        if (typeof output !== "string") return false;

        let sessionUsage = null, sessionReset = null;
        let weekUsage    = null, weekReset    = null;

        const lines = output.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();

            let target = null;
            if (line.indexOf("Current session:") >= 0)  target = "session";
            else if (line.indexOf("Current week") >= 0) target = "week";
            if (!target) continue;

            const m = line.match(/(\d+)%\s*used.*resets\s+(.+)$/);
            if (!m) continue;

            const pct     = parseInt(m[1], 10);
            const rawDate = m[2].trim();
            const parsed  = this._parseClaudeDate(rawDate);
            const fmt     = target === "session" ? this.sessionResetFormat : this.weekResetFormat;
            const resetStr = this.useRelativeTime
                ? (this._getRelativeTime(parsed) || rawDate)
                : (this._formatDate(parsed, fmt) || rawDate);

            if (target === "session") { sessionUsage = pct; sessionReset = resetStr; }
            else                      { weekUsage    = pct; weekReset    = resetStr; }
        }

        if (weekUsage !== null && sessionUsage === null) {
            sessionUsage   = 0;
            sessionReset   = null;
            this.hasSession = false;
        } else {
            this.hasSession = (sessionUsage !== null);
        }

        if (weekUsage === null) {
            return false;
        }

        this.sessionUsage = sessionUsage !== null ? sessionUsage : 0;
        this.sessionReset = sessionReset || null;
        this.weekUsage    = weekUsage;
        this.weekReset    = weekReset || "N/A";

        return true;
    },

    // ─── Parsing — AGY ───────────────────────────────────────────────────────

    _parseAgyDate: function(str) {
        if (!str || typeof str !== "string") return null;
        const s = str.trim();
        const d = new Date(s);
        if (this._isValidDate(d)) return d;

        // Custom parser for: "YYYY-MM-DD HH:mm [+-]HH"
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{2})?(?::?(\d{2}))?$/);
        if (m) {
            const yr = m[1], mo = m[2], dy = m[3], hr = m[4], mn = m[5], sc = m[6] || "00";
            const tzH = m[7] || "Z", tzM = m[8] || "00";
            const iso = yr + "-" + mo + "-" + dy + "T" + hr + ":" + mn + ":" + sc + (tzH === "Z" ? "Z" : (tzH + ":" + tzM));
            const res = new Date(iso);
            if (this._isValidDate(res)) return res;
        }
        return null;
    },

    _processAgyOutput: function(output) {
        if (typeof output !== "string") return false;

        let geminiUsage = null, geminiReset = null;
        let claudeUsage = null, claudeReset = null;

        // 1. Try parsing JSON format
        try {
            const parsed = JSON.parse(output.trim());
            const data = parsed && parsed.command && parsed.command.data;
            if (data && Array.isArray(data.groups)) {
                for (let i = 0; i < data.groups.length; i++) {
                    const group = data.groups[i];
                    if (!group || !Array.isArray(group.buckets) || group.buckets.length === 0) continue;

                    const bucket = group.buckets[0];
                    const remainingFraction = typeof bucket.remaining_fraction === "number"
                        ? bucket.remaining_fraction : null;
                    if (remainingFraction === null) continue;

                    const usedPct   = Math.round(Math.min(100, Math.max(0, (1 - remainingFraction) * 100)));
                    const resetDate = this._parseAgyDate(bucket.reset_time);
                    const resetStr  = this.useRelativeTime
                        ? (this._getRelativeTime(resetDate) || bucket.reset_time || "N/A")
                        : (this._formatDate(resetDate, this.weekResetFormat) || bucket.reset_time || "N/A");

                    const nameLC = (group.name || "").toLowerCase();
                    if (nameLC.indexOf("gemini") >= 0) {
                        geminiUsage = usedPct;
                        geminiReset = resetStr;
                    } else {
                        claudeUsage = usedPct;
                        claudeReset = resetStr;
                    }
                }
            }
        } catch (_) {
            // Not JSON; fall through to text regex parser below
        }

        // 2. Fallback: Parse line-by-line text/tabular output from `agy -p "/usage"`
        if (geminiUsage === null && claudeUsage === null) {
            const lines = output.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();
                const m = line.match(/(gemini|claude.*?gpt).*?(\d+)%\s+(.+)$/i);
                if (!m) continue;

                const groupName = m[1].toLowerCase();
                const numVal    = parseInt(m[2], 10);
                const rawDate   = m[3].trim();

                // "Remaining X%" means used = 100 - X
                const isRemaining = line.toLowerCase().indexOf("remaining") >= 0;
                const usedPct     = isRemaining ? (100 - numVal) : numVal;

                const resetDate = this._parseAgyDate(rawDate);
                const resetStr  = this.useRelativeTime
                    ? (this._getRelativeTime(resetDate) || rawDate)
                    : (this._formatDate(resetDate, this.weekResetFormat) || rawDate);

                if (groupName.indexOf("gemini") >= 0) {
                    geminiUsage = usedPct;
                    geminiReset = resetStr;
                } else {
                    claudeUsage = usedPct;
                    claudeReset = resetStr;
                }
            }
        }

        if (geminiUsage === null && claudeUsage === null) {
            return false;
        }

        this.agyGeminiUsage = geminiUsage;
        this.agyGeminiReset = geminiReset;
        this.agyClaudeUsage = claudeUsage;
        this.agyClaudeReset = claudeReset;

        return true;
    },

    // ─── Parsing — Codex ─────────────────────────────────────────────────────

    _processCodexOutput: function(output) {
        if (typeof output !== "string") return false;

        let sessionUsage = null, sessionReset = null;
        let weekUsage    = null, weekReset    = null;

        // 1. Try parsing JSON if Codex outputs structured stats
        try {
            const parsed = JSON.parse(output.trim());
            if (parsed && typeof parsed === "object") {
                if (typeof parsed.session_usage === "number") sessionUsage = parsed.session_usage;
                if (typeof parsed.weekly_usage === "number")  weekUsage    = parsed.weekly_usage;
                if (parsed.session_reset) sessionReset = parsed.session_reset;
                if (parsed.weekly_reset)  weekReset    = parsed.weekly_reset;
            }
        } catch (_) {}

        // 2. Line by line regex on status output
        if (sessionUsage === null && weekUsage === null) {
            const lines = output.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();

                // Match 5-hour or session window
                if (/session|5-hour|burst/i.test(line)) {
                    const m = line.match(/(\d+)%\s*(?:used|left)?.*?(?:resets?\s+(.+))?$/i);
                    if (m) {
                        const isLeft = /left/i.test(line);
                        const val    = parseInt(m[1], 10);
                        sessionUsage = isLeft ? (100 - val) : val;
                        if (m[2]) sessionReset = m[2].replace(/[\)\.\;]+$/, "").trim();
                    }
                }

                // Match weekly window
                if (/week/i.test(line)) {
                    const m = line.match(/(\d+)%\s*(?:used|left)?.*?(?:resets?\s+(.+))?$/i);
                    if (m) {
                        const isLeft = /left/i.test(line);
                        const val    = parseInt(m[1], 10);
                        weekUsage = isLeft ? (100 - val) : val;
                        if (m[2]) weekReset = m[2].replace(/[\)\.\;]+$/, "").trim();
                    }
                }
            }
        }

        if (sessionUsage !== null || weekUsage !== null) {
            this.codexSessionUsage = sessionUsage !== null ? sessionUsage : 0;
            this.codexSessionReset = sessionReset || null;
            this.codexWeekUsage    = weekUsage !== null ? weekUsage : 0;
            this.codexWeekReset    = weekReset || "N/A";
            return true;
        }

        return false;
    },

    // ─── Shared date/time utilities ──────────────────────────────────────────

    _isValidDate: function(d) {
        return d && typeof d.getTime === "function" && !isNaN(d.getTime());
    },

    _formatDate: function(date, format) {
        if (!this._isValidDate(date)) return null;

        const fmt = (typeof format === "string" && format.length > 0)
            ? format.substring(0, MAX_FORMAT_LENGTH)
            : "DD/MM HH:mm";

        const pad  = (n) => (n < 10 ? "0" + n : "" + n);
        const YYYY = date.getFullYear().toString();
        const MM   = pad(date.getMonth() + 1);
        const DD   = pad(date.getDate());
        const h24  = date.getHours();
        const HH   = pad(h24);
        const hh   = pad(h24 % 12 || 12);
        const mm   = pad(date.getMinutes());
        const ss   = pad(date.getSeconds());
        const A    = h24 >= 12 ? "PM" : "AM";

        return fmt
            .replace(/YYYY/g, YYYY)
            .replace(/YY/g,   YYYY.substring(2))
            .replace(/MM/g,   MM)
            .replace(/DD/g,   DD)
            .replace(/HH/g,   HH)
            .replace(/hh/g,   hh)
            .replace(/mm/g,   mm)
            .replace(/ss/g,   ss)
            .replace(/A/g,    A);
    },

    _getRelativeTime: function(date) {
        if (!this._isValidDate(date)) return null;

        const diffMs    = date.getTime() - Date.now();
        if (diffMs <= 0) return this.i18n.justNow;

        const diffMins  = Math.floor(diffMs  / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays  = Math.floor(diffHours / 24);

        if (diffDays  > 1)   return this.i18n.inDays.replace("%d",  diffDays);
        if (diffDays  === 1) return this.i18n.inDay;
        if (diffHours > 1)   return this.i18n.inHours.replace("%d", diffHours);
        if (diffHours === 1) return this.i18n.inHour;
        if (diffMins  > 1)   return this.i18n.inMinutes.replace("%d", diffMins);
        if (diffMins  === 1) return this.i18n.inMinute;
        return this.i18n.justNow;
    },

    // ─── Display ─────────────────────────────────────────────────────────────

    _applyColor: function(label, pct) {
        if (this.useColors && pct !== null) {
            let color = this.colorGreen;
            if (pct > this.thresholdRed)         color = this.colorRed;
            else if (pct > this.thresholdYellow) color = this.colorYellow;
            label.style = "color: " + color + ";";
        } else {
            label.style = null;
        }
    },

    // Normalized view of a tool: panel text, color source pct and tooltip body
    _model: function(tool) {
        const bar = (v) => this._createProgressBar(v) + " " + v + "%";
        const i = this.i18n;
        const reset = (r) => i.resets + " " + (r || "N/A");
        const status = this._status[tool];

        if (tool === TOOL_CLAUDE) {
            const m = { title: i.claudeTitle, name: "Claude", text: "--%", pct: null, body: i.error };
            if (this.weekUsage === null) return m;
            // Panel: D (daily/session) and/or S (weekly); fall back to D if both are off
            const showD = this.claudeShowDay || !this.claudeShowWeek;
            const showW = this.claudeShowWeek;
            const pp = [], pv = [];
            if (showD) { pp.push("D: " + this.sessionUsage + "%"); pv.push(this.sessionUsage); }
            if (showW) { pp.push("S: " + this.weekUsage + "%");    pv.push(this.weekUsage); }
            m.text = (pp.length > 1 && pv.every((v) => v === pv[0] && (v === 0 || v === 100))) ? pv[0] + "%" : pp.join(" ");
            m.pct  = Math.max.apply(null, pv);
            const sessionLine = this.hasSession
                ? bar(this.sessionUsage) + "\n" + reset(this.sessionReset)
                : bar(0) + "\n" + i.noSession;
            m.body = i.session + "\n" + sessionLine + "\n\n" +
                     i.week + "\n" + bar(this.weekUsage) + "\n" + reset(this.weekReset);
            return m;
        }

        if (tool === TOOL_AGY) {
            const m = { title: i.agyTitle, name: "AGY", text: "--%", pct: null, body: i.error };
            if (this.agyGeminiUsage === null && this.agyClaudeUsage === null) return m;
            const g = this.agyGeminiUsage, c = this.agyClaudeUsage;
            // Panel: G (Google models) and/or O (others); fall back to G if both are off
            const showG = this.agyShowGoogle || !this.agyShowOther;
            const showO = this.agyShowOther;
            const pp = [], pv = [];
            if (showG) { pp.push("G: " + (g !== null ? g : "--") + "%"); if (g !== null) pv.push(g); }
            if (showO) { pp.push("O: " + (c !== null ? c : "--") + "%"); if (c !== null) pv.push(c); }
            m.text = (pp.length > 1 && pv.length === pp.length && pv.every((v) => v === pv[0] && (v === 0 || v === 100))) ? pv[0] + "%" : pp.join(" ");
            m.pct  = pv.length ? Math.max.apply(null, pv) : null;
            const parts = [];
            if (g !== null) parts.push(i.gemini + "\n" + bar(g) + "\n" + reset(this.agyGeminiReset));
            if (c !== null) parts.push(i.claudeGpt + "\n" + bar(c) + "\n" + reset(this.agyClaudeReset));
            m.body = parts.join("\n\n");
            return m;
        }

        const m = { title: i.codexTitle, name: "Codex", text: "--%", pct: null, body: i.error };
        if (status === "missing") {
            m.text = "N/A"; m.body = i.notInstalled;
            return m;
        }
        if (this.codexSessionUsage === null && this.codexWeekUsage === null) {
            if (this.codexAvailable) { m.text = "Ready"; m.body = i.codexReady; }
            return m;
        }
        m.pct  = this.codexSessionUsage !== null ? this.codexSessionUsage : this.codexWeekUsage;
        m.text = m.pct + "%";
        const parts = [];
        if (this.codexSessionUsage !== null)
            parts.push(i.codexBurst + "\n" + bar(this.codexSessionUsage) +
                       (this.codexSessionReset ? "\n" + reset(this.codexSessionReset) : ""));
        if (this.codexWeekUsage !== null)
            parts.push(i.codexWeekly + "\n" + bar(this.codexWeekUsage) +
                       (this.codexWeekReset ? "\n" + reset(this.codexWeekReset) : ""));
        m.body = parts.join("\n\n");
        return m;
    },

    // Rebuild the panel widgets for the tools set to "panel"
    _renderPanel: function() {
        this._box.destroy_all_children();
        this._panelItems = {};

        const shown = TOOLS.filter((t) => this._mode(t) === MODE_PANEL);
        if (shown.length === 0) {
            // Nothing pinned to the panel: keep a generic placeholder so hover still works
            const l = new St.Label({ text: this.i18n.title, y_align: Clutter.ActorAlign.CENTER, y_expand: true, style_class: "applet-label" });
            this._box.add_actor(l);
            return;
        }
        for (let t of shown) {
            const item = new St.BoxLayout({ style: "spacing: 4px;", y_align: Clutter.ActorAlign.CENTER, y_expand: true });
            let icon = this.showIcons ? this._makeIcon(t) : null;
            if (icon) item.add_actor(icon);
            const label = new St.Label({ text: "--%", y_align: Clutter.ActorAlign.CENTER, y_expand: true, style_class: "applet-label" });
            item.add_actor(label);
            this._box.add_actor(item);
            this._panelItems[t] = { icon: icon, label: label };
        }
    },

    _updateDisplay: function() {
        const i = this.i18n;
        let tip = [];

        for (let t of TOOLS) {
            if (this._mode(t) === MODE_OFF) continue;
            const m = this._model(t);
            const item = this._panelItems[t];
            if (item) {
                item.label.set_text(item.icon ? m.text : m.name + " " + m.text);
                this._applyColor(item.label, m.pct);
            }
            tip.push(m.title + "\n\n" + m.body);
        }

        if (tip.length === 0) tip.push(i.title + "\n" + i.noneEnabled);

        this.set_applet_tooltip(
            tip.join("\n\n────────────\n\n") + "\n\n" +
            i.autoUpdate + " " + this.refreshInterval + " " + i.min + "\n" +
            i.hoverToRefresh
        );
    },

    _createProgressBar: function(value) {
        const total   = 10;
        const clamped = Math.min(100, Math.max(0, value));
        const filled  = Math.round((clamped / 100) * total);
        return "█".repeat(filled) + "░".repeat(total - filled);
    },

    // ─── Cleanup ─────────────────────────────────────────────────────────────

    on_applet_removed_from_panel: function() {
        this._cancelScheduledUpdate();
        if (this._timeoutGuardId !== null) {
            GLib.source_remove(this._timeoutGuardId);
            this._timeoutGuardId = null;
        }
    },
};

function main(metadata, orientation, panelHeight, instanceId) {
    return new ClaudeUsageApplet(orientation, panelHeight, instanceId);
}
