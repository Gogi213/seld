// check-websocket.js - проверяем WebSocket сервер
const WebSocket = require('ws');

function checkWebSocket() {
  console.log('🔍 Проверяем WebSocket сервер на порту 3001...');
  
  try {
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.on('open', () => {
      console.log('✅ WebSocket сервер работает на порту 3001');
      ws.close();
    });
    
    ws.on('error', (err) => {
      console.log('❌ WebSocket сервер НЕ работает на порту 3001');
      console.log('Ошибка:', err.message);
    });
    
    // Таймаут
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('⏰ Таймаут при подключении к WebSocket');
        ws.terminate();
      }
    }, 5000);
    
  } catch (error) {
    console.log('❌ Ошибка создания WebSocket:', error.message);
  }
}

checkWebSocket();
