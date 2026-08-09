// Academy content, per language.
//
// This does not live in i18n.js because it is not UI labels — it is a body of
// teaching material where order, pairing and structure carry meaning. A badge
// is a title plus the condition that earns it; a hack is a category, a headline
// and a paragraph; a question is a stem, four options, the index of the right
// one, and an explanation. Flattening that into eight hundred sibling keys
// would make a mismatched pair impossible to see and easy to introduce. Same
// reasoning as src/legal/*.
//
// Shape rules, enforced by academyContent.test.js:
//   - every language defines every id
//   - a question's `a` index and `cat` come from the English entry, so a
//     translator cannot move the correct answer or invent a category
//   - option counts match English, or the answer index would point at the
//     wrong string
//
// ACHIEVEMENT ids, HACK order and question categories are referenced by
// Academy.jsx's unlock logic. Changing an id changes who has earned what.

// ── Badges ─────────────────────────────────────────────────────────────────
export const ACHIEVEMENT_TEXT = {
  en: {
    first_lesson:    ['First Lesson',       'Complete your first daily challenge'],
    streak_3:        ['3-Day Streak',       'Complete challenges 3 days in a row'],
    streak_7:        ['Week Warrior',       'Complete challenges 7 days in a row'],
    streak_30:       ['Diamond Habit',      '30-day challenge streak'],
    perfect_score:   ['Sharpshooter',       'Answer correctly on first try'],
    fast_answer:     ['Lightning Brain',    'Answer correctly in under 3 seconds'],
    all_categories:  ['Well Rounded',       'Answer questions from 5 different categories'],
    security_expert: ['Security Expert',    'Answer 5 Security questions correctly'],
    defi_master:     ['DeFi Master',        'Answer 3 DeFi questions correctly'],
    risk_aware:      ['Risk Aware',         'Answer 5 Risk questions correctly'],
    crypto_scholar:  ['Crypto Scholar',     'Answer 10 Crypto questions correctly'],
    psychologist:    ['Market Psychologist','Answer 3 Psychology questions correctly'],
    iq_500:          ['Analyst',            'Reach 500 Investor IQ'],
    iq_1000:         ['Strategist',         'Reach 1,000 Investor IQ'],
    iq_2000:         ['Whale',              'Reach 2,000 Investor IQ'],
    iq_5000:         ['Legend',             'Reach 5,000 Investor IQ'],
  },
  ar: {
    first_lesson:    ['الدرس الأول',        'أكمل أول تحدٍّ يومي لك'],
    streak_3:        ['سلسلة 3 أيام',       'أكمل التحديات 3 أيام متتالية'],
    streak_7:        ['محارب الأسبوع',      'أكمل التحديات 7 أيام متتالية'],
    streak_30:       ['عادة ماسية',         'سلسلة تحديات لمدة 30 يوماً'],
    perfect_score:   ['قنّاص',              'أجب إجابة صحيحة من المحاولة الأولى'],
    fast_answer:     ['عقل البرق',          'أجب إجابة صحيحة في أقل من 3 ثوانٍ'],
    all_categories:  ['واسع الاطّلاع',      'أجب عن أسئلة من 5 فئات مختلفة'],
    security_expert: ['خبير أمان',          'أجب عن 5 أسئلة أمان إجابة صحيحة'],
    defi_master:     ['سيّد التمويل اللامركزي', 'أجب عن 3 أسئلة في التمويل اللامركزي إجابة صحيحة'],
    risk_aware:      ['واعٍ بالمخاطر',      'أجب عن 5 أسئلة مخاطر إجابة صحيحة'],
    crypto_scholar:  ['عالِم العملات الرقمية', 'أجب عن 10 أسئلة في العملات الرقمية إجابة صحيحة'],
    psychologist:    ['طبيب نفس الأسواق',   'أجب عن 3 أسئلة في علم النفس إجابة صحيحة'],
    iq_500:          ['محلّل',              'اِبلغ 500 نقطة ذكاء استثماري'],
    iq_1000:         ['استراتيجي',          'اِبلغ 1,000 نقطة ذكاء استثماري'],
    iq_2000:         ['حوت',                'اِبلغ 2,000 نقطة ذكاء استثماري'],
    iq_5000:         ['أسطورة',             'اِبلغ 5,000 نقطة ذكاء استثماري'],
  },
  fr: {
    first_lesson:    ['Première leçon',     'Terminez votre premier défi quotidien'],
    streak_3:        ['Série de 3 jours',   'Réussissez les défis 3 jours d’affilée'],
    streak_7:        ['Guerrier de la semaine', 'Réussissez les défis 7 jours d’affilée'],
    streak_30:       ['Habitude de diamant','Série de défis de 30 jours'],
    perfect_score:   ['Tireur d’élite',     'Répondez juste du premier coup'],
    fast_answer:     ['Cerveau éclair',     'Répondez juste en moins de 3 secondes'],
    all_categories:  ['Touche-à-tout',      'Répondez à des questions de 5 catégories différentes'],
    security_expert: ['Expert en sécurité', 'Répondez juste à 5 questions de sécurité'],
    defi_master:     ['Maître de la DeFi',  'Répondez juste à 3 questions sur la DeFi'],
    risk_aware:      ['Conscient du risque','Répondez juste à 5 questions sur le risque'],
    crypto_scholar:  ['Érudit de la crypto','Répondez juste à 10 questions sur la crypto'],
    psychologist:    ['Psychologue des marchés', 'Répondez juste à 3 questions de psychologie'],
    iq_500:          ['Analyste',           'Atteignez 500 de QI investisseur'],
    iq_1000:         ['Stratège',           'Atteignez 1 000 de QI investisseur'],
    iq_2000:         ['Baleine',            'Atteignez 2 000 de QI investisseur'],
    iq_5000:         ['Légende',            'Atteignez 5 000 de QI investisseur'],
  },
  es: {
    first_lesson:    ['Primera lección',    'Completa tu primer reto diario'],
    streak_3:        ['Racha de 3 días',    'Completa los retos 3 días seguidos'],
    streak_7:        ['Guerrero de la semana', 'Completa los retos 7 días seguidos'],
    streak_30:       ['Hábito de diamante', 'Racha de retos de 30 días'],
    perfect_score:   ['Tirador certero',    'Acierta a la primera'],
    fast_answer:     ['Cerebro relámpago',  'Acierta en menos de 3 segundos'],
    all_categories:  ['Muy completo',       'Responde preguntas de 5 categorías distintas'],
    security_expert: ['Experto en seguridad','Acierta 5 preguntas de seguridad'],
    defi_master:     ['Maestro de la DeFi', 'Acierta 3 preguntas sobre DeFi'],
    risk_aware:      ['Consciente del riesgo','Acierta 5 preguntas sobre riesgo'],
    crypto_scholar:  ['Erudito cripto',     'Acierta 10 preguntas sobre cripto'],
    psychologist:    ['Psicólogo de mercados','Acierta 3 preguntas de psicología'],
    iq_500:          ['Analista',           'Alcanza 500 de CI del inversor'],
    iq_1000:         ['Estratega',          'Alcanza 1.000 de CI del inversor'],
    iq_2000:         ['Ballena',            'Alcanza 2.000 de CI del inversor'],
    iq_5000:         ['Leyenda',            'Alcanza 5.000 de CI del inversor'],
  },
}

