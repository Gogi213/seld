// FullScreenChartView.jsx - полноэкранный график
import React from 'react';
import MultiChart from './MultiChart';

const FullScreenChartView = ({
  symbol,
  // ...existing code...
  candleData,
  selectedTimeframe,
  onClose
}) => {
  // Закрытие по двойному клику левой кнопкой мыши
  const handleDoubleClick = (e) => {
    if (e.button === 0) {
      onClose();
    }
  };

  // Можно оставить Escape как дополнительный способ закрытия, если нужно — уберите этот блок
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#000',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Безопасная область для полноэкранного режима
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
        boxSizing: 'border-box'
      }}
      onDoubleClick={handleDoubleClick}
      title="Выйти из полноэкранного режима (двойной клик)"
    >
      {/* Сам график */}
      <MultiChart
        symbol={symbol}
        candleData={candleData}
        selectedTimeframe={selectedTimeframe}
        fullscreenMode={true}
      />
    </div>
  );
};

export default FullScreenChartView;
