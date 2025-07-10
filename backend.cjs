// backend.cjs
// Оптимизированный сервер с WebSocket подписками на Binance и агрегацией данных

const axios = require('axios');
const WebSocket = require('ws');
const CandleAggregator = require('./candleAggregator.cjs');
const BinanceWebSocketManager = require('./binanceWebSocket.cjs');
const EnhancedSignalEngine = require('./enhancedSignalEngine.cjs');

const MIN_DAILY_VOLUME = 100000000; // 20 млн суточного объёма
const MIN_NOTIONAL = 0.3; // 0.4 NATR

// Глобальные настройки
const DEFAULT_PERCENTILE_WINDOW = 50;
const DEFAULT_PERCENTILE_LEVEL = 5;

// Инициализация основных компонентов
const candleAggregator = new CandleAggregator();
const binanceWS = new BinanceWebSocketManager(candleAggregator);
const signalEngine = new EnhancedSignalEngine(candleAggregator);

// Кэш для активных символов и их данных
let activeSymbols = new Set();
let symbolsData = new Map(); // symbol -> { dailyVolume, natr30m, etc. }
let lastSymbolsUpdate = 0;
const SYMBOLS_UPDATE_INTERVAL = 60 * 1000; // обновляем список символов раз в минуту

// Предварительно рассчитанные данные для быстрой отдачи клиентам
let preCalculatedData = null;
let lastDataCalculation = 0;
const DATA_CALCULATION_INTERVAL = 10 * 1000; // пересчитываем данные каждые 10 секунд

console.log('🚀 Starting optimized WebSocket server on port 3001...');
const wss = new WebSocket.Server({ port: 3001, host: '0.0.0.0' });
console.log('✅ WebSocket server started on ws://0.0.0.0:3001');

// Для каждого клиента храним его настройки
const clientSettings = new Map(); // ws -> { percentileWindow, percentileLevel }

async function getFuturesSymbols() {
  const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
  return res.data.symbols
    .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
    .map(s => s.symbol);
}

async function get24hTickers() {
  const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
  return res.data;
}

async function getHistoricalKlines(symbol, totalLimit = 4000) {
  const maxPerRequest = 1500;
  const allKlines = [];
  
  // Если нужно меньше 1500, делаем один запрос
  if (totalLimit <= maxPerRequest) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=${totalLimit}`;
    const res = await axios.get(url);
    return res.data.map(k => ({
      openTime: k[0],
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5],
      quoteVolume: +k[7],
      trades: +k[8]
    }));
  }
  
  // Для больших объемов делаем несколько запросов
  let remaining = totalLimit;
  let endTime = Date.now();
  
  while (remaining > 0 && allKlines.length < totalLimit) {
    const currentLimit = Math.min(remaining, maxPerRequest);
    
    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=${currentLimit}&endTime=${endTime}`;
      const res = await axios.get(url);
      
      if (!res.data || res.data.length === 0) break;
      
      const klines = res.data.map(k => ({
        openTime: k[0],
        open: +k[1],
        high: +k[2],
        low: +k[3],
        close: +k[4],
        volume: +k[5],
        quoteVolume: +k[7],
        trades: +k[8]
      }));
      
      // Добавляем в начало массива (более старые данные)
      allKlines.unshift(...klines);
      
      // Обновляем endTime для следующего запроса (берем время первой свечи минус 1 мс)
      endTime = klines[0].openTime - 1;
      remaining -= klines.length;
      
      // Небольшая задержка между запросами чтобы не превысить лимиты API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error fetching batch for ${symbol}:`, error.message);
      break;
    }
  }
  
  // Сортируем по времени и возвращаем нужное количество
  return allKlines
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-totalLimit);
}

