// backend-modules/webSocketServer.cjs
// Модуль для управления WebSocket сервером и клиентами

const WebSocket = require('ws');
const { WEBSOCKET, SIGNALS, INTERVALS, EMOJIS } = require('./constants.cjs');

class WebSocketServer {
  constructor(dataManager, options = {}) {
    this.dataManager = dataManager;
    this.port = options.port || WEBSOCKET.DEFAULT_PORT;
    this.host = options.host || WEBSOCKET.DEFAULT_HOST;
    
    // WebSocket сервер
    this.wss = null;
    
    // Для каждого клиента храним его настройки
    this.clientSettings = new Map(); // ws -> { percentileWindow, percentileLevel }
    
    // Настройки валидации
    this.validation = SIGNALS.VALIDATION;
    
    // Интервалы обновлений
    this.broadcastInterval = options.broadcastInterval || INTERVALS.BROADCAST;
    this.broadcastTimer = null;
    
    // Типы сообщений
    this.messageTypes = WEBSOCKET.MESSAGE_TYPES;
  }

  /**
   * Запустить WebSocket сервер
   */
  start() {
    console.log(`🚀 Starting WebSocket server on port ${this.port}...`);
    
    this.wss = new WebSocket.Server({ 
      port: this.port, 
      host: this.host 
    });
    
    console.log(`✅ WebSocket server started on ws://${this.host}:${this.port}`);
    
    // Обработка новых подключений
    this.wss.on('connection', (ws) => this._handleConnection(ws));
    
    // Запуск периодической отправки обновлений
    this._startBroadcastTimer();
    
    return this.wss;
  }

  /**
   * Остановить WebSocket сервер
   */
  stop() {
    console.log('🛑 Stopping WebSocket server...');
    
    // Останавливаем таймер
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    
    // Закрываем клиентские соединения
    if (this.wss) {
      this.wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      
      this.wss.close();
      this.wss = null;
    }
    
    // Очищаем настройки клиентов
    this.clientSettings.clear();
    
    console.log('✅ WebSocket server stopped');
  }

  /**
   * Обработка нового подключения
   * @private
   */
  _handleConnection(ws) {
    console.log('🔌 New client connected');
    
    // Устанавливаем дефолтные настройки
    const defaultSettings = this.dataManager.getDefaultSettings();
    this.clientSettings.set(ws, defaultSettings);

    // Отправляем текущие данные новому клиенту
    this._sendInitialData(ws);

    // Обработка сообщений от клиента
    ws.on('message', (msg) => this._handleMessage(ws, msg));

    // Обработка отключения клиента
    ws.on('close', () => this._handleDisconnection(ws));
    
    // Обработка ошибок
    ws.on('error', (error) => this._handleError(ws, error));
  }

  /**
   * Отправить начальные данные новому клиенту
   * @private
   */
  _sendInitialData(ws) {
    try {
      const settings = this.clientSettings.get(ws);
      
      // Если настройки дефолтные и есть предрассчитанные данные - используем их
      if (this.dataManager.isDefaultSettings(settings.percentileWindow, settings.percentileLevel)) {
        const preCalculatedData = this.dataManager.getPreCalculatedData();
        if (preCalculatedData) {
          console.log('⚡ Sending pre-calculated data to new client');
          this._sendToClient(ws, {
            type: 'full_update',
            data: preCalculatedData
          });
          return;
        }
      }
      
      // Иначе рассчитываем на лету
      console.log('🔄 Calculating custom data for new client');
      const data = this.dataManager.generateClientData(settings.percentileWindow, settings.percentileLevel);
      this._sendToClient(ws, {
        type: 'full_update',
        data
      });
      
    } catch (error) {
      console.error('Error sending initial data:', error);
      this._sendError(ws, 'Failed to load initial data');
    }
  }

  /**
   * Обработка сообщений от клиента
   * @private
   */
  async _handleMessage(ws, msg) {
    try {
      const message = JSON.parse(msg);
      
      if (message.type === 'update_settings') {
        await this._handleSettingsUpdate(ws, message.data);
      } else {
        console.warn('Unknown message type:', message.type);
        this._sendError(ws, 'Unknown message type');
      }
      
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      this._sendError(ws, 'Invalid message format');
    }
  }

