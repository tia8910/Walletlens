package live.walletlens.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.Arrays;
import java.util.List;

/**
 * The language the user picked inside the web app.
 *
 * <p>WHY THIS EXISTS
 *
 * <p>The picker lives in the web app's Settings and writes to {@code
 * localStorage}, which native code cannot read — the page runs in a Chrome
 * Custom Tab, in a different process. Anything the native side renders was
 * therefore stuck in English no matter what the user chose, and the most
 * visible case was {@link PeriodicUpdateWorker}: notifications on the lock
 * screen, in English, for someone using the app in Arabic.
 *
 * <p>The device locale is not a substitute. Someone on an English phone can
 * deliberately be reading WalletLens in Arabic, and the app should follow the
 * choice they made rather than one they did not.
 *
 * <p>The value arrives on the existing {@code walletlens://widget-sync}
 * payload rather than through an intent of its own. That intent already fires
 * whenever the portfolio syncs, so no new manifest surface is exposed for the
 * sake of a two-letter string.
 */
public final class LangPrefs {

    private static final String TAG = "WalletLensLang";

    public static final String PREFS_NAME = "walletlens_lang";
    public static final String KEY_LANG   = "app_lang";

    /** Must match LANGUAGES in client/src/LanguageContext.jsx. */
    private static final List<String> SUPPORTED = Arrays.asList("en", "ar", "fr", "es");

    private LangPrefs() { }

    /**
     * Store a language code sent by the web app.
     *
     * <p>Validated against the supported list, not merely non-empty: this
     * arrives from a browsable intent, so any installed app can call in, and
     * an arbitrary string would be handed straight to {@code
     * Locale.forLanguageTag}.
     *
     * @return true when the value was accepted and stored
     */
    public static boolean set(@NonNull Context context, @Nullable String raw) {
        if (raw == null) return false;
        String lang = raw.trim().toLowerCase();
        if (!SUPPORTED.contains(lang)) {
            Log.w(TAG, "Ignoring unsupported language: " + raw);
            return false;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (lang.equals(prefs.getString(KEY_LANG, null))) return true;
        prefs.edit().putString(KEY_LANG, lang).apply();
        Log.d(TAG, "App language set to " + lang);
        return true;
    }

    /** The stored code, or null when the web app has never told us. */
    @Nullable
    public static String get(@NonNull Context context) {
        try {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getString(KEY_LANG, null);
        } catch (Throwable e) {
            return null;
        }
    }
}
