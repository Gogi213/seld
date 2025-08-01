import React, { useState, useEffect } from 'react';
import './App.css';

// Импорт компонентов
import CurrentTime from './components/CurrentTime';
import ControlPanel from './components/ControlPanel';
import SignalsTable from './components/SignalsTable';
import ChartView from './components/ChartView';

// Импорт хуков
import { useWebSocket } from './hooks/useWebSocket';
import { useSignalSound } from './hooks/useSignalSound';
import { usePagination } from './hooks/usePagination';

// Импорт утилит и констант
import { DEFAULT_SETTINGS, TABS } from './utils/constants';

function App() {
  // Состояние настроек
  const [reloadKey, setReloadKey] = useState(0);
  
  // Состояние UI
  const [activeTab, setActiveTab] = useState(TABS.SIGNALS);
  const [pinSignalsTop, setPinSignalsTop] = useState(true);

  // Хуки
  const { soundEnabled, setSoundEnabled, checkForNewSignals } = useSignalSound();
  // Используем дефолтные значения для useWebSocket
  const { signals, loading, candleData } = useWebSocket(50, 1, reloadKey, checkForNewSignals);
  const pagination = usePagination(signals, pinSignalsTop, DEFAULT_SETTINGS.CHARTS_PER_PAGE);

  // Сброс страницы только при смене вкладки на графики
  const prevTab = React.useRef(activeTab);
  useEffect(() => {
    if (
      (activeTab === TABS.CHARTS || activeTab === 'alt') &&
      prevTab.current !== activeTab
    ) {
      pagination.resetToFirstPage();
    }
    prevTab.current = activeTab;
  }, [activeTab]);

  return (
    <div style={{ 
      padding: 8, 
      paddingTop: 0, 
      minHeight: '100vh',
      color: '#fff'
    }}>
      {/* Панель управления */}
      <ControlPanel
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pinSignalsTop={pinSignalsTop}
        setPinSignalsTop={setPinSignalsTop}
        setReloadKey={setReloadKey}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        CurrentTimeComponent={<CurrentTime />}
      />

      {/* Контент вкладок */}
      {activeTab === TABS.SIGNALS && (
        <SignalsTable
          signals={signals}
          loading={loading}
          pinSignalsTop={pinSignalsTop}
        />
      )}

      {(activeTab === TABS.CHARTS || activeTab === 'alt') && (
        <ChartView
          currentPageCoins={pagination.currentPageCoins}
          candleData={candleData}
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          goToNextPage={pagination.goToNextPage}
          goToPrevPage={pagination.goToPrevPage}
          canGoNext={pagination.canGoNext}
          canGoPrev={pagination.canGoPrev}
          pinSignalsTop={pinSignalsTop}
          setPinSignalsTop={setPinSignalsTop}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}

export default App;
