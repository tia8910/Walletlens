package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.content.res.Resources;
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
    // ── Notification copy ──────────────────────────────────────────────
    // Titles and bodies live in res/values*/notification_copy.xml, one file
    // per language, because these are the strings a user reads on their lock
    // screen and they have to follow the language chosen inside the app.
    // They used to be English string literals right here, so an app running in
    // Arabic still sent English notifications.
    //
    // Only the deep links stay in Java: they are not translatable, and having
    // one copy rather than four removes any chance of them drifting apart.
    // Each URL array must stay the same length, and in the same order, as the
    // matching *_titles / *_bodies array.
    private static final String[] HACK_URLS = {
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/market-index",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/academy",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/market-index",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/market-index",
        "https://walletlens.live/market-index",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/academy",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/fear-and-greed-index"
    };

    private static final String[] ACADEMY_URLS = {
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/academy",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/fear-and-greed-index",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/market-index",
        "https://walletlens.live/market-index",
        "https://walletlens.live/market-index",
        "https://walletlens.live/market-index",
        "https://walletlens.live/fear-and-greed-index",
        "https://walletlens.live/market-index",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/market-index",
        "https://walletlens.live/academy"
    };

    // Feature notifications lead with the four things no other free tracker
    // does, so a user meets them within their first few feature notifications
    // instead of finding them buried behind generic ones. Entries 5-8 are a
    // second pass on the same four from a different angle.
    private static final String[] FEATURE_URLS = {
        "https://walletlens.live/guardian",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",

        "https://walletlens.live/guardian",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",
        "https://walletlens.live/dashboard",

        "https://walletlens.live/dashboard",
        "https://walletlens.live/settings",
        "https://walletlens.live/fear-and-greed-index",
        "https://walletlens.live/market-index"
    };

    public PeriodicUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /**
     * A Resources bound to the language the user picked inside the web app,
     * which is not necessarily the device language — someone on an English
     * phone can be reading WalletLens in Arabic.
     *
     * The web writes the code into SharedPreferences through the widget-sync
     * intent; when it has never done so, getResources() gives the device
     * default, which is the best available guess.
     */
    private Resources localizedResources() {
        Context ctx = getApplicationContext();
        String lang = null;
        try {
            lang = ctx.getSharedPreferences(LangPrefs.PREFS_NAME, Context.MODE_PRIVATE)
                    .getString(LangPrefs.KEY_LANG, null);
        } catch (Throwable ignored) { }
        if (lang == null || lang.isEmpty()) return ctx.getResources();
        try {
            Configuration cfg = new Configuration(ctx.getResources().getConfiguration());
            cfg.setLocale(Locale.forLanguageTag(lang));
            return ctx.createConfigurationContext(cfg).getResources();
        } catch (Throwable e) {
            Log.w(TAG, "Locale override failed for " + lang + ": " + e.getMessage());
            return ctx.getResources();
        }
    }

    /**
     * Pull entry {@code i} out of a parallel title/body/URL triple, wrapping
     * when the index runs past the end. Returns {title, body, url}.
     */
    private String[] entry(Resources res, int titlesId, int bodiesId, String[] urls, int i) {
        String[] titles = res.getStringArray(titlesId);
        String[] bodies = res.getStringArray(bodiesId);
        // Never trust the three to agree: a translator adding an item to one
        // array and not the others would otherwise crash the worker.
        int n = Math.min(titles.length, Math.min(bodies.length, urls.length));
        if (n <= 0) return null;
        int k = ((i % n) + n) % n;
        return new String[] { titles[k], bodies[k], urls[k] };
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

            Resources res = localizedResources();

            String title;
            String body;
            String url;

            switch (type) {
                case 0:
                case 4:
                    // Price update — deep link to market index
                    title = res.getString(R.string.notif_price_update_title);
                    body = fetchPriceSummary(res);
                    url = "https://walletlens.live/market-index";
                    break;
                case 1: {
                    int hi = prefs.getInt(KEY_HACK, 0);
                    String[] e = entry(res, R.array.notif_hack_titles, R.array.notif_hack_bodies, HACK_URLS, hi);
                    if (e == null) return Result.success();
                    title = "💡 " + e[0];
                    body = e[1];
                    url = e[2];
                    prefs.edit().putInt(KEY_HACK, hi + 1).apply();
                    break;
                }
                case 2: {
                    int ai = prefs.getInt(KEY_ACADEMY, 0);
                    String[] e = entry(res, R.array.notif_academy_titles, R.array.notif_academy_bodies, ACADEMY_URLS, ai);
                    if (e == null) return Result.success();
                    title = e[0];
                    body = e[1];
                    url = e[2];
                    prefs.edit().putInt(KEY_ACADEMY, ai + 1).apply();
                    break;
                }
                default: {
                    int fi = prefs.getInt(KEY_FEATURE, 0);
                    String[] e = entry(res, R.array.notif_feature_titles, R.array.notif_feature_bodies, FEATURE_URLS, fi);
                    if (e == null) return Result.success();
                    title = "💡 " + e[0];
                    body = e[1];
                    url = e[2];
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

    private String fetchPriceSummary(Resources res) {
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
                    sb.append("🥇 ").append(res.getString(R.string.notif_gold)).append(" $").append(String.format(Locale.US, "%.0f", goldPrice));
                }
            } catch (Throwable ignored) {}

            if (sb.length() > 0) return sb.toString();
            return res.getString(R.string.notif_price_fallback);
        } catch (Throwable e) {
            return res.getString(R.string.notif_price_loading);
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
