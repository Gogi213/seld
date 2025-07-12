// backend-modules/dataManager.cjs
// Модуль для кэширования и генерации данных для клиентов

const { TIMEFRAMES, CANDLE_LIMITS, CELL_STYLES, SIGNALS, INTERVALS, EMOJIS } = require('./constants.cjs');

class DataManager {
  constructor(symbolManager, candleAggregator, signalEngine, options = {}) {
    this.symbolManager = symbolManager;
    this.candleAggregator = candleAggregator;
    this.signalEngine = signalEngine;
    
    // Настройки кэширования
    this.cacheInterval = options.cacheInterval || INTERVALS.DATA_CALCULATION;
    
    // Предварительно рассчитанные данные для быстрой отдачи клиентам
    this.preCalculatedData = null;
    this.lastDataCalculation = 0;
    
    // Дефолтные настройки
    this.defaultSettings = {
      percentileWindow: options.defaultPercentileWindow || SIGNALS.DEFAULT_PERCENTILE_WINDOW,
      percentileLevel: options.defaultPercentileLevel || SIGNALS.DEFAULT_PERCENTILE_LEVEL
    };
    
    // Список таймфреймов
    this.timeframes = TIMEFRAMES;
  }

  /**
   * Проверить, нужно ли пересчитать кэшированные данные
   */
  shouldRecalculateCache() {
    return Date.now() - this.lastDataCalculation > this.cacheInterval;
  }

  /**
   * Получить предрассчитанные данные (если они актуальны)
   */
  getPreCalculatedData() {
    if (this.shouldRecalculateCache()) {
      return null;
    }
    return this.preCalculatedData;
  }

  /**
   * Функция для предварительного расчета и кэширования данных
   */
  async calculateAndCacheData() {
    const activeSymbols = this.symbolManager.getActiveSymbols();
    if (activeSymbols.length === 0) return;
    
    try {
      console.log('🔄 Pre-calculating signals for all symbols...');
      const startTime = Date.now();
      
      // Рассчитываем данные с дефолтными настройками
      this.preCalculatedData = this.generateClientData(
        this.defaultSettings.percentileWindow, 
        this.defaultSettings.percentileLevel
      );
      this.lastDataCalculation = Date.now();
      
      const calculationTime = Date.now() - startTime;
      console.log(`✅ Pre-calculated data for ${activeSymbols.length} symbols in ${calculationTime}ms`);
      
      return this.preCalculatedData;
      
    } catch (error) {
      console.error('Error pre-calculating data:', error);
      throw error;
    }
  }

  /**
   * Генерация полных данных для клиентов
   */
  generateClientData(percentileWindow, percentileLevel) {
    // Обновляем настройки движка сигналов
    this.signalEngine.updateSettings({
      percentileWindow,
      percentileLevel
    });
    
    const results = [];
    const candleData = {};
    const activeSymbols = this.symbolManager.getActiveSymbols();
    
    // Рассчитываем сигналы для всех активных символов
    for (const symbol of activeSymbols) {
      const symbolData = this.symbolManager.getSymbolData(symbol);
      if (!symbolData) continue;
      
      // Рассчитываем сигналы
      const signals = this.signalEngine.calculateSignalsForSymbol(symbol);
      
      // Формируем данные для таблицы с cellState
      const tableData = {
        symbol,
        dailyVolume: symbolData.dailyVolume,
        natr30m: symbolData.natr30m,
        ...signals
      };
      
      // Добавляем cellState для каждого таймфрейма
      this._addCellStates(tableData, signals);
      
      results.push(tableData);
      
      // Формируем данные свечей для графиков
      candleData[symbol] = this._generateCandleData(symbol);
    }
    
    // Сортируем результаты по NATR
    results.sort((a, b) => (b.natr30m || 0) - (a.natr30m || 0));
    
    return {
      signals: results,
      candles: candleData,
      timestamp: Date.now(),
      stats: this._generateStats()
    };
  }

  /**
   * Добавить состояния ячеек для таймфреймов
   * @private
   */
  _addCellStates(tableData, signals) {
    for (const tf of this.timeframes) {
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
  }

  /**
   * Генерировать данные свечей для всех таймфреймов
   * @private
   */
  _generateCandleData(symbol) {
    const candleData = {};
    
    for (const tf of this.timeframes) {
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
      const candles = this.candleAggregator.getAggregatedCandles(symbol, tf, actualLimit);
      
      candleData[tf] = candles.map(c => ({
        time: Math.floor(c.openTime / 1000), // TradingView формат
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      }));
    }
    
    return candleData;
  }

  /**
   * Генерировать статистику системы
   * @private
   */
  _generateStats() {
    return {
      totalSymbols: this.symbolManager.getActiveSymbolsCount(),
      candleAggregator: this.candleAggregator.getCacheStats(),
      signalEngine: this.signalEngine.getCacheStats(),
      symbolManager: this.symbolManager.getStats(),
      dataManager: {
        lastCalculation: this.lastDataCalculation,
        cacheInterval: this.cacheInterval,
        hasCachedData: !!this.preCalculatedData
      }
    };
  }

  /**
   * Генерировать данные для конкретного символа
   */
  generateSymbolData(symbol, percentileWindow, percentileLevel) {
    const symbolData = this.symbolManager.getSymbolData(symbol);
    if (!symbolData) return null;
    
    // Обновляем настройки движка сигналов
    this.signalEngine.updateSettings({
      percentileWindow,
      percentileLevel
    });
    
    // Рассчитываем сигналы для символа
    const signals = this.signalEngine.calculateSignalsForSymbol(symbol);
    
    // Формируем данные для таблицы
    const tableData = {
      symbol,
      dailyVolume: symbolData.dailyVolume,
      natr30m: symbolData.natr30m,
      ...signals
    };
    
    // Добавляем cellState для каждого таймфрейма
    this._addCellStates(tableData, signals);
    
    return {
      signal: tableData,
      candles: this._generateCandleData(symbol)
    };
  }

  /**
   * Проверить, используются ли дефолтные настройки
   */
  isDefaultSettings(percentileWindow, percentileLevel) {
    return percentileWindow === this.defaultSettings.percentileWindow &&
           percentileLevel === this.defaultSettings.percentileLevel;
  }

  /**
   * Получить дефолтные настройки
   */
  getDefaultSettings() {
    return { ...this.defaultSettings };
  }

  /**
   * Обновить дефолтные настройки
   */
  updateDefaultSettings(settings) {
    if (settings.percentileWindow !== undefined) {
      this.defaultSettings.percentileWindow = settings.percentileWindow;
    }
    if (settings.percentileLevel !== undefined) {
      this.defaultSettings.percentileLevel = settings.percentileLevel;
    }
    
    console.log('📝 Data manager default settings updated:', this.defaultSettings);
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats() {
    return {
      lastCalculation: this.lastDataCalculation,
      cacheInterval: this.cacheInterval,
      hasCachedData: !!this.preCalculatedData,
      cacheAge: Date.now() - this.lastDataCalculation,
      shouldRecalculate: this.shouldRecalculateCache()
    };
  }
}

module.exports = DataManager;