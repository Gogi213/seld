// Функция для валидации сигналов
function isValidSignal(signal) {
  return signal && 
         typeof signal === 'object' && 
         signal.symbol && 
         typeof signal.symbol === 'string' &&
         !signal.loading &&
         signal.dailyVolume !== undefined;
}
import { useEffect, useState, useRef } from 'react';
import './App.css';
import LightweightChart from './components/LightweightChart_CDN.jsx';
import MultiChart from './components/MultiChart';
import { VolumeSignalEngine } from './utils/signalEngine';

const tfList = ["1m", "3m", "5m", "15m", "30m"];

function App() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [percentileWindow, setPercentileWindow] = useState(50); // соответствует Pine Script
  const [percentileLevel, setPercentileLevel] = useState(5);
  const [appliedPercentileWindow, setAppliedPercentileWindow] = useState(50); // примененные значения
  const [appliedPercentileLevel, setAppliedPercentileLevel] = useState(5);
  const [sortKey, setSortKey] = useState('natr30m');
  const [sortDir, setSortDir] = useState('desc');
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState('signals'); // signals | alt
  const [currentPage, setCurrentPage] = useState(1); // для пагинации графиков
  const [nextUpdate, setNextUpdate] = useState(60); // секунды до следующего обновления
  const [candles, setCandles] = useState([]);
  const [signalMarkers, setSignalMarkers] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true); // включить/выключить звук
  
  // Функция для воспроизведения звука
  const playSignalSound = () => {
    if (!soundEnabled) return;
    try {
      const audio = new Audio('/sounds/lighter.mp3');
      audio.volume = 0.85; // 85% громкости (было 50%)
      audio.play().catch(e => {
        console.log('Не удалось воспроизвести звук:', e);
      });
    } catch (e) {
      console.log('Ошибка при создании Audio:', e);
    }
  };

  // Обновление сигналов с разной логикой сброса:
  // - если меняется appliedPercentileWindow или appliedPercentileLevel — сбрасываем signals
  // - если только reloadKey (кнопка "Применить") — обновляем без сброса
  const prevParams = useRef({ percentileWindow: appliedPercentileWindow, percentileLevel: appliedPercentileLevel });

  // Основной эффект: реагирует на смену параметров или ручное обновление
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
      // Автоматически определяем адрес WebSocket
      const wsUrl = `ws://${window.location.hostname}:3001`;
      ws = new window.WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ percentileWindow: appliedPercentileWindow, percentileLevel: appliedPercentileLevel }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            // Фильтруем валидные сигналы
            const validSignals = data.filter(isValidSignal);
            if (validSignals.length === 0 && data.length > 0) {
              return; // Игнорируем сообщения с невалидными данными
            }
            
            setSignals(prevSignals => {
              if (paramsChanged) {
                // При смене параметров - просто заменяем все сигналы (без звука)
                return [...validSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
              } else {
                // merge: обновляем только изменившиеся, не трогаем остальные
                const prevMap = new Map(prevSignals.map(s => [s.symbol, s]));
                
                // Проверяем новые активные сигналы для звукового оповещения
                let hasNewActiveSignals = false;
                
                // сортируем по symbol для стабильности
                const sortedData = [...validSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
                // Удаляем отсутствующие, обновляем только изменившиеся, добавляем новые
                const merged = [];
                for (const newSig of sortedData) {
                  const old = prevMap.get(newSig.symbol);
                  
                  // Проверяем новые активные сигналы (не протухшие)
                  if (old) {
                    tfList.forEach(tf => {
                      const oldHasActiveSignal = old[`percentileSignal_${tf}`];
                      const newHasActiveSignal = newSig[`percentileSignal_${tf}`];
                      const newHasExpiredSignal = newSig[`percentileSignalExpired_${tf}`];
                      
                      // Новый активный сигнал появился (и он НЕ протухший)
                      if (!oldHasActiveSignal && newHasActiveSignal && !newHasExpiredSignal) {
                        // Звук только для 5m, 15m, 30m (исключаем 1m и 3m)
                        if (tf !== '1m' && tf !== '3m') {
                          hasNewActiveSignals = true;
                        }
                        console.log(`🐸 Новый АКТИВНЫЙ сигнал: ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%) ${tf === '1m' || tf === '3m' ? '(без звука)' : ''}`);
                      }
                      
                      // Логируем протухшие сигналы отдельно (без звука)
                      const oldHasExpiredSignal = old[`percentileSignalExpired_${tf}`];
                      if (!oldHasExpiredSignal && newHasExpiredSignal) {
                        console.log(`⚠️ Протухший сигнал: ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                      }
                    });
                  } else {
                    // Новая монета с активными сигналами (только если они НЕ протухшие)
                    tfList.forEach(tf => {
                      const hasActiveSignal = newSig[`percentileSignal_${tf}`];
                      const hasExpiredSignal = newSig[`percentileSignalExpired_${tf}`];
                      
                      if (hasActiveSignal && !hasExpiredSignal) {
                        // Звук только для 5m, 15m, 30m (исключаем 1m и 3m)
                        if (tf !== '1m' && tf !== '3m') {
                          hasNewActiveSignals = true;
                        }
                        console.log(`🐸 Новая монета с АКТИВНЫМ сигналом: ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%) ${tf === '1m' || tf === '3m' ? '(без звука)' : ''}`);
                      } else if (hasExpiredSignal) {
                        console.log(`⚠️ Новая монета с протухшим сигналом: ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                      }
                    });
                  }
                  
                  if (old) {
                    // сравниваем только ключевые поля (глубокое сравнение для вложенных)
                    let changed = false;
                    for (const key of Object.keys(newSig)) {
                      if (typeof newSig[key] === 'object' && newSig[key] !== null) {
                        if (JSON.stringify(newSig[key]) !== JSON.stringify(old[key])) { changed = true; break; }
                      } else {
                        if (newSig[key] !== old[key]) { changed = true; break; }
                      }
                    }
                    merged.push(changed ? { ...old, ...newSig } : old);
                  } else {
                    merged.push(newSig);
                  }
                }
                
                // Воспроизводим звук при новых активных сигналах
                if (hasNewActiveSignals && prevSignals.length > 0) { // не играем звук при первой загрузке
                  playSignalSound();
                }
                
                return merged;
              }
            });
          }
        } catch (e) { /* ignore parse errors */ }
        setLoading(false);
      };
      ws.onerror = (e) => {
        setLoading(false);
      };
    } catch (e) {
      setLoading(false);
    }
    prevParams.current = { percentileWindow: appliedPercentileWindow, percentileLevel: appliedPercentileLevel };
    return () => { if (ws) ws.close(); };
  }, [reloadKey, appliedPercentileWindow, appliedPercentileLevel]);