// Обновление списка активных символов
async function updateActiveSymbols() {
  try {
    const symbols = await getFuturesSymbols();
    const tickers = await get24hTickers();
    const tickerMap = Object.fromEntries(tickers.map(t => [t.symbol, t]));
    
    const newActiveSymbols = new Set();
    const newSymbolsData = new Map();
    
    console.log(`📊 Filtering symbols from ${symbols.length} total...`);
    
    // Фильтруем символы по объему и NATR
    for (const symbol of symbols) {
      const ticker = tickerMap[symbol];
      if (!ticker) continue;
      
      const dailyVolume = parseFloat(ticker.quoteVolume);
      if (dailyVolume < MIN_DAILY_VOLUME) continue;
      
      try {
        // Получаем больше исторических данных для лучшей агрегации
        const historicalKlines = await getHistoricalKlines(symbol, 4000);
        if (historicalKlines.length < 30) continue;
        
        // Рассчитываем NATR на последних 30 свечах
        const last30 = historicalKlines.slice(-30);
        let atr = 0;
        for (let i = 1; i < last30.length; i++) {
          const prev = last30[i-1];
          const curr = last30[i];
          const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
          );
          atr += tr;
        }
        atr = atr / (last30.length - 1);
        const lastClose = last30[last30.length-1]?.close;
        const natr = lastClose ? (atr / lastClose) * 100 : 0;
        
        if (natr >= MIN_NOTIONAL) {
          newActiveSymbols.add(symbol);
          newSymbolsData.set(symbol, {
            dailyVolume,
            natr30m: natr,
            lastUpdate: Date.now()
          });
          
          // Предзагружаем ВСЕ исторические данные в агрегатор
          console.log(`📈 Loading ${historicalKlines.length} historical candles for ${symbol}`);
          for (const candle of historicalKlines) {
            candleAggregator.addMinuteCandle(symbol, candle);
          }
        }
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error.message);
      }
    }
    
    console.log(`✅ Filtered to ${newActiveSymbols.size} active symbols`);
    
    // Обновляем подписки WebSocket
    const currentSymbols = Array.from(activeSymbols);
    const newSymbolsArray = Array.from(newActiveSymbols);
    
    // Отписываемся от неактивных символов
    const toUnsubscribe = currentSymbols.filter(s => !newActiveSymbols.has(s));
    for (const symbol of toUnsubscribe) {
      binanceWS.unsubscribeFromSymbol(symbol);
    }
    
    // Подписываемся на новые символы
    const toSubscribe = newSymbolsArray.filter(s => !activeSymbols.has(s));
    if (toSubscribe.length > 0) {
      binanceWS.subscribeToSymbols(toSubscribe);
    }
    
    // Обновляем глобальные переменные
    activeSymbols = newActiveSymbols;
    symbolsData = newSymbolsData;
    lastSymbolsUpdate = Date.now();
    
    console.log(`📈 Active symbols updated: +${toSubscribe.length} -${toUnsubscribe.length} = ${activeSymbols.size} total`);
    
    // После обновления символов сразу пересчитываем данные
    await calculateAndCacheData();
    
  } catch (error) {
    console.error('Error updating active symbols:', error);
  }
}

// Функция для предварительного расчета и кэширования данных
async function calculateAndCacheData() {
  if (activeSymbols.size === 0) return;
  
  try {
    console.log('🔄 Pre-calculating signals for all symbols...');
    const startTime = Date.now();
    
    // Рассчитываем данные с дефолтными настройками
    preCalculatedData = generateClientData(DEFAULT_PERCENTILE_WINDOW, DEFAULT_PERCENTILE_LEVEL);
    lastDataCalculation = Date.now();
    
    const calculationTime = Date.now() - startTime;
    console.log(`✅ Pre-calculated data for ${activeSymbols.size} symbols in ${calculationTime}ms`);
    
  } catch (error) {
    console.error('Error pre-calculating data:', error);
  }
}

