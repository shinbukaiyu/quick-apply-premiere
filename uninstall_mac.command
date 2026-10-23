#!/bin/bash
# Quick Apply - go cai dat (macOS)
pkill -f "QuickApply_PR/helper/qa_hotkey" 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/Adobe/CEP/extensions/QuickApply_PR"
rm -rf "$HOME/Library/Application Support/QuickApplyPR"
echo "Da go Quick Apply. Khoi dong lai Premiere Pro."
