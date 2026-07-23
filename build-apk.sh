#!/bin/bash
# ================================================================
# Aries App — 构建 APK
# 需要先安装 Android Studio + Android SDK
# 在 Windows 上运行：双击或在终端中运行
# ================================================================

echo "🚀 构建 Aries APK..."

# 1. 安装依赖（如果还没有）
if [ ! -d "node_modules/@capacitor/core" ]; then
  echo "📦 安装 Capacitor..."
  npm install @capacitor/core @capacitor/cli @capacitor/android
fi

# 2. 初始化 Capacitor（如果还没初始化）
if [ ! -d "android" ]; then
  echo "📱 添加 Android 平台..."
  npx cap add android
fi

# 3. 复制 web 文件到 Android 项目
echo "📋 同步文件..."
npx cap copy android

# 4. 打开 Android Studio（手动 Build）
echo ""
echo "✅ 准备完成！"
echo ""
echo "📋 下一步："
echo "   1. npx cap open android    → 打开 Android Studio"
echo "   2. 菜单 Build → Build Bundle(s) / APK"
echo "   3. 选择 APK"
echo "   4. 找到 android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "   或者直接点 ▶  Run，装到连接的手机上"
