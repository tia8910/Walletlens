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
 * Home screen widget — shows a net worth snapshot.
 * Data is read from the same SharedPreferences the PeriodicUpdateWorker writes.
 */
public class WalletLensWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "WalletLensWidget";
    private static final String PREFS_WIDGET = "walletlens_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_networth);

        // Read widget data from SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        long lastUpdate = prefs.getLong("last_update", 0);
        int trackedAssets = prefs.getInt("tracked_assets", 0);
        int moversCount = prefs.getInt("movers_count", 0);
        String topMover = prefs.getString("top_mover", "—");

        // Format "last updated"
        String lastUpdateStr;
        if (lastUpdate == 0) {
            lastUpdateStr = "Not yet updated";
        } else {
            long minutesAgo = (System.currentTimeMillis() - lastUpdate) / 60000;
            if (minutesAgo < 1) lastUpdateStr = "Just now";
            else if (minutesAgo < 60) lastUpdateStr = minutesAgo + " min ago";
            else lastUpdateStr = (minutesAgo / 60) + "h " + (minutesAgo % 60) + "m ago";
        }

        views.setTextViewText(R.id.widget_last_update, "Updated " + lastUpdateStr);
        views.setTextViewText(R.id.widget_tracked, trackedAssets + " assets tracked");
        views.setTextViewText(R.id.widget_movers, moversCount + " assets moved");
        views.setTextViewText(R.id.widget_top_mover, "Top: " + topMover);

        // Tap opens the app
        Intent tapIntent = new Intent(context, LauncherActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_container, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * Called from PeriodicUpdateWorker to save widget data and trigger update.
     */
    public static void saveWidgetData(Context context, int trackedAssets, int moversCount, String topMover) {
        context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
                .edit()
                .putLong("last_update", System.currentTimeMillis())
                .putInt("tracked_assets", trackedAssets)
                .putInt("movers_count", moversCount)
                .putString("top_mover", topMover)
                .apply();

        // Trigger widget update
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        int[] ids = appWidgetManager.getAppWidgetIds(
                new android.content.ComponentName(context, WalletLensWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            for (int id : ids) {
                updateAppWidget(context, appWidgetManager, id);
            }
        }
    }
}
