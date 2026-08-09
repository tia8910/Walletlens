// The public FAQ, in all four languages.
//
// Shape per language: [ [sectionTitle, [ [question, answer], … ]], … ]
//
// Positional rather than keyed, because these are long paragraphs and a keyed
// table would put the four languages of the same answer thousands of lines
// apart in i18n.js. Here they sit next to each other, which is the only way a
// reviewer can tell whether a translation still says what the English says.
//
// FAQ_SECTIONS (the object shape the page and the prerenderer's JSON-LD
// mirror expect) is derived from the English entry below, so there is still
// exactly one source of truth for the English copy.

export const FAQ_TEXT = {
  en: [
    ['Getting Started', [
      ['Is WalletLens really free?',
       'Yes. WalletLens is 100% free with no paid tiers, no premium paywall, and no freemium limits. You can track unlimited assets, use the AI analysis, and export backups without ever paying. There is no advertising in the app.'],
      ['Do I need an account or email to use it?',
       'No. There is no sign-up, no email, and no password. You open the app and start tracking immediately. Because there is no account, there is nothing to hack, leak, or lock you out of.'],
      ['How do I add my first holding?',
       'Open the dashboard and tap "Add Trade". Search for the asset, enter the amount and the price you paid, and save. You can also speak a trade with voice input, import a screenshot of an exchange or broker app, or paste a backup code from another device.'],
      ['Can I use WalletLens on my phone?',
       'Yes. WalletLens is a Progressive Web App (PWA) — install it to your home screen on iOS, Android, or desktop for a fast, app-like experience that works offline. There is also a Chrome browser extension for quick portfolio checks.'],
      ['Does WalletLens support languages other than English?',
       'Yes. The interface is available in English, Arabic, French and Spanish, with full right-to-left layout in Arabic. You can switch language during onboarding or at any time in Settings → Appearance → Language.'],
    ]],
    ['Privacy & Data', [
      ['Where is my portfolio data stored?',
       "Entirely in your own browser's localStorage on your device. WalletLens has no backend database and no server that receives your holdings. Your financial data never leaves your device unless you choose to export a backup code."],
      ['Can WalletLens see my portfolio?',
       'No. The only network calls the app makes are to public price APIs (CoinGecko, Binance, Stooq, Gold-API and similar) to fetch market prices, and those requests never include your holdings, amounts, or any identity. Optional AI analysis sends only anonymous aggregates.'],
      ['How do I back up my portfolio?',
       'Open Settings → Backup and copy your WLZ backup code (or show it as a QR code). The code is a compressed snapshot of your whole portfolio. Store it somewhere safe — because there is no cloud account, the backup code is the only way to restore your data if you clear your browser.'],
      ['How do I move my portfolio to a new device?',
       'Export a backup code (or QR) on the old device, then paste or scan it on the new one. The import takes seconds and nothing passes through any server.'],
      ['How do I delete all my data?',
       "Clearing your browser's site data for walletlens.live removes everything, because everything lives in your browser. There is no server-side copy to ask us to delete."],
    ]],
    ['Assets & Prices', [
      ['What assets can I track in one place?',
       'Crypto (10,000+ coins), US stocks and ETFs, gold, silver, platinum, fiat currencies, cash, bonds, and custom assets like real estate — all in a single net worth dashboard with live prices, cost basis, and profit/loss.'],
      ['Where do the live prices come from?',
       'Crypto prices come from CoinGecko with Binance, CryptoCompare, CoinCap and CoinPaprika as automatic fallbacks. US stocks come from Stooq, precious metals from Gold-API, and currency rates from open exchange-rate APIs. If your network blocks these sources, the app falls back to a snapshot served from walletlens.live itself.'],
      ['Why is a price missing or showing zero?',
       'Usually the asset is custom (bonds, real estate) and needs a manual price — edit the holding to set its current value. For listed assets, a hard refresh (Ctrl+Shift+R) typically restores live prices; the app retries several sources automatically.'],
      ['How is my profit & loss calculated?',
       'WalletLens tracks your cost basis per asset from your buy and sell transactions using the average-cost method. Unrealized P&L is the difference between current market value and the cost basis of what you still hold.'],
    ]],
    ['Features & AI', [
      ['What does the AI analysis do?',
       'The Decision Engine reviews each position — momentum, portfolio weight, profit/loss — and suggests an action (hold, add, trim, sell) with reasons. There is also a wallet health evaluation, a risk scanner, stress tests, a sell-plan generator, and price-target tracking. None of it is financial advice.'],
      ['Can I set price alerts?',
       'Yes. Set "rises above" or "falls below" alerts on any holding. With notifications enabled you get alerted even when WalletLens is in a background tab, complete with a sound.'],
      ['What is the voice import?',
       'Tap the microphone and say something like "I bought half a Bitcoin at sixty thousand dollars in January" — the AI parses it into a structured transaction for you to confirm. It works in English and Arabic.'],
      ['What is the screenshot import?',
       'Upload a screenshot of any exchange, broker, or bank app and the AI reads the holdings from the image and adds them to your portfolio — useful for migrating from another tracker in one step.'],
      ['What does the Chrome extension do?',
       'The WalletLens extension shows your portfolio total, all holdings with live prices, market data, the Fear & Greed index, news, and technical signals from your browser toolbar. It syncs with the web app through your local data — no account needed.'],
    ]],
    ['Comparisons & Troubleshooting', [
      ['How is WalletLens different from CoinStats, Empower, or Kubera?',
       'Most trackers focus only on crypto, charge a subscription, require you to connect exchange or bank logins, or store your data on their servers. WalletLens covers every asset class, is free forever, needs no logins, and keeps all data on your device.'],
      ['The app loads but data is empty — what do I do?',
       'First hard-refresh (Ctrl+Shift+R on desktop, pull-to-refresh on mobile) to pick up the latest version. If market sections stay empty, your network may block crypto price APIs — WalletLens automatically falls back to a same-origin price snapshot within a few seconds.'],
      ['I cleared my browser and lost my portfolio. Can you restore it?',
       'Only if you saved a WLZ backup code — paste it in Settings → Backup to restore everything instantly. There is no server-side copy, which is the price of true privacy, so export a backup regularly.'],
      ['Is WalletLens open source?',
       'Yes. You can inspect the code, report issues, or contribute on GitHub at github.com/tia8910/walletlens.'],
      ['How do I report a bug or request a feature?',
       'Email contact@walletlens.live or open an issue on GitHub — we read everything.'],
    ]],
  ],

  ar: [
    ['البداية', [
      ['هل WalletLens مجاني فعلاً؟',
       'نعم. WalletLens مجاني بالكامل — بلا باقات مدفوعة ولا جدار دفع ولا حدود على النسخة المجانية. يمكنك تتبّع عدد غير محدود من الأصول واستخدام التحليل بالذكاء الاصطناعي وتصدير النسخ الاحتياطية دون أن تدفع شيئاً. ولا توجد إعلانات داخل التطبيق.'],
      ['هل أحتاج إلى حساب أو بريد إلكتروني لاستخدامه؟',
       'لا. لا يوجد تسجيل ولا بريد إلكتروني ولا كلمة مرور. تفتح التطبيق وتبدأ التتبّع فوراً. ولأنه لا يوجد حساب، فليس هناك ما يُخترق أو يُسرَّب أو يمنعك من الدخول.'],
      ['كيف أضيف أول أصل لي؟',
       'افتح لوحة التحكم واضغط «إضافة صفقة». ابحث عن الأصل، وأدخل الكمية والسعر الذي دفعته، ثم احفظ. يمكنك أيضاً إملاء الصفقة صوتياً، أو استيراد لقطة شاشة من تطبيق منصّة أو وسيط، أو لصق رمز نسخ احتياطي من جهاز آخر.'],
      ['هل يمكنني استخدام WalletLens على هاتفي؟',
       'نعم. WalletLens تطبيق ويب تقدّمي (PWA) — ثبّته على شاشتك الرئيسية على iOS أو Android أو سطح المكتب لتجربة سريعة تشبه التطبيقات الأصلية وتعمل دون اتصال. وهناك أيضاً إضافة لمتصفّح Chrome لفحص محفظتك بسرعة.'],
      ['هل يدعم WalletLens لغات غير الإنجليزية؟',
       'نعم. الواجهة متوفّرة بالإنجليزية والعربية والفرنسية والإسبانية، مع تخطيط كامل من اليمين إلى اليسار في العربية. يمكنك تغيير اللغة أثناء الإعداد الأولي أو في أي وقت من الإعدادات ← المظهر ← اللغة.'],
    ]],
    ['الخصوصية والبيانات', [
      ['أين تُخزَّن بيانات محفظتي؟',
       'بالكامل في ذاكرة localStorage داخل متصفّحك على جهازك. لا يملك WalletLens قاعدة بيانات خلفية ولا خادماً يستقبل ممتلكاتك. بياناتك المالية لا تغادر جهازك إلا إذا اخترت تصدير رمز نسخ احتياطي.'],
      ['هل يستطيع WalletLens رؤية محفظتي؟',
       'لا. الاتصالات الشبكية الوحيدة التي يجريها التطبيق هي إلى واجهات أسعار عامة (CoinGecko وBinance وStooq وGold-API وما شابهها) لجلب أسعار السوق، وهذه الطلبات لا تتضمّن أبداً ممتلكاتك أو كمياتها أو أي هوية. أما التحليل الاختياري بالذكاء الاصطناعي فيرسل مجاميع مجهولة الهوية فقط.'],
      ['كيف أنشئ نسخة احتياطية من محفظتي؟',
       'افتح الإعدادات ← النسخ الاحتياطي وانسخ رمز WLZ (أو اعرضه كرمز QR). الرمز لقطة مضغوطة لمحفظتك كاملة. احفظه في مكان آمن — فلعدم وجود حساب سحابي، يبقى رمز النسخ الاحتياطي هو السبيل الوحيد لاستعادة بياناتك إن مسحت متصفّحك.'],
      ['كيف أنقل محفظتي إلى جهاز جديد؟',
       'صدّر رمز نسخ احتياطي (أو رمز QR) على الجهاز القديم، ثم الصقه أو امسحه على الجهاز الجديد. يستغرق الاستيراد ثوانٍ ولا يمرّ شيء عبر أي خادم.'],
      ['كيف أحذف كل بياناتي؟',
       'مسح بيانات موقع walletlens.live من متصفّحك يزيل كل شيء، لأن كل شيء موجود داخل متصفّحك. ولا توجد نسخة على الخادم لتطلب منّا حذفها.'],
    ]],
    ['الأصول والأسعار', [
      ['ما الأصول التي يمكنني تتبّعها في مكان واحد؟',
       'العملات الرقمية (أكثر من 10,000 عملة)، والأسهم الأمريكية وصناديق المؤشرات، والذهب والفضة والبلاتين، والعملات الورقية والنقد والسندات، وأصول مخصّصة مثل العقارات — كلها في لوحة صافي ثروة واحدة مع أسعار حيّة وتكلفة الشراء والربح/الخسارة.'],
      ['من أين تأتي الأسعار الحيّة؟',
       'أسعار العملات الرقمية من CoinGecko، مع Binance وCryptoCompare وCoinCap وCoinPaprika كبدائل تلقائية. والأسهم الأمريكية من Stooq، والمعادن الثمينة من Gold-API، وأسعار العملات من واجهات صرف مفتوحة. وإذا حجبت شبكتك هذه المصادر، يعود التطبيق إلى لقطة أسعار مُقدَّمة من walletlens.live نفسه.'],
      ['لماذا يظهر سعر مفقود أو صفر؟',
       'غالباً لأن الأصل مخصّص (سندات أو عقارات) ويحتاج سعراً يدوياً — عدّل الأصل لضبط قيمته الحالية. أما الأصول المدرجة فيعيد التحديث القسري (Ctrl+Shift+R) الأسعار الحيّة عادةً؛ والتطبيق يعيد المحاولة عبر عدّة مصادر تلقائياً.'],
      ['كيف تُحتسب أرباحي وخسائري؟',
       'يتتبّع WalletLens تكلفة الشراء لكل أصل من صفقات الشراء والبيع بطريقة متوسّط التكلفة. والربح أو الخسارة غير المحقّقة هي الفارق بين قيمة السوق الحالية وتكلفة ما تحتفظ به.'],
    ]],
    ['المزايا والذكاء الاصطناعي', [
      ['ماذا يفعل التحليل بالذكاء الاصطناعي؟',
       'يراجع محرّك القرار كل مركز — الزخم ووزنه في المحفظة والربح/الخسارة — ويقترح إجراءً (احتفاظ أو إضافة أو تخفيف أو بيع) مع الأسباب. وهناك أيضاً تقييم لصحّة المحفظة، وماسح للمخاطر، واختبارات ضغط، ومولّد خطة بيع، وتتبّع للأهداف السعرية. ولا شيء من ذلك يُعدّ نصيحة مالية.'],
      ['هل يمكنني ضبط تنبيهات سعرية؟',
       'نعم. اضبط تنبيهات «يرتفع فوق» أو «ينخفض دون» على أي أصل. ومع تفعيل الإشعارات ستصلك التنبيهات حتى عندما يكون WalletLens في تبويب خلفي، مصحوبةً بصوت.'],
      ['ما هو الاستيراد الصوتي؟',
       'اضغط الميكروفون وقل شيئاً مثل «اشتريت نصف بيتكوين بستين ألف دولار في يناير» — فيحلّله الذكاء الاصطناعي إلى صفقة منظّمة تؤكّدها أنت. ويعمل بالإنجليزية والعربية.'],
      ['ما هو استيراد لقطة الشاشة؟',
       'ارفع لقطة شاشة من أي تطبيق منصّة أو وسيط أو بنك، فيقرأ الذكاء الاصطناعي الممتلكات من الصورة ويضيفها إلى محفظتك — وهو مفيد للانتقال من متتبّع آخر بخطوة واحدة.'],
      ['ماذا تفعل إضافة Chrome؟',
       'تعرض إضافة WalletLens إجمالي محفظتك وكل ممتلكاتك بأسعار حيّة، وبيانات السوق، ومؤشّر الخوف والطمع، والأخبار، والإشارات الفنية — من شريط أدوات متصفّحك. وتتزامن مع تطبيق الويب عبر بياناتك المحلية دون أي حساب.'],
    ]],
    ['المقارنات وحل المشكلات', [
      ['بمَ يختلف WalletLens عن CoinStats أو Empower أو Kubera؟',
       'معظم المتتبّعات تركّز على العملات الرقمية وحدها، أو تفرض اشتراكاً، أو تطلب ربط حسابات منصّات وبنوك، أو تخزّن بياناتك على خوادمها. أما WalletLens فيغطّي كل فئات الأصول، ومجاني إلى الأبد، ولا يحتاج أي تسجيل دخول، ويُبقي كل البيانات على جهازك.'],
      ['التطبيق يفتح لكن البيانات فارغة — ماذا أفعل؟',
       'أوّلاً حدّث الصفحة تحديثاً قسرياً (Ctrl+Shift+R على سطح المكتب، أو السحب للتحديث على الهاتف) لجلب أحدث إصدار. وإن بقيت أقسام السوق فارغة فقد تكون شبكتك تحجب واجهات أسعار العملات الرقمية — وسيعود WalletLens تلقائياً إلى لقطة أسعار من المصدر نفسه خلال ثوانٍ.'],
      ['مسحت متصفّحي وفقدت محفظتي. هل يمكنكم استعادتها؟',
       'فقط إذا كنت قد حفظت رمز نسخ احتياطي WLZ — الصقه في الإعدادات ← النسخ الاحتياطي لتستعيد كل شيء فوراً. لا توجد نسخة على الخادم، وهذا هو ثمن الخصوصية الحقيقية، لذا صدّر نسخة احتياطية بانتظام.'],
      ['هل WalletLens مفتوح المصدر؟',
       'نعم. يمكنك تفحّص الشيفرة أو الإبلاغ عن مشكلات أو المساهمة على GitHub عبر github.com/tia8910/walletlens.'],
      ['كيف أبلّغ عن خلل أو أطلب ميزة؟',
       'راسلنا على contact@walletlens.live أو افتح مشكلة على GitHub — نقرأ كل شيء.'],
    ]],
  ],

  fr: [
    ['Premiers pas', [
      ['WalletLens est-il vraiment gratuit ?',
       "Oui. WalletLens est 100 % gratuit : aucune formule payante, aucun paywall premium, aucune limite freemium. Vous pouvez suivre un nombre illimité d'actifs, utiliser l'analyse par IA et exporter des sauvegardes sans jamais payer. L'application ne contient aucune publicité."],
      ["Faut-il un compte ou une adresse e-mail ?",
       "Non. Pas d'inscription, pas d'e-mail, pas de mot de passe. Vous ouvrez l'application et vous commencez immédiatement. Comme il n'y a pas de compte, il n'y a rien à pirater, à divulguer, ni rien qui puisse vous verrouiller dehors."],
      ['Comment ajouter ma première position ?',
       "Ouvrez le tableau de bord et touchez « Ajouter une opération ». Cherchez l'actif, saisissez la quantité et le prix payé, puis enregistrez. Vous pouvez aussi dicter une opération à la voix, importer une capture d'écran d'une plateforme ou d'un courtier, ou coller un code de sauvegarde venu d'un autre appareil."],
      ['Puis-je utiliser WalletLens sur mon téléphone ?',
       "Oui. WalletLens est une application web progressive (PWA) — installez-la sur votre écran d'accueil sous iOS, Android ou sur ordinateur pour une expérience rapide, proche d'une application native, qui fonctionne hors ligne. Il existe également une extension Chrome pour consulter rapidement votre portefeuille."],
      ["WalletLens gère-t-il d'autres langues que l'anglais ?",
       "Oui. L'interface est disponible en anglais, arabe, français et espagnol, avec une mise en page entièrement de droite à gauche en arabe. Vous pouvez changer de langue pendant la configuration initiale ou à tout moment dans Paramètres → Apparence → Langue."],
    ]],
    ['Confidentialité et données', [
      ['Où sont stockées les données de mon portefeuille ?',
       "Entièrement dans le localStorage de votre propre navigateur, sur votre appareil. WalletLens n'a ni base de données ni serveur qui reçoive vos positions. Vos données financières ne quittent jamais votre appareil, sauf si vous choisissez d'exporter un code de sauvegarde."],
      ['WalletLens peut-il voir mon portefeuille ?',
       "Non. Les seuls appels réseau de l'application vont vers des API de prix publiques (CoinGecko, Binance, Stooq, Gold-API et similaires) pour récupérer les cours du marché, et ces requêtes n'incluent jamais vos positions, vos montants ni la moindre identité. L'analyse par IA, optionnelle, n'envoie que des agrégats anonymes."],
      ['Comment sauvegarder mon portefeuille ?',
       "Ouvrez Paramètres → Sauvegarde et copiez votre code WLZ (ou affichez-le en QR code). Ce code est un instantané compressé de tout votre portefeuille. Conservez-le en lieu sûr : faute de compte cloud, ce code est le seul moyen de restaurer vos données si vous effacez votre navigateur."],
      ['Comment transférer mon portefeuille vers un nouvel appareil ?',
       "Exportez un code de sauvegarde (ou un QR) sur l'ancien appareil, puis collez-le ou scannez-le sur le nouveau. L'import prend quelques secondes et rien ne transite par un serveur."],
      ['Comment supprimer toutes mes données ?',
       "Effacer les données du site walletlens.live dans votre navigateur supprime tout, puisque tout y réside. Il n'existe aucune copie côté serveur dont vous pourriez nous demander la suppression."],
    ]],
    ['Actifs et prix', [
      ['Quels actifs puis-je suivre au même endroit ?',
       "Les cryptos (plus de 10 000), les actions et ETF américains, l'or, l'argent, le platine, les devises, les liquidités, les obligations et des actifs personnalisés comme l'immobilier — le tout dans un seul tableau de bord de patrimoine, avec cours en direct, prix de revient et plus-values."],
      ['D’où viennent les prix en direct ?',
       "Les cours crypto proviennent de CoinGecko, avec Binance, CryptoCompare, CoinCap et CoinPaprika en secours automatique. Les actions américaines viennent de Stooq, les métaux précieux de Gold-API et les taux de change d'API ouvertes. Si votre réseau bloque ces sources, l'application bascule sur un instantané servi par walletlens.live lui-même."],
      ['Pourquoi un prix est-il manquant ou à zéro ?',
       "En général l'actif est personnalisé (obligations, immobilier) et demande un prix manuel — modifiez la position pour fixer sa valeur actuelle. Pour les actifs cotés, un rafraîchissement forcé (Ctrl+Maj+R) rétablit généralement les cours ; l'application réessaie plusieurs sources automatiquement."],
      ['Comment mes plus-values sont-elles calculées ?',
       "WalletLens suit votre prix de revient par actif à partir de vos achats et ventes, selon la méthode du coût moyen. La plus-value latente est l'écart entre la valeur de marché actuelle et le prix de revient de ce que vous détenez encore."],
    ]],
    ['Fonctionnalités et IA', [
      ["Que fait l'analyse par IA ?",
       "Le moteur de décision examine chaque position — momentum, poids dans le portefeuille, plus-value — et suggère une action (conserver, renforcer, alléger, vendre) avec ses raisons. S'y ajoutent une évaluation de la santé du portefeuille, un scanner de risque, des tests de résistance, un générateur de plan de vente et le suivi des objectifs de prix. Rien de tout cela ne constitue un conseil financier."],
      ['Puis-je définir des alertes de prix ?',
       "Oui. Définissez des alertes « passe au-dessus de » ou « passe en dessous de » sur n'importe quelle position. Avec les notifications activées, vous êtes prévenu même lorsque WalletLens est dans un onglet en arrière-plan, avec un son."],
      ["Qu'est-ce que l'import vocal ?",
       "Touchez le microphone et dites par exemple « j'ai acheté un demi-Bitcoin à soixante mille dollars en janvier » — l'IA le transforme en opération structurée que vous confirmez. Cela fonctionne en anglais et en arabe."],
      ["Qu'est-ce que l'import par capture d'écran ?",
       "Envoyez une capture d'écran de n'importe quelle plateforme, courtier ou application bancaire : l'IA lit les positions sur l'image et les ajoute à votre portefeuille — pratique pour migrer d'un autre outil en une seule étape."],
      ['Que fait l’extension Chrome ?',
       "L'extension WalletLens affiche le total de votre portefeuille, toutes vos positions avec les cours en direct, les données de marché, l'indice Fear & Greed, les actualités et les signaux techniques, depuis la barre d'outils du navigateur. Elle se synchronise avec l'application web via vos données locales, sans aucun compte."],
    ]],
    ['Comparaisons et dépannage', [
      ['En quoi WalletLens diffère-t-il de CoinStats, Empower ou Kubera ?',
       "La plupart des outils se limitent aux cryptos, facturent un abonnement, exigent de connecter vos identifiants de plateforme ou de banque, ou stockent vos données sur leurs serveurs. WalletLens couvre toutes les classes d'actifs, reste gratuit pour toujours, ne demande aucun identifiant et garde toutes les données sur votre appareil."],
      ["L'application se charge mais les données sont vides — que faire ?",
       "Faites d'abord un rafraîchissement forcé (Ctrl+Maj+R sur ordinateur, tirer pour actualiser sur mobile) afin de récupérer la dernière version. Si les sections de marché restent vides, votre réseau bloque peut-être les API de prix crypto — WalletLens bascule automatiquement sur un instantané servi depuis la même origine en quelques secondes."],
      ["J'ai effacé mon navigateur et perdu mon portefeuille. Pouvez-vous le restaurer ?",
       "Uniquement si vous aviez enregistré un code de sauvegarde WLZ — collez-le dans Paramètres → Sauvegarde pour tout restaurer instantanément. Il n'existe aucune copie côté serveur : c'est le prix d'une vraie confidentialité, alors exportez une sauvegarde régulièrement."],
      ['WalletLens est-il open source ?',
       "Oui. Vous pouvez inspecter le code, signaler des problèmes ou contribuer sur GitHub à github.com/tia8910/walletlens."],
      ['Comment signaler un bug ou demander une fonctionnalité ?',
       "Écrivez à contact@walletlens.live ou ouvrez une issue sur GitHub — nous lisons tout."],
    ]],
  ],

  es: [
    ['Primeros pasos', [
      ['¿WalletLens es realmente gratis?',
       'Sí. WalletLens es 100 % gratuito: sin planes de pago, sin muro premium y sin límites freemium. Puedes seguir activos ilimitados, usar el análisis con IA y exportar copias de seguridad sin pagar nunca. La aplicación no tiene publicidad.'],
      ['¿Necesito una cuenta o un correo para usarlo?',
       'No. No hay registro, ni correo, ni contraseña. Abres la aplicación y empiezas a registrar al momento. Como no hay cuenta, no hay nada que puedan hackear, filtrar ni dejarte fuera.'],
      ['¿Cómo añado mi primera posición?',
       'Abre el panel y toca «Añadir operación». Busca el activo, introduce la cantidad y el precio que pagaste, y guarda. También puedes dictar una operación por voz, importar una captura de pantalla de un exchange o bróker, o pegar un código de copia de seguridad de otro dispositivo.'],
      ['¿Puedo usar WalletLens en el móvil?',
       'Sí. WalletLens es una aplicación web progresiva (PWA): instálala en la pantalla de inicio en iOS, Android o escritorio para una experiencia rápida, parecida a una app nativa, que funciona sin conexión. También hay una extensión de Chrome para consultar la cartera al vuelo.'],
      ['¿WalletLens admite otros idiomas además del inglés?',
       'Sí. La interfaz está disponible en inglés, árabe, francés y español, con diseño completo de derecha a izquierda en árabe. Puedes cambiar de idioma durante la configuración inicial o cuando quieras en Ajustes → Apariencia → Idioma.'],
    ]],
    ['Privacidad y datos', [
      ['¿Dónde se guardan los datos de mi cartera?',
       'Íntegramente en el localStorage de tu propio navegador, en tu dispositivo. WalletLens no tiene base de datos ni servidor que reciba tus posiciones. Tus datos financieros nunca salen del dispositivo salvo que decidas exportar un código de copia de seguridad.'],
      ['¿Puede WalletLens ver mi cartera?',
       'No. Las únicas llamadas de red que hace la aplicación son a API públicas de precios (CoinGecko, Binance, Stooq, Gold-API y similares) para obtener cotizaciones, y esas peticiones nunca incluyen tus posiciones, tus importes ni identidad alguna. El análisis con IA, que es opcional, solo envía agregados anónimos.'],
      ['¿Cómo hago una copia de seguridad de mi cartera?',
       'Abre Ajustes → Copia de seguridad y copia tu código WLZ (o muéstralo como código QR). El código es una instantánea comprimida de toda tu cartera. Guárdalo en un lugar seguro: al no haber cuenta en la nube, ese código es la única forma de recuperar tus datos si borras el navegador.'],
      ['¿Cómo paso mi cartera a un dispositivo nuevo?',
       'Exporta un código de copia de seguridad (o un QR) en el dispositivo antiguo y pégalo o escanéalo en el nuevo. La importación tarda segundos y nada pasa por ningún servidor.'],
      ['¿Cómo borro todos mis datos?',
       'Borrar los datos del sitio walletlens.live en tu navegador lo elimina todo, porque todo vive en el navegador. No hay copia en servidor que puedas pedirnos que borremos.'],
    ]],
    ['Activos y precios', [
      ['¿Qué activos puedo seguir en un solo sitio?',
       'Criptomonedas (más de 10.000), acciones y ETF de EE. UU., oro, plata, platino, divisas, efectivo, bonos y activos personalizados como inmuebles: todo en un único panel de patrimonio, con precios en vivo, coste de adquisición y pérdidas y ganancias.'],
      ['¿De dónde salen los precios en vivo?',
       'Los precios de cripto vienen de CoinGecko, con Binance, CryptoCompare, CoinCap y CoinPaprika como alternativas automáticas. Las acciones estadounidenses vienen de Stooq, los metales preciosos de Gold-API y los tipos de cambio de API abiertas. Si tu red bloquea esas fuentes, la aplicación recurre a una instantánea servida por el propio walletlens.live.'],
      ['¿Por qué falta un precio o aparece a cero?',
       'Normalmente el activo es personalizado (bonos, inmuebles) y necesita un precio manual: edita la posición para fijar su valor actual. En activos cotizados, una recarga forzada (Ctrl+Mayús+R) suele restablecer los precios; la aplicación reintenta varias fuentes automáticamente.'],
      ['¿Cómo se calculan mis pérdidas y ganancias?',
       'WalletLens calcula tu coste de adquisición por activo a partir de tus compras y ventas con el método del coste medio. La ganancia o pérdida latente es la diferencia entre el valor de mercado actual y el coste de lo que aún mantienes.'],
    ]],
    ['Funciones e IA', [
      ['¿Qué hace el análisis con IA?',
       'El motor de decisiones revisa cada posición —momentum, peso en la cartera, pérdidas y ganancias— y sugiere una acción (mantener, añadir, reducir, vender) con sus motivos. También hay una evaluación de salud de la cartera, un escáner de riesgo, pruebas de estrés, un generador de plan de venta y seguimiento de objetivos de precio. Nada de esto es asesoramiento financiero.'],
      ['¿Puedo crear alertas de precio?',
       'Sí. Crea alertas de «sube por encima de» o «baja por debajo de» en cualquier posición. Con las notificaciones activadas recibes el aviso incluso con WalletLens en una pestaña en segundo plano, con sonido incluido.'],
      ['¿Qué es la importación por voz?',
       'Toca el micrófono y di algo como «compré medio Bitcoin a sesenta mil dólares en enero»: la IA lo convierte en una operación estructurada para que la confirmes. Funciona en inglés y en árabe.'],
      ['¿Qué es la importación por captura de pantalla?',
       'Sube una captura de cualquier exchange, bróker o aplicación bancaria y la IA lee las posiciones de la imagen y las añade a tu cartera: útil para migrar desde otro gestor en un solo paso.'],
      ['¿Qué hace la extensión de Chrome?',
       'La extensión de WalletLens muestra el total de tu cartera, todas tus posiciones con precios en vivo, datos de mercado, el índice de miedo y codicia, noticias y señales técnicas, desde la barra del navegador. Se sincroniza con la aplicación web mediante tus datos locales, sin necesidad de cuenta.'],
    ]],
    ['Comparativas y resolución de problemas', [
      ['¿En qué se diferencia WalletLens de CoinStats, Empower o Kubera?',
       'La mayoría de gestores se centran solo en cripto, cobran suscripción, exigen conectar credenciales de exchanges o bancos, o guardan tus datos en sus servidores. WalletLens cubre todas las clases de activos, es gratis para siempre, no pide ningún inicio de sesión y mantiene todos los datos en tu dispositivo.'],
      ['La aplicación carga pero los datos están vacíos, ¿qué hago?',
       'Primero fuerza una recarga (Ctrl+Mayús+R en escritorio, tirar para actualizar en móvil) para obtener la última versión. Si las secciones de mercado siguen vacías, puede que tu red bloquee las API de precios de cripto: WalletLens recurre automáticamente a una instantánea del mismo origen en unos segundos.'],
      ['Borré el navegador y perdí mi cartera. ¿Podéis recuperarla?',
       'Solo si guardaste un código de copia WLZ: pégalo en Ajustes → Copia de seguridad y lo recuperas todo al instante. No hay copia en servidor, que es el precio de la privacidad real, así que exporta una copia con regularidad.'],
      ['¿WalletLens es de código abierto?',
       'Sí. Puedes revisar el código, informar de problemas o contribuir en GitHub, en github.com/tia8910/walletlens.'],
      ['¿Cómo informo de un fallo o pido una función?',
       'Escribe a contact@walletlens.live o abre una incidencia en GitHub: lo leemos todo.'],
    ]],
  ],
}

