#!/usr/bin/env bash
# Render start wrapper — 避免 Render 吞 .py 扩展名
export PYTHONPATH=eventide-tmp/src
exec python3 eventide-server.py $PORT
