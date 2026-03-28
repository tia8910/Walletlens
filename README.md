# Crypto Wallet Tracker

A full-stack web application to track your cryptocurrency portfolio, record buy/sell transactions, monitor real-time prices, and connect exchange accounts.

## Features

- **Portfolio Dashboard** - View total value, P&L, and allocation chart with real-time prices
- **Transaction Tracking** - Record buy/sell transactions with coin search, price, exchange, and notes
- **Market Overview** - Top 50 cryptocurrencies with live prices, 24h changes, and market caps
- **Exchange Connections** - Connect Binance & Coinbase via API keys to sync balances
- **Multiple Wallets** - Organize transactions across different wallets
- **Auto-refresh** - Prices update every 60 seconds via CoinGecko API

## Tech Stack

- **Frontend**: React 18, React Router, Recharts, Vite
- **Backend**: Express.js, better-sqlite3
- **Prices**: CoinGecko free API
- **Exchanges**: Binance & Coinbase REST APIs

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Start both server and client
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/wallets | List wallets |
| POST | /api/wallets | Create wallet |
| GET | /api/transactions | List transactions |
| POST | /api/transactions | Add transaction |
| GET | /api/transactions/portfolio | Get portfolio holdings |
| GET | /api/prices?ids=bitcoin,ethereum | Get real-time prices |
| GET | /api/prices/search?q=bitcoin | Search coins |
| GET | /api/prices/market | Top 50 market data |
| GET | /api/exchanges | List connected exchanges |
| POST | /api/exchanges | Connect exchange |
| POST | /api/exchanges/:id/sync | Sync exchange balances |
