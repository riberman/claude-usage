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

        // Estado
        this.sessionUsage = null;
        this.weekUsage = null;

        this.isUpdating = false;
        this.hoverRefreshDone = false;
        this.refreshTimeoutId = null;
        this.hoverLeaveId = null;

        this.set_applet_label("Claude --%");
        this.set_applet_tooltip("Claude Code\nCarregando...");

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

        const command =
            'claude -p "/usage" 2>/dev/null | ' +
            'grep -oP "\\\\d+(?=% used)" | head -2';

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
        const values = output
            .trim()
            .split(/\s+/)
            .filter(value => /^\d+$/.test(value));

        if (values.length < 2) {
            this._setError();
            return;
        }

        this.sessionUsage = parseInt(values[0]);
        this.weekUsage = parseInt(values[1]);

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
            "Sessão\n" +
            sessionBar +
            " " +
            this.sessionUsage +
            "%\n\n" +
            "Semana\n" +
            weekBar +
            " " +
            this.weekUsage +
            "%\n\n" +
            "Atualização automática: " +
            this.refreshInterval +
            " min\n" +
            "Passe o mouse novamente para atualizar"
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
            "Não foi possível obter o uso."
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
