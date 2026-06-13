# Contributing to WalletLens

Thanks for your interest in contributing! WalletLens is open source and welcomes improvements of all kinds.

## Ways to contribute

- **⭐ Star the repo** — helps more people discover the project
- **🐛 Report bugs** — [open a bug report](https://github.com/tia8910/Walletlens/issues/new?template=bug_report.yml)
- **💡 Suggest features** — [open a feature request](https://github.com/tia8910/Walletlens/issues/new?template=feature_request.yml)
- **🔧 Submit a pull request** — fix a bug or build a feature

## Development setup

```bash
git clone https://github.com/tia8910/Walletlens.git
cd Walletlens/client
npm install
npm run dev        # → http://localhost:5173
npm test           # run Vitest tests
npm run build      # production build
```

## Pull request guidelines

1. **Fork** the repo and create your branch from `main`
2. **One PR per concern** — keep changes focused
3. **Test your change** — make sure it works on mobile and desktop
4. **No new dependencies** unless truly necessary — keep the bundle lean
5. **Privacy first** — do not add anything that sends user portfolio data to a server

## Architecture notes

- All portfolio data lives in `localStorage` / `IndexedDB` — never send it to a server
- `client/src/api.js` is the data layer — price fetches cascade through multiple sources with fallbacks
- `client/src/technicals.js` — pure TA math (RSI, MACD, Bollinger etc.)
- `client/src/magicIndicator.js` — five-pillar composite signal logic
- The `voice-api/` Deno endpoint handles AI features — the app works without it

## Code style

- React functional components with hooks
- No class components
- Inline styles for one-off overrides, CSS classes for reusable patterns (in `index.css`)
- Keep components small — prefer extracting helper functions over massive JSX blocks

## Questions?

Join the [Telegram community](https://t.me/walletlenss) or open a GitHub Discussion.
