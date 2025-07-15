// signalHelpers.js - утилиты для работы с сигналами
import { TF_LIST } from './constants';

// Функция для валидации сигналов
export function isValidSignal(signal) {
  return signal && 
         typeof signal === 'object' && 
         signal.symbol && 
         typeof signal.symbol === 'string' &&
         !signal.loading &&
         signal.dailyVolume !== undefined;
}

// Функция для расчета сигналов на основе свечей
export function calculateSignalMarkers(candles, percentileWindow, percentileLevel) {
  if (!candles || candles.length < percentileWindow + 1) {
    return [];
  }
  
  const markers = [];
  const volumes = candles.map(c => c.volume);
  
  // Обрабатываем только закрытые бары, исключая последнюю формирующуюся свечу
  for (let i = percentileWindow; i < candles.length - 1; i++) {
    const currentVolume = volumes[i];
    
    // Берем исторические данные для расчета процентиля (исключая текущую и последующие свечи)
    const historicalVolumes = volumes.slice(Math.max(0, i - percentileWindow), i);
    const sorted = [...historicalVolumes].sort((a, b) => a - b);
    
    // Рассчитываем процентиль для текущей свечи
    let rank = 0;
    for (let j = 0; j < sorted.length; j++) {
      if (sorted[j] < currentVolume) rank++;
      else break;
    }
    const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
    const hasSignal = percentileRank <= percentileLevel;
    
    if (hasSignal) {
      markers.push({
        time: candles[i].time,
        position: 'aboveBar',
        color: '#38bdf8',
        shape: 'circle',
      });
    }
  }
  
  // Берём только последние 50 закрытых свечей
  return markers.slice(-50);
}

// Функция для сортировки сигналов
export function sortSignals(signals, sortKey, sortDir, pinSignalsTop) {
  if (!pinSignalsTop) {
    // Обычная сортировка по выбранному столбцу
    return [...signals].sort((a, b) => compareSignals(a, b, sortKey, sortDir));
  }

  // Разделяем на pinned и обычные
  const pinned = [];
  const rest = [];
  for (const s of signals) {
    const hasSignal = TF_LIST.some(tf => s[`percentileSignal_${tf}`] || s[`percentileSignalExpired_${tf}`]);
    (hasSignal ? pinned : rest).push(s);
  }

  // Сортируем обе группы по выбранному столбцу
  pinned.sort((a, b) => compareSignals(a, b, sortKey, sortDir));
  rest.sort((a, b) => compareSignals(a, b, sortKey, sortDir));

  // pinned сверху
  return [...pinned, ...rest];
}

// Универсальная функция сравнения по sortKey/sortDir
function compareSignals(a, b, sortKey, sortDir) {
  let vA = a[sortKey];
  let vB = b[sortKey];

  if (sortKey === 'symbol') {
    vA = vA || '';
    vB = vB || '';
    if (vA < vB) return sortDir === 'asc' ? -1 : 1;
    if (vA > vB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  } else if (sortKey.startsWith('percentileRank_')) {
    const hasA = vA !== undefined && vA !== null;
    const hasB = vB !== undefined && vB !== null;
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    vA = Number(vA) || 0;
    vB = Number(vB) || 0;
    return sortDir === 'asc' ? vA - vB : vB - vA;
  } else {
    vA = Number(vA) || 0;
    vB = Number(vB) || 0;
    return sortDir === 'asc' ? vA - vB : vB - vA;
  }
}

// Функция для проверки наличия сигналов у монеты
export function hasAnySignals(signal) {
  return TF_LIST.some(tf => signal[`percentileSignal_${tf}`] || signal[`percentileSignalExpired_${tf}`]);
}