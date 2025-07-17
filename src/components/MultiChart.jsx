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

  useEffect(() => {
    if (!candles || candles.length < (percentileWindow || 50) + 1) {
      setSignalMarkers([]);
      return;
    }
    
    const markers = [];
    const volumes = candles.map(c => c.volume);
    
    // Обрабатываем только закрытые бары, исключая последнюю формирующуюся свечу
    for (let i = percentileWindow || 50; i < candles.length - 1; i++) {
      const currentVolume = volumes[i];
      
      // Берем исторические данные для расчета процентиля (исключая текущую и последующие свечи)
      const historicalVolumes = volumes.slice(Math.max(0, i - (percentileWindow || 50)), i);
      const sorted = [...historicalVolumes].sort((a, b) => a - b);
      
      // Рассчитываем процентиль для текущей свечи
      let rank = 0;
      for (let j = 0; j < sorted.length; j++) {
        if (sorted[j] < currentVolume) rank++;
        else break;
      }
      const percentileRank = (rank / Math.max(sorted.length - 1, 1)) * 100;
      const hasSignal = percentileRank <= (percentileLevel || 5);
      
      if (hasSignal) {
        markers.push({
          time: candles[i].time,
          position: 'aboveBar',
          color: '#38bdf8',
          shape: 'circle',
        });
      }
    }
    
    setSignalMarkers(markers.slice(-50));
  }, [candles, percentileWindow, percentileLevel]);

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
              background: 'transparent',
              color: selectedTimeframe === tf ? '#fff' : '#aaa',
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
          signalMarkers={signalMarkers}
          width="100%"
          height="100%"
          symbol={symbol ? symbol.replace('USDT', '') : ''}
        />
      )}
    </div>
  );
};

export default MultiChart;
