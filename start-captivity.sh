#!/bin/bash
# 启动囚禁模拟器后端
cd "$(dirname "$0")"
export CAPTIVITY_AI_API_KEY="${CAPTIVITY_AI_API_KEY:-$ANTHROPIC_AUTH_TOKEN}"
python3 -m captivity_simulator.server
