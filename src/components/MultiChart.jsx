
import React, { useEffect, useState } from 'react';
import LightweightChart from './LightweightChart_CDN';

const MultiChart = ({ symbol, percentileWindow, percentileLevel, candleData, selectedTimeframe: globalTimeframe }) => {
  const timeframes = ['1m', '5m', '15m', '30m', '1h'];
  const [selectedTimeframe, setSelectedTimeframe] = useState(globalTimeframe || '5m');
  const [wasLocalChange, setWasLocalChange] = useState(false);
  const [candles, setCandles] = useState([]);
  const [signalMarkers, setSignalMarkers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Глобальный переключатель синхронизирует только в момент изменения
  useEffect(() => {
    if (globalTimeframe && globalTimeframe !== selectedTimeframe) {
      setSelectedTimeframe(globalTimeframe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalTimeframe]);

  // Получаем данные свечей из props (от родительского WebSocket)
  useEffect(() => {
    if (!symbol || !candleData || !candleData[symbol]) {
      setCandles([]);
      setLoading(false);
      return;
    }

    const symbolCandles = candleData[symbol][selectedTimeframe];
    if (symbolCandles && symbolCandles.length > 0) {
      setCandles(symbolCandles);
      setLoading(false);
    } else {
      setCandles([]);
      setLoading(false);
    }
  }, [symbol, selectedTimeframe, candleData]);


  // --- Оптимизация: вычисления только при изменении данных ---
  const [signalMarkersMemo, lowVolumeMarkersMemo] = React.useMemo(() => {
    let signalMarkers = [];
    let lowVolumeMarkers = [];
    if (candles && candles.length >= (percentileWindow || 50) + 1) {
      const volumes = candles.map(c => c.volume);
      const signalIndices = [];
      for (let i = percentileWindow || 50; i < candles.length - 1; i++) {
        const currentVolume = volumes[i];
        const historicalVolumes = volumes.slice(Math.max(0, i - (percentileWindow || 50)), i);
        const sorted = [...historicalVolumes].sort((a, b) => a - b);
        let rank = 0;
        for (let j = 0; j < sorted.length; j++) {
          if (sorted[j] < currentVolume) rank++;
          else break;
        }
        const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
        const hasSignal = percentileRank <= (percentileLevel || 5);
        if (hasSignal) {
          signalMarkers.push({
            time: candles[i].time,
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
          });
          signalIndices.push(i);
        }
      }
      signalMarkers = signalMarkers.slice(-50);
      if (signalIndices.length > 0) {
        const lastSignalIdx = signalIndices[signalIndices.length - 1];
        const windowStart = Math.max(0, lastSignalIdx - 49);
        const windowEnd = lastSignalIdx + 1;
        const windowCandles = candles.slice(windowStart, windowEnd);
        const sortedByVolume = windowCandles
          .map((c, idx) => ({ idx: windowStart + idx, time: c.time, volume: c.volume }))
          .sort((a, b) => a.volume - b.volume)
          .slice(0, 3);
        lowVolumeMarkers = sortedByVolume.map(item => ({
          time: item.time,
          color: '#fff',
          idx: item.idx
        }));
      }
    }
    return [signalMarkers, lowVolumeMarkers];
  }, [candles, percentileWindow, percentileLevel]);

  // Определяем тип подсветки для каждого таймфрейма
  // blue: активный сигнал на последней закрытой
  // orange: протухший сигнал (см. условия)
  // transparent: нет сигнала
  const highlightByTimeframe = React.useMemo(() => {
    if (!symbol || !candleData || !candleData[symbol]) return {};
    const result = {};
    timeframes.forEach(tf => {
      const candlesArr = candleData[symbol][tf];
      if (!candlesArr || candlesArr.length < (percentileWindow || 50) + 2) {
        result[tf] = 'transparent';
        return;
      }
      const volumes = candlesArr.map(c => c.volume);
      // --- Для всех кроме 1м ---
      if (tf !== '1m') {
        const idxLast = candlesArr.length - 2; // последняя закрытая
        const idxPrev = candlesArr.length - 3; // предпредыдущая закрытая
        // Проверка сигнала на последней
        let hasSignalLast = false;
        if (idxLast >= (percentileWindow || 50)) {
          const currentVolume = volumes[idxLast];
          const historicalVolumes = volumes.slice(Math.max(0, idxLast - (percentileWindow || 50)), idxLast);
          const sorted = [...historicalVolumes].sort((a, b) => a - b);
          let rank = 0;
          for (let j = 0; j < sorted.length; j++) {
            if (sorted[j] < currentVolume) rank++;
            else break;
          }
          const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
          hasSignalLast = percentileRank <= (percentileLevel || 5);
        }
        // Проверка сигнала на предпредыдущей
        let hasSignalPrev = false;
        if (idxPrev >= (percentileWindow || 50)) {
          const currentVolume = volumes[idxPrev];
          const historicalVolumes = volumes.slice(Math.max(0, idxPrev - (percentileWindow || 50)), idxPrev);
          const sorted = [...historicalVolumes].sort((a, b) => a - b);
          let rank = 0;
          for (let j = 0; j < sorted.length; j++) {
            if (sorted[j] < currentVolume) rank++;
            else break;
          }
          const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
          hasSignalPrev = percentileRank <= (percentileLevel || 5);
        }
        if (hasSignalLast) {
          result[tf] = 'blue';
        } else if (hasSignalPrev) {
          result[tf] = 'orange';
        } else {
          result[tf] = 'transparent';
        }
      } else {
        // --- Для 1м ---
        // Найти последний сигнал на закрытой свече
        let lastSignalIdx = -1;
        for (let i = candlesArr.length - 2; i >= (percentileWindow || 50); i--) {
          const currentVolume = volumes[i];
          const historicalVolumes = volumes.slice(Math.max(0, i - (percentileWindow || 50)), i);
          const sorted = [...historicalVolumes].sort((a, b) => a - b);
          let rank = 0;
          for (let j = 0; j < sorted.length; j++) {
            if (sorted[j] < currentVolume) rank++;
            else break;
          }
          const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
          if (percentileRank <= (percentileLevel || 5)) {
            lastSignalIdx = i;
            break;
          }
        }
        // Если сигнал был и держится 4 свечи, и после него не было новых сигналов
        if (lastSignalIdx !== -1) {
          const barsSinceSignal = candlesArr.length - 2 - lastSignalIdx;
          if (barsSinceSignal === 0) {
            result[tf] = 'blue';
          } else if (barsSinceSignal > 0 && barsSinceSignal <= 4) {
            // Проверяем, не было ли новых сигналов после lastSignalIdx
            let newSignal = false;
            for (let i = lastSignalIdx + 1; i <= candlesArr.length - 2; i++) {
              const currentVolume = volumes[i];
              const historicalVolumes = volumes.slice(Math.max(0, i - (percentileWindow || 50)), i);
              const sorted = [...historicalVolumes].sort((a, b) => a - b);
              let rank = 0;
              for (let j = 0; j < sorted.length; j++) {
                if (sorted[j] < currentVolume) rank++;
                else break;
              }
              const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
              if (percentileRank <= (percentileLevel || 5)) {
                newSignal = true;
                break;
              }
            }
            if (!newSignal) {
              result[tf] = 'orange';
            } else {
              result[tf] = 'transparent';
            }
          } else {
            result[tf] = 'transparent';
          }
        } else {
          result[tf] = 'transparent';
        }
      }
    });
    return result;
  }, [symbol, candleData, percentileWindow, percentileLevel, timeframes]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      margin: 0,
      padding: 0,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Локальный переключатель таймфрейма */}
      <div style={{
        position: 'absolute',
        top: 4 / 1.2,
        right: 4 / 1.2,
        zIndex: 10,
        display: 'flex',
        gap: `${4 / 1.2}px`,
        background: 'rgba(34,34,34,0.95)',
        padding: `${4 / 1.2}px`,
        borderRadius: `${6 / 1.2}px`,
        border: `${1 / 1.2}px solid #444`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        {timeframes.map(tf => (
          <button
            key={tf}
            onClick={() => {
              setSelectedTimeframe(tf);
              setWasLocalChange(true);
            }}
            style={{
              padding: `${2 / 1.2}px ${6 / 1.2}px`,
              fontSize: `${11 / 1.2}px`,
              fontWeight: 500,
              background:
                highlightByTimeframe[tf] === 'blue'
                  ? 'rgba(56,189,248,1)'
                  : highlightByTimeframe[tf] === 'orange'
                  ? 'rgba(255,165,0,1)'
                  : 'transparent',
              color:
                selectedTimeframe === tf || highlightByTimeframe[tf] !== 'transparent'
                  ? '#fff'
                  : '#aaa',
              border: selectedTimeframe === tf ? `${2 / 1.2}px solid #fff` : `${1 / 1.2}px solid #555`,
              borderRadius: `${3 / 1.2}px`,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {tf}
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#aaa',
          fontSize: `${14 / 1.2}px`
        }}>
          Загрузка графика...
        </div>
      ) : candles.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#888',
          fontSize: `${14 / 1.2}px`
        }}>
          Нет данных
        </div>
      ) : (
        <LightweightChart
          data={candles}
          signalMarkers={signalMarkersMemo}
          lowVolumeMarkers={lowVolumeMarkersMemo}
          width="100%"
          height="100%"
          symbol={symbol ? symbol.replace('USDT', '') : ''}
        />
      )}
    </div>
  );
};

export default MultiChart;
