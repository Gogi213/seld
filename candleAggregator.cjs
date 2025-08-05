// candleAggregator.cjs
// Модуль для агрегации свечей из 1-минутных данных в другие таймфреймы

class CandleAggregator {
  constructor() {
    // Кэш для хранения 1m свечей по символам
    this.minuteCandles = new Map(); // symbol -> array of 1m candles
    // Кэш агрегированных данных с LRU механизмом
    this.aggregatedCache = new Map(); // symbol_timeframe -> array of candles
    this.cacheAccessOrder = new Map(); // symbol_timeframe -> timestamp
    
    // Лимиты для предотвращения утечек памяти
    this.maxMinuteCandles = 2000; // Уменьшено с 4000 до 2000 (1.4 дня)
    this.maxSymbols = 50; // Максимум 50 символов в кэше одновременно
    this.maxAggregatedCache = 200; // Максимум 200 записей в агрегированном кэше
    
    // Счетчики для мониторинга
    this.cleanupCounter = 0;
    this.lastCleanup = Date.now();
  }

  // Добавить новую 1-минутную свечу
  addMinuteCandle(symbol, candle) {
    // Проверяем лимиты перед добавлением
    this.enforceSymbolLimits();
    
    if (!this.minuteCandles.has(symbol)) {
      this.minuteCandles.set(symbol, []);
    }
    const candles = this.minuteCandles.get(symbol);
    
    // Проверяем, не дублируется ли свеча по времени
    const existingIndex = candles.findIndex(c => c.openTime === candle.openTime);
    if (existingIndex !== -1) {
      // Обновляем существующую свечу (для формирующихся свечей)
      candles[existingIndex] = candle;
    } else {
      // Добавляем новую свечу
      candles.push(candle);
      // Сортируем по времени
      candles.sort((a, b) => a.openTime - b.openTime);
      // Ограничиваем размер кэша
      if (candles.length > this.maxMinuteCandles) {
        candles.splice(0, candles.length - this.maxMinuteCandles);
      }
    }
    // Инвалидируем кэш агрегированных данных для этого символа
    this.invalidateAggregatedCache(symbol);
  }

  // Принудительное соблюдение лимитов символов
  enforceSymbolLimits() {
    if (this.minuteCandles.size >= this.maxSymbols) {
      // Находим самый старый символ (LRU) и удаляем его
      let oldestTime = Date.now();
      let oldestSymbol = null;
      
      for (const [symbol, candles] of this.minuteCandles.entries()) {
        if (candles.length > 0) {
          const lastCandleTime = candles[candles.length - 1].openTime;
          if (lastCandleTime < oldestTime) {
            oldestTime = lastCandleTime;
            oldestSymbol = symbol;
          }
        }
      }
      
      if (oldestSymbol) {
        this.minuteCandles.delete(oldestSymbol);
        this.invalidateAggregatedCache(oldestSymbol);
        console.log(`🧹 Removed old symbol from cache: ${oldestSymbol}`);
      }
    }
  }

  // Инвалидация кэша агрегированных данных
  invalidateAggregatedCache(symbol) {
    const keysToDelete = [];
    for (const key of this.aggregatedCache.keys()) {
      if (key.startsWith(symbol + '_')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.aggregatedCache.delete(key));
  }

  // Получить агрегированные свечи для указанного таймфрейма
  getAggregatedCandles(symbol, timeframe, limit = 4000) {
    const cacheKey = `${symbol}_${timeframe}`;
    
    // Обновляем время доступа для LRU
    this.cacheAccessOrder.set(cacheKey, Date.now());
    
    // Проверяем кэш
    if (this.aggregatedCache.has(cacheKey)) {
      const cached = this.aggregatedCache.get(cacheKey);
      return cached.slice(-limit);
    }
    
    const minuteCandles = this.minuteCandles.get(symbol);
    if (!minuteCandles || minuteCandles.length === 0) {
      return [];
    }
    
    // Определяем интервал в минутах
    const intervalMinutes = this.getIntervalMinutes(timeframe);
    if (intervalMinutes === 1) {
      // Для 1m просто возвращаем исходные данные
      const result = minuteCandles.slice(-limit);
      this.setAggregatedCache(cacheKey, result);
      return result;
    }
    
    // Агрегируем данные
    const aggregated = this.aggregateCandles(minuteCandles, intervalMinutes);
    this.setAggregatedCache(cacheKey, aggregated);
    
    return aggregated.slice(-limit);
  }

  // Установить данные в агрегированный кэш с проверкой лимитов
  setAggregatedCache(cacheKey, data) {
    // Проверяем лимиты кэша
    if (this.aggregatedCache.size >= this.maxAggregatedCache) {
      this.cleanupAggregatedCache();
    }
    
    this.aggregatedCache.set(cacheKey, data);
    this.cacheAccessOrder.set(cacheKey, Date.now());
  }

  // Очистка агрегированного кэша по LRU принципу
  cleanupAggregatedCache() {
    const entries = Array.from(this.cacheAccessOrder.entries());
    entries.sort((a, b) => a[1] - b[1]); // Сортируем по времени доступа
    
    // Удаляем 25% самых старых записей
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      const keyToRemove = entries[i][0];
      this.aggregatedCache.delete(keyToRemove);
      this.cacheAccessOrder.delete(keyToRemove);
    }
    
    this.cleanupCounter++;
    console.log(`🧹 Cleaned up ${toRemove} entries from aggregated cache (cleanup #${this.cleanupCounter})`);
  }

