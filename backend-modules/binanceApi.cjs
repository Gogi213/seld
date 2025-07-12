// backend-modules/binanceApi.cjs
// Модуль для работы с Binance API

const axios = require('axios');
const { BINANCE_API, INTERVALS } = require('./constants.cjs');

class BinanceApiService {
  constructor() {
    this.baseUrl = BINANCE_API.BASE_URL;
    this.maxKlinesPerRequest = BINANCE_API.MAX_KLINES_PER_REQUEST;
    this.requestDelay = INTERVALS.API_REQUEST_DELAY;
  }

  /**
   * Получить список всех фьючерсных символов
   */
  async getFuturesSymbols() {
    try {
      const res = await axios.get(`${this.baseUrl}${BINANCE_API.ENDPOINTS.EXCHANGE_INFO}`);
      return res.data.symbols
        .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING')
        .map(s => s.symbol);
    } catch (error) {
      console.error('Error fetching futures symbols:', error.message);
      throw error;
    }
  }

  /**
   * Получить 24-часовую статистику по всем символам
   */
  async get24hTickers() {
    try {
      const res = await axios.get(`${this.baseUrl}${BINANCE_API.ENDPOINTS.TICKER_24HR}`);
      return res.data;
    } catch (error) {
      console.error('Error fetching 24h tickers:', error.message);
      throw error;
    }
  }

  /**
   * Получить исторические свечи для символа
   * @param {string} symbol - Символ торговой пары
   * @param {number} totalLimit - Общее количество свечей для получения
   */
  async getHistoricalKlines(symbol, totalLimit = 4000) {
    const maxPerRequest = this.maxKlinesPerRequest;
    const allKlines = [];
    
    try {
      // Если нужно меньше 1500, делаем один запрос
      if (totalLimit <= maxPerRequest) {
        const url = `${this.baseUrl}${BINANCE_API.ENDPOINTS.KLINES}?symbol=${symbol}&interval=1m&limit=${totalLimit}`;
        const res = await axios.get(url);
        return this._formatKlines(res.data);
      }
      
      // Для больших объемов делаем несколько запросов
      let remaining = totalLimit;
      let endTime = Date.now();
      
      while (remaining > 0 && allKlines.length < totalLimit) {
        const currentLimit = Math.min(remaining, maxPerRequest);
        
        const url = `${this.baseUrl}${BINANCE_API.ENDPOINTS.KLINES}?symbol=${symbol}&interval=1m&limit=${currentLimit}&endTime=${endTime}`;
        const res = await axios.get(url);
        
        if (!res.data || res.data.length === 0) break;
        
        const klines = this._formatKlines(res.data);
        
        // Добавляем в начало массива (более старые данные)
        allKlines.unshift(...klines);
        
        // Обновляем endTime для следующего запроса (берем время первой свечи минус 1 мс)
        endTime = klines[0].openTime - 1;
        remaining -= klines.length;
        
        // Небольшая задержка между запросами чтобы не превысить лимиты API
        await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      }
      
      // Сортируем по времени и возвращаем нужное количество
      return allKlines
        .sort((a, b) => a.openTime - b.openTime)
        .slice(-totalLimit);
        
    } catch (error) {
      console.error(`Error fetching historical klines for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Форматирование данных свечей в удобный формат
   * @private
   */
  _formatKlines(rawKlines) {
    return rawKlines.map(k => ({
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

  /**
   * Рассчитать NATR (Normalized Average True Range) для символа
   * @param {Array} klines - Массив свечей
   * @param {number} period - Период для расчета (по умолчанию 30)
   */
  calculateNATR(klines, period = 30) {
    if (klines.length < period + 1) return 0;
    
    const last = klines.slice(-period - 1);
    let atr = 0;
    
    for (let i = 1; i < last.length; i++) {
      const prev = last[i-1];
      const curr = last[i];
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      atr += tr;
    }
    
    atr = atr / period;
    const lastClose = last[last.length-1]?.close;
    return lastClose ? (atr / lastClose) * 100 : 0;
  }
}

module.exports = BinanceApiService;