// ChartView.jsx - компонент для отображения графиков
import React, { useEffect } from 'react';
import MultiChart from './MultiChart';

const ChartView = ({ 
  currentPageCoins, 
  appliedPercentileWindow, 
  appliedPercentileLevel, 
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
  // Отключаем скроллинг на странице графиков
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

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
        height: '40px',
        background: '#111',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 15px',
        flexShrink: 0
      }}>
        {/* Левая часть - навигация по страницам */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button 
            onClick={goToPrevPage}
            disabled={!canGoPrev}
            style={{
              background: 'transparent',
              border: '1px solid #444',
              color: !canGoPrev ? '#666' : '#fff',
              borderRadius: '3px',
              width: '28px',
              height: '28px',
              fontSize: '12px',
              cursor: !canGoPrev ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ◀
          </button>
          <span style={{ color: '#aaa', fontSize: '12px' }}>
            {currentPage} из {totalPages}
          </span>
          <button 
            onClick={goToNextPage}
            disabled={!canGoNext}
            style={{
              background: 'transparent',
              border: '1px solid #444',
              color: !canGoNext ? '#666' : '#fff',
              borderRadius: '3px',
              width: '28px',
              height: '28px',
              fontSize: '12px',
              cursor: !canGoNext ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
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
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
              boxShadow: '0 0 3px #1976d2'
            }}
          >
            Сигналы
          </button>
        </div>

        {/* Правая часть - чекбокс и кнопка выхода */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            Закрепить монеты
          </label>
        </div>
      </div>
      
      {/* Сетка графиков */}
      <div style={{ 
        flex: 1, 
        padding: '15px',
        overflow: 'hidden'
      }}>
        {currentPageCoins.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: '20px',
            width: '100%',
            height: '100%',
          }}>
            {currentPageCoins.map((coin) => (
              <div key={coin.symbol} style={{ 
                background: '#111', 
                borderRadius: 8, 
                overflow: 'hidden', 
                boxShadow: '0 0 8px #222', 
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
              }}>
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
                  percentileWindow={appliedPercentileWindow}
                  percentileLevel={appliedPercentileLevel}
                  candleData={candleData}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#888', fontSize: 20, textAlign: 'center', marginTop: '50px' }}>
            Нет данных для графиков
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartView;