// backend.cjs
// Запуск сбора сигналов по всем монетам Binance Futures

const axios = require('axios');
const VolumeSignalEngine = require('./signalEngine.cjs');

const MIN_DAILY_VOLUME = 20000000; // 20 млн суточного объёма
const MIN_NOTIONAL = 0.4; // 0.4 yfnh

// Глобальные дефолты, но для каждого клиента можно хранить свои
const SMA_LENGTH = 200;
const DEFAULT_PERCENTILE_WINDOW = 50;
const DEFAULT_PERCENTILE_LEVEL = 5;

async function getFuturesSymbols() {
  const res = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo');
  return res.data.symbols
    .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
    .map(s => s.symbol);
}

async function get24hTickers() {
  const res = await axios.get('https://fapi.binance.com/fapi/v1/ticker/24hr');
  // Возвращает массив объектов с symbol, quoteVolume и др.
  return res.data;
}

async function getLast30mKlines(symbol) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=30`;
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


const WebSocket = require('ws');
console.log('🚀 Starting WebSocket server on port 3001...');
const wss = new WebSocket.Server({ port: 3001, host: '0.0.0.0' });

console.log('✅ WebSocket server started on ws://0.0.0.0:3001');

// Для каждого клиента храним его настройки и сигналы
const clientSettings = new Map(); // ws -> { percentileWindow, percentileLevel }
const clientSignals = new Map();  // ws -> signals

// Фоновый кэш для ускорения (по дефолтным настройкам)
let cachedSignals = [];
let cachedAt = 0;

// Фоновое обновление кэша раз в минуту
async function updateCachedSignals() {
  cachedSignals = await calculateSignals(DEFAULT_PERCENTILE_WINDOW, DEFAULT_PERCENTILE_LEVEL);
  cachedAt = Date.now();
}
setInterval(updateCachedSignals, 60 * 1000);
updateCachedSignals();

// Основная функция расчёта сигналов (может вызываться с разными параметрами)
async function calculateSignals(percentileWindow, percentileLevel) {
  const symbols = await getFuturesSymbols();
  const tickers = await get24hTickers();
  const tickerMap = Object.fromEntries(tickers.map(t => [t.symbol, t]));
  const filtered = [];
  // Максимально ускоряем: concurrency 200, кэш свечей на 30 сек, лог времени этапов
  const concurrency = 200;
  const results = [];
  const klineCache = new Map(); // key: symbol+tf, value: {data, ts}
  const KLINE_CACHE_TTL = 30 * 1000;
  const getKlines = async (symbol, tf, limit) => {
    const key = symbol + '_' + tf + '_' + limit;
    const now = Date.now();
    if (klineCache.has(key)) {
      const cached = klineCache.get(key);
      if (now - cached.ts < KLINE_CACHE_TTL) return cached.data;
    }
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
    const res = await axios.get(url);
    klineCache.set(key, { data: res.data, ts: now });
    return res.data;
  };
  const t0 = Date.now();
  for (let i = 0; i < symbols.length; i += concurrency) {
    const chunk = symbols.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(async (symbol) => {
    try {
      const ticker = tickerMap[symbol];
      if (!ticker) return;
      const dailyVolume = parseFloat(ticker.quoteVolume);
      if (dailyVolume < MIN_DAILY_VOLUME) return;
      // Кэшируем 30m klines
      const klines30 = (await getKlines(symbol, '1m', 30)).map(k => ({
        openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], quoteVolume: +k[7], trades: +k[8]
      }));
      // NATR = ATR / Close * 100, ATR по 30 минутам
      let atr = 0;
      for (let i = 1; i < klines30.length; i++) {
        const prev = klines30[i-1];
        const curr = klines30[i];
        const tr = Math.max(
          curr.high - curr.low,
          Math.abs(curr.high - prev.close),
          Math.abs(curr.low - prev.close)
        );
        atr += tr;
      }
      atr = atr / (klines30.length - 1);
      const lastClose = klines30[klines30.length-1]?.close;
      const natr = lastClose ? (atr / lastClose) * 100 : 0;
      if (natr < MIN_NOTIONAL) return;
      // --- Percentile Signals for 1m, 3m, 5m, 15m, 30m ---
      const tfList = [
        { key: '1m', label: '1m', durationMs: 1 * 60 * 1000, expirePeriods: 3 }, // 1m истекает через 3 свечи
        { key: '3m', label: '3m', durationMs: 3 * 60 * 1000, expirePeriods: 1 }, // остальные через 1 свечу
        { key: '5m', label: '5m', durationMs: 5 * 60 * 1000, expirePeriods: 1 },
        { key: '15m', label: '15m', durationMs: 15 * 60 * 1000, expirePeriods: 1 },
        { key: '30m', label: '30m', durationMs: 30 * 60 * 1000, expirePeriods: 1 }
      ];
      const percentileSignals = {};
      const currentTime = Date.now();
      
      for (const tf of tfList) {
        // Кэшируем klines для каждого tf
        const tfKlines = await getKlines(symbol, tf.key, percentileWindow);
        const volumes = tfKlines.map(k => +k[5]);
        const timestamps = tfKlines.map(k => +k[0]);
        
        // Определяем последнюю ЗАКРЫТУЮ свечу (не текущую формирующуюся)
        const lastClosedIndex = volumes.length - 2; // предпоследняя свеча точно закрыта
        const lastVolume = volumes[lastClosedIndex];
        const lastCandleTime = timestamps[lastClosedIndex];
        
        // Проверяем валидность данных
        if (lastVolume === undefined || lastCandleTime === undefined) {
          percentileSignals[`percentileRank_${tf.key}`] = null;
          percentileSignals[`percentileSignal_${tf.key}`] = false;
          percentileSignals[`percentileSignalExpired_${tf.key}`] = false;
          percentileSignals[`cellState_${tf.key}`] = {
            hasActiveSignal: false,
            hasExpiredSignal: false,
            style: {}
          };
          continue;
        }
        
        // Расчет процентиля для исторических данных (исключая последнюю формирующуюся свечу)
        const historicalVolumes = volumes.slice(0, -1); // убираем текущую формирующуюся
        const sorted = [...historicalVolumes].sort((a, b) => a - b);
        
        // Проверяем текущую (последнюю закрытую) свечу
        let rank = 0;
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i] < lastVolume) rank++;
          else break;
        }
        const denom = Math.max(sorted.length - 1, 1);
        const percentileRank = (rank / denom) * 100;
        const currentHasSignal = percentileRank <= percentileLevel;
        
        // Проверяем предыдущие свечи на наличие сигналов (для протухших)
        let foundExpiredSignal = false;
        const checkPeriods = tf.expirePeriods; // сколько периодов назад проверяем
        
        for (let periodBack = 1; periodBack <= checkPeriods; periodBack++) {
          const checkIndex = lastClosedIndex - periodBack;
          if (checkIndex >= 0 && checkIndex < volumes.length - 1) {
            const checkVolume = volumes[checkIndex];
            const checkTime = timestamps[checkIndex];
            
            // Рассчитываем процентиль для этой свечи
            let checkRank = 0;
            for (let i = 0; i < sorted.length; i++) {
              if (sorted[i] < checkVolume) checkRank++;
              else break;
            }
            const checkPercentileRank = (checkRank / denom) * 100;
            const hadSignal = checkPercentileRank <= percentileLevel;
            
            // Проверяем, истек ли этот сигнал
            if (hadSignal) {
              const signalAge = currentTime - (checkTime + tf.durationMs);
              const expireTime = tf.durationMs * tf.expirePeriods;
              if (signalAge <= expireTime) {
                // Сигнал ещё не полностью истек
                if (!currentHasSignal) {
                  foundExpiredSignal = true;
                  // Диагностика для отладки
                  if (symbol === 'MUSDT') {
                    console.log(`🔍 MUSDT ${tf.key}: Найден протухший сигнал на ${periodBack} свечей назад (${checkPercentileRank.toFixed(2)}% <= ${percentileLevel}%)`);
                  }
                }
              }
            }
          }
        }
        
        // Определяем активность сигнала с учетом разных периодов истечения
        const signalAge = currentTime - (lastCandleTime + tf.durationMs);
        const expireTime = tf.durationMs * tf.expirePeriods;
        const isCurrentExpired = currentHasSignal && signalAge > expireTime;
        
        percentileSignals[`percentileRank_${tf.key}`] = percentileRank;
        percentileSignals[`percentileSignal_${tf.key}`] = currentHasSignal && !isCurrentExpired;
        percentileSignals[`percentileSignalExpired_${tf.key}`] = isCurrentExpired || foundExpiredSignal;
        
        // Генерируем cellState для фронтенда
        const hasActiveSignal = percentileSignals[`percentileSignal_${tf.key}`];
        const hasExpiredSignal = percentileSignals[`percentileSignalExpired_${tf.key}`];
        
        const cellState = {
          hasActiveSignal,
          hasExpiredSignal,
          style: {}
        };
        
        // Добавляем стили для активных сигналов
        if (hasActiveSignal) {
          cellState.style = {
            background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
            boxShadow: '0 0 8px rgba(59, 130, 246, 0.6), inset 0 1px 2px rgba(255,255,255,0.1)',
            border: '1px solid #3b82f6'
          };
        } else if (hasExpiredSignal) {
          cellState.style = {
            background: 'linear-gradient(135deg, #92400e 0%, #f59e0b 100%)',
            boxShadow: '0 0 6px rgba(245, 158, 11, 0.4), inset 0 1px 2px rgba(255,255,255,0.1)',
            border: '1px solid #f59e0b'
          };
        }
        
        percentileSignals[`cellState_${tf.key}`] = cellState;
      }

      return {
        symbol,
        dailyVolume,
        natr30m: natr,
        ...percentileSignals
      };
      // Можно убрать console.log для ускорения
    } catch (e) {
      // пропускаем ошибку по монете
      return null;
    }
  }));
    results.push(...chunkResults.filter(Boolean));
  }
  // Сортировка по natr30m по убыванию
  results.sort((a, b) => (b.natr30m || 0) - (a.natr30m || 0));
  const t1 = Date.now();
  
  // Логируем статистику сигналов для диагностики
  const signalStats = {
    totalCoins: results.length,
    activeSignals: {},
    expiredSignals: {}
  };
  
  const tfList = ['1m', '3m', '5m', '15m', '30m'];
  tfList.forEach(tf => {
    signalStats.activeSignals[tf] = results.filter(r => r[`percentileSignal_${tf}`]).length;
    signalStats.expiredSignals[tf] = results.filter(r => r[`percentileSignalExpired_${tf}`]).length;
  });
  
  console.log(`[${new Date().toISOString()}] Сигналы обновлены за ${t1 - t0}мс:`, 
              `Монет: ${signalStats.totalCoins}`, 
              `Активные:`, signalStats.activeSignals,
              `Истекшие:`, signalStats.expiredSignals);
  
  // Детальная диагностика активных сигналов
  if (Object.values(signalStats.activeSignals).some(count => count > 0)) {
    console.log("🐸 АКТИВНЫЕ СИГНАЛЫ:");
    tfList.forEach(tf => {
      const activeCoins = results.filter(r => r[`percentileSignal_${tf}`]);
      if (activeCoins.length > 0) {
        console.log(`  ${tf}: ${activeCoins.map(c => `${c.symbol}(${c[`percentileRank_${tf}`]?.toFixed(1)}%)`).join(', ')}`);
      }
    });
  }
  
  return results;
}

// Обработка новых подключений
wss.on('connection', (ws) => {
  console.log('🔌 New client connected');
  
  // Устанавливаем дефолтные настройки
  clientSettings.set(ws, {
    percentileWindow: DEFAULT_PERCENTILE_WINDOW,
    percentileLevel: DEFAULT_PERCENTILE_LEVEL
  });

  // При получении сообщения — ожидаем настройки, пересчитываем сигналы и отправляем
  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      let { percentileWindow, percentileLevel } = data;
      percentileWindow = Math.max(5, Math.min(200, Number(percentileWindow) || DEFAULT_PERCENTILE_WINDOW));
      percentileLevel = Math.max(0, Math.min(100, Number(percentileLevel) || DEFAULT_PERCENTILE_LEVEL));
      clientSettings.set(ws, { percentileWindow, percentileLevel });
      // Считаем сигналы с новыми настройками
      ws.send(JSON.stringify([{ loading: true }])); // Для UX: показать загрузку
      const signals = await calculateSignals(percentileWindow, percentileLevel);
      clientSignals.set(ws, signals);
      ws.send(JSON.stringify(signals));
    } catch (e) {
      ws.send(JSON.stringify([]));
    }
  });

  // При открытии сразу отправляем кэш (быстро), потом клиент может запросить свои настройки
  ws.send(JSON.stringify(cachedSignals));

  ws.on('close', () => {
    clientSettings.delete(ws);
    clientSignals.delete(ws);
  });
});