/** The English table in the `{ title, faqs: [{ q, a }] }` shape. */
function toSections(rows) {
  return rows.map(([title, faqs]) => ({ title, faqs: faqs.map(([q, a]) => ({ q, a })) }))
}

/**
 * English, for the two consumers that must not move with the UI language:
 * the prerendered FAQPage JSON-LD (which describes the English page served at
 * the canonical URL) and the content test.
 */
export const FAQ_SECTIONS = toSections(FAQ_TEXT.en)

/**
 * The FAQ in one language, falling back per section.
 *
 * A translation that lost or gained a question would otherwise render a
 * different FAQ from the structured data describing the same page — so a
 * section whose question count drifts from English is dropped back to English
 * rather than shown short.
 */
export function faqSections(lang) {
  const rows = FAQ_TEXT[lang] || FAQ_TEXT.en
  return FAQ_TEXT.en.map(([enTitle, enFaqs], i) => {
    const [title, faqs] = rows[i] ?? [enTitle, enFaqs]
    const safe = faqs?.length === enFaqs.length ? faqs : enFaqs
    return { title: title || enTitle, faqs: safe.map(([q, a]) => ({ q, a })) }
  })
}

/**
 * The seven questions the About page repeats, by [section, index].
 *
 * They are a strict subset of the FAQ above, so they are picked out of it
 * rather than translated a second time — two copies of "Is WalletLens really
 * free?" in four languages each is eight chances for the answers to drift
 * apart, and the About page is where a stale claim would sit longest.
 */
