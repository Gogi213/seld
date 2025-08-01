// ControlPanel.jsx - панель управления с настройками
import React from 'react';
import { ASCII_ART } from '../utils/constants';

const ControlPanel = ({
  activeTab,
  setActiveTab,
  pinSignalsTop,
  setPinSignalsTop,
  // ...existing code...
  setReloadKey,
  CurrentTimeComponent
}) => {
  // ...existing code...



  return (
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
        {ASCII_ART}
      </pre>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button onClick={() => setActiveTab('alt')} style={{
            padding: '4px 16px',
            fontWeight: 500,
            background: activeTab === 'alt' ? '#e91e63' : '#c2185b',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            boxShadow: activeTab === 'alt' ? '0 0 4px #e91e63' : '0 0 2px #c2185b'
          }}>
            Графики
          </button>
          
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            background: '#222', 
            borderRadius: 6, 
            border: '1px solid #333', 
            padding: '8px 12px', 
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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        padding: '8px 16px', 
        background: '#222', 
        borderRadius: '6px', 
        border: '1px solid #333' 
      }}>
        {/* ...оставшиеся элементы панели... */}
        <button
          style={{
                  padding: '5px 12px',
                  fontWeight: 500,
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  boxShadow: '0 2px 4px rgba(76, 175, 80, 0.3)'
                }}
              >
                Выключить звук
              </button>
            </div>
          </div>
        </div>
        
        {/* Часы справа */}
        {CurrentTimeComponent}
      </div>
    </div>
  );
};

export default ControlPanel;