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

    // The five rows, resolved at compile time. These used to be looked up with
    // Resources.getIdentifier("mover1_name", "id", pkg), which returns 0 for
    // anything it can't find — and setTextViewText(0, …) does not fail here, it
    // fails later inside the launcher when the RemoteViews is applied, showing
    // "Problem loading widget" with nothing in our own logs. Direct R.id
    // references cannot go wrong, and they are what lets the R8 keep rule for
    // this class go away.
    private static final int[] ROW_NAME = {
            R.id.mover1_name, R.id.mover2_name, R.id.mover3_name,
            R.id.mover4_name, R.id.mover5_name };
    private static final int[] ROW_PRICE = {
            R.id.mover1_price, R.id.mover2_price, R.id.mover3_price,
            R.id.mover4_price, R.id.mover5_price };
    private static final int[] ROW_CHANGE = {
            R.id.mover1_change, R.id.mover2_change, R.id.mover3_change,
            R.id.mover4_change, R.id.mover5_change };

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            try { updateWidget(context, appWidgetManager, id); }
            catch (Exception e) { android.util.Log.w("WalletLensWidget", "top-movers update failed: " + e.getMessage()); }
        }
    }

    public static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_topmovers);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        long lastUpdate = prefs.getLong("last_update", 0);
        views.setTextViewText(R.id.widget_tm_update, formatAgo(lastUpdate));

        for (int i = 0; i < ROW_NAME.length; i++) {
            String name = prefs.getString("tm_name_" + i, "—");
            String price = prefs.getString("tm_price_" + i, "");
            double change = prefs.getFloat("tm_change_" + i, 0);
            String arrow = change >= 0 ? "▲" : "▼";
            int color = change >= 0 ? 0xFF10B981 : 0xFFEF4444;

            views.setTextViewText(ROW_NAME[i], name);
            views.setTextViewText(ROW_PRICE[i], price);
            views.setTextViewText(ROW_CHANGE[i],
                    arrow + " " + String.format(Locale.US, "%.1f%%", Math.abs(change)));
            views.setTextColor(ROW_CHANGE[i], color);
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
