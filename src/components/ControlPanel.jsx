// ControlPanel.jsx - панель управления с настройками
import React from 'react';
import { ASCII_ART } from '../utils/constants';

const ControlPanel = ({
  activeTab,
  setActiveTab,
  pinSignalsTop,
  setPinSignalsTop,
  setReloadKey,
  soundEnabled,
  setSoundEnabled,
  audioInitialized,
  initializeAudio,
  CurrentTimeComponent
}) => {
  // Определяем, является ли устройство мобильным
  const isMobile = window.innerWidth <= 768;



  return (
    <div style={{ marginBottom: 16, marginTop: 8 }}>
      {!isMobile && (
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
      )}
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 12,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
        gap: isMobile ? '8px' : '0'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? 8 : 24,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          width: isMobile ? '100%' : 'auto'
        }}>
          
          <button onClick={() => setActiveTab('alt')} style={{
            padding: isMobile ? '12px' : '4px 16px',
            fontWeight: 500,
            background: activeTab === 'alt' ? '#e91e63' : '#c2185b',
            color: '#fff',
            border: 'none',
            borderRadius: isMobile ? 6 : 4,
            cursor: 'pointer',
            fontSize: isMobile ? '14px' : '14px',
            boxShadow: activeTab === 'alt' ? '0 0 4px #e91e63' : '0 0 2px #c2185b',
            flex: isMobile ? 1 : 'none',
            minHeight: isMobile ? '44px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            Графики
          </button>
          
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            background: '#222', 
            borderRadius: isMobile ? 6 : 6, 
            border: '1px solid #333', 
            padding: isMobile ? '12px' : '8px 12px', 
            fontSize: isMobile ? 14 : 13, 
            color: '#fff', 
            fontWeight: 500, 
            cursor: 'pointer', 
            userSelect: 'none',
            flex: isMobile ? 1 : 'none',
            justifyContent: isMobile ? 'center' : 'flex-start',
            minHeight: isMobile ? '44px' : 'auto',
            boxSizing: 'border-box'
          }}>
            <input
              type="checkbox"
              checked={pinSignalsTop}
              onChange={e => setPinSignalsTop(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Закрепить
          </label>
          
          {/* Кнопка выключения звука - скрываем на мобильных */}
          {!isMobile && (
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
                <button
                  onClick={() => {
                    if (!audioInitialized) {
                      initializeAudio();
                    }
                    setSoundEnabled(!soundEnabled);
                  }}
                  style={{
                    padding: '5px 12px',
                    fontWeight: 500,
                    background: soundEnabled ? '#f44336' : '#4caf50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: soundEnabled ? '0 2px 4px rgba(244, 67, 54, 0.3)' : '0 2px 4px rgba(76, 175, 80, 0.3)'
                  }}
                >
                  {soundEnabled ? 'Выключить звук' : 'Включить звук'}
                </button>
                {!audioInitialized && (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#ff9800',
                    fontWeight: 500
                  }}>
                    (клик для активации)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Часы - скрываем на мобильных */}
        {!isMobile && CurrentTimeComponent}
      </div>
    </div>
  );
};

export default ControlPanel;