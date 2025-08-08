// enhancedSignalEngine.cjs
// Улучшенный движок сигналов для работы с агрегированными данными

class EnhancedSignalEngine {
  constructor(candleAggregator) {
    this.candleAggregator = candleAggregator;
    
    // Оптимизированное кэширование - один движок для всех символов
    this.sharedSignalEngine = null;
    this.signalCache = new Map(); // symbol -> signals for all timeframes
    this.lastUpdateTime = new Map(); // symbol -> timestamp
    
    // Лимиты для предотвращения утечек памяти
    this.maxCacheEntries = 100; // Максимум 100 символов в кэше
    this.cacheExpiryMs = 5 * 60 * 1000; // Кэш истекает через 5 минут
    
    // Настройки по умолчанию
    this.defaultSettings = {
      smaLength: 200,
      thresholdPercent: 50,
      percentileWindow: 50,
      percentileLevel: 1
    };
    
    // Поддерживаемые таймфреймы
    this.timeframes = ['1m', '5m', '15m', '30m', '1h'];
    
    // Настройки истечения сигналов для разных таймфреймов
    this.expireSettings = {
      '1m': { expirePeriods: 3 }, // 1m истекает через 3 свечи (3 минуты)
      '5m': { expirePeriods: 1 }, // 5m истекает через 1 свечу (5 минут)
      '15m': { expirePeriods: 1 }, // 15m истекает через 1 свечу (15 минут)
      '30m': { expirePeriods: 1 }, // 30m истекает через 1 свечу (30 минут)
      '1h': { expirePeriods: 1 }   // 1h истекает через 1 свечу (1 час)
    };
    
    // Периодическая очистка кэша
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // Каждую минуту
  }

  // Обновить настройки
  updateSettings(settings) {
    this.defaultSettings = { ...this.defaultSettings, ...settings };
    // Пересоздаем единый движок с новыми настройками
    this.sharedSignalEngine = null;
    // Очищаем кэш при изменении настроек
    this.signalCache.clear();
    this.lastUpdateTime.clear();
  }

  // Получить единый движок сигналов (ленивая инициализация)
  getSharedSignalEngine() {
    if (!this.sharedSignalEngine) {
      const VolumeSignalEngine = require('./signalEngine.cjs');
      this.sharedSignalEngine = new VolumeSignalEngine(
        this.defaultSettings.smaLength,
        this.defaultSettings.thresholdPercent,
        this.defaultSettings.percentileWindow,
        this.defaultSettings.percentileLevel
      );
    }
    return this.sharedSignalEngine;
  }

  // Очистка устаревшего кэша
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedEntries = 0;
    
    for (const [symbol, updateTime] of this.lastUpdateTime.entries()) {
      if (now - updateTime > this.cacheExpiryMs) {
        this.signalCache.delete(symbol);
        this.lastUpdateTime.delete(symbol);
        cleanedEntries++;
      }
    }
    
    // Если кэш слишком большой, удаляем самые старые записи
    if (this.signalCache.size > this.maxCacheEntries) {
      const entries = Array.from(this.lastUpdateTime.entries());
      entries.sort((a, b) => a[1] - b[1]); // Сортируем по времени
      
      const toRemove = this.signalCache.size - this.maxCacheEntries;
      for (let i = 0; i < toRemove; i++) {
        const symbol = entries[i][0];
        this.signalCache.delete(symbol);
        this.lastUpdateTime.delete(symbol);
        cleanedEntries++;
      }
    }
    
