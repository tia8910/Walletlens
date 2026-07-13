package live.walletlens.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Top Movers widget — shows the 5 assets with biggest price changes.
 * Data is written by the web app via SharedPreferences bridge.
 */
public class TopMoversWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, appWidgetManager, id);
    }

    public static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_topmovers);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        long lastUpdate = prefs.getLong("last_update", 0);
        views.setTextViewText(R.id.widget_tm_update, formatAgo(lastUpdate));

        String[] names = {"mover1_name","mover2_name","mover3_name","mover4_name","mover5_name"};
        String[] prices = {"mover1_price","mover2_price","mover3_price","mover4_price","mover5_price"};
        String[] changes = {"mover1_change","mover2_change","mover3_change","mover4_change","mover5_change"};

        for (int i = 0; i < 5; i++) {
            String name = prefs.getString("tm_name_" + i, "—");
            String price = prefs.getString("tm_price_" + i, "");
            double change = prefs.getFloat("tm_change_" + i, 0);
            String arrow = change >= 0 ? "▲" : "▼";
            String color = change >= 0 ? "#10b981" : "#ef4444";

            int nameId = context.getResources().getIdentifier(names[i], "id", context.getPackageName());
            int priceId = context.getResources().getIdentifier(prices[i], "id", context.getPackageName());
            int changeId = context.getResources().getIdentifier(changes[i], "id", context.getPackageName());

            views.setTextViewText(nameId, name);
            views.setTextViewText(priceId, price);
            views.setTextViewText(changeId, arrow + " " + String.format(Locale.US, "%.1f%%", Math.abs(change)));
            views.setTextColor(changeId, android.graphics.Color.parseColor(color));
        }

        Intent tap = new Intent(context, LauncherActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setOnClickPendingIntent(R.id.widget_container,
                PendingIntent.getActivity(context, 1, tap, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        mgr.updateAppWidget(id, views);
    }

    public static void saveTopMovers(Context context, String[] names, String[] prices, float[] changes) {
        SharedPreferences.Editor ed = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE).edit();
        ed.putLong("last_update", System.currentTimeMillis());
        for (int i = 0; i < Math.min(5, names.length); i++) {
            ed.putString("tm_name_" + i, names[i]);
            ed.putString("tm_price_" + i, prices[i]);
            ed.putFloat("tm_change_" + i, changes[i]);
        }
        ed.apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new android.content.ComponentName(context, TopMoversWidgetProvider.class));
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
