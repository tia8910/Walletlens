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
 * Lightweight once-daily worker that checks for significant market moves.
 *
 * <p>This is a <b>privacy-first fallback</b> — the main notification channels
 * are the web app's {@code portfolioNotify.js} (portfolio 5% changes, price
 * targets when the app is open) and Firebase Cloud Messaging (instant push
 * when the app is closed, requires a server).
 *
 * <p>This worker only fires a notification if BTC or ETH moved more than
 * 2% in the last 24 hours. Otherwise it stays completely silent.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    private static final String COINGECKO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
                    + "?ids=bitcoin,ethereum"
                    + "&vs_currencies=usd"
                    + "&include_24hr_change=true";

    private static final String PREFS_NAME = "walletlens_notify_state";
    private static final String KEY_LAST_PRICES = "last_prices_json";
    private static final String KEY_LAST_DAILY_TS = "last_daily_ts";

    /** Only notify if 24h change exceeds this threshold (absolute). */
    private static final double SIGNIFICANT_MOVE_PCT = 2.0;

    private final Random random = new Random();

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Daily market pulse started");

        try {
            // Fetch current prices
            String json = httpGet(COINGECKO_URL);
            JSONObject data = new JSONObject(json);

            double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
            double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
            double btcChange = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
            double ethChange = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            // Save current prices
            String newPricesJson = String.format(Locale.US,
                    "{\"btc\":%.2f,\"eth\":%.2f}",
                    btcPrice, ethPrice);
            String oldPricesJson = prefs.getString(KEY_LAST_PRICES, null);
            prefs.edit().putString(KEY_LAST_PRICES, newPricesJson).apply();

            // Check if there's a significant move
            boolean btcSignificant = Math.abs(btcChange) >= SIGNIFICANT_MOVE_PCT;
            boolean ethSignificant = Math.abs(ethChange) >= SIGNIFICANT_MOVE_PCT;

            if (!btcSignificant && !ethSignificant) {
                Log.d(TAG, "No significant market move detected (BTC: " +
                        String.format(Locale.US, "%.1f", btcChange) +
                        "%, ETH: " + String.format(Locale.US, "%.1f", ethChange) + "%)");
                return Result.success();
            }

            // Only show one notification per day max
            long lastDaily = prefs.getLong(KEY_LAST_DAILY_TS, 0);
            if (System.currentTimeMillis() - lastDaily < 20 * 60 * 60 * 1000L) {
                Log.d(TAG, "Daily notification already shown today, skipping");
                return Result.success();
            }
            prefs.edit().putLong(KEY_LAST_DAILY_TS, System.currentTimeMillis()).apply();

            // Build the notification
            NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);
            String btcStr = currencyFmt.format(btcPrice);
            String ethStr = currencyFmt.format(ethPrice);

            String dayName = new SimpleDateFormat("EEEE", Locale.US).format(new Date());
            String title = "📊 Market Alert — " + dayName;
            String body = String.format(Locale.US,
                    "BTC: %s (%.1f%%)\nETH: %s (%.1f%%)",
                    btcStr, btcChange, ethStr, ethChange);

            NotificationHelper helper = new NotificationHelper(getApplicationContext());
            helper.showAlertNotification(title, body, "https://walletlens.live/market-index");

            Log.d(TAG, "Significant market move notification sent");

        } catch (Exception e) {
            Log.w(TAG, "Daily pulse check failed", e);
        }

        return Result.success();
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
