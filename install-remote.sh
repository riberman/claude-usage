#!/bin/bash
set -e

REPO="riberman/claude-usage"
BRANCH="main"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
APPLET="claude-usage@riberman"
DIR="$HOME/.local/share/cinnamon/applets/$APPLET"
FILES=("applet.js" "metadata.json" "settings-schema.json")
ICONS=("agy.png" "claude.png" "codex.png")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Usage (Claude / AGY / Codex) — Installer"
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

mkdir -p "$DIR/icons"

for file in "${FILES[@]}"; do
    echo "  ↓ Downloading $file..."
    $DOWNLOAD "$DIR/$file" "$RAW/$file"
done

for icon in "${ICONS[@]}"; do
    echo "  ↓ Downloading icons/$icon..."
    $DOWNLOAD "$DIR/icons/$icon" "$RAW/icons/$icon"
done

echo ""
echo "✅ Installed to:"
echo "   $DIR"
echo ""
echo "Now add the applet in:"
echo "  System Settings → Applets → AI Usage (Claude / AGY / Codex)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
