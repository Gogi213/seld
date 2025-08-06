// useSignalSound.js - хук для управления звуковыми уведомлениями
import { useState, useCallback, useRef, useEffect } from 'react';

const tfList = ["1m", "5m", "15m", "30m", "1h"];

export const useSignalSound = () => {
  // Инициализируем soundEnabled из localStorage
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('soundEnabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [audioInitialized, setAudioInitialized] = useState(false);
  const audioRef = useRef(null);
  
  // Сохраняем состояние soundEnabled в localStorage при изменении
  useEffect(() => {
    try {
      localStorage.setItem('soundEnabled', JSON.stringify(soundEnabled));
    } catch (e) {
      console.warn('Не удалось сохранить состояние звука:', e);
    }
  }, [soundEnabled]);
  
  // Система предотвращения дребезга
  const lastSoundTime = useRef(new Map()); // symbol+tf -> timestamp
  const recentSignals = useRef(new Map()); // symbol+tf -> { count, firstTime }
  const DEBOUNCE_TIME = 30000; // 30 секунд между звуками для одного символа+таймфрейма
  const ANTI_BOUNCE_TIME = 120000; // 2 минуты для отслеживания дребезга
  const MAX_BOUNCES = 3; // максимум 3 срабатывания за период

  // Инициализация аудио при первом взаимодействии
  const initializeAudio = useCallback(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio('/sounds/lighter.mp3');
        audioRef.current.volume = 1.0;
        audioRef.current.preload = 'auto';
        
        // Пытаемся проиграть и сразу же поставить на паузу для инициализации
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setAudioInitialized(true);
          console.log('🔊 Аудио инициализировано');
        }).catch(e => {
          console.log('Аудио будет инициализировано при первом клике:', e.message);
        });
      } catch (e) {
        console.log('Ошибка при создании Audio:', e);
      }
    }
  }, []);

  const playSignalSound = useCallback(() => {
    if (!soundEnabled) {
      console.log('🔇 Звук отключен, не воспроизводим');
      return;
    }
    
    if (!audioRef.current) {
      initializeAudio();
      return;
    }
    
    try {
      // Сбрасываем позицию и играем
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => {
        console.log('Не удалось воспроизвести звук:', e.message);
        if (e.name === 'NotAllowedError' && !audioInitialized) {
          console.log('💡 Кликните в любом месте страницы для активации звука');
        }
      });
      console.log('🔊 Воспроизводим звук сигнала');
    } catch (e) {
      console.log('Ошибка при воспроизведении:', e);
    }
  }, [soundEnabled, audioInitialized, initializeAudio]);

  const checkForNewSignals = useCallback((oldSignal, newSignal, playSound = false) => {
    let hasNewActiveSignals = false;
    const now = Date.now();
    
    if (oldSignal) {
      tfList.forEach(tf => {
        const oldHasActiveSignal = oldSignal[`percentileSignal_${tf}`];
        const newHasActiveSignal = newSignal[`percentileSignal_${tf}`];
        const newHasExpiredSignal = newSignal[`percentileSignalExpired_${tf}`];
        
        if (!oldHasActiveSignal && newHasActiveSignal && !newHasExpiredSignal) {
          const signalKey = `${newSignal.symbol}_${tf}`;
          
          if (tf !== '1m') {
            // Проверяем дребезг
            const shouldPlaySound = checkAntiBouncingLogic(signalKey, now);
            
            if (shouldPlaySound) {
              hasNewActiveSignals = true;
              console.log(`🐸 Новый АКТИВНЫЙ сигнал: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
            } else {
              console.log(`🔇 Сигнал заблокирован (дребезг): ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
            }
          } else {
            console.log(`🐸 Новый АКТИВНЫЙ сигнал: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%) (без звука)`);
          }
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
          const signalKey = `${newSignal.symbol}_${tf}`;
          
          if (tf !== '1m') {
            // Проверяем дребезг для новых символов
            const shouldPlaySound = checkAntiBouncingLogic(signalKey, now);
            
            if (shouldPlaySound) {
              hasNewActiveSignals = true;
              console.log(`🐸 Новая монета с АКТИВНЫМ сигналом: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
            } else {
              console.log(`🔇 Новая монета заблокирована (дребезг): ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%)`);
            }
          } else {
            console.log(`🐸 Новая монета с АКТИВНЫМ сигналом: ${newSignal.symbol} на ${tf} (${newSignal[`percentileRank_${tf}`]?.toFixed(1)}%) (без звука)`);
          }
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

  // Функция проверки анти-дребезга
  const checkAntiBouncingLogic = useCallback((signalKey, now) => {
    // Проверяем последний раз когда играл звук для этого сигнала
    const lastSound = lastSoundTime.current.get(signalKey);
    if (lastSound && (now - lastSound) < DEBOUNCE_TIME) {
      return false; // Слишком рано для повторного звука
    }
    
    // Проверяем дребезг - частые появления/исчезновения сигнала
    const recentData = recentSignals.current.get(signalKey);
    if (recentData) {
      // Если прошло много времени с первого сигнала, сбрасываем счетчик
      if ((now - recentData.firstTime) > ANTI_BOUNCE_TIME) {
        recentSignals.current.set(signalKey, { count: 1, firstTime: now });
      } else {
        // Увеличиваем счетчик
        recentData.count++;
        if (recentData.count > MAX_BOUNCES) {
          console.log(`🚫 Дребезг обнаружен для ${signalKey}: ${recentData.count} срабатываний за ${Math.round((now - recentData.firstTime) / 1000)}с`);
          return false; // Блокируем из-за дребезга
        }
      }
    } else {
      recentSignals.current.set(signalKey, { count: 1, firstTime: now });
    }
    
    // Обновляем время последнего звука
    lastSoundTime.current.set(signalKey, now);
    return true;
  }, []);

  return {
    soundEnabled,
    setSoundEnabled,
    playSignalSound,
    checkForNewSignals,
    audioInitialized,
    initializeAudio
  };
};