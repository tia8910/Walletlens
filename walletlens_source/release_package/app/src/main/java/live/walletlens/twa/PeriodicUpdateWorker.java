package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Background worker — runs every 30 min.
 *
 * <ol>
 *   <li><b>📊 Price alerts</b> — monitors BTC, ETH + top 20 coins.
 *       Notifies if ANY asset moved >1% since last check.</li>
 *   <li><b>💡 Feature tip</b> — shows ONE feature per day</li>
 * </ol>
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    // Top 20 coins by market cap (covers ~95%+ of user holdings)
    private static final String COINS =
            "bitcoin,ethereum,ripple,solana,cardano,avalanche,dogecoin,"
            + "polkadot,chainlink,shiba-inu,tron,litecoin,uniswap,"
            + "stellar,cosmos,monero,filecoin,aptos,arbitrum,sui,near,"
            + "optimism,hedera,algorand,flow,vechain";

    private static final String PRICE_URL =
            "https://api.coingecko.com/api/v3/simple/price"
            + "?ids=" + COINS
            + "&vs_currencies=usd"
            + "&include_24hr_change=true";

    private static final String PREFS_NAME = "walletlens_notify";
    private static final String KEY_PRICES   = "saved_prices";
    private static final String KEY_FEATURE  = "feature_index";
    private static final String KEY_TIP_DAY  = "last_tip_day";

    private static final double MOVE_THRESHOLD_PCT = 1.0;

    // ── 32 WalletLens features ─────────────────────────────────────────
    private static final String[][] FEATURES = {
        {"🎙️ Voice Import", "Add holdings by speaking — tap the mic and say \"I bought 0.5 BTC at 65K\"", "/add-holdings-by-voice"},
        {"📸 Screenshot Import", "Screenshot any exchange or wallet — reads balances automatically", "/import-portfolio-from-screenshot"},
        {"📄 Excel/CSV Import", "Bulk-import your holdings from a spreadsheet in seconds", "/dashboard"},
        {"🔗 Wallet Import", "Paste any ETH, BTC or SOL address — fetches live balances", "/dashboard"},
        {"📤 Export to Excel", "Download full portfolio as Excel — cost basis, P&L, allocation", "/export-portfolio-to-excel"},
        {"🧾 Crypto Tax Report", "Export transactions as CSV for Koinly, CoinTracker, TurboTax", "/crypto-portfolio-tax-report"},
        {"🎯 Price Targets", "Set price alerts for any asset — notified when targets are hit", "/track/{coin}"},
        {"😱 Fear & Greed Index", "Track market sentiment with the Fear & Greed Index", "/fear-and-greed-index"},
        {"🤖 AI Portfolio Coach", "Ask the AI Coach for personalized portfolio analysis", "/coach"},
        {"📊 Market Index", "View live prices, 24h changes, and market heatmaps", "/market-index"},
        {"⚡ Magic Indicator", "Get buy/sell signals with the proprietary Magic Indicator", "/magic-indicator"},
        {"🔬 Technical Analysis", "Deep-dive into RSI, MACD, moving averages", "/technicals"},
        {"🏦 Multi-Exchange", "Connect Binance, Coinbase — view all balances in one place", "/exchanges"},
        {"💰 Multi-Asset", "Track crypto, stocks, gold, silver, real estate and cash", "/dashboard"},
        {"📓 Trade Journal", "Record every trade with notes, screenshots, and P&L", "/transactions"},
        {"🔐 Biometric Lock", "Secure your portfolio with fingerprint or face unlock", "/settings"},
        {"🔄 Rebalancing Calculator", "Calculate optimal allocations to rebalance", "/rebalancing-calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions and whale movements", "/whales"},
        {"📈 Portfolio Snapshot", "Net worth, P&L, allocation and performance charts", "/dashboard"},
        {"🌍 Multi-Language", "Supports English, Arabic and more languages", "/settings"},
        {"🔒 Privacy First", "No account needed — data stays on your device", "/privacy"},
        {"📱 Install as App", "Add to home screen for native app experience", "/"},
        {"📰 Crypto News", "Latest crypto news and market analysis", "/intel"},
        {"🎓 Crypto Academy", "Learn crypto fundamentals and trading strategies", "/academy"},
        {"💡 Smart Import", "Five ways to add holdings — voice, screenshot, Excel, wallet, manual", "/dashboard"},
        {"📊 Portfolio Analytics", "Allocation, diversification, and health score", "/dashboard"},
        {"📉 Live P&L", "Realized and unrealized gains — see exactly how you're performing", "/dashboard"},
        {"🔔 Price Alerts", "Get notified when any asset hits your target price", "/track/{coin}"},
        {"📋 Watchlist", "Follow coins and stocks without adding to portfolio", "/market-index"},
        {"📱 Push Notifications", "Get price alerts even when the app is closed", "/settings"},
        {"🆓 100% Free", "Every feature is free — no premium tiers, ever", "/"},
        {"🌟 Open Source", "WalletLens is open source — inspect or contribute", "https://github.com/tia8910/Walletlens"},
    };

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Worker started");

        try {
            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            // 1. Check ALL tracked coins for price moves
            checkAllPrices(prefs);

            // 2. Feature tip (once per day)
            showDailyFeatureTip(prefs);

        } catch (Exception e) {
            Log.w(TAG, "Worker error", e);
        }

        return Result.success();
    }

    // ── 1. Multi-coin price alert ──────────────────────────────────────

    private void checkAllPrices(SharedPreferences prefs) throws Exception {
        String json = httpGet(PRICE_URL);
        JSONObject data = new JSONObject(json);

        // Load saved prices: {"bitcoin": 65000.0, "ethereum": 3400.0, ...}
        String savedJson = prefs.getString(KEY_PRICES, "{}");
        JSONObject saved = new JSONObject(savedJson);

        JSONObject newPrices = new JSONObject();
        StringBuilder movers = new StringBuilder();
        int moveCount = 0;
        NumberFormat cf = NumberFormat.getCurrencyInstance(Locale.US);

        // Iterate over all coins returned from API
        for (String coinId : COINS.split(",")) {
            coinId = coinId.trim();
            if (!data.has(coinId)) continue;

            JSONObject coinData = data.getJSONObject(coinId);
            double price = coinData.getDouble("usd");
            double change24h = coinData.optDouble("usd_24h_change", 0);

            newPrices.put(coinId, price);

            // Check if we have a previous price
            if (saved.has(coinId)) {
                double oldPrice = saved.getDouble(coinId);
                double move = Math.abs(price - oldPrice) / oldPrice * 100;

                if (move >= MOVE_THRESHOLD_PCT) {
                    String symbol = coinId.substring(0, Math.min(coinId.length(), 8)).toUpperCase(Locale.US);
                    if (moveCount > 0) movers.append("\n");
                    movers.append(String.format(Locale.US, "%s: %s (%.1f%%)",
                            symbol, cf.format(price), move));
                    moveCount++;
                }
            }
        }

        // Save new prices
        prefs.edit().putString(KEY_PRICES, newPrices.toString()).apply();

        // First run — no notification
        if (saved.length() == 0) {
            Log.d(TAG, "First run — prices saved for " + newPrices.length() + " coins");
            return;
        }

        // Notify if any coin moved
        if (moveCount > 0) {
            String title = "📊 Price Alert — " + moveCount + " coin" + (moveCount > 1 ? "s" : "") + " moved";
            String body = movers.toString();

            NotificationHelper h = new NotificationHelper(getApplicationContext());
            h.showAlertNotification(title, body, "https://walletlens.live/market-index");

            Log.d(TAG, "Alert: " + moveCount + " coin(s) moved >" + MOVE_THRESHOLD_PCT + "%");
        } else {
            Log.d(TAG, "All " + newPrices.length() + " coins stable");
        }
    }

    // ── 2. Feature tip ─────────────────────────────────────────────────

    private void showDailyFeatureTip(SharedPreferences prefs) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String lastTipDay = prefs.getString(KEY_TIP_DAY, "");
        if (lastTipDay.equals(today)) return;

        int idx = prefs.getInt(KEY_FEATURE, 0);
        if (idx >= FEATURES.length) idx = 0;

        String[] tip = FEATURES[idx];
        String url = "https://walletlens.live" + tip[2];

        NotificationHelper h = new NotificationHelper(getApplicationContext());
        h.showNotification("💡 " + tip[0], tip[1], url, null);

        prefs.edit()
                .putInt(KEY_FEATURE, idx + 1)
                .putString(KEY_TIP_DAY, today)
                .apply();

        Log.d(TAG, "Tip #" + (idx + 1) + "/" + FEATURES.length + ": " + tip[0]);
    }

    // ── HTTP ───────────────────────────────────────────────────────────

    private static String httpGet(@NonNull String urlString) throws Exception {
        URI uri = new URI(urlString);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(15_000);
        conn.setRequestProperty("Accept", "application/json");

        int status = conn.getResponseCode();
        if (status != 200) throw new RuntimeException("HTTP " + status);

        BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        conn.disconnect();
        return sb.toString();
    }
}
