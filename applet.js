const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;

const UUID = "claude-usage@riberman";

// Hard limits to prevent abuse via settings
const MIN_REFRESH_INTERVAL = 1;   // minutes
const MAX_REFRESH_INTERVAL = 60;  // minutes
const MAX_FORMAT_LENGTH     = 40; // chars — prevents tooltip overflow from user input
const MAX_OUTPUT_BYTES      = 8192; // discard runaway output (8 KB ceiling)
const SUBPROCESS_TIMEOUT_MS = 30000; // 30 s hard timeout for the child process

function ClaudeUsageApplet(orientation, panelHeight, instanceId) {
    this._init(orientation, panelHeight, instanceId);
}

ClaudeUsageApplet.prototype = {
    __proto__: Applet.TextApplet.prototype,

    _init: function(orientation, panelHeight, instanceId) {
        Applet.TextApplet.prototype._init.call(
            this,
            orientation,
            panelHeight,
            instanceId
        );

        this.instanceId = instanceId;

        // Settings defaults
        this.refreshInterval   = MIN_REFRESH_INTERVAL;
        this.useRelativeTime   = false;
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

        // i18n — detected once at startup; no dynamic re-detection needed
        const lang = GLib.getenv("LANG") || "";
        const isPtBr = lang.toLowerCase().startsWith("pt");

        this.i18n = {
            title:          isPtBr ? "Claude Code Uso"                     : "Claude Code Usage",
            loading:        isPtBr ? "Carregando..."                        : "Loading...",
            session:        isPtBr ? "Sessão"                               : "Session",
            week:           isPtBr ? "Semana"                               : "Week",
            autoUpdate:     isPtBr ? "Atualização automática:"              : "Auto update:",
            min:            "min",
            hoverToRefresh: isPtBr ? "Passe o mouse novamente para atualizar" : "Hover again to refresh",
            error:          isPtBr ? "Não foi possível obter o uso."        : "Could not fetch usage.",
            resets:         isPtBr ? "Reseta:"                              : "Resets:",
            inDays:         isPtBr ? "em %d dias"                           : "in %d days",
            inDay:          isPtBr ? "em 1 dia"                             : "in 1 day",
            inHours:        isPtBr ? "em %d horas"                          : "in %d hours",
            inHour:         isPtBr ? "em 1 hora"                            : "in 1 hour",
            inMinutes:      isPtBr ? "em %d minutos"                        : "in %d minutes",
            inMinute:       isPtBr ? "em 1 minuto"                          : "in 1 minute",
            justNow:        isPtBr ? "agora mesmo"                          : "just now",
        };

        // Runtime state
        this.sessionUsage = null;
        this.sessionReset = null;
        this.weekUsage    = null;
        this.weekReset    = null;

        this.isUpdating       = false;
        this.hoverRefreshDone = false;
        this.refreshTimeoutId = null;
        this._timeoutGuardId  = null; // subprocess watchdog

        this.set_applet_label("Claude --%");
        this.set_applet_tooltip(this.i18n.title + "\n" + this.i18n.loading);

        this.updateUsage();
        this._scheduleNextUpdate();

        this.actor.connect("enter-event", () => { this._onMouseEnter(); });
        this.actor.connect("leave-event", () => { this.hoverRefreshDone = false; });
    },

    // ─── Settings ────────────────────────────────────────────────────────────

    _onSettingsChanged: function() {
        // Clamp numeric settings to safe ranges
        this.refreshInterval = Math.min(
            MAX_REFRESH_INTERVAL,
            Math.max(MIN_REFRESH_INTERVAL, parseInt(this.refreshInterval) || MIN_REFRESH_INTERVAL)
        );
        this.thresholdYellow = Math.min(99,  Math.max(1,  parseInt(this.thresholdYellow) || 30));
        this.thresholdRed    = Math.min(100, Math.max(2,  parseInt(this.thresholdRed)    || 50));

        // Clamp format strings to avoid oversized tooltips
        if (typeof this.sessionResetFormat !== "string") this.sessionResetFormat = "DD/MM HH:mm";
        if (typeof this.weekResetFormat    !== "string") this.weekResetFormat    = "DD/MM HH:mm";
        this.sessionResetFormat = this.sessionResetFormat.substring(0, MAX_FORMAT_LENGTH);
        this.weekResetFormat    = this.weekResetFormat.substring(0, MAX_FORMAT_LENGTH);

        this._cancelScheduledUpdate();
        this._scheduleNextUpdate();

        // Refresh display immediately with new settings (e.g. color/format change)
        if (this.sessionUsage !== null) this._updateDisplay();
    },

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

    // ─── Data fetching ───────────────────────────────────────────────────────

    updateUsage: function() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        let subprocess;
        try {
            // argv array — no shell interpolation, no injection risk
            subprocess = Gio.Subprocess.new(
                ["/bin/bash", "-lc", 'claude -p "/usage"'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this.isUpdating = false;
            this._setError();
            return;
        }

        // Watchdog: forcibly kill the subprocess if it hangs > 30 s
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
            // Cancel watchdog — process finished in time
            if (this._timeoutGuardId !== null) {
                GLib.source_remove(this._timeoutGuardId);
                this._timeoutGuardId = null;
            }

            this.isUpdating = false;

            try {
                const [, stdout] = proc.communicate_utf8_finish(result);
                // Guard against runaway output before processing
                if (stdout && stdout.length <= MAX_OUTPUT_BYTES) {
                    this._processOutput(stdout);
                } else {
                    this._setError();
                }
            } catch (_) {
                this._setError();
            }
        });
    },

    // ─── Parsing ─────────────────────────────────────────────────────────────

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

        // Match: day, hour[:minute] am/pm
        const match = dateStr.match(/(\d{1,2})\s*,\s*(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i);
        if (!match) return null;

        const day    = parseInt(match[1], 10);
        let hour     = parseInt(match[2], 10);
        const minute = match[3] ? parseInt(match[3], 10) : 0;
        const ampm   = match[4].toLowerCase();

        // Validate ranges
        if (day < 1 || day > 31 || hour > 12 || minute > 59) return null;

        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;

        const now  = new Date();
        let year   = now.getFullYear();
        // If the month is already past this year, the reset must be next year
        if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) {
            year++;
        }

        const d = new Date(year, month, day, hour, minute, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    },

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

        // Apply in length-descending order to avoid double-substitution (YYYY before YY)
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

        if (diffDays  > 1)  return this.i18n.inDays.replace("%d",  diffDays);
        if (diffDays  === 1) return this.i18n.inDay;
        if (diffHours > 1)  return this.i18n.inHours.replace("%d", diffHours);
        if (diffHours === 1) return this.i18n.inHour;
        if (diffMins  > 1)  return this.i18n.inMinutes.replace("%d", diffMins);
        if (diffMins  === 1) return this.i18n.inMinute;
        return this.i18n.justNow;
    },

    _processOutput: function(output) {
        if (typeof output !== "string") { this._setError(); return; }

        let sessionUsage = null, sessionReset = null;
        let weekUsage    = null, weekReset    = null;

        const lines = output.split("\n");
        for (let i = 0; i < lines.length; i++) {
            // Strip ANSI escape codes, then trim
            const line = lines[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").trim();

            let target = null;
            if (line.indexOf("Current session:") >= 0)   target = "session";
            else if (line.indexOf("Current week") >= 0)  target = "week";
            if (!target) continue;

            const m = line.match(/(\d+)%\s*used.*resets\s+(.+)$/);
            if (!m) continue;

            const pct      = parseInt(m[1], 10);
            const rawDate  = m[2].trim();
            const parsed   = this._parseClaudeDate(rawDate);
            const resetStr = this.useRelativeTime
                ? (this._getRelativeTime(parsed) || rawDate)
                : (this._formatDate(parsed, target === "session" ? this.sessionResetFormat : this.weekResetFormat) || rawDate);

            if (target === "session") { sessionUsage = pct; sessionReset = resetStr; }
            else                      { weekUsage    = pct; weekReset    = resetStr; }
        }

        if (sessionUsage === null || weekUsage === null) {
            this._setError();
            return;
        }

        this.sessionUsage = sessionUsage;
        this.sessionReset = sessionReset || "N/A";
        this.weekUsage    = weekUsage;
        this.weekReset    = weekReset    || "N/A";

        this._updateDisplay();
    },

    // ─── Display ─────────────────────────────────────────────────────────────

    _updateDisplay: function() {
        this.set_applet_label("Claude " + this.sessionUsage + "%");

        if (this.useColors && this._applet_label) {
            let color = this.colorGreen;
            if (this.sessionUsage > this.thresholdRed)    color = this.colorRed;
            else if (this.sessionUsage > this.thresholdYellow) color = this.colorYellow;
            this._applet_label.style = "color: " + color + ";";
        } else if (this._applet_label) {
            this._applet_label.style = null;
        }

        const sessionBar = this._createProgressBar(this.sessionUsage);
        const weekBar    = this._createProgressBar(this.weekUsage);

        this.set_applet_tooltip(
            this.i18n.title + "\n\n" +
            this.i18n.session + "\n" +
            sessionBar + " " + this.sessionUsage + "%\n" +
            this.i18n.resets  + " " + this.sessionReset + "\n\n" +
            this.i18n.week + "\n" +
            weekBar    + " " + this.weekUsage    + "%\n" +
            this.i18n.resets  + " " + this.weekReset + "\n\n" +
            this.i18n.autoUpdate + " " + this.refreshInterval + " " + this.i18n.min + "\n" +
            this.i18n.hoverToRefresh
        );
    },

    _createProgressBar: function(value) {
        const total  = 10;
        const clamped = Math.min(100, Math.max(0, value));
        const filled = Math.round((clamped / 100) * total);
        return "█".repeat(filled) + "░".repeat(total - filled);
    },

    _setError: function() {
        // Keep the last known good values rather than blanking the panel
        if (this.sessionUsage !== null && this.weekUsage !== null) {
            this._updateDisplay();
            return;
        }
        this.set_applet_label("Claude --%");
        if (this._applet_label) this._applet_label.style = null;
        this.set_applet_tooltip(this.i18n.title + "\n" + this.i18n.error);
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
