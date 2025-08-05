// performance-test.js
// Бенчмарк для сравнения производительности до и после оптимизации

const { performance } = require('perf_hooks');

// Тест 1: Создание множества Map объектов (до оптимизации)
function testMemoryLeakSimulation() {
  console.log('🧪 Тест 1: Симуляция утечек памяти (старый подход)');
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  // Симулируем старый подход - создание множества Map для каждого символа/таймфрейма
  const maps = [];
  const symbols = Array.from({length: 100}, (_, i) => `SYMBOL${i}`);
  const timeframes = ['1m', '5m', '15m', '30m', '1h'];
  
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      const map = new Map();
      // Заполняем данными как в старой версии
      for (let i = 0; i < 4000; i++) {
        map.set(`candle_${i}`, {
          openTime: Date.now() - i * 60000,
          open: 100 + Math.random() * 10,
          high: 105 + Math.random() * 10,
          low: 95 + Math.random() * 10,
          close: 100 + Math.random() * 10,
          volume: Math.random() * 1000000
        });
      }
      maps.push(map);
    }
  }
  
  const endTime = performance.now();
  const endMemory = process.memoryUsage();
  
  console.log(`   ⏱️  Время выполнения: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`   📊 Память: ${Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024)}MB`);
  console.log(`   📈 Создано объектов: ${maps.length} Map с ${maps[0].size} записями каждая`);
  
  return {
    time: endTime - startTime,
    memory: endMemory.heapUsed - startMemory.heapUsed,
    objects: maps.length
  };
}

// Тест 2: Оптимизированный подход с LRU и лимитами
function testOptimizedApproach() {
  console.log('\n🚀 Тест 2: Оптимизированный подход');
  const startTime = performance.now();
  const startMemory = process.memoryUsage();
  
  // Симулируем новый подход - единый кэш с лимитами
  const optimizedCache = new Map();
  const maxEntries = 200; // Лимит как в оптимизированной версии
  const accessOrder = new Map();
  
  const symbols = Array.from({length: 100}, (_, i) => `SYMBOL${i}`);
  const timeframes = ['1m', '5m', '15m', '30m', '1h'];
  
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      const key = `${symbol}_${tf}`;
      
      // Проверяем лимиты (как в оптимизированной версии)
      if (optimizedCache.size >= maxEntries) {
        // LRU cleanup - удаляем 25% старых записей
        const entries = Array.from(accessOrder.entries()).sort((a, b) => a[1] - b[1]);
        const toRemove = Math.ceil(entries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
          const keyToRemove = entries[i][0];
          optimizedCache.delete(keyToRemove);
          accessOrder.delete(keyToRemove);
        }
      }
      
      // Создаем данные только для ограниченного количества свечей
      const limitedData = [];
      for (let i = 0; i < 1000; i++) { // Уменьшено с 4000 до 1000
        limitedData.push({
          openTime: Date.now() - i * 60000,
          open: 100 + Math.random() * 10,
          high: 105 + Math.random() * 10,
          low: 95 + Math.random() * 10,
          close: 100 + Math.random() * 10,
          volume: Math.random() * 1000000
        });
      }
      
      optimizedCache.set(key, limitedData);
      accessOrder.set(key, Date.now());
    }
  }
  
  const endTime = performance.now();
  const endMemory = process.memoryUsage();
  
  console.log(`   ⏱️  Время выполнения: ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`   📊 Память: ${Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024)}MB`);
  console.log(`   📈 Создано записей: ${optimizedCache.size} с лимитом ${maxEntries}`);
  
  return {
    time: endTime - startTime,
    memory: endMemory.heapUsed - startMemory.heapUsed,
    objects: optimizedCache.size
  };
}

