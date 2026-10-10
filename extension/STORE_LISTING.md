# Chrome Web Store listing: WalletLens 2.0

> House style: no dashes in copy, no decorative glyphs in the description,
> no sentence a person would not say out loud.
>
> **No third party brand names anywhere in the listing.** Version 1.5 was
> rejected (violation "Yellow Argon", keyword spam) for naming exchanges and
> wallets in the description. The listing describes what the extension does,
> in plain sentences, and never lists keywords or other companies' names.

## Name (max 75, from manifest.json `name`)

WalletLens: Net Worth, Crypto & Stock Portfolio Tracker

## Summary (max 132, from manifest.json `description`)

Your whole net worth in the toolbar: crypto, stocks, gold, cash and property. Price alerts, signals and history. Free, no account.

## Category

Productivity. Language: English.

---

## Description (paste into the Description box)

Know what you are worth every time you open your browser.

WalletLens puts your whole net worth in your toolbar: crypto, stocks and funds, gold and silver, cash in any currency, and the things that do not trade on a screen, like your home. One click shows the total, how much it moved today, and which of your assets moved it. Today's change also sits on the icon itself, green or red, so you can see it without opening anything.

Version 2.0 is a complete redesign with five screens.

Home shows your net worth with a history chart from one day to one year, your profit and loss, how your money splits between asset classes, and today's biggest movers. The history is built from a snapshot your browser saves once a day, so it never leaves your computer.

Holdings lists everything you own with its value, profit and loss, today's change and a seven day trend line. Filter by wallet or by asset class and sort by value, by today's move or by profit.

Signals gives every coin you hold a clear buy, sell or hold read on one screen, with the reason behind it and a stop and three targets. The reads come from price data and are educational, never financial advice.

Market shows the Fear and Greed index with yesterday and last week beside it, the major markets, and headlines ranked so the ones about what you hold come first.

Alerts sends a desktop notification when a price crosses a level you set, when your net worth moves more than you choose in a day, or as a short morning summary. Alerts are checked every 15 minutes while your browser is open.

See everything in your own currency, from US dollars and euros to pounds, dirhams, riyals and Egyptian pounds. One tap hides every balance and leaves percentages only, for when someone is looking over your shoulder.

How it works: add what you own once on walletlens.live, by screenshot, by voice or by hand, and the extension picks it up on its own. It keeps working with the site closed. To bring in a portfolio from your phone, paste your WalletLens backup code into the extension.

Private by design. There is no account, no email and no password. Your holdings are stored only in your browser. The extension has no analytics and no tracking. Its only outside requests fetch public prices, exchange rates, the Fear and Greed index and headlines, and they carry asset names, never your amounts or balances. It cannot read the other websites you visit.

Free, with no paid tier and no ads.

Learn more: https://walletlens.live/chrome-extension/

---

## Single purpose (Privacy practices tab)

Shows the user's WalletLens portfolio (net worth, holdings, signals, market data and alerts) from the browser toolbar.

## Permission justifications (Privacy practices tab)

- **storage**: Saves the user's portfolio, settings, alerts and a daily net worth snapshot in the browser so the popup works with the website closed. Nothing is sent to a server.
- **alarms**: Runs a check every 15 minutes to update today's change on the toolbar icon, save the daily snapshot and evaluate the user's price alerts, and asks an open walletlens.live tab to re-sync every 5 minutes.
- **notifications**: Shows the desktop notifications the user turns on: a price crossing a level they set, a large daily move in their net worth, and an optional morning summary.
- **Host permission walletlens.live**: The content script reads the portfolio the user keeps on walletlens.live so the extension can show it.
- **Host permissions for price services** (api.coingecko.com, stooq.com, api.gold-api.com, open.er-api.com, api.alternative.me and the WalletLens proxy worker): Fetch public prices, exchange rates and the Fear and Greed index. Requests contain asset identifiers only, never amounts, balances or addresses.
- **Remote code**: No. All code ships in the package.

## Data usage disclosures

- Does not collect personally identifiable information, health, financial or authentication information, personal communications, location, web history or user activity.
- Portfolio data stays in the browser's extension storage.
- Certify: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.

## Store assets (in promo/extension-2.0/)

- Screenshots, 1280 x 800: `screenshot-1` Home, `screenshot-2` Holdings, `screenshot-3` Signals, `screenshot-4` Market, `screenshot-5` Alerts.
- Small promo tile, 440 x 280: `promo-small-440x280.png`
- Marquee promo tile, 1400 x 560: `promo-marquee-1400x560.png`
- Icon 128 x 128: `extension/icons/icon-128.png`

## Links

- Homepage: https://walletlens.live/chrome-extension/
- Support: https://walletlens.live/faq/
- Privacy policy: https://walletlens.live/privacy/