// ── Investment hacks ───────────────────────────────────────────────────────
// Order matters: Academy.jsx indexes HACK_META by position for the icon and
// category colour, and the share card is generated from the same index.
export const HACK_TEXT = {
  en: [
    ['Buy in thirds, not all at once', 'Split your planned buy into 3 equal parts. Enter 1/3 now, 1/3 on a 10% dip, 1/3 on a 20% dip. You will never perfectly time the market — but you can average into a better price every time.'],
    ['Set your stop-loss before you buy', 'Decide the maximum you are willing to lose BEFORE you enter a position. Write it down. When price hits that level, sell — no second-guessing. Emotional stops are no stops at all.'],
    ['DCA beats lump-sum for volatile assets', 'Invest a fixed amount every week or month regardless of price. Over time, you buy more when prices are low and less when they are high — automatically reducing your average cost.'],
    ['The 5% rule for new positions', 'Never put more than 5% of your portfolio into a single new, unproven position. If it does a 10x, you still win big. If it goes to zero, your portfolio survives. Let winners earn larger allocations.'],
    ['Take profit on the way up, not at the top', 'Sell 25% of a position when it doubles. Sell another 25% when it triples. You can never sell at the exact top — but taking profits on the way up guarantees you lock in real gains.'],
    ['Never check prices more than twice a day', 'Frequent price checking triggers emotional decisions. Set price alerts for key levels and check manually only at pre-set times. Boredom is your worst trading advisor.'],
    ['Rebalance quarterly, not reactively', 'Set a calendar reminder every 3 months to bring your portfolio back to target weights. Selling winners and buying laggards forces discipline — you sell high and buy low automatically.'],
    ['Keep 10-20% in stablecoins at all times', 'A permanent stablecoin reserve means you can always buy a crash. It also gives psychological comfort — you can watch a crash calmly knowing you have dry powder to deploy.'],
    ['The 48-hour rule for panic sells', 'When you desperately want to sell during a crash, wait 48 hours. If you still want to sell after thinking it through calmly, then sell. Most panic impulses dissolve within 24 hours.'],
    ['Check on-chain data before trusting charts', 'Price can be manipulated. On-chain metrics (active addresses, transaction volume, exchange outflows) tell you what users are actually doing — not what traders want you to believe.'],
    ['Concentration is a feature, not a bug', 'Most wealth is made in 1-3 high-conviction bets, not 30 diversified ones. Have 3-5 core positions making up 70% of your portfolio. Diversification prevents loss; concentration creates wealth.'],
    ['Volume confirms breakouts', 'A price breakout on low volume is likely fake. Wait for a breakout accompanied by volume 2× the average. That confirms real buying interest, not just a momentary squeeze.'],
    ['Track your cost basis religiously', 'Always know exactly what you paid for each position. Without this, you cannot calculate real P&L, make rational sell decisions, or file accurate taxes. Use WalletLens to track every trade.'],
    ['Avoid leverage until you are profitable without it', 'Leverage amplifies gains AND losses. If you cannot make money in spot markets consistently, leverage will just speed up your losses. Master the basics first.'],
    ['Your conviction determines your position size', 'Size positions by how thoroughly you have researched them. High conviction = larger position. Heard-it-on-Twitter = 1% max. Conviction is earned through research, not hope.'],
    ['The market rewards patience, not activity', 'Most profitable crypto investors make fewer than 20 trades per year. Every trade has friction (fees, tax events, emotional cost). Inactivity is often the highest-conviction trade.'],
    ['Follow the smart money, not the narrative', 'Watch where institutions and large wallets are accumulating. CoinGecko Whale Alerts, on-chain trackers, and dark pool data reveal where real money flows — often weeks before price reacts.'],
    ['Fear and Greed Index as a contrarian signal', 'Extreme Fear (0-25) is historically the best time to accumulate. Extreme Greed (75-100) is when smart money quietly exits. Be greedy when others are fearful — Buffett\'s rule applies to crypto.'],
  ],
  ar: [
    ['اشترِ على ثلاث دفعات، لا دفعة واحدة', 'قسّم عملية الشراء المخطّطة إلى 3 أجزاء متساوية. ادخل بالثلث الآن، والثلث عند انخفاض 10%، والثلث عند انخفاض 20%. لن توقّت السوق بدقّة أبداً — لكن يمكنك تحسين متوسط سعرك في كل مرة.'],
    ['حدّد وقف الخسارة قبل الشراء', 'قرّر أقصى ما أنت مستعد لخسارته قبل دخول المركز. اكتبه. وحين يبلغ السعر ذلك المستوى، بِع دون تردّد. وقف الخسارة العاطفي ليس وقف خسارة أصلاً.'],
    ['الشراء الدوري يتفوّق على الدفعة الواحدة في الأصول المتقلّبة', 'استثمر مبلغاً ثابتاً كل أسبوع أو شهر بغضّ النظر عن السعر. مع الوقت تشتري كمية أكبر عند انخفاض الأسعار وأقل عند ارتفاعها — فينخفض متوسط تكلفتك تلقائياً.'],
    ['قاعدة الـ 5% للمراكز الجديدة', 'لا تضع أكثر من 5% من محفظتك في مركز جديد غير مُجرَّب. إن تضاعف عشر مرات فستربح كثيراً، وإن هبط إلى الصفر فستنجو محفظتك. دع الرابحين يكسبون حصصاً أكبر.'],
    ['اجنِ الأرباح في طريق الصعود، لا عند القمة', 'بِع 25% من المركز عند تضاعفه، و25% أخرى عند تضاعفه ثلاث مرات. لن تبيع عند القمة تماماً أبداً — لكن جني الأرباح تدريجياً يضمن لك مكاسب حقيقية.'],
    ['لا تتفقّد الأسعار أكثر من مرتين يومياً', 'تفقّد الأسعار المتكرّر يستدعي قرارات عاطفية. اضبط تنبيهات عند المستويات المهمّة وتفقّد يدوياً في أوقات محدّدة فقط. الملل أسوأ مستشار تداول لديك.'],
    ['أعد التوازن كل ربع سنة، لا كردّ فعل', 'اضبط تذكيراً كل 3 أشهر لإعادة محفظتك إلى أوزانها المستهدفة. بيع الرابحين وشراء المتأخّرين يفرض الانضباط — فتبيع عالياً وتشتري منخفضاً تلقائياً.'],
    ['احتفظ بـ 10–20% في العملات المستقرة دائماً', 'الاحتياطي الدائم من العملات المستقرة يعني أنك تستطيع الشراء عند أي انهيار. ويمنحك راحة نفسية أيضاً — تراقب الانهيار بهدوء وأنت تعلم أن لديك سيولة جاهزة.'],
    ['قاعدة الـ 48 ساعة للبيع بدافع الذعر', 'حين ترغب بشدّة في البيع أثناء انهيار، انتظر 48 ساعة. إن بقيت راغباً في البيع بعد تفكير هادئ، فبِع. معظم نوبات الذعر تتلاشى خلال 24 ساعة.'],
    ['راجع بيانات السلسلة قبل أن تثق بالرسوم البيانية', 'يمكن التلاعب بالسعر. مقاييس السلسلة (العناوين النشطة، حجم المعاملات، التدفّقات الخارجة من المنصّات) تخبرك بما يفعله المستخدمون فعلاً، لا بما يريد المتداولون أن تصدّقه.'],
    ['التركيز ميزة لا عيب', 'معظم الثروات تُصنع من 1–3 رهانات عالية القناعة، لا من 30 رهاناً موزّعاً. اجعل 3–5 مراكز أساسية تشكّل 70% من محفظتك. التنويع يمنع الخسارة؛ والتركيز يصنع الثروة.'],
    ['حجم التداول يؤكّد الاختراقات', 'الاختراق السعري بحجم تداول منخفض غالباً زائف. انتظر اختراقاً مصحوباً بحجم يعادل ضعف المتوسط. ذلك يؤكّد اهتماماً شرائياً حقيقياً لا مجرّد ضغط لحظي.'],
    ['تتبّع تكلفتك الأساسية بدقّة', 'اعرف دائماً بالضبط ما دفعته في كل مركز. بدون ذلك لا يمكنك حساب أرباحك وخسائرك الحقيقية، ولا اتخاذ قرارات بيع رشيدة، ولا تقديم إقرار ضريبي دقيق. استخدم WalletLens لتتبّع كل صفقة.'],
    ['تجنّب الرافعة المالية حتى تربح بدونها', 'الرافعة تضخّم المكاسب والخسائر معاً. إن كنت لا تربح باستمرار في السوق الفوري، فالرافعة ستسرّع خسائرك فحسب. أتقِن الأساسيات أولاً.'],
    ['قناعتك تحدّد حجم مركزك', 'حدّد حجم المركز بقدر ما بحثت فيه. قناعة عالية تعني مركزاً أكبر، وما سمعته على تويتر يعني 1% كحدّ أقصى. القناعة تُكتسب بالبحث لا بالأمل.'],
    ['السوق يكافئ الصبر لا كثرة الحركة', 'معظم المستثمرين الرابحين في العملات الرقمية ينفّذون أقل من 20 صفقة سنوياً. لكل صفقة كلفة (رسوم، وأحداث ضريبية، وكلفة نفسية). عدم التحرّك غالباً أعلى الصفقات قناعة.'],
    ['اتبع الأموال الذكية لا الروايات', 'راقب أين تجمّع المؤسسات والمحافظ الكبيرة. تنبيهات الحيتان ومتتبّعات السلسلة وبيانات المجمّعات المظلمة تكشف أين تتدفّق الأموال الحقيقية — غالباً قبل أسابيع من تفاعل السعر.'],
    ['مؤشر الخوف والطمع كإشارة معاكسة', 'الخوف الشديد (0–25) هو تاريخياً أفضل وقت للتجميع. والطمع الشديد (75–100) هو حين تخرج الأموال الذكية بهدوء. كن طامعاً حين يخاف الآخرون — قاعدة بافيت تنطبق على العملات الرقمية أيضاً.'],
  ],
  fr: [
    ['Achetez en trois fois, pas d’un coup', 'Divisez votre achat prévu en 3 parts égales. Un tiers maintenant, un tiers à −10 %, un tiers à −20 %. Vous ne timerez jamais parfaitement le marché — mais vous améliorez votre prix moyen à chaque fois.'],
    ['Placez votre stop-loss avant d’acheter', 'Décidez du maximum que vous acceptez de perdre AVANT d’entrer. Écrivez-le. Quand le prix atteint ce niveau, vendez, sans discuter. Un stop émotionnel n’est pas un stop.'],
    ['L’investissement programmé bat l’achat unique sur les actifs volatils', 'Investissez un montant fixe chaque semaine ou chaque mois, quel que soit le prix. Avec le temps, vous achetez plus quand c’est bas et moins quand c’est haut — votre prix de revient baisse tout seul.'],
    ['La règle des 5 % pour une nouvelle position', 'Ne mettez jamais plus de 5 % du portefeuille dans une position neuve et non éprouvée. Si elle fait ×10, vous gagnez gros. Si elle tombe à zéro, le portefeuille survit. Laissez les gagnants mériter une plus grosse part.'],
    ['Prenez vos profits à la montée, pas au sommet', 'Vendez 25 % quand la position double. 25 % de plus quand elle triple. Vous ne vendrez jamais pile au sommet — mais prendre des profits en chemin garantit des gains réels.'],
    ['Ne regardez pas les prix plus de deux fois par jour', 'Consulter les prix sans arrêt déclenche des décisions émotionnelles. Placez des alertes sur les niveaux clés et ne regardez qu’à des moments choisis. L’ennui est votre pire conseiller.'],
    ['Rééquilibrez chaque trimestre, pas par réflexe', 'Mettez un rappel tous les 3 mois pour ramener le portefeuille à ses pondérations cibles. Vendre les gagnants et acheter les retardataires impose la discipline — vous vendez haut et achetez bas automatiquement.'],
    ['Gardez 10 à 20 % en stablecoins en permanence', 'Une réserve permanente de stablecoins vous permet d’acheter n’importe quel krach. Elle apporte aussi un confort psychologique : vous regardez la chute calmement, avec des munitions.'],
    ['La règle des 48 heures contre la vente panique', 'Quand vous voulez désespérément vendre pendant un krach, attendez 48 heures. Si l’envie persiste après réflexion, vendez. La plupart des impulsions de panique disparaissent en 24 heures.'],
    ['Vérifiez les données on-chain avant de croire les graphiques', 'Le prix peut être manipulé. Les métriques on-chain (adresses actives, volume de transactions, sorties d’échanges) disent ce que font vraiment les utilisateurs, pas ce que les traders veulent vous faire croire.'],
    ['La concentration est une fonctionnalité, pas un défaut', 'La fortune se fait sur 1 à 3 paris de forte conviction, pas sur 30 lignes diversifiées. Ayez 3 à 5 positions cœur pesant 70 % du portefeuille. La diversification évite la perte ; la concentration crée la richesse.'],
    ['Le volume confirme les cassures', 'Une cassure sur faible volume est probablement fausse. Attendez une cassure accompagnée d’un volume double de la moyenne. C’est le signe d’un vrai intérêt acheteur, pas d’un simple à-coup.'],
    ['Suivez votre prix de revient avec rigueur', 'Sachez toujours exactement ce que vous avez payé pour chaque position. Sans cela, pas de P&L réel, pas de décision de vente rationnelle, pas de déclaration fiscale exacte. Utilisez WalletLens pour tracer chaque opération.'],
    ['Pas de levier tant que vous n’êtes pas rentable sans lui', 'Le levier amplifie les gains ET les pertes. Si vous ne gagnez pas régulièrement au comptant, le levier ne fera qu’accélérer vos pertes. Maîtrisez d’abord les bases.'],
    ['Votre conviction fixe la taille de votre position', 'Dimensionnez selon la profondeur de vos recherches. Forte conviction = position plus grande. Entendu sur Twitter = 1 % maximum. La conviction se gagne par la recherche, pas par l’espoir.'],
    ['Le marché récompense la patience, pas l’activité', 'La plupart des investisseurs crypto rentables font moins de 20 opérations par an. Chaque opération a un coût : frais, événement fiscal, charge émotionnelle. Ne rien faire est souvent la position la plus convaincue.'],
    ['Suivez le smart money, pas le récit', 'Regardez où les institutions et les gros portefeuilles accumulent. Alertes baleines, trackers on-chain et données de dark pools révèlent où va l’argent réel — souvent des semaines avant le prix.'],
    ['L’indice Fear & Greed comme signal à contre-courant', 'La peur extrême (0-25) est historiquement le meilleur moment pour accumuler. La cupidité extrême (75-100) est le moment où le smart money sort discrètement. Soyez avide quand les autres ont peur — la règle de Buffett vaut aussi en crypto.'],
  ],
  es: [
    ['Compra en tres partes, no de golpe', 'Divide la compra prevista en 3 partes iguales. Un tercio ahora, un tercio en una caída del 10 % y un tercio en una del 20 %. Nunca acertarás el momento exacto, pero mejorarás tu precio medio cada vez.'],
    ['Pon el stop-loss antes de comprar', 'Decide cuánto estás dispuesto a perder ANTES de entrar. Escríbelo. Cuando el precio llegue a ese nivel, vende, sin darle vueltas. Un stop emocional no es un stop.'],
    ['Las aportaciones periódicas ganan a la compra única en activos volátiles', 'Invierte una cantidad fija cada semana o cada mes, sea cual sea el precio. Con el tiempo compras más cuando está barato y menos cuando está caro: tu coste medio baja solo.'],
    ['La regla del 5 % para posiciones nuevas', 'Nunca pongas más del 5 % de la cartera en una posición nueva y no probada. Si hace ×10, ganas mucho. Si va a cero, la cartera sobrevive. Deja que las ganadoras se ganen más peso.'],
    ['Recoge beneficios en la subida, no en el techo', 'Vende un 25 % cuando la posición se duplique. Otro 25 % cuando se triplique. Nunca venderás justo en el máximo, pero recoger beneficios por el camino asegura ganancias reales.'],
    ['No mires los precios más de dos veces al día', 'Mirar los precios constantemente provoca decisiones emocionales. Pon alertas en los niveles clave y consulta solo en momentos fijados. El aburrimiento es tu peor asesor.'],
    ['Reequilibra cada trimestre, no por impulso', 'Pon un recordatorio cada 3 meses para devolver la cartera a sus pesos objetivo. Vender ganadoras y comprar rezagadas impone disciplina: vendes caro y compras barato de forma automática.'],
    ['Ten siempre un 10-20 % en stablecoins', 'Una reserva permanente en stablecoins te permite comprar cualquier desplome. Y da tranquilidad: puedes ver la caída con calma sabiendo que tienes munición.'],
    ['La regla de las 48 horas contra la venta por pánico', 'Cuando te mueras por vender durante un desplome, espera 48 horas. Si después de pensarlo con calma sigues queriendo vender, vende. La mayoría de los impulsos de pánico se disuelven en 24 horas.'],
    ['Mira los datos on-chain antes de fiarte de los gráficos', 'El precio se puede manipular. Las métricas on-chain (direcciones activas, volumen de transacciones, salidas de exchanges) dicen lo que los usuarios hacen de verdad, no lo que los traders quieren que creas.'],
    ['La concentración es una virtud, no un defecto', 'La riqueza se hace con 1-3 apuestas de alta convicción, no con 30 diversificadas. Ten de 3 a 5 posiciones núcleo que sumen el 70 % de la cartera. La diversificación evita pérdidas; la concentración crea riqueza.'],
    ['El volumen confirma las rupturas', 'Una ruptura con volumen bajo suele ser falsa. Espera una acompañada de un volumen del doble de la media. Eso confirma interés comprador real, no un apretón momentáneo.'],
    ['Registra tu coste de adquisición con rigor', 'Ten siempre claro exactamente qué pagaste por cada posición. Sin eso no puedes calcular el P&L real, ni decidir ventas con cabeza, ni declarar impuestos correctamente. Usa WalletLens para registrar cada operación.'],
    ['Evita el apalancamiento hasta ser rentable sin él', 'El apalancamiento amplifica las ganancias Y las pérdidas. Si no ganas dinero de forma constante al contado, el apalancamiento solo acelerará tus pérdidas. Domina primero lo básico.'],
    ['Tu convicción determina el tamaño de la posición', 'Dimensiona según lo a fondo que hayas investigado. Alta convicción = posición mayor. Lo oí en Twitter = 1 % como mucho. La convicción se gana investigando, no esperando.'],
    ['El mercado premia la paciencia, no la actividad', 'La mayoría de los inversores cripto rentables hacen menos de 20 operaciones al año. Cada operación tiene fricción: comisiones, impacto fiscal y coste emocional. No hacer nada suele ser la operación de mayor convicción.'],
    ['Sigue al dinero inteligente, no al relato', 'Fíjate en dónde acumulan las instituciones y las grandes carteras. Las alertas de ballenas, los rastreadores on-chain y los datos de dark pools revelan a dónde va el dinero de verdad, a menudo semanas antes de que reaccione el precio.'],
    ['El índice de miedo y codicia como señal contraria', 'El miedo extremo (0-25) es históricamente el mejor momento para acumular. La codicia extrema (75-100) es cuando el dinero inteligente sale discretamente. Sé codicioso cuando los demás tienen miedo: la regla de Buffett también vale en cripto.'],
  ],
}

// Icon, category key and share colour for each hack, by position. Kept apart
// from the text so a translator never touches a category id the colour map
// and the analytics events are keyed on.
export const HACK_META = [
  { icon: '🎯', cat: 'Entry',      catKey: 'ayCatEntry' },
  { icon: '🔒', cat: 'Risk',       catKey: 'ayCatRisk' },
  { icon: '🌊', cat: 'Strategy',   catKey: 'ayCatStrategy' },
  { icon: '📊', cat: 'Portfolio',  catKey: 'ayCatPortfolio' },
  { icon: '💰', cat: 'Profit',     catKey: 'ayCatProfit' },
  { icon: '🧠', cat: 'Psychology', catKey: 'ayCatPsychology' },
  { icon: '🔄', cat: 'Strategy',   catKey: 'ayCatStrategy' },
  { icon: '🛡️', cat: 'Risk',       catKey: 'ayCatRisk' },
  { icon: '📉', cat: 'Psychology', catKey: 'ayCatPsychology' },
  { icon: '🔍', cat: 'Research',   catKey: 'ayCatResearch' },
  { icon: '⚖️', cat: 'Portfolio',  catKey: 'ayCatPortfolio' },
  { icon: '🕐', cat: 'Entry',      catKey: 'ayCatEntry' },
  { icon: '📅', cat: 'Strategy',   catKey: 'ayCatStrategy' },
  { icon: '🚫', cat: 'Risk',       catKey: 'ayCatRisk' },
  { icon: '💎', cat: 'Psychology', catKey: 'ayCatPsychology' },
  { icon: '📈', cat: 'Strategy',   catKey: 'ayCatStrategy' },
  { icon: '🌍', cat: 'Research',   catKey: 'ayCatResearch' },
  { icon: '⚡', cat: 'Entry',      catKey: 'ayCatEntry' },
]

const pick = (table, lang) => table[lang] || table.en

/** Badge text for one language: { id: { title, desc } }. */
export function achievementText(lang) {
  const src = pick(ACHIEVEMENT_TEXT, lang)
  const out = {}
  for (const [id, [title, desc]] of Object.entries(src)) out[id] = { title, desc }
  return out
}

/** Hacks for one language, in display order, with their icon and category. */
export function hacks(lang) {
  const text = pick(HACK_TEXT, lang)
  return HACK_META.map((meta, i) => ({
    ...meta,
    title: text[i]?.[0] ?? HACK_TEXT.en[i][0],
    body: text[i]?.[1] ?? HACK_TEXT.en[i][1],
  }))
}

