// binanceWebSocket.cjs
// Модуль для управления WebSocket подписками на Binance

const WebSocket = require('ws');
const EventEmitter = require('events');

class BinanceWebSocketManager extends EventEmitter {
  constructor(candleAggregator) {
    super();
    this.candleAggregator = candleAggregator;
    this.connections = new Map(); // symbol -> WebSocket connection
    this.reconnectAttempts = new Map(); // symbol -> attempt count
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // начальная задержка в мс
    this.activeSymbols = new Set();
  }

  // Подписаться на klines для символа
  subscribeToSymbol(symbol) {
    if (this.connections.has(symbol)) {
      console.log(`Already subscribed to ${symbol}`);
      return;
    }

    this.activeSymbols.add(symbol);
    this.createConnection(symbol);
  }

  // Отписаться от символа
  unsubscribeFromSymbol(symbol) {
    this.activeSymbols.delete(symbol);
    
    if (this.connections.has(symbol)) {
      const ws = this.connections.get(symbol);
      ws.close();
      this.connections.delete(symbol);
      this.reconnectAttempts.delete(symbol);
    }
  }

  // Создать WebSocket соединение для символа
  createConnection(symbol) {
    const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_1m`;
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        console.log(`✅ WebSocket connected for ${symbol}`);
        this.connections.set(symbol, ws);
        this.reconnectAttempts.delete(symbol);
        
        this.emit('connection_status', symbol, 'connected');
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleKlineMessage(symbol, message);
        } catch (error) {
          console.error(`Error parsing message for ${symbol}:`, error);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`❌ WebSocket closed for ${symbol}, code: ${code}, reason: ${reason}`);
        this.connections.delete(symbol);
        
        this.emit('connection_status', symbol, 'disconnected');

        // Переподключение если символ все еще активен
        if (this.activeSymbols.has(symbol)) {
          this.scheduleReconnect(symbol);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${symbol}:`, error);
        
        this.emit('connection_status', symbol, 'error', error);
      });

      // Ping для поддержания соединения
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // каждые 30 секунд

    } catch (error) {
      console.error(`Failed to create WebSocket for ${symbol}:`, error);
      this.scheduleReconnect(symbol);
    }
  }

  // Обработка сообщения kline
  handleKlineMessage(symbol, message) {
    if (!message.k) return;
    
    const kline = message.k;
    
    // Преобразуем в формат свечи
    const candle = {
      openTime: kline.t,
      closeTime: kline.T,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v),
      quoteVolume: parseFloat(kline.q),
      trades: kline.n,
      isComplete: kline.x // true если свеча закрыта
    };

    // Добавляем в агрегатор
    this.candleAggregator.addMinuteCandle(symbol, candle);

    // Уведомляем о новой свече через EventEmitter
    this.emit('kline', symbol, kline);
  }

  // Запланировать переподключение
  scheduleReconnect(symbol) {
    const attempts = this.reconnectAttempts.get(symbol) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnect attempts reached for ${symbol}`);
      this.activeSymbols.delete(symbol);
      return;
    }

    this.reconnectAttempts.set(symbol, attempts + 1);
    
    // Экспоненциальная задержка
    const delay = this.reconnectDelay * Math.pow(2, attempts);
    
    console.log(`Scheduling reconnect for ${symbol} in ${delay}ms (attempt ${attempts + 1})`);
    
    setTimeout(() => {
      if (this.activeSymbols.has(symbol)) {
        this.createConnection(symbol);
      }
    }, delay);
  }

  // Массовая подписка на символы
  subscribeToSymbols(symbols) {
    console.log(`Subscribing to ${symbols.length} symbols:`, symbols.slice(0, 5).join(', '), symbols.length > 5 ? '...' : '');
    
    // Подписываемся с небольшой задержкой между соединениями
    symbols.forEach((symbol, index) => {
      setTimeout(() => {
        this.subscribeToSymbol(symbol);
      }, index * 100); // 100мс между подписками
    });
  }

  // Отписаться от всех символов
  unsubscribeAll() {
    console.log('Unsubscribing from all symbols...');
    
    for (const symbol of this.activeSymbols) {
      this.unsubscribeFromSymbol(symbol);
    }
    
    this.activeSymbols.clear();
    this.connections.clear();
    this.reconnectAttempts.clear();
  }

  // Получить статус соединений
  getConnectionStatus() {
    const status = {
      total: this.activeSymbols.size,
      connected: 0,
      connecting: 0,
      disconnected: 0,
      symbols: {}
    };

    for (const symbol of this.activeSymbols) {
      const ws = this.connections.get(symbol);
      let state = 'disconnected';
      
      if (ws) {
        switch (ws.readyState) {
          case WebSocket.CONNECTING:
            state = 'connecting';
            status.connecting++;
            break;
          case WebSocket.OPEN:
            state = 'connected';
            status.connected++;
            break;
          case WebSocket.CLOSING:
          case WebSocket.CLOSED:
            state = 'disconnected';
            status.disconnected++;
            break;
        }
      } else {
        status.disconnected++;
      }
      
      status.symbols[symbol] = {
        state,
        reconnectAttempts: this.reconnectAttempts.get(symbol) || 0
      };
    }

    return status;
  }

  // Методы колбэков удалены - используем EventEmitter

  // Переподключить все соединения
  reconnectAll() {
    console.log('Reconnecting all WebSocket connections...');
    
    const symbolsToReconnect = Array.from(this.activeSymbols);
    
    // Закрываем все существующие соединения
    for (const ws of this.connections.values()) {
      ws.close();
    }
    
    this.connections.clear();
    this.reconnectAttempts.clear();
    
    // Переподключаемся
    this.subscribeToSymbols(symbolsToReconnect);
  }

  // Очистка ресурсов
  destroy() {
    console.log('Destroying BinanceWebSocketManager...');
    this.unsubscribeAll();
    this.removeAllListeners();
  }
  
  // Добавляем метод close для совместимости с backend.cjs
  close() {
    this.destroy();
  }
}

module.exports = BinanceWebSocketManager;