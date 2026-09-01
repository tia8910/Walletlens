package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Decides whether this launch should show Google Play's in-app review card.
 *
 * <p>THIS IS THE FIRST ASK
 * It runs at launch, from the very first one, before the TWA opens. Launch is
 * the only window native code gets: once the Custom Tab is up this app has no
 * foreground activity, and starting one would be a background activity launch,
 * which Android 10+ blocks.
 *
 * <p>The cost of that is real and was accepted deliberately — on a new install
 * the card appears before the user has seen the dashboard. What it buys is an
 * ask that needs no tap, does not depend on the web deploy having reached the
 * device, and cannot be lost to a session that ends early.
 *
 * <p>The web app keeps its own in-session ask as the second attempt, for the
 * case that matters most: Play declining. Play returns success and shows
 * nothing when its per-user quota is spent, and there is no way to tell that
 * apart from success — so rather than guess, the web path simply tries again
 * later, in-session, where the card would land better anyway.
 *
 * <p>They do not double-ask when the first one worked. {@link ReviewActivity}
 * stamps {@code review_flow_completed_at} whenever a flow completes, whichever
 * side started it, and both sides consult it. Native storage is the only state
 * they share — localStorage is invisible from here, but every web-triggered ask
 * still passes through this process on its way to Play.
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

    /** No waiting period: eligible from the first launch. */
    private static final int MIN_DAYS = 0;

    /** Cold starts, including this one. 1 = the very first launch. */
    private static final int MIN_LAUNCHES = 1;

    /**
     * Our own cooldown. Play applies an undisclosed per-user quota on top and
     * simply shows nothing once it is spent, so asking inside a short window
     * achieves nothing except spending a launch on a card nobody sees.
     */
    private static final int REASK_AFTER_DAYS = 60;

    /**
     * After this many asks the cadence slows down. It does NOT stop.
     *
     * <p>This was a hard lifetime cap, and the reasoning behind it does not
     * survive contact with how the Play API behaves. launchReviewFlow
     * completes identically whether the card was shown, was dismissed, or was
     * silently suppressed because the user is over Google's quota — the
     * outcome is deliberately hidden. An "ask" is therefore an ATTEMPT and
     * nothing more, never evidence that anybody saw anything.
     *
     * <p>So a device could spend all four attempts inside one quota window,
     * be shown nothing at all, and then be retired for life. The people most
     * likely to hit that are exactly the ones who have never rated: somebody
     * who rates on their first card stops being asked anyway, because Play
     * stops serving it and ReviewActivity stamps the completion.
     *
     * <p>Nothing is lost by continuing. An attempt outside the quota costs
     * nothing and shows nothing; Google, not this file, is the authority on
     * how often a card may appear. Our job is a cadence that is not rude,
     * which is what the longer gap below is for.
     *
     * <p>Mirrors SETTLED_ASKS in client/src/reviewPrompt.js, which made the
     * same change on the web side for the same reason.
     */
    private static final int SETTLED_ASKS = 4;

    /** The gap once settled. Longer, but never infinite. */
    private static final int SETTLED_REASK_DAYS = 180;

    private ReviewGate() {}

    /** The last thing Play actually did, for the readout in Settings. */
    private static final String KEY_LAST_OUTCOME    = "last_outcome";
    private static final String KEY_LAST_OUTCOME_AT = "last_outcome_at";

    /**
     * Record what came back from Play.
     *
     * <p>Three rounds of "the rate card still doesn't appear" have now gone by
     * with no way to tell which of these happened, because the whole feature is
     * invisible when it works AND when it fails. Play returns success whether
     * or not it drew anything, so the only honest report is the raw outcome:
     * whether the request failed, how long the flow took, and whether this
     * build even came from Play.
     */
    static void noteOutcome(Context c, String outcome) {
        try {
            prefs(c).edit()
                    .putString(KEY_LAST_OUTCOME, outcome)
                    .putLong(KEY_LAST_OUTCOME_AT, System.currentTimeMillis())
                    .apply();
        } catch (Throwable e) {
            Log.w(TAG, "could not record the review outcome: " + e);
        }
    }

    static String lastOutcome(Context c) {
        try { return prefs(c).getString(KEY_LAST_OUTCOME, ""); }
        catch (Throwable e) { return ""; }
    }

    static long lastOutcomeAt(Context c) {
        try { return prefs(c).getLong(KEY_LAST_OUTCOME_AT, 0L); }
        catch (Throwable e) { return 0L; }
    }

    /**
     * Who installed this build.
     *
     * <p>"com.android.vending" is Play. Anything else — a shell install, a file
     * manager, null for adb — means the in-app review card CANNOT be shown, no
     * matter how long the gates have been satisfied. That single fact would
     * have answered this question days ago.
     */
    static String installer(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                String s = c.getPackageManager()
                        .getInstallSourceInfo(c.getPackageName())
                        .getInstallingPackageName();
                return s == null ? "sideload" : s;
            }
            String s = c.getPackageManager().getInstallerPackageName(c.getPackageName());
            return s == null ? "sideload" : s;
        } catch (Throwable e) {
            return "unknown";
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * Record a cold start. Call once per launch, before {@link #shouldAsk}.
     *
     * <p>The first call also stamps the install date. Nothing reads it while
     * MIN_DAYS is zero, but it is recorded from the start so that reinstating a
     * waiting period later is a constant change, rather than a rule that has to
     * wait for everyone's clock to begin again.
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

            if (p.getInt(KEY_LAUNCHES, 0) < MIN_LAUNCHES) return false;

            long first = p.getLong(KEY_FIRST_SEEN, 0);
            if (first == 0 || now - first < MIN_DAYS * DAY_MS) return false;

            // Slows after SETTLED_ASKS; never stops. See the constant for why
            // a count of attempts cannot be read as a count of cards seen.
            int askCount = p.getInt(KEY_ASK_COUNT, 0);
            int gapDays = askCount >= SETTLED_ASKS ? SETTLED_REASK_DAYS : REASK_AFTER_DAYS;
            long asked = p.getLong(KEY_LAST_ASKED, 0);
            if (asked != 0 && now - asked < (long) gapDays * DAY_MS) return false;

            // A flow has already completed on this device, from either side.
            // Not a tidiness nicety: Play's per-user quota is small and
            // undisclosed, so a second ask would most likely be swallowed in
            // silence, having cost the user an interrupted launch for nothing.
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
     * Undo the last {@link #markAsked}, for a flow that returned too fast for
     * the card to have been displayed.
     *
     * <p>markAsked deliberately runs before the activity starts, so a crashed
     * or killed flow cannot cause an ask on every launch forever. The cost of
     * that ordering is this: when Play declines silently we have charged the
     * user for something they never saw. This gives it back.
     *
     * <p>It cannot underflow past zero, and it clears the timestamp rather than
     * restoring the previous one — the previous value is not kept anywhere, and
     * treating "never asked" as the fallback errs towards asking again, which
     * is the right direction when we know the last attempt showed nothing.
     */
    static void rollbackAsk(Context c) {
        try {
            SharedPreferences p = prefs(c);
            int n = p.getInt(KEY_ASK_COUNT, 0);
            p.edit()
             .putInt(KEY_ASK_COUNT, Math.max(0, n - 1))
             .putLong(KEY_LAST_ASKED, 0)
             .apply();
            Log.d(TAG, "ask rolled back; Play showed nothing");
        } catch (Throwable t) {
            Log.w(TAG, "could not roll back ask: " + t);
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
