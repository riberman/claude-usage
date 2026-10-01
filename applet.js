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

        const lang = GLib.getenv('LANG') || '';
        const isPtBr = lang.toLowerCase().startsWith('pt');
        
        this.i18n = {
            loading: isPtBr ? "Carregando..." : "Loading...",
            session: isPtBr ? "Sessão" : "Session",
            week: isPtBr ? "Semana" : "Week",
            autoUpdate: isPtBr ? "Atualização automática:" : "Auto update:",
            min: isPtBr ? "min" : "min",
            hoverToRefresh: isPtBr ? "Passe o mouse novamente para atualizar" : "Hover again to refresh",
            error: isPtBr ? "Não foi possível obter o uso." : "Could not fetch usage.",
            resets: isPtBr ? "Reseta:" : "Resets:"
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
        this.set_applet_tooltip("Claude Code\n" + this.i18n.loading);

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
                    sessionReset = match[2].trim();
                }
            } else if (line.indexOf('Current week') >= 0) {
                const match = line.match(/(\d+)%\s*used.*resets\s+(.+)$/);
                if (match) {
                    weekUsage = parseInt(match[1]);
                    weekReset = match[2].trim();
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

        const sessionBar = this._createProgressBar(
            this.sessionUsage
        );

        const weekBar = this._createProgressBar(
            this.weekUsage
        );

        this.set_applet_tooltip(
            "Claude Code Usage\n\n" +
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
        this.set_applet_tooltip(
            "Claude Code\n" +
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
