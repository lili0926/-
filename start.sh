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

# 检测 WSL2 (需要特殊网络处理)
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
  kill $PID_MAIN $PID_DUETTO $PID_ECO 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✅ 已关闭"
}
trap cleanup EXIT INT TERM

# ─── 1. 主页（静态文件） ───
echo ""
echo "📄 [1/3] 启动主页..."
cd "$ROOT_DIR"
python3 -m http.server 8080 &
PID_MAIN=$!
echo "   PID: $PID_MAIN  端口: 8080"

# ─── 2. Duetto 音乐 ───
echo ""
echo "🎵 [2/3] 启动 Duetto 音乐..."
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
echo "🌿 [3/3] 启动瓶中生态..."
cd "$ROOT_DIR/cedareco"
if [ -f standalone_server.py ]; then
  python3 standalone_server.py &
  PID_ECO=$!
  echo "   PID: $PID_ECO  端口: 8765"
else
  echo "   ⚠️  生态服务文件未找到，跳过"
fi

# ─── 启动完成 ───
cd "$ROOT_DIR"
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   ✅ 全部启动完成！                     ║"
echo "╠═══════════════════════════════════════╣"
echo "║  电脑: http://localhost:8080           ║"
echo "║  手机: http://${MY_IP}:8080            ║"
echo "║                                        ║"
echo "║  音乐: 页面内嵌 iframe                  ║"
echo "║  生态: 游戏大厅内嵌 iframe              ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待任意子进程退出
wait -n 2>/dev/null || true
