#!/bin/bash
set -e

REPO="riberman/claude-usage"
BRANCH="main"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
APPLET="claude-usage@riberman"
DIR="$HOME/.local/share/cinnamon/applets/$APPLET"
FILES=("applet.js" "metadata.json" "settings-schema.json")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Claude Code Usage — Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for downloader
if command -v wget &>/dev/null; then
    DOWNLOAD="wget -qO"
elif command -v curl &>/dev/null; then
    DOWNLOAD="curl -fsSL -o"
else
    echo "❌ Error: wget or curl is required."
    exit 1
fi

mkdir -p "$DIR"

for file in "${FILES[@]}"; do
    echo "  ↓ Downloading $file..."
    $DOWNLOAD "$DIR/$file" "$RAW/$file"
done

echo ""
echo "✅ Installed to:"
echo "   $DIR"
echo ""
echo "Now add the applet in:"
echo "  System Settings → Applets → Claude Code Usage"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