// ── Question bank ──────────────────────────────────────────────────────────
// The stem, its four options and the explanation, per language. The correct
// index and the category are NOT here: they live in QUESTION_META below, so a
// translator reordering options — or a careless paste — cannot move the right
// answer or invent a category the badge logic does not know.
export const QUESTION_TEXT = {
  en: [
    ['What does "HODL" mean in crypto?', ['Hold On for Dear Life', 'High Order Digital Ledger', 'Hash On Distributed Layer', 'Hedge On Digital Limit'], 'HODL originated from a misspelled "hold" post in 2013. It means keeping assets long-term through volatility.'],
    ['What is a blockchain?', ['A type of crypto wallet', 'A chain of encrypted data blocks shared across a network', 'A trading platform', 'A type of mining hardware'], 'A blockchain is a distributed ledger where data is stored in blocks chained together cryptographically — making it tamper-resistant.'],
    ['What is a "gas fee" in Ethereum?', ['A fee for converting ETH to USD', 'Energy cost of mining', 'A fee paid to validators for processing transactions', 'A tax on DeFi profits'], 'Gas fees compensate validators for the computational work of processing and confirming transactions on Ethereum.'],
    ['What does "DeFi" stand for?', ['Digital Finance', 'Decentralized Finance', 'Distributed Fiat', 'Direct Finance'], 'DeFi (Decentralized Finance) refers to financial services built on blockchain without traditional intermediaries like banks.'],
    ['What is a "seed phrase"?', ['A password for an exchange', 'A 12-24 word phrase that recovers your wallet', 'A type of staking reward', 'An NFT minting code'], 'Your seed phrase is the master key to your wallet. Anyone with it can access all your funds. Never share it.'],
    ['What is "market cap" in crypto?', ['The total trading volume in 24h', 'Price × circulating supply', 'The highest ever price reached', 'The total number of wallets holding a coin'], 'Market cap = price × circulating supply. It represents the total value of all coins in circulation and is used to rank coins.'],
    ['What is a "honeypot" in crypto?', ['A wallet that rewards holders', 'A token you can buy but not sell', 'A DeFi yield strategy', 'A type of cold wallet'], 'A honeypot is a scam token designed so users can buy but a hidden contract prevents them from selling — stealing their funds.'],
    ['What does "ATH" stand for?', ['Average Trade High', 'All-Time High', 'Annual Token History', 'Automated Trading Hub'], 'ATH (All-Time High) is the highest price a coin has ever reached. Being far below ATH can signal either opportunity or permanent decline.'],
    ['What is "DCA" in investing?', ['Direct Crypto Access', 'Dollar Cost Averaging — buying fixed amounts regularly', 'Decentralized Capital Allocation', 'Digital Currency Accounting'], 'DCA (Dollar Cost Averaging) means investing a fixed amount at regular intervals. It removes the pressure of timing the market.'],
    ['What is a "rug pull"?', ['A market correction', 'When developers abandon a project and take investor funds', 'A type of flash crash', 'A forced liquidation'], 'A rug pull is when project developers suddenly withdraw all liquidity or sell their tokens, leaving investors with worthless assets.'],
    ['What does "diversification" mean in investing?', ['Buying only Bitcoin', 'Spreading investments across different assets to reduce risk', 'Trading on multiple exchanges', 'Holding only stablecoins'], 'Diversification reduces risk by ensuring no single bad investment can destroy your portfolio. "Don\'t put all eggs in one basket."'],
    ['What is a "stop-loss"?', ['A limit on how much you can deposit', 'A pre-set order to sell if price drops to a level to limit losses', 'A fee charged by exchanges', 'A type of smart contract'], 'A stop-loss automatically sells your position if price drops to your set level, preventing further losses beyond your tolerance.'],
    ['What does "position sizing" mean?', ['The screen size for trading apps', 'Deciding how much of your portfolio to put into one trade', 'The number of coins in a trade', 'The physical size of your ledger device'], 'Position sizing determines how much capital you risk per trade. Most professionals risk only 1-2% of their portfolio per position.'],
    ['If a coin drops 50%, how much does it need to rise to break even?', ['50%', '75%', '100%', '25%'], 'After a 50% drop, $100 becomes $50. To return to $100, it needs to double — a 100% gain. Losses are asymmetric!'],
    ['What is "volatility" in crypto?', ['The speed of transactions', 'The range and frequency of price swings', 'The number of daily trades', 'The supply inflation rate'], 'High volatility means large, rapid price swings. Crypto is typically much more volatile than stocks or bonds.'],
    ['What is "liquidity" in a token?', ['How new the token is', 'How easily it can be bought or sold without moving the price significantly', 'The number of developers', 'The staking reward rate'], 'High liquidity means large orders can be filled without major price impact. Low liquidity = hard to exit without crashing the price.'],
    ['What is "concentration risk"?', ['Danger of holding too many assets', 'Risk of having too much capital in one asset or sector', 'The risk of using centralised exchanges', 'Mining pool risk'], 'Concentration risk means one bad investment can severely damage your total portfolio. Aim to keep no single asset above 20-30%.'],
    ['What is "unrealised P&L"?', ['Profits from closed trades', 'Gains or losses on open positions not yet sold', 'Fees paid to exchanges', 'Tax owed on gains'], 'Unrealised P&L is profit or loss that only exists on paper — you haven\'t sold yet so it isn\'t locked in. It can still reverse.'],
    ['What is "FOMO" in trading?', ['Fundamental On-chain Market Overview', 'Fear Of Missing Out — buying impulsively when prices rise', 'A type of order book entry', 'Fast Order Market Operation'], 'FOMO causes investors to buy near tops because they fear missing a rally. It\'s one of the most common and costly emotional mistakes.'],
    ['What is "FUD" in crypto?', ['Fear, Uncertainty, Doubt — negative sentiment', 'Fundamental Utility Data', 'Fast Unwind Distribution', 'Fixed Utility Derivative'], 'FUD describes negative, often exaggerated information that causes panic selling. Learn to separate facts from FUD.'],
    ['What does "buying the dip" mean?', ['Selling when price rises', 'Purchasing an asset after its price has dropped', 'A type of margin trade', 'Buying at all-time highs'], 'Buying the dip means purchasing an asset after a price decline, with the expectation it will recover. Only works if the asset has strong fundamentals.'],
    ['What is "capitulation" in markets?', ['A breakout to new highs', 'Mass panic selling as investors give up', 'A bullish reversal pattern', 'A type of exchange listing'], 'Capitulation is when investors panic-sell regardless of losses. It often marks market bottoms — the "maximum pain" point.'],
    ['What is "diamond hands"?', ['A type of hardware wallet', 'Holding an asset through extreme volatility without selling', 'A DeFi protocol', 'An NFT collection'], 'Diamond hands means holding strong through huge dips and not panic selling. Opposite of "paper hands" (selling at first sign of loss).'],
    ['What is Bitcoin\'s maximum supply?', ['100 million BTC', '21 million BTC', '1 billion BTC', 'Unlimited'], 'Bitcoin has a hard cap of 21 million coins — enforced by its code. This scarcity is a key part of its value proposition.'],
    ['What is Ethereum\'s main innovation over Bitcoin?', ['Faster transactions', 'Smart contracts — programmable self-executing agreements', 'Lower fees', 'Better privacy'], 'Ethereum introduced smart contracts in 2015, enabling decentralized applications (dApps), DeFi, NFTs, and much more.'],
    ['What is a "stablecoin"?', ['Any coin under $1', 'A cryptocurrency pegged to a stable asset like USD', 'A coin with low volatility ranking', 'A government-issued crypto'], 'Stablecoins (USDT, USDC, DAI) maintain a peg to a real-world asset. They provide stability within crypto ecosystems.'],
    ['What is "proof of stake" (PoS)?', ['Mining with computers', 'Validators lock up coins as collateral to validate transactions', 'A security audit process', 'A type of exchange listing process'], 'PoS replaces energy-intensive mining. Validators stake coins as collateral — bad actors lose their stake (slashing).'],
    ['What is the "Fear & Greed Index"?', ['A government report on crypto regulation', 'A market sentiment score from 0 (extreme fear) to 100 (extreme greed)', 'A volatility measure for Bitcoin only', 'An exchange liquidity score'], 'The Fear & Greed Index aggregates volatility, volume, social media, surveys, and dominance data into a 0-100 sentiment score.'],
    ['What is "slippage" in crypto trading?', ['A fee for fast withdrawals', 'The difference between expected and actual execution price', 'Exchange downtime', 'A staking penalty'], 'Slippage occurs when your order fills at a different price than expected — common in low-liquidity tokens or large orders.'],
    ['What does "on-chain" mean?', ['Data stored in a centralised database', 'Transactions and data recorded directly on the blockchain', 'Tokens listed on major exchanges', 'Smart contracts deployed to mainnet'], 'On-chain refers to activity recorded on the actual blockchain — fully transparent, verifiable, and immutable.'],
    ['What is a "whale" in crypto?', ['A pump-and-dump scheme', 'An entity holding a very large amount of a cryptocurrency', 'A high-frequency trading bot', 'A type of DEX trade'], 'Whales hold enough crypto to significantly move markets with their trades. Tracking whale activity can signal market direction.'],
    ['What is a "cold wallet"?', ['A wallet for storing stablecoins', 'A hardware or paper wallet not connected to the internet', 'An exchange wallet', 'A wallet with frozen funds'], 'Cold wallets (Ledger, Trezor, paper wallets) keep private keys offline — immune to online hacks. Best for long-term storage.'],
    ['What is "2FA"?', ['Two-Factor Authentication — a second verification step', 'Two-Fee Access for VIP traders', 'Dual Funding Allocation', 'Second-layer blockchain technology'], '2FA adds a second verification step (usually a time-based code) beyond your password. Always enable it on exchanges.'],
    ['Which of these is SAFEST to click on?', ['An email saying your exchange account is locked', 'A link from a friend\'s hacked social media', 'The official exchange URL typed manually', 'A Google ad for your exchange'], 'Always type URLs manually or use saved bookmarks. Phishing sites look identical to real exchanges. Emails and ads are common attack vectors.'],
    ['What happens if you lose your seed phrase?', ['You can recover it from the exchange', 'You permanently lose access to your wallet and funds', 'Customer support can reset it', 'You can regenerate it with your email'], 'Seed phrases are generated once and cannot be recovered. Losing it means losing your wallet permanently. Store it offline and securely.'],
    ['What is "yield farming"?', ['Mining crypto using solar energy', 'Lending or providing liquidity to earn rewards', 'A long-term holding strategy', 'Generating NFTs for passive income'], 'Yield farming involves providing liquidity or lending crypto to protocols in exchange for interest or governance token rewards.'],
    ['What is "impermanent loss"?', ['A loss from a failed smart contract', 'Temporary loss from providing liquidity due to price changes', 'A fee for early unstaking', 'Loss from a hack on a DEX'], 'Impermanent loss happens when the price ratio of your liquidity pool tokens changes from when you deposited — reducing your value vs just holding.'],
    ['What is a "DEX"?', ['Decentralized Exchange — trades occur via smart contracts, no middleman', 'Digital Exchange with extra security', 'Direct Execution exchange', 'A type of blockchain wallet'], 'DEXs (Uniswap, dYdX, PancakeSwap) allow peer-to-peer trading via smart contracts — no KYC, no custodian, full self-custody.'],
    ['What is a "sell target"?', ['The maximum price you paid', 'A pre-planned price at which you intend to take profit', 'The price an exchange charges to sell', 'A limit order that prevents selling below cost'], 'Setting sell targets before buying removes emotion from decisions. Plan your exit before you enter — not during a rally.'],
    ['What does "taking profit" mean?', ['Calculating total gains', 'Selling some or all of a position to lock in gains', 'Moving gains to a savings account', 'Reinvesting all gains'], 'Taking profit means selling while in the green to lock in real gains. Many investors watch profits disappear by never selling.'],
    ['What is the best strategy during a bear market?', ['Sell everything at a loss', 'Use maximum leverage to recover losses faster', 'DCA into quality assets and build for the next cycle', 'Buy only meme coins for quick recovery'], 'Bear markets reward disciplined accumulators. DCA into high-conviction assets, manage risk, and avoid leverage until conditions improve.'],
    ['What is "rebalancing" a portfolio?', ['Moving all funds to one asset', 'Adjusting allocations back to target weights by buying/selling', 'Closing all positions', 'Switching exchanges'], 'Rebalancing restores your target allocation. If BTC grows to 80% of your portfolio from 50%, you sell some and buy underweight assets.'],
    ['If you invest $1,000 and it grows to $3,000, what is your ROI?', ['200%', '300%', '150%', '100%'], 'ROI = (Final - Initial) / Initial × 100 = (3000 - 1000) / 1000 × 100 = 200%. The profit is $2,000 on a $1,000 investment.'],
    ['What does a volume/market cap ratio above 10% indicate?', ['The coin is overvalued', 'High liquidity and strong trading interest', 'The coin is about to be delisted', 'Low investor confidence'], 'Volume/market cap > 10% signals active trading and good liquidity — making it easier to enter or exit large positions.'],
    ['What is "break-even price"?', ['The price when a coin was first listed', 'The price you need to sell at to recover your investment', 'The 52-week average price', 'The price after deducting exchange fees'], 'Break-even is your average buy price — the price you need to reach to recover what you invested. Below it you\'re at a loss.'],
  ],
  ar: [
    ['ماذا تعني "HODL" في عالم العملات الرقمية؟', ['التمسّك بالأصل مهما كلّف الأمر', 'سجلّ رقمي عالي الرتبة', 'تجزئة على طبقة موزّعة', 'تحوّط عند حدّ رقمي'], 'نشأت HODL من خطأ إملائي في كلمة hold في منشور عام 2013. وتعني الاحتفاظ بالأصول على المدى الطويل رغم التقلّبات.'],
    ['ما هي البلوك تشين؟', ['نوع من محافظ العملات الرقمية', 'سلسلة من كتل البيانات المشفّرة مشتركة عبر شبكة', 'منصّة تداول', 'نوع من عتاد التعدين'], 'البلوك تشين سجلّ موزّع تُخزَّن فيه البيانات في كتل مترابطة تشفيرياً — ما يجعلها عصيّة على التلاعب.'],
    ['ما هي "رسوم الغاز" في إيثيريوم؟', ['رسوم تحويل ETH إلى دولار', 'تكلفة الطاقة في التعدين', 'رسوم تُدفع للمُحقِّقين مقابل معالجة المعاملات', 'ضريبة على أرباح التمويل اللامركزي'], 'تعوّض رسوم الغاز المُحقِّقين عن العمل الحسابي اللازم لمعالجة المعاملات وتأكيدها على شبكة إيثيريوم.'],
    ['ماذا يعني اختصار "DeFi"؟', ['التمويل الرقمي', 'التمويل اللامركزي', 'النقد الموزّع', 'التمويل المباشر'], 'يشير التمويل اللامركزي إلى خدمات مالية مبنية على البلوك تشين دون وسطاء تقليديين كالبنوك.'],
    ['ما هي "العبارة الاسترجاعية"؟', ['كلمة مرور لمنصّة تداول', 'عبارة من 12–24 كلمة تستعيد بها محفظتك', 'نوع من مكافآت التخزين', 'رمز لسكّ الرموز غير القابلة للاستبدال'], 'العبارة الاسترجاعية هي المفتاح الرئيسي لمحفظتك. من يحصل عليها يصل إلى كل أموالك. لا تشاركها أبداً.'],
    ['ما هي "القيمة السوقية" في العملات الرقمية؟', ['إجمالي حجم التداول خلال 24 ساعة', 'السعر × المعروض المتداول', 'أعلى سعر بلغته العملة يوماً', 'عدد المحافظ التي تحتفظ بالعملة'], 'القيمة السوقية = السعر × المعروض المتداول. تمثّل القيمة الكلّية لكل العملات المتداولة، وتُستخدم لترتيب العملات.'],
    ['ما هو "الفخّ العسلي" في العملات الرقمية؟', ['محفظة تكافئ حامليها', 'رمز يمكنك شراؤه لكن لا يمكنك بيعه', 'استراتيجية عائد في التمويل اللامركزي', 'نوع من المحافظ الباردة'], 'الفخّ العسلي رمز احتيالي مصمَّم بحيث يستطيع المستخدمون الشراء بينما يمنعهم عقد خفي من البيع — فتُسرق أموالهم.'],
    ['ماذا يعني اختصار "ATH"؟', ['متوسط أعلى صفقة', 'أعلى سعر على الإطلاق', 'تاريخ الرمز السنوي', 'مركز تداول آلي'], 'ATH هو أعلى سعر بلغته العملة على الإطلاق. والابتعاد كثيراً عن هذا السعر قد يعني فرصة أو تراجعاً دائماً.'],
    ['ما هو "DCA" في الاستثمار؟', ['الوصول المباشر للعملات الرقمية', 'الشراء الدوري المنتظم — شراء مبالغ ثابتة بانتظام', 'تخصيص رأس المال اللامركزي', 'محاسبة العملات الرقمية'], 'الشراء الدوري المنتظم يعني استثمار مبلغ ثابت على فترات منتظمة. وهو يزيل ضغط محاولة توقيت السوق.'],
    ['ما هو "سحب البساط"؟', ['تصحيح في السوق', 'أن يتخلّى المطوّرون عن المشروع ويستولوا على أموال المستثمرين', 'نوع من الانهيار الخاطف', 'تصفية قسرية'], 'سحب البساط هو أن يسحب مطوّرو المشروع فجأة كل السيولة أو يبيعوا رموزهم، فيبقى المستثمرون بأصول بلا قيمة.'],
    ['ماذا يعني "التنويع" في الاستثمار؟', ['شراء البيتكوين فقط', 'توزيع الاستثمارات على أصول مختلفة لتقليل المخاطر', 'التداول على عدّة منصّات', 'الاحتفاظ بالعملات المستقرة فقط'], 'يقلّل التنويع المخاطر بضمان ألّا يستطيع استثمار سيّئ واحد تدمير محفظتك. «لا تضع كل بيضك في سلة واحدة».'],
    ['ما هو "وقف الخسارة"؟', ['حدّ لما يمكنك إيداعه', 'أمر مسبق بالبيع إذا هبط السعر إلى مستوى معيّن للحدّ من الخسائر', 'رسوم تفرضها المنصّات', 'نوع من العقود الذكية'], 'يبيع وقف الخسارة مركزك تلقائياً إذا هبط السعر إلى المستوى الذي حدّدته، فيمنع خسائر تتجاوز ما تحتمله.'],
    ['ماذا يعني "تحديد حجم المركز"؟', ['حجم الشاشة في تطبيقات التداول', 'تقرير أي جزء من محفظتك تضعه في صفقة واحدة', 'عدد العملات في الصفقة', 'الحجم المادي لجهاز محفظتك'], 'يحدّد حجم المركز مقدار رأس المال الذي تخاطر به في كل صفقة. ومعظم المحترفين يخاطرون بـ 1–2% فقط من محفظتهم لكل مركز.'],
    ['إذا هبطت عملة 50%، فكم تحتاج أن ترتفع للعودة إلى نقطة التعادل؟', ['50%', '75%', '100%', '25%'], 'بعد هبوط 50% يصبح المئة دولار خمسين. وللعودة إلى المئة يجب أن تتضاعف — أي مكسب 100%. الخسائر غير متماثلة!'],
    ['ما هو "التقلّب" في العملات الرقمية؟', ['سرعة المعاملات', 'مدى تأرجح الأسعار وتكرار ذلك', 'عدد الصفقات اليومية', 'معدّل تضخّم المعروض'], 'التقلّب العالي يعني تأرجحات سعرية كبيرة وسريعة. والعملات الرقمية عادةً أكثر تقلّباً بكثير من الأسهم أو السندات.'],
    ['ما هي "السيولة" في الرمز؟', ['مدى حداثة الرمز', 'مدى سهولة شرائه أو بيعه دون تحريك السعر كثيراً', 'عدد المطوّرين', 'معدّل مكافأة التخزين'], 'السيولة العالية تعني إمكانية تنفيذ أوامر كبيرة دون أثر سعري كبير. والسيولة المنخفضة تعني صعوبة الخروج دون إسقاط السعر.'],
    ['ما هي "مخاطر التركّز"؟', ['خطر امتلاك أصول كثيرة جداً', 'خطر وضع رأس مال كبير في أصل أو قطاع واحد', 'خطر استخدام المنصّات المركزية', 'مخاطر مجمّعات التعدين'], 'تعني مخاطر التركّز أن استثماراً سيّئاً واحداً قد يضرّ محفظتك كلها بشدّة. اجعل هدفك ألّا يتجاوز أي أصل منفرد 20–30%.'],
    ['ما هي "الأرباح والخسائر غير المحقّقة"؟', ['أرباح من صفقات مغلقة', 'مكاسب أو خسائر على مراكز مفتوحة لم تُبَع بعد', 'رسوم مدفوعة للمنصّات', 'ضريبة مستحقّة على المكاسب'], 'الأرباح غير المحقّقة موجودة على الورق فقط — لم تبع بعد فهي غير مثبّتة، ويمكن أن تنعكس.'],
    ['ما هو "FOMO" في التداول؟', ['نظرة أساسية على سوق السلسلة', 'الخوف من تفويت الفرصة — الشراء باندفاع عند ارتفاع الأسعار', 'نوع من قيود دفتر الأوامر', 'عملية سوق سريعة للأوامر'], 'يدفع الخوف من الفوات المستثمرين إلى الشراء قرب القمم خشية تفويت موجة صعود. وهو من أشيع الأخطاء العاطفية وأكثرها كلفة.'],
    ['ما هو "FUD" في العملات الرقمية؟', ['الخوف وعدم اليقين والشك — مشاعر سلبية', 'بيانات المنفعة الأساسية', 'توزيع التفكيك السريع', 'مشتقّ منفعة ثابت'], 'يصف FUD المعلومات السلبية، والمبالغ فيها غالباً، التي تسبّب بيعاً ذعرياً. تعلّم كيف تفصل الحقائق عن الضجيج.'],
    ['ماذا يعني "الشراء عند الانخفاض"؟', ['البيع عند ارتفاع السعر', 'شراء أصل بعد هبوط سعره', 'نوع من التداول بالهامش', 'الشراء عند أعلى القمم'], 'الشراء عند الانخفاض يعني شراء أصل بعد تراجع سعره توقّعاً لتعافيه. ولا ينفع ذلك إلا إذا كانت أساسيات الأصل قوية.'],
    ['ما هو "الاستسلام" في الأسواق؟', ['اختراق نحو قمم جديدة', 'بيع ذعري جماعي مع استسلام المستثمرين', 'نمط انعكاس صاعد', 'نوع من الإدراج في المنصّات'], 'الاستسلام هو أن يبيع المستثمرون بدافع الذعر مهما بلغت الخسائر. وهو غالباً ما يصنع قيعان السوق — نقطة «أقصى الألم».'],
    ['ما هي "الأيدي الماسية"؟', ['نوع من المحافظ المادية', 'الاحتفاظ بالأصل خلال تقلّبات عنيفة دون بيع', 'بروتوكول تمويل لامركزي', 'مجموعة رموز غير قابلة للاستبدال'], 'الأيدي الماسية تعني الصمود خلال الانخفاضات الكبيرة وعدم البيع ذعراً. وهي عكس «الأيدي الورقية» التي تبيع عند أول إشارة خسارة.'],
    ['ما هو الحدّ الأقصى لمعروض البيتكوين؟', ['100 مليون بيتكوين', '21 مليون بيتكوين', 'مليار بيتكوين', 'غير محدود'], 'للبيتكوين سقف صارم عند 21 مليون عملة تفرضه شفرته البرمجية. وهذه الندرة جزء أساسي من قيمته.'],
    ['ما هو الابتكار الرئيسي لإيثيريوم مقارنةً بالبيتكوين؟', ['معاملات أسرع', 'العقود الذكية — اتفاقيات قابلة للبرمجة تنفّذ نفسها', 'رسوم أقل', 'خصوصية أفضل'], 'قدّم إيثيريوم العقود الذكية عام 2015، فمكّن التطبيقات اللامركزية والتمويل اللامركزي والرموز غير القابلة للاستبدال وغيرها الكثير.'],
    ['ما هي "العملة المستقرة"؟', ['أي عملة دون دولار واحد', 'عملة رقمية مربوطة بأصل مستقر مثل الدولار', 'عملة ذات تصنيف تقلّب منخفض', 'عملة رقمية تصدرها الحكومة'], 'تحافظ العملات المستقرة (USDT وUSDC وDAI) على ربطها بأصل من العالم الحقيقي. وهي توفّر استقراراً داخل منظومة العملات الرقمية.'],
    ['ما هو "إثبات الحصة" (PoS)؟', ['التعدين بالحواسيب', 'يقفل المُحقِّقون عملات كضمان للتحقّق من المعاملات', 'عملية تدقيق أمني', 'نوع من عمليات الإدراج في المنصّات'], 'يحلّ إثبات الحصة محلّ التعدين كثيف الطاقة. يودع المُحقِّقون عملات كضمان — ومن يسيء التصرّف يخسر حصته.'],
    ['ما هو "مؤشر الخوف والطمع"؟', ['تقرير حكومي عن تنظيم العملات الرقمية', 'مقياس لمزاج السوق من 0 (خوف شديد) إلى 100 (طمع شديد)', 'مقياس تقلّب للبيتكوين وحده', 'مقياس سيولة المنصّات'], 'يجمع مؤشر الخوف والطمع بين التقلّب والحجم ووسائل التواصل والاستطلاعات وبيانات الهيمنة في درجة مزاج من 0 إلى 100.'],
    ['ما هو "الانزلاق السعري" في التداول؟', ['رسوم للسحب السريع', 'الفرق بين السعر المتوقّع وسعر التنفيذ الفعلي', 'توقّف المنصّة عن العمل', 'غرامة على التخزين'], 'يحدث الانزلاق حين يُنفَّذ أمرك بسعر مختلف عمّا توقّعت — وهو شائع في الرموز قليلة السيولة أو مع الأوامر الكبيرة.'],
    ['ماذا يعني "على السلسلة"؟', ['بيانات مخزّنة في قاعدة بيانات مركزية', 'معاملات وبيانات مسجّلة مباشرةً على البلوك تشين', 'رموز مدرجة في المنصّات الكبرى', 'عقود ذكية منشورة على الشبكة الرئيسية'], 'يشير «على السلسلة» إلى النشاط المسجّل على البلوك تشين نفسها — شفاف تماماً وقابل للتحقّق وغير قابل للتغيير.'],
    ['ما هو "الحوت" في العملات الرقمية؟', ['مخطّط ضخّ وتفريغ', 'كيان يحتفظ بكمية ضخمة جداً من عملة رقمية', 'روبوت تداول عالي التردّد', 'نوع من صفقات المنصّات اللامركزية'], 'يملك الحيتان ما يكفي من العملات لتحريك الأسواق بصفقاتهم. وتتبّع نشاطهم قد يشير إلى اتجاه السوق.'],
    ['ما هي "المحفظة الباردة"؟', ['محفظة لتخزين العملات المستقرة', 'محفظة مادية أو ورقية غير متّصلة بالإنترنت', 'محفظة على منصّة تداول', 'محفظة أموالها مجمّدة'], 'تُبقي المحافظ الباردة (Ledger وTrezor والمحافظ الورقية) المفاتيح الخاصة دون اتصال — بمنأى عن الاختراقات. وهي الأفضل للتخزين طويل الأمد.'],
    ['ما هو "التحقّق بخطوتين" (2FA)؟', ['التحقّق بخطوتين — خطوة تحقّق ثانية', 'وصول برسمين للمتداولين المميّزين', 'تخصيص تمويل مزدوج', 'تقنية بلوك تشين من الطبقة الثانية'], 'يضيف التحقّق بخطوتين خطوة تحقّق ثانية (رمز زمني عادةً) بعد كلمة المرور. فعّله دائماً على منصّات التداول.'],
    ['أيٌّ من هذه الأكثر أماناً للنقر عليه؟', ['بريد يقول إن حسابك على المنصّة مقفل', 'رابط من حساب صديق مخترَق', 'عنوان المنصّة الرسمي تكتبه بنفسك', 'إعلان جوجل لمنصّتك'], 'اكتب العناوين بنفسك دائماً أو استخدم إشاراتك المحفوظة. مواقع التصيّد تبدو مطابقة للمنصّات الحقيقية، والبريد والإعلانات وسائل هجوم شائعة.'],
    ['ماذا يحدث إذا فقدت عبارتك الاسترجاعية؟', ['يمكنك استعادتها من المنصّة', 'تفقد الوصول إلى محفظتك وأموالك نهائياً', 'يمكن لدعم العملاء إعادة تعيينها', 'يمكنك توليدها من جديد ببريدك'], 'تُولَّد العبارة الاسترجاعية مرة واحدة ولا يمكن استعادتها. فقدانها يعني فقدان محفظتك إلى الأبد. احفظها دون اتصال وفي مكان آمن.'],
    ['ما هي "زراعة العائد"؟', ['تعدين العملات بالطاقة الشمسية', 'الإقراض أو توفير السيولة لكسب مكافآت', 'استراتيجية احتفاظ طويلة الأمد', 'توليد رموز غير قابلة للاستبدال لدخل سلبي'], 'تتضمّن زراعة العائد توفير السيولة أو إقراض العملات للبروتوكولات مقابل فائدة أو مكافآت من رموز الحوكمة.'],
    ['ما هي "الخسارة غير الدائمة"؟', ['خسارة من عقد ذكي فاشل', 'خسارة مؤقتة من توفير السيولة بسبب تغيّر الأسعار', 'رسوم على إنهاء التخزين مبكراً', 'خسارة من اختراق منصّة لامركزية'], 'تحدث الخسارة غير الدائمة حين تتغيّر نسبة أسعار رموز مجمّع السيولة عمّا كانت عند الإيداع — فتقلّ قيمتك مقارنةً بمجرّد الاحتفاظ.'],
    ['ما هي "المنصّة اللامركزية" (DEX)؟', ['منصّة لامركزية — تتم الصفقات عبر عقود ذكية بلا وسيط', 'منصّة رقمية بأمان إضافي', 'منصّة تنفيذ مباشر', 'نوع من محافظ البلوك تشين'], 'تتيح المنصّات اللامركزية (Uniswap وdYdX وPancakeSwap) التداول المباشر بين الأطراف عبر عقود ذكية — بلا تحقّق هوية وبلا وصاية وبحفظ ذاتي كامل.'],
    ['ما هو "هدف البيع"؟', ['أعلى سعر دفعته', 'سعر مخطّط مسبقاً تنوي عنده جني الربح', 'السعر الذي تتقاضاه المنصّة للبيع', 'أمر محدّد يمنع البيع دون التكلفة'], 'تحديد أهداف البيع قبل الشراء يزيل العاطفة من القرار. خطّط لخروجك قبل الدخول، لا أثناء موجة الصعود.'],
    ['ماذا يعني "جني الأرباح"؟', ['حساب إجمالي المكاسب', 'بيع جزء من المركز أو كله لتثبيت المكاسب', 'تحويل المكاسب إلى حساب توفير', 'إعادة استثمار كل المكاسب'], 'جني الأرباح يعني البيع وأنت رابح لتثبيت مكاسب حقيقية. كثير من المستثمرين يشاهدون أرباحهم تتبخّر لأنهم لا يبيعون أبداً.'],
    ['ما أفضل استراتيجية في السوق الهابطة؟', ['بيع كل شيء بخسارة', 'استخدام أقصى رافعة لتعويض الخسائر أسرع', 'الشراء الدوري في أصول جيّدة والبناء للدورة القادمة', 'شراء العملات الساخرة فقط للتعافي السريع'], 'تكافئ الأسواق الهابطة من يجمّع بانضباط. اشترِ دورياً في أصول عالية القناعة، وأدِر مخاطرك، وتجنّب الرافعة حتى تتحسّن الظروف.'],
    ['ما معنى "إعادة توازن" المحفظة؟', ['نقل كل الأموال إلى أصل واحد', 'تعديل التوزيعات لتعود إلى أوزانها المستهدفة بالبيع والشراء', 'إغلاق كل المراكز', 'تغيير المنصّة'], 'تعيد إعادة التوازن توزيعك المستهدف. فإن نما البيتكوين من 50% إلى 80% من محفظتك، تبيع جزءاً منه وتشتري الأصول ناقصة الوزن.'],
    ['إذا استثمرت 1,000 دولار فصارت 3,000 دولار، فكم عائدك على الاستثمار؟', ['200%', '300%', '150%', '100%'], 'العائد = (النهائي − الأولي) ÷ الأولي × 100 = (3000 − 1000) ÷ 1000 × 100 = 200%. فالربح 2,000 دولار على استثمار قدره 1,000 دولار.'],
    ['ماذا تعني نسبة حجم التداول إلى القيمة السوقية فوق 10%؟', ['العملة مبالغ في تقييمها', 'سيولة عالية واهتمام تداولي قوي', 'العملة على وشك الشطب', 'ثقة منخفضة من المستثمرين'], 'تجاوز النسبة 10% يشير إلى تداول نشط وسيولة جيّدة — ما يسهّل الدخول في المراكز الكبيرة أو الخروج منها.'],
    ['ما هو "سعر التعادل"؟', ['سعر العملة عند إدراجها لأول مرة', 'السعر الذي يجب أن تبيع عنده لتسترد استثمارك', 'متوسط سعر 52 أسبوعاً', 'السعر بعد خصم رسوم المنصّة'], 'سعر التعادل هو متوسط سعر شرائك — السعر الذي يجب بلوغه لاسترداد ما استثمرته. وما دونه فأنت في خسارة.'],
  ],
  fr: [
    ['Que signifie « HODL » en crypto ?', ['Hold On for Dear Life (s’accrocher coûte que coûte)', 'Registre numérique de haut niveau', 'Hachage sur couche distribuée', 'Couverture à limite numérique'], 'HODL vient d’une faute de frappe sur « hold » dans un message de 2013. Cela signifie conserver ses actifs sur le long terme malgré la volatilité.'],
    ['Qu’est-ce qu’une blockchain ?', ['Un type de portefeuille crypto', 'Une chaîne de blocs de données chiffrées partagée sur un réseau', 'Une plateforme de trading', 'Un type de matériel de minage'], 'Une blockchain est un registre distribué où les données sont stockées dans des blocs liés cryptographiquement — ce qui la rend résistante à la falsification.'],
    ['Qu’est-ce que les « frais de gas » sur Ethereum ?', ['Des frais pour convertir l’ETH en dollars', 'Le coût énergétique du minage', 'Des frais versés aux validateurs pour traiter les transactions', 'Une taxe sur les profits DeFi'], 'Les frais de gas rémunèrent les validateurs pour le travail de calcul nécessaire au traitement et à la confirmation des transactions sur Ethereum.'],
    ['Que signifie « DeFi » ?', ['Finance numérique', 'Finance décentralisée', 'Monnaie fiduciaire distribuée', 'Finance directe'], 'La DeFi désigne des services financiers construits sur la blockchain, sans intermédiaires traditionnels comme les banques.'],
    ['Qu’est-ce qu’une « phrase de récupération » ?', ['Un mot de passe de plateforme', 'Une phrase de 12 à 24 mots qui restaure votre portefeuille', 'Un type de récompense de staking', 'Un code de frappe de NFT'], 'Votre phrase de récupération est la clé maîtresse de votre portefeuille. Quiconque la détient accède à tous vos fonds. Ne la partagez jamais.'],
    ['Qu’est-ce que la « capitalisation » en crypto ?', ['Le volume total échangé sur 24 h', 'Le prix × l’offre en circulation', 'Le plus haut prix jamais atteint', 'Le nombre de portefeuilles détenant la crypto'], 'Capitalisation = prix × offre en circulation. Elle représente la valeur totale des unités en circulation et sert à classer les cryptos.'],
    ['Qu’est-ce qu’un « honeypot » en crypto ?', ['Un portefeuille qui récompense ses détenteurs', 'Un jeton que l’on peut acheter mais pas revendre', 'Une stratégie de rendement DeFi', 'Un type de portefeuille froid'], 'Un honeypot est un jeton frauduleux conçu pour qu’on puisse acheter, un contrat caché empêchant la revente — et volant ainsi les fonds.'],
    ['Que signifie « ATH » ?', ['Moyenne des plus hauts', 'Plus haut historique', 'Historique annuel du jeton', 'Plateforme de trading automatisé'], 'L’ATH est le plus haut prix jamais atteint. Être très en dessous peut signaler soit une opportunité, soit un déclin durable.'],
    ['Qu’est-ce que le « DCA » ?', ['Accès direct aux cryptos', 'L’investissement programmé — acheter des montants fixes régulièrement', 'Allocation décentralisée du capital', 'Comptabilité des monnaies numériques'], 'Le DCA consiste à investir un montant fixe à intervalles réguliers. Cela supprime la pression du timing de marché.'],
    ['Qu’est-ce qu’un « rug pull » ?', ['Une correction de marché', 'Quand les développeurs abandonnent un projet en emportant les fonds', 'Un type de krach éclair', 'Une liquidation forcée'], 'Un rug pull, c’est quand les développeurs retirent soudainement toute la liquidité ou vendent leurs jetons, laissant les investisseurs avec des actifs sans valeur.'],
    ['Que signifie « diversification » en investissement ?', ['N’acheter que du Bitcoin', 'Répartir ses investissements sur différents actifs pour réduire le risque', 'Trader sur plusieurs plateformes', 'Ne détenir que des stablecoins'], 'La diversification réduit le risque en garantissant qu’un seul mauvais investissement ne peut détruire votre portefeuille. « Pas tous ses œufs dans le même panier. »'],
    ['Qu’est-ce qu’un « stop-loss » ?', ['Une limite de dépôt', 'Un ordre prédéfini de vente si le prix atteint un niveau, pour limiter les pertes', 'Des frais prélevés par les plateformes', 'Un type de contrat intelligent'], 'Un stop-loss vend automatiquement votre position si le prix descend au niveau que vous avez fixé, évitant des pertes au-delà de votre tolérance.'],
    ['Que signifie « dimensionner sa position » ?', ['La taille d’écran des applis de trading', 'Décider quelle part du portefeuille engager sur une opération', 'Le nombre d’unités dans une opération', 'La taille physique de votre appareil Ledger'], 'Le dimensionnement détermine le capital risqué par opération. La plupart des professionnels ne risquent que 1 à 2 % de leur portefeuille par position.'],
    ['Si une crypto chute de 50 %, de combien doit-elle monter pour revenir à l’équilibre ?', ['50 %', '75 %', '100 %', '25 %'], 'Après une chute de 50 %, 100 $ deviennent 50 $. Pour revenir à 100 $, il faut doubler — soit +100 %. Les pertes sont asymétriques !'],
    ['Qu’est-ce que la « volatilité » en crypto ?', ['La vitesse des transactions', 'L’amplitude et la fréquence des variations de prix', 'Le nombre d’opérations quotidiennes', 'Le taux d’inflation de l’offre'], 'Une forte volatilité signifie de larges variations de prix rapides. Les cryptos sont en général bien plus volatiles que les actions ou les obligations.'],
    ['Qu’est-ce que la « liquidité » d’un jeton ?', ['Son ancienneté', 'La facilité à l’acheter ou le vendre sans déplacer nettement le prix', 'Le nombre de développeurs', 'Le taux de récompense du staking'], 'Une forte liquidité permet d’exécuter de gros ordres sans impact majeur sur le prix. Faible liquidité = difficile de sortir sans faire s’effondrer le cours.'],
    ['Qu’est-ce que le « risque de concentration » ?', ['Le danger de détenir trop d’actifs', 'Le risque d’avoir trop de capital sur un actif ou un secteur', 'Le risque d’utiliser des plateformes centralisées', 'Le risque des pools de minage'], 'Le risque de concentration signifie qu’un seul mauvais investissement peut fortement endommager tout le portefeuille. Visez à ne dépasser 20-30 % sur aucun actif.'],
    ['Qu’est-ce que le « P&L latent » ?', ['Les profits des opérations clôturées', 'Les gains ou pertes sur des positions ouvertes non encore vendues', 'Les frais versés aux plateformes', 'L’impôt dû sur les plus-values'], 'Le P&L latent n’existe que sur le papier — vous n’avez pas vendu, donc rien n’est acquis. Cela peut encore s’inverser.'],
    ['Qu’est-ce que le « FOMO » en trading ?', ['Vue d’ensemble fondamentale du marché on-chain', 'Fear Of Missing Out — acheter impulsivement quand les prix montent', 'Un type d’entrée dans le carnet d’ordres', 'Opération de marché à ordre rapide'], 'Le FOMO pousse à acheter près des sommets par peur de rater une hausse. C’est l’une des erreurs émotionnelles les plus fréquentes et les plus coûteuses.'],
    ['Qu’est-ce que le « FUD » en crypto ?', ['Peur, incertitude et doute — un sentiment négatif', 'Données fondamentales d’utilité', 'Distribution de dénouement rapide', 'Dérivé d’utilité fixe'], 'Le FUD désigne des informations négatives, souvent exagérées, qui provoquent des ventes de panique. Apprenez à distinguer les faits du FUD.'],
    ['Que signifie « acheter le creux » ?', ['Vendre quand le prix monte', 'Acheter un actif après une baisse de son prix', 'Un type d’opération sur marge', 'Acheter aux plus hauts historiques'], 'Acheter le creux, c’est acheter après une baisse en pariant sur un rebond. Cela ne fonctionne que si les fondamentaux de l’actif sont solides.'],
    ['Qu’est-ce que la « capitulation » ?', ['Une cassure vers de nouveaux sommets', 'Une vente panique massive, les investisseurs abandonnant', 'Une figure de retournement haussier', 'Un type de cotation en plateforme'], 'La capitulation, c’est quand les investisseurs vendent dans la panique quelles que soient les pertes. Elle marque souvent les creux de marché — le point de « douleur maximale ».'],
    ['Que sont les « mains de diamant » ?', ['Un type de portefeuille matériel', 'Conserver un actif à travers une volatilité extrême sans vendre', 'Un protocole DeFi', 'Une collection de NFT'], 'Les mains de diamant, c’est tenir bon malgré de fortes chutes sans vendre dans la panique. L’inverse des « mains de papier », qui vendent au premier signe de perte.'],
    ['Quelle est l’offre maximale de Bitcoin ?', ['100 millions de BTC', '21 millions de BTC', '1 milliard de BTC', 'Illimitée'], 'Bitcoin a un plafond strict de 21 millions d’unités, imposé par son code. Cette rareté est un élément clé de sa proposition de valeur.'],
    ['Quelle est la principale innovation d’Ethereum par rapport à Bitcoin ?', ['Des transactions plus rapides', 'Les contrats intelligents — des accords programmables auto-exécutants', 'Des frais plus bas', 'Une meilleure confidentialité'], 'Ethereum a introduit les contrats intelligents en 2015, rendant possibles les applications décentralisées, la DeFi, les NFT et bien plus.'],
    ['Qu’est-ce qu’un « stablecoin » ?', ['Toute crypto sous 1 $', 'Une cryptomonnaie arrimée à un actif stable comme le dollar', 'Une crypto au classement de volatilité faible', 'Une crypto émise par un État'], 'Les stablecoins (USDT, USDC, DAI) maintiennent une parité avec un actif réel. Ils apportent de la stabilité au sein de l’écosystème crypto.'],
    ['Qu’est-ce que la « preuve d’enjeu » (PoS) ?', ['Miner avec des ordinateurs', 'Les validateurs immobilisent des jetons en garantie pour valider les transactions', 'Un processus d’audit de sécurité', 'Un type de processus de cotation'], 'Le PoS remplace le minage énergivore. Les validateurs mettent des jetons en garantie — les mauvais acteurs perdent leur mise.'],
    ['Qu’est-ce que l’« indice Fear & Greed » ?', ['Un rapport public sur la régulation crypto', 'Un score de sentiment de marché de 0 (peur extrême) à 100 (cupidité extrême)', 'Une mesure de volatilité pour le Bitcoin seul', 'Un score de liquidité des plateformes'], 'L’indice agrège volatilité, volume, réseaux sociaux, sondages et dominance en un score de sentiment de 0 à 100.'],
    ['Qu’est-ce que le « slippage » ?', ['Des frais de retrait rapide', 'L’écart entre le prix attendu et le prix d’exécution réel', 'Une indisponibilité de la plateforme', 'Une pénalité de staking'], 'Le slippage survient quand votre ordre s’exécute à un prix différent de celui attendu — fréquent sur les jetons peu liquides ou pour de gros ordres.'],
    ['Que signifie « on-chain » ?', ['Des données dans une base centralisée', 'Des transactions et des données inscrites directement sur la blockchain', 'Des jetons cotés sur les grandes plateformes', 'Des contrats intelligents déployés sur le réseau principal'], 'On-chain désigne l’activité inscrite sur la blockchain elle-même — entièrement transparente, vérifiable et immuable.'],
    ['Qu’est-ce qu’une « baleine » en crypto ?', ['Un schéma de pump and dump', 'Une entité détenant une très grande quantité d’une cryptomonnaie', 'Un robot de trading haute fréquence', 'Un type d’opération sur DEX'], 'Les baleines détiennent assez de crypto pour déplacer sensiblement les marchés. Suivre leur activité peut indiquer la direction du marché.'],
    ['Qu’est-ce qu’un « portefeuille froid » ?', ['Un portefeuille pour stablecoins', 'Un portefeuille matériel ou papier non connecté à Internet', 'Un portefeuille de plateforme', 'Un portefeuille aux fonds gelés'], 'Les portefeuilles froids (Ledger, Trezor, papier) gardent les clés privées hors ligne — à l’abri des piratages. Idéal pour le long terme.'],
    ['Qu’est-ce que la « 2FA » ?', ['L’authentification à deux facteurs — une seconde étape de vérification', 'Un accès à double tarif pour traders VIP', 'Une double allocation de financement', 'Une technologie blockchain de couche 2'], 'La 2FA ajoute une seconde vérification (généralement un code temporaire) après votre mot de passe. Activez-la toujours sur les plateformes.'],
    ['Sur lequel est-il le PLUS SÛR de cliquer ?', ['Un e-mail disant que votre compte est bloqué', 'Un lien venant du réseau social piraté d’un ami', 'L’URL officielle de la plateforme saisie à la main', 'Une publicité Google pour votre plateforme'], 'Saisissez toujours les URL à la main ou utilisez vos favoris. Les sites de phishing sont identiques aux vrais. E-mails et publicités sont des vecteurs d’attaque courants.'],
    ['Que se passe-t-il si vous perdez votre phrase de récupération ?', ['Vous pouvez la récupérer auprès de la plateforme', 'Vous perdez définitivement l’accès à votre portefeuille et à vos fonds', 'Le support client peut la réinitialiser', 'Vous pouvez la régénérer avec votre e-mail'], 'Une phrase de récupération est générée une fois et ne peut être retrouvée. La perdre, c’est perdre son portefeuille pour toujours. Conservez-la hors ligne et en sécurité.'],
    ['Qu’est-ce que le « yield farming » ?', ['Miner des cryptos à l’énergie solaire', 'Prêter ou fournir de la liquidité pour percevoir des récompenses', 'Une stratégie de conservation longue durée', 'Créer des NFT pour un revenu passif'], 'Le yield farming consiste à fournir de la liquidité ou prêter des cryptos à des protocoles en échange d’intérêts ou de jetons de gouvernance.'],
    ['Qu’est-ce que la « perte impermanente » ?', ['Une perte due à un contrat intelligent défaillant', 'Une perte temporaire liée à la fourniture de liquidité, due aux variations de prix', 'Des frais de retrait anticipé du staking', 'Une perte due au piratage d’un DEX'], 'La perte impermanente survient quand le rapport de prix des jetons de votre pool change par rapport au dépôt — réduisant votre valeur face à une simple détention.'],
    ['Qu’est-ce qu’un « DEX » ?', ['Un échange décentralisé — les opérations passent par des contrats intelligents, sans intermédiaire', 'Un échange numérique à sécurité renforcée', 'Un échange à exécution directe', 'Un type de portefeuille blockchain'], 'Les DEX (Uniswap, dYdX, PancakeSwap) permettent d’échanger de pair à pair via des contrats intelligents — sans KYC, sans dépositaire, en auto-conservation totale.'],
    ['Qu’est-ce qu’un « objectif de vente » ?', ['Le prix maximum que vous avez payé', 'Un prix planifié à l’avance auquel vous comptez prendre vos bénéfices', 'Le prix que la plateforme facture pour vendre', 'Un ordre limite empêchant de vendre à perte'], 'Fixer ses objectifs de vente avant d’acheter retire l’émotion de la décision. Planifiez votre sortie avant d’entrer, pas pendant la hausse.'],
    ['Que signifie « prendre ses bénéfices » ?', ['Calculer ses gains totaux', 'Vendre tout ou partie d’une position pour sécuriser les gains', 'Transférer les gains sur un compte d’épargne', 'Réinvestir tous les gains'], 'Prendre ses bénéfices, c’est vendre en étant en positif pour sécuriser des gains réels. Beaucoup voient leurs profits s’évaporer faute de vendre.'],
    ['Quelle est la meilleure stratégie en marché baissier ?', ['Tout vendre à perte', 'Utiliser un levier maximal pour se refaire plus vite', 'Investir progressivement dans des actifs de qualité pour le cycle suivant', 'N’acheter que des memecoins pour se refaire vite'], 'Les marchés baissiers récompensent ceux qui accumulent avec discipline. Investissez progressivement dans vos fortes convictions, gérez le risque et évitez le levier.'],
    ['Qu’est-ce que « rééquilibrer » un portefeuille ?', ['Transférer tous les fonds sur un seul actif', 'Ramener les allocations à leurs pondérations cibles en achetant ou vendant', 'Clôturer toutes les positions', 'Changer de plateforme'], 'Le rééquilibrage rétablit votre allocation cible. Si le BTC passe de 50 % à 80 % du portefeuille, vous en vendez une partie pour renforcer les lignes sous-pondérées.'],
    ['Si vous investissez 1 000 $ et que cela devient 3 000 $, quel est votre ROI ?', ['200 %', '300 %', '150 %', '100 %'], 'ROI = (final − initial) ÷ initial × 100 = (3000 − 1000) ÷ 1000 × 100 = 200 %. Le profit est de 2 000 $ pour 1 000 $ investis.'],
    ['Qu’indique un ratio volume/capitalisation supérieur à 10 % ?', ['La crypto est surévaluée', 'Une forte liquidité et un vif intérêt des traders', 'La crypto va être retirée de la cote', 'Une faible confiance des investisseurs'], 'Un ratio supérieur à 10 % signale un trading actif et une bonne liquidité — il devient plus facile d’entrer ou de sortir de grosses positions.'],
    ['Qu’est-ce que le « prix d’équilibre » ?', ['Le prix lors de la première cotation', 'Le prix auquel vendre pour récupérer votre investissement', 'Le prix moyen sur 52 semaines', 'Le prix après déduction des frais'], 'Le prix d’équilibre est votre prix d’achat moyen — celui qu’il faut atteindre pour récupérer votre mise. En dessous, vous êtes en perte.'],
  ],
  es: [
    ['¿Qué significa «HODL» en cripto?', ['Aguantar pase lo que pase', 'Libro digital de alto orden', 'Hash en capa distribuida', 'Cobertura en límite digital'], 'HODL nació de un mensaje de 2013 en el que se escribió mal «hold». Significa conservar los activos a largo plazo pese a la volatilidad.'],
    ['¿Qué es una blockchain?', ['Un tipo de cartera cripto', 'Una cadena de bloques de datos cifrados compartida en una red', 'Una plataforma de trading', 'Un tipo de hardware de minería'], 'Una blockchain es un libro distribuido en el que los datos se guardan en bloques encadenados criptográficamente, lo que la hace resistente a la manipulación.'],
    ['¿Qué son las «comisiones de gas» en Ethereum?', ['Una comisión por convertir ETH en dólares', 'El coste energético de la minería', 'Una comisión que se paga a los validadores por procesar transacciones', 'Un impuesto sobre los beneficios de DeFi'], 'Las comisiones de gas compensan a los validadores por el trabajo de cómputo de procesar y confirmar transacciones en Ethereum.'],
    ['¿Qué significa «DeFi»?', ['Finanzas digitales', 'Finanzas descentralizadas', 'Dinero fíat distribuido', 'Finanzas directas'], 'La DeFi son servicios financieros construidos sobre blockchain, sin intermediarios tradicionales como los bancos.'],
    ['¿Qué es una «frase semilla»?', ['Una contraseña de un exchange', 'Una frase de 12 a 24 palabras que recupera tu cartera', 'Un tipo de recompensa de staking', 'Un código para acuñar NFT'], 'Tu frase semilla es la llave maestra de tu cartera. Cualquiera que la tenga accede a todos tus fondos. No la compartas nunca.'],
    ['¿Qué es la «capitalización» en cripto?', ['El volumen total negociado en 24 h', 'El precio × la oferta en circulación', 'El precio más alto alcanzado', 'El número de carteras que tienen la moneda'], 'Capitalización = precio × oferta en circulación. Representa el valor total de todas las unidades en circulación y sirve para ordenar las criptos.'],
    ['¿Qué es un «honeypot» en cripto?', ['Una cartera que recompensa a sus titulares', 'Un token que puedes comprar pero no vender', 'Una estrategia de rendimiento DeFi', 'Un tipo de cartera fría'], 'Un honeypot es un token fraudulento diseñado para que puedas comprar, mientras un contrato oculto impide vender, robando así los fondos.'],
    ['¿Qué significa «ATH»?', ['Media de máximos negociados', 'Máximo histórico', 'Historial anual del token', 'Centro de trading automatizado'], 'El ATH es el precio más alto que ha alcanzado una cripto. Estar muy por debajo puede indicar una oportunidad o un declive permanente.'],
    ['¿Qué es el «DCA» al invertir?', ['Acceso directo a cripto', 'Aportaciones periódicas: comprar cantidades fijas con regularidad', 'Asignación descentralizada de capital', 'Contabilidad de monedas digitales'], 'El DCA consiste en invertir una cantidad fija a intervalos regulares. Elimina la presión de acertar el momento del mercado.'],
    ['¿Qué es un «rug pull»?', ['Una corrección del mercado', 'Cuando los desarrolladores abandonan el proyecto y se llevan los fondos', 'Un tipo de desplome relámpago', 'Una liquidación forzosa'], 'Un rug pull es cuando los desarrolladores retiran de golpe toda la liquidez o venden sus tokens, dejando a los inversores con activos sin valor.'],
    ['¿Qué significa «diversificación» al invertir?', ['Comprar solo Bitcoin', 'Repartir la inversión entre activos distintos para reducir el riesgo', 'Operar en varios exchanges', 'Tener solo stablecoins'], 'La diversificación reduce el riesgo al garantizar que una sola mala inversión no puede destruir tu cartera. «No pongas todos los huevos en la misma cesta.»'],
    ['¿Qué es un «stop-loss»?', ['Un límite a lo que puedes depositar', 'Una orden prefijada de venta si el precio cae a un nivel, para limitar pérdidas', 'Una comisión que cobran los exchanges', 'Un tipo de contrato inteligente'], 'Un stop-loss vende tu posición automáticamente si el precio baja al nivel que fijaste, evitando pérdidas más allá de lo que toleras.'],
    ['¿Qué significa «dimensionar la posición»?', ['El tamaño de pantalla de las apps de trading', 'Decidir qué parte de la cartera destinas a una operación', 'El número de monedas de una operación', 'El tamaño físico de tu dispositivo Ledger'], 'El dimensionamiento determina cuánto capital arriesgas por operación. La mayoría de los profesionales arriesga solo un 1-2 % de la cartera por posición.'],
    ['Si una cripto cae un 50 %, ¿cuánto tiene que subir para volver al punto de equilibrio?', ['50 %', '75 %', '100 %', '25 %'], 'Tras una caída del 50 %, 100 $ se quedan en 50 $. Para volver a 100 $ tiene que duplicarse: un +100 %. ¡Las pérdidas son asimétricas!'],
    ['¿Qué es la «volatilidad» en cripto?', ['La velocidad de las transacciones', 'La amplitud y la frecuencia de las oscilaciones de precio', 'El número de operaciones diarias', 'La tasa de inflación de la oferta'], 'Una volatilidad alta significa oscilaciones de precio grandes y rápidas. Las criptos suelen ser mucho más volátiles que las acciones o los bonos.'],
    ['¿Qué es la «liquidez» de un token?', ['Lo nuevo que es el token', 'Lo fácil que resulta comprarlo o venderlo sin mover mucho el precio', 'El número de desarrolladores', 'La tasa de recompensa del staking'], 'Una liquidez alta permite ejecutar órdenes grandes sin gran impacto en el precio. Poca liquidez = difícil salir sin hundir la cotización.'],
    ['¿Qué es el «riesgo de concentración»?', ['El peligro de tener demasiados activos', 'El riesgo de tener demasiado capital en un activo o sector', 'El riesgo de usar exchanges centralizados', 'El riesgo de los pools de minería'], 'El riesgo de concentración significa que una sola mala inversión puede dañar gravemente toda la cartera. Procura que ningún activo pase del 20-30 %.'],
    ['¿Qué es el «P&L no realizado»?', ['Los beneficios de operaciones cerradas', 'Ganancias o pérdidas de posiciones abiertas aún no vendidas', 'Comisiones pagadas a los exchanges', 'Los impuestos que debes por las ganancias'], 'El P&L no realizado solo existe sobre el papel: aún no has vendido, así que no está asegurado y todavía puede darse la vuelta.'],
    ['¿Qué es el «FOMO» al operar?', ['Visión fundamental del mercado on-chain', 'Miedo a quedarse fuera: comprar por impulso cuando los precios suben', 'Un tipo de entrada en el libro de órdenes', 'Operación rápida de mercado'], 'El FOMO lleva a comprar cerca de los máximos por miedo a perderse una subida. Es uno de los errores emocionales más comunes y más caros.'],
    ['¿Qué es el «FUD» en cripto?', ['Miedo, incertidumbre y duda: sentimiento negativo', 'Datos fundamentales de utilidad', 'Distribución de desmontaje rápido', 'Derivado de utilidad fija'], 'El FUD describe información negativa, a menudo exagerada, que provoca ventas por pánico. Aprende a separar los hechos del FUD.'],
    ['¿Qué significa «comprar la caída»?', ['Vender cuando el precio sube', 'Comprar un activo después de que su precio haya bajado', 'Un tipo de operación con margen', 'Comprar en máximos históricos'], 'Comprar la caída es adquirir un activo tras un retroceso, esperando que se recupere. Solo funciona si el activo tiene fundamentales sólidos.'],
    ['¿Qué es la «capitulación» en los mercados?', ['Una ruptura hacia nuevos máximos', 'Una venta masiva por pánico al rendirse los inversores', 'Un patrón de vuelta alcista', 'Un tipo de listado en un exchange'], 'La capitulación es cuando los inversores venden presa del pánico sin importar las pérdidas. Suele marcar los suelos del mercado: el punto de «máximo dolor».'],
    ['¿Qué son las «manos de diamante»?', ['Un tipo de cartera física', 'Conservar un activo pese a una volatilidad extrema, sin vender', 'Un protocolo DeFi', 'Una colección de NFT'], 'Manos de diamante significa aguantar caídas enormes sin vender por pánico. Lo contrario de las «manos de papel», que venden al primer signo de pérdida.'],
    ['¿Cuál es la oferta máxima de Bitcoin?', ['100 millones de BTC', '21 millones de BTC', '1000 millones de BTC', 'Ilimitada'], 'Bitcoin tiene un tope estricto de 21 millones de unidades, impuesto por su propio código. Esa escasez es clave en su propuesta de valor.'],
    ['¿Cuál es la principal innovación de Ethereum frente a Bitcoin?', ['Transacciones más rápidas', 'Los contratos inteligentes: acuerdos programables que se autoejecutan', 'Comisiones más bajas', 'Mejor privacidad'], 'Ethereum introdujo los contratos inteligentes en 2015, haciendo posibles las aplicaciones descentralizadas, la DeFi, los NFT y mucho más.'],
    ['¿Qué es una «stablecoin»?', ['Cualquier cripto por debajo de 1 $', 'Una criptomoneda anclada a un activo estable como el dólar', 'Una cripto con baja calificación de volatilidad', 'Una cripto emitida por un gobierno'], 'Las stablecoins (USDT, USDC, DAI) mantienen la paridad con un activo del mundo real. Aportan estabilidad dentro del ecosistema cripto.'],
    ['¿Qué es la «prueba de participación» (PoS)?', ['Minar con ordenadores', 'Los validadores bloquean monedas como garantía para validar transacciones', 'Un proceso de auditoría de seguridad', 'Un tipo de proceso de listado'], 'El PoS sustituye a la minería intensiva en energía. Los validadores depositan monedas como garantía y quien actúa mal pierde su depósito.'],
    ['¿Qué es el «índice de miedo y codicia»?', ['Un informe oficial sobre regulación cripto', 'Una puntuación de sentimiento de 0 (miedo extremo) a 100 (codicia extrema)', 'Una medida de volatilidad solo para Bitcoin', 'Una puntuación de liquidez de exchanges'], 'El índice combina volatilidad, volumen, redes sociales, encuestas y dominancia en una puntuación de sentimiento de 0 a 100.'],
    ['¿Qué es el «slippage» al operar?', ['Una comisión por retiradas rápidas', 'La diferencia entre el precio esperado y el de ejecución real', 'Una caída del servicio del exchange', 'Una penalización de staking'], 'El slippage ocurre cuando tu orden se ejecuta a un precio distinto del esperado: es habitual en tokens con poca liquidez o en órdenes grandes.'],
    ['¿Qué significa «on-chain»?', ['Datos guardados en una base de datos centralizada', 'Transacciones y datos registrados directamente en la blockchain', 'Tokens listados en los grandes exchanges', 'Contratos inteligentes desplegados en la red principal'], 'On-chain se refiere a la actividad registrada en la propia blockchain: totalmente transparente, verificable e inmutable.'],
    ['¿Qué es una «ballena» en cripto?', ['Un esquema de pump and dump', 'Una entidad que posee una cantidad enorme de una criptomoneda', 'Un bot de trading de alta frecuencia', 'Un tipo de operación en un DEX'], 'Las ballenas tienen suficiente cripto como para mover el mercado con sus operaciones. Seguir su actividad puede anticipar la dirección del mercado.'],
    ['¿Qué es una «cartera fría»?', ['Una cartera para guardar stablecoins', 'Una cartera física o de papel sin conexión a internet', 'Una cartera de un exchange', 'Una cartera con los fondos congelados'], 'Las carteras frías (Ledger, Trezor, papel) mantienen las claves privadas sin conexión: inmunes a los hackeos. Lo mejor para el largo plazo.'],
    ['¿Qué es la «2FA»?', ['Autenticación en dos pasos: una segunda verificación', 'Acceso con doble tarifa para traders VIP', 'Doble asignación de financiación', 'Tecnología blockchain de segunda capa'], 'La 2FA añade una segunda verificación (normalmente un código temporal) además de la contraseña. Actívala siempre en los exchanges.'],
    ['¿En cuál de estos es MÁS SEGURO hacer clic?', ['Un correo que dice que tu cuenta está bloqueada', 'Un enlace de la red social hackeada de un amigo', 'La URL oficial del exchange escrita a mano', 'Un anuncio de Google de tu exchange'], 'Escribe siempre las URL a mano o usa marcadores guardados. Las webs de phishing son idénticas a las reales. Correos y anuncios son vectores de ataque habituales.'],
    ['¿Qué ocurre si pierdes tu frase semilla?', ['Puedes recuperarla en el exchange', 'Pierdes para siempre el acceso a tu cartera y a tus fondos', 'El servicio de atención puede restablecerla', 'Puedes regenerarla con tu correo'], 'Las frases semilla se generan una sola vez y no se pueden recuperar. Perderla es perder la cartera para siempre. Guárdala sin conexión y a buen recaudo.'],
    ['¿Qué es el «yield farming»?', ['Minar cripto con energía solar', 'Prestar o aportar liquidez para obtener recompensas', 'Una estrategia de conservación a largo plazo', 'Generar NFT para obtener ingresos pasivos'], 'El yield farming consiste en aportar liquidez o prestar cripto a protocolos a cambio de intereses o de tokens de gobernanza.'],
    ['¿Qué es la «pérdida impermanente»?', ['Una pérdida por un contrato inteligente fallido', 'Una pérdida temporal por aportar liquidez, debida a los cambios de precio', 'Una comisión por retirar el staking antes de tiempo', 'Una pérdida por el hackeo de un DEX'], 'La pérdida impermanente ocurre cuando la proporción de precios de los tokens de tu pool cambia respecto al depósito, reduciendo tu valor frente a solo mantenerlos.'],
    ['¿Qué es un «DEX»?', ['Un exchange descentralizado: se opera mediante contratos inteligentes, sin intermediario', 'Un exchange digital con seguridad extra', 'Un exchange de ejecución directa', 'Un tipo de cartera blockchain'], 'Los DEX (Uniswap, dYdX, PancakeSwap) permiten operar entre pares mediante contratos inteligentes: sin KYC, sin custodio y con autocustodia total.'],
    ['¿Qué es un «objetivo de venta»?', ['El precio máximo que pagaste', 'Un precio planificado de antemano al que piensas recoger beneficios', 'Lo que cobra el exchange por vender', 'Una orden límite que impide vender por debajo del coste'], 'Fijar objetivos de venta antes de comprar quita la emoción de la decisión. Planifica tu salida antes de entrar, no durante la subida.'],
    ['¿Qué significa «recoger beneficios»?', ['Calcular las ganancias totales', 'Vender parte o toda una posición para asegurar las ganancias', 'Pasar las ganancias a una cuenta de ahorro', 'Reinvertir todas las ganancias'], 'Recoger beneficios es vender estando en positivo para asegurar ganancias reales. Muchos ven cómo se esfuman sus beneficios por no vender nunca.'],
    ['¿Cuál es la mejor estrategia en un mercado bajista?', ['Vender todo con pérdidas', 'Usar el máximo apalancamiento para recuperarse antes', 'Aportar poco a poco en activos de calidad y construir para el siguiente ciclo', 'Comprar solo memecoins para recuperarse rápido'], 'Los mercados bajistas premian a quien acumula con disciplina. Aporta poco a poco en tus mayores convicciones, gestiona el riesgo y evita el apalancamiento.'],
    ['¿Qué es «reequilibrar» una cartera?', ['Pasar todos los fondos a un solo activo', 'Devolver las asignaciones a sus pesos objetivo comprando o vendiendo', 'Cerrar todas las posiciones', 'Cambiar de exchange'], 'El reequilibrio restaura tu asignación objetivo. Si el BTC pasa del 50 % al 80 % de la cartera, vendes una parte y compras los activos infraponderados.'],
    ['Si inviertes 1000 $ y se convierten en 3000 $, ¿cuál es tu ROI?', ['200 %', '300 %', '150 %', '100 %'], 'ROI = (final − inicial) ÷ inicial × 100 = (3000 − 1000) ÷ 1000 × 100 = 200 %. El beneficio es de 2000 $ sobre una inversión de 1000 $.'],
    ['¿Qué indica una relación volumen/capitalización superior al 10 %?', ['La cripto está sobrevalorada', 'Alta liquidez y fuerte interés comprador', 'La cripto va a ser retirada del listado', 'Poca confianza de los inversores'], 'Una relación superior al 10 % señala negociación activa y buena liquidez, lo que facilita entrar o salir de posiciones grandes.'],
    ['¿Qué es el «precio de equilibrio»?', ['El precio cuando la cripto se listó por primera vez', 'El precio al que necesitas vender para recuperar tu inversión', 'El precio medio de 52 semanas', 'El precio tras descontar las comisiones'], 'El precio de equilibrio es tu precio medio de compra: el que hay que alcanzar para recuperar lo invertido. Por debajo, estás en pérdidas.'],
  ],
}

