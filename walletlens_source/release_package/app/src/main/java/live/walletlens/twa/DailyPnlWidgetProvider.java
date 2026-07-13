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
 * Daily P&L widget — shows today's profit/loss, win/loss count, and best performer.
 * Data written by the web app via SharedPreferences bridge.
 */
public class DailyPnlWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(context, mgr, id);
    }

    public static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_pnl);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        long lastUpdate = prefs.getLong("last_update", 0);
        views.setTextViewText(R.id.widget_pnl_update, formatAgo(lastUpdate));

        double dailyPnl = prefs.getFloat("daily_pnl", 0);
        double dailyPct = prefs.getFloat("daily_pct", 0);
        int winners = prefs.getInt("pnl_winners", 0);
        int losers = prefs.getInt("pnl_losers", 0);
        String best = prefs.getString("pnl_best", "—");

        String sign = dailyPnl >= 0 ? "+" : "";
        views.setTextViewText(R.id.widget_pnl_value, sign + String.format(Locale.US, "$%.2f", Math.abs(dailyPnl)));
        views.setTextColor(R.id.widget_pnl_value, dailyPnl >= 0 ? android.graphics.Color.parseColor("#10b981") : android.graphics.Color.parseColor("#ef4444"));

        views.setTextViewText(R.id.widget_pnl_pct, String.format(Locale.US, "%s%.2f%% today", dailyPct >= 0 ? "+" : "", dailyPct));

        views.setTextViewText(R.id.widget_pnl_winners, String.valueOf(winners));
        views.setTextViewText(R.id.widget_pnl_losers, String.valueOf(losers));
        views.setTextViewText(R.id.widget_pnl_best, best);

        Intent tap = new Intent(context, LauncherActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_container,
                PendingIntent.getActivity(context, 2, tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        mgr.updateAppWidget(id, views);
    }

    public static void savePnlData(Context context, double dailyPnl, double dailyPct,
                                    int winners, int losers, String best) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE).edit();
        ed.putLong("last_update", System.currentTimeMillis());
        ed.putFloat("daily_pnl", (float) dailyPnl);
        ed.putFloat("daily_pct", (float) dailyPct);
        ed.putInt("pnl_winners", winners);
        ed.putInt("pnl_losers", losers);
        ed.putString("pnl_best", best);
        ed.apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new android.content.ComponentName(context, DailyPnlWidgetProvider.class));
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
