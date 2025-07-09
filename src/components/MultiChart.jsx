import React, { useEffect, useState } from 'react';
import LightweightChart from './LightweightChart_CDN';
import { VolumeSignalEngine } from '../utils/signalEngine';

const MultiChart = ({ symbol, percentileWindow, percentileLevel }) => {
  const [candles, setCandles] = useState([]);
  const [signalMarkers, setSignalMarkers] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');

  const timeframes = ['1m', '5m', '15m', '30m', '1h'];

  const fetchCandles = async (timeframe = selectedTimeframe) => {
    if (!symbol) return;
    try {
      // Используем percentileWindow + 50 для достаточного количества данных для расчета сигналов
      const limit = Math.max(100, (percentileWindow || 50) + 50);
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`);
      const data = await res.json();
      setCandles(
        data.map(k => ({
          time: Math.floor(k[0] / 1000),
          open: +k[1],
          high: +k[2],
          low: +k[3],
          close: +k[4],
          volume: +k[5],
        }))
      );
    } catch {
      setCandles([]);
    }
  };

  // Первоначальная загрузка данных
  useEffect(() => {
    fetchCandles(selectedTimeframe);
  }, [symbol, selectedTimeframe, percentileWindow]);

  // Автоматическое обновление каждую минуту
  useEffect(() => {
    if (!symbol) return;
    
    const interval = setInterval(() => {
      fetchCandles(selectedTimeframe);
    }, 15000); // 15 секунд для более быстрого отклика

    return () => clearInterval(interval);
  }, [symbol, selectedTimeframe, percentileWindow]);

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
    {/* Переключатель таймфреймов */}
    <div style={{
      position: 'absolute',
      top: 4,
      right: 4,
      zIndex: 10,
      display: 'flex',
      gap: '4px',
      background: 'rgba(34,34,34,0.95)',
      padding: '4px',
      borderRadius: '6px',
      border: '1px solid #444',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    }}>
      {timeframes.map(tf => (
        <button
          key={tf}
          onClick={() => setSelectedTimeframe(tf)}
          style={{
            padding: '2px 6px',
            fontSize: '11px',
            fontWeight: 500,
            background: selectedTimeframe === tf ? '#1976d2' : 'transparent',
            color: selectedTimeframe === tf ? '#fff' : '#aaa',
            border: selectedTimeframe === tf ? '1px solid #1976d2' : '1px solid #555',
            borderRadius: '3px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {tf}
        </button>
      ))}
    </div>
    
    <LightweightChart 
      data={candles} 
      signalMarkers={signalMarkers} 
      width="100%" 
      height="100%" 
    />
  </div>
);
};

export default MultiChart;
