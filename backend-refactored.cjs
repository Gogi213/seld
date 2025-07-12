// backend-refactored.cjs
// Рефакторенный сервер с модульной архитектурой

const SystemManager = require('./backend-modules/systemManager.cjs');
const { WEBSOCKET, FILTERS, INTERVALS, SIGNALS, EMOJIS } = require('./backend-modules/constants.cjs');

// Конфигурация системы (можно переопределить дефолтные значения)
const systemConfig = {
  // WebSocket сервер
  wsPort: WEBSOCKET.DEFAULT_PORT,
  wsHost: WEBSOCKET.DEFAULT_HOST,
  
  // Фильтрация символов
  minDailyVolume: FILTERS.MIN_DAILY_VOLUME,
  minNotional: FILTERS.MIN_NOTIONAL,
  
  // Интервалы обновлений
  symbolsUpdateInterval: INTERVALS.SYMBOLS_UPDATE,
  dataCalculationInterval: INTERVALS.DATA_CALCULATION,
  broadcastInterval: INTERVALS.BROADCAST,
  
  // Дефолтные настройки сигналов
  defaultPercentileWindow: SIGNALS.DEFAULT_PERCENTILE_WINDOW,
  defaultPercentileLevel: SIGNALS.DEFAULT_PERCENTILE_LEVEL
};

// Создание и запуск системы
async function main() {
  console.log(`${EMOJIS.ROCKET} Starting Binance Signals System (Refactored)...`);
  
  try {
    // Создаем менеджер системы
    const systemManager = new SystemManager(systemConfig);
    
    // Настраиваем graceful shutdown
    systemManager.setupGracefulShutdown();
    
    // Инициализируем и запускаем систему
    await systemManager.start();
    
    // Логируем успешный запуск
    console.log('✅ System started successfully!');
    console.log('📊 System ready for connections');
    
    // Периодически выводим статистику (каждые 5 минут)
    setInterval(() => {
      const stats = systemManager.getSystemStats();
      console.log(`📈 Status: ${stats.symbolManager?.activeSymbolsCount || 0} symbols, ${stats.webSocketServer?.clientsCount || 0} clients`);
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('❌ Failed to start system:', error);
    process.exit(1);
  }
}

// Запуск системы
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});