/**
 * Telegram Bot для отправки торговых сигналов
 */

const https = require('https');

class TelegramBot {
  constructor(options = {}) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.threadId = options.threadId; // Для отправки в конкретную тему группы
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    // Настройки для сигналов
    this.enabledTimeframes = options.enabledTimeframes || ['1m', '5m'];
    this.signalCooldown = options.signalCooldown || 60000; // 1 минута между одинаковыми сигналами
    this.lastSentSignals = new Map(); // symbol_timeframe -> timestamp
    
    this.isEnabled = !!this.botToken;
    
    if (this.isEnabled) {
      console.log(`📱 Telegram bot initialized`);
      if (this.chatId) {
        console.log(`📱 Chat ID: ${this.chatId}${this.threadId ? `, Thread: ${this.threadId}` : ''}`);
      } else {
        console.log('⚠️  Chat ID not set. Use setupChatAndThread() to configure.');
      }
    } else {
      console.log('⚠️ Telegram Bot disabled (missing token)');
    }
  }

  // Отправка сообщения в Telegram
  async sendMessage(text, options = {}) {
    if (!this.isEnabled || !this.chatId) {
      return { success: false, error: 'Bot not enabled or Chat ID not set' };
    }

    const payload = {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    };

    // Добавляем Thread ID если указан
    if (this.threadId) {
      payload.message_thread_id = this.threadId;
    }

    const postData = JSON.stringify(payload);

    return new Promise((resolve) => {
      const requestOptions = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.ok) {
              resolve({ success: true, result: response.result });
            } else {
              console.error('❌ Telegram API error:', response);
              resolve({ success: false, error: response.description });
            }
          } catch (error) {
            console.error('❌ Telegram parse error:', error);
            resolve({ success: false, error: 'Parse error' });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Telegram request error:', error);
        resolve({ success: false, error: error.message });
      });

      req.write(postData);
      req.end();
    });
  }

  // Проверка, нужно ли отправлять сигнал (антиспам)
  shouldSendSignal(symbol, timeframe) {
    const key = `${symbol}_${timeframe}`;
    const lastSent = this.lastSentSignals.get(key);
    const now = Date.now();
    
    if (!lastSent || (now - lastSent) > this.signalCooldown) {
      this.lastSentSignals.set(key, now);
      return true;
    }
    
    return false;
  }

  // Форматирование сигнала для Telegram (очень короткое)
  formatSignal(symbolData, timeframe) {
    const symbol = symbolData.symbol;
    
    // Проверяем, что сигнал активен И НЕ протух
    const hasActiveSignal = symbolData[`percentileSignal_${timeframe}`];
    const hasExpiredSignal = symbolData[`percentileSignalExpired_${timeframe}`];
    
    if (!hasActiveSignal || hasExpiredSignal) {
      return null; // Не отправляем протухшие или неактивные сигналы
    }

    // Убираем USDT из названия символа
    const cleanSymbol = symbol.replace('USDT', '');
    
    // Добавляем NATR и Daily Volume
    const natr = symbolData.natr ? symbolData.natr.toFixed(2) : '0.00';
    const dailyVolumeM = symbolData.dailyVolume ? Math.round(symbolData.dailyVolume / 1000000) : 0;
    
    return `${cleanSymbol} ${timeframe} NATR:${natr} DV:${dailyVolumeM}M`;
  }

  // Отправка одного сигнала
  async sendSignal(symbolData, timeframe) {
    if (!this.enabledTimeframes.includes(timeframe)) {
      return { success: false, error: `Timeframe ${timeframe} not enabled` };
    }

    if (!this.shouldSendSignal(symbolData.symbol, timeframe)) {
      return { success: false, error: 'Signal cooldown active' };
    }

    const message = this.formatSignal(symbolData, timeframe);
    if (!message) {
      return { success: false, error: 'No signal to send' };
    }

    const result = await this.sendMessage(message);
    
    if (result.success) {
      console.log(`📱 Sent ${timeframe} signal for ${symbolData.symbol} to Telegram`);
    } else {
      console.error(`❌ Failed to send ${timeframe} signal for ${symbolData.symbol}:`, result.error);
    }

    return result;
  }

  // Отправка сводки сигналов (очень короткая)
  async sendSignalsSummary(signalsData) {
    if (!this.isEnabled || !this.chatId) {
      return { success: false, error: 'Bot not enabled or Chat ID not set' };
    }

    const active1m = [];
    const active5m = [];

    // Собираем только СВЕЖИЕ активные сигналы (НЕ протухшие)
    for (const [symbol, symbolData] of Object.entries(signalsData)) {
      // 1m сигналы - только активные и НЕ протухшие
      if (symbolData.percentileSignal_1m && !symbolData.percentileSignalExpired_1m) {
        const volumeK = Math.round(symbolData.volume_1m / 1000);
        const change = symbolData.priceChange_1m || 0;
        const changeStr = change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
        const icon = change > 0 ? '📈' : '📉';
        active1m.push(`${icon}${symbol} ${changeStr}% ${volumeK}K`);
      }
      
      // 5m сигналы - только активные и НЕ протухшие
      if (symbolData.percentileSignal_5m && !symbolData.percentileSignalExpired_5m) {
        const volumeK = Math.round(symbolData.volume_1m / 1000);
        const change = symbolData.priceChange_1m || 0;
        const changeStr = change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
        const icon = change > 0 ? '📈' : '📉';
        active5m.push(`${icon}${symbol} ${changeStr}% ${volumeK}K`);
      }
    }

    if (active1m.length === 0 && active5m.length === 0) {
      return { success: false, error: 'No fresh active signals' };
    }

    let message = `🔥 Сигналы: `;
    
    if (active1m.length > 0) {
      message += `1m(${active1m.length}) `;
      if (active1m.length <= 3) {
        message += active1m.join(' ');
      } else {
        message += active1m.slice(0, 3).join(' ') + '...';
      }
    }
    
    if (active5m.length > 0) {
      if (active1m.length > 0) message += ' | ';
      message += `5m(${active5m.length}) `;
      if (active5m.length <= 3) {
        message += active5m.join(' ');
      } else {
        message += active5m.slice(0, 3).join(' ') + '...';
      }
    }

    return await this.sendMessage(message);
  }

  // Тестовое сообщение (очень короткое)
  async sendTestMessage() {
    const message = `🤖 Test OK`;
    return await this.sendMessage(message);
  }

  // Получение информации о чате (для отладки)
  async getChatInfo() {
    if (!this.isEnabled) {
      return { success: false, error: 'Bot not enabled' };
    }

    return new Promise((resolve) => {
      const requestOptions = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.botToken}/getChat?chat_id=${this.chatId}`,
        method: 'GET'
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            resolve({ success: false, error: 'Parse error' });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.end();
    });
  }

  // Настройка чата и темы для группы (без уведомления о подключении)
  async setupChatAndThread(chatId, threadId = null) {
    this.chatId = chatId;
    this.threadId = threadId;
    
    // Проверяем доступ к чату
    const chatInfo = await this.getChatInfo();
    
    if (!chatInfo.ok) {
      console.error('❌ Failed to access chat:', chatInfo.description);
      return { 
        success: false, 
        error: `Cannot access chat ${chatId}: ${chatInfo.description}` 
      };
    }

    const chatType = chatInfo.result.type;
    console.log(`✅ Connected to ${chatType}: ${chatInfo.result.title || chatInfo.result.first_name}`);
    
    if (threadId && (chatType === 'supergroup' || chatType === 'group')) {
      console.log(`🧵 Using thread ID: ${threadId}`);
    }

    return {
      success: true,
      chatType,
      chatTitle: chatInfo.result.title || chatInfo.result.first_name,
      threadId: this.threadId,
      testMessageSent: false // Не отправляем тестовое сообщение
    };
  }

  // Обновление настроек
  updateSettings(settings) {
    if (settings.enabledTimeframes) {
      this.enabledTimeframes = settings.enabledTimeframes;
    }
    if (settings.signalCooldown) {
      this.signalCooldown = settings.signalCooldown;
    }
    if (settings.threadId !== undefined) {
      this.threadId = settings.threadId;
    }
    
    console.log('📱 Telegram bot settings updated:', {
      enabledTimeframes: this.enabledTimeframes,
      signalCooldown: this.signalCooldown,
      threadId: this.threadId
    });
  }

  // Очистка старых записей кулдауна
  cleanupCooldowns() {
    const now = Date.now();
    const cutoff = now - (this.signalCooldown * 2); // Очищаем записи старше 2x кулдауна
    
    for (const [key, timestamp] of this.lastSentSignals.entries()) {
      if (timestamp < cutoff) {
        this.lastSentSignals.delete(key);
      }
    }
  }

  // Получение статистики
  getStats() {
    return {
      isEnabled: this.isEnabled,
      chatId: this.chatId,
      threadId: this.threadId,
      enabledTimeframes: this.enabledTimeframes,
      signalCooldown: this.signalCooldown,
      activeCooldowns: this.lastSentSignals.size
    };
  }
}

module.exports = TelegramBot;
