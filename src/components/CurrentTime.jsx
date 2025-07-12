// CurrentTime.jsx - компонент отображения текущего времени
import React, { useEffect, useState } from 'react';

const CurrentTime = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      color: '#00ff41',
      fontFamily: 'monospace',
      fontSize: '16px',
      fontWeight: 'bold',
      textShadow: '0 0 3px #00ff41',
      padding: '8px 16px',
      background: '#000',
      border: '1px solid #333',
      borderRadius: '6px',
      minWidth: '90px',
      textAlign: 'center'
    }}>
      {time.toLocaleTimeString('ru-RU', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}
    </div>
  );
};

export default CurrentTime;