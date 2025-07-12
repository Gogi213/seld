// useSignalSound.js - хук для управления звуковыми уведомлениями
import { useState, useCallback } from 'react';

const tfList = ["1m", "5m", "15m", "30m", "1h"];

export const useSignalSound = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);

  const playSignalSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audio = new Audio('/sounds/lighter.mp3');
      audio.volume = 0.85;
      audio.play().catch(e => {
        console.log('Не удалось воспроизвести звук:', e);
      });
    } catch (e) {
      console.log('Ошибка при создании Audio:', e);
    }
  }, [soundEnabled]);

  const checkForNewSignals = useCallback((oldSignal, newSignal, playSound = false) => {
    let hasNewActiveSignals = false;
    
    if (oldSignal) {
      tfList.forEach(tf => {
        const oldHasActiveSignal = oldSignal[`percentileSignal_${tf}`];
        const newHasActiveSignal = newSignal[`percentileSignal_${tf}`];
        const newHasExpiredSignal = newSignal[`percentileSignalExpired_${tf}`];
        
        if (!oldHasActiveSignal && newHasActiveSignal && !newHasExpiredSignal) {
          if (tf !== '1m') {
            hasNewActiveSignals = true;
          }
          console.log(`🐸 Новый АКТИВНЫЙ сигнал: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%) ${tf === '1m' ? '(без звука)' : ''}`);
        }
        
        const oldHasExpiredSignal = oldSignal[`percentileSignalExpired_${tf}`];
        if (!oldHasExpiredSignal && newHasExpiredSignal) {
          console.log(`⚠️ Протухший сигнал: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
        }
      });
    } else {
      tfList.forEach(tf => {
        const hasActiveSignal = newSignal[`percentileSignal_${tf}`];
        const hasExpiredSignal = newSignal[`percentileSignalExpired_${tf}`];
        
        if (hasActiveSignal && !hasExpiredSignal) {
          if (tf !== '1m') {
            hasNewActiveSignals = true;
          }
          console.log(`🐸 Новая монета с АКТИВНЫМ сигналом: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%) ${tf === '1m' ? '(без звука)' : ''}`);
        } else if (hasExpiredSignal) {
          console.log(`⚠️ Новая монета с протухшим сигналом: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
        }
      });
    }
    
    if (hasNewActiveSignals && playSound) {
      playSignalSound();
    }
    
    return hasNewActiveSignals;
  }, [playSignalSound]);

  return {
    soundEnabled,
    setSoundEnabled,
    playSignalSound,
    checkForNewSignals
  };
};