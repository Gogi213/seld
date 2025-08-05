// test-lightweight.js
// Проверка работы lightweight-charts на сервере

console.log('🧪 Тестируем lightweight-charts...');

try {
  // Пытаемся импортировать
  const { createChart } = require('lightweight-charts');
  console.log('✅ lightweight-charts импортирован успешно');
  console.log('✅ createChart доступен:', typeof createChart);
  
  // Проверяем что это функция
  if (typeof createChart === 'function') {
    console.log('✅ createChart - это функция');
  } else {
    console.log('❌ createChart - НЕ функция, тип:', typeof createChart);
  }
  
} catch (error) {
  console.log('❌ Ошибка импорта lightweight-charts:');
  console.log(error.message);
  console.log('\n📦 Попробуйте установить:');
  console.log('npm install lightweight-charts');
}

// Проверяем установленные пакеты
try {
  const packageJson = require('./package.json');
  const deps = packageJson.dependencies || {};
  const devDeps = packageJson.devDependencies || {};
  
  console.log('\n📋 Зависимости с "chart" в названии:');
  Object.keys({...deps, ...devDeps}).forEach(pkg => {
    if (pkg.includes('chart')) {
      console.log(`  ${pkg}: ${deps[pkg] || devDeps[pkg]}`);
    }
  });
} catch (e) {
  console.log('❌ Не удалось прочитать package.json');
}
