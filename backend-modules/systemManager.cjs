// backend-modules/systemManager.cjs
// Главный модуль для координации всех компонентов системы

const CandleAggregator = require('../candleAggregator.cjs');
const BinanceWebSocketManager = require('../binanceWebSocket.cjs');
const EnhancedSignalEngine = require('../enhancedSignalEngine.cjs');

const BinanceApiService = require('./binanceApi.cjs');
const SymbolManager = require('./symbolManager.cjs');
const DataManager = require('./dataManager.cjs');
const WebSocketServer = require('./webSocketServer.cjs');
const { WEBSOCKET, FILTERS, INTERVALS, SIGNALS, EMOJIS } = require('./constants.cjs');

class SystemManager {
  constructor(options = {}) {
    // Настройки системы
    this.config = {
      // WebSocket сервер
      wsPort: options.wsPort || 3001,
      wsHost: options.wsHost || '0.0.0.0',
      
      // Фильтрация символов
      minDailyVolume: options.minDailyVolume || 150000000, // 150 млн суточного объёма
      minNotional: options.minNotional || 0.4, // 0.4 NATR
      
      // Интервалы обновлений
      symbolsUpdateInterval: options.symbolsUpdateInterval || 5 * 60 * 1000, // каждые 5 минут
      dataCalculationInterval: options.dataCalculationInterval || 10 * 1000, // каждые 10 секунд
      broadcastInterval: options.broadcastInterval || 15 * 1000, // каждые 15 секунд
      
      // Дефолтные настройки сигналов
      defaultPercentileWindow: options.defaultPercentileWindow || 50,
      defaultPercentileLevel: options.defaultPercentileLevel || 5
    };
    
    // Основные компоненты
    this.candleAggregator = null;
    this.binanceWS = null;
    this.signalEngine = null;
    this.binanceApi = null;
    this.symbolManager = null;
    this.dataManager = null;
    this.webSocketServer = null;
    
    // Таймеры
    this.symbolsUpdateTimer = null;
    this.dataCalculationTimer = null;
    
    // Состояние системы
    this.isInitialized = false;
    this.isRunning = false;
  }

