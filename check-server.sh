#!/bin/bash
# check-server.sh - скрипт для проверки статуса сервера

echo "🔍 Проверяем статус сервера..."

# Проверяем процессы Node.js
echo "📋 Запущенные Node.js процессы:"
ps aux | grep node | grep -v grep

echo ""

# Проверяем порты
echo "🌐 Открытые порты (3000, 3001):"
netstat -tulpn | grep -E ':300[01]'

echo ""

# Проверяем WebSocket соединение
echo "🔌 Проверяем WebSocket на порту 3001:"
curl -I http://localhost:3001/ 2>/dev/null || echo "❌ Порт 3001 недоступен"

echo ""

# Проверяем frontend
echo "🎨 Проверяем frontend на порту 3000:"
curl -I http://localhost:3000/ 2>/dev/null || echo "❌ Порт 3000 недоступен"