// Генерация полных данных для клиентов
function generateClientData(percentileWindow, percentileLevel) {
  // Обновляем настройки движка сигналов
  signalEngine.updateSettings({
    percentileWindow,
    percentileLevel
  });
  
  const results = [];
  const candleData = {};
  
  // Рассчитываем сигналы для всех активных символов
  for (const symbol of activeSymbols) {
    const symbolData = symbolsData.get(symbol);
    if (!symbolData) continue;
    
    // Рассчитываем сигналы
    const signals = signalEngine.calculateSignalsForSymbol(symbol);
    
    // Формируем данные для таблицы с cellState
    const tableData = {
      symbol,
      dailyVolume: symbolData.dailyVolume,
      natr30m: symbolData.natr30m,
      ...signals
    };
    
    // Добавляем cellState для каждого таймфрейма
    const tfList = ['1m', '5m', '15m', '30m', '1h'];
    for (const tf of tfList) {
      const hasActiveSignal = signals[`percentileSignal_${tf}`] || false;
      const hasExpiredSignal = signals[`percentileSignalExpired_${tf}`] || false;
      
      tableData[`cellState_${tf}`] = {
        hasActiveSignal,
        hasExpiredSignal,
        style: {
          background: hasActiveSignal ? 'rgba(74, 222, 128, 0.15)' :
                     hasExpiredSignal ? 'rgba(255, 193, 7, 0.15)' : 'transparent',
          border: hasActiveSignal ? '1px solid rgba(74, 222, 128, 0.3)' :
                 hasExpiredSignal ? '1px solid rgba(255, 193, 7, 0.3)' : '1px solid #333'
        }
      };
    }
    
    results.push(tableData);
    
    // Формируем данные свечей для графиков
    candleData[symbol] = {};
    
    for (const tf of tfList) {
      // Рассчитываем максимально доступное количество свечей для каждого таймфрейма
      let maxCandles;
      switch(tf) {
        case '1m': maxCandles = 4000; break;  // Все загруженные свечи
        case '5m': maxCandles = 800; break;   // 4000/5 = 800
        case '15m': maxCandles = 266; break;  // 4000/15 ≈ 266
        case '30m': maxCandles = 133; break;  // 4000/30 ≈ 133
        case '1h': maxCandles = 66; break;    // 4000/60 ≈ 66
        default: maxCandles = 800;
      }
      
      // Для 1m используем максимально доступное количество свечей
      const actualLimit = tf === '1m' ? 4000 : maxCandles;
      const candles = candleAggregator.getAggregatedCandles(symbol, tf, actualLimit);
      candleData[symbol][tf] = candles.map(c => ({
        time: Math.floor(c.openTime / 1000), // TradingView формат
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));
    }
  }
  
  // Сортируем результаты по NATR
  results.sort((a, b) => (b.natr30m || 0) - (a.natr30m || 0));
  
  return {
    signals: results,
    candles: candleData,
    timestamp: Date.now(),
    stats: {
      totalSymbols: activeSymbols.size,
      candleAggregator: candleAggregator.getCacheStats(),
      signalEngine: signalEngine.getCacheStats(),
      binanceWS: binanceWS.getConnectionStatus()
    }
  };
}

// Обработка новых подключений
wss.on('connection', (ws) => {
  console.log('🔌 New client connected');
  
  // Устанавливаем дефолтные настройки
  clientSettings.set(ws, {
    percentileWindow: DEFAULT_PERCENTILE_WINDOW,
    percentileLevel: DEFAULT_PERCENTILE_LEVEL
  });

  // Отправляем текущие данные новому клиенту
  if (activeSymbols.size > 0) {
    const settings = clientSettings.get(ws);
    
    // Если настройки дефолтные и есть предрассчитанные данные - используем их
    if (settings.percentileWindow === DEFAULT_PERCENTILE_WINDOW &&
        settings.percentileLevel === DEFAULT_PERCENTILE_LEVEL &&
        preCalculatedData) {
      console.log('⚡ Sending pre-calculated data to new client');
      ws.send(JSON.stringify({
        type: 'full_update',
        data: preCalculatedData
      }));
    } else {
      // Иначе рассчитываем на лету
      console.log('🔄 Calculating custom data for new client');
      const data = generateClientData(settings.percentileWindow, settings.percentileLevel);
      ws.send(JSON.stringify({
        type: 'full_update',
        data
      }));
    }
  }

  // При получении сообщения — ожидаем настройки, пересчитываем сигналы и отправляем
  ws.on('message', async (msg) => {
    try {
      const message = JSON.parse(msg);
      
      if (message.type === 'update_settings') {
        const { percentileWindow = DEFAULT_PERCENTILE_WINDOW, percentileLevel = DEFAULT_PERCENTILE_LEVEL } = message.data || {};
        
        // Валидация параметров
        const validWindow = Math.max(5, Math.min(200, Number(percentileWindow)));
        const validLevel = Math.max(0, Math.min(100, Number(percentileLevel)));
        
        clientSettings.set(ws, {
          percentileWindow: validWindow,
          percentileLevel: validLevel
        });
        
        // Генерируем новые данные с обновленными настройками
        const data = generateClientData(validWindow, validLevel);
        ws.send(JSON.stringify({
          type: 'settings_update',
          data
        }));
      }
    } catch (e) {
      console.error('Error processing WebSocket message:', e);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected');
    clientSettings.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clientSettings.delete(ws);
  });
});

// Функция для отправки обновлений всем клиентам
function broadcastToClients(data) {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const settings = clientSettings.get(ws) || {
          percentileWindow: DEFAULT_PERCENTILE_WINDOW,
          percentileLevel: DEFAULT_PERCENTILE_LEVEL
        };
        
        const clientData = generateClientData(settings.percentileWindow, settings.percentileLevel);
        ws.send(JSON.stringify({
          type: 'periodic_update',
          data: clientData
        }));
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    }
  });
}

