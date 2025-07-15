// enhancedSignalEngine.cjs
// Улучшенный движок сигналов для работы с агрегированными данными

class EnhancedSignalEngine {
  constructor(candleAggregator) {
    this.candleAggregator = candleAggregator;
    this.signalEngines = new Map(); // symbol_timeframe -> VolumeSignalEngine
    this.signalCache = new Map(); // symbol -> signals for all timeframes
    this.lastUpdateTime = new Map(); // symbol -> timestamp
    
    // Настройки по умолчанию
    this.defaultSettings = {
      smaLength: 200,
      thresholdPercent: 50,
      percentileWindow: 50,
      percentileLevel: 5
    };
    
    // Поддерживаемые таймфреймы
    this.timeframes = ['1m', '5m', '15m', '30m', '1h'];
    
    // Настройки истечения сигналов для разных таймфреймов
    this.expireSettings = {
      '1m': { expirePeriods: 3 }, // 1m истекает через 3 свечи
      '5m': { expirePeriods: 1 }, // остальные через 1 свечу
      '15m': { expirePeriods: 1 },
      '30m': { expirePeriods: 1 },
      '1h': { expirePeriods: 1 }
    };
  }

  // Обновить настройки
  updateSettings(settings) {
    this.defaultSettings = { ...this.defaultSettings, ...settings };
    // Очищаем кэш при изменении настроек
    this.signalEngines.clear();
    this.signalCache.clear();
  }

  // Получить или создать движок сигналов для символа и таймфрейма
  getSignalEngine(symbol, timeframe) {
    const key = `${symbol}_${timeframe}`;
    
    if (!this.signalEngines.has(key)) {
      const VolumeSignalEngine = require('./signalEngine.cjs');
      const engine = new VolumeSignalEngine(
        this.defaultSettings.smaLength,
        this.defaultSettings.thresholdPercent,
        this.defaultSettings.percentileWindow,
        this.defaultSettings.percentileLevel
      );
      this.signalEngines.set(key, engine);
    }
    
    return this.signalEngines.get(key);
  }

  // Рассчитать сигналы для символа на всех таймфреймах
  calculateSignalsForSymbol(symbol) {
    const signals = {};
    const currentTime = Date.now();
    
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
    const isCurrentExpired = currentHasSignal && signalAge > expireTime;
    
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
  shouldUpdateSignals(symbol, maxAge = 30000) { // 30 секунд
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
      signalEngines: this.signalEngines.size,
      lastUpdateTimes: this.lastUpdateTime.size
    };
  }

  // Очистить весь кэш
  clearAllCache() {
    this.signalCache.clear();
    this.signalEngines.clear();
    this.lastUpdateTime.clear();
  }
}

module.exports = EnhancedSignalEngine;