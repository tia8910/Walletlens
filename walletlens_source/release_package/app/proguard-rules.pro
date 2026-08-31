# WalletLens TWA — R8 keep rules.
#
# The release build runs R8 with proguard-android-OPTIMIZE.txt, so the
# optimisation passes are on: inlining, class merging, devirtualisation,
# -allowaccessmodification. That is a stronger transformation than shrinking
# and renaming alone, and it breaks a different class of thing — code reached
# by NAME from outside the compiler's view survives renaming if it is kept, but
# can still be inlined away, merged into another class, or have its signature
# changed if the rule is too narrow.
#
# So every rule below is now load-bearing in a way it was not before, and the
# two additions that came with turning optimisation on are marked as such.
#
# Shrinking and obfuscation are still on, so everything Android instantiates by
# *name* rather than by a compile-time reference has to be kept explicitly, or
# it gets removed or renamed and the app fails at runtime — usually with a
# ClassNotFoundException, occasionally with something far more confusing.
#
# Classes declared in AndroidManifest.xml (activities, services, receivers,
# providers) are kept automatically by AGP — they are deliberately not repeated
# here.

# ── WorkManager ────────────────────────────────────────────────────────────
# Workers are constructed reflectively from the class name persisted in
# WorkManager's database, so nothing in the code references PeriodicUpdateWorker
# directly at the point R8 analyses it.
-keep class live.walletlens.twa.PeriodicUpdateWorker { *; }
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# ── The JavaScript bridge ──────────────────────────────────────────────────
# ADDED WITH OPTIMISATION.
#
# Twenty-six methods on WalletLensBridge are called from the web app BY NAME —
# window.AndroidBridge.saveFile(...) and so on. Nothing in the Java references
# them, so to R8 every one is dead code with a name nobody uses.
#
# AGP's default config carries a @JavascriptInterface rule of its own and has
# for years, which is why the bridge survives the current build. This states it
# here anyway: the entire app-to-native surface depends on it — the vault,
# notifications, biometrics, file save, widgets — and it is not a thing to
# leave resting on a file this project does not control and does not read.
-keepclasseswithmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class live.walletlens.twa.WalletLensBridge { *; }


# ── Widgets ────────────────────────────────────────────────────────────────
# The providers are declared in AndroidManifest.xml, so AGP already keeps the
# classes themselves. This keeps their static update() helpers, which are
# called from WidgetSyncActivity rather than from the framework.
#
# TopMoversWidgetProvider used to resolve its row views with
# Resources.getIdentifier(name, "id", pkg), which R8 could not see through.
# It now uses R.id constants directly, so that hazard is gone.
-keep class live.walletlens.twa.*WidgetProvider { *; }

# ── Biometric / AndroidX ───────────────────────────────────────────────────
-keep class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**

# ── ZXing ──────────────────────────────────────────────────────────────────
# Reflection-free, but the reader/writer classes are selected dynamically by
# format, which R8's optimiser can otherwise inline away.
-keep class com.google.zxing.** { *; }
-dontwarn com.google.zxing.**

# ── Play In-App Review ─────────────────────────────────────────────────────
# The review card is rendered by the Play Store app across a binder boundary;
# the library's callbacks and ReviewInfo parcelable are resolved by name on the
# other side, so the optimiser must not rename or inline them.
-keep class com.google.android.play.core.review.** { *; }
-keep class com.google.android.play.core.common.** { *; }
-dontwarn com.google.android.play.core.**

# ── Play In-App Update ─────────────────────────────────────────────────────
# ADDED WITH OPTIMISATION, and it was missing before that.
#
# Same situation as the review library directly above, which has had a rule
# since it was added: the flow is driven by the Play Store app across a binder,
# and InstallStateUpdatedListener's callback plus AppUpdateInfo's fields are
# resolved by name on the other side. Without this the update prompt fails in
# the way that is hardest to notice — silently, on the release build only,
# reporting that no update is available.
-keep class com.google.android.play.core.appupdate.** { *; }
-keep class com.google.android.play.core.install.** { *; }
-keep class com.google.android.play.core.ktx.** { *; }

# ── Crash readability ──────────────────────────────────────────────────────
# Keep line numbers so the uploaded mapping.txt produces useful stack traces in
# Play Console, and hide the original source file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations drive a lot of AndroidX behaviour; losing them changes runtime
# semantics rather than just names.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
