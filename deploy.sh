#!/bin/bash
# ================================================================
# Jasmine's Home — 一键部署脚本
# 在 VPS 上运行：bash deploy.sh
# ================================================================
set -e

echo "🚀 开始部署..."

cd /root/aries-app

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull 2>&1
echo "✅ git pull 完成"

# 安装依赖（如果 package.json 变了）
if [ -f package.json ]; then
  echo "📦 检查依赖..."
  npm install --production 2>&1 || true
fi

# 重启主服务
echo "🔄 重启 aries-app..."
pm2 restart aries-app 2>&1

# 重启记忆星图（如果配了）
if pm2 show mc > /dev/null 2>&1; then
  echo "🔄 重启 mc..."
  pm2 restart mc 2>&1
fi

echo ""
echo "✅ 部署完成！"
echo "   📋 主站: http://$(curl -s ifconfig.me)/"
echo "   🪐 星图: http://$(curl -s ifconfig.me):3000/memory.html"
pm2 list 2>&1
