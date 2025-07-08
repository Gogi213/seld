
# Seld: Electron-приложение для сигналов Binance Futures

## Описание
Приложение собирает сигналы по объёму с Binance Futures (Node.js backend), рассчитывает сигналы по SMA и процентилю, фильтрует монеты по объёму от 20 млн, отображает сигналы на фронтенде (React).

## Запуск в режиме разработки
1. Откройте два терминала:
   - В первом: `npm run dev` (запуск Vite)
   - Во втором: `npm start` (запуск Electron)
2. Для сбора сигналов backend: `node backend.js`

## Структура
- `main.js` — точка входа Electron
- `backend.js` — сбор сигналов с Binance
- `binanceFutures.js` — WebSocket Binance
- `signalEngine.js` — расчёт сигналов
- `src/` — фронтенд (React)

## TODO
- Интеграция backend с фронтендом (через IPC или WebSocket)
- UI для отображения сигналов
- Алерты
