#!/bin/bash
# Start Cloudflare Tunnel for HTTPS access
# Usage: bash start-tunnel.sh
# Find the URL: grep "trycloudflare" /tmp/cf-tunnel.log

PID_FILE=/tmp/cf-tunnel.pid

if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
  echo "Tunnel already running (PID $(cat $PID_FILE))"
  exit 0
fi

nohup cloudflared --url http://localhost:80 > /tmp/cf-tunnel.log 2>&1 &
echo $! > $PID_FILE
echo "Tunnel started (PID $!)"
sleep 4
URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/cf-tunnel.log | head -1)
echo "URL: $URL"
