// useWebSocket.js - хук для управления WebSocket соединением
import { useEffect, useState, useRef, useCallback } from 'react';

export const useWebSocket = (appliedPercentileWindow, appliedPercentileLevel, reloadKey, checkForNewSignals) => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [candleData, setCandleData] = useState({});
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectTimeout = useRef(null);
  const wsRef = useRef(null);
  const initialLoad = useRef(true); // Отслеживаем первую загрузку
  
  const prevParams = useRef({ 
    percentileWindow: appliedPercentileWindow, 
    percentileLevel: appliedPercentileLevel 
  });

  const processSignalUpdates = useCallback((prevSignals, newSignals, playSound = false) => {
    const prevMap = new Map(prevSignals.map(s => [s.symbol, s]));
    const sortedData = [...newSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
    const merged = [];
    
    for (const newSig of sortedData) {
      const old = prevMap.get(newSig.symbol);
      
      if (old) {
        let changed = false;
        for (const key of Object.keys(newSig)) {
          if (typeof newSig[key] === 'object' && newSig[key] !== null) {
            if (JSON.stringify(newSig[key]) !== JSON.stringify(old[key])) {
              changed = true;
              break;
            }
          } else {
            if (newSig[key] !== old[key]) {
              changed = true;
              break;
            }
          }
        }
        
        const updatedSignal = changed ? { ...old, ...newSig } : old;
        merged.push(updatedSignal);
        
        // Проверяем новые сигналы для звука
        if (changed && checkForNewSignals && playSound) {
          checkForNewSignals(old, updatedSignal, true);
        }
      } else {
        merged.push(newSig);
        
        // Проверяем новые символы для звука
        if (checkForNewSignals && playSound) {
          checkForNewSignals(null, newSig, true);
        }
      }
    }
    
    return merged;
  }, [checkForNewSignals]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Уже подключен
    }

    try {
      const wsUrl = `ws://${window.location.hostname}:3001`;
      const ws = new window.WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        setReconnectAttempts(0);
        setIsReconnecting(false);
        
        const paramsChanged =
          prevParams.current.percentileWindow !== appliedPercentileWindow ||
          prevParams.current.percentileLevel !== appliedPercentileLevel;
          
        if (paramsChanged) {
          ws.send(JSON.stringify({
            type: 'update_settings',
            data: {
              percentileWindow: appliedPercentileWindow,
              percentileLevel: appliedPercentileLevel
            }
          }));
        }
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket disconnected:', event.reason);
        wsRef.current = null;
        setIsReconnecting(true);
        
        // Переподключение с экспоненциальной задержкой
        if (reconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`🔄 Переподключение через ${delay}ms (попытка ${reconnectAttempts + 1})`);
          
          reconnectTimeout.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        } else {
          console.error('🚫 Максимальное количество попыток переподключения достигнуто');
          setIsReconnecting(false);
          // НЕ сбрасываем loading, если у нас уже есть данные
          if (initialLoad.current) {
            setLoading(false);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'full_update' || message.type === 'settings_update') {
            const validSignals = message.data.signals.filter(signal => 
              signal && 
              typeof signal === 'object' && 
              signal.symbol && 
              typeof signal.symbol === 'string' &&
              !signal.loading &&
              signal.dailyVolume !== undefined
            );
            
            if (message.data.candles) {
              setCandleData(message.data.candles);
            }
            
            const paramsChanged =
              prevParams.current.percentileWindow !== appliedPercentileWindow ||
              prevParams.current.percentileLevel !== appliedPercentileLevel;
            
            setSignals(prevSignals => {
              if (paramsChanged || message.type === 'settings_update') {
                return [...validSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
              } else {
                return processSignalUpdates(prevSignals, validSignals, false);
              }
            });
            
            // Выключаем loading только при первой загрузке или смене параметров
            if (initialLoad.current || paramsChanged || message.type === 'settings_update') {
              setLoading(false);
              initialLoad.current = false;
            }
          } else if (message.type === 'periodic_update') {
            const validSignals = message.data.signals.filter(signal => 
              signal && 
              typeof signal === 'object' && 
              signal.symbol && 
              typeof signal.symbol === 'string' &&
              !signal.loading &&
              signal.dailyVolume !== undefined
            );
            
            if (message.data.candles) {
              setCandleData(message.data.candles);
            }
            
            setSignals(prevSignals => processSignalUpdates(prevSignals, validSignals, true));
          } else if (message.type === 'symbol_update') {
            const symbolData = message.data.signal;
            
            if (message.data.candles) {
              setCandleData(prev => ({
                ...prev,
                [message.symbol]: message.data.candles
              }));
            }
            
            if (symbolData && 
                typeof symbolData === 'object' && 
                symbolData.symbol && 
                typeof symbolData.symbol === 'string' &&
                !symbolData.loading &&
                symbolData.dailyVolume !== undefined) {
              setSignals(prevSignals => {
                const updated = [...prevSignals];
                const index = updated.findIndex(s => s.symbol === symbolData.symbol);
                const oldSignal = index >= 0 ? updated[index] : null;
                
                if (index >= 0) {
                  updated[index] = { ...updated[index], ...symbolData };
                } else {
                  updated.push(symbolData);
                  updated.sort((a, b) => a.symbol.localeCompare(b.symbol));
                }
                
                if (checkForNewSignals) {
                  checkForNewSignals(oldSignal, symbolData, true);
                }
                
                return updated;
              });
            }
          }
        } catch (error) {
          console.error('❌ Ошибка парсинга WebSocket сообщения:', error);
        }
      };
      
    } catch (error) {
      console.error('❌ Ошибка создания WebSocket:', error);
      setLoading(false);
    }
  }, [appliedPercentileWindow, appliedPercentileLevel, processSignalUpdates, checkForNewSignals, reconnectAttempts]);

  useEffect(() => {
    // Проверяем, изменились ли параметры
    const paramsChanged =
      prevParams.current.percentileWindow !== appliedPercentileWindow ||
      prevParams.current.percentileLevel !== appliedPercentileLevel;
    
    // Сбрасываем loading только если это первая загрузка или изменились параметры
    if (initialLoad.current || paramsChanged) {
      setLoading(true);
    }
    
    // Очищаем сигналы только если изменились параметры
    if (paramsChanged) {
      setSignals([]);
    }
    
    // Очищаем предыдущий таймаут
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    
    connectWebSocket();
    
    // Обновляем предыдущие параметры
    prevParams.current = {
      percentileWindow: appliedPercentileWindow,
      percentileLevel: appliedPercentileLevel
    };
    
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [reloadKey, appliedPercentileWindow, appliedPercentileLevel, connectWebSocket]);

  return {
    signals,
    loading,
    candleData,
    isReconnecting
  };
};