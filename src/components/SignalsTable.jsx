// SignalsTable.jsx - компонент таблицы сигналов
import React, { useState } from 'react';
// Форматирование объёма: 130M, 3.2B
function formatVolume(value) {
  if (value == null) return '';
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (value >= 1_000_000) {
    return Math.round(value / 1_000_000) + 'M';
  }
  return value.toLocaleString();
}
import { TF_LIST, SORT_DIRECTIONS } from '../utils/constants';
import { sortSignals } from '../utils/signalHelpers';

const SignalsTable = ({ signals, loading, pinSignalsTop }) => {
  const [sortKey, setSortKey] = useState('natr30m');
  const [sortDir, setSortDir] = useState(SORT_DIRECTIONS.DESC);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === SORT_DIRECTIONS.ASC ? SORT_DIRECTIONS.DESC : SORT_DIRECTIONS.ASC);
    } else {
      setSortKey(key);
      setSortDir(SORT_DIRECTIONS.DESC);
    }
  };

  const sortedSignals = sortSignals(signals, sortKey, sortDir, pinSignalsTop);

  if (loading) {
    return (
      <div style={{
        background: '#111',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontSize: '16px',
          color: '#1976d2'
        }}>
          Загрузка сигналов...
        </div>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div style={{
        background: '#111',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 0 15px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontSize: '16px',
          color: '#888'
        }}>
          Нет доступных сигналов
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#111',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 0 15px rgba(0,0,0,0.5)',
      border: '1px solid #333'
    }}>
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
                cursor: 'pointer',
                padding: '12px 16px',
                borderBottom: '2px solid #333',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                textAlign: 'left',
                transition: 'background 0.2s ease'
              }} onClick={() => handleSort('symbol')}>
                Symbol
                <span style={{ color: sortKey === 'symbol' ? '#1976d2' : '#aaa', marginLeft: 4 }}>
                  {sortKey === 'symbol' ? (sortDir === SORT_DIRECTIONS.ASC ? '▲' : '▼') : '▲'}
                </span>
              </th>
              <th style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderBottom: '2px solid #333',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                textAlign: 'left',
                transition: 'background 0.2s ease'
              }} onClick={() => handleSort('dailyVolume')}>
                Daily Volume
                <span style={{ color: sortKey === 'dailyVolume' ? '#1976d2' : '#aaa', marginLeft: 4 }}>
                  {sortKey === 'dailyVolume' ? (sortDir === SORT_DIRECTIONS.ASC ? '▲' : '▼') : '▲'}
                </span>
              </th>
              <th style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderBottom: '2px solid #333',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px',
                textAlign: 'left',
                transition: 'background 0.2s ease'
              }} onClick={() => handleSort('natr30m')}>
                NATR (30m)
                <span style={{ color: sortKey === 'natr30m' ? '#1976d2' : '#aaa', marginLeft: 4 }}>
                  {sortKey === 'natr30m' ? (sortDir === SORT_DIRECTIONS.ASC ? '▲' : '▼') : '▲'}
                </span>
              </th>
              
              {TF_LIST.map(tf => (
                <th key={tf} style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  borderBottom: '2px solid #333',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '14px',
                  textAlign: 'center',
                  transition: 'background 0.2s ease'
                }} onClick={() => handleSort(`percentileRank_${tf}`)}>
                  Signal ({tf})
                  <span style={{ color: sortKey === `percentileRank_${tf}` ? '#1976d2' : '#aaa', marginLeft: 4 }}>
                    {sortKey === `percentileRank_${tf}` ? (sortDir === SORT_DIRECTIONS.ASC ? '▲' : '▼') : '▲'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {sortedSignals.map((sig, index) => (
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
                }}>
                  {sig.symbol}
                </td>
                
                <td style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #333',
                  color: '#aaa'
                }}>
                  {formatVolume(sig.dailyVolume)}
                </td>
                
                <td style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #333',
                  color: '#aaa'
                }}>
                  {sig.natr30m?.toFixed(2)}
                </td>
                
                {TF_LIST.map(tf => {
                  const cellState = sig[`cellState_${tf}`];
                  if (!cellState) {
                    return <td key={tf} style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #333',
                      textAlign: 'center'
                    }}></td>;
                  }
                  
                  const cellStyle = {
                    padding: '12px 16px',
                    borderBottom: '1px solid #333',
                    textAlign: 'center',
                    transition: 'all 0.3s ease',
                    ...cellState.style
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
    </div>
  );
};

export default SignalsTable;