// Correct-answer index and category for each question, by position. These are
// logic, not copy: `a` indexes into the options array and `cat` drives the
// category badges. Both stay in one place for all languages.
export const QUESTION_META = [
  { a: 0, cat: 'Crypto' },     { a: 1, cat: 'Crypto' },     { a: 2, cat: 'Crypto' },
  { a: 1, cat: 'DeFi' },       { a: 1, cat: 'Security' },   { a: 1, cat: 'Markets' },
  { a: 1, cat: 'Security' },   { a: 1, cat: 'Markets' },    { a: 1, cat: 'Strategy' },
  { a: 1, cat: 'Security' },   { a: 1, cat: 'Risk' },       { a: 1, cat: 'Risk' },
  { a: 1, cat: 'Risk' },       { a: 2, cat: 'Math' },       { a: 1, cat: 'Risk' },
  { a: 1, cat: 'Markets' },    { a: 1, cat: 'Risk' },       { a: 1, cat: 'Strategy' },
  { a: 1, cat: 'Psychology' }, { a: 0, cat: 'Psychology' }, { a: 1, cat: 'Strategy' },
  { a: 1, cat: 'Psychology' }, { a: 1, cat: 'Psychology' }, { a: 1, cat: 'Crypto' },
  { a: 1, cat: 'Crypto' },     { a: 1, cat: 'Crypto' },     { a: 1, cat: 'Crypto' },
  { a: 1, cat: 'Markets' },    { a: 1, cat: 'Markets' },    { a: 1, cat: 'Crypto' },
  { a: 1, cat: 'Markets' },    { a: 1, cat: 'Security' },   { a: 0, cat: 'Security' },
  { a: 2, cat: 'Security' },   { a: 1, cat: 'Security' },   { a: 1, cat: 'DeFi' },
  { a: 1, cat: 'DeFi' },       { a: 0, cat: 'DeFi' },       { a: 1, cat: 'Strategy' },
  { a: 1, cat: 'Strategy' },   { a: 2, cat: 'Strategy' },   { a: 1, cat: 'Strategy' },
  { a: 0, cat: 'Math' },       { a: 1, cat: 'Markets' },    { a: 1, cat: 'Math' },
]

