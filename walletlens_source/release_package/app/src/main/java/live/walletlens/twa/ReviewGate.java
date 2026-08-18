package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Decides whether this launch should show Google Play's in-app review card.
 *
 * <p>THIS IS THE BACKSTOP, NOT THE MAIN PATH
 * The web app asks first, in-session, from the user's very first visit — it
 * arms on a timer and fires on the next tap, which is what supplies the user
 * activation the intent navigation needs. That is the better ask, because the
 * card lands while the user is actually looking at their portfolio.
 *
 * <p>What it cannot cover is a user who never taps anything, or a session that
 * ends before the dwell elapses. This gate exists for them. It runs at launch —
 * the only window native code gets, since once the Custom Tab is up this app
 * has no foreground activity and starting one would be a background activity
 * launch, blocked since Android 10.
 *
 * <p>The two never double-ask. {@link ReviewActivity} stamps
 * {@code review_flow_completed_at} into its own SharedPreferences whenever a
 * flow completes, whichever side started it, and {@link #alreadyRan} reads that
 * back. Native storage is the one thing both paths can see: the web app's
 * localStorage is invisible from here, but every web-triggered ask still lands
 * in this process on its way to Play.
 *
 * <p>Thresholds are deliberately later than the web path's, so in the normal
 * case the in-session ask has long since happened and this never fires.
 *
 * <p>WHERE THE NUMBERS COME FROM
 * Launch count and first-seen date are ours, written on every cold start.
 * Portfolio size is not — it lives in the web app's localStorage, which native
 * code cannot read. What we do get is whatever the widget bridge last pushed
 * over ({@link WidgetSyncActivity} stores net worth and a tracked-asset count
 * for the widgets). That is treated as corroboration, not a requirement: if a
 * sync has happened and it says the portfolio is empty, we stay quiet; if no
 * sync has ever happened we proceed, because most users never add a widget and
 * refusing to ask them would shrink the audience to almost nobody.
 *
 * <p>WHAT THIS MUST NEVER DO
 * Play's policy forbids asking the user any opinion question before or while
 * showing the card — no "enjoying WalletLens?" gate, no routing only happy
 * users to the store. Nothing here screens on sentiment and nothing here should
 * ever grow a prompt of its own.
 */
final class ReviewGate {

    private static final String TAG = "WalletLensReviewGate";
    private static final String PREFS = "walletlens_review_gate";

    private static final String KEY_FIRST_SEEN = "first_seen";
    private static final String KEY_LAUNCHES   = "launches";
    private static final String KEY_LAST_ASKED = "last_asked";
    private static final String KEY_ASK_COUNT  = "ask_count";

    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    /**
     * Installed at least this many days.
     *
     * <p>Later than the web path, which asks from the first visit. By the time
     * this is reachable the in-session ask has had several sessions to land, so
     * reaching here means it never did.
     */
    private static final int MIN_DAYS = 2;

    /** Cold starts, including this one. */
    private static final int MIN_LAUNCHES = 4;

    /**
     * Our own cooldown. Play applies an undisclosed per-user quota on top and
     * simply shows nothing once it is spent, so asking inside a short window
     * achieves nothing except spending a launch on a card nobody sees.
     */
    private static final int REASK_AFTER_DAYS = 60;

    /** Lifetime cap. Play's quota bites long before this does. */
    private static final int MAX_ASKS = 4;

    private ReviewGate() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Record a cold start. Call once per launch, before {@link #shouldAsk}.
     *
     * <p>The first call also stamps the install date. That means "installed
     * three days ago" really means "first opened three days ago", which is the
     * more useful reading anyway — an app installed and never opened has not
     * earned an opinion.
     */
    static void noteLaunch(Context c) {
        try {
            SharedPreferences p = prefs(c);
            SharedPreferences.Editor ed = p.edit();
            if (p.getLong(KEY_FIRST_SEEN, 0) == 0) {
                ed.putLong(KEY_FIRST_SEEN, System.currentTimeMillis());
            }
            ed.putInt(KEY_LAUNCHES, p.getInt(KEY_LAUNCHES, 0) + 1);
            ed.apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not record launch: " + t);
        }
    }

    /** True when this launch should divert through {@link ReviewActivity}. */
    static boolean shouldAsk(Context c) {
        try {
            SharedPreferences p = prefs(c);
            long now = System.currentTimeMillis();

            if (p.getInt(KEY_ASK_COUNT, 0) >= MAX_ASKS) return false;
            if (p.getInt(KEY_LAUNCHES, 0) < MIN_LAUNCHES) return false;

            long first = p.getLong(KEY_FIRST_SEEN, 0);
            if (first == 0 || now - first < MIN_DAYS * DAY_MS) return false;

            long asked = p.getLong(KEY_LAST_ASKED, 0);
            if (asked != 0 && now - asked < REASK_AFTER_DAYS * DAY_MS) return false;

            // The web app already got there. Not a duplicate-suppression nicety:
            // Play's per-user quota is small and undisclosed, so a second ask
            // would most likely be swallowed silently, having cost the user an
            // interrupted launch for nothing.
            if (alreadyRan(c)) return false;

            return hasPortfolio(c);
        } catch (Throwable t) {
            // A gate that throws must not take the app's startup with it.
            Log.w(TAG, "gate check failed, staying quiet: " + t);
            return false;
        }
    }

    /**
     * Whether a review flow has ever completed on this device, from either path.
     *
     * <p>ReviewActivity writes this on every completion, including the ones the
     * web app triggers — those still run through this process to reach Play.
     * It is the only state the two sides share.
     */
    private static boolean alreadyRan(Context c) {
        try {
            return c.getSharedPreferences("walletlens_review", Context.MODE_PRIVATE)
                    .getLong("review_flow_completed_at", 0) > 0;
        } catch (Throwable t) {
            // Unreadable prefs must not turn into a duplicate ask.
            return true;
        }
    }

    /**
     * Whether we have any reason to believe there is something to have an
     * opinion about.
     *
     * <p>Absence of evidence is not evidence of absence here. The widget prefs
     * are only populated once the web app has pushed a sync, which most users
     * never trigger, so "no data" means "we don't know" and we go ahead. Only a
     * sync that actually reports an empty portfolio stops the ask.
     */
    private static boolean hasPortfolio(Context c) {
        try {
            SharedPreferences w = c.getSharedPreferences("walletlens_widget", Context.MODE_PRIVATE);
            if (!w.getBoolean("portfolio_synced", false)) return true;   // unknown
            return w.getFloat("alloc_total", 0f) > 0f;
        } catch (Throwable t) {
            return true;
        }
    }

    /**
     * Record that the card was requested.
     *
     * <p>Called before the activity is started, never after. If the flow throws,
     * is killed, or Play declines silently, the alternative is re-asking on the
     * next launch and every launch after it — far worse than losing one ask.
     */
    static void markAsked(Context c) {
        try {
            SharedPreferences p = prefs(c);
            p.edit()
             .putLong(KEY_LAST_ASKED, System.currentTimeMillis())
             .putInt(KEY_ASK_COUNT, p.getInt(KEY_ASK_COUNT, 0) + 1)
             .apply();
        } catch (Throwable t) {
            Log.w(TAG, "could not record ask: " + t);
        }
    }
}
