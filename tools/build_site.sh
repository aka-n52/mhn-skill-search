#!/bin/sh
# 公開用のファイルだけを ~/Desktop/monhan-site にまとめる（Cloudflare Pages にアップロードする用）
set -e
cd "$(dirname "$0")/.."
OUT="$HOME/Desktop/monhan-site"
rm -rf "$OUT"
mkdir -p "$OUT/data"
cp index.html style.css app.js "$OUT/"
cp data/gear.js data/skill-readings.js "$OUT/data/"
echo "公開用フォルダを作成しました: $OUT"