  /**
   * Обработка обновления настроек
   * @private
   */
  async _handleSettingsUpdate(ws, data) {
    try {
      const defaultSettings = this.dataManager.getDefaultSettings();
      const { 
        percentileWindow = defaultSettings.percentileWindow, 
        percentileLevel = defaultSettings.percentileLevel 
      } = data || {};
      
      // Валидация параметров
      const validWindow = Math.max(
        this.validation.minWindow, 
        Math.min(this.validation.maxWindow, Number(percentileWindow))
      );
      const validLevel = Math.max(
        this.validation.minLevel, 
        Math.min(this.validation.maxLevel, Number(percentileLevel))
      );
      
      // Обновляем настройки клиента
      this.clientSettings.set(ws, {
        percentileWindow: validWindow,
        percentileLevel: validLevel
      });
      
      // Генерируем новые данные с обновленными настройками
      const clientData = this.dataManager.generateClientData(validWindow, validLevel);
      this._sendToClient(ws, {
        type: 'settings_update',
        data: clientData
      });
      
      console.log(`📝 Client settings updated: window=${validWindow}, level=${validLevel}`);
      
    } catch (error) {
      console.error('Error handling settings update:', error);
      this._sendError(ws, 'Failed to update settings');
    }
  }

  /**
   * Обработка отключения клиента
   * @private
   */
  _handleDisconnection(ws) {
    console.log('🔌 Client disconnected');
    this.clientSettings.delete(ws);
  }

  /**
   * Обработка ошибок WebSocket
   * @private
   */
  _handleError(ws, error) {
    console.error('WebSocket error:', error);
    this.clientSettings.delete(ws);
  }

  /**
   * Отправить сообщение клиенту
   * @private
   */
  _sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      // ...
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Отправить ошибку клиенту
   * @private
   */
  _sendError(ws, errorMessage) {
    this._sendToClient(ws, {
      type: 'error',
      message: errorMessage
    });
  }

  /**
   * Отправить обновления всем клиентам
   */
  broadcastToClients() {
    if (!this.wss || this.wss.clients.size === 0) return;
    
    this.wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const settings = this.clientSettings.get(ws) || this.dataManager.getDefaultSettings();
          const clientData = this.dataManager.generateClientData(settings.percentileWindow, settings.percentileLevel);
          
          this._sendToClient(ws, {
            type: 'periodic_update',
            data: clientData
          });
          
        } catch (error) {
          console.error('Error sending periodic update to client:', error);
        }
      }
    });
  }

  /**
   * Отправить обновление для конкретного символа
   */
  broadcastSymbolUpdate(symbol) {
    if (!this.wss || this.wss.clients.size === 0) return;
    
    this.wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const settings = this.clientSettings.get(ws) || this.dataManager.getDefaultSettings();
          const symbolData = this.dataManager.generateSymbolData(
            symbol, 
            settings.percentileWindow, 
            settings.percentileLevel
          );
          
          if (symbolData) {
            this._sendToClient(ws, {
              type: 'symbol_update',
              symbol,
              data: symbolData
            });
          }
          
        } catch (error) {
          console.error('Error sending symbol update:', error);
        }
      }
    });
  }

  /**
   * Запустить таймер периодических обновлений
   * @private
   */
  _startBroadcastTimer() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
    }
    
    this.broadcastTimer = setInterval(() => {
      if (this.wss && this.wss.clients.size > 0) {
        this.broadcastToClients();
      }
    }, this.broadcastInterval);
    
    console.log(`⏰ Broadcast timer started (interval: ${this.broadcastInterval}ms)`);
  }

  /**
   * Получить статистику сервера
   */
  getStats() {
    return {
      isRunning: !!this.wss,
      clientsCount: this.wss ? this.wss.clients.size : 0,
      port: this.port,
      host: this.host,
      broadcastInterval: this.broadcastInterval,
      clientSettings: Array.from(this.clientSettings.values())
    };
  }

  /**
   * Получить количество подключенных клиентов
   */
  getClientsCount() {
    return this.wss ? this.wss.clients.size : 0;
  }

  /**
   * Проверить, запущен ли сервер
   */
  isRunning() {
    return !!this.wss;
  }
}

module.exports = WebSocketServer;