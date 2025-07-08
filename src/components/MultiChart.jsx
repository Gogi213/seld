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
      const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=100`);
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
  }, [symbol, selectedTimeframe]);

  // Автоматическое обновление каждую минуту
  useEffect(() => {
    if (!symbol) return;
    
    const interval = setInterval(() => {
      fetchCandles(selectedTimeframe);
    }, 60000); // 60 секунд

    return () => clearInterval(interval);
  }, [symbol, selectedTimeframe]);

  useEffect(() => {
    if (!candles || candles.length < 51) {
      setSignalMarkers([]);
      return;
    }
    const engine = new VolumeSignalEngine(percentileWindow || 50, 50, 50, percentileLevel || 5);
    const markers = [];
    
    // Обрабатываем только закрытые бары (как в TradingView barstate.isconfirmed)
    for (let i = 0; i < candles.length - 1; i++) {
      const bar = candles[i];
      // Обновляем движок только для закрытых баров
      const res = engine.checkSignals(bar.volume);
      if (res.percentileSignal) {
        markers.push({
          time: bar.time,
          position: 'aboveBar',
          color: '#38bdf8',
          shape: 'circle',
        });
      }
    }
    setSignalMarkers(markers.slice(-50));
  }, [candles]);

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
