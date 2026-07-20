#!/bin/bash
# 启动所有游戏/音乐服务
# 用法: bash start-games.sh

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🌿 启动瓶中生态..."
cd "$DIR/cedareco"
python3 standalone_server.py &
echo "  PID=$!"

echo "🎵 启动 Duetto 音乐..."
cd "$DIR/Duetto"
PORT=4183 node server/index.mjs &
echo "  PID=$!"

echo ""
echo "游戏服务启动中（Duetto 约需 12s 初始化）..."
echo "  瓶中生态 → http://127.0.0.1:8765"
echo "  Duetto   → http://127.0.0.1:4183/pkg/index.html"
echo ""
echo "按 Ctrl+C 停止所有服务"
wait
