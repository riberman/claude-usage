#!/bin/bash

APPLET="claude-usage@riberman"
DIR="$HOME/.local/share/cinnamon/applets/$APPLET"

mkdir -p "$DIR"

cp applet.js metadata.json settings-schema.json "$DIR/"

# Copy icons (create subfolder if needed)
if [ -d "icons" ]; then
    mkdir -p "$DIR/icons"
    cp icons/*.png "$DIR/icons/"
fi

echo "AI Usage applet instalado em:"
echo "$DIR"
echo
echo "Agora adicione o applet em:"
echo "Configurações do Sistema → Miniaplicativos(Applets)"
