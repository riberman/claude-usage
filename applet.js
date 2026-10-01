const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;

const UUID = "claude-usage@riberman";

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

        // Configuração
        this.refreshInterval = 1;

        this.settings = new Settings.AppletSettings(
            this,
            UUID,
            instanceId
        );

        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "refreshInterval",
            "refreshInterval",
            this._onSettingsChanged,
            null
        );

        this.useRelativeTime = false;
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "useRelativeTime",
            "useRelativeTime",
            this._onSettingsChanged,
            null
        );

        this.sessionResetFormat = "DD/MM HH:mm";
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "sessionResetFormat",
            "sessionResetFormat",
            this._onSettingsChanged,
            null
        );

        this.weekResetFormat = "DD/MM HH:mm";
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "weekResetFormat",
            "weekResetFormat",
            this._onSettingsChanged,
            null
        );

        const colorProps = ["useColors", "thresholdYellow", "thresholdRed", "colorGreen", "colorYellow", "colorRed"];
        for (let prop of colorProps) {
            this[prop] = null;
            this.settings.bindProperty(
                Settings.BindingDirection.IN,
                prop,
                prop,
                this._onSettingsChanged,
                null
            );
        }

        const lang = GLib.getenv('LANG') || '';
        const isPtBr = lang.toLowerCase().startsWith('pt');
        
        this.i18n = {
            title: isPtBr ? "Claude Code Uso" : "Claude Code Usage",
            loading: isPtBr ? "Carregando..." : "Loading...",
            session: isPtBr ? "Sessão" : "Session",
            week: isPtBr ? "Semana" : "Week",
            autoUpdate: isPtBr ? "Atualização automática:" : "Auto update:",
            min: isPtBr ? "min" : "min",
            hoverToRefresh: isPtBr ? "Passe o mouse novamente para atualizar" : "Hover again to refresh",
            error: isPtBr ? "Não foi possível obter o uso." : "Could not fetch usage.",
            resets: isPtBr ? "Reseta:" : "Resets:",
            inDays: isPtBr ? "em %d dias" : "in %d days",
            inDay: isPtBr ? "em 1 dia" : "in 1 day",
            inHours: isPtBr ? "em %d horas" : "in %d hours",
            inHour: isPtBr ? "em 1 hora" : "in 1 hour",
            inMinutes: isPtBr ? "em %d minutos" : "in %d minutes",
            inMinute: isPtBr ? "em 1 minuto" : "in 1 minute",
            justNow: isPtBr ? "agora mesmo" : "just now"
        };

        // Estado
        this.sessionUsage = null;
        this.sessionReset = null;
        this.weekUsage = null;
        this.weekReset = null;

        this.isUpdating = false;
        this.hoverRefreshDone = false;
        this.refreshTimeoutId = null;
        this.hoverLeaveId = null;

        this.set_applet_label("Claude --%");
        this.set_applet_tooltip(this.i18n.title + "\n" + this.i18n.loading);

        // Atualização inicial
        this.updateUsage();

        // Atualização automática
        this._scheduleNextUpdate();

        // Atualização ao entrar com o mouse
        this.actor.connect(
            "enter-event",
            () => {
                this._onMouseEnter();
            }
        );

        // Permite nova atualização quando sair e entrar novamente
        this.actor.connect(
            "leave-event",
            () => {
                this.hoverRefreshDone = false;
            }
        );
    },

    _onSettingsChanged: function() {
        this.refreshInterval = Math.max(
            1,
            parseInt(this.refreshInterval) || 1
        );

        this._cancelScheduledUpdate();
        this._scheduleNextUpdate();
    },

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

    _onMouseEnter: function() {
        // Evita loop enquanto o mouse permanece sobre o applet.
        if (this.hoverRefreshDone) {
            return;
        }

        // Marca imediatamente para evitar múltiplos enter-event.
        this.hoverRefreshDone = true;

        // Uma única atualização ao entrar.
        this.updateUsage();
    },

    updateUsage: function() {
        // Não permite duas consultas simultâneas.
        if (this.isUpdating) {
            return;
        }

        this.isUpdating = true;

        const command = 'claude -p "/usage" 2>/dev/null';

        let subprocess;

        try {
            subprocess = Gio.Subprocess.new(
                [
                    "/bin/bash",
                    "-lc",
                    command
                ],
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (error) {
            this.isUpdating = false;
            this._setError();
            return;
        }

        subprocess.communicate_utf8_async(
            null,
            null,
            (proc, result) => {
                this.isUpdating = false;

                try {
                    const [, stdout, stderr] =
                        proc.communicate_utf8_finish(result);

                    this._processOutput(stdout);
                } catch (error) {
                    this._setError();
                }
            }
        );
    },

    _parseClaudeDate: function(dateStr) {
        if (!dateStr) return null;
        
        const monthMap = { 
            jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, 
            jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, out: 9, 
            nov: 10, dec: 11, dez: 11 
        };
        
        let month = -1;
        for (let m in monthMap) {
            if (dateStr.toLowerCase().indexOf(m) >= 0) {
                month = monthMap[m];
                break;
            }
        }
        
        if (month === -1) return dateStr;
        
        const regex = /(\d{1,2})\s*,\s*(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)/i;
        const match = dateStr.match(regex);
        if (!match) return dateStr;
        
        const day = parseInt(match[1]);
        let hour = parseInt(match[2]);
        const minute = match[3] ? parseInt(match[3]) : 0;
        const ampm = match[4].toLowerCase();
        
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        
        const now = new Date();
        let year = now.getFullYear();
        if (month < now.getMonth()) {
            year++; 
        }
        
        return new Date(year, month, day, hour, minute);
    },

    _formatDate: function(date, format) {
        if (!date || typeof date.getTime !== 'function' || isNaN(date.getTime())) {
            return date; // fallback to string
        }
        if (!format) format = "DD/MM HH:mm"; // fallback if format is undefined
        
        const pad = (n) => (n < 10 ? '0' + n : n);
        
        const YYYY = date.getFullYear().toString();
        const YY = YYYY.substring(2);
        const MM = pad(date.getMonth() + 1);
        const DD = pad(date.getDate());
        
        const hours24 = date.getHours();
        const HH = pad(hours24);
        
        const hours12 = hours24 % 12 || 12;
        const hh = pad(hours12);
        
        const mm = pad(date.getMinutes());
        const ss = pad(date.getSeconds());
        
        const A = hours24 >= 12 ? 'PM' : 'AM';
        
        return format
            .replace(/YYYY/g, YYYY)
            .replace(/YY/g, YY)
            .replace(/MM/g, MM)
            .replace(/DD/g, DD)
            .replace(/HH/g, HH)
            .replace(/hh/g, hh)
            .replace(/mm/g, mm)
            .replace(/ss/g, ss)
            .replace(/A/g, A);
    },

    _getRelativeTime: function(date) {
        if (!date || typeof date.getTime !== 'function' || isNaN(date.getTime())) {
            return date; // fallback to string
        }
        
        const now = new Date();
        let diffMs = date.getTime() - now.getTime();
        
        if (diffMs <= 0) {
            return this.i18n.justNow;
        }
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 1) {
            return this.i18n.inDays.replace("%d", diffDays);
        } else if (diffDays === 1) {
            return this.i18n.inDay;
        } else if (diffHours > 1) {
            return this.i18n.inHours.replace("%d", diffHours);
        } else if (diffHours === 1) {
            return this.i18n.inHour;
        } else if (diffMins > 1) {
            return this.i18n.inMinutes.replace("%d", diffMins);
        } else if (diffMins === 1) {
            return this.i18n.inMinute;
        } else {
            return this.i18n.justNow;
        }
    },

    _processOutput: function(output) {
        const lines = output.split('\n');
        let sessionUsage = null, sessionReset = null;
        let weekUsage = null, weekReset = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
            
            if (line.indexOf('Current session:') >= 0) {
                const match = line.match(/(\d+)%\s*used.*resets\s+(.+)$/);
                if (match) {
                    sessionUsage = parseInt(match[1]);
                    const rawDate = match[2].trim();
                    const parsedDate = this._parseClaudeDate(rawDate);
                    sessionReset = this.useRelativeTime
                        ? this._getRelativeTime(parsedDate)
                        : this._formatDate(parsedDate, this.sessionResetFormat);
                }
            } else if (line.indexOf('Current week') >= 0) {
                const match = line.match(/(\d+)%\s*used.*resets\s+(.+)$/);
                if (match) {
                    weekUsage = parseInt(match[1]);
                    const rawDate = match[2].trim();
                    const parsedDate = this._parseClaudeDate(rawDate);
                    weekReset = this.useRelativeTime
                        ? this._getRelativeTime(parsedDate)
                        : this._formatDate(parsedDate, this.weekResetFormat);
                }
            }
        }

        if (sessionUsage === null || weekUsage === null) {
            this._setError();
            return;
        }

        this.sessionUsage = sessionUsage;
        this.sessionReset = sessionReset || "N/A";
        this.weekUsage = weekUsage;
        this.weekReset = weekReset || "N/A";

        this._updateDisplay();
    },

    _updateDisplay: function() {
        this.set_applet_label(
            "Claude " +
            this.sessionUsage +
            "%"
        );

        if (this.useColors && this._applet_label) {
            let color = this.colorGreen;
            if (this.sessionUsage > this.thresholdRed) {
                color = this.colorRed;
            } else if (this.sessionUsage > this.thresholdYellow) {
                color = this.colorYellow;
            }
            this._applet_label.style = "color: " + color + ";";
        } else if (this._applet_label) {
            this._applet_label.style = null;
        }

        const sessionBar = this._createProgressBar(
            this.sessionUsage
        );

        const weekBar = this._createProgressBar(
            this.weekUsage
        );

        this.set_applet_tooltip(
            this.i18n.title + "\n\n" +
            this.i18n.session + "\n" +
            sessionBar + " " + this.sessionUsage + "%\n" +
            this.i18n.resets + " " + this.sessionReset + "\n\n" +
            this.i18n.week + "\n" +
            weekBar + " " + this.weekUsage + "%\n" +
            this.i18n.resets + " " + this.weekReset + "\n\n" +
            this.i18n.autoUpdate + " " + this.refreshInterval + " " + this.i18n.min + "\n" +
            this.i18n.hoverToRefresh
        );
    },

    _createProgressBar: function(value) {
        const total = 10;
        const filled = Math.round(
            (value / 100) * total
        );

        return (
            "█".repeat(filled) +
            "░".repeat(total - filled)
        );
    },

    _setError: function() {
        // Não apaga o último valor válido.
        if (
            this.sessionUsage !== null &&
            this.weekUsage !== null
        ) {
            this._updateDisplay();
            return;
        }

        this.set_applet_label("Claude --%");
        if (this._applet_label) {
            this._applet_label.style = null;
        }
        this.set_applet_tooltip(
            this.i18n.title + "\n" +
            this.i18n.error
        );
    },

    on_applet_removed_from_panel: function() {
        this._cancelScheduledUpdate();
    }
};

function main(metadata, orientation, panelHeight, instanceId) {
    return new ClaudeUsageApplet(
        orientation,
        panelHeight,
        instanceId
    );
}
