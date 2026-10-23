#!/bin/bash
# Quick Apply - cai dat cho Premiere Pro (macOS)
set -e
SRC="$(cd "$(dirname "$0")" && pwd)/extension"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/QuickApply_PR"

if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "Khong tim thay folder 'extension' canh file cai dat. Hay giai nen day du file zip."
  exit 1
fi

# Cho phep chay extension chua ky (unsigned)
for v in 9 10 11 12 13; do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1 2>/dev/null || true
done

# Tat helper phim tat cu (neu dang chay)
pkill -f "QuickApply_PR/helper/qa_hotkey" 2>/dev/null || true

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
chmod +x "$DEST/helper/qa_hotkey"
codesign --force -s - "$DEST/helper/qa_hotkey" 2>/dev/null || true

echo "Da cai vao: $DEST"
echo "Khoi dong lai Premiere Pro, roi bam Cmd+F (hoac Window > Extensions > Quick Apply)"
