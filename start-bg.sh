#!/usr/bin/env bash
# Jasmine's Home — 后台启动，关闭终端也不停
cd "$(dirname "$0")"

# 启动三个服务（后台，日志写到文件）
nohup python3 -m http.server 8080 > /dev/null 2>&1 &
nohup node Duetto/server/index.mjs > /dev/null 2>&1 &
nohup python3 cedareco/standalone_server.py > /dev/null 2>&1 &

echo "✅ 已后台启动！手机访问 http://$(hostname -I | awk '{print $1}'):8080"
echo ""
echo "如需停止: killall node python3 或重启电脑"