// Обработка обновлений от WebSocket Binance
binanceWS.on('kline', (symbol, kline) => {
  // Добавляем свечу в агрегатор
  candleAggregator.addMinuteCandle(symbol, {
    openTime: kline.t,
    open: parseFloat(kline.o),
    high: parseFloat(kline.h),
    low: parseFloat(kline.l),
    close: parseFloat(kline.c),
    volume: parseFloat(kline.v),
    quoteVolume: parseFloat(kline.q),
    trades: kline.n
  });
  
  // Если свеча закрыта, отправляем обновление клиентам
  if (kline.x && wss.clients.size > 0) {
    // Отправляем обновление только для конкретного символа
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const settings = clientSettings.get(ws) || {
            percentileWindow: DEFAULT_PERCENTILE_WINDOW,
            percentileLevel: DEFAULT_PERCENTILE_LEVEL
          };
          
          const data = generateClientData(settings.percentileWindow, settings.percentileLevel);
          const symbolData = data.signals.find(s => s.symbol === symbol);
          
          if (symbolData) {
            ws.send(JSON.stringify({
              type: 'symbol_update',
              symbol,
              data: {
                signal: symbolData,
                candles: data.candles[symbol] || {}
              }
            }));
          }
        } catch (error) {
          console.error('Error sending symbol update:', error);
        }
      }
    });
  }
});

// Инициализация и запуск системы
async function initializeSystem() {
  console.log('🔄 Initializing system...');
  
  try {
    // Первоначальное обновление активных символов
    await updateActiveSymbols();
    
    // Настройка периодических обновлений символов
    setInterval(updateActiveSymbols, 5 * 60 * 1000); // каждые 5 минут
    
    // Настройка периодического пересчета данных
    setInterval(async () => {
      if (activeSymbols.size > 0) {
        await calculateAndCacheData();
      }
    }, DATA_CALCULATION_INTERVAL);
    
    // Настройка периодической отправки обновлений клиентам
    setInterval(() => {
      if (wss.clients.size > 0 && activeSymbols.size > 0) {
        broadcastToClients();
      }
    }, 15 * 1000); // каждые 15 секунд
    
    console.log('✅ System initialized successfully');
    console.log(`📊 Active symbols: ${activeSymbols.size}`);
    console.log(`⚡ Pre-calculated data ready for instant delivery`);
    console.log(`🔌 WebSocket server ready for connections`);
    
  } catch (error) {
    console.error('❌ Failed to initialize system:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Закрываем WebSocket соединения
  binanceWS.close();
  
  // Закрываем клиентские соединения
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.kill(process.pid, 'SIGINT');
});

// Запуск системы
initializeSystem().catch(error => {
  console.error('❌ Failed to start system:', error);
  process.exit(1);
});
