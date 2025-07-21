import React, { useEffect, useRef, useState } from 'react';

const LightweightChartCDN = ({ data, signalMarkers = [], lowVolumeMarkers = [], width = 900, height = 500, symbol = '' }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const volumeSeriesRef = useRef();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [chartReady, setChartReady] = useState(false);

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

  // Создание графика только один раз
  useEffect(() => {
    if (!chartContainerRef.current || !isLoaded || !isClient || !window.LightweightCharts) return;

    const actualWidth = width === "100%" ? containerSize.width : parseInt(width);
    const actualHeight = height === "100%" ? containerSize.height : parseInt(height);

    if (actualWidth <= 0 || actualHeight <= 0) return;

    // Создаем график только если его еще нет
    if (chartRef.current) return;

    try {
      chartRef.current = window.LightweightCharts.createChart(chartContainerRef.current, {
        width: actualWidth,
        height: actualHeight,
        layout: {
          background: { color: '#111' },
          textColor: '#DDD',
        },
        grid: {
          vertLines: { color: '#222', visible: false },
          horzLines: { color: '#222' },
        },
        timeScale: {
          borderColor: '#444',
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: { borderColor: '#444' },
        crosshair: {
          mode: 0,
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
        watermark: {
          visible: !!symbol,
          fontSize: 38,
          color: 'rgba(255,255,255,0.50)',
          text: symbol,
          horzAlign: 'center',
          vertAlign: 'top',
          fontFamily: 'monospace',
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
        color: '#888888',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      
      chartRef.current.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        borderVisible: false,
      });
      
      // Сразу загружаем данные если они есть
      if (data && data.length) {
        seriesRef.current.setData(data);
        const volumeData = data.map(bar => ({
          time: bar.time,
          value: bar.volume || 0,
          color: '#888888',
        }));
        volumeSeriesRef.current.setData(volumeData);
      }
      
      // Сразу добавляем маркеры если они есть
      if (signalMarkers && signalMarkers.length) {
        seriesRef.current.setMarkers(signalMarkers);
      }
      
      // Отмечаем график как готовый
      setChartReady(true);
      
    } catch (error) {
      console.error('❌ Ошибка создания графика:', error);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        volumeSeriesRef.current = null;
        setChartReady(false);
      }
    };
  }, [isLoaded, isClient, containerSize.width, containerSize.height, width, height]);

  // Обновление данных без пересоздания графика
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !volumeSeriesRef.current) return;

    if (data && data.length) {
      seriesRef.current.setData(data);
      // volume data
      // Собираем времена для белых баров
      const whiteTimes = (lowVolumeMarkers || []).map(m => m.time);
      const volumeData = data.map(bar => ({
        time: bar.time,
        value: bar.volume || 0,
        color: whiteTimes.includes(bar.time) ? '#fff' : '#888888',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }
  }, [data]);

  // Обновление маркеров сигналов отдельно
  useEffect(() => {
    if (!seriesRef.current) return;

    if (signalMarkers && signalMarkers.length) {
      seriesRef.current.setMarkers(signalMarkers);
    } else {
      seriesRef.current.setMarkers([]);
    }
  }, [signalMarkers]);

  // Обновление размеров графика
  useEffect(() => {
    if (!chartRef.current) return;

    const actualWidth = width === "100%" ? containerSize.width : parseInt(width);
    const actualHeight = height === "100%" ? containerSize.height : parseInt(height);

    if (actualWidth > 0 && actualHeight > 0) {
      chartRef.current.applyOptions({
        width: actualWidth,
        height: actualHeight,
      });
    }
  }, [containerSize.width, containerSize.height, width, height]);

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
          fontSize: '14px'
        }}>
          Серверный рендеринг...
        </div>
      )}
      {isClient && (!isLoaded || !chartReady) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: '#DDD',
          fontSize: '14px'
        }}>
          Загрузка графика...
        </div>
      )}
    </div>
  );
};

export default LightweightChartCDN;
