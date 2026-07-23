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

# 记忆星图：恢复被 .gitignore 排除的配置文件
echo "🔧 检查星图配置..."
MC_DIR="/root/aries-app/memory-constellations"
if [ -d "$MC_DIR" ]; then
  cd "$MC_DIR"
  [ -f memory_config.json ] || { echo "  恢复 memory_config.json"; cp memory_config.example.json memory_config.json; }
  [ -f core-prompt.txt ] || { echo "  恢复 core-prompt.txt"; cp core-prompt.example.txt core-prompt.txt; }
  # 更新星图（如果新 version 有 .env.example 变动）
  if [ ! -f .env ]; then
    echo "⚠️  缺少 .env，请手动配置！"
    echo "   cp .env.example .env"
    echo "   然后填入 SANCTUARY_ENCRYPTION_KEY、LOGIN_PASSWORD 等"
  fi
  # 新依赖
  npm install --production 2>&1 | tail -3 || true
fi

# 重启主服务
echo "🔄 重启 aries-app..."
cd /root/aries-app
pm2 restart aries-app 2>&1

# 重启记忆星图
if pm2 show mc > /dev/null 2>&1; then
  echo "🔄 重启 mc..."
  pm2 restart mc --update-env 2>&1
fi

echo ""
echo "✅ 部署完成！"
echo "   📋 主站: http://$(curl -s ifconfig.me)/"
echo "   🪐 星图: http://$(curl -s ifconfig.me):3000/memory.html"
pm2 list 2>&1
