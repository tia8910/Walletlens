package live.walletlens.twa;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Bridges the user's portfolio from the web app into the home-screen widgets.
 *
 * WHY THIS EXISTS
 * The portfolio lives in localStorage inside the Custom Tab that renders
 * walletlens.live. Native code cannot read that, so before this existed the
 * widgets were fed by PeriodicUpdateWorker — which only knows public market
 * prices. It passed literal zeros for net worth, P&L and allocation, and
 * showed generic market movers instead of the user's holdings. The widgets
 * rendered, but every portfolio number on them was 0.
 *
 * HOW IT WORKS
 * The web app posts a small summary to walletlens://widget-sync?data=<json>
 * from a hidden iframe. Nothing leaves the device — this is a local intent,
 * not a network call.
 *
 * Expected payload (all fields optional; missing ones are left untouched):
 * {
 *   "nw": 16897.55, "pnl": 318.92, "pnlPct": 2.56,
 *   "tracked": 12, "winners": 7, "losers": 5,
 *   "alloc": { "crypto": 41.2, "stocks": 25.6, "gold": 18.4, "cash": 14.8 },
 *   "movers": [ { "s": "BTC", "p": "$65,921", "c": 2.35 }, ... ]
 * }
 */
public class WidgetSyncActivity extends Activity {

    private static final String TAG = "WalletLensWidgetSync";
    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            handle(getIntent());
        } catch (Exception e) {
            // Never surface a failure here: this runs invisibly behind the app.
            Log.w(TAG, "Widget sync failed: " + e.getMessage());
        }
        finish();
    }

    private void handle(Intent intent) throws Exception {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        String raw = uri.getQueryParameter("data");
        if (raw == null || raw.isEmpty()) return;

        JSONObject j = new JSONObject(raw);
        Context ctx = getApplicationContext();

        double nw     = j.optDouble("nw", 0);
        double pnl    = j.optDouble("pnl", 0);
        double pnlPct = j.optDouble("pnlPct", 0);
        int tracked   = j.optInt("tracked", 0);
        int winners   = j.optInt("winners", 0);
        int losers    = j.optInt("losers", 0);

        // Best performer label, reused by the net-worth and P&L widgets.
        String best = "—";
        String[] names   = new String[5];
        String[] prices  = new String[5];
        float[]  changes = new float[5];
        for (int i = 0; i < 5; i++) { names[i] = "—"; prices[i] = ""; changes[i] = 0f; }

        JSONArray movers = j.optJSONArray("movers");
        if (movers != null && movers.length() > 0) {
            for (int i = 0; i < Math.min(5, movers.length()); i++) {
                JSONObject m = movers.optJSONObject(i);
                if (m == null) continue;
                names[i]   = m.optString("s", "—");
                prices[i]  = m.optString("p", "");
                changes[i] = (float) m.optDouble("c", 0);
            }
            JSONObject top = movers.optJSONObject(0);
            if (top != null) {
                best = top.optString("s", "—") + " "
                        + String.format(java.util.Locale.US, "%+.1f%%", top.optDouble("c", 0));
            }
            TopMoversWidgetProvider.saveTopMovers(ctx, names, prices, changes);
        }

        WalletLensWidgetProvider.saveWidgetData(ctx, nw, pnl, pnlPct, tracked, best);
        DailyPnlWidgetProvider.savePnlData(ctx, pnl, pnlPct, winners, losers, best);

        JSONObject alloc = j.optJSONObject("alloc");
        if (alloc != null) {
            AllocationWidgetProvider.saveAllocation(
                    ctx,
                    (float) alloc.optDouble("crypto", 0),
                    (float) alloc.optDouble("stocks", 0),
                    (float) alloc.optDouble("gold", 0),
                    (float) alloc.optDouble("cash", 0),
                    nw);
        }

        // Tell PeriodicUpdateWorker to stop overwriting these with market-only
        // placeholders now that we have the real thing.
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE).edit();
        ed.putBoolean("portfolio_synced", true);
        ed.putLong("portfolio_synced_at", System.currentTimeMillis());
        ed.apply();

        refreshAll(ctx);
        Log.d(TAG, "Widget sync applied: nw=" + nw + " tracked=" + tracked);
    }

    /** Repaint every placed widget with the values just written. */
    private void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);

        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, WalletLensWidgetProvider.class))) {
            WalletLensWidgetProvider.updateAppWidget(ctx, mgr, id);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, DailyPnlWidgetProvider.class))) {
            DailyPnlWidgetProvider.updateWidget(ctx, mgr, id);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, AllocationWidgetProvider.class))) {
            AllocationWidgetProvider.updateWidget(ctx, mgr, id);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, TopMoversWidgetProvider.class))) {
            TopMoversWidgetProvider.updateWidget(ctx, mgr, id);
        }
    }
}
