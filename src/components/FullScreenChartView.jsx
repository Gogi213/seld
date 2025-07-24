// FullScreenChartView.jsx - полноэкранный график
import React from 'react';
import MultiChart from './MultiChart';

const FullScreenChartView = ({
  symbol,
  percentileWindow,
  percentileLevel,
  candleData,
  selectedTimeframe,
  onClose
}) => {
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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: '#000',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Сам график */}
      <MultiChart
        symbol={symbol}
        percentileWindow={percentileWindow}
        percentileLevel={percentileLevel}
        candleData={candleData}
        selectedTimeframe={selectedTimeframe}
      />
    </div>
  );
};

export default FullScreenChartView;
