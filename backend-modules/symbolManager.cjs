// backend-modules/symbolManager.cjs
// Модуль для управления активными символами

const BinanceApiService = require('./binanceApi.cjs');
const { FILTERS, INTERVALS, EMOJIS } = require('./constants.cjs');

class SymbolManager {
  constructor(candleAggregator, binanceWS, options = {}) {
    this.candleAggregator = candleAggregator;
    this.binanceWS = binanceWS;
    this.binanceApi = new BinanceApiService();
    
    // Настройки фильтрации
    this.minDailyVolume = options.minDailyVolume || FILTERS.MIN_DAILY_VOLUME;
    this.minNotional = options.minNotional || FILTERS.MIN_NOTIONAL;
    this.historicalLimit = options.historicalLimit || FILTERS.HISTORICAL_CANDLES_LIMIT;
    this.natrPeriod = options.natrPeriod || FILTERS.NATR_CALCULATION_PERIOD;
    
    // Кэш для активных символов и их данных
    this.activeSymbols = new Set();
    this.symbolsData = new Map(); // symbol -> { dailyVolume, natr30m, etc. }
    this.lastSymbolsUpdate = 0;
    this.updateInterval = options.updateInterval || INTERVALS.SYMBOLS_UPDATE;
  }

  /**
   * Получить активные символы
   */
  getActiveSymbols() {
    return Array.from(this.activeSymbols);
  }

  /**
   * Получить данные символа
   */
  getSymbolData(symbol) {
    return this.symbolsData.get(symbol);
  }

  /**
   * Получить все данные символов
   */
  getAllSymbolsData() {
    return new Map(this.symbolsData);
  }

  /**
   * Получить количество активных символов
   */
  getActiveSymbolsCount() {
    return this.activeSymbols.size;
  }

  /**
   * Проверить, нужно ли обновить список символов
   */
  shouldUpdateSymbols() {
    return Date.now() - this.lastSymbolsUpdate > this.updateInterval;
  }

  /**
   * Обновление списка активных символов
   */
  async updateActiveSymbols() {
    try {
      console.log(`${EMOJIS.LOADING} Updating active symbols...`);
      const startTime = Date.now();
      
      const symbols = await this.binanceApi.getFuturesSymbols();
      const tickers = await this.binanceApi.get24hTickers();
      const tickerMap = Object.fromEntries(tickers.map(t => [t.symbol, t]));
      
      const newActiveSymbols = new Set();
      const newSymbolsData = new Map();
      
      console.log(`${EMOJIS.CHART} Filtering symbols from ${symbols.length} total...`);
      
      // Фильтруем символы по объему и NATR
      for (const symbol of symbols) {
        const ticker = tickerMap[symbol];
        if (!ticker) continue;
        
        const dailyVolume = parseFloat(ticker.quoteVolume);
        if (dailyVolume < this.minDailyVolume) continue;
        
        try {
          // Получаем исторические данные для расчета NATR
          const historicalKlines = await this.binanceApi.getHistoricalKlines(symbol, 4000);
          if (historicalKlines.length < 30) continue;
          
          // Рассчитываем NATR на последних 30 свечах
          const natr = this.binanceApi.calculateNATR(historicalKlines, 30);
          
          if (natr >= this.minNotional) {
            newActiveSymbols.add(symbol);
            newSymbolsData.set(symbol, {
              dailyVolume,
              natr30m: natr,
              lastUpdate: Date.now()
            });
            
            // Предзагружаем ВСЕ исторические данные в агрегатор
            console.log(`📈 Loading ${historicalKlines.length} historical candles for ${symbol}`);
            for (const candle of historicalKlines) {
              this.candleAggregator.addMinuteCandle(symbol, candle);
            }
          }
        } catch (error) {
          console.error(`Error processing ${symbol}:`, error.message);
        }
      }
      
      console.log(`✅ Filtered to ${newActiveSymbols.size} active symbols`);
      
      // Обновляем подписки WebSocket
      await this._updateWebSocketSubscriptions(newActiveSymbols);
      
      // Обновляем внутренние переменные
      this.activeSymbols = newActiveSymbols;
      this.symbolsData = newSymbolsData;
      this.lastSymbolsUpdate = Date.now();
      
      const updateTime = Date.now() - startTime;
      console.log(`📈 Active symbols updated in ${updateTime}ms: ${this.activeSymbols.size} total`);
      
      return {
        added: Array.from(newActiveSymbols).filter(s => !this.activeSymbols.has(s)),
        removed: Array.from(this.activeSymbols).filter(s => !newActiveSymbols.has(s)),
        total: newActiveSymbols.size
      };
      
    } catch (error) {
      console.error('Error updating active symbols:', error);
      throw error;
    }
  }

  /**
   * Обновить WebSocket подписки
   * @private
   */
  async _updateWebSocketSubscriptions(newActiveSymbols) {
    const currentSymbols = Array.from(this.activeSymbols);
    const newSymbolsArray = Array.from(newActiveSymbols);
    
    // Отписываемся от неактивных символов
    const toUnsubscribe = currentSymbols.filter(s => !newActiveSymbols.has(s));
    for (const symbol of toUnsubscribe) {
      this.binanceWS.unsubscribeFromSymbol(symbol);
    }
    
    // Подписываемся на новые символы
    const toSubscribe = newSymbolsArray.filter(s => !this.activeSymbols.has(s));
    if (toSubscribe.length > 0) {
      this.binanceWS.subscribeToSymbols(toSubscribe);
    }
    
    console.log(`🔄 WebSocket subscriptions: +${toSubscribe.length} -${toUnsubscribe.length}`);
  }

  /**
   * Получить статистику менеджера символов
   */
  getStats() {
    return {
      activeSymbolsCount: this.activeSymbols.size,
      lastUpdate: this.lastSymbolsUpdate,
      updateInterval: this.updateInterval,
      minDailyVolume: this.minDailyVolume,
      minNotional: this.minNotional
    };
  }

  /**
   * Обновить настройки фильтрации
   */
  updateSettings(settings) {
    if (settings.minDailyVolume !== undefined) {
      this.minDailyVolume = settings.minDailyVolume;
    }
    if (settings.minNotional !== undefined) {
      this.minNotional = settings.minNotional;
    }
    if (settings.updateInterval !== undefined) {
      this.updateInterval = settings.updateInterval;
    }
    
    console.log(`${EMOJIS.MEMO} Symbol manager settings updated:`, {
      minDailyVolume: this.minDailyVolume,
      minNotional: this.minNotional,
      updateInterval: this.updateInterval
    });
  }
}

module.exports = SymbolManager;