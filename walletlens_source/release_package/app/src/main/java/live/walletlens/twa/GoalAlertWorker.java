package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Goal alerts (portfolio value, profit or loss, one holding's share) with the
 * app closed.
 *
 * <p>Every other alert rings from the push server. Goals cannot: they are about
 * the portfolio's amounts and cost, which never leave the phone. So the phone
 * checks them itself, every 15 minutes while it is online, with what the app
 * last handed over through {@link WalletLensBridge#syncGoalAlerts}: the goal
 * rules (with their text already in the user's language), the holdings, and
 * the last prices it saw. Fresh prices come from the push server's /quotes,
 * which is asked by asset only; no amount, cost or total is ever sent.
 *
 * <p>The rule is the app's own (alertRules.js goalHolds / evaluateGoal): a goal
 * rings when it goes from not met to met, and is judged only once every holding
 * has a price. It rings once per arming; the app reads which ones rang
 * ({@link #firedJson}) and marks them, so opening it does not ring them again.
 *
 * <p>Runs only while there is a goal to watch; nothing is scheduled otherwise,
 * and it posts nothing unless a goal was actually reached.
 */
public class GoalAlertWorker extends Worker {

    private static final String TAG = "WalletLensGoals";
    private static final String WORK_NAME = "walletlens_goal_alerts";
    private static final String PREFS = "walletlens_goal_alerts";
    private static final String KEY_STATE = "state";
    private static final String KEY_FIRED = "fired";
    /** wasTrue per rule key, kept here between runs while the app is closed. */
    private static final String KEY_WAS = "was";
    private static final String QUOTES_URL = "https://" + AppShellActivity.HOST + "/api/push/quotes?a=";
    private static final int MAX_QUOTED = 60;

    public GoalAlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    // ── From the app ─────────────────────────────────────────────────────

    /**
     * Store what the app hands over and start (or stop) the 15 minute check.
     * Called from the bridge.
     */
    static void sync(@NonNull Context context, @NonNull String json) throws Exception {
        JSONObject state = new JSONObject(json);
        JSONArray rules = state.optJSONArray("rules");
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Keep the "was it met" memory only for rules that still exist; a new
        // rule starts from what the app last saw.
        JSONObject was = new JSONObject(p.getString(KEY_WAS, "{}"));
        JSONObject nextWas = new JSONObject();
        Set<String> live = new HashSet<>();
        for (int i = 0; rules != null && i < rules.length(); i++) {
            JSONObject r = rules.getJSONObject(i);
            String k = key(r);
            live.add(k);
            if (was.has(k)) nextWas.put(k, was.get(k));
            else if (r.has("wasTrue") && !r.isNull("wasTrue")) nextWas.put(k, r.getBoolean("wasTrue"));
        }
        JSONArray fired = new JSONArray(p.getString(KEY_FIRED, "[]"));
        JSONArray nextFired = new JSONArray();
        for (int i = 0; i < fired.length(); i++) if (live.contains(fired.getString(i))) nextFired.put(fired.getString(i));

        p.edit().putString(KEY_STATE, json).putString(KEY_WAS, nextWas.toString())
                .putString(KEY_FIRED, nextFired.toString()).apply();

        WorkManager wm = WorkManager.getInstance(context);
        if (live.isEmpty()) {
            wm.cancelUniqueWork(WORK_NAME);
            return;
        }
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(GoalAlertWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    /** The goals this worker rang, as "id:armedAt" keys, for the app to mark. */
    @NonNull
    static String firedJson(@NonNull Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_FIRED, "[]");
    }

    private static String key(JSONObject rule) {
        return rule.optString("id") + ":" + rule.optLong("armedAt");
    }

    // ── The check ────────────────────────────────────────────────────────

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONObject state = new JSONObject(p.getString(KEY_STATE, "{}"));
            JSONArray rules = state.optJSONArray("rules");
            JSONArray holdings = state.optJSONArray("holdings");
            if (rules == null || rules.length() == 0 || holdings == null || holdings.length() == 0) {
                return Result.success();
            }

            Map<String, Double> fresh = fetchQuotes(holdings);
            JSONObject last = state.optJSONObject("prices");

            // The portfolio summary, as alertRules.js portfolioSummary.
            double total = 0, invested = 0;
            int priced = 0;
            Map<String, Double> values = new HashMap<>();
            for (int i = 0; i < holdings.length(); i++) {
                JSONObject h = holdings.getJSONObject(i);
                String id = h.optString("coin_id");
                invested += h.optDouble("invested", 0);
                Double usd = h.has("q") ? fresh.get(h.optString("q")) : null;
                if (usd == null && last != null && last.optDouble(id, 0) > 0) usd = last.optDouble(id);
                if (usd == null || !(usd > 0)) continue;
                double v = usd * h.optDouble("amount", 0);
                priced++;
                values.put(id, (values.containsKey(id) ? values.get(id) : 0) + v);
                total += v;
            }
            // Judged only once every holding has a price, so one that failed
            // to load cannot fake a crash in the total.
            if (priced != holdings.length() || priced == 0) return Result.success();
            double pnlPct = invested > 0 ? ((total - invested) / invested) * 100 : 0;

            JSONObject was = new JSONObject(p.getString(KEY_WAS, "{}"));
            JSONArray fired = new JSONArray(p.getString(KEY_FIRED, "[]"));
            Set<String> firedSet = new HashSet<>();
            for (int i = 0; i < fired.length(); i++) firedSet.add(fired.getString(i));

            NotificationHelper helper = null;
            for (int i = 0; i < rules.length(); i++) {
                JSONObject r = rules.getJSONObject(i);
                String k = key(r);
                if (firedSet.contains(k)) continue;
                boolean holds = holds(r, total, pnlPct, values);
                if (!was.has(k)) { was.put(k, holds); continue; }
                boolean before = was.getBoolean(k);
                was.put(k, holds);
                if (!holds || before) continue;

                if (helper == null) { helper = new NotificationHelper(ctx); helper.createChannels(); }
                String title = r.optString("title", "WalletLens");
                String body = r.optString("body", "");
                String url = "https://" + AppShellActivity.HOST + "/dashboard";
                String tag = "goal:" + r.optString("id");
                if (NotificationHelper.alarmEnabled(ctx)) helper.showAlarm(title, body, r.optString("tone", "neutral"), url, tag);
                else helper.showAlertNotification(title, body, url, tag);
                fired.put(k);
                firedSet.add(k);
            }
            p.edit().putString(KEY_WAS, was.toString()).putString(KEY_FIRED, fired.toString()).apply();
        } catch (Throwable e) {
            Log.w(TAG, "goal check failed: " + e);
        }
        // Success either way: the next run in 15 minutes is the retry.
        return Result.success();
    }

    /** alertRules.js goalHolds. */
    private static boolean holds(JSONObject r, double total, double pnlPct, Map<String, Double> values) {
        double x = r.optDouble("target", Double.NaN);
        if (Double.isNaN(x) || Double.isInfinite(x)) return false;
        switch (r.optString("kind")) {
            case "value_above": return total >= x;
            case "value_below": return total <= x;
            case "pnl_above": return pnlPct >= x;
            case "pnl_below": return pnlPct <= -Math.abs(x);
            case "weight_above": {
                Double v = values.get(r.optString("coin_id"));
                double w = total > 0 && v != null ? (v / total) * 100 : 0;
                return w >= x;
            }
            default: return false;
        }
    }

    /**
     * Current prices from the push server, keyed by the "kind:id:symbol" the
     * app attached to each holding. Assets only: nothing about amounts.
     */
    @NonNull
    private static Map<String, Double> fetchQuotes(@NonNull JSONArray holdings) {
        Map<String, Double> out = new HashMap<>();
        StringBuilder q = new StringBuilder();
        Set<String> asked = new HashSet<>();
        for (int i = 0; i < holdings.length() && asked.size() < MAX_QUOTED; i++) {
            String a = holdings.optJSONObject(i) != null ? holdings.optJSONObject(i).optString("q", "") : "";
            if (a.isEmpty() || !asked.add(a)) continue;
            if (q.length() > 0) q.append(',');
            q.append(a);
        }
        if (q.length() == 0) return out;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(QUOTES_URL + URLEncoder.encode(q.toString(), "UTF-8")).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            if (c.getResponseCode() != 200) return out;
            JSONObject body = new JSONObject(read(c.getInputStream()));
            JSONObject quotes = body.optJSONObject("quotes");
            if (quotes == null) return out;
            for (Iterator<String> it = quotes.keys(); it.hasNext(); ) {
                String k = it.next();
                double v = quotes.optDouble(k, 0);
                if (v > 0) out.put(k, v);
            }
        } catch (Throwable e) {
            Log.w(TAG, "quotes unavailable: " + e);
        } finally {
            if (c != null) c.disconnect();
        }
        return out;
    }

    @NonNull
    private static String read(@Nullable InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream s = in; ByteArrayOutputStream b = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = s.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }
}
