# WalletLens — نص متجر Google Play (العربية)

Arabic translation of `listing-text.md`. Play has a single Arabic locale (`ar`),
so this one listing serves every Arabic-speaking market.

The brand name stays in Latin script on purpose: it is what people search for,
and Play matches the query against the localised title, so replacing it with a
transliteration would lose that traffic.

> Character limits are the same as the English listing and are counted in
> characters, not bytes — Arabic letters count as one each.

## App name (max 30) — 25 chars
WalletLens — متتبع الثروة

## Short description (max 80) — 74 chars
تتبع العملات الرقمية والأسهم والذهب والنقد بخصوصية — بدون حساب، على جهازك.

## Full description (max 4000)
‏WalletLens هو متتبع خاص وشامل لصافي الثروة والمحفظة الاستثمارية. شاهد عملاتك الرقمية وأسهمك ومعادنك الثمينة ونقدك معاً في لوحة واحدة واضحة — بأسعار حية وأرباح وخسائر وتوزيع يتحدّث لحظياً.

بدون حساب. بدون تسجيل. بدون ربط بالبنك. بياناتك تبقى على جهازك.

— تتبّع كل شيء في مكان واحد —
• العملات الرقمية: أكثر من 10,000 عملة بأسعار لحظية وأرباح وخسائر وتوزيع
• الأسهم وصناديق المؤشرات: أسعار حية وأداء متابَع
• المعادن الثمينة: الذهب والفضة وغيرها
• النقد والعملات الورقية: أرصدتك بعملات متعددة
• عرض موحّد لصافي ثروتك عبر كل أصولك

— شاهد صورتك الحقيقية —
• رسم دائري حي لتوزيع أصولك بين العملات الرقمية والأسهم والمعادن والنقد
• الأرباح والخسائر لكل أصل ولمحفظتك كاملة
• صافي ثروتك في لمحة، محدّثاً بأسعار السوق
• تنبيهات الانحراف عندما يتجاوز أصل ما هدفك المحدد

— أعد التوازن بثقة —
• حاسبة إعادة توازن مدمجة: اعرف بالضبط ما تشتريه أو تبيعه
• أعد التوازن عبر إضافات جديدة لتتجنّب البيع وتقلّل الضرائب
• حافظ على مخاطرتك متوافقة مع خطتك

— أضف أصولك بالطريقة التي تناسبك —
• إدخال يدوي في ثوانٍ
• استيراد من جداول البيانات وExcel
• استيراد بالصورة وبالصوت
• نسخ احتياطي واستعادة لبياناتك

— خاص بحكم التصميم —
• لا حاجة لحساب ولا لتسجيل
• لا ربط ببنك أو منصة تداول
• بيانات محفظتك مخزّنة على جهازك، لا على خوادمنا
• لا شيء يخصّ أصولك يغادر هاتفك

— مجاني —
‏WalletLens مجاني بالكامل. تابع صافي ثروتك، وراقب توزيع أصولك، وأعد التوازن — بدون اشتراك.

سواء كنت مستثمراً طويل الأمد، أو محتفظاً بالعملات الرقمية، أو شخصاً يريد ببساطة رقماً واحداً صادقاً لصافي ثروته، يمنحك WalletLens رؤية واضحة وخاصة لأموالك.

ابدأ تتبّع صافي ثروتك في أقل من دقيقة.

---

## Notes for whoever uploads this

**The `‏` characters** at the start of paragraphs beginning with "WalletLens" are
RTL marks (U+200F). They stop Play rendering the Latin brand name as if the whole
paragraph were left-to-right. Paste them; do not retype the lines.

**Bullets** use `•` rather than `-`. In RTL text a hyphen at line start renders
ambiguously against the direction; the bullet does not.

**Numbers** stay Western (10,000) because Play's Arabic UI uses Western digits and
mixing them with Arabic-Indic digits looks inconsistent.

## Keywords for Arabic ASO
متتبع الثروة، محفظة استثمارية، محفظة العملات الرقمية، متابعة الأسهم، توزيع الأصول،
حاسبة إعادة التوازن، متتبع الاستثمار، صافي الثروة

These are woven into the description above rather than stuffed — Play indexes the
title and description, and keyword stuffing in Arabic reads badly to the humans
who will decide whether to install.

## Screenshots

Retake these with the app in Arabic. It is the single highest-value part of an
Arabic listing: the UI mirrors properly, so the screenshots demonstrate real RTL
support rather than an English app with translated marketing text. Switch the app
language in Settings and capture the same views the English listing uses —
dashboard, allocation, rebalancing calculator.

## "What's new" (release notes)

Also per-language, and separate from this listing. Currently the English one says
"Performance enhancement"; the Arabic equivalent is «تحسينات في الأداء».
