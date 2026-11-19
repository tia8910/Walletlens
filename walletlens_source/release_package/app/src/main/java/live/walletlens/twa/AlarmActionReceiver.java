package live.walletlens.twa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * The buttons on an alarm notification: Dismiss takes it down, Snooze takes it
 * down and rings it again in ten minutes, and the snooze's own wake-up posts it
 * again. Not exported: only this app's own PendingIntents reach it.
 */
public class AlarmActionReceiver extends BroadcastReceiver {

    private static final String TAG = "AlarmAction";

    public static final String ACTION_DISMISS = "live.walletlens.twa.alarm.DISMISS";
    public static final String ACTION_SNOOZE  = "live.walletlens.twa.alarm.SNOOZE";
    public static final String ACTION_REPOST  = "live.walletlens.twa.alarm.REPOST";

    public static final String EXTRA_TITLE = "alarm_title";
    public static final String EXTRA_BODY  = "alarm_body";
    public static final String EXTRA_TONE  = "alarm_tone";
    public static final String EXTRA_URL   = "alarm_url";
    public static final String EXTRA_TAG   = "alarm_tag";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String tag = intent.getStringExtra(EXTRA_TAG);
        if (tag == null || tag.isEmpty()) return;
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String tone = intent.getStringExtra(EXTRA_TONE);
        String url = intent.getStringExtra(EXTRA_URL);
        try {
            NotificationHelper helper = new NotificationHelper(context);
            switch (intent.getAction()) {
                case ACTION_DISMISS:
                    helper.cancelAlarm(tag);
                    break;
                case ACTION_SNOOZE:
                    helper.snoozeAlarm(title != null ? title : "", body != null ? body : "", tone, url, tag);
                    break;
                case ACTION_REPOST:
                    // Turned the alarm off while it was snoozed: it stays quiet.
                    if (!NotificationHelper.alarmEnabled(context) || title == null) return;
                    helper.createChannels();
                    helper.showAlarm(title, body != null ? body : "", tone, AppEntry.isOurs(url) ? url : null, tag);
                    break;
                default:
                    break;
            }
        } catch (Throwable e) {
            Log.w(TAG, "alarm action failed: " + e);
        }
    }
}
