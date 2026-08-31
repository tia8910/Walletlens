# WalletLens TWA — R8 keep rules.
#
# The release build runs R8 with proguard-android.txt — the NON-optimising
# default config. The optimisation passes were implicated in an earlier launch
# crash and are a separate decision from having keep rules at all; see the
# comment on the release buildType in build.gradle.
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

# ── Trusted Web Activity ───────────────────────────────────────────────────

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

# ── Crash readability ──────────────────────────────────────────────────────
# Keep line numbers so the uploaded mapping.txt produces useful stack traces in
# Play Console, and hide the original source file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations drive a lot of AndroidX behaviour; losing them changes runtime
# semantics rather than just names.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
