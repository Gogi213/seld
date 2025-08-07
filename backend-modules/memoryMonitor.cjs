// memoryMonitor.cjs
// Модуль для мониторинга использования памяти

class MemoryMonitor {
  constructor(options = {}) {
    this.warningThreshold = options.warningThreshold || 512 * 1024 * 1024; // 512MB
    this.criticalThreshold = options.criticalThreshold || 768 * 1024 * 1024; // 768MB
    this.checkInterval = options.checkInterval || 30000; // 30 секунд
    this.cleanupCallback = options.cleanupCallback || null;
    
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.lastWarning = 0;
    this.lastCritical = 0;
    this.alertCooldown = 60000; // 1 минута между одинаковыми алертами
  }

  // Запустить мониторинг
  start() {
    if (this.isMonitoring) {
      console.log('⚠️ Memory monitor already running');
      return;
    }

    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);

    console.log(`📊 Memory monitor started (warning: ${Math.round(this.warningThreshold / 1024 / 1024)}MB, critical: ${Math.round(this.criticalThreshold / 1024 / 1024)}MB)`);
  }

  // Остановить мониторинг
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    console.log('📊 Memory monitor stopped');
  }

  // Проверить использование памяти
  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const heapTotal = memUsage.heapTotal;
    const external = memUsage.external;
    const rss = memUsage.rss;
    
    const now = Date.now();

    // Критический уровень
    if (heapUsed > this.criticalThreshold) {
      if (now - this.lastCritical > this.alertCooldown) {
        console.error(`🚨 CRITICAL: Memory usage ${Math.round(heapUsed / 1024 / 1024)}MB exceeds critical threshold ${Math.round(this.criticalThreshold / 1024 / 1024)}MB`);
        this.lastCritical = now;
        
        // Вызываем cleanup если доступен
        if (this.cleanupCallback) {
          try {
            this.cleanupCallback('critical');
          } catch (error) {
            console.error('Error during critical cleanup:', error);
          }
        }
        
        // Принудительный GC если доступен
        if (global.gc) {
          global.gc();
          console.log('🧹 Forced garbage collection due to critical memory usage');
        }
      }
    }
    // Предупреждающий уровень
    else if (heapUsed > this.warningThreshold) {
      if (now - this.lastWarning > this.alertCooldown) {
        console.warn(`⚠️ WARNING: Memory usage ${Math.round(heapUsed / 1024 / 1024)}MB exceeds warning threshold ${Math.round(this.warningThreshold / 1024 / 1024)}MB`);
        this.lastWarning = now;
        
        // Вызываем мягкий cleanup
        if (this.cleanupCallback) {
          try {
            this.cleanupCallback('warning');
          } catch (error) {
            console.error('Error during warning cleanup:', error);
          }
        }
      }
    }

    // Логируем статистику каждые 5 минут или при высоком использовании
    const shouldLog = (now % (5 * 60 * 1000) < this.checkInterval) || heapUsed > this.warningThreshold;
    if (shouldLog) {
      this.logMemoryStats();
    }
  }

  // Получить текущую статистику памяти
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      externalMB: Math.round(memUsage.external / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      warningThresholdMB: Math.round(this.warningThreshold / 1024 / 1024),
      criticalThresholdMB: Math.round(this.criticalThreshold / 1024 / 1024),
      isWarning: memUsage.heapUsed > this.warningThreshold,
      isCritical: memUsage.heapUsed > this.criticalThreshold
    };
  }

  // Логировать статистику памяти
  logMemoryStats() {
    const stats = this.getMemoryStats();
    const status = stats.isCritical ? '🚨 CRITICAL' : 
                   stats.isWarning ? '⚠️ WARNING' : 
                   '✅ NORMAL';
    
    // console.log(`📊 Memory Status: ${status} | Heap: ${stats.heapUsedMB}/${stats.heapTotalMB}MB | External: ${stats.externalMB}MB | RSS: ${stats.rssMB}MB`);
  }

  // Обновить пороговые значения
  updateThresholds(warning, critical) {
    if (warning) this.warningThreshold = warning;
    if (critical) this.criticalThreshold = critical;
    console.log(`📊 Updated memory thresholds: warning=${Math.round(this.warningThreshold / 1024 / 1024)}MB, critical=${Math.round(this.criticalThreshold / 1024 / 1024)}MB`);
  }
}

module.exports = MemoryMonitor;
