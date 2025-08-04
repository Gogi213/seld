// ChartView.jsx - компонент для отображения графиков
import React, { useEffect, useState } from 'react';
import MultiChart from './MultiChart';

import FullScreenChartView from './FullScreenChartView';

const ChartView = ({ 
  currentPageCoins, 
  candleData,
  currentPage,
  totalPages,
  goToNextPage,
  goToPrevPage,
  canGoNext,
  canGoPrev,
  pinSignalsTop,
  setPinSignalsTop,
  setActiveTab
}) => {
  // Определяем, является ли устройство мобильным
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Обработчик изменения размера окна
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Отключаем скроллинг на странице графиков
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Глобальный таймфрейм для всех MultiChart
  const [selectedTimeframe, setSelectedTimeframe] = useState('5m');
  const timeframes = ['1m', '5m', '15m', '30m', '1h'];

  // Состояние полноэкранного графика
  const [fullscreenChart, setFullscreenChart] = useState(null);

  // Открытие по двойному клику
  const handleChartDoubleClick = (e, coin) => {
    // Только левая кнопка мыши
    if (e.button === 0) {
      setFullscreenChart({
        symbol: coin.symbol,
        // ...existing code...
        selectedTimeframe
      });
    }
  };

  const handleCloseFullscreen = () => {
    setFullscreenChart(null);
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      width: '100vw', 
      height: '100vh', 
      background: '#000',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Узкая полоска меню сверху */}
      <div style={{
        height: isMobile ? '50px' : '40px',
        background: '#111',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 8px' : '0 15px',
        flexShrink: 0
      }}>
        {/* Левая часть - навигация по страницам */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? '8px' : '15px'
        }}>
          <button 
            onClick={goToPrevPage}
            disabled={!canGoPrev}
            style={{
              background: !canGoPrev ? 'transparent' : '#333',
              border: '1px solid #444',
              color: !canGoPrev ? '#666' : '#fff',
              borderRadius: '3px',
              width: isMobile ? '24px' : '28px',
              height: isMobile ? '24px' : '28px',
              fontSize: isMobile ? '10px' : '12px',
              cursor: !canGoPrev ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={e => !canGoPrev ? null : e.target.style.background = '#444'}
            onMouseLeave={e => !canGoPrev ? null : e.target.style.background = '#333'}
          >
            ◀
          </button>
          
          {/* Индикатор страницы */}
          <span style={{
            color: '#fff',
            fontSize: isMobile ? '11px' : '13px',
            fontWeight: '500',
            padding: '0 8px',
            background: '#222',
            borderRadius: '4px',
            border: '1px solid #444'
          }}>
            {currentPage} / {totalPages}
          </span>
          
          <button 
            onClick={goToNextPage}
            disabled={!canGoNext}
            style={{
              background: !canGoNext ? 'transparent' : '#333',
              border: '1px solid #444',
              color: !canGoNext ? '#666' : '#fff',
              borderRadius: '3px',
              width: isMobile ? '24px' : '28px',
              height: isMobile ? '24px' : '28px',
              fontSize: isMobile ? '10px' : '12px',
              cursor: !canGoNext ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={e => !canGoNext ? null : e.target.style.background = '#444'}
            onMouseLeave={e => !canGoNext ? null : e.target.style.background = '#333'}
          >
            ▶
          </button>
          <button 
            onClick={() => setActiveTab('signals')}
            style={{
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              padding: isMobile ? '4px 8px' : '6px 12px',
              fontSize: isMobile ? '10px' : '12px',
              cursor: 'pointer',
              fontWeight: 500,
              boxShadow: '0 0 3px #1976d2'
            }}
          >
            Сигналы
          </button>
        </div>

        {/* Правая часть - чекбокс и таймфреймы */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? 6 : 12
        }}>
          {!isMobile && (
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              background: '#222', 
              borderRadius: 6, 
              border: '1px solid #333', 
              padding: '6px 10px', 
              fontSize: 13, 
              color: '#fff', 
              fontWeight: 500, 
              cursor: 'pointer', 
              userSelect: 'none' 
            }}>
              <input
                type="checkbox"
                checked={pinSignalsTop}
                onChange={e => setPinSignalsTop(e.target.checked)}
                style={{ marginRight: 4 }}
              />
              Закрепить
            </label>
          )}
          {/* Панель таймфреймов */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '2px' : '4px',
            background: '#222',
            padding: isMobile ? '2px' : '4px',
            borderRadius: '6px',
            border: '1px solid #333',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            {timeframes.map(tf => (
              <button
                key={tf}
                style={{
                  padding: isMobile ? '1px 4px' : '2px 6px',
                  fontSize: isMobile ? '9px' : '11px',
                  fontWeight: 500,
                  background: 'transparent',
                  color: selectedTimeframe === tf ? '#fff' : '#aaa',
                  border: selectedTimeframe === tf ? '2px solid #fff' : '1px solid #555',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Сетка графиков */}
      <div style={{ 
        flex: 1, 
        padding: isMobile ? '8px' : '15px',
        overflow: isMobile ? 'auto' : 'hidden',
        maxHeight: isMobile ? 'calc(100vh - 100px)' : 'auto'
      }}>
        {currentPageCoins.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gridTemplateRows: isMobile ? 'repeat(auto, 1fr)' : 'repeat(3, 1fr)',
            gap: isMobile ? '10px' : '20px',
            width: '100%',
            height: isMobile ? 'auto' : '100%',
            minHeight: isMobile ? 'auto' : '100%'
          }}>
            {currentPageCoins.map((coin) => (
              <div key={coin.symbol} style={{ 
                background: '#111', 
                borderRadius: 8, 
                overflow: 'hidden', 
                boxShadow: '0 0 8px #222', 
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                minHeight: isMobile ? '300px' : 'auto',
                height: isMobile ? '300px' : 'auto'
              }}
                onDoubleClick={(e) => handleChartDoubleClick(e, coin)}
                title="Открыть график на весь экран (двойной клик)"
              >
                <div style={{ 
                  position: 'absolute', 
                  top: 4, 
                  left: 4, 
                  zIndex: 10, 
                  fontWeight: 600, 
                  fontSize: 14, 
                  color: '#fff', 
                  background: 'rgba(34,34,34,0.95)', 
                  padding: '4px 8px', 
                  borderRadius: 6,
                  border: '1px solid #444',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    fontSize: '14px',
                    color: '#fff',
                    fontWeight: 600
                  }}>
                    nATR: {coin.natr30m?.toFixed(2) || 'N/A'}
                  </span>
                </div>
                <MultiChart
                  symbol={coin.symbol}
                  candleData={candleData}
                  selectedTimeframe={selectedTimeframe}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#888', fontSize: 20, textAlign: 'center', marginTop: '50px' }}>
            Нет данных для графиков
          </div>
        )}
        {/* Fullscreen overlay */}
        {fullscreenChart && (
          <FullScreenChartView
            symbol={fullscreenChart.symbol}
            candleData={candleData} // всегда актуальные данные
            selectedTimeframe={fullscreenChart.selectedTimeframe}
            onClose={handleCloseFullscreen}
          />
        )}
      </div>
    </div>
  );
};

export default ChartView;