// backend-modules/constants.cjs
// Константы для backend модулей

module.exports = {
  // Фильтрация символов
  FILTERS: {
    MIN_DAILY_VOLUME: 100000000, // 150 млн суточного объёма
    MIN_NOTIONAL: 0.4, // 0.4 NATR
    MIN_HISTORICAL_CANDLES: 30, // минимум свечей для расчета NATR
    HISTORICAL_CANDLES_LIMIT: 4000, // количество исторических свечей для загрузки
    NATR_CALCULATION_PERIOD: 30 // период для расчета NATR
  },

  // Интервалы обновлений (в миллисекундах)
  INTERVALS: {
    SYMBOLS_UPDATE: 5 * 60 * 1000, // каждые 5 минут
    DATA_CALCULATION: 10 * 1000, // каждые 10 секунд
    BROADCAST: 15 * 1000, // каждые 15 секунд
    STATS_LOG: 5 * 60 * 1000, // каждые 5 минут
    API_REQUEST_DELAY: 100 // задержка между API запросами
  },

  // WebSocket настройки
  WEBSOCKET: {
    DEFAULT_PORT: 3001,
    DEFAULT_HOST: '0.0.0.0',
    MESSAGE_TYPES: {
      FULL_UPDATE: 'full_update',
      SETTINGS_UPDATE: 'settings_update',
      PERIODIC_UPDATE: 'periodic_update',
      SYMBOL_UPDATE: 'symbol_update',
      ERROR: 'error',
      UPDATE_SETTINGS: 'update_settings'
    }
  },

  // Дефолтные настройки сигналов
  SIGNALS: {
    DEFAULT_PERCENTILE_WINDOW: 50,
    DEFAULT_PERCENTILE_LEVEL: 1,
    VALIDATION: {
      MIN_WINDOW: 5,
      MAX_WINDOW: 200,
      MIN_LEVEL: 0,
      MAX_LEVEL: 100
    }
  },

  // Таймфреймы
  TIMEFRAMES: ['1m', '5m', '15m', '30m', '1h'],

  // Максимальное количество свечей для каждого таймфрейма
  CANDLE_LIMITS: {
    '1m': 4000,   // Все загруженные свечи
    '5m': 800,    // 4000/5 = 800
    '15m': 266,   // 4000/15 ≈ 266
    '30m': 133,   // 4000/30 ≈ 133
    '1h': 66      // 4000/60 ≈ 66
  },

  // Binance API настройки
  BINANCE_API: {
    BASE_URL: 'https://fapi.binance.com/fapi/v1',
    MAX_KLINES_PER_REQUEST: 1500,
    ENDPOINTS: {
      EXCHANGE_INFO: '/exchangeInfo',
      TICKER_24HR: '/ticker/24hr',
      KLINES: '/klines'
    }
  },

  // Стили для ячеек таблицы
  CELL_STYLES: {
    ACTIVE_SIGNAL: {
      background: 'rgba(74, 222, 128, 0.15)',
      border: '1px solid rgba(74, 222, 128, 0.3)'
    },
    EXPIRED_SIGNAL: {
      background: 'rgba(255, 193, 7, 0.15)',
      border: '1px solid rgba(255, 193, 7, 0.3)'
    },
    DEFAULT: {
      background: 'transparent',
      border: '1px solid #333'
    }
  },

  // Логирование
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },

  // Эмодзи для логов
  EMOJIS: {
    ROCKET: '🚀',
    CHECK: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    LOADING: '🔄',
    CHART: '📊',
    SIGNAL: '📈',
    WEBSOCKET: '🔌',
    TIMER: '⏰',
    STOP: '🛑',
    SHIELD: '🛡️',
    ANTENNA: '📡',
    MEMO: '📝',
    LIGHTNING: '⚡'
  }
};