// Category id → translation key, for the badge shown above a question.
export const CATEGORY_KEYS = {
  Crypto: 'assetCrypto', Markets: 'ayCatMarkets', Security: 'ayCatSecurity',
  Strategy: 'ayCatStrategy', Risk: 'ayCatRisk', Psychology: 'ayCatPsychology',
  Math: 'ayCatMath', DeFi: 'ayCatDefi',
}


// ── Crypto Guessr ──────────────────────────────────────────────────────────
// Coin names, tickers and the decoy options are proper nouns: they are the
// answer the player types, and translating them would make the game
// unanswerable. Only the clues are language-dependent.
export const GUESSR_META = [
  { name: 'Bitcoin', symbol: 'BTC', emoji: '🟠', wrong: ['Ethereum', 'Litecoin', 'Monero'] },
  { name: 'Ethereum', symbol: 'ETH', emoji: '💎', wrong: ['Solana', 'Cardano', 'Avalanche'] },
  { name: 'Solana', symbol: 'SOL', emoji: '🌊', wrong: ['Ethereum', 'Avalanche', 'Polkadot'] },
  { name: 'Dogecoin', symbol: 'DOGE', emoji: '🐶', wrong: ['Shiba Inu', 'Floki', 'SafeMoon'] },
  { name: 'XRP', symbol: 'XRP', emoji: '💧', wrong: ['Stellar', 'Litecoin', 'SWIFT'] },
  { name: 'Cardano', symbol: 'ADA', emoji: '🔵', wrong: ['Polkadot', 'Algorand', 'Tezos'] },
  { name: 'Chainlink', symbol: 'LINK', emoji: '🔗', wrong: ['The Graph', 'Band Protocol', 'API3'] },
  { name: 'Polkadot', symbol: 'DOT', emoji: '⚫', wrong: ['Cosmos', 'Avalanche', 'Kusama'] },
  { name: 'Avalanche', symbol: 'AVAX', emoji: '🔺', wrong: ['Solana', 'Fantom', 'Near Protocol'] },
  { name: 'Uniswap', symbol: 'UNI', emoji: '🦄', wrong: ['SushiSwap', 'Curve', 'Balancer'] },
  { name: 'Shiba Inu', symbol: 'SHIB', emoji: '🐕', wrong: ['Dogecoin', 'Floki', 'Baby Doge'] },
  { name: 'Tether', symbol: 'USDT', emoji: '💵', wrong: ['USD Coin', 'DAI', 'BUSD'] },
  { name: 'Litecoin', symbol: 'LTC', emoji: '🥈', wrong: ['Bitcoin Cash', 'Bitcoin SV', 'Dash'] },
  { name: 'Cosmos', symbol: 'ATOM', emoji: '🌌', wrong: ['Polkadot', 'Algorand', 'Harmony'] },
  { name: 'NEAR Protocol', symbol: 'NEAR', emoji: '🌐', wrong: ['Fantom', 'Harmony', 'Algorand'] },
]

