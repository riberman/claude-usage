# Claude Code Usage

Applet para **Linux Cinnamon** que exibe no painel o percentual de uso do **Claude Code**, utilizando as informações fornecidas pelo próprio comando `/usage`.

```text
Claude 51%
```

Ao passar o mouse sobre o applet, são exibidos os detalhes:

```text
Claude Code Usage

Sessão
█████░░░░░ 51%

Semana
█████░░░░░ 48%

Atualização automática: 1 min
```

## ✨ Recursos

* 📊 Uso da sessão diretamente no painel.
* 📈 Uso semanal no tooltip.
* 🔄 Atualização automática configurável.
* ⏱️ Intervalo padrão de **1 minuto**.
* 🔒 Intervalo mínimo de **1 minuto**.
* 🖱️ Atualização imediata ao entrar com o mouse.
* 🚫 Evita consultas simultâneas.
* ⚡ Consultas executadas de forma assíncrona, sem bloquear o Cinnamon.
* 💾 Mantém o último valor válido caso uma consulta falhe.
* ⚙️ Configuração integrada ao Cinnamon.

## 🧠 Como funciona

O applet executa localmente:

```bash
claude -p "/usage"
```

E extrai os percentuais da saída:

```bash
claude -p "/usage" 2>/dev/null \
  | grep -oP '\d+(?=% used)' \
  | head -2
```

Resultado:

```text
51
48
```

O primeiro valor representa a sessão e o segundo o uso semanal.

O projeto não utiliza backend, banco de dados ou API própria.

## 📦 Estrutura

```text
claude-usage@riberman/
├── applet.js
├── metadata.json
├── settings-schema.json
├── install.sh
└── README.md
```

### `applet.js`

Implementação principal do applet, incluindo consulta ao Claude Code, atualização da interface, timers e tratamento de erros.

### `metadata.json`

Metadados utilizados pelo Cinnamon para identificar o applet.

### `settings-schema.json`

Define as configurações disponíveis, atualmente o intervalo de atualização.

### `install.sh`

Instalador automático para:

```text
~/.local/share/cinnamon/applets/claude-usage@riberman
```

## 🚀 Instalação

Clone ou baixe o projeto e execute:

```bash
chmod +x install.sh
./install.sh
```

Depois abra:

**Configurações do Sistema → Miniaplicativos → Claude Code Usage**

e adicione o applet ao painel.

Não é necessário utilizar `sudo`.

## ⚙️ Configuração

Nas configurações do applet é possível definir o intervalo de atualização.

Padrão:

```text
1 minuto
```

Mínimo:

```text
1 minuto
```

Ao entrar com o mouse sobre o applet, uma consulta adicional é executada uma única vez. Ao sair e entrar novamente, uma nova atualização pode ser realizada.

## 🔧 Requisitos

* Linux
* Cinnamon Desktop
* Cinnamon 6.4 ou compatível
* Claude Code instalado e autenticado

Teste antes da instalação:

```bash
claude -p "/usage"
```

## 🐛 Problemas

Se o applet mostrar `Claude --%`, teste:

```bash
claude -p "/usage" 2>/dev/null \
  | grep -oP '\d+(?=% used)' \
  | head -2
```

O resultado esperado é semelhante a:

```text
51
48
```

Se o comando funcionar no terminal mas não no applet, pode haver diferença no `PATH` da sessão gráfica.

## 🔐 Privacidade

O applet apenas executa o Claude Code localmente e processa sua saída.

Não possui servidor próprio, banco de dados ou armazenamento de prompts/conversas.

## 🗺️ Roadmap

* [ ] Melhor suporte a diferentes versões do Cinnamon.
* [ ] Indicadores visuais por faixa de utilização.
* [ ] Opções adicionais de exibição no painel.
* [ ] Melhor detecção do caminho do Claude Code.
* [ ] Publicação no Cinnamon Spices.

## 👤 Autor

**riberman**

## 📄 Licença

Consulte o arquivo `LICENSE` deste repositório.

