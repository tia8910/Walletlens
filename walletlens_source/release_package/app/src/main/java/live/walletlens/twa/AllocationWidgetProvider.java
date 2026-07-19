package live.walletlens.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Locale;

/**
 * Asset Allocation widget — horizontal bar chart showing portfolio breakdown
 * by category: Crypto, Stocks, Gold/Silver, Cash.
 * Data written by the web app via SharedPreferences bridge.
 */
public class AllocationWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            try { updateWidget(context, mgr, id); }
            catch (Exception e) { android.util.Log.w("WalletLensWidget", "allocation update failed: " + e.getMessage()); }
        }
    }

    public static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_allocation);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        long lastUpdate = prefs.getLong("last_update", 0);
        views.setTextViewText(R.id.alloc_update, formatAgo(lastUpdate));

        float crypto = prefs.getFloat("alloc_crypto", 0);
        float stocks = prefs.getFloat("alloc_stocks", 0);
        float gold = prefs.getFloat("alloc_gold", 0);
        float cash = prefs.getFloat("alloc_cash", 0);
        double total = prefs.getFloat("alloc_total", 0);

        views.setTextViewText(R.id.alloc_crypto_pct, String.format(Locale.US, "%.0f%%", crypto));
        views.setTextViewText(R.id.alloc_stocks_pct, String.format(Locale.US, "%.0f%%", stocks));
        views.setTextViewText(R.id.alloc_gold_pct, String.format(Locale.US, "%.0f%%", gold));
        views.setTextViewText(R.id.alloc_cash_pct, String.format(Locale.US, "%.0f%%", cash));
        views.setTextViewText(R.id.alloc_total, "Total: " + String.format(Locale.US, "$%,.0f", total));

        // Set bar widths using layout_weight — we set a max of 100 and use weight for percentage
        setBarWeight(views, R.id.alloc_crypto_bar, crypto);
        setBarWeight(views, R.id.alloc_stocks_bar, stocks);
        setBarWeight(views, R.id.alloc_gold_bar, gold);
        setBarWeight(views, R.id.alloc_cash_bar, cash);

        Intent tap = new Intent(context, LauncherActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_container,
                PendingIntent.getActivity(context, 3, tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        mgr.updateAppWidget(id, views);
    }

    private static void setBarWeight(RemoteViews views, int viewId, float pct) {
        // RemoteViews doesn't support setLayoutParams, so we use setViewLayoutWidth
        // with a proportional width. Max container is ~200dp; we scale to that.
        try {
            int widthDp = Math.max(4, (int) (pct * 2));
            views.setViewLayoutWidth(viewId, widthDp, android.util.TypedValue.COMPLEX_UNIT_DIP);
        } catch (Exception e) {
            // Fallback: just show the percentage text
        }
    }

    public static void saveAllocation(Context context, float crypto, float stocks,
                                       float gold, float cash, double total) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE).edit();
        ed.putLong("last_update", System.currentTimeMillis());
        ed.putFloat("alloc_crypto", crypto);
        ed.putFloat("alloc_stocks", stocks);
        ed.putFloat("alloc_gold", gold);
        ed.putFloat("alloc_cash", cash);
        ed.putFloat("alloc_total", (float) total);
        ed.apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new android.content.ComponentName(context, AllocationWidgetProvider.class));
        if (ids != null) for (int id : ids) updateWidget(context, mgr, id);
    }

    private static String formatAgo(long ts) {
        if (ts == 0) return "Not yet updated";
        long m = (System.currentTimeMillis() - ts) / 60000;
        if (m < 1) return "Just now";
        if (m < 60) return m + "m ago";
        return (m / 60) + "h ago";
    }
}
