// The About page, in all four languages.
//
// Blocks rather than JSX: ['h2', text] | ['p', text] | ['ul', [item, …]] |
// ['faq'] for the question list the page shares with /faq/.
//
// Emphasis and links travel inside the string as **bold** and [text](href),
// resolved by DocProse's inline(). That marker set exists for the legal
// documents and is here for the same reason: a translator reorders a sentence
// and embedded JSX ends up wrapped around the wrong words, where a marker just
// moves with the phrase it belongs to.

export const ABOUT_TEXT = {
  en: {
    title: 'About WalletLens — The Free, Private Net Worth Tracker',
    meta: 'Track crypto, stocks, gold, silver, cash & FX in one dashboard — free, no account, data stays on your device',
    blocks: [
      ['h2', 'What is WalletLens?'],
      ['p', 'WalletLens is a **free net worth tracker** and all-asset portfolio manager that lets you track every investment you own — crypto, US stocks, ETFs, gold, silver, fiat currencies, cash, and bonds — in one unified dashboard. It runs entirely in your browser with no account, no server, and no subscription fee, so you can see your **entire net worth in one place** in seconds.'],
      ['p', 'The name comes from the idea of a lens: a tool that brings distant, complex things into sharp focus. WalletLens does exactly that for your wealth — pulling every scattered holding into a single, clear picture.'],
      ['h2', 'Why We Built It'],
      ['p', 'Most portfolio trackers either support only crypto, require a paid subscription, demand access to your exchange or bank accounts, or send your financial data to a third-party server. We wanted something different — a tool that respects your privacy, works offline, and covers every asset class a modern investor cares about.'],
      ['p', 'WalletLens was built on the principle that **your financial data belongs to you**. Everything you enter stays on your device in browser localStorage. There is no backend database, no user accounts, and no analytics tied to your portfolio.'],
      ['h2', 'Who WalletLens Is For'],
      ['ul', [
        '**Multi-asset investors** who hold crypto and stocks and precious metals and are tired of juggling three different apps.',
        "**Privacy-conscious people** who don't want to connect bank logins or hand their holdings to a cloud server.",
        '**Anyone who wants a free net worth tracker** without a subscription, a trial, or a credit card.',
        '**DIY investors** who want cost-basis tracking, profit targets, and clear profit/loss without a spreadsheet.',
      ]],
      ['h2', 'Key Features'],
      ['ul', [
        '**Multi-asset tracking** — Crypto (10,000+ coins via CoinGecko), US stocks (Stooq), gold and silver (live XAU/USD, XAG/USD), fiat currencies, and bonds.',
        '**Portfolio Analysis** — On-device intelligence that scores your portfolio health, runs stress tests, analyses entry quality, plans rebalancing, and displays a Fear & Greed gauge — all computed from your own data.',
        '**Multi-target sell plans** — Set up to five price targets per asset with progress bars and projected proceeds, so you always know when to take profit.',
        '**Whale Tracker** — Monitor large Bitcoin transactions from the mempool, market movers, volume anomalies, and CoinGecko trending searches.',
        '**Smart trade entry** — A bottom sheet with coin search, live price auto-fill, "Buy With" and "Sell For" counter-legs, and wallet tagging.',
        '**Share Your Gains** — Generate a beautiful portfolio card image (1200×630) and share it to X, download it, or copy it to your clipboard.',
        '**Backup codes** — Export your entire portfolio as a compact WLZ code. Import it on any device in seconds — no cloud required.',
        '**PWA** — Install WalletLens to your home screen on iOS, Android, or desktop for an app-like experience.',
      ]],
      ['h2', 'Completely Free'],
      ['p', 'WalletLens is and will always be free to use. There are no paid tiers, no premium features locked behind a paywall, and no freemium limits. There is no advertising, no tracking of what you own, and nothing to upgrade to.'],
      ['h2', 'Privacy by Design'],
      ['p', "We chose a local-first architecture deliberately. Your portfolio is your most sensitive financial information. By keeping it in your browser's localStorage instead of a server, we eliminate the risk of a data breach, account takeover, or unauthorised access. The trade-off is that you are responsible for your own backups — use the WLZ export regularly."],
      ['h2', 'Frequently Asked Questions'],
      ['faq'],
      ['h2', 'Get Started'],
      ['p', 'Ready to see your whole net worth in one place? [Open WalletLens free](/dashboard/) — no account needed. New to portfolio tracking? Start with our guide to the [best free net worth tracker](/blog/best-free-net-worth-tracker/), or browse all our [investing guides on the blog](/blog/).'],
      ['h2', 'Open Source'],
      ['p', 'WalletLens is open source. You can inspect the code, report issues, or contribute on [GitHub](https://github.com/tia8910/walletlens).'],
      ['h2', 'Contact'],
      ['p', 'Have feedback, found a bug, or want to suggest a feature? Email us at [contact@walletlens.live](mailto:contact@walletlens.live) — we read everything.'],
    ],
  },

  ar: {
    title: 'عن WalletLens — متتبّع صافي الثروة المجاني والخاص',
    meta: 'تتبّع العملات الرقمية والأسهم والذهب والفضة والنقد والعملات في لوحة واحدة — مجاناً وبلا حساب، وبياناتك تبقى على جهازك',
    blocks: [
      ['h2', 'ما هو WalletLens؟'],
      ['p', 'WalletLens هو **متتبّع مجاني لصافي الثروة** ومدير محافظ لكل فئات الأصول، يتيح لك تتبّع كل استثمار تملكه — العملات الرقمية والأسهم الأمريكية وصناديق المؤشرات والذهب والفضة والعملات الورقية والنقد والسندات — في لوحة واحدة موحّدة. يعمل بالكامل داخل متصفّحك بلا حساب ولا خادم ولا رسوم اشتراك، فترى **صافي ثروتك كاملاً في مكان واحد** خلال ثوانٍ.'],
      ['p', 'يأتي الاسم من فكرة العدسة: أداة تجعل الأشياء البعيدة والمعقّدة واضحة المعالم. وهذا تماماً ما يفعله WalletLens بثروتك — يجمع كل أصل متفرّق في صورة واحدة واضحة.'],
      ['h2', 'لماذا بنيناه'],
      ['p', 'معظم متتبّعات المحافظ إمّا تدعم العملات الرقمية وحدها، أو تفرض اشتراكاً مدفوعاً، أو تطلب صلاحية الوصول إلى حسابات منصّاتك وبنوكك، أو ترسل بياناتك المالية إلى خادم طرف ثالث. أردنا شيئاً مختلفاً — أداة تحترم خصوصيتك، وتعمل دون اتصال، وتغطّي كل فئة أصول تهمّ المستثمر اليوم.'],
      ['p', 'بُني WalletLens على مبدأ أن **بياناتك المالية ملك لك**. كل ما تُدخله يبقى على جهازك في ذاكرة المتصفّح المحلية. لا قاعدة بيانات خلفية، ولا حسابات مستخدمين، ولا تحليلات مرتبطة بمحفظتك.'],
      ['h2', 'لمن WalletLens'],
      ['ul', [
        '**المستثمرون متعدّدو الأصول** الذين يملكون عملات رقمية وأسهماً ومعادن ثمينة في آنٍ واحد، وسئموا التنقّل بين ثلاثة تطبيقات.',
        '**المهتمّون بالخصوصية** الذين لا يريدون ربط بيانات دخول بنوكهم أو تسليم ممتلكاتهم إلى خادم سحابي.',
        '**كل من يريد متتبّعاً مجانياً لصافي الثروة** بلا اشتراك ولا فترة تجريبية ولا بطاقة ائتمان.',
        '**المستثمرون المستقلّون** الذين يريدون تتبّع تكلفة الشراء وأهداف الربح وصورة واضحة للأرباح والخسائر دون جداول بيانات.',
      ]],
      ['h2', 'أبرز المزايا'],
      ['ul', [
        '**تتبّع متعدّد الأصول** — عملات رقمية (أكثر من 10,000 عملة عبر CoinGecko)، وأسهم أمريكية (Stooq)، وذهب وفضة (XAU/USD وXAG/USD مباشرةً)، وعملات ورقية، وسندات.',
        '**تحليل المحفظة** — ذكاء يعمل على الجهاز يقيّم صحّة محفظتك، ويجري اختبارات ضغط، ويحلّل جودة نقاط الدخول، ويخطّط إعادة التوازن، ويعرض مؤشّر الخوف والطمع — كل ذلك محسوب من بياناتك أنت.',
        '**خطط بيع متعدّدة الأهداف** — حدّد حتى خمسة أهداف سعرية لكل أصل مع أشرطة تقدّم وعوائد متوقّعة، لتعرف دائماً متى تجني الربح.',
        '**متتبّع الحيتان** — راقب تحويلات البيتكوين الكبيرة من الـmempool، وأبرز متحرّكي السوق، وشذوذ الأحجام، وعمليات البحث الرائجة على CoinGecko.',
        '**إدخال صفقات ذكي** — لوحة سفلية فيها بحث عن العملات، وتعبئة تلقائية للسعر المباشر، وأطراف مقابلة للشراء والبيع، ووسم المحافظ.',
        '**شارك مكاسبك** — أنشئ بطاقة صورة أنيقة لمحفظتك (1200×630) وشاركها على X أو نزّلها أو انسخها إلى الحافظة.',
        '**رموز النسخ الاحتياطي** — صدّر محفظتك كاملة كرمز WLZ مضغوط، واستوردها على أي جهاز خلال ثوانٍ — بلا حاجة إلى السحابة.',
        '**تطبيق ويب تقدّمي** — ثبّت WalletLens على شاشتك الرئيسية على iOS أو Android أو سطح المكتب لتجربة تشبه التطبيقات الأصلية.',
      ]],
      ['h2', 'مجاني تماماً'],
      ['p', 'WalletLens مجاني وسيبقى كذلك. لا باقات مدفوعة، ولا مزايا مميّزة خلف جدار دفع، ولا حدود على النسخة المجانية. ولا إعلانات، ولا تتبّع لما تملكه، ولا شيء تتم ترقيته.'],
      ['h2', 'الخصوصية بحكم التصميم'],
      ['p', 'اخترنا بنية «المحلي أولاً» عن قصد. محفظتك هي أكثر معلوماتك المالية حساسية، وبإبقائها في ذاكرة متصفّحك بدل خادم نُلغي خطر تسرّب البيانات أو الاستيلاء على الحساب أو الوصول غير المصرَّح به. والمقابل أنك مسؤول عن نسخك الاحتياطية — فاستخدم تصدير WLZ بانتظام.'],
      ['h2', 'الأسئلة الشائعة'],
      ['faq'],
      ['h2', 'ابدأ الآن'],
      ['p', 'جاهز لرؤية صافي ثروتك كاملاً في مكان واحد؟ [افتح WalletLens مجاناً](/dashboard/) — بلا حاجة إلى حساب. جديد على تتبّع المحافظ؟ ابدأ بدليلنا حول [أفضل متتبّع مجاني لصافي الثروة](/blog/best-free-net-worth-tracker/)، أو تصفّح كل [أدلّة الاستثمار في المدوّنة](/blog/).'],
      ['h2', 'مفتوح المصدر'],
      ['p', 'WalletLens مفتوح المصدر. يمكنك تفحّص الشيفرة أو الإبلاغ عن مشكلات أو المساهمة على [GitHub](https://github.com/tia8910/walletlens).'],
      ['h2', 'تواصل معنا'],
      ['p', 'لديك ملاحظة أو وجدت خللاً أو تريد اقتراح ميزة؟ راسلنا على [contact@walletlens.live](mailto:contact@walletlens.live) — نقرأ كل شيء.'],
    ],
  },

  fr: {
    title: 'À propos de WalletLens — le suivi de patrimoine gratuit et privé',
    meta: 'Suivez cryptos, actions, or, argent, liquidités et devises dans un seul tableau de bord — gratuit, sans compte, vos données restent sur votre appareil',
    blocks: [
      ['h2', "Qu'est-ce que WalletLens ?"],
      ['p', "WalletLens est un **suivi de patrimoine gratuit** et un gestionnaire de portefeuille multi-actifs qui vous permet de suivre chacun de vos investissements — cryptos, actions américaines, ETF, or, argent, devises, liquidités et obligations — dans un tableau de bord unifié. Il fonctionne entièrement dans votre navigateur, sans compte, sans serveur et sans abonnement : vous voyez **tout votre patrimoine au même endroit** en quelques secondes."],
      ['p', "Le nom vient de l'idée d'une lentille : un instrument qui rend nettes des choses lointaines et complexes. WalletLens fait exactement cela pour votre patrimoine — il rassemble chaque position éparpillée en une image unique et claire."],
      ['h2', "Pourquoi nous l'avons créé"],
      ['p', "La plupart des outils de suivi ne gèrent que les cryptos, imposent un abonnement, exigent l'accès à vos comptes de plateforme ou bancaires, ou envoient vos données financières vers un serveur tiers. Nous voulions autre chose : un outil qui respecte votre vie privée, fonctionne hors ligne et couvre toutes les classes d'actifs qui comptent pour un investisseur d'aujourd'hui."],
      ['p', "WalletLens repose sur un principe : **vos données financières vous appartiennent**. Tout ce que vous saisissez reste sur votre appareil, dans le localStorage du navigateur. Pas de base de données, pas de comptes utilisateurs, aucune analyse liée à votre portefeuille."],
      ['h2', 'À qui WalletLens s’adresse'],
      ['ul', [
        "**Aux investisseurs multi-actifs** qui détiennent à la fois des cryptos, des actions et des métaux précieux et en ont assez de jongler entre trois applications.",
        "**Aux personnes soucieuses de leur vie privée** qui ne veulent ni connecter leurs identifiants bancaires ni confier leurs positions à un serveur cloud.",
        "**À quiconque cherche un suivi de patrimoine gratuit** sans abonnement, sans essai et sans carte bancaire.",
        "**Aux investisseurs autonomes** qui veulent suivre leur prix de revient, leurs objectifs de gain et des plus-values lisibles, sans tableur.",
      ]],
      ['h2', 'Fonctionnalités clés'],
      ['ul', [
        "**Suivi multi-actifs** — cryptos (plus de 10 000 via CoinGecko), actions américaines (Stooq), or et argent (XAU/USD et XAG/USD en direct), devises et obligations.",
        "**Analyse de portefeuille** — une intelligence embarquée qui note la santé de votre portefeuille, lance des tests de résistance, évalue la qualité de vos entrées, planifie le rééquilibrage et affiche un indicateur Fear & Greed — le tout calculé à partir de vos propres données.",
        "**Plans de vente à objectifs multiples** — jusqu'à cinq objectifs de prix par actif, avec barres de progression et produit estimé, pour toujours savoir quand prendre vos bénéfices.",
        "**Suivi des baleines** — surveillez les grosses transactions Bitcoin depuis le mempool, les mouvements de marché, les anomalies de volume et les recherches tendance de CoinGecko.",
        "**Saisie d'opération intelligente** — une feuille inférieure avec recherche de crypto, remplissage automatique du cours, contreparties « acheté avec » et « vendu contre », et étiquetage par portefeuille.",
        "**Partagez vos gains** — générez une belle carte-image de portefeuille (1200 × 630) et partagez-la sur X, téléchargez-la ou copiez-la dans le presse-papiers.",
        "**Codes de sauvegarde** — exportez tout votre portefeuille sous forme de code WLZ compact et réimportez-le sur n'importe quel appareil en quelques secondes, sans cloud.",
        "**PWA** — installez WalletLens sur votre écran d'accueil sous iOS, Android ou sur ordinateur pour une expérience proche d'une application native.",
      ]],
      ['h2', 'Entièrement gratuit'],
      ['p', "WalletLens est gratuit et le restera. Aucune formule payante, aucune fonctionnalité premium derrière un paywall, aucune limite freemium. Aucune publicité, aucun suivi de ce que vous détenez, et rien vers quoi passer."],
      ['h2', 'La confidentialité par conception'],
      ['p', "Nous avons choisi délibérément une architecture locale d'abord. Votre portefeuille est votre information financière la plus sensible : en le gardant dans le localStorage de votre navigateur plutôt que sur un serveur, nous supprimons le risque de fuite de données, de piratage de compte ou d'accès non autorisé. En contrepartie, vos sauvegardes vous incombent — utilisez l'export WLZ régulièrement."],
      ['h2', 'Foire aux questions'],
      ['faq'],
      ['h2', 'Commencer'],
      ['p', "Prêt à voir tout votre patrimoine au même endroit ? [Ouvrir WalletLens gratuitement](/dashboard/) — aucun compte requis. Débutant en suivi de portefeuille ? Commencez par notre guide du [meilleur suivi de patrimoine gratuit](/blog/best-free-net-worth-tracker/), ou parcourez tous nos [guides d'investissement sur le blog](/blog/)."],
      ['h2', 'Open source'],
      ['p', "WalletLens est open source. Vous pouvez inspecter le code, signaler des problèmes ou contribuer sur [GitHub](https://github.com/tia8910/walletlens)."],
      ['h2', 'Contact'],
      ['p', "Un retour, un bug, une idée de fonctionnalité ? Écrivez-nous à [contact@walletlens.live](mailto:contact@walletlens.live) — nous lisons tout."],
    ],
  },

  es: {
    title: 'Acerca de WalletLens: el gestor de patrimonio gratuito y privado',
    meta: 'Sigue criptomonedas, acciones, oro, plata, efectivo y divisas en un solo panel: gratis, sin cuenta y con tus datos en tu dispositivo',
    blocks: [
      ['h2', '¿Qué es WalletLens?'],
      ['p', 'WalletLens es un **gestor de patrimonio gratuito** y una herramienta de cartera para todo tipo de activos que te permite seguir cada inversión que tienes —criptomonedas, acciones y ETF de EE. UU., oro, plata, divisas, efectivo y bonos— en un único panel unificado. Funciona por completo en tu navegador, sin cuenta, sin servidor y sin cuota de suscripción, así que ves **todo tu patrimonio en un solo sitio** en segundos.'],
      ['p', 'El nombre viene de la idea de una lente: un instrumento que enfoca con nitidez lo lejano y lo complejo. Eso es exactamente lo que WalletLens hace con tu patrimonio: reúne cada posición dispersa en una sola imagen clara.'],
      ['h2', 'Por qué lo creamos'],
      ['p', 'La mayoría de los gestores de cartera solo admiten cripto, exigen una suscripción de pago, piden acceso a tus cuentas de exchange o de banco, o envían tus datos financieros a un servidor de terceros. Queríamos algo distinto: una herramienta que respete tu privacidad, funcione sin conexión y cubra todas las clases de activos que le importan a un inversor de hoy.'],
      ['p', 'WalletLens se construyó sobre un principio: **tus datos financieros son tuyos**. Todo lo que introduces se queda en tu dispositivo, en el localStorage del navegador. No hay base de datos, ni cuentas de usuario, ni analíticas ligadas a tu cartera.'],
      ['h2', 'Para quién es WalletLens'],
      ['ul', [
        '**Inversores multiactivo** que tienen cripto, acciones y metales preciosos a la vez y están cansados de hacer malabares con tres aplicaciones.',
        '**Personas celosas de su privacidad** que no quieren conectar credenciales bancarias ni entregar sus posiciones a un servidor en la nube.',
        '**Cualquiera que quiera un gestor de patrimonio gratuito** sin suscripción, sin prueba y sin tarjeta.',
        '**Inversores por cuenta propia** que quieren seguimiento del coste de adquisición, objetivos de beneficio y unas pérdidas y ganancias claras, sin hojas de cálculo.',
      ]],
      ['h2', 'Funciones principales'],
      ['ul', [
        '**Seguimiento multiactivo**: cripto (más de 10.000 monedas vía CoinGecko), acciones de EE. UU. (Stooq), oro y plata (XAU/USD y XAG/USD en vivo), divisas y bonos.',
        '**Análisis de cartera**: inteligencia en el propio dispositivo que puntúa la salud de tu cartera, ejecuta pruebas de estrés, analiza la calidad de tus entradas, planifica el reequilibrio y muestra un indicador de miedo y codicia, todo calculado con tus propios datos.',
        '**Planes de venta con varios objetivos**: hasta cinco objetivos de precio por activo, con barras de progreso e ingresos previstos, para saber siempre cuándo recoger beneficios.',
        '**Rastreador de ballenas**: vigila las grandes transacciones de Bitcoin desde el mempool, los movimientos del mercado, las anomalías de volumen y las búsquedas en tendencia de CoinGecko.',
        '**Registro de operaciones inteligente**: un panel inferior con búsqueda de monedas, autocompletado del precio en vivo, contrapartidas de «comprado con» y «vendido por», y etiquetado por cartera.',
        '**Comparte tus ganancias**: genera una tarjeta-imagen elegante de tu cartera (1200 × 630) y compártela en X, descárgala o cópiala al portapapeles.',
        '**Códigos de copia de seguridad**: exporta toda tu cartera como un código WLZ compacto e impórtalo en cualquier dispositivo en segundos, sin nube.',
        '**PWA**: instala WalletLens en la pantalla de inicio en iOS, Android o escritorio para una experiencia parecida a una app nativa.',
      ]],
      ['h2', 'Completamente gratis'],
      ['p', 'WalletLens es gratuito y siempre lo será. No hay planes de pago, ni funciones premium tras un muro, ni límites freemium. No hay publicidad, no se rastrea lo que tienes y no hay nada a lo que mejorar.'],
      ['h2', 'Privacidad por diseño'],
      ['p', 'Elegimos deliberadamente una arquitectura local primero. Tu cartera es tu información financiera más sensible: al guardarla en el localStorage de tu navegador en lugar de en un servidor, eliminamos el riesgo de filtración de datos, robo de cuenta o acceso no autorizado. A cambio, las copias de seguridad son responsabilidad tuya: usa la exportación WLZ con regularidad.'],
      ['h2', 'Preguntas frecuentes'],
      ['faq'],
      ['h2', 'Empezar'],
      ['p', '¿Listo para ver todo tu patrimonio en un solo sitio? [Abre WalletLens gratis](/dashboard/), sin necesidad de cuenta. ¿Nuevo en el seguimiento de carteras? Empieza por nuestra guía del [mejor gestor de patrimonio gratuito](/blog/best-free-net-worth-tracker/) o explora todas nuestras [guías de inversión del blog](/blog/).'],
      ['h2', 'Código abierto'],
      ['p', 'WalletLens es de código abierto. Puedes revisar el código, informar de problemas o contribuir en [GitHub](https://github.com/tia8910/walletlens).'],
      ['h2', 'Contacto'],
      ['p', '¿Tienes comentarios, has encontrado un fallo o quieres sugerir una función? Escríbenos a [contact@walletlens.live](mailto:contact@walletlens.live): lo leemos todo.'],
    ],
  },
}

/**
 * One language's About content, falling back to English.
 *
 * The block list is compared against English by length: a translation that
 * lost or gained a block would render a page whose headings no longer line up
 * with its paragraphs, which is worse than showing English.
 */
export function aboutContent(lang) {
  const en = ABOUT_TEXT.en
  const doc = ABOUT_TEXT[lang] || en
  return {
    title: doc.title || en.title,
    meta: doc.meta || en.meta,
    blocks: doc.blocks?.length === en.blocks.length ? doc.blocks : en.blocks,
  }
}
