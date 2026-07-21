#!/usr/bin/env bash
# Render start wrapper — 避免 Render 吞 .py 扩展名
exec python3 hervoice-server.py $PORT
