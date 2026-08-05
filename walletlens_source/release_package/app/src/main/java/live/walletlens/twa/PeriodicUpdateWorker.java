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
import java.util.Locale;

/**
 * Background worker — runs every 30 min via WorkManager.
 *
 * Sends push notifications cycling through:
 * 1. Price alerts (crypto, gold, silver, stocks)
 * 2. Investment hacks (wealth-building strategies)
 * 3. Academy tips (investing education)
 * 4. Feature tips (app capabilities)
 *
 * Each notification includes a deep-link URL so tapping opens the
 * relevant page inside the TWA.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

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

    // ── Preferences ───────────────────────────────────────────────────
    private static final String PREFS_NAME = "walletlens_notify";
    private static final String KEY_PRICES  = "saved_prices";
    private static final String KEY_TYPE    = "notif_type";
    private static final String KEY_HACK    = "hack_idx";
    private static final String KEY_ACADEMY = "academy_idx";
    private static final String KEY_FEATURE = "feature_idx";

    // ── Content arrays: {title, body, deepLinkUrl} ────────────────────
    private static final String[][] HACKS = {
        {"📈 Dollar-Cost Averaging", "Invest fixed amounts regularly — removes emotions from timing the market", "https://walletlens.live/academy"},
        {"🛡️ Diversification", "Spread across crypto, stocks, gold, cash — don't put all eggs in one basket", "https://walletlens.live/academy"},
        {"📉 Buy the Dips", "When everyone is fearful, consider buying — markets always cycle", "https://walletlens.live/market-index"},
        {"💰 Compound Interest", "Reinvest gains to grow exponentially — time is your biggest ally", "https://walletlens.live/academy"},
        {"🎯 Set Stop-Losses", "Define your exit before entering — protects from bad decisions", "https://walletlens.live/academy"},
        {"📊 Rebalance Quarterly", "Adjust allocations every 3 months to maintain target risk", "https://walletlens.live/dashboard"},
        {"🔍 DYOR", "Always research before investing — understand what you own", "https://walletlens.live/academy"},
        {"💵 Emergency Fund First", "Keep 3-6 months of expenses in cash before investing", "https://walletlens.live/academy"},
        {"📋 Track Everything", "Use WalletLens — what gets measured gets managed", "https://walletlens.live/dashboard"},
        {"🧠 Avoid FOMO", "Fear of Missing Out leads to buying high — stay disciplined", "https://walletlens.live/academy"},
        {"📅 Invest Consistently", "Small consistent investments beat timing the market", "https://walletlens.live/dashboard"},
        {"🔒 Cold Storage", "Large crypto holdings belong in hardware wallets, not exchanges", "https://walletlens.live/market-index"},
        {"📊 Check Correlations", "Gold and stocks sometimes move together — know your portfolio", "https://walletlens.live/dashboard"},
        {"💡 Tax-Loss Harvesting", "Sell losing positions to offset gains — WalletLens tracks P&L", "https://walletlens.live/dashboard"},
        {"🌍 Think Globally", "International diversification reduces country-specific risk", "https://walletlens.live/market-index"},
        {"📈 Trend Following", "The trend is your friend — don't fight the market direction", "https://walletlens.live/market-index"},
        {"⚡ Stay Liquid", "Keep cash ready for opportunities during market dips", "https://walletlens.live/dashboard"},
        {"📚 Never Stop Learning", "Best investors never stop learning — use Academy", "https://walletlens.live/academy"},
        {"🎯 Set Goals", "Define financial goals — WalletLens milestones track progress", "https://walletlens.live/dashboard"},
        {"💪 Stay Calm", "Markets crash and recover — panic selling locks in losses", "https://walletlens.live/fear-and-greed-index"}
    };

    private static final String[][] ACADEMY = {
        {"🎓 What is RSI?", "Relative Strength Index — measures overbought/oversold conditions above 70 or below 30", "https://walletlens.live/academy"},
        {"📈 MACD Explained", "Moving Average Convergence Divergence — trend-following momentum indicator", "https://walletlens.live/academy"},
        {"📊 Bollinger Bands", "Volatility bands plotted 2 standard deviations from a moving average", "https://walletlens.live/academy"},
        {"🕯️ Candlestick Patterns", "Learn Doji, Hammer, Engulfing and other patterns to read price action", "https://walletlens.live/academy"},
        {"📉 Support & Resistance", "Key price levels where buying or selling pressure concentrates", "https://walletlens.live/academy"},
        {"⚖️ Risk-Reward Ratio", "Always calculate potential loss vs gain before entering a trade", "https://walletlens.live/academy"},
        {"🧮 Position Sizing", "Never risk more than 1-2% of portfolio on a single trade", "https://walletlens.live/dashboard"},
        {"📉 Volatility Index (VIX)", "The VIX measures market fear — high readings mean high uncertainty", "https://walletlens.live/fear-and-greed-index"},
        {"🔄 Dollar-Cost Averaging", "Invest a fixed amount on a schedule regardless of price", "https://walletlens.live/dashboard"},
        {"🎯 Asset Allocation", "Divide your portfolio between stocks, bonds, crypto based on goals", "https://walletlens.live/dashboard"},
        {"📊 Market Cap Weighted", "Large-cap assets carry more weight in most index funds", "https://walletlens.live/market-index"},
        {"🌍 Global Macro", "Interest rates, inflation and geopolitics drive all markets", "https://walletlens.live/market-index"},
        {"💡 On-Chain Analysis", "Blockchain data reveals whale movements and network health", "https://walletlens.live/market-index"},
        {"📊 Relative Strength", "Compare asset performance vs benchmark to find winners", "https://walletlens.live/market-index"},
        {"🧠 Sentiment Analysis", "Social metrics and fear/greed index gauge market mood", "https://walletlens.live/fear-and-greed-index"},
        {"⚡ Lightning Network", "Bitcoin's Layer 2 for instant low-fee payments", "https://walletlens.live/market-index"},
        {"🔐 Hardware Wallets", "Store private keys offline — immune to online hacks", "https://walletlens.live/dashboard"},
        {"📉 Drawdown Recovery", "A 50% drop needs 100% gain to break even — manage risk", "https://walletlens.live/dashboard"},
        {"🏦 DeFi Explained", "Decentralised Finance — lend, borrow and earn without intermediaries", "https://walletlens.live/market-index"},
        {"📜 Whitepaper Reading", "Always read the whitepaper — understand what you invest in", "https://walletlens.live/academy"}
    };

    // Feature notifications lead with the four things no other free tracker
    // does. The worker walks this array in order, so the exclusives are first
    // and the list is kept short — a user sees them within their first few
    // feature notifications instead of buried behind generic ones.
    //
    // Deep links point at where the feature actually lives: import and backup
    // are surfaces inside /dashboard, Guardian has its own route.
    private static final String[][] FEATURES = {
        // ── The four exclusives ────────────────────────────────────────────
        {"🛡️ Portfolio Guardian", "Set a check-in. If you ever stop responding, your holdings reach the people you chose", "https://walletlens.live/guardian"},
        {"📸 Screenshot Import", "Screenshot your exchange app — WalletLens reads every holding straight off the image", "https://walletlens.live/dashboard"},
        {"🎙️ Voice Import", "Just say it: 'I bought 0.5 BTC at 60k' and the trade is logged", "https://walletlens.live/dashboard"},
        {"📲 Move to a New Phone", "Scan one QR code to carry your whole portfolio across — no account, no cloud", "https://walletlens.live/dashboard"},

        // ── Second pass on the same four, different angle ──────────────────
        {"🛡️ Your Dead-Man's Switch", "Portfolio Guardian makes sure your crypto isn't lost if you can't reach it", "https://walletlens.live/guardian"},
        {"📸 Skip the Typing", "Import a whole exchange balance from one screenshot — Binance, Coinbase, anything", "https://walletlens.live/dashboard"},
        {"🎙️ Log Trades Hands-Free", "Speak several trades in one sentence — English or Arabic", "https://walletlens.live/dashboard"},
        {"📲 Portfolio in a QR Code", "Your entire portfolio as a scannable code. Move devices in seconds", "https://walletlens.live/dashboard"},

        // ── Supporting features ────────────────────────────────────────────
        {"🤖 AI Advisor", "Health score, diversification grade and a stress test on your real holdings", "https://walletlens.live/dashboard"},
        {"🔒 Biometric Lock", "Fingerprint or face unlock before your net worth is visible", "https://walletlens.live/settings"},
        {"😱 Fear & Greed", "Know the market's mood before you trade", "https://walletlens.live/fear-and-greed-index"},
        {"🐋 Whale Alerts", "Track large crypto transactions in real time", "https://walletlens.live/market-index"}
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

            // Cycle notification type: 0=price, 1=hack, 2=academy, 3=feature, 4=price again
            int type = prefs.getInt(KEY_TYPE, -1);
            type = (type + 1) % 5;
            prefs.edit().putInt(KEY_TYPE, type).apply();

            String title;
            String body;
            String url;

            switch (type) {
                case 0:
                case 4:
                    // Price update — deep link to market index
                    title = "📊 Price Update";
                    body = fetchPriceSummary();
                    url = "https://walletlens.live/market-index";
                    break;
                case 1: {
                    int hi = prefs.getInt(KEY_HACK, 0);
                    if (hi >= HACKS.length) hi = 0;
                    title = "💡 " + HACKS[hi][0];
                    body = HACKS[hi][1];
                    url = HACKS[hi][2];
                    prefs.edit().putInt(KEY_HACK, hi + 1).apply();
                    break;
                }
                case 2: {
                    int ai = prefs.getInt(KEY_ACADEMY, 0);
                    if (ai >= ACADEMY.length) ai = 0;
                    title = ACADEMY[ai][0];
                    body = ACADEMY[ai][1];
                    url = ACADEMY[ai][2];
                    prefs.edit().putInt(KEY_ACADEMY, ai + 1).apply();
                    break;
                }
                default: {
                    int fi = prefs.getInt(KEY_FEATURE, 0);
                    if (fi >= FEATURES.length) fi = 0;
                    title = "💡 " + FEATURES[fi][0];
                    body = FEATURES[fi][1];
                    url = FEATURES[fi][2];
                    prefs.edit().putInt(KEY_FEATURE, fi + 1).apply();
                    break;
                }
            }

            // Local notification with deep link. (A former FCM "self-push"
            // path was removed: it targeted the legacy FCM HTTP API, which
            // Google shut down, and a device pushing to itself gains nothing
            // over a local notification.)
            NotificationHelper h = new NotificationHelper(getApplicationContext());
            h.showAlertNotification(title, body, url);

            Log.d(TAG, "Notification sent: " + title + " -> " + url);

        } catch (Throwable e) {
            Log.e(TAG, "Worker error: " + e.getMessage(), e);
        }

        return Result.success();
    }

    // ── Price fetching ────────────────────────────────────────────────

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
            } catch (Throwable ignored) {}

            if (sb.length() > 0) return sb.toString();
            return "Check market index for latest prices";
        } catch (Throwable e) {
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
