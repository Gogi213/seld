// check-server.js - проверяем статус сервера
const http = require('http');

// Проверяем backend
function checkBackend() {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log('✅ Backend работает на порту 3001');
    console.log('Status:', res.statusCode);
  });

  req.on('error', (err) => {
    console.log('❌ Backend НЕ работает на порту 3001');
    console.log('Ошибка:', err.message);
  });

  req.on('timeout', () => {
    console.log('⏰ Таймаут при подключении к backend');
    req.destroy();
  });

  req.end();
}

checkBackend();
