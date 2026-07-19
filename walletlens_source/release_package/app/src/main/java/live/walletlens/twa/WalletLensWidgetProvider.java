package live.walletlens.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.util.Locale;

/**
 * Net Worth Snapshot widget — enhanced with value, daily P&L, managed assets, and top mover.
 * Data is written by the web app via the JavaScript-Android SharedPreferences bridge.
 */
public class WalletLensWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            try {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            } catch (Exception e) {
                android.util.Log.w("WalletLensWidget", "widget update failed: " + e.getMessage());
            }
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_networth);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        long lastUpdate = prefs.getLong("last_update", 0);

        double totalValue = prefs.getFloat("networth_total", 0);
        double dailyChange = prefs.getFloat("networth_daily_change", 0);
        double dailyPct = prefs.getFloat("networth_daily_pct", 0);
        int trackedAssets = prefs.getInt("tracked_assets", 0);
        String topMover = prefs.getString("top_mover", "—");

        views.setTextViewText(R.id.widget_last_update, formatAgo(lastUpdate));
        views.setTextViewText(R.id.widget_networth_value, String.format(Locale.US, "$%,.2f", totalValue));

        String sign = dailyChange >= 0 ? "+" : "";
        String color = dailyChange >= 0 ? "#10b981" : "#ef4444";
        int colorInt = android.graphics.Color.parseColor(color);

        views.setTextViewText(R.id.widget_daily_change, sign + String.format(Locale.US, "$%.2f", dailyChange));
        views.setTextColor(R.id.widget_daily_change, colorInt);
        views.setTextViewText(R.id.widget_daily_pct, sign + String.format(Locale.US, "(%.2f%%)", dailyPct));
        views.setTextColor(R.id.widget_daily_pct, colorInt);

        views.setTextViewText(R.id.widget_tracked, trackedAssets + " assets");
        views.setTextViewText(R.id.widget_top_mover, topMover);

        Intent tapIntent = new Intent(context, LauncherActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_container, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void saveWidgetData(Context context, double total, double dailyChange,
                                       double dailyPct, int trackedAssets, String topMover) {
        context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
                .edit()
                .putLong("last_update", System.currentTimeMillis())
                .putFloat("networth_total", (float) total)
                .putFloat("networth_daily_change", (float) dailyChange)
                .putFloat("networth_daily_pct", (float) dailyPct)
                .putInt("tracked_assets", trackedAssets)
                .putString("top_mover", topMover)
                .apply();

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        int[] ids = appWidgetManager.getAppWidgetIds(
                new android.content.ComponentName(context, WalletLensWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateAppWidget(context, appWidgetManager, id);
            }
        }
    }

    private static String formatAgo(long ts) {
        if (ts == 0) return "Not yet updated";
        long m = (System.currentTimeMillis() - ts) / 60000;
        if (m < 1) return "Just now";
        if (m < 60) return m + "m ago";
        return (m / 60) + "h";
    }
}
