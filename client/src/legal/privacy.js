// The Privacy Policy, per language.
//
// Kept out of i18n.js on purpose: that file is a flat key/value table for UI
// labels, and a legal document is a sequence of headings, paragraphs and lists
// whose order matters. Flattening it into two hundred numbered keys would make
// both files worse and make it very easy to translate a clause into the wrong
// position.
//
// Inline emphasis uses a three-marker mini-syntax that survives translation
// better than embedded JSX: **bold**, `code`, and [text](href). DocProse in
// ../components/DocProse.jsx renders it.
//
// The English text is the authoritative version — see legalEnglishGoverns in
// i18n.js, which every non-English rendering displays at the top.

export const PRIVACY_UPDATED = 'August 2026'

export const privacy = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: August 2026',
    intro: 'WalletLens ("we", "our", or "the app") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and what choices you have.',
    sections: [
      { h: '1. No Account Required', p: [
        'WalletLens does not require you to create an account, provide an email address, or submit any personal identification. You can use the full app anonymously. Several optional features described in section 3 do ask for an email address or a Google sign-in; none of them is needed to track a portfolio, and each is off until you turn it on.',
      ] },
      { h: '2. Local-First by Default', p: [
        "Your portfolio — wallets, transactions, holdings, and price targets — is stored in your browser's `localStorage`. In its default configuration WalletLens has no user accounts and no database: if you never enable any feature in section 3, your portfolio is never transmitted to us and we have no way to see it.",
        'To move your data between devices yourself, you can export a WLZ backup code from the Dashboard. This code is a compressed, base64-encoded representation of your local data. You control when and how it is shared.',
      ] },
      { h: '3. Optional Features That Send Data Off Your Device', p: [
        'The following features are opt-in and each one transmits data to our server at `walletlens-voice-parse.tia8910.deno.net`, which sends mail through Resend and, where noted, relays requests to Anthropic. We list exactly what leaves your device so you can decide feature by feature:',
      ], ul: [
        '**Email backup** — your email address and your complete backup code, which contains your full portfolio. It is emailed to you and not retained after sending.',
        '**Weekly report** — your email address, an anonymous device identifier, your total portfolio value, your week-on-week change, and your largest holdings with their symbols, values and profit/loss. This snapshot is stored so the weekly email can be sent on schedule, and is replaced each time the app refreshes it.',
        '**Portfolio Guardian** — an anonymous device identifier, a summary of your portfolio, and the names and email addresses of the heirs you nominate. Stored so we can contact them if your check-ins stop.',
        '**Price alerts and push notifications** — your browser’s push endpoint and your alert list, which includes the assets you watch and your target prices. Stored so alerts can be delivered while the app is closed.',
        '**AI features** (voice entry, screenshot import, assistant, Magic Indicator, vision advice) — the text, audio transcript or image you supply, together with the portfolio context needed to answer. Unless you provide your own API key, these are relayed through our server to **Anthropic** and are subject to Anthropic’s privacy policy. We do not retain them.',
      ], after: [
        'You can stop any of these at any time from Settings; unsubscribing deletes the stored record for that feature. To have everything associated with your device removed, email us at the address in section 11.',
      ] },
      { h: '4. Google Drive Backup', p: [
        'If you choose to connect Google Drive, WalletLens requests only the `drive.file` scope, which grants access solely to the single backup file the app itself creates — it cannot see anything else in your Drive. The backup is encrypted in your browser with a passphrase you choose before it is uploaded, using AES-GCM with a key derived by PBKDF2.',
        'The file is stored in your Google Drive, not on our servers, and it does not pass through them. Your Google sign-in token stays in your browser’s memory and is never sent to us. Because the passphrase is never stored or transmitted, neither we nor Google can read the contents of the backup — and if you lose the passphrase, nobody can recover it.',
      ] },
      { h: '5. Third-Party Price APIs', p: [
        'WalletLens fetches live market prices from the following public APIs. These requests originate from your browser and are subject to each provider’s privacy policy:',
      ], ul: [
        '**CoinGecko** — cryptocurrency prices and market data (coingecko.com)',
        '**Binance** — cryptocurrency prices (binance.com)',
        '**CoinCap** — cryptocurrency fallback prices (coincap.io)',
        '**Gold-API** — gold and silver spot prices (gold-api.com)',
        '**Stooq** — US and global stock prices (stooq.com)',
        '**ExchangeRate APIs** — fiat currency exchange rates',
        '**Blockchain.info** — unconfirmed Bitcoin mempool data for the Whale Tracker',
        '**Finnhub, Alpha Vantage, Yahoo Finance** — stock quotes and company data',
        '**CryptoCompare, CoinPaprika, Kraken, Blockchair** — additional cryptocurrency prices and on-chain data',
        '**GoPlus Labs** — token safety checks',
        '**Frankfurter, exchangerate.host, open.er-api.com** — fiat exchange rates',
        '**rss2json** — news headlines; **wsrv.nl** — image resizing for asset logos',
      ], after: [
        'When a direct request is blocked by a provider’s CORS policy, it is relayed through a proxy — either our own server or one of the public services `corsproxy.io`, `allorigins.win`, `cors.eu.org` or `api.codetabs.com`. The relayed request contains the same market-data lookup and no portfolio contents.',
        'These services receive your IP address, and the lookups tell them which assets you are viewing — which, for assets you hold, indicates the composition of your portfolio. They are never sent your amounts, transactions, wallet names or valuations.',
      ] },
      { h: '6. Analytics', p: [
        'We use **Google Analytics (GA4)** to understand aggregate usage patterns such as page views, session duration, and device type. This helps us improve the app. Google Analytics uses cookies and may collect your IP address and browser information. You can opt out using the [Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout).',
        'Analytics events record which features are used, never what you own. Ad-personalisation signals are disabled, and no event carries asset symbols, amounts, valuations, profit or loss, or anything you have typed. On the web, an X (Twitter) advertising pixel also loads to measure referrals from our posts there; it is not included in the Google Play app.',
        'News headlines shown in the app are translated on request through our own server, which relays the headline text to Anthropic. Only the public headline is sent — never anything from your portfolio.',
      ] },
      { h: '7. Cookies', p: [
        'WalletLens itself does not set any first-party cookies beyond what is strictly necessary for the app to function. Third-party services described above may set their own cookies as described in their respective privacy policies. WalletLens does not serve advertising in the app.',
      ] },
      { h: '8. Retention and Deletion', p: [
        'Records created by the optional features in section 3 are kept only while that feature is switched on. Turning a feature off in Settings deletes its stored record. Backup emails and AI requests are not retained after they are processed. To have everything associated with your device deleted, email the address in section 11 — no account is needed, and we will confirm once it is done.',
      ] },
      { h: "9. Children's Privacy", p: [
        'WalletLens is not directed at children under the age of 13. We do not knowingly collect personal information from children.',
      ] },
      { h: '10. Changes to This Policy', p: [
        'We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "last modified" date. Continued use of the app after changes constitutes acceptance of the revised policy.',
      ] },
      { h: '11. Contact', p: [
        'If you have any questions about this Privacy Policy, please email us at [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  ar: {
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث: أغسطس 2026',
    intro: 'يلتزم WalletLens («نحن» أو «التطبيق») بحماية خصوصيتك. وتوضّح هذه السياسة ما نجمعه من معلومات، وكيف نستخدمها، وما الخيارات المتاحة لك.',
    sections: [
      { h: '١. لا حاجة إلى حساب', p: [
        'لا يطلب منك WalletLens إنشاء حساب أو تقديم بريد إلكتروني أو أي بيانات تعريف شخصية. يمكنك استخدام التطبيق بالكامل دون الكشف عن هويتك. وهناك عدة ميزات اختيارية موضّحة في القسم 3 تطلب بريداً إلكترونياً أو تسجيل دخول عبر Google؛ ولا حاجة إلى أي منها لتتبّع محفظة، وكلٌّ منها معطَّل حتى تُفعّله بنفسك.',
      ] },
      { h: '٢. محلي أولاً بشكل افتراضي', p: [
        'تُحفظ محفظتك — المحافظ والمعاملات والأصول وأهداف السعر — في `localStorage` داخل متصفحك. وفي إعداده الافتراضي لا يملك WalletLens حسابات مستخدمين ولا قاعدة بيانات: فإن لم تُفعّل أي ميزة من القسم 3، فلن تُرسَل محفظتك إلينا أبداً ولن تكون لدينا أي وسيلة لرؤيتها.',
        'ولنقل بياناتك بين أجهزتك بنفسك، يمكنك تصدير رمز نسخ احتياطي بصيغة WLZ من لوحة التحكم. وهذا الرمز تمثيل مضغوط ومشفَّر بـ base64 لبياناتك المحلية. وأنت من يتحكّم في موعد مشاركته وطريقتها.',
      ] },
      { h: '٣. ميزات اختيارية تُرسل بيانات خارج جهازك', p: [
        'الميزات التالية اختيارية، وكلٌّ منها يرسل بيانات إلى خادمنا على `walletlens-voice-parse.tia8910.deno.net`، الذي يرسل البريد عبر Resend، ويحوّل الطلبات إلى Anthropic حيثما أُشير إلى ذلك. ونُدرج بدقة ما يغادر جهازك لتقرّر ميزةً ميزة:',
      ], ul: [
        '**النسخ الاحتياطي بالبريد** — بريدك الإلكتروني ورمز النسخ الاحتياطي الكامل، الذي يحتوي على محفظتك بأكملها. يُرسَل إليك بالبريد ولا يُحتفظ به بعد الإرسال.',
        '**التقرير الأسبوعي** — بريدك الإلكتروني، ومعرّف جهاز مجهول الهوية، وإجمالي قيمة محفظتك، وتغيّرها الأسبوعي، وأكبر أصولك برموزها وقيمها وأرباحها وخسائرها. تُخزَّن هذه اللقطة ليتسنّى إرسال البريد الأسبوعي في موعده، ويُستبدَل بها ما سبق في كل مرة يحدّثها التطبيق.',
        '**حارس المحفظة** — معرّف جهاز مجهول الهوية، وملخّص لمحفظتك، وأسماء الورثة الذين تعيّنهم وعناوين بريدهم الإلكتروني. تُخزَّن لنتمكّن من التواصل معهم إذا توقّفت عن تسجيل حضورك.',
        '**تنبيهات الأسعار والإشعارات** — نقطة الإشعارات الخاصة بمتصفحك وقائمة تنبيهاتك، وتشمل الأصول التي تتابعها وأسعارك المستهدفة. تُخزَّن ليتسنّى إيصال التنبيهات والتطبيق مغلق.',
        '**ميزات الذكاء الاصطناعي** (الإدخال الصوتي، والاستيراد من لقطة شاشة، والمساعد، والمؤشر السحري، ونصائح الرؤية) — النص أو التفريغ الصوتي أو الصورة التي تقدّمها، مع سياق المحفظة اللازم للإجابة. وما لم تستخدم مفتاح API خاصاً بك، تُحوَّل هذه عبر خادمنا إلى **Anthropic** وتخضع لسياسة خصوصية Anthropic. ولا نحتفظ بها.',
      ], after: [
        'يمكنك إيقاف أي من هذه الميزات في أي وقت من الإعدادات؛ وإلغاء الاشتراك يحذف السجل المخزَّن لتلك الميزة. ولحذف كل ما يرتبط بجهازك، راسلنا على العنوان الوارد في القسم 11.',
      ] },
      { h: '٤. النسخ الاحتياطي على Google Drive', p: [
        'إذا اخترت ربط Google Drive، فإن WalletLens يطلب نطاق `drive.file` فقط، وهو يمنح الوصول إلى ملف النسخ الاحتياطي الوحيد الذي ينشئه التطبيق نفسه لا غير — ولا يمكنه رؤية أي شيء آخر في Drive الخاص بك. ويُشفَّر النسخ الاحتياطي داخل متصفحك بعبارة مرور تختارها قبل رفعه، باستخدام AES-GCM بمفتاح مشتقّ عبر PBKDF2.',
        'ويُحفظ الملف في Google Drive الخاص بك، لا على خوادمنا، ولا يمر بها. ويبقى رمز تسجيل دخولك إلى Google في ذاكرة متصفحك ولا يُرسَل إلينا أبداً. ولأن عبارة المرور لا تُخزَّن ولا تُرسَل، فلا يمكننا نحن ولا Google قراءة محتوى النسخة الاحتياطية — وإذا فقدت عبارة المرور فلا يستطيع أحد استرجاعها.',
      ] },
      { h: '٥. واجهات أسعار من أطراف ثالثة', p: [
        'يجلب WalletLens أسعار السوق المباشرة من الواجهات العامة التالية. وتنطلق هذه الطلبات من متصفحك وتخضع لسياسة خصوصية كل مزوّد:',
      ], ul: [
        '**CoinGecko** — أسعار العملات الرقمية وبيانات السوق (coingecko.com)',
        '**Binance** — أسعار العملات الرقمية (binance.com)',
        '**CoinCap** — أسعار احتياطية للعملات الرقمية (coincap.io)',
        '**Gold-API** — الأسعار الفورية للذهب والفضة (gold-api.com)',
        '**Stooq** — أسعار الأسهم الأمريكية والعالمية (stooq.com)',
        '**واجهات أسعار الصرف** — أسعار صرف العملات الورقية',
        '**Blockchain.info** — بيانات معاملات البيتكوين غير المؤكَّدة لمتتبّع الحيتان',
        '**Finnhub وAlpha Vantage وYahoo Finance** — أسعار الأسهم وبيانات الشركات',
        '**CryptoCompare وCoinPaprika وKraken وBlockchair** — أسعار إضافية للعملات الرقمية وبيانات على السلسلة',
        '**GoPlus Labs** — فحوصات أمان الرموز',
        '**Frankfurter وexchangerate.host وopen.er-api.com** — أسعار صرف العملات الورقية',
        '**rss2json** — عناوين الأخبار؛ **wsrv.nl** — تغيير أحجام صور شعارات الأصول',
      ], after: [
        'وعندما تحجب سياسة CORS لدى مزوّد ما طلباً مباشراً، يُحوَّل الطلب عبر وسيط — إما خادمنا أو إحدى الخدمات العامة `corsproxy.io` أو `allorigins.win` أو `cors.eu.org` أو `api.codetabs.com`. ويحتوي الطلب المحوَّل على استعلام بيانات السوق نفسه دون أي محتوى من محفظتك.',
        'وتتلقّى هذه الخدمات عنوان IP الخاص بك، وتكشف لها الاستعلامات الأصول التي تطّلع عليها — وهو ما يشير، بالنسبة إلى الأصول التي تملكها، إلى تركيبة محفظتك. ولا تُرسَل إليها أبداً كمياتك ولا معاملاتك ولا أسماء محافظك ولا تقييماتك.',
      ] },
      { h: '٦. التحليلات', p: [
        'نستخدم **Google Analytics (GA4)** لفهم أنماط الاستخدام الإجمالية مثل مرات عرض الصفحات ومدة الجلسة ونوع الجهاز. ويساعدنا ذلك على تحسين التطبيق. ويستخدم Google Analytics ملفات تعريف الارتباط وقد يجمع عنوان IP الخاص بك ومعلومات متصفحك. ويمكنك إلغاء الاشتراك عبر [إضافة إلغاء الاشتراك في Google Analytics](https://tools.google.com/dlpage/gaoptout).',
        'وتسجّل أحداث التحليلات أي الميزات تُستخدم، لا ما تملكه أبداً. وإشارات تخصيص الإعلانات معطَّلة، ولا يحمل أي حدث رموز أصول ولا كميات ولا تقييمات ولا أرباحاً أو خسائر ولا أي شيء كتبته. وعلى الويب تُحمَّل أيضاً بكسل إعلاني من X (تويتر) لقياس الزيارات الواردة من منشوراتنا هناك؛ وهو غير مضمَّن في تطبيق Google Play.',
        'وتُترجَم عناوين الأخبار المعروضة في التطبيق عند الطلب عبر خادمنا، الذي يحوّل نص العنوان إلى Anthropic. ولا يُرسَل سوى العنوان العام — ولا شيء إطلاقاً من محفظتك.',
      ] },
      { h: '٧. ملفات تعريف الارتباط', p: [
        'لا يضع WalletLens نفسه أي ملفات تعريف ارتباط خاصة به بما يتجاوز ما هو ضروري تماماً لعمل التطبيق. وقد تضع خدمات الأطراف الثالثة الموضّحة أعلاه ملفاتها الخاصة وفق سياسات الخصوصية الخاصة بها. ولا يعرض WalletLens إعلانات داخل التطبيق.',
      ] },
      { h: '٨. الاحتفاظ والحذف', p: [
        'لا تُحفَظ السجلات التي تنشئها الميزات الاختيارية في القسم 3 إلا ما دامت تلك الميزة مفعَّلة. وإيقاف ميزة من الإعدادات يحذف سجلها المخزَّن. ولا يُحتفظ برسائل النسخ الاحتياطي ولا بطلبات الذكاء الاصطناعي بعد معالجتها. ولحذف كل ما يرتبط بجهازك، راسل العنوان الوارد في القسم 11 — لا حاجة إلى حساب، وسنؤكّد لك إتمام ذلك.',
      ] },
      { h: '٩. خصوصية الأطفال', p: [
        'WalletLens غير موجَّه إلى الأطفال دون سن 13 عاماً. ولا نجمع عن علم أي معلومات شخصية من الأطفال.',
      ] },
      { h: '١٠. التغييرات على هذه السياسة', p: [
        'قد نحدّث سياسة الخصوصية هذه من حين لآخر. وستُنشَر التغييرات على هذه الصفحة مع تحديث تاريخ «آخر تعديل». ويُعدّ استمرارك في استخدام التطبيق بعد التغييرات قبولاً بالسياسة المعدَّلة.',
      ] },
      { h: '١١. التواصل', p: [
        'إذا كانت لديك أي أسئلة بشأن سياسة الخصوصية هذه، فيُرجى مراسلتنا على [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : août 2026',
    intro: 'WalletLens (« nous », « notre » ou « l’application ») s’engage à protéger votre vie privée. Cette politique explique quelles informations nous recueillons, comment nous les utilisons et quels choix s’offrent à vous.',
    sections: [
      { h: '1. Aucun compte requis', p: [
        'WalletLens ne vous demande pas de créer un compte, de fournir une adresse e-mail ni de soumettre la moindre pièce d’identité. Vous pouvez utiliser l’application entière de façon anonyme. Plusieurs fonctionnalités facultatives décrites à la section 3 demandent une adresse e-mail ou une connexion Google ; aucune n’est nécessaire pour suivre un portefeuille, et chacune est désactivée tant que vous ne l’activez pas.',
      ] },
      { h: '2. Local par défaut', p: [
        'Votre portefeuille — comptes, transactions, positions et objectifs de prix — est stocké dans le `localStorage` de votre navigateur. Dans sa configuration par défaut, WalletLens n’a ni comptes utilisateur ni base de données : si vous n’activez aucune fonctionnalité de la section 3, votre portefeuille ne nous est jamais transmis et nous n’avons aucun moyen de le voir.',
        'Pour déplacer vous-même vos données d’un appareil à l’autre, vous pouvez exporter un code de sauvegarde WLZ depuis le tableau de bord. Ce code est une représentation compressée et encodée en base64 de vos données locales. Vous décidez quand et comment le partager.',
      ] },
      { h: '3. Fonctionnalités facultatives qui envoient des données hors de votre appareil', p: [
        'Les fonctionnalités suivantes sont facultatives et chacune transmet des données à notre serveur `walletlens-voice-parse.tia8910.deno.net`, qui envoie les e-mails via Resend et, le cas échéant, relaie les requêtes vers Anthropic. Nous indiquons précisément ce qui quitte votre appareil afin que vous puissiez décider fonctionnalité par fonctionnalité :',
      ], ul: [
        '**Sauvegarde par e-mail** — votre adresse e-mail et votre code de sauvegarde complet, qui contient l’intégralité de votre portefeuille. Il vous est envoyé par e-mail et n’est pas conservé après l’envoi.',
        '**Rapport hebdomadaire** — votre adresse e-mail, un identifiant d’appareil anonyme, la valeur totale de votre portefeuille, sa variation hebdomadaire et vos principales positions avec leurs symboles, valeurs et résultats. Cet instantané est conservé pour que l’e-mail hebdomadaire puisse partir à l’heure, et il est remplacé à chaque actualisation par l’application.',
        '**Gardien de portefeuille** — un identifiant d’appareil anonyme, un résumé de votre portefeuille, ainsi que les noms et adresses e-mail des héritiers que vous désignez. Conservés pour que nous puissions les contacter si vos vérifications s’interrompent.',
        '**Alertes de prix et notifications push** — le point de terminaison push de votre navigateur et votre liste d’alertes, qui comprend les actifs que vous surveillez et vos prix cibles. Conservés pour que les alertes puissent être délivrées application fermée.',
        '**Fonctionnalités d’IA** (saisie vocale, import par capture d’écran, assistant, Indicateur magique, conseils visuels) — le texte, la transcription audio ou l’image que vous fournissez, avec le contexte de portefeuille nécessaire à la réponse. Sauf si vous utilisez votre propre clé API, ces éléments transitent par notre serveur vers **Anthropic** et relèvent de la politique de confidentialité d’Anthropic. Nous ne les conservons pas.',
      ], after: [
        'Vous pouvez interrompre chacune de ces fonctionnalités à tout moment depuis les Paramètres ; le désabonnement supprime l’enregistrement stocké pour cette fonctionnalité. Pour faire supprimer tout ce qui est associé à votre appareil, écrivez-nous à l’adresse indiquée à la section 11.',
      ] },
      { h: '4. Sauvegarde Google Drive', p: [
        'Si vous choisissez de connecter Google Drive, WalletLens ne demande que la portée `drive.file`, qui donne accès uniquement au fichier de sauvegarde que l’application crée elle-même — elle ne peut rien voir d’autre dans votre Drive. La sauvegarde est chiffrée dans votre navigateur avec une phrase secrète que vous choisissez avant l’envoi, en AES-GCM avec une clé dérivée par PBKDF2.',
        'Le fichier est stocké dans votre Google Drive, pas sur nos serveurs, et il ne transite pas par eux. Votre jeton de connexion Google reste dans la mémoire de votre navigateur et ne nous est jamais envoyé. Comme la phrase secrète n’est ni stockée ni transmise, ni nous ni Google ne pouvons lire le contenu de la sauvegarde — et si vous la perdez, personne ne peut la récupérer.',
      ] },
      { h: '5. API de prix tierces', p: [
        'WalletLens récupère les cours en direct auprès des API publiques suivantes. Ces requêtes partent de votre navigateur et relèvent de la politique de confidentialité de chaque fournisseur :',
      ], ul: [
        '**CoinGecko** — cours des cryptomonnaies et données de marché (coingecko.com)',
        '**Binance** — cours des cryptomonnaies (binance.com)',
        '**CoinCap** — cours de repli pour les cryptomonnaies (coincap.io)',
        '**Gold-API** — cours au comptant de l’or et de l’argent (gold-api.com)',
        '**Stooq** — cours des actions américaines et mondiales (stooq.com)',
        '**API de taux de change** — taux de change des devises',
        '**Blockchain.info** — données du mempool Bitcoin pour le suivi des baleines',
        '**Finnhub, Alpha Vantage, Yahoo Finance** — cotations boursières et données d’entreprise',
        '**CryptoCompare, CoinPaprika, Kraken, Blockchair** — cours de cryptomonnaies et données on-chain supplémentaires',
        '**GoPlus Labs** — contrôles de sécurité des tokens',
        '**Frankfurter, exchangerate.host, open.er-api.com** — taux de change',
        '**rss2json** — titres d’actualité ; **wsrv.nl** — redimensionnement des logos d’actifs',
      ], after: [
        'Lorsqu’une requête directe est bloquée par la politique CORS d’un fournisseur, elle est relayée par un proxy — soit notre propre serveur, soit l’un des services publics `corsproxy.io`, `allorigins.win`, `cors.eu.org` ou `api.codetabs.com`. La requête relayée contient la même recherche de données de marché et aucun contenu de portefeuille.',
        'Ces services reçoivent votre adresse IP, et les recherches leur indiquent quels actifs vous consultez — ce qui, pour les actifs que vous détenez, révèle la composition de votre portefeuille. Vos montants, transactions, noms de comptes et valorisations ne leur sont jamais transmis.',
      ] },
      { h: '6. Analyse d’audience', p: [
        'Nous utilisons **Google Analytics (GA4)** pour comprendre les usages agrégés : pages vues, durée des sessions, type d’appareil. Cela nous aide à améliorer l’application. Google Analytics utilise des cookies et peut collecter votre adresse IP et des informations sur votre navigateur. Vous pouvez vous y opposer via le [module de désactivation de Google Analytics](https://tools.google.com/dlpage/gaoptout).',
        'Les événements enregistrent quelles fonctionnalités sont utilisées, jamais ce que vous détenez. Les signaux de personnalisation publicitaire sont désactivés, et aucun événement ne contient de symbole d’actif, de montant, de valorisation, de gain ou perte, ni quoi que ce soit que vous ayez saisi. Sur le web, un pixel publicitaire X (Twitter) se charge également pour mesurer les visites issues de nos publications ; il n’est pas inclus dans l’application Google Play.',
        'Les titres d’actualité affichés dans l’application sont traduits à la demande via notre serveur, qui transmet le texte du titre à Anthropic. Seul le titre public est envoyé — jamais quoi que ce soit de votre portefeuille.',
      ] },
      { h: '7. Cookies', p: [
        'WalletLens ne dépose lui-même aucun cookie propriétaire au-delà de ce qui est strictement nécessaire au fonctionnement de l’application. Les services tiers décrits ci-dessus peuvent déposer leurs propres cookies, comme indiqué dans leurs politiques respectives. WalletLens ne diffuse pas de publicité dans l’application.',
      ] },
      { h: '8. Conservation et suppression', p: [
        'Les enregistrements créés par les fonctionnalités facultatives de la section 3 ne sont conservés que tant que la fonctionnalité est activée. La désactiver dans les Paramètres supprime son enregistrement. Les e-mails de sauvegarde et les requêtes d’IA ne sont pas conservés après traitement. Pour faire supprimer tout ce qui est associé à votre appareil, écrivez à l’adresse de la section 11 — aucun compte n’est nécessaire et nous vous confirmerons la suppression.',
      ] },
      { h: '9. Protection des mineurs', p: [
        'WalletLens ne s’adresse pas aux enfants de moins de 13 ans. Nous ne collectons pas sciemment de données personnelles auprès d’enfants.',
      ] },
      { h: '10. Modifications de cette politique', p: [
        'Nous pouvons mettre à jour cette politique de temps à autre. Les modifications seront publiées sur cette page avec une date de dernière modification actualisée. Continuer à utiliser l’application après ces modifications vaut acceptation de la politique révisée.',
      ] },
      { h: '11. Contact', p: [
        'Pour toute question sur cette politique de confidentialité, écrivez-nous à [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },

  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: agosto de 2026',
    intro: 'WalletLens («nosotros», «nuestro» o «la aplicación») se compromete a proteger tu privacidad. Esta política explica qué información recogemos, cómo la usamos y qué opciones tienes.',
    sections: [
      { h: '1. No hace falta cuenta', p: [
        'WalletLens no te pide crear una cuenta, facilitar un correo electrónico ni aportar ninguna identificación personal. Puedes usar la aplicación completa de forma anónima. Varias funciones opcionales descritas en la sección 3 sí piden un correo o un inicio de sesión con Google; ninguna es necesaria para seguir una cartera, y todas están desactivadas hasta que tú las actives.',
      ] },
      { h: '2. Local por defecto', p: [
        'Tu cartera —carteras, operaciones, posiciones y objetivos de precio— se guarda en el `localStorage` de tu navegador. En su configuración por defecto, WalletLens no tiene cuentas de usuario ni base de datos: si nunca activas ninguna función de la sección 3, tu cartera no se nos transmite jamás y no tenemos forma de verla.',
        'Para mover tus datos entre dispositivos por tu cuenta, puedes exportar un código de copia de seguridad WLZ desde el panel. Ese código es una representación comprimida y codificada en base64 de tus datos locales. Tú controlas cuándo y cómo se comparte.',
      ] },
      { h: '3. Funciones opcionales que envían datos fuera de tu dispositivo', p: [
        'Las siguientes funciones son opcionales y cada una transmite datos a nuestro servidor en `walletlens-voice-parse.tia8910.deno.net`, que envía el correo a través de Resend y, cuando se indica, retransmite peticiones a Anthropic. Detallamos exactamente qué sale de tu dispositivo para que decidas función por función:',
      ], ul: [
        '**Copia de seguridad por correo** — tu dirección de correo y tu código de copia completo, que contiene toda tu cartera. Se te envía por correo y no se conserva después del envío.',
        '**Informe semanal** — tu correo, un identificador de dispositivo anónimo, el valor total de tu cartera, su variación semanal y tus mayores posiciones con sus símbolos, valores y resultados. Esta instantánea se almacena para poder enviar el correo semanal a su hora, y se sustituye cada vez que la aplicación la actualiza.',
        '**Guardián de cartera** — un identificador de dispositivo anónimo, un resumen de tu cartera y los nombres y correos de los herederos que designes. Se almacenan para poder contactarlos si dejas de registrar actividad.',
        '**Alertas de precio y notificaciones push** — el punto de envío push de tu navegador y tu lista de alertas, que incluye los activos que vigilas y tus precios objetivo. Se almacenan para poder entregar las alertas con la aplicación cerrada.',
        '**Funciones de IA** (entrada por voz, importación desde captura, asistente, Indicador mágico, consejos visuales) — el texto, la transcripción de audio o la imagen que aportes, junto con el contexto de cartera necesario para responder. Salvo que uses tu propia clave de API, se retransmiten a través de nuestro servidor a **Anthropic** y quedan sujetas a su política de privacidad. No las conservamos.',
      ], after: [
        'Puedes detener cualquiera de estas funciones en cualquier momento desde Ajustes; darte de baja elimina el registro almacenado de esa función. Para que se borre todo lo asociado a tu dispositivo, escríbenos a la dirección de la sección 11.',
      ] },
      { h: '4. Copia de seguridad en Google Drive', p: [
        'Si decides conectar Google Drive, WalletLens solicita únicamente el ámbito `drive.file`, que da acceso solo al único archivo de copia que crea la propia aplicación: no puede ver nada más de tu Drive. La copia se cifra en tu navegador con una frase de contraseña que eliges antes de subirla, mediante AES-GCM con una clave derivada por PBKDF2.',
        'El archivo se guarda en tu Google Drive, no en nuestros servidores, y no pasa por ellos. Tu token de inicio de sesión de Google permanece en la memoria de tu navegador y nunca se nos envía. Como la frase de contraseña no se almacena ni se transmite, ni nosotros ni Google podemos leer el contenido de la copia; y si la pierdes, nadie puede recuperarla.',
      ] },
      { h: '5. API de precios de terceros', p: [
        'WalletLens obtiene los precios de mercado en vivo de las siguientes API públicas. Estas peticiones salen de tu navegador y quedan sujetas a la política de privacidad de cada proveedor:',
      ], ul: [
        '**CoinGecko** — precios de criptomonedas y datos de mercado (coingecko.com)',
        '**Binance** — precios de criptomonedas (binance.com)',
        '**CoinCap** — precios de respaldo de criptomonedas (coincap.io)',
        '**Gold-API** — precios spot del oro y la plata (gold-api.com)',
        '**Stooq** — precios de acciones de EE. UU. y del resto del mundo (stooq.com)',
        '**API de tipos de cambio** — tipos de cambio de divisas',
        '**Blockchain.info** — datos del mempool de Bitcoin para el rastreador de ballenas',
        '**Finnhub, Alpha Vantage, Yahoo Finance** — cotizaciones y datos de empresas',
        '**CryptoCompare, CoinPaprika, Kraken, Blockchair** — precios de criptomonedas y datos on-chain adicionales',
        '**GoPlus Labs** — comprobaciones de seguridad de tokens',
        '**Frankfurter, exchangerate.host, open.er-api.com** — tipos de cambio',
        '**rss2json** — titulares de noticias; **wsrv.nl** — redimensionado de los logotipos de activos',
      ], after: [
        'Cuando la política CORS de un proveedor bloquea una petición directa, esta se retransmite a través de un proxy: nuestro propio servidor o alguno de los servicios públicos `corsproxy.io`, `allorigins.win`, `cors.eu.org` o `api.codetabs.com`. La petición retransmitida contiene la misma consulta de datos de mercado y ningún contenido de tu cartera.',
        'Estos servicios reciben tu dirección IP, y las consultas les indican qué activos estás viendo, lo que en el caso de los que posees revela la composición de tu cartera. Nunca se les envían tus cantidades, operaciones, nombres de carteras ni valoraciones.',
      ] },
      { h: '6. Analítica', p: [
        'Usamos **Google Analytics (GA4)** para entender patrones de uso agregados como páginas vistas, duración de la sesión y tipo de dispositivo. Esto nos ayuda a mejorar la aplicación. Google Analytics usa cookies y puede recoger tu dirección IP e información del navegador. Puedes excluirte con el [complemento de inhabilitación de Google Analytics](https://tools.google.com/dlpage/gaoptout).',
        'Los eventos registran qué funciones se usan, nunca lo que posees. Las señales de personalización de anuncios están desactivadas y ningún evento contiene símbolos de activos, cantidades, valoraciones, ganancias o pérdidas, ni nada que hayas escrito. En la web también se carga un píxel publicitario de X (Twitter) para medir las visitas desde nuestras publicaciones; no se incluye en la aplicación de Google Play.',
        'Los titulares de noticias que se muestran en la aplicación se traducen bajo demanda a través de nuestro servidor, que transmite el texto del titular a Anthropic. Solo se envía el titular público, nunca nada de tu cartera.',
      ] },
      { h: '7. Cookies', p: [
        'WalletLens no instala por sí mismo cookies propias más allá de lo estrictamente necesario para que la aplicación funcione. Los servicios de terceros descritos arriba pueden instalar las suyas, según se explica en sus respectivas políticas. WalletLens no muestra publicidad dentro de la aplicación.',
      ] },
      { h: '8. Conservación y eliminación', p: [
        'Los registros creados por las funciones opcionales de la sección 3 solo se conservan mientras esa función esté activada. Desactivarla en Ajustes elimina su registro. Los correos de copia de seguridad y las peticiones de IA no se conservan tras procesarse. Para que se elimine todo lo asociado a tu dispositivo, escribe a la dirección de la sección 11: no hace falta cuenta y te confirmaremos cuando esté hecho.',
      ] },
      { h: '9. Privacidad de menores', p: [
        'WalletLens no está dirigido a menores de 13 años. No recogemos conscientemente datos personales de menores.',
      ] },
      { h: '10. Cambios en esta política', p: [
        'Podemos actualizar esta política de privacidad de vez en cuando. Los cambios se publicarán en esta página con una fecha de última modificación actualizada. Seguir usando la aplicación después de los cambios supone aceptar la política revisada.',
      ] },
      { h: '11. Contacto', p: [
        'Si tienes cualquier duda sobre esta política de privacidad, escríbenos a [contact@walletlens.live](mailto:contact@walletlens.live).',
      ] },
    ],
  },
}
