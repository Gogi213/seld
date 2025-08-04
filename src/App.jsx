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
  const [softReload, setSoftReload] = useState(false); // Мягкое обновление без сброса
  
  // Состояние UI с сохранением в localStorage
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('activeTab') || TABS.SIGNALS;
    } catch {
      return TABS.SIGNALS;
    }
  });
  const [pinSignalsTop, setPinSignalsTop] = useState(() => {
    try {
      return localStorage.getItem('pinSignalsTop') === 'true';
    } catch {
      return true;
    }
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Сохраняем состояние в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('activeTab', activeTab);
    } catch (e) {
      console.warn('Не удалось сохранить activeTab:', e);
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('pinSignalsTop', pinSignalsTop.toString());
    } catch (e) {
      console.warn('Не удалось сохранить pinSignalsTop:', e);
    }
  }, [pinSignalsTop]);

  // Обработчик изменения размера окна
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Обработка блокировки/разблокировки экрана
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Страница стала видимой - обновляем данные
        console.log('📱 Страница стала видимой, обновляем данные...');
        setReloadKey(prev => prev + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Также обрабатываем фокус/расфокус окна
    const handleFocus = () => {
      console.log('📱 Окно получило фокус');
      setReloadKey(prev => prev + 1);
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Хуки
  const { soundEnabled, setSoundEnabled, checkForNewSignals } = useSignalSound();
  // Используем дефолтные значения для useWebSocket
  const { signals, loading, candleData, isReconnecting } = useWebSocket(50, 1, reloadKey, checkForNewSignals);
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
      padding: isMobile ? 4 : 8, 
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
        isReconnecting={isReconnecting}
        CurrentTimeComponent={!isMobile ? <CurrentTime /> : null}
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
