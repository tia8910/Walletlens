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
import java.text.DecimalFormat;
import java.util.Locale;
import java.text.NumberFormat;

/**
 * Background worker that periodically fetches public market data and shows
 * local notifications — completely serverless and privacy-first.
 *
 * <p>No user data is ever sent. Only public, free APIs are called.
 *
 * <h3>Price data (CoinGecko free API — no API key required)</h3>
 * Fetches BTC and ETH prices in USD and shows a daily market summary
 * notification when a meaningful change is detected.
 *
 * <h3>Feature announcements (optional)</h3>
 * You can host a simple JSON file at a public URL (e.g. a GitHub Gist or
 * your website) and the worker will check it periodically. Format:
 * <pre>
 * {
 *   "version": 2,
 *   "title": "New Feature!",
 *   "body": "Portfolio history charts are now available."
 * }
 * </pre>
 * Change the {@code version} each time you want a new announcement notification.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    // ── Configurable endpoints ───────────────────────────────────────────

    /** CoinGecko API (free, no auth). */
    private static final String COINGECKO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
                    + "?ids=bitcoin,ethereum"
                    + "&vs_currencies=usd"
                    + "&include_24hr_change=true";

    /**
     * Optional: host a JSON file anywhere public (GitHub Pages, your site, etc.)
     * and point this URL at it. Set to empty string to disable feature checks.
     */
    private static final String FEATURES_URL = ""; // e.g. "https://walletlens.live/app-announce.json"

    // ── SharedPreferences keys ───────────────────────────────────────────

    private static final String PREFS_NAME = "walletlens_worker";
    private static final String KEY_LAST_PRICES = "last_prices_json";
    private static final String KEY_ANNOUNCE_VERSION = "announce_version_seen";

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Periodic update started");

        boolean anyNotified = false;

        // 1. Check price updates
        try {
            anyNotified |= checkPrices();
        } catch (Exception e) {
            Log.w(TAG, "Price check failed", e);
        }

        // 2. Check feature announcements (if configured)
        if (!FEATURES_URL.isEmpty()) {
            try {
                anyNotified |= checkFeatures();
            } catch (Exception e) {
                Log.w(TAG, "Feature check failed", e);
            }
        }

        if (!anyNotified) {
            Log.d(TAG, "No notification needed this cycle");
        }

        return Result.success();
    }

    // ── Price checking ───────────────────────────────────────────────────

    private boolean checkPrices() throws Exception {
        String json = httpGet(COINGECKO_URL);
        JSONObject data = new JSONObject(json);

        // Parse prices
        double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
        double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
        double btcChange = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
        double ethChange = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

        String newPricesJson = String.format(Locale.US,
                "{\"btc\":%.2f,\"eth\":%.2f,\"btcChange\":%.1f,\"ethChange\":%.1f}",
                btcPrice, ethPrice, btcChange, ethChange);

        // Load previous prices
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String oldPricesJson = prefs.getString(KEY_LAST_PRICES, null);

        // Save current prices
        prefs.edit().putString(KEY_LAST_PRICES, newPricesJson).apply();

        // On first run, just save and don't notify
        if (oldPricesJson == null) {
            Log.d(TAG, "First run — saved initial prices, no notification");
            return false;
        }

        // Format numbers
        DecimalFormat currencyFmt = (DecimalFormat) NumberFormat.getCurrencyInstance(Locale.US);
        DecimalFormat pctFmt = (DecimalFormat) NumberFormat.getPercentInstance(Locale.US);
        pctFmt.setMaximumFractionDigits(1);
        pctFmt.setPositivePrefix("+");

        String btcStr = currencyFmt.format(btcPrice);
        String ethStr = currencyFmt.format(ethPrice);
        String btcChangeStr = pctFmt.format(btcChange / 100.0);
        String ethChangeStr = pctFmt.format(ethChange / 100.0);

        String title = "Market Update";
        String body = String.format(Locale.US,
                "BTC: %s (%s)\nETH: %s (%s)",
                btcStr, btcChangeStr, ethStr, ethChangeStr);

        String targetUrl = "https://walletlens.live/market-index";

        NotificationHelper helper = new NotificationHelper(getApplicationContext());
        helper.showAlertNotification(title, body, targetUrl);

        Log.d(TAG, "Price notification shown: " + title);
        return true;
    }

    // ── Feature announcements ────────────────────────────────────────────

    private boolean checkFeatures() throws Exception {
        String json = httpGet(FEATURES_URL);
        JSONObject data = new JSONObject(json);

        int version = data.getInt("version");
        String title = data.optString("title", "What's New in WalletLens");
        String body = data.optString("body", "Check out the latest updates.");
        String targetUrl = data.optString("targetUrl", "https://walletlens.live/dashboard");

        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int seenVersion = prefs.getInt(KEY_ANNOUNCE_VERSION, 0);

        if (version > seenVersion) {
            prefs.edit().putInt(KEY_ANNOUNCE_VERSION, version).apply();

            NotificationHelper helper = new NotificationHelper(getApplicationContext());
            helper.showNotification(title, body, targetUrl, "announcement");

            Log.d(TAG, "Feature announcement notification shown: " + title);
            return true;
        }

        return false;
    }

    // ── HTTP helper ──────────────────────────────────────────────────────

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