export const GUESSR_CLUES = {
  en: [
    ['I was created in 2009 by an anonymous person', 'My supply is capped at 21 million coins', 'I pioneered the blockchain technology', 'I am the largest cryptocurrency by market cap', 'My symbol comes from the first letter of my name'],
    ['I introduced smart contracts to the world', 'Vitalik Buterin co-created me in 2015', 'I transitioned from Proof of Work to Proof of Stake', 'DeFi and NFTs were born on my network', 'Gas fees are paid in my native token'],
    ['I can process over 65,000 transactions per second', 'I use a Proof of History consensus mechanism', 'I am known for extremely low transaction fees', 'I was founded by Anatoly Yakovenko in 2020', 'FTX\'s collapse caused my price to crash heavily'],
    ['I started as an internet meme in 2013', 'My logo features a Shiba Inu dog', 'Elon Musk tweets about me frequently', 'I was created by Billy Markus and Jackson Palmer', 'I have no supply cap — new coins are minted every block'],
    ['I was designed for fast cross-border payments', 'Ripple Labs created and holds a large supply of me', 'Banks use my network for international settlements', 'The SEC sued my creator claiming I am a security', 'Transactions on my network settle in 3-5 seconds'],
    ['My name comes from an Italian mathematician', 'Charles Hoskinson co-founded Ethereum before creating me', 'I use peer-reviewed academic research for development', 'My native token is named after Ada Lovelace', 'I use the Ouroboros Proof of Stake protocol'],
    ['I connect smart contracts to real-world data', 'I am the leading decentralized oracle network', 'Without me, smart contracts would be blind to off-chain events', 'My nodes are run by independent node operators', 'Price feeds for DeFi protocols rely heavily on me'],
    ['Gavin Wood, an Ethereum co-founder, created me', 'I enable different blockchains to communicate with each other', 'Projects build on me by renting "parachain" slots', 'My relay chain coordinates the whole network', 'I use a nominated Proof of Stake consensus'],
    ['I can finalize transactions in under 2 seconds', 'I launched in 2020 and quickly became an Ethereum rival', 'I have three built-in blockchains: X, P, and C chains', 'I use the Avalanche consensus protocol', 'My name suggests speed and force'],
    ['My mascot is a mythical horse with a horn', 'I am the most popular decentralized exchange on Ethereum', 'I use an Automated Market Maker model', 'I replaced order books with liquidity pools', 'Hayden Adams launched me in 2018'],
    ['I was created anonymously in 2020 as a DOGE competitor', 'Half my supply was sent to Vitalik Buterin who burned most of it', 'My community calls themselves the "SHIB Army"', 'I trade at fractions of a cent with trillions in supply', 'I have a DEX called ShibaSwap'],
    ['I am pegged 1:1 to the US Dollar', 'I am the largest stablecoin by market cap', 'Tether Limited issues and backs me', 'I am the most traded cryptocurrency by volume', 'Controversy surrounds whether I am fully backed by reserves'],
    ['Charlie Lee, a former Google engineer, created me', 'I was launched in 2011 as the "silver to Bitcoin\'s gold"', 'I have a max supply of 84 million coins', 'My block time is 4x faster than Bitcoin', 'I use the Scrypt hashing algorithm'],
    ['My vision is an "Internet of Blockchains"', 'I let independent chains communicate via IBC protocol', 'Tendermint BFT is my core consensus engine', 'My hub-and-zone architecture powers cross-chain transfers', 'Jae Kwon and Ethan Buchman co-founded me'],
    ['I use human-readable account names like "alice.near"', 'My sharding approach is called Nightshade', 'I focus on developer and user experience above all', 'I am carbon neutral and environmentally friendly', 'Aurora, an Ethereum-compatible layer, runs on top of me'],
  ],
  ar: [
    ['أُنشئت عام 2009 على يد شخص مجهول', 'معروضي محدود بـ 21 مليون وحدة', 'أنا رائدة تقنية البلوك تشين', 'أنا أكبر عملة رقمية من حيث القيمة السوقية', 'رمزي مأخوذ من أول حرف في اسمي'],
    ['أنا من قدّم العقود الذكية إلى العالم', 'شارك فيتاليك بوتيرين في إنشائي عام 2015', 'انتقلت من إثبات العمل إلى إثبات الحصة', 'وُلد التمويل اللامركزي والرموز غير القابلة للاستبدال على شبكتي', 'تُدفع رسوم الغاز بعملتي الأصلية'],
    ['أستطيع معالجة أكثر من 65,000 معاملة في الثانية', 'أستخدم آلية إجماع تُسمّى إثبات التاريخ', 'أشتهر برسوم معاملات منخفضة للغاية', 'أسّسني أناتولي ياكوفينكو عام 2020', 'تسبّب انهيار FTX في هبوط حادّ لسعري'],
    ['بدأت كنكتة على الإنترنت عام 2013', 'شعاري يحمل صورة كلب من فصيلة شيبا إينو', 'يغرّد إيلون ماسك عنّي كثيراً', 'أنشأني بيلي ماركوس وجاكسون بالمر', 'ليس لمعروضي سقف — تُسكّ عملات جديدة مع كل كتلة'],
    ['صُمّمت للمدفوعات السريعة عبر الحدود', 'أنشأتني Ripple Labs وتحتفظ بكمية كبيرة منّي', 'تستخدم البنوك شبكتي للتسويات الدولية', 'قاضت هيئة الأوراق المالية منشئي بدعوى أنني ورقة مالية', 'تُسوّى المعاملات على شبكتي خلال 3 إلى 5 ثوانٍ'],
    ['اسمي مأخوذ من عالم رياضيات إيطالي', 'شارك تشارلز هوسكينسون في تأسيس إيثيريوم قبل أن ينشئني', 'أعتمد في تطويري على بحث أكاديمي محكَّم', 'سُمّي رمزي الأصلي تيمّناً بآدا لوفلايس', 'أستخدم بروتوكول أوروبوروس لإثبات الحصة'],
    ['أربط العقود الذكية ببيانات العالم الحقيقي', 'أنا شبكة الأوراكل اللامركزية الرائدة', 'بدوني ستكون العقود الذكية عمياء عمّا يجري خارج السلسلة', 'يشغّل عُقَدي مشغّلون مستقلّون', 'تعتمد تغذيات الأسعار في بروتوكولات التمويل اللامركزي عليّ بشدّة'],
    ['أنشأني غافين وود، أحد مؤسّسي إيثيريوم', 'أتيح لسلاسل بلوك تشين مختلفة أن تتواصل فيما بينها', 'تبني المشاريع عليّ باستئجار فتحات «باراتشين»', 'تنسّق سلسلة الترحيل لديّ الشبكة كلها', 'أستخدم إجماع إثبات الحصة المرشَّح'],
    ['أستطيع إنهاء المعاملات في أقل من ثانيتين', 'أُطلقت عام 2020 وسرعان ما صرت منافساً لإيثيريوم', 'لديّ ثلاث سلاسل مدمجة: X وP وC', 'أستخدم بروتوكول إجماع أفالانش', 'اسمي يوحي بالسرعة والقوة'],
    ['تميمتي حصان أسطوري بقرن واحد', 'أنا أشهر منصّة لامركزية على إيثيريوم', 'أستخدم نموذج صانع السوق الآلي', 'استبدلت دفاتر الأوامر بمجمّعات السيولة', 'أطلقني هايدن آدامز عام 2018'],
    ['أُنشئت بشكل مجهول عام 2020 كمنافس لدوجكوين', 'أُرسل نصف معروضي إلى فيتاليك بوتيرين فأحرق معظمه', 'يسمّي مجتمعي نفسه «جيش شيبا»', 'أُتداول بأجزاء من السنت ومعروضي بالتريليونات', 'لديّ منصّة لامركزية تُسمّى ShibaSwap'],
    ['أنا مربوط بالدولار الأمريكي بنسبة 1:1', 'أنا أكبر عملة مستقرة من حيث القيمة السوقية', 'تصدرني وتدعمني شركة Tether Limited', 'أنا أكثر العملات الرقمية تداولاً من حيث الحجم', 'يحيط الجدل بمسألة ما إذا كنت مغطّى بالكامل بالاحتياطيات'],
    ['أنشأني تشارلي لي، وهو مهندس سابق في جوجل', 'أُطلقت عام 2011 بوصفي «الفضة مقابل ذهب البيتكوين»', 'حدّ معروضي الأقصى 84 مليون وحدة', 'زمن كتلتي أسرع أربع مرات من البيتكوين', 'أستخدم خوارزمية التجزئة Scrypt'],
    ['رؤيتي هي «إنترنت سلاسل البلوك تشين»', 'أتيح للسلاسل المستقلّة أن تتواصل عبر بروتوكول IBC', 'محرّك إجماعي الأساسي هو Tendermint BFT', 'بنيتي القائمة على المراكز والمناطق تشغّل التحويلات بين السلاسل', 'شارك جاي كوون وإيثان بوكمان في تأسيسي'],
    ['أستخدم أسماء حسابات مقروءة للبشر مثل «alice.near»', 'يُسمّى أسلوبي في التجزئة Nightshade', 'أركّز قبل كل شيء على تجربة المطوّر والمستخدم', 'أنا محايد كربونياً وصديق للبيئة', 'تعمل Aurora، وهي طبقة متوافقة مع إيثيريوم، فوقي'],
  ],
  fr: [
    ['J’ai été créé en 2009 par une personne anonyme', 'Mon offre est plafonnée à 21 millions d’unités', 'J’ai inauguré la technologie blockchain', 'Je suis la plus grosse cryptomonnaie par capitalisation', 'Mon symbole vient de la première lettre de mon nom'],
    ['J’ai apporté les contrats intelligents au monde', 'Vitalik Buterin m’a cocréé en 2015', 'Je suis passé de la preuve de travail à la preuve d’enjeu', 'La DeFi et les NFT sont nés sur mon réseau', 'Les frais de gas se paient dans mon jeton natif'],
    ['Je peux traiter plus de 65 000 transactions par seconde', 'J’utilise un consensus de preuve d’historique', 'Je suis connu pour des frais de transaction très bas', 'J’ai été fondé par Anatoly Yakovenko en 2020', 'L’effondrement de FTX a fait chuter lourdement mon cours'],
    ['J’ai commencé comme un mème internet en 2013', 'Mon logo représente un chien Shiba Inu', 'Elon Musk tweete souvent à mon sujet', 'J’ai été créé par Billy Markus et Jackson Palmer', 'Mon offre n’a pas de plafond — de nouvelles unités sont émises à chaque bloc'],
    ['J’ai été conçu pour des paiements transfrontaliers rapides', 'Ripple Labs m’a créé et en détient une grande partie', 'Les banques utilisent mon réseau pour leurs règlements internationaux', 'La SEC a poursuivi mon créateur en affirmant que je suis un titre financier', 'Les transactions sur mon réseau se règlent en 3 à 5 secondes'],
    ['Mon nom vient d’un mathématicien italien', 'Charles Hoskinson a cofondé Ethereum avant de me créer', 'Je me développe sur la base de recherches académiques évaluées par les pairs', 'Mon jeton natif porte le nom d’Ada Lovelace', 'J’utilise le protocole de preuve d’enjeu Ouroboros'],
    ['Je relie les contrats intelligents aux données du monde réel', 'Je suis le principal réseau d’oracles décentralisés', 'Sans moi, les contrats intelligents seraient aveugles aux événements hors chaîne', 'Mes nœuds sont tenus par des opérateurs indépendants', 'Les flux de prix des protocoles DeFi dépendent largement de moi'],
    ['Gavin Wood, cofondateur d’Ethereum, m’a créé', 'Je permets à différentes blockchains de communiquer entre elles', 'Les projets construisent sur moi en louant des créneaux « parachaînes »', 'Ma chaîne de relais coordonne tout le réseau', 'J’utilise un consensus de preuve d’enjeu nominée'],
    ['Je peux finaliser une transaction en moins de 2 secondes', 'J’ai été lancé en 2020 et suis vite devenu un rival d’Ethereum', 'J’ai trois blockchains intégrées : les chaînes X, P et C', 'J’utilise le protocole de consensus Avalanche', 'Mon nom évoque la vitesse et la force'],
    ['Ma mascotte est un cheval mythique à corne', 'Je suis l’échange décentralisé le plus populaire sur Ethereum', 'J’utilise un modèle de teneur de marché automatisé', 'J’ai remplacé les carnets d’ordres par des pools de liquidité', 'Hayden Adams m’a lancé en 2018'],
    ['J’ai été créé anonymement en 2020 comme concurrent du DOGE', 'La moitié de mon offre a été envoyée à Vitalik Buterin, qui en a brûlé l’essentiel', 'Ma communauté se surnomme la « SHIB Army »', 'Je m’échange à des fractions de cent, avec une offre en milliers de milliards', 'J’ai un DEX appelé ShibaSwap'],
    ['Je suis arrimé 1:1 au dollar américain', 'Je suis le plus gros stablecoin par capitalisation', 'Tether Limited m’émet et me garantit', 'Je suis la cryptomonnaie la plus échangée en volume', 'La controverse persiste sur le fait que je sois intégralement adossé à des réserves'],
    ['Charlie Lee, ancien ingénieur de Google, m’a créé', 'J’ai été lancé en 2011 comme « l’argent face à l’or du Bitcoin »', 'Mon offre maximale est de 84 millions d’unités', 'Mon temps de bloc est 4 fois plus rapide que celui du Bitcoin', 'J’utilise l’algorithme de hachage Scrypt'],
    ['Ma vision est un « Internet des blockchains »', 'Je permets à des chaînes indépendantes de communiquer via le protocole IBC', 'Tendermint BFT est mon moteur de consensus principal', 'Mon architecture en hubs et zones alimente les transferts inter-chaînes', 'Jae Kwon et Ethan Buchman m’ont cofondé'],
    ['J’utilise des noms de comptes lisibles comme « alice.near »', 'Mon approche du sharding s’appelle Nightshade', 'Je privilégie avant tout l’expérience des développeurs et des utilisateurs', 'Je suis neutre en carbone et respectueux de l’environnement', 'Aurora, une couche compatible Ethereum, fonctionne sur moi'],
  ],
  es: [
    ['Fui creado en 2009 por una persona anónima', 'Mi oferta está limitada a 21 millones de unidades', 'Fui pionero de la tecnología blockchain', 'Soy la mayor criptomoneda por capitalización', 'Mi símbolo viene de la primera letra de mi nombre'],
    ['Traje los contratos inteligentes al mundo', 'Vitalik Buterin me cocreó en 2015', 'Pasé de prueba de trabajo a prueba de participación', 'La DeFi y los NFT nacieron en mi red', 'Las comisiones de gas se pagan en mi token nativo'],
    ['Puedo procesar más de 65.000 transacciones por segundo', 'Uso un consenso de prueba de historia', 'Soy conocido por unas comisiones bajísimas', 'Me fundó Anatoly Yakovenko en 2020', 'El colapso de FTX hundió con fuerza mi precio'],
    ['Empecé como un meme de internet en 2013', 'Mi logo lleva un perro Shiba Inu', 'Elon Musk tuitea sobre mí a menudo', 'Me crearon Billy Markus y Jackson Palmer', 'No tengo tope de oferta: se acuñan monedas nuevas en cada bloque'],
    ['Me diseñaron para pagos transfronterizos rápidos', 'Ripple Labs me creó y posee una gran parte de mi oferta', 'Los bancos usan mi red para liquidaciones internacionales', 'La SEC demandó a mi creador alegando que soy un valor', 'Las transacciones en mi red se liquidan en 3-5 segundos'],
    ['Mi nombre viene de un matemático italiano', 'Charles Hoskinson cofundó Ethereum antes de crearme', 'Me desarrollo a partir de investigación académica revisada por pares', 'Mi token nativo se llama así por Ada Lovelace', 'Uso el protocolo de prueba de participación Ouroboros'],
    ['Conecto los contratos inteligentes con datos del mundo real', 'Soy la principal red de oráculos descentralizados', 'Sin mí, los contratos inteligentes estarían ciegos a lo que pasa fuera de la cadena', 'Mis nodos los gestionan operadores independientes', 'Los feeds de precios de los protocolos DeFi dependen mucho de mí'],
    ['Me creó Gavin Wood, cofundador de Ethereum', 'Permito que distintas blockchains se comuniquen entre sí', 'Los proyectos construyen sobre mí alquilando ranuras «parachain»', 'Mi cadena de relé coordina toda la red', 'Uso un consenso de prueba de participación nominada'],
    ['Puedo finalizar transacciones en menos de 2 segundos', 'Me lancé en 2020 y pronto fui rival de Ethereum', 'Tengo tres blockchains integradas: las cadenas X, P y C', 'Uso el protocolo de consenso Avalanche', 'Mi nombre sugiere velocidad y fuerza'],
    ['Mi mascota es un caballo mítico con cuerno', 'Soy el exchange descentralizado más popular de Ethereum', 'Uso un modelo de creador de mercado automatizado', 'Sustituí los libros de órdenes por pools de liquidez', 'Hayden Adams me lanzó en 2018'],
    ['Me crearon de forma anónima en 2020 como competidor de DOGE', 'La mitad de mi oferta se envió a Vitalik Buterin, que quemó casi toda', 'Mi comunidad se hace llamar el «SHIB Army»', 'Cotizo a fracciones de céntimo y mi oferta es de billones', 'Tengo un DEX llamado ShibaSwap'],
    ['Estoy anclado 1:1 al dólar estadounidense', 'Soy la mayor stablecoin por capitalización', 'Me emite y respalda Tether Limited', 'Soy la criptomoneda más negociada por volumen', 'Hay polémica sobre si estoy totalmente respaldado por reservas'],
    ['Me creó Charlie Lee, antiguo ingeniero de Google', 'Me lancé en 2011 como «la plata frente al oro de Bitcoin»', 'Mi oferta máxima es de 84 millones de unidades', 'Mi tiempo de bloque es 4 veces más rápido que el de Bitcoin', 'Uso el algoritmo de hash Scrypt'],
    ['Mi visión es una «internet de las blockchains»', 'Permito que cadenas independientes se comuniquen mediante el protocolo IBC', 'Tendermint BFT es mi motor de consenso principal', 'Mi arquitectura de hubs y zonas impulsa las transferencias entre cadenas', 'Me cofundaron Jae Kwon y Ethan Buchman'],
    ['Uso nombres de cuenta legibles como «alice.near»', 'Mi enfoque de sharding se llama Nightshade', 'Priorizo por encima de todo la experiencia de desarrolladores y usuarios', 'Soy neutro en carbono y respetuoso con el medio ambiente', 'Aurora, una capa compatible con Ethereum, funciona sobre mí'],
  ],
}

/** The question bank for one language, recombined with its shared metadata. */
export function questions(lang) {
  const text = pick(QUESTION_TEXT, lang)
  return QUESTION_META.map((meta, i) => {
    // Fall back per entry, not per language: a partially translated bank
    // should show the translated questions it has, not drop to English whole.
    const [q, opts, exp] = text[i] ?? QUESTION_TEXT.en[i]
    // A translation with the wrong number of options would leave `a` pointing
    // at the wrong string, so the English entry wins rather than silently
    // marking the wrong answer correct.
    const safe = opts?.length === QUESTION_TEXT.en[i][1].length ? opts : QUESTION_TEXT.en[i][1]
    return { q, opts: safe, exp, a: meta.a, cat: meta.cat }
  })
}

/** Guessr coins for one language: names stay English, clues do not. */
export function guessrCoins(lang) {
  const clues = pick(GUESSR_CLUES, lang)
  return GUESSR_META.map((meta, i) => ({
    ...meta,
    clues: clues[i] ?? GUESSR_CLUES.en[i],
  }))
}
