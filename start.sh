#!/usr/bin/env bash
# ========================================
# 🚀 Jasmine's Home — 一键启动所有服务
# ========================================
# 用法: bash start.sh
# 手机访问: http://电脑IP:8080
# ========================================
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "╔═══════════════════════════════════════╗"
echo "║   🌸 Jasmine's Home 启动中...          ║"
echo "╚═══════════════════════════════════════╝"

# 检测 WSL2
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "📌 检测到 WSL2 环境"
fi

# 获取本机 IP
get_ip() {
  ip route get 1 2>/dev/null | awk '{print $NF;exit}' 2>/dev/null || \
  hostname -I 2>/dev/null | awk '{print $1}' || \
  echo "localhost"
}
MY_IP=$(get_ip)

cleanup() {
  echo ""
  echo "🛑 正在关闭所有服务..."
  kill $PID_MAIN $PID_DUETTO $PID_ECO $PID_COLLAR $PID_EVENTIDE $PID_HERVOICE $PID_MONOPOLY 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✅ 已关闭"
}
trap cleanup EXIT INT TERM

# ─── 1. 主页 ───
echo ""
echo "📄 [1/7] 启动主页..."
cd "$ROOT_DIR"
python3 -m http.server 8080 &
PID_MAIN=$!
echo "   PID: $PID_MAIN  端口: 8080"

# ─── 2. Duetto 音乐 ───
echo ""
echo "🎵 [2/7] 启动 Duetto 音乐..."
cd "$ROOT_DIR/Duetto"
if [ -f server/index.mjs ]; then
  node server/index.mjs &
  PID_DUETTO=$!
  echo "   PID: $PID_DUETTO  端口: 4183"
else
  echo "   ⚠️  Duetto 服务文件未找到，跳过"
fi

# ─── 3. 瓶中生态 ───
echo ""
echo "🌿 [3/7] 启动瓶中生态..."
cd "$ROOT_DIR/cedareco"
if [ -f standalone_server.py ]; then
  python3 standalone_server.py &
  PID_ECO=$!
  echo "   PID: $PID_ECO  端口: 8765"
else
  echo "   ⚠️  生态服务文件未找到，跳过"
fi

# ─── 4. Collar 项圈 ───
echo ""
echo "📿 [4/7] 启动 Collar 项圈..."
cd "$ROOT_DIR/collar-tmp"
if [ -f node_modules/.bin/next ]; then
  npx next start -H 0.0.0.0 -p 3412 &
  PID_COLLAR=$!
  echo "   PID: $PID_COLLAR  端口: 3412"
else
  echo "   ⚠️  Collar 依赖未安装，跳过"
fi

# ─── 5. Eventide 生理状态 ───
echo ""
echo "🌙 [5/7] 启动 Eventide 生理状态..."
cd "$ROOT_DIR"
PYTHONPATH="$ROOT_DIR/eventide-tmp/src" python3 eventide-server.py 3876 &
PID_EVENTIDE=$!
echo "   PID: $PID_EVENTIDE  端口: 3876"

# ─── 6. hervoice 语音情感 ───
echo ""
echo "🎙 [6/7] 启动 hervoice 语音情感..."
cd "$ROOT_DIR"
python3 hervoice-server.py 8010 &
PID_HERVOICE=$!
echo "   PID: $PID_HERVOICE  端口: 8010"

# ─── 7. 涩涩大富翁 API ───
echo ""
echo "🎲 [7/7] 启动涩涩大富翁 API..."
cd "$ROOT_DIR/spicy-monopoly-tmp"
python3 -m uvicorn monopoly_api:app --host 0.0.0.0 --port 8069 &
PID_MONOPOLY=$!
echo "   PID: $PID_MONOPOLY  端口: 8069"

# ─── 启动完成 ───
cd "$ROOT_DIR"
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   ✅ 全部启动完成！                     ║"
echo "╠═══════════════════════════════════════╣"
echo "║  电脑: http://localhost:8080           ║"
echo "║  手机: http://${MY_IP}:8080            ║"
echo "║                                        ║"
echo "║  生理: 左侧栏「生理」                  ║"
echo "║  语情: 左侧栏「语情」                  ║"
echo "║  飞行棋: 游戏大厅入口                  ║"
echo "║  大富翁: 游戏大厅入口                  ║"
echo "║  生态: 游戏大厅入口                    ║"
echo "║  项圈: 游戏大厅入口                    ║"
echo "║  音乐: 游戏大厅入口                    ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "按 Ctrl+C 停止所有服务"

wait -n 2>/dev/null || true
