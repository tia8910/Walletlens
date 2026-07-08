package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;

/**
 * Background worker for WalletLens notifications.
 *
 * <p>Two notification types, one per day max:
 * <ol>
 *   <li><b>💡 Feature Discovery</b> – shows a different WalletLens feature
 *       every day until all features have been introduced. After all features
 *       are shown, the cycle restarts.</li>
 *   <li><b>📊 Market Pulse</b> – only fires when BTC or ETH moved >2% in
 *       the last 24 hours (otherwise completely silent).</li>
 * </ol>
 *
 * <p>Other notification channels:
 * <ul>
 *   <li><b>Web app (when open)</b> – portfolio 5% changes, price targets</li>
 *   <li><b>FCM push</b> – instant server-sent notifications (requires setup)</li>
 * </ul>
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    // ── API endpoint ───────────────────────────────────────────────────
    private static final String COINGECKO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
                    + "?ids=bitcoin,ethereum"
                    + "&vs_currencies=usd"
                    + "&include_24hr_change=true";

    // ── SharedPreferences ──────────────────────────────────────────────
    private static final String PREFS_NAME = "walletlens_notify";
    private static final String KEY_LAST_PRICES    = "last_prices";
    private static final String KEY_FEATURE_INDEX  = "feature_index";
    private static final String KEY_LAST_NOTIF_TS  = "last_notif_date";
    private static final String KEY_LAST_MARKET_TS = "last_market_ts";

    // ── Feature tips – every WalletLens feature, one per day ───────────
    private static final String[][] FEATURES = {
        // {"Title", "Description", "Deep-link URL"}
        {"🎙️ Voice Import", "Add holdings by speaking — just tap the mic and say \"I bought 0.5 BTC at 65K\"", "/add-holdings-by-voice"},
        {"📸 Screenshot Import", "Screenshot any exchange or wallet — WalletLens reads balances automatically", "/import-portfolio-from-screenshot"},
        {"📄 Excel/CSV Import", "Bulk-import your holdings from a spreadsheet in seconds", "/dashboard"},
        {"🔗 Wallet Import", "Paste any ETH, BTC or SOL address and WalletLens fetches live balances", "/dashboard"},
        {"📤 Export to Excel", "Download your full portfolio as Excel — cost basis, P&L, allocation", "/export-portfolio-to-excel"},
        {"🧾 Crypto Tax Report", "Export transaction history as CSV ready for Koinly, CoinTracker, TurboTax", "/crypto-portfolio-tax-report"},
        {"🎯 Price Targets", "Set price alerts for any asset and get notified when targets are hit", "/track/{coin}"},
        {"😱 Fear & Greed Index", "Track market sentiment with the Fear & Greed Index", "/fear-and-greed-index"},
        {"🤖 AI Portfolio Coach", "Ask the AI Coach for personalized analysis and advice", "/coach"},
        {"📊 Market Index", "View live prices, 24h changes, and market heatmaps", "/market-index"},
        {"⚡ Magic Indicator", "Get buy/sell signals with the proprietary Magic Indicator", "/magic-indicator"},
        {"🔬 Technical Analysis", "Deep-dive into RSI, MACD, moving averages for any asset", "/technicals"},
        {"🏦 Multi-Exchange", "Connect Binance, Coinbase and more — view all balances in one place", "/exchanges"},
        {"💰 Multi-Asset", "Track crypto, stocks, gold, silver, real estate and cash", "/dashboard"},
        {"📓 Trade Journal", "Record every trade with notes, screenshots, and P&L tracking", "/transactions"},
        {"🔐 Biometric Lock", "Secure your portfolio with fingerprint or face unlock", "/settings"},
        {"🔄 Rebalancing Calculator", "Calculate optimal allocations to rebalance your portfolio", "/rebalancing-calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions and whale movements", "/whales"},
        {"📈 Portfolio Snapshot", "View your net worth, P&L, allocation and performance charts", "/dashboard"},
        {"🌍 Multi-Language", "WalletLens supports English, Arabic and more languages", "/settings"},
        {"🔒 Privacy First", "No account needed — your data stays on your device, never on a server", "/privacy"},
        {"📱 Install as App", "Add WalletLens to your home screen for a native app experience", "/"},
        {"📰 Crypto News", "Stay updated with the latest crypto news and market analysis", "/intel"},
        {"🎓 Crypto Academy", "Learn crypto fundamentals, trading strategies and portfolio tips", "/academy"},
        {"💡 Smart Import", "Five ways to add holdings — voice, screenshot, Excel, wallet, or manual", "/dashboard"},
        {"📊 Portfolio Analytics", "Track allocation, diversification, and portfolio health score", "/dashboard"},
        {"📉 Live P&L", "Realized and unrealized gains — see exactly how your assets perform", "/dashboard"},
        {"🔔 Price Alerts", "Get notified when any asset hits your target price", "/track/{coin}"},
        {"📋 Watchlist", "Follow your favorite coins and stocks without adding them to portfolio", "/market-index"},
        {"📱 Push Notifications", "Get price alerts and market updates even when the app is closed", "/settings"},
        {"🆓 100% Free", "Every feature is free — no premium tiers, no paywalls, ever", "/"},
        {"🌟 Open Source", "WalletLens is open source — inspect the code or contribute", "https://github.com/tia8910/Walletlens"},
    };

    private final Random random = new Random();

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

            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            String lastNotifDate = prefs.getString(KEY_LAST_NOTIF_TS, "");

            // Only one notification per day
            if (lastNotifDate.equals(today)) {
                Log.d(TAG, "Notification already sent today, skipping");
                return Result.success();
            }

            // Try feature discovery first (primary notification type)
            boolean shown = tryFeatureDiscovery(prefs, today);

            // If feature discovery was already completed, try market pulse
            if (!shown) {
                shown = tryMarketPulse(prefs, today);
            }

            if (shown) {
                prefs.edit().putString(KEY_LAST_NOTIF_TS, today).apply();
                Log.d(TAG, "Notification sent");
            } else {
                Log.d(TAG, "Nothing to notify today");
            }

        } catch (Exception e) {
            Log.w(TAG, "Worker error", e);
        }

        return Result.success();
    }

    // ── 1. Feature Discovery (primary) ─────────────────────────────────

    /**
     * Show one feature per day, cycling through ALL features.
     * After all features are shown, the cycle restarts.
     */
    private boolean tryFeatureDiscovery(SharedPreferences prefs, String today) {
        int featureIndex = prefs.getInt(KEY_FEATURE_INDEX, 0);

        // If we've shown all features, restart the cycle
        if (featureIndex >= FEATURES.length) {
            featureIndex = 0;
        }

        String[] feature = FEATURES[featureIndex];
        String title = feature[0];
        String body = feature[1];
        String targetUrl = "https://walletlens.live" + feature[2];

        // Build an engaging message
        String greeting = getTimeGreeting();
        String fullTitle = greeting + " — " + title;
        String fullBody = body + "\n\nTap to explore →";

        NotificationHelper helper = new NotificationHelper(getApplicationContext());
        helper.showNotification(fullTitle, fullBody, targetUrl, null);

        // Advance to next feature
        prefs.edit().putInt(KEY_FEATURE_INDEX, featureIndex + 1).apply();

        Log.d(TAG, "Feature tip #" + (featureIndex + 1) + "/" + FEATURES.length + ": " + title);
        return true;
    }

    // ── 2. Market Pulse (fallback) ─────────────────────────────────────

    /**
     * Only fires if BTC or ETH moved more than 2% in the last 24 hours.
     * Otherwise stays completely silent.
     */
    private boolean tryMarketPulse(SharedPreferences prefs, String today) throws Exception {
        String json = httpGet(COINGECKO_URL);
        JSONObject data = new JSONObject(json);

        double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
        double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
        double btcChange = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
        double ethChange = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

        // Save prices
        String newPrices = String.format(Locale.US, "{\"btc\":%.2f,\"eth\":%.2f}", btcPrice, ethPrice);
        prefs.edit().putString(KEY_LAST_PRICES, newPrices).apply();

        // Check if move is significant (>2%)
        if (Math.abs(btcChange) < 2.0 && Math.abs(ethChange) < 2.0) {
            Log.d(TAG, String.format(Locale.US, "No significant move (BTC: %.1f%%, ETH: %.1f%%)", btcChange, ethChange));
            return false;
        }

        // Check cooldown (only once per day)
        long lastMarket = prefs.getLong(KEY_LAST_MARKET_TS, 0);
        if (System.currentTimeMillis() - lastMarket < 20 * 60 * 60 * 1000L) {
            return false;
        }
        prefs.edit().putLong(KEY_LAST_MARKET_TS, System.currentTimeMillis()).apply();

        NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);
        String dayName = new SimpleDateFormat("EEEE", Locale.US).format(new Date());

        String title = "📊 Market Alert — " + dayName;
        String body = String.format(Locale.US,
                "BTC: %s (%.1f%%)\nETH: %s (%.1f%%)",
                currencyFmt.format(btcPrice), btcChange,
                currencyFmt.format(ethPrice), ethChange);

        NotificationHelper helper = new NotificationHelper(getApplicationContext());
        helper.showAlertNotification(title, body, "https://walletlens.live/market-index");

        return true;
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private String getTimeGreeting() {
        int hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        if (hour < 12) return "☀️ Good morning";
        if (hour < 17) return "🌤️ Good afternoon";
        return "🌙 Good evening";
    }

    private static String httpGet(@NonNull String urlString) throws Exception {
        URI uri = new URI(urlString);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(10_000);
        conn.setRequestProperty("Accept", "application/json");

        int status = conn.getResponseCode();
        if (status != 200) {
            throw new RuntimeException("HTTP " + status + " from " + urlString);
        }

        BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream()));
        StringBuilder result = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            result.append(line);
        }
        reader.close();
        conn.disconnect();
        return result.toString();
    }
}
