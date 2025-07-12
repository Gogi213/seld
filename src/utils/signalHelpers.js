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
  return [...signals].sort((a, b) => {
    if (pinSignalsTop) {
      // Сначала закрепляем монеты с сигналами (🐸), сортируем их по natr30m убыв.
      const hasSignalsA = TF_LIST.some(tf => a[`percentileSignal_${tf}`] || a[`percentileSignalExpired_${tf}`]);
      const hasSignalsB = TF_LIST.some(tf => b[`percentileSignal_${tf}`] || b[`percentileSignalExpired_${tf}`]);
      if (hasSignalsA && !hasSignalsB) return -1;
      if (!hasSignalsA && hasSignalsB) return 1;
      // Внутри групп сортируем по natr30m убыванию
      return (b.natr30m || 0) - (a.natr30m || 0);
    }
    
    // Если не закреплять — сортируем по выбранному критерию
    let vA = a[sortKey];
    let vB = b[sortKey];
    
    if (sortKey === 'symbol') {
      vA = vA || '';
      vB = vB || '';
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    } else if (sortKey.startsWith('percentileRank_')) {
      const hasA = a[sortKey] !== undefined && a[sortKey] !== null;
      const hasB = b[sortKey] !== undefined && b[sortKey] !== null;
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
  });
}

// Функция для проверки наличия сигналов у монеты
export function hasAnySignals(signal) {
  return TF_LIST.some(tf => signal[`percentileSignal_${tf}`] || signal[`percentileSignalExpired_${tf}`]);
}