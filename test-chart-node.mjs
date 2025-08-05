import { createChart } from 'lightweight-charts';

console.log('🧪 Тестируем lightweight-charts (Node.js)...');

try {
  console.log('📦 Импорт прошел успешно');
  console.log('🔍 createChart тип:', typeof createChart);
  
  if (typeof createChart === 'function') {
    console.log('✅ createChart является функцией');
    
    // Пытаемся создать chart в headless режиме
    try {
      const chart = createChart(null, { width: 400, height: 300 });
      console.log('✅ График создался в headless режиме');
      console.log('📊 Chart объект:', typeof chart);
    } catch (e) {
      console.log('⚠️  Headless режим не поддерживается:', e.message);
    }
  } else {
    console.log('❌ createChart не является функцией');
  }
  
} catch (error) {
  console.log('❌ Ошибка импорта:', error.message);
  console.log('📋 Stack:', error.stack);
}

console.log('🏁 Тест завершен');
