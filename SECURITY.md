# Security Policy

## Privacy model

WalletLens is **100% client-side**. Portfolio data (holdings, transactions, wallets) is stored exclusively in your browser's `localStorage` and `IndexedDB`. It is never sent to any WalletLens server.

The only outbound requests from the app are:
- **Public market-data APIs** (CoinGecko, Binance, Stooq, etc.) for live prices — no portfolio data is included
- **The Claude AI endpoint** (`walletlens-voice-parse.tia8910.deno.net`) — called only for voice import or AI Verdict, and only receives the text/numbers you type, never your full portfolio

## Reporting a vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, email: `walletlens.live@gmail.com` with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

We aim to respond within 72 hours and will credit you in the fix commit if you wish.

## Scope

In scope:
- XSS or injection vulnerabilities in the React app
- Issues with the Deno AI endpoint that could expose API keys or user input
- Any mechanism that could cause user portfolio data to be transmitted externally without consent

Out of scope:
- Third-party market-data API security (CoinGecko, Binance, etc.)
- Social engineering attacks
- Issues requiring physical access to the user's device
