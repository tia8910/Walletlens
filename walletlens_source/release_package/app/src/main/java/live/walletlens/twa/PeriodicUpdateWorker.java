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
 * Background price checker — runs every 3 hours, only notifies on
 * meaningful BTC/ETH price movements (>1% since last check).
 *
 * <p>Silent when prices are stable. No ads, no spam, no daily reminders.
 * Privacy-first: only fetches public CoinGecko data.
 */
public class PeriodicUpdateWorker extends Worker {

    private static final String TAG = "WalletLensWorker";

    private static final String COINGECKO_URL =
            "https://api.coingecko.com/api/v3/simple/price"
                    + "?ids=bitcoin,ethereum"
                    + "&vs_currencies=usd"
                    + "&include_24hr_change=true";

    private static final String PREFS_NAME = "walletlens_prices";
    private static final String KEY_LAST_BTC = "last_btc";
    private static final String KEY_LAST_ETH = "last_eth";

    /** Notify only if price moved more than this % since last check. */
    private static final double MOVE_THRESHOLD_PCT = 1.0;

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Price check started");

        try {
            String json = httpGet(COINGECKO_URL);
            JSONObject data = new JSONObject(json);

            double btcPrice = data.getJSONObject("bitcoin").getDouble("usd");
            double ethPrice = data.getJSONObject("ethereum").getDouble("usd");
            double btcChange24h = data.getJSONObject("bitcoin").optDouble("usd_24h_change", 0);
            double ethChange24h = data.getJSONObject("ethereum").optDouble("usd_24h_change", 0);

            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            double lastBtc = prefs.getFloat(KEY_LAST_BTC, 0f);
            double lastEth = prefs.getFloat(KEY_LAST_ETH, 0f);

            // Save current prices
            prefs.edit()
                    .putFloat(KEY_LAST_BTC, (float) btcPrice)
                    .putFloat(KEY_LAST_ETH, (float) ethPrice)
                    .apply();

            // On first run, just save and don't notify
            if (lastBtc == 0 || lastEth == 0) {
                Log.d(TAG, "First run — saved prices, no notification");
                return Result.success();
            }

            // Check if price moved significantly since last check
            double btcMove = Math.abs(btcPrice - lastBtc) / lastBtc * 100;
            double ethMove = Math.abs(ethPrice - lastEth) / lastEth * 100;

            boolean btcMoved = btcMove >= MOVE_THRESHOLD_PCT;
            boolean ethMoved = ethMove >= MOVE_THRESHOLD_PCT;

            if (!btcMoved && !ethMoved) {
                Log.d(TAG, String.format(Locale.US,
                        "Prices stable — BTC: %.2f%% ETH: %.2f%% (threshold: %.1f%%)",
                        btcMove, ethMove, MOVE_THRESHOLD_PCT));
                return Result.success();
            }

            // Build notification
            NumberFormat currencyFmt = NumberFormat.getCurrencyInstance(Locale.US);
            String btcStr = currencyFmt.format(btcPrice);
            String ethStr = currencyFmt.format(ethPrice);

            String title = "📊 Price Alert";
            String body = String.format(Locale.US,
                    "BTC: %s (%.1f%% · 24h: %.1f%%)\nETH: %s (%.1f%% · 24h: %.1f%%)",
                    btcStr, btcMove, btcChange24h,
                    ethStr, ethMove, ethChange24h);

            NotificationHelper helper = new NotificationHelper(getApplicationContext());
            helper.showAlertNotification(title, body, "https://walletlens.live/market-index");

            Log.d(TAG, "Price alert sent — BTC moved " + String.format(Locale.US, "%.1f", btcMove) + "%");

        } catch (Exception e) {
            Log.w(TAG, "Price check failed", e);
        }

        return Result.success();
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
