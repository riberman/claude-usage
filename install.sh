#!/bin/bash

APPLET="claude-usage@riberman"
DIR="$HOME/.local/share/cinnamon/applets/$APPLET"

mkdir -p "$DIR"

cp applet.js metadata.json settings-schema.json "$DIR/"

echo "Claude Code Usage instalado em:"
echo "$DIR"
echo
echo "Agora adicione o applet em:"
echo "Configurações do Sistema → Miniaplicativos(Applets)"