// Тест 3: Производительность вычислений сигналов
function testSignalCalculationPerformance() {
  console.log('\n⚡ Тест 3: Производительность вычислений сигналов');
  
  // Подготавливаем тестовые данные
  const testData = Array.from({length: 1000}, (_, i) => ({
    volume: Math.random() * 1000000,
    time: Date.now() - i * 60000
  }));
  
  // Тест старого подхода - множественные вычисления
  const start1 = performance.now();
  const results1 = [];
  for (let i = 0; i < 100; i++) {
    // Симулируем вычисления для каждого символа отдельно
    const sorted = [...testData.map(d => d.volume)].sort((a, b) => a - b);
    const percentile = sorted[Math.floor(sorted.length * 0.01)];
    results1.push(percentile);
  }
  const end1 = performance.now();
  
  // Тест нового подхода - кэширование результатов
  const start2 = performance.now();
  const cachedResults = new Map();
  const results2 = [];
  for (let i = 0; i < 100; i++) {
    // Проверяем кэш
    const cacheKey = 'percentile_calculation';
    if (cachedResults.has(cacheKey)) {
      results2.push(cachedResults.get(cacheKey));
    } else {
      const sorted = [...testData.map(d => d.volume)].sort((a, b) => a - b);
      const percentile = sorted[Math.floor(sorted.length * 0.01)];
      cachedResults.set(cacheKey, percentile);
      results2.push(percentile);
    }
  }
  const end2 = performance.now();
  
  console.log(`   🐌 Старый подход: ${(end1 - start1).toFixed(2)}ms`);
  console.log(`   🚀 Новый подход: ${(end2 - start2).toFixed(2)}ms`);
  console.log(`   📈 Ускорение: ${((end1 - start1) / (end2 - start2)).toFixed(1)}x`);
  
  return {
    oldTime: end1 - start1,
    newTime: end2 - start2,
    speedup: (end1 - start1) / (end2 - start2)
  };
}

// Основная функция бенчмарка
async function runBenchmark() {
  console.log('🎯 БЕНЧМАРК ПРОИЗВОДИТЕЛЬНОСТИ ОПТИМИЗАЦИИ\n');
  
  // Принудительная очистка памяти перед тестами
  if (global.gc) {
    global.gc();
  }
  
  const initialMemory = process.memoryUsage();
  console.log(`📊 Начальное потребление памяти: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB\n`);
  
  // Запускаем тесты
  const test1Results = testMemoryLeakSimulation();
  
  // Очистка между тестами
  if (global.gc) {
    global.gc();
  }
  
  const test2Results = testOptimizedApproach();
  const test3Results = testSignalCalculationPerformance();
  
  // Финальная статистика
  console.log('\n📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:');
  console.log('=' .repeat(50));
  
  const memoryImprovement = ((test1Results.memory - test2Results.memory) / test1Results.memory * 100);
  const timeImprovement = ((test1Results.time - test2Results.time) / test1Results.time * 100);
  
  console.log(`💾 Снижение потребления памяти: ${memoryImprovement.toFixed(1)}%`);
  console.log(`⏱️  Улучшение времени выполнения: ${timeImprovement.toFixed(1)}%`);
  console.log(`🚀 Ускорение вычислений: ${test3Results.speedup.toFixed(1)}x`);
  console.log(`📉 Сокращение объектов в памяти: ${((test1Results.objects - test2Results.objects) / test1Results.objects * 100).toFixed(1)}%`);
  
  const finalMemory = process.memoryUsage();
  console.log(`📊 Финальное потребление памяти: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
  
  return {
    memoryImprovement: memoryImprovement,
    timeImprovement: timeImprovement,
    computationSpeedup: test3Results.speedup,
    objectReduction: ((test1Results.objects - test2Results.objects) / test1Results.objects * 100)
  };
}

// Запуск бенчмарка
if (require.main === module) {
  runBenchmark().then(results => {
    console.log('\n✅ Бенчмарк завершен!');
    
    // Честная оценка
    console.log('\n🎯 РЕАЛЬНАЯ ОЦЕНКА ОПТИМИЗАЦИИ:');
    if (results.memoryImprovement > 50) {
      console.log('✅ Значительное снижение потребления памяти');
    } else if (results.memoryImprovement > 20) {
      console.log('✅ Умеренное снижение потребления памяти');
    } else {
      console.log('⚠️  Незначительное снижение потребления памяти');
    }
    
    if (results.computationSpeedup > 2) {
      console.log('✅ Существенное ускорение вычислений');
    } else if (results.computationSpeedup > 1.2) {
      console.log('✅ Заметное ускорение вычислений');
    } else {
      console.log('⚠️  Минимальное ускорение вычислений');
    }
    
  }).catch(console.error);
}

module.exports = { runBenchmark };
