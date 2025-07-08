// binanceFutures.cjs
// Модуль для сбора данных с Binance Futures через WebSocket

const WebSocket = require('ws');
const symbolsUrl = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
const axios = require('axios');

async function getFuturesSymbols() {
  const res = await axios.get(symbolsUrl);
  return res.data.symbols
    .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
    .map(s => s.symbol);
}

function subscribeToKlines(symbol, interval = '1m', onData) {
  const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`);
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.k && msg.k.x) {
      onData(msg.k);
    }
  });
  ws.on('error', (err) => console.error('WS error', err));
  return ws;
}

module.exports = { getFuturesSymbols, subscribeToKlines };