  /**
   * Инициализировать все компоненты системы
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ System already initialized');
      return;
    }
    
    console.log('🔄 Initializing system components...');
    
    try {
      // Инициализация основных компонентов
      this.candleAggregator = new CandleAggregator();
      this.binanceWS = new BinanceWebSocketManager(this.candleAggregator);
      this.signalEngine = new EnhancedSignalEngine(this.candleAggregator);
      this.binanceApi = new BinanceApiService();
      
      // Инициализация менеджеров
      this.symbolManager = new SymbolManager(this.candleAggregator, this.binanceWS, {
        minDailyVolume: this.config.minDailyVolume,
        minNotional: this.config.minNotional,
        updateInterval: this.config.symbolsUpdateInterval
      });
      
      this.dataManager = new DataManager(this.symbolManager, this.candleAggregator, this.signalEngine, {
        cacheInterval: this.config.dataCalculationInterval,
        defaultPercentileWindow: this.config.defaultPercentileWindow,
        defaultPercentileLevel: this.config.defaultPercentileLevel
      });
      
      this.webSocketServer = new WebSocketServer(this.dataManager, {
        port: this.config.wsPort,
        host: this.config.wsHost,
        broadcastInterval: this.config.broadcastInterval
      });
      
      // Настройка обработчиков событий
      this._setupEventHandlers();
      
      this.isInitialized = true;
      console.log('✅ System components initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize system:', error);
      throw error;
    }
  }

  /**
   * Запустить систему
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.isRunning) {
      console.log('⚠️ System already running');
      return;
    }
    
    console.log('🚀 Starting system...');
    
    try {
      // Запуск WebSocket сервера
      this.webSocketServer.start();
      
      // Первоначальное обновление активных символов
      await this.symbolManager.updateActiveSymbols();
      
      // Первоначальный расчет данных
      await this.dataManager.calculateAndCacheData();
      
      // Запуск периодических задач
      this._startPeriodicTasks();
      
      this.isRunning = true;
      
      console.log('✅ System started successfully');
      this._logSystemStats();
      
    } catch (error) {
      console.error('❌ Failed to start system:', error);
      throw error;
    }
  }

  /**
   * Остановить систему
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ System not running');
      return;
    }
    
    console.log('🛑 Stopping system...');
    
    try {
      // Остановка периодических задач
      this._stopPeriodicTasks();
      
      // Остановка WebSocket сервера
      if (this.webSocketServer) {
        this.webSocketServer.stop();
      }
      
      // Закрытие Binance WebSocket соединений
      if (this.binanceWS) {
        this.binanceWS.close();
      }
      
      this.isRunning = false;
      console.log('✅ System stopped successfully');
      
    } catch (error) {
      console.error('❌ Error stopping system:', error);
      throw error;
    }
  }

  /**
   * Настройка обработчиков событий
   * @private
   */
  _setupEventHandlers() {
    // Обработка обновлений от WebSocket Binance
    this.binanceWS.on('kline', (symbol, kline) => {
      // Добавляем свечу в агрегатор
      this.candleAggregator.addMinuteCandle(symbol, {
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
      if (kline.x && this.webSocketServer && this.webSocketServer.getClientsCount() > 0) {
        this.webSocketServer.broadcastSymbolUpdate(symbol);
      }
    });
    
    console.log('📡 Event handlers configured');
  }

  /**
   * Запуск периодических задач
   * @private
   */
  _startPeriodicTasks() {
    // Периодическое обновление символов
    this.symbolsUpdateTimer = setInterval(async () => {
      try {
        await this.symbolManager.updateActiveSymbols();
        await this.dataManager.calculateAndCacheData();
      } catch (error) {
        console.error('Error in symbols update task:', error);
      }
    }, this.config.symbolsUpdateInterval);
    
    // Периодический пересчет данных
    this.dataCalculationTimer = setInterval(async () => {
      try {
        if (this.symbolManager.getActiveSymbolsCount() > 0) {
          await this.dataManager.calculateAndCacheData();
        }
      } catch (error) {
        console.error('Error in data calculation task:', error);
      }
    }, this.config.dataCalculationInterval);
    
    console.log('⏰ Periodic tasks started');
  }

  /**
   * Остановка периодических задач
   * @private
   */
  _stopPeriodicTasks() {
    if (this.symbolsUpdateTimer) {
      clearInterval(this.symbolsUpdateTimer);
      this.symbolsUpdateTimer = null;
    }
    
    if (this.dataCalculationTimer) {
      clearInterval(this.dataCalculationTimer);
      this.dataCalculationTimer = null;
    }
    
    console.log('⏰ Periodic tasks stopped');
  }

  /**
   * Логирование статистики системы
   * @private
   */
  _logSystemStats() {
    const stats = this.getSystemStats();
    
    console.log('📊 System Statistics:');
    console.log(`   Active symbols: ${stats.symbolManager.activeSymbolsCount}`);
    console.log(`   Connected clients: ${stats.webSocketServer.clientsCount}`);
    console.log(`   WebSocket server: ws://${stats.webSocketServer.host}:${stats.webSocketServer.port}`);
    console.log(`   Pre-calculated data: ${stats.dataManager.hasCachedData ? 'Ready' : 'Not ready'}`);
  }

  /**
   * Получить статистику всей системы
   */
  getSystemStats() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      config: this.config,
      symbolManager: this.symbolManager ? this.symbolManager.getStats() : null,
      dataManager: this.dataManager ? this.dataManager.getCacheStats() : null,
      webSocketServer: this.webSocketServer ? this.webSocketServer.getStats() : null,
      candleAggregator: this.candleAggregator ? this.candleAggregator.getCacheStats() : null,
      signalEngine: this.signalEngine ? this.signalEngine.getCacheStats() : null,
      binanceWS: this.binanceWS ? this.binanceWS.getConnectionStatus() : null
    };
  }

  /**
   * Обновить конфигурацию системы
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    console.log('📝 System configuration updated');
    
    // Если система запущена, применяем изменения
    if (this.isRunning) {
      // Обновляем настройки компонентов
      if (this.symbolManager && (
        newConfig.minDailyVolume !== undefined || 
        newConfig.minNotional !== undefined ||
        newConfig.symbolsUpdateInterval !== undefined
      )) {
        this.symbolManager.updateSettings({
          minDailyVolume: this.config.minDailyVolume,
          minNotional: this.config.minNotional,
          updateInterval: this.config.symbolsUpdateInterval
        });
      }
      
      if (this.dataManager && (
        newConfig.defaultPercentileWindow !== undefined ||
        newConfig.defaultPercentileLevel !== undefined
      )) {
        this.dataManager.updateDefaultSettings({
          percentileWindow: this.config.defaultPercentileWindow,
          percentileLevel: this.config.defaultPercentileLevel
        });
      }
      
      // Перезапускаем периодические задачи если изменились интервалы
      if (newConfig.symbolsUpdateInterval !== undefined || 
          newConfig.dataCalculationInterval !== undefined) {
        this._stopPeriodicTasks();
        this._startPeriodicTasks();
      }
    }
    
    return { oldConfig, newConfig: this.config };
  }

  /**
   * Graceful shutdown обработчик
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    console.log('🛡️ Graceful shutdown handlers configured');
  }
}

module.exports = SystemManager;