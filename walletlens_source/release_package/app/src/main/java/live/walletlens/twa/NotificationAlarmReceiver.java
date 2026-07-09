package live.walletlens.twa;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import java.util.Locale;
import java.util.Random;

/**
 * Receives AlarmManager broadcasts and fires native WalletLens notifications.
 *
 * Uses {@link AlarmManager#setAlarmClock} for precise scheduling that survives
 * device sleep and app closure. On modern Android this is the most reliable
 * way to deliver timely notifications without a backend server.
 *
 * <p>When the alarm fires, this receiver picks a random notification type:
 * <ul>
 *   <li>📊 Price update (fetches live prices for crypto/gold/silver/stocks)</li>
 *   <li>💡 Feature tip (cycles through all 32+ app features)</li>
 *   <li>📈 Investment hack (general portfolio and market wisdom)</li>
 *   <li>🔔 Reminder to check portfolio</li>
 * </ul>
 *
 * <p>Each notification uses the WalletLens brand channel ({@code IMPORTANCE_HIGH})
 * so it pops up even when the app is closed or the screen is off.
 */
public class NotificationAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "WalletLensAlarmRcvr";
    private static final String PREFS_NAME = "walletlens_alarm";
    private static final String KEY_NOTIF_TYPE = "last_notif_type";
    private static final String KEY_FEATURE_IDX = "feature_idx";
    private static final String KEY_HACK_IDX = "hack_idx";
    private static final String KEY_LAST_HEARTBEAT = "last_heartbeat_ts";

    // ── 32 Feature tips ───────────────────────────────────────────────
    private static final String[][] FEATURES = {
        {"🎙️ Voice Import", "Add holdings by speaking — tap the mic on dashboard", "/add-holdings-by-voice"},
        {"📸 Screenshot Import", "Screenshot any exchange — portfolio reads automatically", "/import-portfolio-from-screenshot"},
        {"📄 Excel/CSV Import", "Bulk-import holdings from a spreadsheet in one click", "/dashboard"},
        {"🔗 Wallet Import", "Paste ETH, BTC or SOL address — fetches live balances", "/dashboard"},
        {"📤 Export to Excel", "Download portfolio as Excel with cost basis & P&L", "/export-portfolio-to-excel"},
        {"🧾 Crypto Tax Report", "Export for Koinly, CoinTracker, TurboTax ready", "/crypto-portfolio-tax-report"},
        {"🎯 Price Targets", "Set alerts for any asset at your target price", "/track/{coin}"},
        {"😱 Fear & Greed Index", "Market sentiment at a glance — now neutral", "/fear-and-greed-index"},
        {"🤖 AI Portfolio Coach", "Personalized AI analysis and advice on your holdings", "/coach"},
        {"📊 Market Index", "Live prices, heatmaps, and top movers in one place", "/market-index"},
        {"⚡ Magic Indicator", "Buy/sell signals across all your assets", "/magic-indicator"},
        {"🔬 Technical Analysis", "RSI, MACD, moving averages for any asset", "/technicals"},
        {"🏦 Multi-Exchange", "Binance, Coinbase, Kraken — all in one place", "/exchanges"},
        {"💰 Multi-Asset", "Crypto + stocks + gold + real estate + cash combined", "/dashboard"},
        {"📓 Trade Journal", "Record trades with notes, screenshots and P&L", "/transactions"},
        {"🔐 Biometric Lock", "Fingerprint or face unlock — keeps your data safe", "/settings"},
        {"🔄 Rebalancing", "Optimal portfolio allocation calculator", "/rebalancing-calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions in real time", "/whales"},
        {"📈 Portfolio Snapshot", "Net worth, P&L, allocation charts, all together", "/dashboard"},
        {"🌍 Multi-Language", "English, Arabic and more — switch anytime", "/settings"},
        {"🔒 Privacy First", "No account, no tracking — data stays on your device", "/privacy"},
        {"📱 Install as App", "Add to home screen for the full native experience", "/"},
        {"📰 Crypto Intel", "Latest news, analysis and market insights", "/intel"},
        {"🎓 Crypto Academy", "Learn investing fundamentals and advanced strategies", "/academy"},
        {"📊 Portfolio Analytics", "Allocation, diversification score, health check", "/dashboard"},
        {"📉 Live P&L", "Realized and unrealized gains updated in real time", "/dashboard"},
        {"🔔 Smart Alerts", "Notify when any asset hits your target price", "/track/{coin}"},
        {"📋 Custom Watchlist", "Follow coins without adding them to portfolio", "/market-index"},
        {"📱 Push Notifications", "Alerts and updates even when the app is closed", "/settings"},
        {"🆓 100% Free", "No premium tiers, no subscriptions, ever", "/"},
        {"🌟 Open Source", "Inspect, fork or contribute on GitHub", "https://github.com/tia8910/Walletlens"},
        {"📊 Net Worth Tracker", "All assets in one dashboard — your complete wealth", "/dashboard"},
    };

    // ── Investment Hacks (20 tips) ────────────────────────────────────
    private static final String[][] HACKS = {
        {"📈 Dollar-Cost Averaging", "Invest fixed amounts regularly — removes emotion from timing the market"},
        {"🛡️ Diversification", "Spread across crypto, stocks, gold, cash — don't put all eggs in one basket"},
        {"📉 Buy the Dips", "When everyone is fearful, consider buying — markets always cycle"},
        {"💰 Compound Interest", "Reinvest gains to grow exponentially — time is your biggest ally"},
        {"🎯 Set Stop-Losses", "Define your exit before entering — protects from emotional decisions"},
        {"📊 Rebalance Quarterly", "Adjust allocations every 3 months to maintain your target risk"},
        {"🔍 DYOR", "Always research before investing — understand what you own"},
        {"💵 Emergency Fund First", "Keep 3-6 months of expenses in cash before investing"},
        {"📋 Track Everything", "Use WalletLens to track every asset — what gets measured gets managed"},
        {"🧠 Avoid FOMO", "Fear of Missing Out leads to buying high — stay disciplined"},
        {"📅 Invest Consistently", "Consistent small investments beat trying to time the market"},
        {"🔒 Cold Storage", "Large crypto holdings belong in hardware wallets, not exchanges"},
        {"📊 Check Correlations", "Gold and stocks sometimes move together — know your correlations"},
        {"💡 Tax-Loss Harvesting", "Sell losing positions to offset gains — WalletLens helps track P&L"},
        {"🌍 Think Globally", "International diversification reduces country-specific risk"},
        {"📈 Trend Following", "The trend is your friend — don't fight the market direction"},
        {"⚡ Stay Liquid", "Keep some cash ready for opportunities during market dips"},
        {"📚 Never Stop Learning", "The best investors are lifelong learners — use WalletLens Academy"},
        {"🎯 Set Goals", "Define clear financial goals — WalletLens milestone tracker helps"},
        {"💪 Stay Patient", "The market rewards patience — zoom out and think long-term"},
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm received" + (intent.getAction() != null ? ": " + intent.getAction() : ""));

        // Ensure notification channels exist
        NotificationHelper helper = new NotificationHelper(context);
        helper.createChannels();

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int notifType = prefs.getInt(KEY_NOTIF_TYPE, -1);

        // Cycle through notification types each time
        notifType = (notifType + 1) % 5;
        prefs.edit().putInt(KEY_NOTIF_TYPE, notifType).apply();

        switch (notifType) {
            case 0: showPriceUpdate(context, prefs, helper); break;
            case 1: showFeatureTip(context, prefs, helper); break;
            case 2: showInvestmentHack(context, prefs, helper); break;
            case 3: showPortfolioReminder(context, helper); break;
            case 4: showPriceUpdate(context, prefs, helper); break; // Price updates twice as often
            default: showFeatureTip(context, prefs, helper);
        }

        // Re-schedule the next alarm
        NotificationScheduler.scheduleNextAlarm(context);

        // Save timestamp of last notification
        prefs.edit().putLong(KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply();
    }

    // ── Price Update ──────────────────────────────────────────────────

    private void showPriceUpdate(Context context, SharedPreferences prefs, NotificationHelper helper) {
        try {
            // Try to fetch live prices from CoinGecko
            String cryptoJson = httpGet("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,cardano&vs_currencies=usd&include_24hr_change=true");
            org.json.JSONObject data = new org.json.JSONObject(cryptoJson);

            StringBuilder body = new StringBuilder();
            String[][] coins = {
                {"bitcoin", "BTC"}, {"ethereum", "ETH"}, {"solana", "SOL"},
                {"ripple", "XRP"}, {"cardano", "ADA"}
            };

            java.text.NumberFormat fmt = java.text.NumberFormat.getCurrencyInstance(Locale.US);
            for (String[] coin : coins) {
                if (data.has(coin[0])) {
                    org.json.JSONObject c = data.getJSONObject(coin[0]);
                    double price = c.getDouble("usd");
                    double change = c.optDouble("usd_24h_change", 0);
                    String arrow = change >= 0 ? "🟢" : "🔴";
                    if (body.length() > 0) body.append("\n");
                    body.append(arrow).append(" ").append(coin[1]).append(" ")
                        .append(fmt.format(price)).append(" (")
                        .append(String.format(Locale.US, "%.1f", change)).append("%)");
                }
            }

            if (body.length() > 0) {
                // Also try gold price
                try {
                    String goldJson = httpGet("https://api.metals.live/v1/spot/gold");
                    org.json.JSONArray arr = new org.json.JSONArray(goldJson);
                    if (arr.length() > 0) {
                        double goldPrice = arr.getJSONObject(0).getDouble("price");
                        body.append("\n🥇 Gold $").append(String.format(Locale.US, "%.0f", goldPrice)).append("/oz");
                    }
                } catch (Exception ignored) {}

                helper.showAlertNotification("📊 Market Update", body.toString(), "https://walletlens.live/market-index");
            } else {
                helper.showAlertNotification("📊 Market Prices", "Prices loading — check market index for latest", "https://walletlens.live/market-index");
            }
        } catch (Exception e) {
            Log.w(TAG, "Price update failed", e);
            helper.showAlertNotification("📊 Market Update", "Check your portfolio and market prices now", "https://walletlens.live/market-index");
        }
    }

    // ── Feature Tip ───────────────────────────────────────────────────

    private void showFeatureTip(Context context, SharedPreferences prefs, NotificationHelper helper) {
        int idx = prefs.getInt(KEY_FEATURE_IDX, 0);
        if (idx >= FEATURES.length) idx = 0;

        String[] tip = FEATURES[idx];
        String url = "https://walletlens.live" + tip[2];
        helper.showAlertNotification("💡 " + tip[0], tip[1], url);

        prefs.edit().putInt(KEY_FEATURE_IDX, idx + 1).apply();
        Log.d(TAG, "Feature tip #" + (idx + 1) + ": " + tip[0]);
    }

    // ── Investment Hack ───────────────────────────────────────────────

    private void showInvestmentHack(Context context, SharedPreferences prefs, NotificationHelper helper) {
        int idx = prefs.getInt(KEY_HACK_IDX, 0);
        if (idx >= HACKS.length) idx = 0;

        String[] hack = HACKS[idx];
        String body = hack[1];
        if (body.length() > 90) body = body.substring(0, 87) + "...";

        helper.showAlertNotification("💡 " + hack[0], body, "https://walletlens.live/academy");

        prefs.edit().putInt(KEY_HACK_IDX, idx + 1).apply();
        Log.d(TAG, "Investment hack #" + (idx + 1) + ": " + hack[0]);
    }

    // ── Portfolio Reminder ────────────────────────────────────────────

    private void showPortfolioReminder(Context context, NotificationHelper helper) {
        String[] reminders = {
            "Track your net worth today — every asset in one dashboard",
            "Check your portfolio P&L — see how your investments are performing",
            "Review your asset allocation — is it still balanced?",
            "Update your holdings — keep your portfolio accurate",
            "View your portfolio health score and get AI insights",
        };
        String msg = reminders[new Random().nextInt(reminders.length)];
        helper.showAlertNotification("🔔 WalletLens Reminder", msg, "https://walletlens.live/dashboard");
    }

    // ── HTTP helper ───────────────────────────────────────────────────

    private static String httpGet(String urlString) throws Exception {
        java.net.URI uri = new java.net.URI(urlString);
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(10_000);
        conn.setRequestProperty("Accept", "application/json");
        int status = conn.getResponseCode();
        if (status != 200) throw new RuntimeException("HTTP " + status);
        java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line);
        r.close();
        conn.disconnect();
        return sb.toString();
    }
}
