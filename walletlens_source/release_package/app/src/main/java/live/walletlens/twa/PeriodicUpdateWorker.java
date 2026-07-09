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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Random;

/**
 * Background worker — runs every 30 min via WorkManager.
 *
 * Sends a push notification (via FCM self-push or local fallback) that cycles through:
 * <ol>
 *   <li>📊 Price alerts (crypto, gold, silver, stocks)</li>
 *   <li>💡 Investment hacks (wealth-building strategies)</li>
 *   <li>🎓 Academy tips (investing education)</li>
 *   <li>💡 Feature tips (app capabilities)</li>
 * </ol>
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";
    private static final double MOVE_THRESHOLD_PCT = 1.0;

    // FCM legacy API endpoint for self-push
    // Replace with your Firebase Server Key from:
    //   Firebase Console > Project Settings > Cloud Messaging > Server Key
    private static final String FCM_SEND_URL = "https://fcm.googleapis.com/fcm/send";
    private static final String FCM_SERVER_KEY = "REPLACE_WITH_YOUR_FIREBASE_SERVER_KEY";

    // ── APIs ──────────────────────────────────────────────────────────
    private static final String CRYPTO_IDS =
            "bitcoin,ethereum,ripple,solana,cardano,avalanche,dogecoin,"
            + "polkadot,chainlink,shiba-inu,tron,litecoin";
    private static final String CRYPTO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
            + "?ids=" + CRYPTO_IDS
            + "&vs_currencies=usd"
            + "&include_24hr_change=true";
    private static final String GOLD_URL = "https://api.metals.live/v1/spot/gold";
    private static final String[] STOCK_TICKERS = {"SPY", "QQQ", "AAPL", "MSFT"};
    private static final String STOCK_URL_TEMPLATE =
            "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=5d";

    // ── Preferences ───────────────────────────────────────────────────
    private static final String PREFS_NAME = "walletlens_notify";
    private static final String KEY_PRICES  = "saved_prices";
    private static final String KEY_TYPE    = "notif_type";
    private static final String KEY_HACK    = "hack_idx";
    private static final String KEY_ACADEMY = "academy_idx";
    private static final String KEY_FEATURE = "feature_idx";

    // ── Content ───────────────────────────────────────────────────────
    private static final String[][] HACKS = {
        {"📈 Dollar-Cost Averaging", "Invest fixed amounts regularly — removes emotions from timing the market"},
        {"🛡️ Diversification", "Spread across crypto, stocks, gold, cash — don't put all eggs in one basket"},
        {"📉 Buy the Dips", "When everyone is fearful, consider buying — markets always cycle"},
        {"💰 Compound Interest", "Reinvest gains to grow exponentially — time is your biggest ally"},
        {"🎯 Set Stop-Losses", "Define your exit before entering — protects from bad decisions"},
        {"📊 Rebalance Quarterly", "Adjust allocations every 3 months to maintain target risk"},
        {"🔍 DYOR", "Always research before investing — understand what you own"},
        {"💵 Emergency Fund First", "Keep 3-6 months of expenses in cash before investing"},
        {"📋 Track Everything", "Use WalletLens — what gets measured gets managed"},
        {"🧠 Avoid FOMO", "Fear of Missing Out leads to buying high — stay disciplined"},
        {"📅 Invest Consistently", "Small consistent investments beat timing the market"},
        {"🔒 Cold Storage", "Large crypto holdings belong in hardware wallets, not exchanges"},
        {"📊 Check Correlations", "Gold and stocks sometimes move together — know your portfolio"},
        {"💡 Tax-Loss Harvesting", "Sell losing positions to offset gains — WalletLens tracks P&L"},
        {"🌍 Think Globally", "International diversification reduces country-specific risk"},
        {"📈 Trend Following", "The trend is your friend — don't fight the market direction"},
        {"⚡ Stay Liquid", "Keep cash ready for opportunities during market dips"},
        {"📚 Never Stop Learning", "Best investors never stop learning — use Academy"},
        {"🎯 Set Goals", "Define financial goals — WalletLens milestones track progress"},
        {"💪 Stay Patient", "The market rewards patience — zoom out and think long-term"},
    };

    private static final String[][] ACADEMY = {
        {"🎓 What Is Market Cap?", "Market cap = price × supply. It tells you the size of an asset."},
        {"🎓 How To Read a Candlestick", "Green = price went up. Red = price went down."},
        {"🎓 What Is RSI?", "Relative Strength Index: above 70 = overbought, below 30 = oversold."},
        {"🎓 What Is MACD?", "Moving Average Convergence Divergence — shows trend changes."},
        {"🎓 What Is DCA?", "Dollar-Cost Averaging: invest fixed amounts at regular intervals."},
        {"🎓 What Is a Bull Market?", "Prices rising 20%+ from a recent low."},
        {"🎓 What Is a Bear Market?", "Prices falling 20%+ from a recent high."},
        {"🎓 What Are Bollinger Bands?", "Price bands that widen with volatility."},
        {"🎓 What Is On-Chain Analysis?", "Reading blockchain data — whale moves, wallet activity."},
        {"🎓 What Is Portfolio Rebalancing?", "Adjusting holdings to match your target allocation."},
        {"🎓 What Is Risk-Adjusted Return?", "Return per unit of risk. Sharpe ratio measures this."},
        {"🎓 What Is a Moving Average?", "Average price over N periods — smooths out noise."},
        {"🎓 What Is DeFi?", "Decentralized Finance — lending, borrowing without banks."},
        {"🎓 What Is Staking?", "Locking crypto to earn rewards — like interest on your coins."},
        {"🎓 What Is Yield Farming?", "Moving crypto between protocols to earn the best returns."},
        {"🎓 What Is Liquidity?", "How easily an asset can be bought/sold without moving the price."},
        {"🎓 What Is Volatility?", "How much the price moves. High volatility = high risk."},
        {"🎓 What Is a Limit Order?", "Buy/sell at a specific price — only executes at your price."},
        {"🎓 Market Cap vs FDV?", "MC = circulating supply × price. FDV = total supply × price."},
        {"🎓 What Is Fear & Greed Index?", "Sentiment gauge: 0 = extreme fear, 100 = extreme greed."},
    };

    private static final String[][] FEATURES = {
        {"🎙️ Voice Import", "Add holdings by speaking — tap the mic"},
        {"📸 Screenshot Import", "Screenshot any exchange — reads automatically"},
        {"📄 Excel Import", "Bulk-import holdings from a spreadsheet"},
        {"🔗 Wallet Import", "Paste ETH/BTC/SOL address — fetches live balances"},
        {"📤 Export to Excel", "Download portfolio with cost basis & P&L"},
        {"🎯 Price Targets", "Set alerts for any asset at your target price"},
        {"🤖 AI Coach", "Personalized AI analysis on your holdings"},
        {"📊 Market Index", "Live prices, heatmaps, and top movers"},
        {"⚡ Magic Indicator", "Buy/sell signals across all your assets"},
        {"🔬 Technical Analysis", "RSI, MACD, moving averages for any asset"},
        {"🏦 Multi-Exchange", "Binance, Coinbase, Kraken — all in one place"},
        {"💰 Multi-Asset", "Crypto + stocks + gold + cash in one dashboard"},
        {"📓 Trade Journal", "Record trades with notes, screenshots and P&L"},
        {"🔐 Biometric Lock", "Fingerprint or face unlock"},
        {"🔄 Rebalancing", "Optimal portfolio allocation calculator"},
        {"🐋 Whale Alerts", "Track large crypto transactions in real time"},
        {"📈 Portfolio Snapshot", "Net worth, P&L, allocation charts"},
        {"🌍 Multi-Language", "English, Arabic and more"},
        {"🔒 Privacy First", "No account — data stays on your device"},
        {"🆓 100% Free", "No premium tiers, ever"},
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

            // Cycle notification type: 0=price, 1=hack, 2=academy, 3=feature, 4=price(again)
            int type = prefs.getInt(KEY_TYPE, -1);
            type = (type + 1) % 5;
            prefs.edit().putInt(KEY_TYPE, type).apply();

            String title;
            String body;
            String url;

            switch (type) {
                case 0:
                case 4:
                    // Price update
                    title = "📊 Price Update";
                    body = fetchPriceSummary();
                    url = "https://walletlens.live/market-index";
                    break;
                case 1:
                    int hi = prefs.getInt(KEY_HACK, 0);
                    if (hi >= HACKS.length) hi = 0;
                    title = "💡 " + HACKS[hi][0];
                    body = HACKS[hi][1];
                    url = "https://walletlens.live/academy";
                    prefs.edit().putInt(KEY_HACK, hi + 1).apply();
                    break;
                case 2:
                    int ai = prefs.getInt(KEY_ACADEMY, 0);
                    if (ai >= ACADEMY.length) ai = 0;
                    title = ACADEMY[ai][0];
                    body = ACADEMY[ai][1];
                    url = "https://walletlens.live/academy";
                    prefs.edit().putInt(KEY_ACADEMY, ai + 1).apply();
                    break;
                default:
                    int fi = prefs.getInt(KEY_FEATURE, 0);
                    if (fi >= FEATURES.length) fi = 0;
                    title = "💡 " + FEATURES[fi][0];
                    body = FEATURES[fi][1];
                    url = "https://walletlens.live/dashboard";
                    prefs.edit().putInt(KEY_FEATURE, fi + 1).apply();
                    break;
            }

            // Send push notification via FCM self-push
            boolean sent = sendFcmPush(title, body, url);

            if (!sent) {
                // Fallback: show local notification
                NotificationHelper h = new NotificationHelper(getApplicationContext());
                h.showAlertNotification(title, body, url);
            }

            Log.d(TAG, "Notification sent: " + title);

        } catch (Exception e) {
            Log.e(TAG, "Worker error: " + e.getMessage(), e);
        }

        return Result.success();
    }

    // ── FCM self-push ─────────────────────────────────────────────────

    /**
     * Send a push notification to this device via the FCM legacy HTTP API.
     * Returns true if sent successfully, false if not configured.
     */
    private boolean sendFcmPush(String title, String body, String targetUrl) {
        if (FCM_SERVER_KEY.equals("REPLACE_WITH_YOUR_FIREBASE_SERVER_KEY")) {
            Log.d(TAG, "FCM server key not configured — using local notification");
            return false;
        }

        String token = WalletLensMessagingService.getToken(getApplicationContext());
        if (token == null || token.isEmpty()) {
            Log.d(TAG, "FCM token not available — using local notification");
            return false;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("to", token);

            JSONObject notification = new JSONObject();
            notification.put("title", title);
            notification.put("body", body);
            json.put("notification", notification);

            JSONObject data = new JSONObject();
            data.put("title", title);
            data.put("body", body);
            data.put("targetUrl", targetUrl);
            json.put("data", data);

            URI uri = new URI(FCM_SEND_URL);
            HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", "key=" + FCM_SERVER_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);

            OutputStream os = conn.getOutputStream();
            os.write(json.toString().getBytes());
            os.close();

            int status = conn.getResponseCode();
            conn.disconnect();

            if (status == 200) {
                Log.d(TAG, "FCM push sent successfully");
                return true;
            } else {
                Log.w(TAG, "FCM push failed with status: " + status);
                return false;
            }

        } catch (Exception e) {
            Log.w(TAG, "FCM push error: " + e.getMessage());
            return false;
        }
    }

    // ── Price fetching (for price update notifications) ────────────────

    private String fetchPriceSummary() {
        try {
            String json = httpGet(CRYPTO_URL);
            JSONObject data = new JSONObject(json);

            NumberFormat fmt = NumberFormat.getCurrencyInstance(Locale.US);
            StringBuilder sb = new StringBuilder();
            String[][] coins = {
                {"bitcoin", "BTC"}, {"ethereum", "ETH"}, {"solana", "SOL"}
            };

            for (String[] coin : coins) {
                if (data.has(coin[0])) {
                    JSONObject c = data.getJSONObject(coin[0]);
                    double price = c.getDouble("usd");
                    double change = c.optDouble("usd_24h_change", 0);
                    String arrow = change >= 0 ? "🟢" : "🔴";
                    if (sb.length() > 0) sb.append("\n");
                    sb.append(arrow).append(" ").append(coin[1]).append(" ")
                       .append(fmt.format(price)).append(" (")
                       .append(String.format(Locale.US, "%.1f", change)).append("%)");
                }
            }

            // Gold
            try {
                String goldJson = httpGet(GOLD_URL);
                org.json.JSONArray arr = new org.json.JSONArray(goldJson);
                if (arr.length() > 0) {
                    double goldPrice = arr.getJSONObject(0).getDouble("price");
                    if (sb.length() > 0) sb.append("\n");
                    sb.append("🥇 Gold $").append(String.format(Locale.US, "%.0f", goldPrice));
                }
            } catch (Exception ignored) {}

            if (sb.length() > 0) return sb.toString();
            return "Check market index for latest prices";
        } catch (Exception e) {
            return "Prices loading — check market index";
        }
    }

    private static String httpGet(String urlString) throws Exception {
        URI uri = new URI(urlString);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(10_000);
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