const ABOUT_PICKS = [[0, 0], [0, 1], [1, 0], [2, 0], [4, 0], [0, 3], [1, 3]]

export function aboutFaqs(lang) {
  const sections = faqSections(lang)
  return ABOUT_PICKS.map(([s, i]) => sections[s].faqs[i])
}

// ── Fear & Greed index page ────────────────────────────────────────────────
//
// Its own set, separate from the general FAQ: these answer questions about one
// metric rather than about the app, and the /fear-and-greed-index/ page has
// its own FAQPage structured data.
export const FNG_FAQ_TEXT = {
  en: [
    ['What is the crypto fear and greed index?',
     'The crypto fear and greed index is a 0–100 score that measures overall market sentiment. A low score (0–24) signals extreme fear — most investors are selling. A high score (75–100) signals extreme greed — most are buying aggressively. WalletLens computes it in real time from market breadth and momentum across the top coins.'],
    ['How is the WalletLens fear and greed score calculated?',
     'The score weighs two pillars: market breadth (60%) — the percentage of top coins up over 24 hours — and price momentum (40%) — the average 24-hour move of the top 10 coins, normalised to a 0–100 scale. The result updates continuously as new price data arrives.'],
    ['What does a score of 50 mean?',
     'A score of 50 is neutral — the market is balanced between buyers and sellers with no clear directional edge. It often precedes a sharper move; watch for which side breaks first.'],
    ['Should I buy when fear is extreme?',
     'Historically, extreme fear (0–24) has often preceded recoveries, which is why some investors treat it as a contrarian signal. However, it does not guarantee a bottom. Use the index as one data point alongside your own research. This is not financial advice.'],
    ['How is this different from the original Crypto Fear & Greed Index?',
     'The most-cited version from Alternative.me uses seven factors including social media and Google Trends. WalletLens focuses on pure on-market data — breadth and momentum — updated in real time directly from price feeds, with no external survey data.'],
    ['Where can I track the live score?',
     'The live WalletLens fear and greed index is on the Market Index page (walletlens.live/market-index). You can also see it inside the WalletLens app under Portfolio Analysis, where it is overlaid against your own portfolio to help you interpret your exposure at current sentiment.'],
    ['How often does the score update?',
     'The score refreshes every 3 minutes on the Market Index page, pulling fresh price data from the top 20 coins. It reflects the most current market breadth and momentum available from public price feeds.'],
  ],
  ar: [
    ['ما هو مؤشّر الخوف والطمع للعملات الرقمية؟',
     'مؤشّر الخوف والطمع درجة من 0 إلى 100 تقيس المزاج العام للسوق. الدرجة المنخفضة (0–24) تعني خوفاً شديداً — أي أن معظم المستثمرين يبيعون. والدرجة المرتفعة (75–100) تعني طمعاً شديداً — أي أن معظمهم يشترون بقوّة. ويحسبه WalletLens لحظياً من اتّساع السوق وزخم الأسعار عبر أكبر العملات.'],
    ['كيف تُحتسب درجة الخوف والطمع في WalletLens؟',
     'تعتمد الدرجة على ركيزتين: اتّساع السوق (60%) — أي نسبة أكبر العملات المرتفعة خلال 24 ساعة — وزخم السعر (40%) — أي متوسّط حركة أكبر 10 عملات خلال 24 ساعة، مُطبَّعاً على مقياس 0–100. وتتحدّث النتيجة باستمرار مع وصول بيانات أسعار جديدة.'],
    ['ماذا تعني درجة 50؟',
     'الدرجة 50 محايدة — السوق متوازن بين المشترين والبائعين بلا أفضلية اتجاهية واضحة. وكثيراً ما تسبق حركة أحدّ؛ فراقب أي الجانبين يكسر أوّلاً.'],
    ['هل أشتري عندما يكون الخوف شديداً؟',
     'تاريخياً، كثيراً ما سبق الخوف الشديد (0–24) موجاتِ تعافٍ، ولهذا يعامله بعض المستثمرين كإشارة معاكسة. لكنه لا يضمن القاع. استخدم المؤشّر كنقطة بيانات واحدة إلى جانب بحثك الخاص. وهذا ليس نصيحة مالية.'],
    ['بمَ يختلف هذا عن مؤشّر الخوف والطمع الأصلي؟',
     'النسخة الأكثر استشهاداً من Alternative.me تستخدم سبعة عوامل من بينها وسائل التواصل وGoogle Trends. أما WalletLens فيركّز على بيانات السوق البحتة — الاتّساع والزخم — محدَّثةً لحظياً من تدفّقات الأسعار مباشرةً، دون أي بيانات استطلاعية خارجية.'],
    ['أين أتابع الدرجة الحيّة؟',
     'مؤشّر الخوف والطمع الحيّ من WalletLens موجود في صفحة مؤشّر السوق (walletlens.live/market-index). ويمكنك رؤيته أيضاً داخل التطبيق ضمن «تحليل المحفظة»، حيث يُعرض مقابل محفظتك لتفهم تعرّضك عند المزاج السائد.'],
    ['كم مرّة تتحدّث الدرجة؟',
     'تتحدّث الدرجة كل 3 دقائق في صفحة مؤشّر السوق، بجلب بيانات أسعار جديدة لأكبر 20 عملة. وهي تعكس أحدث اتّساع وزخم متاحين من تدفّقات الأسعار العامة.'],
  ],
  fr: [
    ["Qu'est-ce que l'indice crypto de la peur et de l'avidité ?",
     "L'indice de la peur et de l'avidité est une note de 0 à 100 qui mesure le sentiment général du marché. Une note basse (0–24) signale une peur extrême : la plupart des investisseurs vendent. Une note élevée (75–100) signale une avidité extrême : la plupart achètent agressivement. WalletLens le calcule en temps réel à partir de l'ampleur du marché et du momentum des principales cryptos."],
    ['Comment la note WalletLens est-elle calculée ?',
     "La note repose sur deux piliers : l'ampleur du marché (60 %) — la part des principales cryptos en hausse sur 24 heures — et le momentum des prix (40 %) — la variation moyenne sur 24 heures des 10 premières cryptos, normalisée sur une échelle de 0 à 100. Le résultat évolue en continu à mesure que de nouveaux prix arrivent."],
    ['Que signifie une note de 50 ?',
     "Une note de 50 est neutre : le marché est équilibré entre acheteurs et vendeurs, sans avantage directionnel net. Elle précède souvent un mouvement plus marqué ; observez quel camp cède en premier."],
    ["Faut-il acheter quand la peur est extrême ?",
     "Historiquement, une peur extrême (0–24) a souvent précédé des reprises, ce qui pousse certains investisseurs à y voir un signal à contre-courant. Cela ne garantit toutefois aucun point bas. Utilisez l'indice comme une donnée parmi d'autres, en complément de vos propres recherches. Ceci n'est pas un conseil financier."],
    ["En quoi diffère-t-il de l'indice Crypto Fear & Greed d'origine ?",
     "La version la plus citée, celle d'Alternative.me, combine sept facteurs dont les réseaux sociaux et Google Trends. WalletLens s'en tient aux données de marché pures — ampleur et momentum — mises à jour en temps réel depuis les flux de prix, sans données d'enquête externes."],
    ['Où suivre la note en direct ?',
     "L'indice WalletLens en direct se trouve sur la page Market Index (walletlens.live/market-index). Vous le retrouvez aussi dans l'application, sous Analyse de portefeuille, superposé à votre propre portefeuille pour vous aider à interpréter votre exposition au sentiment du moment."],
    ['À quelle fréquence la note est-elle mise à jour ?',
     "La note est actualisée toutes les 3 minutes sur la page Market Index, à partir de prix frais pour les 20 premières cryptos. Elle reflète l'ampleur et le momentum les plus récents disponibles depuis les flux de prix publics."],
  ],
  es: [
    ['¿Qué es el índice de miedo y codicia de las criptomonedas?',
     'El índice de miedo y codicia es una puntuación de 0 a 100 que mide el sentimiento general del mercado. Una puntuación baja (0–24) señala miedo extremo: la mayoría de los inversores están vendiendo. Una puntuación alta (75–100) señala codicia extrema: la mayoría compra con agresividad. WalletLens lo calcula en tiempo real a partir de la amplitud del mercado y del momentum de las principales monedas.'],
    ['¿Cómo se calcula la puntuación de WalletLens?',
     'La puntuación se apoya en dos pilares: la amplitud del mercado (60 %), es decir el porcentaje de las principales monedas que suben en 24 horas, y el momentum del precio (40 %), la variación media a 24 horas de las 10 primeras monedas, normalizada a una escala de 0 a 100. El resultado se actualiza de forma continua conforme llegan nuevos precios.'],
    ['¿Qué significa una puntuación de 50?',
     'Una puntuación de 50 es neutral: el mercado está equilibrado entre compradores y vendedores, sin una ventaja direccional clara. Suele preceder a un movimiento más brusco; observa qué lado rompe primero.'],
    ['¿Debería comprar cuando el miedo es extremo?',
     'Históricamente, el miedo extremo (0–24) ha precedido a menudo a las recuperaciones, y por eso algunos inversores lo tratan como una señal contraria. Sin embargo, no garantiza un suelo. Usa el índice como un dato más, junto con tu propia investigación. Esto no es asesoramiento financiero.'],
    ['¿En qué se diferencia del índice Crypto Fear & Greed original?',
     'La versión más citada, la de Alternative.me, usa siete factores, entre ellos las redes sociales y Google Trends. WalletLens se centra en datos puros de mercado —amplitud y momentum— actualizados en tiempo real directamente desde los flujos de precios, sin datos de encuestas externas.'],
    ['¿Dónde puedo seguir la puntuación en vivo?',
     'El índice de miedo y codicia en vivo de WalletLens está en la página Market Index (walletlens.live/market-index). También lo ves dentro de la aplicación, en Análisis de cartera, superpuesto a tu propia cartera para ayudarte a interpretar tu exposición con el sentimiento actual.'],
    ['¿Con qué frecuencia se actualiza la puntuación?',
     'La puntuación se refresca cada 3 minutos en la página Market Index, tomando precios nuevos de las 20 principales monedas. Refleja la amplitud y el momentum más recientes disponibles en los flujos de precios públicos.'],
  ],
}

/** The Fear & Greed questions in one language, English on any shape drift. */
export function fngFaqs(lang) {
  const rows = FNG_FAQ_TEXT[lang]
  const safe = rows?.length === FNG_FAQ_TEXT.en.length ? rows : FNG_FAQ_TEXT.en
  return safe.map(([q, a]) => ({ q, a }))
}
