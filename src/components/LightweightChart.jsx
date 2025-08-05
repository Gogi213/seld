import React, { useEffect, useRef, useState } from 'react';

const LightweightChart = ({ data, signalMarkers = [], width = 900, height = 500 }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const volumeSeriesRef = useRef();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [createChart, setCreateChart] = useState(null);
  const [isClient, setIsClient] = useState(false);

  // Обработка изменения размеров
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      const { width: newWidth, height: newHeight } = entry.contentRect;
      setContainerSize({ width: newWidth, height: newHeight });
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Проверяем, что мы на клиенте
  useEffect(() => {
    setIsClient(typeof window !== 'undefined');
  }, []);

  // Динамический импорт lightweight-charts только на клиенте
  useEffect(() => {
    if (!isClient) return;
    
    const loadChart = async () => {
      try {
        const { createChart: chartFunc } = await import('lightweight-charts');
        setCreateChart(() => chartFunc);
        console.log('✅ lightweight-charts загружен успешно');
      } catch (error) {
        console.error('❌ Ошибка загрузки lightweight-charts:', error);
      }
    };

    loadChart();
  }, [isClient]);

  useEffect(() => {
    if (!chartContainerRef.current || !createChart || !isClient) return;

    const actualWidth = width === "100%" ? containerSize.width : parseInt(width);
    const actualHeight = height === "100%" ? containerSize.height : parseInt(height);

    if (actualWidth <= 0 || actualHeight <= 0) return;

    chartRef.current = createChart(chartContainerRef.current, {
      width: actualWidth,
      height: actualHeight,
      layout: {
        background: { color: '#111' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      timeScale: { 
        borderColor: '#444',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: '#444' },
      crosshair: {
        mode: 1, // Normal crosshair mode
        vertLine: {
          width: 1,
          color: '#758696',
          style: 3, // Dashed line
          labelBackgroundColor: '#4c525e',
        },
        horzLine: {
          width: 1,
          color: '#758696',
          style: 3, // Dashed line
          labelBackgroundColor: '#4c525e',
        },
      },
    });
    
    // Проверяем, что chart корректно создался
    if (!chartRef.current || typeof chartRef.current.addCandlestickSeries !== 'function') {
      console.error('LightweightChart: chart не создался или библиотека не загружена');
      return;
    }
    
    // Свечи на основной шкале с высокой точностью
    seriesRef.current = chartRef.current.addCandlestickSeries({
      priceScaleId: 'right',
      scaleMargins: { top: 0.2, bottom: 0.25 },
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });
    // Объём на отдельной шкале снизу
    volumeSeriesRef.current = chartRef.current.addHistogramSeries({
      color: '#cccccc',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    chartRef.current.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      borderVisible: false,
    });
    if (data && data.length) {
      seriesRef.current.setData(data);
      // volume data
      const volumeData = data.map(bar => ({
        time: bar.time,
        value: bar.volume || 0,
        color: bar.close > bar.open ? '#cccccc' : '#999999',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }
    // Добавляем маркеры сигналов
    if (signalMarkers && signalMarkers.length) {
      seriesRef.current.setMarkers(signalMarkers);
    }
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [data, createChart, isClient, containerSize.width, containerSize.height, signalMarkers, width, height]);

  return (
    <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}>
      {!isClient && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '100%', 
          height: '100%', 
          color: '#DDD',
          fontSize: '16px' 
        }}>
          Серверный рендеринг...
        </div>
      )}
      {isClient && !createChart && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '100%', 
          height: '100%', 
          color: '#DDD',
          fontSize: '16px' 
        }}>
          Загрузка графика...
        </div>
      )}
    </div>
  );
};

export default LightweightChart;