    if (cleanedEntries > 0) {
      console.log(`🧹 SignalEngine: cleaned ${cleanedEntries} expired cache entries`);
    }
  }

  // Рассчитать сигналы для символа на всех таймфреймах
  calculateSignalsForSymbol(symbol) {
    const currentTime = Date.now();
    
    // Проверяем кэш - сократили время кэширования с 30 до 5 секунд для более быстрых обновлений
    const cached = this.signalCache.get(symbol);
    const lastUpdate = this.lastUpdateTime.get(symbol);
    
    // Используем кэш, если он свежий (менее 5 секунд)
    if (cached && lastUpdate && (currentTime - lastUpdate < 5000)) {
      return cached;
    }
    
    const signals = {};
    
    for (const tf of this.timeframes) {
      try {
        const tfSignals = this.calculateSignalsForTimeframe(symbol, tf, currentTime);
        Object.assign(signals, tfSignals);
      } catch (error) {
        console.error(`Error calculating signals for ${symbol} ${tf}:`, error);
        // Устанавливаем пустые сигналы при ошибке
        this.setEmptySignals(signals, tf);
      }
    }
    
    // Кэшируем результат
    this.signalCache.set(symbol, signals);
    this.lastUpdateTime.set(symbol, currentTime);
    
    return signals;
  }

  // Рассчитать сигналы для конкретного таймфрейма
  calculateSignalsForTimeframe(symbol, timeframe, currentTime) {
    const signals = {};
    
    // Получаем агрегированные свечи
    const candles = this.candleAggregator.getAggregatedCandles(
      symbol,
      timeframe,
      4000
    );
    
    if (candles.length < this.defaultSettings.percentileWindow + 1) {
      this.setEmptySignals(signals, timeframe);
      return signals;
    }
    
    // Определяем последнюю ЗАКРЫТУЮ свечу (исключая формирующуюся)
    const lastClosedIndex = candles.length - 2;
    if (lastClosedIndex < this.defaultSettings.percentileWindow) {
      this.setEmptySignals(signals, timeframe);
      return signals;
    }
    
    const lastCandle = candles[lastClosedIndex];
    const lastCandleTime = lastCandle.openTime;
    const lastVolume = lastCandle.volume;
    
    // Берем исторические данные для расчета процентиля (исключая текущую и последующие свечи)
    const historicalCandles = candles.slice(0, lastClosedIndex);
    const historicalVolumes = historicalCandles.slice(-this.defaultSettings.percentileWindow);
    
    if (historicalVolumes.length < this.defaultSettings.percentileWindow) {
      this.setEmptySignals(signals, timeframe);
      return signals;
    }
    
    // Рассчитываем процентиль
    const sorted = [...historicalVolumes.map(c => c.volume)].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] < lastVolume) rank++;
      else break;
    }
    
    const denom = Math.max(sorted.length - 1, 1);
    const percentileRank = (rank / denom) * 100;
    const currentHasSignal = percentileRank <= this.defaultSettings.percentileLevel;
    
    // Проверяем предыдущие свечи на наличие протухших сигналов
    let foundExpiredSignal = false;
    const expireSettings = this.expireSettings[timeframe];
    const checkPeriods = expireSettings.expirePeriods;
    
    for (let periodBack = 1; periodBack <= checkPeriods; periodBack++) {
      const checkIndex = lastClosedIndex - periodBack;
      if (checkIndex >= this.defaultSettings.percentileWindow && checkIndex < candles.length - 1) {
        const checkCandle = candles[checkIndex];
        const checkVolume = checkCandle.volume;
        const checkTime = checkCandle.openTime;
        
        // Рассчитываем процентиль для этой свечи
        const checkHistoricalVolumes = candles.slice(0, checkIndex).slice(-this.defaultSettings.percentileWindow);
        const checkSorted = [...checkHistoricalVolumes.map(c => c.volume)].sort((a, b) => a - b);
        
        let checkRank = 0;
        for (let i = 0; i < checkSorted.length; i++) {
          if (checkSorted[i] < checkVolume) checkRank++;
          else break;
        }
        
        const checkPercentileRank = (checkRank / Math.max(checkSorted.length - 1, 1)) * 100;
        const hadSignal = checkPercentileRank <= this.defaultSettings.percentileLevel;
        
        if (hadSignal) {
          const intervalMs = this.getIntervalMs(timeframe);
          const signalAge = currentTime - (checkTime + intervalMs);
          const expireTime = intervalMs * checkPeriods;
          
          if (signalAge <= expireTime) {
            if (!currentHasSignal) {
              foundExpiredSignal = true;
            }
          }
        }
      }
    }
    
    // Определяем активность текущего сигнала
    const intervalMs = this.getIntervalMs(timeframe);
    const signalAge = currentTime - (lastCandleTime + intervalMs);
    const expireTime = intervalMs * expireSettings.expirePeriods;
    
    // Для свежезакрытых свечей даем "буферное время" 30 секунд, чтобы сигнал не сразу стал протухшим
    const bufferTime = 30000; // 30 секунд буфер
    const isCurrentExpired = currentHasSignal && signalAge > (expireTime + bufferTime);
    
    // Заполняем результат
    signals[`percentileRank_${timeframe}`] = percentileRank;
    signals[`percentileSignal_${timeframe}`] = currentHasSignal && !isCurrentExpired;
    signals[`percentileSignalExpired_${timeframe}`] = isCurrentExpired || foundExpiredSignal;
    
    // Генерируем cellState для фронтенда
    const hasActiveSignal = signals[`percentileSignal_${timeframe}`];
    const hasExpiredSignal = signals[`percentileSignalExpired_${timeframe}`];
    
    const cellState = {
      hasActiveSignal,
      hasExpiredSignal,
      style: {}
    };
    
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
    
    signals[`cellState_${timeframe}`] = cellState;
    
    return signals;
  }

  // Установить пустые сигналы для таймфрейма
  setEmptySignals(signals, timeframe) {
    signals[`percentileRank_${timeframe}`] = null;
    signals[`percentileSignal_${timeframe}`] = false;
    signals[`percentileSignalExpired_${timeframe}`] = false;
    signals[`cellState_${timeframe}`] = {
      hasActiveSignal: false,
      hasExpiredSignal: false,
      style: {}
    };
  }

  // Получить интервал в миллисекундах
  getIntervalMs(timeframe) {
    const intervals = {
      '1m': 1 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000
    };
    return intervals[timeframe] || 60 * 1000;
  }

  // Получить кэшированные сигналы
  getCachedSignals(symbol) {
    return this.signalCache.get(symbol) || {};
  }

  // Проверить, нужно ли обновить сигналы
  shouldUpdateSignals(symbol, maxAge = 5000) { // 5 секунд для быстрых обновлений
    const lastUpdate = this.lastUpdateTime.get(symbol);
    if (!lastUpdate) return true;
    
    return (Date.now() - lastUpdate) > maxAge;
  }

  // Получить все символы с кэшированными сигналами
  getCachedSymbols() {
    return Array.from(this.signalCache.keys());
  }

  // Очистить кэш для символа
  clearCacheForSymbol(symbol) {
    this.signalCache.delete(symbol);
    this.lastUpdateTime.delete(symbol);
    
    // Очищаем движки сигналов для этого символа
    for (const tf of this.timeframes) {
      const key = `${symbol}_${tf}`;
      this.signalEngines.delete(key);
    }
  }

  // Получить статистику кэша
  getCacheStats() {
    return {
      cachedSymbols: this.signalCache.size,
      sharedSignalEngine: this.sharedSignalEngine ? 1 : 0,
      lastUpdateTimes: this.lastUpdateTime.size,
      maxCacheEntries: this.maxCacheEntries,
      cacheExpiryMs: this.cacheExpiryMs
    };
  }

  // Очистить весь кэш
  clearAllCache() {
    this.signalCache.clear();
    this.lastUpdateTime.clear();
    this.sharedSignalEngine = null;
  }

  // Деструктор - очистка интервала
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAllCache();
  }
}

module.exports = EnhancedSignalEngine;