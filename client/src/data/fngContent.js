// The public /fear-and-greed-index/ page, in all four languages.
//
// Same block vocabulary as aboutContent.js — ['h2'|'p', text], ['ul', [item]],
// ['faq'] for the shared question list — plus the five sentiment zones, which
// are a table rather than prose.
//
// The zone *ranges* ("0 – 24") are not translated: they are numbers, and the
// Arabic page reads them left-to-right like every other figure in the app.

export const FNG_ZONE_KEYS = ['extremeFear', 'fear', 'neutral', 'greed', 'extremeGreed']

export const FNG_ZONE_RANGES = ['0 – 24', '25 – 49', '50', '51 – 74', '75 – 100']

export const FNG_ZONE_COLORS = ['#f87171', '#fb923c', '#94a3b8', '#10b981', '#f59e0b']

export const FNG_TEXT = {
  en: {
    title: 'Fear & Greed Index',
    meta: 'Live crypto market sentiment · Updated every 3 min',
    summary: 'A real-time 0–100 score measuring crypto market sentiment — from extreme fear to extreme greed — computed from breadth and momentum across the top coins.',
    loading: 'Loading live score…',
    unavailable: 'Score unavailable — check [Market Index](/market-index) for live data.',
    outOf: 'out of 100 · [Full market index →](/market-index)',
    zones: [
      ['Extreme Fear', 'Widespread panic selling. Historically a contrarian buying opportunity, but the bottom is never guaranteed.'],
      ['Fear', 'Caution dominates. Most coins are under pressure. Accumulators begin watching for entries.'],
      ['Neutral', 'Market is balanced — no clear directional edge. Watch for a break in either direction.'],
      ['Greed', 'Healthy broad participation. Most coins trending up. Momentum is real but discipline still matters.'],
      ['Extreme Greed', 'Broad euphoria. Historically a time for caution — peaks are often set in extreme greed.'],
    ],
    ctaTitle: 'Track your portfolio alongside the fear & greed index',
    ctaBody: 'WalletLens is 100% free, no account required, and all your data stays on your device.',
    ctaButton: 'Open WalletLens →',
    blocks: [
      ['h2', 'What the Score Means'],
      ['p', "The fear and greed index condenses the entire crypto market's mood into one number. Markets in extreme fear tend to be oversold — historically a signal that a recovery may be near, though not guaranteed. Markets in extreme greed tend to be overbought — past peaks have often coincided with readings above 75."],
      ['h2', 'The 5 Zones'],
      ['zones'],
      ['h2', 'How WalletLens Calculates It'],
      ['p', 'The WalletLens fear and greed score uses two pillars of pure market data — no surveys, no social media scrapers, no external APIs:'],
      ['ul', [
        '**Market breadth (60%)** — the percentage of the top 20 coins up over 24 hours. When most coins are green, breadth is high and the score rises.',
        '**Price momentum (40%)** — the average 24-hour move of the top 10 coins, normalised to 0–100. Strong positive moves push the score toward greed.',
      ]],
      ['p', 'The score updates every 3 minutes. You can see the full breakdown — including the pillar contributions, BTC dominance, and top movers — on the [WalletLens Market Index page](/market-index).'],
      ['h2', 'How to Use the Fear & Greed Index'],
      ['p', 'The index is most useful as a **context layer** on top of your portfolio decisions, not as a buy or sell signal by itself:'],
      ['ul', [
        'During **extreme fear**, review your allocation — are you under-exposed relative to your long-term target?',
        'During **extreme greed**, check your sell targets — are any assets approaching levels where you planned to take profit?',
        'In **neutral** conditions, the market gives fewer directional clues — focus on your DCA schedule and position sizes.',
      ]],
      ['p', 'Inside WalletLens, the Portfolio Analysis tab shows the live fear and greed reading overlaid against your own portfolio — so you can see how your current exposure compares to market sentiment in one view. [Open WalletLens free →](/)'],
      ['h2', 'Frequently Asked Questions'],
      ['faq'],
    ],
  },

  ar: {
    title: 'مؤشّر الخوف والطمع',
    meta: 'مزاج سوق العملات الرقمية مباشرةً · يتحدّث كل 3 دقائق',
    summary: 'درجة لحظية من 0 إلى 100 تقيس مزاج سوق العملات الرقمية — من الخوف الشديد إلى الطمع الشديد — محسوبةً من اتّساع السوق وزخم الأسعار عبر أكبر العملات.',
    loading: 'جارٍ تحميل الدرجة الحيّة…',
    unavailable: 'الدرجة غير متاحة — راجع [مؤشّر السوق](/market-index) للبيانات الحيّة.',
    outOf: 'من أصل 100 · [مؤشّر السوق الكامل ←](/market-index)',
    zones: [
      ['خوف شديد', 'بيع بدافع الذعر على نطاق واسع. تاريخياً فرصة شراء معاكسة للاتجاه، لكن القاع غير مضمون أبداً.'],
      ['خوف', 'الحذر هو السائد. معظم العملات تحت الضغط، والمجمّعون يبدأون بترقّب نقاط الدخول.'],
      ['محايد', 'السوق متوازن — بلا أفضلية اتجاهية واضحة. راقب الكسر في أي من الاتجاهين.'],
      ['طمع', 'مشاركة واسعة وصحّية. معظم العملات في اتجاه صاعد. الزخم حقيقي لكن الانضباط يبقى مهمّاً.'],
      ['طمع شديد', 'نشوة عامّة. تاريخياً وقت للحذر — فالقمم كثيراً ما تُصنع في الطمع الشديد.'],
    ],
    ctaTitle: 'تابع محفظتك جنباً إلى جنب مع مؤشّر الخوف والطمع',
    ctaBody: 'WalletLens مجاني بالكامل، بلا حاجة إلى حساب، وكل بياناتك تبقى على جهازك.',
    ctaButton: 'افتح WalletLens ←',
    blocks: [
      ['h2', 'ماذا تعني الدرجة'],
      ['p', 'يختصر مؤشّر الخوف والطمع مزاج سوق العملات الرقمية كلّه في رقم واحد. الأسواق في الخوف الشديد تميل إلى أن تكون مُفرطة البيع — وهي تاريخياً إشارة إلى قرب تعافٍ محتمل، وإن لم يكن مضموناً. والأسواق في الطمع الشديد تميل إلى أن تكون مُفرطة الشراء — وكثيراً ما تزامنت القمم السابقة مع قراءات فوق 75.'],
      ['h2', 'المناطق الخمس'],
      ['zones'],
      ['h2', 'كيف يحسبها WalletLens'],
      ['p', 'تعتمد درجة الخوف والطمع في WalletLens على ركيزتين من بيانات السوق الصرفة — بلا استطلاعات ولا كاشطات لوسائل التواصل ولا واجهات خارجية:'],
      ['ul', [
        '**اتّساع السوق (60%)** — نسبة أكبر 20 عملة مرتفعة خلال 24 ساعة. فحين تكون معظم العملات خضراء يرتفع الاتّساع وترتفع الدرجة معه.',
        '**زخم السعر (40%)** — متوسّط حركة أكبر 10 عملات خلال 24 ساعة، مُطبَّعاً على 0–100. والحركات الإيجابية القوية تدفع الدرجة نحو الطمع.',
      ]],
      ['p', 'تتحدّث الدرجة كل 3 دقائق. ويمكنك رؤية التفصيل الكامل — بما فيه مساهمة كل ركيزة، وهيمنة البيتكوين، وأبرز المتحرّكين — في [صفحة مؤشّر السوق من WalletLens](/market-index).'],
      ['h2', 'كيف تستخدم مؤشّر الخوف والطمع'],
      ['p', 'المؤشّر أنفع ما يكون بوصفه **طبقة سياق** فوق قراراتك بشأن محفظتك، لا إشارة شراء أو بيع بحدّ ذاته:'],
      ['ul', [
        'في **الخوف الشديد**، راجع توزيعك — هل تعرّضك أقلّ ممّا يقتضيه هدفك طويل الأجل؟',
        'في **الطمع الشديد**، راجع أهدافك البيعية — هل يقترب أي أصل من المستويات التي خطّطت لجني الربح عندها؟',
        'في الظروف **المحايدة**، يعطي السوق إشارات اتجاهية أقلّ — فركّز على جدول شرائك الدوري وأحجام مراكزك.',
      ]],
      ['p', 'داخل WalletLens، يعرض تبويب «تحليل المحفظة» قراءة الخوف والطمع الحيّة مقابل محفظتك أنت — لترى كيف يقارَن تعرّضك الحالي بمزاج السوق في عرض واحد. [افتح WalletLens مجاناً ←](/)'],
      ['h2', 'الأسئلة الشائعة'],
      ['faq'],
    ],
  },

  fr: {
    title: 'Indice de peur et d’avidité',
    meta: 'Sentiment du marché crypto en direct · Mis à jour toutes les 3 min',
    summary: "Une note de 0 à 100 en temps réel qui mesure le sentiment du marché crypto — de la peur extrême à l'avidité extrême — calculée à partir de l'ampleur du marché et du momentum des principales cryptos.",
    loading: 'Chargement de la note en direct…',
    unavailable: 'Note indisponible — consultez le [Market Index](/market-index) pour les données en direct.',
    outOf: 'sur 100 · [Indice de marché complet →](/market-index)',
    zones: [
      ['Peur extrême', "Vente panique généralisée. Historiquement une occasion d'achat à contre-courant, mais le point bas n'est jamais garanti."],
      ['Peur', "La prudence domine. La plupart des cryptos sont sous pression. Les accumulateurs commencent à guetter les points d'entrée."],
      ['Neutre', 'Le marché est équilibré — aucun avantage directionnel net. Guettez une sortie de range dans un sens ou dans l’autre.'],
      ['Avidité', 'Participation large et saine. La plupart des cryptos progressent. Le momentum est réel, mais la discipline reste de mise.'],
      ['Avidité extrême', "Euphorie généralisée. Historiquement un moment de prudence — les sommets se forment souvent dans l'avidité extrême."],
    ],
    ctaTitle: "Suivez votre portefeuille en parallèle de l'indice de peur et d'avidité",
    ctaBody: 'WalletLens est 100 % gratuit, sans compte, et toutes vos données restent sur votre appareil.',
    ctaButton: 'Ouvrir WalletLens →',
    blocks: [
      ['h2', 'Ce que la note signifie'],
      ['p', "L'indice de peur et d'avidité condense l'humeur de tout le marché crypto en un seul chiffre. Les marchés en peur extrême tendent à être survendus — historiquement le signe qu'une reprise peut approcher, sans garantie. Les marchés en avidité extrême tendent à être surachetés : les sommets passés ont souvent coïncidé avec des lectures supérieures à 75."],
      ['h2', 'Les 5 zones'],
      ['zones'],
      ['h2', 'Comment WalletLens la calcule'],
      ['p', "La note WalletLens repose sur deux piliers de données de marché pures — pas de sondages, pas de collecte sur les réseaux sociaux, aucune API externe :"],
      ['ul', [
        "**Ampleur du marché (60 %)** — la part des 20 premières cryptos en hausse sur 24 heures. Quand la majorité est dans le vert, l'ampleur est forte et la note monte.",
        '**Momentum des prix (40 %)** — la variation moyenne sur 24 heures des 10 premières cryptos, normalisée de 0 à 100. Des hausses marquées poussent la note vers l’avidité.',
      ]],
      ['p', "La note est mise à jour toutes les 3 minutes. Le détail complet — contribution de chaque pilier, dominance du BTC, plus fortes variations — se trouve sur la [page Market Index de WalletLens](/market-index)."],
      ['h2', "Comment utiliser l'indice"],
      ['p', "L'indice est surtout utile comme **couche de contexte** par-dessus vos décisions de portefeuille, et non comme un signal d'achat ou de vente en soi :"],
      ['ul', [
        "En **peur extrême**, réexaminez votre allocation : êtes-vous sous-exposé par rapport à votre objectif de long terme ?",
        "En **avidité extrême**, vérifiez vos objectifs de vente : certains actifs approchent-ils des niveaux où vous comptiez prendre vos bénéfices ?",
        "En conditions **neutres**, le marché donne moins d'indices directionnels — concentrez-vous sur votre calendrier de DCA et la taille de vos positions.",
      ]],
      ['p', "Dans WalletLens, l'onglet Analyse de portefeuille superpose la lecture en direct de la peur et de l'avidité à votre propre portefeuille — vous voyez d'un coup d'œil comment votre exposition se compare au sentiment du marché. [Ouvrir WalletLens gratuitement →](/)"],
      ['h2', 'Foire aux questions'],
      ['faq'],
    ],
  },

  es: {
    title: 'Índice de miedo y codicia',
    meta: 'Sentimiento del mercado cripto en vivo · Se actualiza cada 3 min',
    summary: 'Una puntuación de 0 a 100 en tiempo real que mide el sentimiento del mercado cripto —del miedo extremo a la codicia extrema— calculada a partir de la amplitud del mercado y el momentum de las principales monedas.',
    loading: 'Cargando la puntuación en vivo…',
    unavailable: 'Puntuación no disponible: consulta el [Market Index](/market-index) para ver datos en vivo.',
    outOf: 'sobre 100 · [Índice de mercado completo →](/market-index)',
    zones: [
      ['Miedo extremo', 'Ventas de pánico generalizadas. Históricamente una oportunidad de compra a contracorriente, pero el suelo nunca está garantizado.'],
      ['Miedo', 'Domina la cautela. La mayoría de las monedas están bajo presión y los acumuladores empiezan a buscar entradas.'],
      ['Neutral', 'El mercado está equilibrado, sin una ventaja direccional clara. Atento a una ruptura en cualquier dirección.'],
      ['Codicia', 'Participación amplia y sana. La mayoría de las monedas suben. El momentum es real, pero la disciplina sigue importando.'],
      ['Codicia extrema', 'Euforia generalizada. Históricamente un momento para la cautela: los techos suelen formarse en codicia extrema.'],
    ],
    ctaTitle: 'Sigue tu cartera junto al índice de miedo y codicia',
    ctaBody: 'WalletLens es 100 % gratuito, no requiere cuenta y todos tus datos se quedan en tu dispositivo.',
    ctaButton: 'Abrir WalletLens →',
    blocks: [
      ['h2', 'Qué significa la puntuación'],
      ['p', 'El índice de miedo y codicia condensa el ánimo de todo el mercado cripto en una sola cifra. Los mercados en miedo extremo tienden a estar sobrevendidos: históricamente, una señal de que la recuperación puede estar cerca, aunque no garantizada. Los mercados en codicia extrema tienden a estar sobrecomprados; los techos pasados han coincidido a menudo con lecturas por encima de 75.'],
      ['h2', 'Las 5 zonas'],
      ['zones'],
      ['h2', 'Cómo la calcula WalletLens'],
      ['p', 'La puntuación de WalletLens se apoya en dos pilares de datos de mercado puros: sin encuestas, sin rastreo de redes sociales y sin API externas:'],
      ['ul', [
        '**Amplitud del mercado (60 %)**: el porcentaje de las 20 principales monedas que suben en 24 horas. Cuando la mayoría está en verde, la amplitud es alta y la puntuación sube.',
        '**Momentum del precio (40 %)**: la variación media a 24 horas de las 10 primeras monedas, normalizada de 0 a 100. Las subidas fuertes empujan la puntuación hacia la codicia.',
      ]],
      ['p', 'La puntuación se actualiza cada 3 minutos. Puedes ver el desglose completo —la aportación de cada pilar, el dominio de BTC y los mayores movimientos— en la [página Market Index de WalletLens](/market-index).'],
      ['h2', 'Cómo usar el índice'],
      ['p', 'El índice resulta más útil como **capa de contexto** sobre tus decisiones de cartera, y no como una señal de compra o venta por sí mismo:'],
      ['ul', [
        'En **miedo extremo**, revisa tu asignación: ¿estás infraexpuesto respecto a tu objetivo a largo plazo?',
        'En **codicia extrema**, revisa tus objetivos de venta: ¿hay activos acercándose a los niveles donde pensabas recoger beneficios?',
        'En condiciones **neutrales**, el mercado da menos pistas direccionales: céntrate en tu calendario de DCA y en el tamaño de tus posiciones.',
      ]],
      ['p', 'Dentro de WalletLens, la pestaña de Análisis de cartera superpone la lectura en vivo de miedo y codicia sobre tu propia cartera, para que veas de un vistazo cómo se compara tu exposición con el sentimiento del mercado. [Abre WalletLens gratis →](/)'],
      ['h2', 'Preguntas frecuentes'],
      ['faq'],
    ],
  },
}

/** One language's page content, falling back to English on any shape drift. */
export function fngContent(lang) {
  const en = FNG_TEXT.en
  const doc = FNG_TEXT[lang] || en
  return {
    ...en,
    ...doc,
    zones: doc.zones?.length === en.zones.length ? doc.zones : en.zones,
    blocks: doc.blocks?.length === en.blocks.length ? doc.blocks : en.blocks,
  }
}
