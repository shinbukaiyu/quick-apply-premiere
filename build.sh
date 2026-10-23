#!/bin/bash
# Rebuild the macOS hotkey helper (universal) and package dist/QuickApply-v<version>.zip
set -e
cd "$(dirname "$0")"
H=extension/helper
swiftc -O -target arm64-apple-macos11 $H/qa_hotkey.swift -o /tmp/qa_hotkey_arm64
swiftc -O -target x86_64-apple-macos11 $H/qa_hotkey.swift -o /tmp/qa_hotkey_x64
lipo -create /tmp/qa_hotkey_arm64 /tmp/qa_hotkey_x64 -output $H/qa_hotkey
codesign --force -s - $H/qa_hotkey
rm /tmp/qa_hotkey_arm64 /tmp/qa_hotkey_x64

VER=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' extension/CSXS/manifest.xml)
mkdir -p dist
rm -f "dist/QuickApply-v$VER.zip"
zip -qr "dist/QuickApply-v$VER.zip" extension install_mac.command uninstall_mac.command \
  install_windows.bat uninstall_windows.bat README.md LICENSE -x "*.DS_Store"
echo "dist/QuickApply-v$VER.zip"
