import React, { useEffect, useRef, useState } from 'react';

const LightweightChartCDN = ({ data, signalMarkers = [], lowVolumeMarkers = [], width = 900, height = 500, symbol = '', timeframe = 'default' }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const volumeSeriesRef = useRef();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [showTools, setShowTools] = useState(false);
  
  // Массив для отслеживания созданных line tools
  const lineToolsRef = useRef([]);

  // Генерируем ключ для сохранения рисунков по символу и таймфрейму
  const getStorageKey = () => {
    return `linetools_${symbol}_${timeframe}`;
  };

  // Сохранение рисунков в localStorage
  const saveLineTools = () => {
    if (!chartRef.current || !symbol) return;
    try {
      const lineToolsData = chartRef.current.exportLineTools();
      const storageKey = getStorageKey();
      localStorage.setItem(storageKey, lineToolsData);
    } catch (error) {
      console.error('❌ Ошибка сохранения рисунков:', error);
    }
  };

  // Загрузка рисунков из localStorage
  const loadLineTools = () => {
    if (!chartRef.current || !symbol) return;
    try {
      const storageKey = getStorageKey();
      const savedData = localStorage.getItem(storageKey);
      if (savedData && savedData !== '[]') {
        // Сначала удаляем все существующие рисунки, чтобы избежать дублирования
        chartRef.current.removeAllLineTools();
        
        const success = chartRef.current.importLineTools(savedData);
        if (success) {
          // Загрузка прошла успешно
        }
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки рисунков:', error);
    }
  };

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
        script.src = '/line-tools/lightweight-charts.standalone.production.js';
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

      // Показываем инструменты после инициализации
      setShowTools(true);

      // Подписка на события line tools
      function lineToolWasDoubleClicked(params) {
        // Пустая функция - двойной клик не используется
      }
      
      function lineToolFinishedEditingChart(params) {
        // Добавляем line tool в наш массив если его там нет
        if (params.selectedLineTool && !lineToolsRef.current.find(t => t.id === params.selectedLineTool.id)) {
          lineToolsRef.current.push(params.selectedLineTool);
        }
        
        // Автоматически сохраняем после каждого изменения
        setTimeout(saveLineTools, 200);
      }

      chartRef.current.subscribeLineToolsDoubleClick(lineToolWasDoubleClicked);
      chartRef.current.subscribeLineToolsAfterEdit(lineToolFinishedEditingChart);

      // Загружаем сохраненные рисунки
      setTimeout(loadLineTools, 200);

      // Добавляем обработчик средней кнопки мыши для удаления line tools
      const handleMiddleClick = (event) => {
        if (event.button === 1) { // Средняя кнопка мыши
          event.preventDefault();
          event.stopPropagation();
          
          if (lineToolsRef.current.length > 0) {
            // Удаляем последний созданный line tool
            lineToolsRef.current.pop(); // Удаляем из массива
            chartRef.current.removeAllLineTools(); // Удаляем все
            lineToolsRef.current = []; // Очищаем массив
            setTimeout(saveLineTools, 100);
          }
        }
      };

      chartContainerRef.current.addEventListener('mousedown', handleMiddleClick);
      chartContainerRef.current.addEventListener('auxclick', handleMiddleClick);

      // Очистка подписок
      return () => {
        if (chartContainerRef.current) {
          chartContainerRef.current.removeEventListener('mousedown', handleMiddleClick);
          chartContainerRef.current.removeEventListener('auxclick', handleMiddleClick);
        }
        
        chartRef.current.unsubscribeLineToolsDoubleClick(lineToolWasDoubleClicked);
        chartRef.current.unsubscribeLineToolsAfterEdit(lineToolFinishedEditingChart);
        
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        volumeSeriesRef.current = null;
        setChartReady(false);
        setShowTools(false);
      };

    } catch (error) {
      console.error('❌ Ошибка создания графика:', error);
    }
  }, [isLoaded, isClient, containerSize.width, containerSize.height, width, height]);

  // Отдельный эффект для загрузки рисунков при смене символа/таймфрейма
  useEffect(() => {
    if (chartReady && symbol && timeframe) {
      // Сначала очищаем текущие рисунки и наш массив
      if (chartRef.current) {
        chartRef.current.removeAllLineTools();
        lineToolsRef.current = [];
      }
      // Затем загружаем новые
      setTimeout(loadLineTools, 100);
    }
  }, [symbol, timeframe, chartReady]);

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
    <div 
      ref={chartContainerRef} 
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onContextMenu={(e) => e.preventDefault()} // Отключаем контекстное меню браузера
    >
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
      {isClient && chartReady && showTools && (
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 2,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: '#111',
            border: '1px solid #333',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            padding: '6px 3px',
            alignItems: 'center',
            width: '20px',
          }}
        >
          {/* HorizontalLine */}
          <button
            title="Горизонтальный уровень"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              height: '18px',
              width: '18px',
              transition: 'background 0.2s',
            }}
            onClick={() => {
              if (chartRef.current) {
                const lineTool = chartRef.current.addLineTool('HorizontalLine', [], {});
                
                // Добавляем в наш массив сразу
                if (lineTool && lineTool.id) {
                  lineToolsRef.current.push(lineTool);
                }
              }
            }}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={e => e.currentTarget.style.background = '#222'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="8" x2="13" y2="8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {/* HorizontalRay */}
          <button
            title="Горизонтальный луч"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              height: '18px',
              width: '18px',
              transition: 'background 0.2s',
            }}
            onClick={() => {
              if (chartRef.current) {
                const lineTool = chartRef.current.addLineTool('HorizontalRay', [], {});
                
                if (lineTool && lineTool.id) {
                  lineToolsRef.current.push(lineTool);
                }
              }
            }}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={e => e.currentTarget.style.background = '#222'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="8" x2="13" y2="8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <circle cx="13" cy="8" r="2" fill="#fff" />
            </svg>
          </button>
          {/* TrendLine */}
          <button
            title="Трендовая линия"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              height: '18px',
              width: '18px',
              transition: 'background 0.2s',
            }}
            onClick={() => {
              if (chartRef.current) {
                const lineTool = chartRef.current.addLineTool('TrendLine', [], {});
                
                if (lineTool && lineTool.id) {
                  lineToolsRef.current.push(lineTool);
                }
              }
            }}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={e => e.currentTarget.style.background = '#222'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="4" cy="12" r="1.5" fill="#fff" />
              <circle cx="12" cy="4" r="1.5" fill="#fff" />
              <line x1="4" y1="12" x2="12" y2="4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Remove All Line Tools */}
          <button
            title="Удалить все рисовашки"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              height: '18px',
              width: '18px',
              marginTop: '4px',
              transition: 'background 0.2s',
            }}
            onClick={() => {
              if (chartRef.current) {
                chartRef.current.removeAllLineTools();
                // Очищаем наш массив
                lineToolsRef.current = [];
                // Сохраняем состояние после удаления
                setTimeout(saveLineTools, 100);
              }
            }}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={e => e.currentTarget.style.background = '#222'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="2" rx="1" fill="#fff" />
              <line x1="4" y1="4" x2="12" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default LightweightChartCDN;
