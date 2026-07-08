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
import java.util.Random;

/**
 * Smart background notification engine for WalletLens.
 *
 * <p>Completely serverless and privacy-first. Fetches public data from free
 * APIs and shows engaging, context-aware local notifications.
 *
 * <h3>Notification types (rotated to avoid fatigue):</h3>
 * <ul>
 *   <li><b>MARKET_UPDATE</b> – BTC/ETH prices with 24h change</li>
 *   <li><b>FEAR_GREED</b> – Crypto Fear & Greed Index sentiment</li>
 *   <li><b>DAILY_REMINDER</b> – Time-of-day greeting + portfolio check</li>
 *   <li><b>WEEKLY_RECAP</b> – Weekend market roundup</li>
 *   <li><b>FEATURE_TIP</b> – Helpful tip about WalletLens features</li>
 *   <li><b>ENGAGEMENT</b> – Smart re-engagement message</li>
 * </ul>
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    // ── API endpoints ───────────────────────────────────────────────────
    private static final String COINGECKO_PRICE_URL =
            "https://api.coingecko.com/api/v3/simple/price"
                    + "?ids=bitcoin,ethereum"
                    + "&vs_currencies=usd"
                    + "&include_24hr_change=true";

    private static final String FEAR_GREED_URL =
            "https://api.alternative.me/fng/?limit=1";

    // ── SharedPreferences ───────────────────────────────────────────────
    private static final String PREFS_NAME = "walletlens_smart_notify";
    private static final String KEY_LAST_PRICES    = "last_prices_json";
    private static final String KEY_LAST_NOTIF_TYPE = "last_notif_type";
    private static final String KEY_NOTIF_COUNT     = "notif_count";
    private static final String KEY_LAST_WEEKLY_TS  = "last_weekly_ts";
    private static final String KEY_TIPS_SHOWN      = "tips_shown";

    // ── Notification types ──────────────────────────────────────────────
    private static final int TYPE_MARKET_UPDATE   = 0;
    private static final int TYPE_FEAR_GREED      = 1;
    private static final int TYPE_DAILY_REMINDER  = 2;
    private static final int TYPE_WEEKLY_RECAP    = 3;
    private static final int TYPE_FEATURE_TIP     = 4;
    private static final int TYPE_ENGAGEMENT      = 5;
    private static final int TYPE_COUNT           = 6;

    // ── Feature tips (rotated so user learns about the app) ─────────────
    private static final String[][] FEATURE_TIPS = {
        {"Add holdings by voice", "Did you know you can add assets by just speaking? Try the mic button!"},
        {"Import from screenshot", "Screenshot any exchange or wallet — WalletLens reads it automatically."},
        {"Export to Excel", "Download your full portfolio as Excel or tax-ready CSV anytime."},
        {"AI Portfolio Coach", "Ask the AI Coach for personalized portfolio analysis and advice."},
        {"Multi-currency support", "Track crypto, stocks, gold, real estate and cash in one place."},
        {"Price targets", "Set price alerts for any asset and get notified when targets are hit."},
        {"Fear & Greed Index", "Check the Fear & Greed Index to gauge market sentiment."},
        {"Portfolio rebalancing", "Use the rebalancing calculator to optimize your allocations."},
        {"No account needed", "Your data stays on your device — no sign-up, no tracking."},
        {"Biometric lock", "Secure your portfolio with fingerprint or face unlock."},
    };

    // ── Engagement messages ─────────────────────────────────────────────
    private static final String[] ENGAGEMENT_MSGS = {
        "Your portfolio is waiting — check what's moved since your last visit.",
        "Keep your finger on the pulse of your investments.",
        "Crypto markets never sleep — quick check-in?",
        "See how your assets are performing right now.",
        "Your financial snapshot is just a tap away.",
    };

    private final Random random = new Random();
    private final NotificationHelper notifHelper;
    private final SharedPreferences prefs;

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        this.notifHelper = new NotificationHelper(context);
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Smart notification worker started");

        try {
            // Choose which notification type to show
            int notifType = pickNotificationType();
            boolean shown = false;

            switch (notifType) {
                case TYPE_MARKET_UPDATE:
                    shown = tryMarketUpdate();
                    break;
                case TYPE_FEAR_GREED:
                    shown = tryFearGreed();
                    break;
                case TYPE_DAILY_REMINDER:
                    shown = tryDailyReminder();
                    break;
                case TYPE_WEEKLY_RECAP:
                    shown = tryWeeklyRecap();
                    break;
                case TYPE_FEATURE_TIP:
                    shown = tryFeatureTip();
                    break;
                case TYPE_ENGAGEMENT:
                    shown = tryEngagement();
                    break;
            }

            // Fallback: if chosen type couldn't show, try market update
            if (!shown) {
                shown = tryMarketUpdate();
            }

            // Save state
            if (shown) {
                prefs.edit()
                    .putInt(KEY_LAST_NOTIF_TYPE, notifType)
                    .putInt(KEY_NOTIF_COUNT, prefs.getInt(KEY_NOTIF_COUNT, 0) + 1)
                    .apply();
                Log.d(TAG, "Notification shown: type=" + notifType);
            } else {
                Log.d(TAG, "No notification this cycle");
            }

        } catch (Exception e) {
            Log.w(TAG, "Worker error", e);
        }

        return Result.success();
    }

    // ── Notification type selection ─────────────────────────────────────

    private int pickNotificationType() {
        int lastType = prefs.getInt(KEY_LAST_NOTIF_TYPE, -1);
        int totalCount = prefs.getInt(KEY_NOTIF_COUNT, 0);

        // Weekly recap on weekends (Saturday/Sunday)
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int dayOfWeek = cal.get(java.util.Calendar.DAY_OF_WEEK);
        long lastWeekly = prefs.getLong(KEY_LAST_WEEKLY_TS, 0);
        long now = System.currentTimeMillis();
        boolean isWeekend = (dayOfWeek == java.util.Calendar.SATURDAY || dayOfWeek == java.util.Calendar.SUNDAY);
        boolean weeklyDue = isWeekend && (now - lastWeekly > 7 * 24 * 60 * 60 * 1000L);

        if (weeklyDue) {
            return TYPE_WEEKLY_RECAP;
        }

        // Pick a type different from last time (avoid repetition)
        int[] candidates;
        if (totalCount < 3) {
            // First few notifications: market updates to give value immediately
            candidates = new int[]{TYPE_MARKET_UPDATE, TYPE_MARKET_UPDATE, TYPE_MARKET_UPDATE, TYPE_FEAR_GREED};
        } else {
            candidates = new int[]{
                TYPE_MARKET_UPDATE, TYPE_FEAR_GREED, TYPE_DAILY_REMINDER,
                TYPE_FEATURE_TIP, TYPE_ENGAGEMENT, TYPE_MARKET_UPDATE
            };
        }

        int choice;
        int attempts = 0;
        do {
            choice = candidates[random.nextInt(candidates.length)];
            attempts++;
        } while (choice == lastType && attempts < 10);

        return choice;
    }

    // ── 1. Market update (BTC/ETH prices) ───────────────────────────────

    private boolean tryMarketUpdate() throws Exception {
        String json = httpGet(COINGECKO_PRICE_URL);
        JSONObject data = new JSONObject(json);

        double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
        double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
        double btcChange = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
        double ethChange = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

        String newPricesJson = String.format(Locale.US,
                "{\"btc\":%.2f,\"eth\":%.2f}",
                btcPrice, ethPrice);
        String oldPricesJson = prefs.getString(KEY_LAST_PRICES, null);
        prefs.edit().putString(KEY_LAST_PRICES, newPricesJson).apply();

        // Check if prices moved significantly (or always show on first run)
        boolean significantMove = true;
        if (oldPricesJson != null) {
            try {
                JSONObject old = new JSONObject(oldPricesJson);
                double oldBtc = old.getDouble("btc");
                double btcMove = Math.abs(btcPrice - oldBtc) / oldBtc;
                significantMove = btcMove > 0.01; // 1% move threshold
            } catch (Exception e) {
                significantMove = true;
            }
        }

        // Always show the first time, otherwise only for significant moves
        if (!significantMove) {
            return false;
        }

        NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);
        String btcStr = currencyFmt.format(btcPrice);
        String ethStr = currencyFmt.format(ethPrice);

        // Determine market mood
        String mood = (btcChange + ethChange) / 2 > 0 ? "📈 Green" : "📉 Red";

        String timeGreeting = getTimeGreeting();
        String title = timeGreeting + " — Market Update";
        String body = String.format(Locale.US,
                "BTC: %s (%.1f%%)\nETH: %s (%.1f%%)",
                btcStr, btcChange, ethStr, ethChange);

        notifHelper.showAlertNotification(title, body, "https://walletlens.live/market-index");
        return true;
    }

    // ── 2. Fear & Greed Index ──────────────────────────────────────────

    private boolean tryFearGreed() throws Exception {
        String json = httpGet(FEAR_GREED_URL);
        JSONObject data = new JSONObject(json);
        JSONArray arr = data.getJSONArray("data");
        JSONObject latest = arr.getJSONObject(0);

        int value = latest.getInt("value");
        String classification = latest.optString("value_classification", "Neutral");
        String timestamp = latest.optString("timestamp", "");

        // Only show if classification changed or once per day
        int lastValue = prefs.getInt("last_fng_value", -1);
        if (lastValue == value) {
            long lastFngTs = prefs.getLong("last_fng_ts", 0);
            if (System.currentTimeMillis() - lastFngTs < 24 * 60 * 60 * 1000L) {
                return false; // Already shown today
            }
        }
        prefs.edit().putInt("last_fng_value", value).putLong("last_fng_ts", System.currentTimeMillis()).apply();

        // Emoji based on sentiment
        String emoji;
        if (value <= 25) emoji = "😱";
        else if (value <= 45) emoji = "😰";
        else if (value <= 55) emoji = "😐";
        else if (value <= 75) emoji = "😊";
        else emoji = "🚀";

        String title = getTimeGreeting() + " — " + emoji + " Fear & Greed: " + value;
        String body = "Market sentiment is **" + classification + "** ("
                + value + "/100). " + getFngAdvice(classification);

        notifHelper.showAlertNotification(title, body, "https://walletlens.live/fear-and-greed-index");
        return true;
    }

    private String getFngAdvice(String classification) {
        switch (classification.toLowerCase()) {
            case "extreme fear": return "Extreme fear can signal buying opportunities.";
            case "fear": return "Caution rules — review your risk levels.";
            case "neutral": return "Markets are balanced. Stick to your strategy.";
            case "greed": return "Greed is high — consider taking some profits.";
            case "extreme greed": return "Market euphoria! Time to consider rebalancing.";
            default: return "Stay informed with WalletLens.";
        }
    }

    // ── 3. Daily reminder ──────────────────────────────────────────────

    private boolean tryDailyReminder() {
        long lastDaily = prefs.getLong("last_daily_ts", 0);
        if (System.currentTimeMillis() - lastDaily < 20 * 60 * 60 * 1000L) {
            return false; // Once per day max
        }
        prefs.edit().putLong("last_daily_ts", System.currentTimeMillis()).apply();

        String greeting = getTimeGreeting();
        String[] messages = {
            "Your portfolio snapshot is ready. See what's changed!",
            "Quick check-in: your assets are performing.",
            "Take a moment to review your financial goals.",
            "See how your portfolio is doing in today's market.",
        };

        String title = greeting + " 👋";
        String body = messages[random.nextInt(messages.length)];

        notifHelper.showNotification(title, body, "https://walletlens.live/dashboard", null);
        return true;
    }

    // ── 4. Weekly recap ────────────────────────────────────────────────

    private boolean tryWeeklyRecap() throws Exception {
        String json = httpGet(COINGECKO_PRICE_URL);
        JSONObject data = new JSONObject(json);

        double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
        double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
        double btcChange = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
        double ethChange = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

        NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);
        String btcStr = currencyFmt.format(btcPrice);
        String ethStr = currencyFmt.format(ethPrice);

        prefs.edit().putLong(KEY_LAST_WEEKLY_TS, System.currentTimeMillis()).apply();

        String dayName = new SimpleDateFormat("EEEE", Locale.US).format(new Date());
        String title = "📊 Weekly Market Recap — " + dayName;
        String body = String.format(Locale.US,
                "BTC: %s (%.1f%% this week)\nETH: %s (%.1f%% this week)",
                btcStr, btcChange, ethStr, ethChange);

        notifHelper.showAlertNotification(title, body, "https://walletlens.live/market-index");
        return true;
    }

    // ── 5. Feature tip ─────────────────────────────────────────────────

    private boolean tryFeatureTip() {
        // Track which tips have been shown
        int tipsShown = prefs.getInt(KEY_TIPS_SHOWN, 0);
        if (tipsShown >= FEATURE_TIPS.length) {
            // All tips shown, reset cycle
            tipsShown = 0;
        }

        long lastTipTs = prefs.getLong("last_tip_ts", 0);
        if (System.currentTimeMillis() - lastTipTs < 48 * 60 * 60 * 1000L) {
            return false; // Every 2 days max
        }

        String[] tip = FEATURE_TIPS[tipsShown];
        prefs.edit()
            .putInt(KEY_TIPS_SHOWN, tipsShown + 1)
            .putLong("last_tip_ts", System.currentTimeMillis())
            .apply();

        String title = "💡 Tip: " + tip[0];
        String body = tip[1];

        notifHelper.showNotification(title, body, "https://walletlens.live/dashboard", null);
        return true;
    }

    // ── 6. Engagement notification ─────────────────────────────────────

    private boolean tryEngagement() {
        long lastEngagement = prefs.getLong("last_engagement_ts", 0);
        if (System.currentTimeMillis() - lastEngagement < 72 * 60 * 60 * 1000L) {
            return false; // Every 3 days max
        }
        prefs.edit().putLong("last_engagement_ts", System.currentTimeMillis()).apply();

        String greeting = getTimeGreeting();
        String msg = ENGAGEMENT_MSGS[random.nextInt(ENGAGEMENT_MSGS.length)];

        String title = greeting + " — Don't miss out";
        String body = msg;

        notifHelper.showAlertNotification(title, body, "https://walletlens.live/dashboard");
        return true;
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /** Return time-appropriate greeting. */
    private String getTimeGreeting() {
        int hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY);
        if (hour < 12) return "Good morning ☀️";
        if (hour < 17) return "Good afternoon 🌤️";
        return "Good evening 🌙";
    }

    /** Format percentage with leading + for positive values (Java 8 compatible). */
    private static String formatPercent(NumberFormat fmt, double change) {
        String formatted = fmt.format(change / 100.0);
        if (change > 0) {
            return "+" + formatted;
        }
        return formatted;
    }

    /** Simple HTTP GET returning the response body as a string. */
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
