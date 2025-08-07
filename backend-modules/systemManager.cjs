// backend-modules/systemManager.cjs
// Главный модуль для координации всех компонентов системы

const CandleAggregator = require('../candleAggregator.cjs');
const BinanceWebSocketManager = require('../binanceWebSocket.cjs');
const EnhancedSignalEngine = require('../enhancedSignalEngine.cjs');

const BinanceApiService = require('./binanceApi.cjs');
const SymbolManager = require('./symbolManager.cjs');
const DataManager = require('./dataManager.cjs');
const WebSocketServer = require('./webSocketServer.cjs');
const MemoryMonitor = require('./memoryMonitor.cjs');
const TelegramBot = require('./telegramBot.cjs');
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
      dataCalculationInterval: options.dataCalculationInterval || 1 * 1000, // каждую 1 секунду
      broadcastInterval: options.broadcastInterval || 1 * 1000, // каждую 1 секунду
      
      // Дефолтные настройки сигналов
      defaultPercentileWindow: options.defaultPercentileWindow || 50,
      defaultPercentileLevel: options.defaultPercentileLevel || 1
    };
    
    // Основные компоненты
    this.candleAggregator = null;
    this.binanceWS = null;
    this.signalEngine = null;
    this.binanceApi = null;
    this.symbolManager = null;
    this.dataManager = null;
    this.webSocketServer = null;
    this.memoryMonitor = null;
    this.telegramBot = null;
    
    // Таймеры
    this.symbolsUpdateTimer = null;
    this.dataCalculationTimer = null;
    this.cleanupTimer = null;
    
    // Состояние системы
    this.isInitialized = false;
    this.isRunning = false;
    this.lastSignalStates = new Map(); // symbol -> {1m: bool, 5m: bool} для трекинга новых сигналов
    this.signalCheckCooldowns = new Map(); // symbol -> timestamp для дебаунсинга
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
      
      // Инициализация монитора памяти
      this.memoryMonitor = new MemoryMonitor({
        warningThreshold: 512 * 1024 * 1024, // 512MB
        criticalThreshold: 768 * 1024 * 1024, // 768MB
        checkInterval: 30000, // 30 секунд
        cleanupCallback: (level) => this.handleMemoryCleanup(level)
      });
      
      // Инициализация Telegram бота
      this.telegramBot = new TelegramBot({
        botToken: process.env.TELEGRAM_BOT_TOKEN || '7669528584:AAEz-BE8fs7v5Eq1ema3AD0n2wvejNm9ibw',
        chatId: process.env.TELEGRAM_CHAT_ID || '-1002565633603', // Ваш Chat ID
        threadId: process.env.TELEGRAM_THREAD_ID || '4294969041', // Thread ID вашей темы
        enabledTimeframes: ['1m', '5m']
        // Убрали signalCooldown - отправляем сигналы без задержек
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
      
      // Запуск монитора памяти
      this.memoryMonitor.start();
      
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
      
      // Остановка монитора памяти
      if (this.memoryMonitor) {
        this.memoryMonitor.stop();
      }
      
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
      
      // Проверяем сигналы на каждом обновлении (не только когда свеча закрыта)
      if (this.webSocketServer && this.webSocketServer.getClientsCount() > 0) {
        this.webSocketServer.broadcastSymbolUpdate(symbol);
      }
      
      // Проверяем Telegram сигналы на каждом обновлении для мгновенной доставки
      // Дебаунсинг защитит от дублирования
      this._checkTelegramSignalsWithDebounce(symbol);
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
    
    // Периодическая очистка кэшей (каждые 10 минут)
    this.cleanupTimer = setInterval(() => {
      try {
        this.performMaintenanceCleanup();
        
        // Принудительная очистка памяти каждые 10 минут
        if (global.gc) {
          console.log('🗑️ Running manual garbage collection...');
          global.gc();
          const memUsage = process.memoryUsage();
          console.log(`💾 Memory after GC: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
        }
      } catch (error) {
        console.error('Error in cleanup task:', error);
      }
    }, 10 * 60 * 1000);
    
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
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    console.log('⏰ Periodic tasks stopped');
  }

  /**
   * Плановая очистка кэшей
   * @private
   */
  performMaintenanceCleanup() {
    console.log('🧹 Performing maintenance cleanup...');
    
    // Очистка кэша свечей
    if (this.candleAggregator) {
      this.candleAggregator.cleanup();
    }
    
    // Очистка кэша сигналов
    if (this.signalEngine && typeof this.signalEngine.cleanupExpiredCache === 'function') {
      this.signalEngine.cleanupExpiredCache();
    }
    
    // Умная очистка устаревших состояний сигналов (старше 2 часов)
    this._cleanupExpiredSignalStates();
    
    console.log('✅ Maintenance cleanup completed');
  }

  /**
   * Очистка устаревших состояний сигналов
   * @private
   */
  _cleanupExpiredSignalStates() {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 часа
    let cleanedCooldowns = 0;
    
    // Очищаем только устаревшие кулдауны (старше 2 часов)
    for (const [symbol, timestamp] of this.signalCheckCooldowns.entries()) {
      if (now - timestamp > maxAge) {
        this.signalCheckCooldowns.delete(symbol);
        cleanedCooldowns++;
      }
    }
    
    // Состояния сигналов НЕ очищаем - они нужны для предотвращения дублей
    // Они очистятся только при критической нехватке памяти
    
    if (cleanedCooldowns > 0) {
      console.log(`🧹 Cleaned ${cleanedCooldowns} expired signal cooldowns`);
    }
  }

  /**
   * Обработчик критического уровня памяти
   * @private
   */
  handleMemoryCleanup(level) {
    console.log(`🧹 Handling memory cleanup for level: ${level}`);
    
    if (level === 'critical') {
      // Принудительная очистка при критическом уровне
      if (this.candleAggregator && typeof this.candleAggregator.forceCleanup === 'function') {
        this.candleAggregator.forceCleanup();
      }
      
      // Очистка кэша сигналов
      if (this.signalEngine) {
        this.signalEngine.signalCache.clear();
        this.signalEngine.lastUpdateTime.clear();
      }
      
      // Очистка предрассчитанных данных
      if (this.dataManager) {
        this.dataManager.preCalculatedData = null;
      }
      
      // ВАЖНО: Очищаем состояния сигналов для предотвращения дублирования
      this.lastSignalStates.clear();
      this.signalCheckCooldowns.clear();
      console.log('🧹 Cleared signal states and cooldowns to prevent duplicates');
      
    } else if (level === 'warning') {
      // Мягкая очистка при предупреждающем уровне
      this.performMaintenanceCleanup();
    }
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
   * Проверка сигналов с дебаунсингом (ограничение частоты)
   * @private
   */
  async _checkTelegramSignalsWithDebounce(symbol) {
    const now = Date.now();
    const lastCheck = this.signalCheckCooldowns.get(symbol) || 0;
    
    // Минимальный дебаунсинг 1 секунда - только для защиты от спама
    if (now - lastCheck < 1000) {
      return;
    }
    
    this.signalCheckCooldowns.set(symbol, now);
    await this._checkTelegramSignals(symbol);
  }

  /**
   * Проверка и отправка сигналов в Telegram
   * @private
   */
  async _checkTelegramSignals(symbol) {
    if (!this.telegramBot || !this.telegramBot.isEnabled) {
      return;
    }

    try {
      // Получаем данные символа
      const symbolDataResult = this.dataManager.generateSymbolData(
        symbol,
        this.dataManager.defaultSettings.percentileWindow,
        this.dataManager.defaultSettings.percentileLevel
      );

      if (!symbolDataResult || !symbolDataResult.signal) {
        return;
      }

      // ПРАВИЛЬНАЯ СТРУКТУРА: signal содержит все данные включая NATR!
      const symbolData = symbolDataResult.signal;
      const signalData = symbolData; // signal уже содержит все поля

      // Получаем последнее состояние сигналов для этого символа
      const lastStates = this.lastSignalStates.get(symbol) || { '1m': false, '5m': false };
      const currentStates = { '1m': false, '5m': false };

      // Проверяем сигналы для 1m и 5m
      for (const timeframe of ['1m', '5m']) {
        const hasActiveSignal = signalData[`percentileSignal_${timeframe}`];
        const hasExpiredSignal = signalData[`percentileSignalExpired_${timeframe}`];
        
        // Обновляем текущее состояние - ТОЛЬКО зеленые сигналы
        currentStates[timeframe] = hasActiveSignal && !hasExpiredSignal;
        
        // ТОЛЬКО если сигнал активен - проверяем, новый ли он
        if (currentStates[timeframe]) {
          const isNewSignal = !lastStates[timeframe];
          
          // Логируем только НОВЫЕ сигналы, чтобы не спамить
          if (isNewSignal) {
            // NATR фильтр для 1m сигналов - блокируем низковолатильные
            if (timeframe === '1m') {
              const natr = symbolData.natr30m || 0;
              
              if (natr < 0.8) {
                console.log(`🚫 FILTERED ${timeframe} SIGNAL: ${symbol} - NATR ${natr.toFixed(2)}% < 0.8%`);
                continue; // Пропускаем этот сигнал
              }
            }
            
            console.log(`🔥 NEW ${timeframe} SIGNAL: ${symbol} - Rank: ${signalData[`percentileRank_${timeframe}`]?.toFixed(1)}%`);
            
            // Передаем полные данные символа - теперь symbolData уже содержит все нужные поля
            await this.telegramBot.sendSignal(symbolData, timeframe);
          }
        }
      }
      
      // Сохраняем текущее состояние для следующей проверки
      this.lastSignalStates.set(symbol, currentStates);
      
    } catch (error) {
      console.error(`❌ Error checking Telegram signals for ${symbol}:`, error);
    }
  }

  /**
   * Отправка сводки сигналов в Telegram
   */
  async sendTelegramSignalsSummary() {
    if (!this.telegramBot || !this.telegramBot.isEnabled) {
      return { success: false, error: 'Telegram bot not enabled' };
    }

    try {
      const data = this.dataManager.getPreCalculatedData();
      if (!data || !data.signals) {
        return { success: false, error: 'No signals data available' };
      }

      return await this.telegramBot.sendSignalsSummary(data.signals);
    } catch (error) {
      console.error('❌ Error sending Telegram signals summary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Настройка Telegram бота
   * @param {string} chatId - ID чата для отправки сообщений
   * @param {string|null} threadId - ID темы в группе (опционально)
   */
  async setupTelegramBot(chatId, threadId = null) {
    if (!this.telegramBot) {
      return { success: false, error: 'Telegram bot not initialized' };
    }

    return await this.telegramBot.setupChatAndThread(chatId, threadId);
  }

  /**
   * Отправка тестового сообщения в Telegram
   */
  async sendTelegramTest() {
    if (!this.telegramBot || !this.telegramBot.isEnabled) {
      return { success: false, error: 'Telegram bot not enabled' };
    }

    return await this.telegramBot.sendTestMessage();
  }

  /**
   * Получение статистики Telegram бота
   */
  getTelegramStats() {
    if (!this.telegramBot) {
      return { success: false, error: 'Telegram bot not initialized' };
    }

    return this.telegramBot.getStats();
  }

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