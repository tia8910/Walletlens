package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import java.io.PrintWriter;
import java.io.StringWriter;

/**
 * Captures the stack trace of a fatal crash so it can be read on the device.
 *
 * This exists because a crash was reported that could not be diagnosed. The
 * dialog Android shows ("this app has a bug") names nothing, and the trace in
 * Play Console arrives obfuscated — R8 was running with no keep rules, so
 * -keepattributes SourceFile,LineNumberTable never applied and every trace
 * since v2.8 came back without line numbers. Two builds were spent guessing at
 * a fault that a single trace would have named.
 *
 * So the app now records its own. The handler is installed as the very first
 * statement of Application.onCreate, before anything that could plausibly
 * throw, and the trace is written synchronously with commit() rather than
 * apply() — the process is about to die and an async write would not survive.
 *
 * The default handler is always called afterwards. Swallowing it would leave a
 * frozen process instead of a crash, which is worse.
 *
 * Limitation worth stating: a crash inside a ContentProvider, or in the zygote
 * before Application.onCreate runs, happens before this is installed and will
 * not be captured. If a crash leaves no record here, that absence is itself
 * evidence about where it happened.
 */
public final class CrashReporter {

    private static final String TAG = "WalletLensCrash";
    private static final String PREFS = "walletlens_crash";
    private static final String KEY_TRACE = "last_trace";
    private static final String KEY_WHEN = "last_when";
    private static final String KEY_SEEN = "last_seen";

    private CrashReporter() {}

    public static void install(final Context context) {
        final Thread.UncaughtExceptionHandler previous =
                Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                PrintWriter pw = new PrintWriter(sw);

                pw.println("WalletLens crash");
                pw.println("version : " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")");
                pw.println("android : " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
                pw.println("device  : " + Build.MANUFACTURER + " " + Build.MODEL);
                pw.println("thread  : " + thread.getName());
                pw.println();
                error.printStackTrace(pw);

                // Causes are where the useful line usually is — a
                // ClassNotFoundException wrapped in a RuntimeException says far
                // more than the wrapper does.
                Throwable cause = error.getCause();
                int depth = 0;
                while (cause != null && depth++ < 5) {
                    pw.println();
                    pw.println("caused by:");
                    cause.printStackTrace(pw);
                    cause = cause.getCause();
                }
                pw.flush();

                // commit(), not apply(): this process has milliseconds left.
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_TRACE, sw.toString())
                        .putLong(KEY_WHEN, System.currentTimeMillis())
                        .putBoolean(KEY_SEEN, false)
                        .commit();

                Log.e(TAG, "Fatal crash recorded", error);
            } catch (Throwable ignored) {
                // A throw inside the crash handler would replace a diagnosable
                // crash with an undiagnosable one.
            }

            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    /** The last recorded crash, or null. */
    public static String lastTrace(Context context) {
        return prefs(context).getString(KEY_TRACE, null);
    }

    public static long lastCrashTime(Context context) {
        return prefs(context).getLong(KEY_WHEN, 0);
    }

    /** True when a crash has been recorded that the user has not been shown. */
    public static boolean hasUnseenCrash(Context context) {
        SharedPreferences p = prefs(context);
        return p.getString(KEY_TRACE, null) != null && !p.getBoolean(KEY_SEEN, true);
    }

    public static void markSeen(Context context) {
        prefs(context).edit().putBoolean(KEY_SEEN, true).apply();
    }

    public static void clear(Context context) {
        prefs(context).edit().remove(KEY_TRACE).remove(KEY_WHEN).remove(KEY_SEEN).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
