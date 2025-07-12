// useWebSocket.js - хук для управления WebSocket соединением
import { useEffect, useState, useRef, useCallback } from 'react';

export const useWebSocket = (appliedPercentileWindow, appliedPercentileLevel, reloadKey) => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [candleData, setCandleData] = useState({});
  
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
        merged.push(changed ? { ...old, ...newSig } : old);
      } else {
        merged.push(newSig);
      }
    }
    
    return merged;
  }, []);

  useEffect(() => {
    let ws;
    setLoading(true);
    
    const paramsChanged =
      prevParams.current.percentileWindow !== appliedPercentileWindow ||
      prevParams.current.percentileLevel !== appliedPercentileLevel;
      
    if (paramsChanged) {
      setSignals([]);
    }
    
    try {
      const wsUrl = `ws://${window.location.hostname}:3001`;
      ws = new window.WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('🔌 WebSocket connected');
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
            
            setSignals(prevSignals => {
              if (paramsChanged || message.type === 'settings_update') {
                return [...validSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
              } else {
                return processSignalUpdates(prevSignals, validSignals, true);
              }
            });
            
            setLoading(false);
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
            
            setSignals(prevSignals => processSignalUpdates(prevSignals, validSignals, false));
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
                if (index >= 0) {
                  updated[index] = symbolData;
                } else {
                  updated.push(symbolData);
                }
                return updated.sort((a, b) => a.symbol.localeCompare(b.symbol));
              });
            }
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setLoading(false);
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setLoading(false);
      };
      
    } catch (e) {
      console.error('Error creating WebSocket:', e);
      setLoading(false);
    }
    
    prevParams.current = { 
      percentileWindow: appliedPercentileWindow, 
      percentileLevel: appliedPercentileLevel 
    };
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [reloadKey, appliedPercentileWindow, appliedPercentileLevel, processSignalUpdates]);

  return {
    signals,
    loading,
    candleData
  };
};