// Убираем монтирование/размонтирование App логи
useEffect(() => {
  // пустой эффект
}, []);

  // Периодическое обновление каждую минуту для текущей конфигурации
  useEffect(() => {
    let intervalId;
    let ws;
    let closed = false;
    function fetchUpdate() {
      // Автоматически определяем адрес WebSocket
      const wsUrl = `ws://${window.location.hostname}:3001`;
      ws = new window.WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ percentileWindow: appliedPercentileWindow, percentileLevel: appliedPercentileLevel }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            // Фильтруем валидные сигналы
            const validSignals = data.filter(isValidSignal);
            if (validSignals.length === 0 && data.length > 0) {
              return; // Игнорируем сообщения с невалидными данными
            }
            
            setSignals(prevSignals => {
              // merge: обновляем только изменившиеся, не трогаем остальные
              const prevMap = new Map(prevSignals.map(s => [s.symbol, s]));
              
              // Проверяем новые активные сигналы для звукового оповещения
              let hasNewActiveSignals = false;
              
              // сортируем по symbol для стабильности
              const sortedData = [...validSignals].sort((a, b) => a.symbol.localeCompare(b.symbol));
              // Удаляем отсутствующие, обновляем только изменившиеся, добавляем новые
              const merged = [];
              for (const newSig of sortedData) {
                const old = prevMap.get(newSig.symbol);
                
                // Проверяем новые активные сигналы (не протухшие)
                if (old) {
                  tfList.forEach(tf => {
                    const oldHasActiveSignal = old[`percentileSignal_${tf}`];
                    const newHasActiveSignal = newSig[`percentileSignal_${tf}`];
                    const newHasExpiredSignal = newSig[`percentileSignalExpired_${tf}`];
                    
                    // Новый активный сигнал появился (и он НЕ протухший)
                    if (!oldHasActiveSignal && newHasActiveSignal && !newHasExpiredSignal) {
                      // В периодическом обновлении НЕ играем звук (только логируем)
                      console.log(`🐸 Новый АКТИВНЫЙ сигнал (периодич, БЕЗ звука): ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                    }
                    
                    // Логируем протухшие сигналы отдельно (без звука)
                    const oldHasExpiredSignal = old[`percentileSignalExpired_${tf}`];
                    if (!oldHasExpiredSignal && newHasExpiredSignal) {
                      console.log(`⚠️ Протухший сигнал (периодич): ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                    }
                  });
                } else {
                  // Новая монета с активными сигналами (только если они НЕ протухшие)
                  tfList.forEach(tf => {
                    const hasActiveSignal = newSig[`percentileSignal_${tf}`];
                    const hasExpiredSignal = newSig[`percentileSignalExpired_${tf}`];
                    
                    if (hasActiveSignal && !hasExpiredSignal) {
                      // В периодическом обновлении НЕ играем звук (только логируем)
                      console.log(`🐸 Новая монета с АКТИВНЫМ сигналом (периодич, БЕЗ звука): ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                    } else if (hasExpiredSignal) {
                      console.log(`⚠️ Новая монета с протухшим сигналом (периодич): ${newSig.symbol} на ${tf} (${newSig[`percentileRank_${tf}`]?.toFixed(1)}%)`);
                    }
                  });
                }
                
                if (old) {
                  let changed = false;
                  for (const key of Object.keys(newSig)) {
                    if (typeof newSig[key] === 'object' && newSig[key] !== null) {
                      if (JSON.stringify(newSig[key]) !== JSON.stringify(old[key])) { changed = true; break; }
                    } else {
                      if (newSig[key] !== old[key]) { changed = true; break; }
                    }
                  }
                  merged.push(changed ? { ...old, ...newSig } : old);
                } else {
                  merged.push(newSig);
                }
              }
              
              // НЕ воспроизводим звук в периодическом обновлении (только в основном)
              // Звук играет только основной useEffect, чтобы избежать дублирования
              
              return merged;
            });
          }
        } catch (e) { /* ignore parse errors */ }
      };
      ws.onerror = (e) => { /* ignore errors */ };
      ws.onclose = () => { /* ignore close */ };
    }
    intervalId = setInterval(() => {
      if (!closed) fetchUpdate();
    }, 60000); // 60 секунд
    // Первый вызов сразу
    fetchUpdate();
    return () => {
      closed = true;
      clearInterval(intervalId);
      if (ws) ws.close();
    };
  }, [appliedPercentileWindow, appliedPercentileLevel]);

  // Комментарий: периодическое обновление теперь происходит каждую минуту

  // Загрузка свечей для первого символа
  useEffect(() => {
    async function fetchCandles(symbol) {
      if (!symbol) return setCandles([]);
      try {
        const interval = '5m';
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=100`);
        const data = await res.json();
        setCandles(
          data.map(k => ({
            time: Math.floor(k[0] / 1000),
            open: +k[1],
            high: +k[2],
            low: +k[3],
            close: +k[4],
            volume: +k[5],
          }))
        );
      } catch {
        setCandles([]);
      }
    }
    if (signals && signals.length > 0 && signals[0].symbol) {
      fetchCandles(signals[0].symbol);
    } else {
      setCandles([]);
    }
  }, [signals]);

  // Вычисление сигналов для последних 50 закрытых свечей
  useEffect(() => {
    if (!candles || candles.length < 51) {
      setSignalMarkers([]);
      return;
    }
    // Используем актуальные параметры (синхронизация с таблицей)
    const engine = new VolumeSignalEngine(appliedPercentileWindow, 50, 50, appliedPercentileLevel);
    const markers = [];
    // Прогоняем по всем свечам, кроме последней (она формируется)
    for (let i = 0; i < candles.length - 1; i++) {
      const bar = candles[i];
      const res = engine.checkSignals(bar.volume);
      // Сигнал только по процентилю
      if (res.percentileSignal) {
        markers.push({
          time: bar.time,
          position: 'aboveBar',
          color: '#38bdf8',
          shape: 'circle',
        });
      }
    }
    // Берём только последние 50 закрытых свечей
    setSignalMarkers(markers.slice(-50));
  }, [candles, appliedPercentileWindow, appliedPercentileLevel]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Отключаем скроллинг на странице графиков
  useEffect(() => {
    if (activeTab === 'alt') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    // Очищаем стили при размонтировании
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [activeTab]);

  // Пагинация для графиков: 9 монет на страницу
  const chartsPerPage = 9;
  const allChartCoins = signals
    .filter(s => s && s.symbol && typeof s.natr30m === 'number')
    .sort((a, b) => {
      // Сначала проверяем наличие жабок (активных или протухших сигналов)
      const hasSignalsA = tfList.some(tf => 
        a[`percentileSignal_${tf}`] || a[`percentileSignalExpired_${tf}`]
      );
      const hasSignalsB = tfList.some(tf => 
        b[`percentileSignal_${tf}`] || b[`percentileSignalExpired_${tf}`]
      );
      
      // Монеты с жабками идут наверх
      if (hasSignalsA && !hasSignalsB) return -1;
      if (!hasSignalsA && hasSignalsB) return 1;
      
      // Если обе монеты в одной группе (с жабками или без), сортируем по NATR по убыванию
      return (b.natr30m || 0) - (a.natr30m || 0);
    });
  
  const totalPages = Math.ceil(allChartCoins.length / chartsPerPage);
  const startIndex = (currentPage - 1) * chartsPerPage;
  const currentPageCoins = allChartCoins.slice(startIndex, startIndex + chartsPerPage);

  // Сброс страницы при смене данных
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Сброс страницы при открытии графиков
  useEffect(() => {
    if (activeTab === 'alt') {
      setCurrentPage(1);
    }
  }, [activeTab]);

  return (
    <div style={{ 
      padding: 8, 
      paddingTop: 0, 
      minHeight: '100vh',
      color: '#fff'
    }}>
      {/* ASCII art and controls */}
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <pre style={{ 
          fontFamily: 'monospace', 
          fontSize: '8px', 
          lineHeight: '8px', 
          color: '#00ff41', 
          textShadow: '0 0 2px #00ff41',
          margin: 0,
          marginBottom: 12,
          background: '#000',
          padding: '8px',
          border: '1px solid #333',
          borderRadius: '4px',
          textAlign: 'center'
        }}>
{`██████╗ ██╗███╗   ██╗ █████╗ ███╗   ██╗ ██████╗███████╗    ███████╗██╗ ██████╗ ███╗   ██╗ █████╗ ██╗     ███████╗
██╔══██╗██║████╗  ██║██╔══██╗████╗  ██║██╔════╝██╔════╝    ██╔════╝██║██╔════╝ ████╗  ██║██╔══██╗██║     ██╔════╝
██████╔╝██║██╔██╗ ██║███████║██╔██╗ ██║██║     █████╗      ███████╗██║██║  ███╗██╔██╗ ██║███████║██║     ███████╗
██╔══██╗██║██║╚██╗██║██╔══██║██║╚██╗██║██║     ██╔══╝      ╚════██║██║██║   ██║██║╚██╗██║██╔══██║██║     ╚════██║
██████╔╝██║██║ ╚████║██║  ██║██║ ╚████║╚██████╗███████╗    ███████║██║╚██████╔╝██║ ╚████║██║  ██║███████╗███████║
╚═════╝ ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝    ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚══════╝`}
        </pre>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 12 }}>
          <button onClick={() => setActiveTab('alt')} style={{
            padding: '4px 16px',
            fontWeight: 500,
            background: activeTab === 'alt' ? '#e91e63' : '#c2185b',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            boxShadow: activeTab === 'alt' ? '0 0 4px #e91e63' : '0 0 2px #c2185b'
          }}>Графики</button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#222', borderRadius: '6px', border: '1px solid #333' }}>
              <label style={{ fontWeight: 500, color: '#ccc', fontSize: '13px' }}>
                Окно:
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={percentileWindow}
                  onChange={e => setPercentileWindow(Number(e.target.value))}
                  style={{ 
                    width: 50, 
                    marginLeft: 6,
                    padding: '3px 6px',
                    background: '#333',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </label>
              <label style={{ fontWeight: 500, color: '#ccc', fontSize: '13px' }}>
                Порог (%):
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percentileLevel}
                  onChange={e => setPercentileLevel(Number(e.target.value))}
                  style={{ 
                    width: 45, 
                    marginLeft: 6,
                    padding: '3px 6px',
                    background: '#333',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </label>
              <button 
                onClick={() => {
                  setAppliedPercentileWindow(percentileWindow);
                  setAppliedPercentileLevel(percentileLevel);
                  setReloadKey(k => k + 1);
                }} 
                style={{ 
                  padding: '5px 12px', 
                  fontWeight: 500,
                  background: '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  boxShadow: '0 2px 4px rgba(25, 118, 210, 0.3)',
                  marginRight: '10px'
                }}
              >
                Применить
              </button>
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)} 
                style={{ 
                  padding: '5px 12px', 
                  fontWeight: 500,
                  background: soundEnabled ? '#4caf50' : '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  boxShadow: `0 2px 4px ${soundEnabled ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`
                }}
              >
                {soundEnabled ? 'Выключить звук' : 'Включить звук'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* TAB CONTENTS */}        {activeTab === 'signals' && (
          <div style={{
            background: '#111',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 0 15px rgba(0,0,0,0.5)',
            border: '1px solid #333'
          }}>
            {loading && (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                fontSize: '16px',
                color: '#1976d2'
              }}>
                Загрузка сигналов...
              </div>
            )}
            {!loading && signals.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                fontSize: '16px',
                color: '#888'
              }}>
                Нет доступных сигналов
              </div>
            )}
            {!loading && signals.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: '#1a1a1a',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}>
                  <thead>
                    <tr style={{ background: '#222' }}>
                      <th style={{
                        cursor:'pointer',
                        padding: '12px 16px',
                        borderBottom: '2px solid #333',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '14px',
                        textAlign: 'left',
                        transition: 'background 0.2s ease'
                      }} onClick={() => handleSort('symbol')}>
                        Symbol
                        <span style={{color: sortKey==='symbol' ? '#1976d2' : '#aaa', marginLeft: 4}}>
                          {sortKey==='symbol' ? (sortDir==='asc' ? '▲' : '▼') : '▲'}
                        </span>
                      </th>
                      <th style={{
                        cursor:'pointer',
                        padding: '12px 16px',
                        borderBottom: '2px solid #333',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '14px',
                        textAlign: 'left',
                        transition: 'background 0.2s ease'
                      }} onClick={() => handleSort('dailyVolume')}>
                        Daily Volume
                        <span style={{color: sortKey==='dailyVolume' ? '#1976d2' : '#aaa', marginLeft: 4}}>
                          {sortKey==='dailyVolume' ? (sortDir==='asc' ? '▲' : '▼') : '▲'}
                        </span>
                      </th>
                      <th style={{
                        cursor:'pointer',
                        padding: '12px 16px',
                        borderBottom: '2px solid #333',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '14px',
                        textAlign: 'left',
                        transition: 'background 0.2s ease'
                      }} onClick={() => handleSort('natr30m')}>
                        NATR (30m)
                        <span style={{color: sortKey==='natr30m' ? '#1976d2' : '#aaa', marginLeft: 4}}>
                          {sortKey==='natr30m' ? (sortDir==='asc' ? '▲' : '▼') : '▲'}
                        </span>
                      </th>
                      {tfList.map(tf => (
                        <th key={tf} style={{
                          cursor:'pointer',
                          padding: '12px 16px',
                          borderBottom: '2px solid #333',
                          color: '#fff',
                          fontWeight: '600',
                          fontSize: '14px',
                          textAlign: 'center',
                          transition: 'background 0.2s ease'
                        }} onClick={() => handleSort(`percentileRank_${tf}`)}>
                          Signal ({tf})
                          <span style={{color: sortKey===`percentileRank_${tf}` ? '#1976d2' : '#aaa', marginLeft: 4}}>
                            {sortKey===`percentileRank_${tf}` ? (sortDir==='asc' ? '▲' : '▼') : '▲'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...signals]
                      .sort((a, b) => {
                        // Сначала проверяем наличие жабок (активных или протухших сигналов)
                        const hasSignalsA = tfList.some(tf => 
                          a[`percentileSignal_${tf}`] || a[`percentileSignalExpired_${tf}`]
                        );
                        const hasSignalsB = tfList.some(tf => 
                          b[`percentileSignal_${tf}`] || b[`percentileSignalExpired_${tf}`]
                        );
                        
                        // Монеты с жабками идут наверх
                        if (hasSignalsA && !hasSignalsB) return -1;
                        if (!hasSignalsA && hasSignalsB) return 1;
                        
                        // Если обе монеты в одной группе (с жабками или без), сортируем по выбранному критерию
                        let vA = a[sortKey];
                        let vB = b[sortKey];
                        
                        // Для symbol сортируем как строки, для остальных — числа
                        if (sortKey === 'symbol') {
                          vA = vA || '';
                          vB = vB || '';
                          if (vA < vB) return sortDir === 'asc' ? -1 : 1;
                          if (vA > vB) return sortDir === 'asc' ? 1 : -1;
                          return 0;
                        } else if (sortKey.startsWith('percentileRank_')) {
                          // Сортируем только монеты с этим сигналом, остальные в конец
                          const hasA = a[sortKey] !== undefined && a[sortKey] !== null;
                          const hasB = b[sortKey] !== undefined && b[sortKey] !== null;
                          if (!hasA && !hasB) return 0;
                          if (!hasA) return 1;
                          if (!hasB) return -1;
                          vA = Number(vA) || 0;
                          vB = Number(vB) || 0;
                          return sortDir === 'asc' ? vA - vB : vB - vA;
                        } else {
                          vA = Number(vA) || 0;
                          vB = Number(vB) || 0;
                          return sortDir === 'asc' ? vA - vB : vB - vA;
                        }
                      })
                      .map((sig, index) => (
                        <tr key={sig.symbol} style={{
                          background: index % 2 === 0 ? '#1a1a1a' : '#222',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.closest('tr').style.background = '#2a2a2a'}
                        onMouseLeave={(e) => e.target.closest('tr').style.background = index % 2 === 0 ? '#1a1a1a' : '#222'}
                        >
                          <td style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #333',
                            color: '#fff',
                            fontWeight: '500',
                            textAlign: 'left'
                          }}>{sig.symbol}</td>
                          <td style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #333',
                            color: '#aaa'
                          }}>{sig.dailyVolume ? Math.round(sig.dailyVolume).toLocaleString() : ''}</td>
                          <td style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #333',
                            color: '#aaa'
                          }}>{sig.natr30m?.toFixed(2)}</td>
                          {tfList.map(tf => {
                            // Получаем состояние ячейки с сервера
                            const cellState = sig[`cellState_${tf}`];
                            if (!cellState) {
                              // Fallback на старую логику, если сервер не передал состояние
                              return <td key={tf} style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid #333',
                                textAlign: 'center'
                              }}></td>;
                            }
                            
                            // Базовый стиль ячейки
                            const cellStyle = {
                              padding: '12px 16px',
                              borderBottom: '1px solid #333',
                              textAlign: 'center',
                              transition: 'all 0.3s ease',
                              ...cellState.style // Применяем стиль с сервера
                            };
                            
                            return (
                              <td key={tf} style={cellStyle}>
                                {(cellState.hasActiveSignal || cellState.hasExpiredSignal) ? (
                                  <span style={{ 
                                    fontSize: '18px', 
                                    lineHeight: '18px',
                                    filter: cellState.hasActiveSignal ? 'drop-shadow(0 0 3px #4ade80)' : 'drop-shadow(0 0 3px #ffc107)',
                                    opacity: cellState.hasExpiredSignal && !cellState.hasActiveSignal ? 0.7 : 1
                                  }} title={cellState.hasActiveSignal ? "Active Signal!" : "Expired Signal"}>
                                    🐸
                                  </span>
                                ) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      {activeTab === 'alt' && (
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
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                style={{
                  background: 'transparent',
                  border: '1px solid #444',
                  color: currentPage <= 1 ? '#666' : '#fff',
                  borderRadius: '3px',
                  width: '28px',
                  height: '28px',
                  fontSize: '12px',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ◀
              </button>
              <span style={{ color: '#aaa', fontSize: '12px' }}>
                Страница {currentPage} из {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                style={{
                  background: 'transparent',
                  border: '1px solid #444',
                  color: currentPage >= totalPages ? '#666' : '#fff',
                  borderRadius: '3px',
                  width: '28px',
                  height: '28px',
                  fontSize: '12px',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ▶
              </button>
            </div>

            {/* Правая часть - кнопка выхода */}
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
                {currentPageCoins.map((coin, idx) => (
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
                      <span>{coin.symbol}</span>
                      <span style={{
                        fontSize: '11px',
                        color: '#aaa',
                        fontWeight: 400
                      }}>
                        nATR: {coin.natr30m?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <MultiChart 
                      symbol={coin.symbol} 
                      percentileWindow={appliedPercentileWindow}
                      percentileLevel={appliedPercentileLevel}
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
      )}
    </div>
  );
}

export default App;
