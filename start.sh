#!/bin/bash
# A2A Server 启动脚本

A2A_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${A2A_DIR}/logs"
PID_FILE="${A2A_DIR}/server.pid"

# 检查 identity.json
if [ ! -f "${A2A_DIR}/identity.json" ]; then
    echo "❌ 错误：找不到 identity.json"
    echo ""
    echo "请复制 identity.example.json 并修改："
    echo "  cp identity.example.json identity.json"
    echo "  # 编辑 identity.json，填入你的配置"
    exit 1
fi

# 创建日志目录
mkdir -p "${LOG_DIR}"

# 停止旧进程
if [ -f "${PID_FILE}" ]; then
    OLD_PID=$(cat "${PID_FILE}")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "🛑 停止旧进程 (PID: $OLD_PID)..."
        kill "$OLD_PID"
        sleep 2
    fi
    rm -f "${PID_FILE}"
fi

# 启动新进程（智能回复版 server_v2.js）
echo "🚀 启动 A2A Server (智能回复版)..."
cd "${A2A_DIR}"
nohup node server_v2.js > "${LOG_DIR}/server.log" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "${PID_FILE}"

sleep 2

# 检查是否启动成功
if kill -0 "$NEW_PID" 2>/dev/null; then
    # 从 identity.json 读取端口
    PORT=$(node -e "console.log(require('./identity.json').port || 3100)")
    echo "✅ A2A Server 已启动 (PID: $NEW_PID, 端口: $PORT)"
    echo ""
    echo "测试命令："
    echo "  curl http://localhost:${PORT}/health"
else
    echo "❌ 启动失败，请检查日志："
    echo "  cat ${LOG_DIR}/server.log"
fi