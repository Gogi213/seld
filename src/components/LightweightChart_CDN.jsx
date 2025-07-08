import React, { useEffect, useRef, useState } from 'react';

const LightweightChartCDN = ({ data, signalMarkers = [], width = 900, height = 500 }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const volumeSeriesRef = useRef();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Проверяем, что мы на клиенте
  useEffect(() => {
    setIsClient(typeof window !== 'undefined');
  }, []);

  // Загружаем lightweight-charts через CDN
  useEffect(() => {
    if (!isClient) return;

    const loadLightweightCharts = () => {
      return new Promise((resolve, reject) => {
        // Проверяем, уже ли загружена библиотека
        if (window.LightweightCharts) {
          resolve(window.LightweightCharts);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';
        script.onload = () => {
          if (window.LightweightCharts) {
            resolve(window.LightweightCharts);
          } else {
            reject(new Error('LightweightCharts не загружен'));
          }
        };
        script.onerror = () => reject(new Error('Ошибка загрузки скрипта'));
        document.head.appendChild(script);
      });
    };

    loadLightweightCharts()
      .then(() => {
        console.log('✅ LightweightCharts загружен через CDN');
        setIsLoaded(true);
      })
      .catch(error => {
        console.error('❌ Ошибка загрузки LightweightCharts:', error);
      });
  }, [isClient]);

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

  useEffect(() => {
    if (!chartContainerRef.current || !isLoaded || !isClient || !window.LightweightCharts) return;

    const actualWidth = width === "100%" ? containerSize.width : parseInt(width);
    const actualHeight = height === "100%" ? containerSize.height : parseInt(height);

    if (actualWidth <= 0 || actualHeight <= 0) return;

    try {
      chartRef.current = window.LightweightCharts.createChart(chartContainerRef.current, {
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
          mode: 1,
          vertLine: {
            width: 1,
            color: '#758696',
            style: 3,
            labelBackgroundColor: '#4c525e',
          },
          horzLine: {
            width: 1,
            color: '#758696',
            style: 3,
            labelBackgroundColor: '#4c525e',
          },
        },
      });
      
      // Проверяем, что chart корректно создался
      if (!chartRef.current || typeof chartRef.current.addCandlestickSeries !== 'function') {
        console.error('LightweightChart: chart не создался');
        return;
      }
      
      console.log('✅ График создан успешно');
      
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
    } catch (error) {
      console.error('❌ Ошибка создания графика:', error);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [data, isLoaded, isClient, containerSize.width, containerSize.height, signalMarkers, width, height]);

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
      {isClient && !isLoaded && (
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

export default LightweightChartCDN;
