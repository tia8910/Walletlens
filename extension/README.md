# WalletLens Portfolio Browser Extension

A Manifest V3 browser extension for [WalletLens](https://walletlens.live) that shows your crypto portfolio summary — total value, 24h change, and top holdings — directly from the browser toolbar. It syncs your portfolio data from the WalletLens app and works even when the WalletLens tab is closed.

---

## How to Install

### Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository
5. The WalletLens icon will appear in your toolbar

### Firefox
1. Open `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on…**
4. Navigate to the `extension/` folder and select `manifest.json`
5. The extension loads until Firefox is restarted (for a permanent install, the extension must be signed via AMO)

### Edge
1. Open `edge://extensions/`
2. Enable **Developer mode** (toggle in the left sidebar)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository

---

## How It Works

1. **Content script** (`content.js`) — injected into every `walletlens.live` page. It reads your portfolio data from the site's `localStorage` and sends it to the background service worker. It also listens for changes and re-syncs automatically.

2. **Background service worker** (`background.js`) — receives the portfolio data and persists it to `chrome.storage.local`, so the popup can display your data even after the WalletLens tab is closed. A periodic alarm (every 5 minutes) triggers a fresh sync if the site is open.

3. **Popup** (`popup.html` / `popup.js`) — loads cached data, computes your net holdings from transaction history, fetches live USD prices from the CoinGecko free API, and renders your total portfolio value, 24h change, and top 3 holdings. Prices are cached for 2 minutes to avoid excessive API calls.

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save portfolio data locally so the popup works without an open tab |
| `alarms` | Trigger periodic re-syncs every 5 minutes |
| `https://walletlens.live/*` | Read portfolio data from localStorage on the WalletLens site |
| `https://api.coingecko.com/*` | Fetch live coin prices for the popup display |

---

## Privacy

**No data ever leaves your device to any server other than CoinGecko for price data.**

- Your transaction data and wallet information are only ever stored in your browser's local extension storage (`chrome.storage.local`).
- The only outbound network request made by this extension is a price lookup to the CoinGecko public API, which contains only coin IDs (e.g. `bitcoin,ethereum`) — never your balances, wallet addresses, or any personally identifiable information.
- The extension does not have an analytics or telemetry component of any kind.

---

## File Structure

```
extension/
├── manifest.json      MV3 manifest
├── background.js      Service worker — data persistence & alarm-based sync
├── content.js         Content script — reads localStorage on walletlens.live
├── popup.html         Toolbar popup markup
├── popup.js           Popup logic: holdings math, price fetch, rendering
├── popup.css          Popup styles (dark theme, WalletLens brand colours)
├── icons/
│   ├── icon-16.svg
│   ├── icon-48.svg
│   └── icon-128.svg
└── README.md
```
