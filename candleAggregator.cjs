// candleAggregator.cjs
// Модуль для агрегации свечей из 1-минутных данных в другие таймфреймы

class CandleAggregator {
  constructor() {
    // Кэш для хранения 1m свечей по символам
    this.minuteCandles = new Map(); // symbol -> array of 1m candles
    // Кэш агрегированных данных
    this.aggregatedCache = new Map(); // symbol_timeframe -> array of candles
    // Максимальное количество 1m свечей для хранения (около 2.7 дней = 4000 минут)
    this.maxMinuteCandles = 4000;
  }

  // Добавить новую 1-минутную свечу
  addMinuteCandle(symbol, candle) {
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
      this.aggregatedCache.set(cacheKey, result);
      return result;
    }
    
    // Агрегируем данные
    const aggregated = this.aggregateCandles(minuteCandles, intervalMinutes);
    this.aggregatedCache.set(cacheKey, aggregated);
    
    return aggregated.slice(-limit);
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

  // Очистка старых данных
  cleanup(maxAgeMs = 24 * 60 * 60 * 1000) { // 24 часа по умолчанию
    const cutoffTime = Date.now() - maxAgeMs;
    
    for (const [symbol, candles] of this.minuteCandles.entries()) {
      const filteredCandles = candles.filter(c => c.openTime >= cutoffTime);
      if (filteredCandles.length !== candles.length) {
        this.minuteCandles.set(symbol, filteredCandles);
        this.invalidateAggregatedCache(symbol);
      }
    }
  }
}

module.exports = CandleAggregator;