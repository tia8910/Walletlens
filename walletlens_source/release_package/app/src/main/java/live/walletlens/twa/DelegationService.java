package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;

/**
 * Handles notification delegation and web-to-native communication
 * for the WalletLens TWA.
 *
 * <p>Notifications from the web app (PWA) are automatically shown
 * using the app's own notification channels via the parent class.
 *
 * <p>The {@link #onExtraCallback} method receives portfolio asset data
 * from the web app, which the background worker uses to fetch prices
 * for the user's specific holdings — crypto, stocks, gold, silver, etc.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    private static final String TAG = "WalletLensDelegate";

    /** SharedPreferences key for user's portfolio assets list. */
    private static final String PREFS_NAME = "walletlens_portfolio";
    private static final String KEY_USER_ASSETS = "user_assets"; // JSON array of coin/ticker IDs

    @Override
    public void onCreate() {
        super.onCreate();

        // Create branded notification channels so web-delegated
        // notifications use the app's channels, not Chrome's.
        new NotificationHelper(this).createChannels();

        Log.d(TAG, "DelegationService ready");
    }

    /**
     * Called when the web app sends data via
     * {@code twa.postMessage()} or {@code twa.extraCallback()}.
     *
     * <p>The web app's {@code portfolioNotify.js} sends the user's
     * portfolio assets (coin IDs, stock tickers, etc.) so the
     * background worker can fetch their prices.
     *
     * <p>Expected payload format (JSON in the "assets" key):
     * <pre>
     * ["bitcoin", "ethereum", "spy", "xau", "aapl", ...]
     * </pre>
     */
    @Override
    public void onExtraCallback(@NonNull String callbackName,
                                 @Nullable Bundle args) {
        super.onExtraCallback(callbackName, args);

        if (!"updateAssets".equals(callbackName)) {
            Log.d(TAG, "Ignoring callback: " + callbackName);
            return;
        }

        if (args == null || !args.containsKey("assets")) {
            Log.w(TAG, "updateAssets callback missing 'assets' key");
            return;
        }

        String assetsJson = args.getString("assets", "[]");
        Log.d(TAG, "Received portfolio assets: " + assetsJson);

        // Validate and store
        try {
            JSONArray assets = new JSONArray(assetsJson);
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_USER_ASSETS, assetsJson).apply();
            Log.d(TAG, "Stored " + assets.length() + " portfolio assets");
        } catch (Exception e) {
            Log.w(TAG, "Invalid assets JSON", e);
        }
    }

    /**
     * Read the user's portfolio assets stored by the web app.
     * Used by {@link PeriodicUpdateWorker} to fetch prices.
     */
    @Nullable
    public static String[] getPortfolioAssets(@NonNull Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_USER_ASSETS, null);
        if (json == null) return null;

        try {
            JSONArray arr = new JSONArray(json);
            String[] result = new String[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                result[i] = arr.getString(i);
            }
            return result;
        } catch (Exception e) {
            Log.w(TAG, "Failed to read assets", e);
            return null;
        }
    }
}