  // Преобразование таймфрейма в минуты
  getIntervalMinutes(timeframe) {
    const intervals = {
      '1m': 1,
      '3m': 3,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '2h': 120,
      '4h': 240,
      '6h': 360,
      '8h': 480,
      '12h': 720,
      '1d': 1440
    };
    return intervals[timeframe] || 1;
  }

  // Агрегация свечей
  aggregateCandles(minuteCandles, intervalMinutes) {
    if (minuteCandles.length === 0) return [];
    
    const aggregated = [];
    let currentGroup = [];
    let groupStartTime = null;
    
    for (const candle of minuteCandles) {
      const candleTime = new Date(candle.openTime);
      
      // Определяем начало интервала для этой свечи
      const intervalStart = this.getIntervalStart(candleTime, intervalMinutes);
      
      if (groupStartTime === null) {
        groupStartTime = intervalStart.getTime();
      }
      
      // Если свеча принадлежит текущему интервалу
      if (intervalStart.getTime() === groupStartTime) {
        currentGroup.push(candle);
      } else {
        // Завершаем текущую группу и начинаем новую
        if (currentGroup.length > 0) {
          aggregated.push(this.createAggregatedCandle(currentGroup, groupStartTime));
        }
        
        currentGroup = [candle];
        groupStartTime = intervalStart.getTime();
      }
    }
    
    // Добавляем последнюю группу
    if (currentGroup.length > 0) {
      aggregated.push(this.createAggregatedCandle(currentGroup, groupStartTime));
    }
    
    return aggregated;
  }

  // Определение начала интервала
  getIntervalStart(date, intervalMinutes) {
    const result = new Date(date);
    const minutes = result.getMinutes();
    const alignedMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes;
    
    result.setMinutes(alignedMinutes);
    result.setSeconds(0);
    result.setMilliseconds(0);
    
    return result;
  }

  // Создание агрегированной свечи из группы 1m свечей
  createAggregatedCandle(candles, openTime) {
    if (candles.length === 0) return null;
    
    // Сортируем по времени для корректной агрегации
    candles.sort((a, b) => a.openTime - b.openTime);
    
    const first = candles[0];
    const last = candles[candles.length - 1];
    
    // OHLC агрегация
    const open = first.open;
    const close = last.close;
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    
    // Суммируем объемы
    const volume = candles.reduce((sum, c) => sum + c.volume, 0);
    const quoteVolume = candles.reduce((sum, c) => sum + (c.quoteVolume || 0), 0);
    const trades = candles.reduce((sum, c) => sum + (c.trades || 0), 0);
    
    return {
      openTime,
      open,
      high,
      low,
      close,
      volume,
      quoteVolume,
      trades,
      closeTime: last.closeTime || (openTime + (candles.length * 60 * 1000) - 1)
    };
  }

  // Получить доступные символы
  getAvailableSymbols() {
    return Array.from(this.minuteCandles.keys());
  }

  // Получить статистику кэша
  getCacheStats() {
    const symbolsCount = this.minuteCandles.size;
    let totalMinuteCandles = 0;
    let totalAggregatedCandles = 0;
    
    for (const candles of this.minuteCandles.values()) {
      totalMinuteCandles += candles.length;
    }
    
    for (const candles of this.aggregatedCache.values()) {
      totalAggregatedCandles += candles.length;
    }
    
    return {
      symbolsCount,
      totalMinuteCandles,
      totalAggregatedCandles,
      aggregatedCacheSize: this.aggregatedCache.size
    };
  }

  // Очистка старых данных с улучшенной логикой
  cleanup(maxAgeMs = 12 * 60 * 60 * 1000) { // 12 часов по умолчанию (уменьшено с 24)
    const cutoffTime = Date.now() - maxAgeMs;
    let cleanedSymbols = 0;
    let cleanedCandles = 0;
    
    for (const [symbol, candles] of this.minuteCandles.entries()) {
      const filteredCandles = candles.filter(c => c.openTime >= cutoffTime);
      if (filteredCandles.length !== candles.length) {
        cleanedCandles += candles.length - filteredCandles.length;
        if (filteredCandles.length === 0) {
          // Удаляем символ полностью, если все свечи устарели
          this.minuteCandles.delete(symbol);
          cleanedSymbols++;
        } else {
          this.minuteCandles.set(symbol, filteredCandles);
        }
        this.invalidateAggregatedCache(symbol);
      }
    }
    
    // Принудительная очистка агрегированного кэша
    this.cleanupAggregatedCache();
    
    if (cleanedSymbols > 0 || cleanedCandles > 0) {
      console.log(`🧹 Cleanup completed: removed ${cleanedSymbols} symbols, ${cleanedCandles} candles`);
    }
    
    this.lastCleanup = Date.now();
  }

  // Принудительная очистка памяти
  forceCleanup() {
    const before = this.getCacheStats();
    
    // Очищаем весь агрегированный кэш
    this.aggregatedCache.clear();
    this.cacheAccessOrder.clear();
    
    // Оставляем только последние 1000 свечей для каждого символа
    for (const [symbol, candles] of this.minuteCandles.entries()) {
      if (candles.length > 1000) {
        this.minuteCandles.set(symbol, candles.slice(-1000));
      }
    }
    
    const after = this.getCacheStats();
    console.log(`🧹 Force cleanup: ${before.totalMinuteCandles} -> ${after.totalMinuteCandles} candles, ${before.totalAggregatedCandles} -> ${after.totalAggregatedCandles} aggregated`);
    
    // Принудительный garbage collection, если доступен
    if (global.gc) {
      global.gc();
      console.log('🧹 Forced garbage collection');
    }
  }
}

module.exports = CandleAggregator;