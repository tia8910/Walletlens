// Academy content, per language: the investment hacks.
//
// This does not live in i18n.js because it is not UI labels: a hack is a
// category, a headline and a paragraph that go together, and flattening that
// into sibling keys would make a mismatched pair easy to introduce. Same
// reasoning as src/legal/*.
//
// Every language defines every hack, in the same order, enforced by
// academyContent.test.js. The order matters: the video catalog
// (academyVideos.js) and the push worker's hack rotation index by position.

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
  de: [
    ['In Dritteln kaufen, nicht alles auf einmal', 'Teilen Sie Ihren geplanten Kauf in 3 gleiche Teile. Ein Drittel jetzt, ein Drittel bei 10 % Rücksetzer, ein Drittel bei 20 %. Sie werden den Markt nie perfekt timen — aber Sie können jedes Mal zu einem besseren Durchschnitt einsteigen.'],
    ['Den Verluststopp vor dem Kauf festlegen', 'Entscheiden Sie VOR dem Einstieg, wie viel Sie höchstens verlieren wollen. Schreiben Sie es auf. Erreicht der Kurs diese Marke, wird verkauft — ohne Zweifel. Ein emotionaler Stopp ist gar kein Stopp.'],
    ['Bei schwankenden Anlagen schlägt der Sparplan die Einmalanlage', 'Investieren Sie jede Woche oder jeden Monat einen festen Betrag, unabhängig vom Kurs. Mit der Zeit kaufen Sie mehr, wenn die Kurse niedrig sind, und weniger, wenn sie hoch sind — Ihre Durchschnittskosten sinken automatisch.'],
    ['Die 5-Prozent-Regel für neue Positionen', 'Stecken Sie nie mehr als 5 % Ihres Portfolios in eine neue, unerprobte Position. Verzehnfacht sie sich, gewinnen Sie trotzdem groß. Geht sie auf null, überlebt Ihr Portfolio. Lassen Sie Gewinner sich größere Anteile verdienen.'],
    ['Gewinne auf dem Weg nach oben mitnehmen, nicht am Hoch', 'Verkaufen Sie 25 % einer Position, wenn sie sich verdoppelt. Weitere 25 %, wenn sie sich verdreifacht. Sie werden nie exakt am Hoch verkaufen — aber Gewinne auf dem Weg nach oben sichern echte Erträge.'],
    ['Kurse höchstens zweimal am Tag prüfen', 'Häufiges Nachsehen löst emotionale Entscheidungen aus. Setzen Sie Kursalarme für wichtige Marken und schauen Sie nur zu festen Zeiten selbst nach. Langeweile ist Ihr schlechtester Handelsberater.'],
    ['Quartalsweise neu gewichten, nicht aus dem Impuls heraus', 'Setzen Sie sich alle 3 Monate eine Erinnerung, das Portfolio auf die Zielgewichte zurückzuführen. Gewinner verkaufen und Nachzügler kaufen erzwingt Disziplin — Sie verkaufen hoch und kaufen niedrig, ganz automatisch.'],
    ['Immer 10 bis 20 % in Stablecoins halten', 'Eine dauerhafte Stablecoin-Reserve bedeutet, dass Sie einen Crash immer kaufen können. Sie gibt auch psychologische Ruhe — Sie können einen Absturz gelassen ansehen, weil Sie Pulver trocken haben.'],
    ['Die 48-Stunden-Regel für Panikverkäufe', 'Wenn Sie in einem Absturz unbedingt verkaufen wollen, warten Sie 48 Stunden. Wollen Sie danach in Ruhe noch immer verkaufen, dann verkaufen Sie. Die meisten Panikimpulse lösen sich binnen 24 Stunden auf.'],
    ['On-Chain-Daten prüfen, bevor Sie Charts vertrauen', 'Kurse lassen sich manipulieren. On-Chain-Kennzahlen (aktive Adressen, Transaktionsvolumen, Abflüsse von Börsen) zeigen, was Nutzer tatsächlich tun — nicht, was Händler Sie glauben machen wollen.'],
    ['Konzentration ist ein Merkmal, kein Fehler', 'Das meiste Vermögen entsteht aus 1 bis 3 Überzeugungswetten, nicht aus 30 gestreuten. Halten Sie 3 bis 5 Kernpositionen mit 70 % Ihres Portfolios. Streuung verhindert Verluste; Konzentration schafft Vermögen.'],
    ['Volumen bestätigt Ausbrüche', 'Ein Ausbruch bei niedrigem Volumen ist wahrscheinlich unecht. Warten Sie auf einen Ausbruch mit dem doppelten Durchschnittsvolumen. Das bestätigt echtes Kaufinteresse statt einer kurzen Enge.'],
    ['Führen Sie Ihre Einstandskurse gewissenhaft', 'Wissen Sie immer genau, was Sie für jede Position bezahlt haben. Ohne das können Sie weder echte Gewinne berechnen noch rational verkaufen noch korrekt Steuern erklären. Erfassen Sie jeden Trade in WalletLens.'],
    ['Kein Hebel, solange Sie ohne ihn nicht profitabel sind', 'Hebel verstärkt Gewinne UND Verluste. Wer im Kassamarkt nicht beständig verdient, beschleunigt mit Hebel nur die Verluste. Beherrschen Sie zuerst die Grundlagen.'],
    ['Ihre Überzeugung bestimmt die Positionsgröße', 'Bemessen Sie Positionen danach, wie gründlich Sie recherchiert haben. Hohe Überzeugung = größere Position. Auf Twitter aufgeschnappt = höchstens 1 %. Überzeugung verdient man sich durch Recherche, nicht durch Hoffnung.'],
    ['Der Markt belohnt Geduld, nicht Betriebsamkeit', 'Die meisten profitablen Krypto-Anleger machen weniger als 20 Trades im Jahr. Jeder Trade kostet Reibung (Gebühren, Steuerereignisse, emotionaler Preis). Nichts zu tun ist oft der Trade mit der höchsten Überzeugung.'],
    ['Folgen Sie dem smarten Geld, nicht der Erzählung', 'Beobachten Sie, wo Institutionen und große Wallets aufbauen. Wal-Alarme, On-Chain-Tracker und Dark-Pool-Daten zeigen, wohin echtes Geld fließt — oft Wochen bevor der Kurs reagiert.'],
    ['Der Angst-und-Gier-Index als Gegenindikator', 'Extreme Angst (0 bis 25) war historisch die beste Zeit zum Aufbauen. Extreme Gier (75 bis 100) ist der Moment, in dem smartes Geld leise aussteigt. Seien Sie gierig, wenn andere ängstlich sind — Buffetts Regel gilt auch für Krypto.'],
  ],
  it: [
    ['Compra in tre parti, non tutto in una volta', 'Dividi l’acquisto previsto in 3 parti uguali. Un terzo ora, un terzo a un ribasso del 10%, un terzo a un ribasso del 20%. Non indovinerai mai il momento perfetto, ma ogni volta migliorerai il prezzo medio.'],
    ['Fissa lo stop loss prima di comprare', 'Decidi il massimo che sei disposto a perdere PRIMA di entrare. Scrivilo. Quando il prezzo tocca quel livello, vendi — senza ripensamenti. Uno stop emotivo non è uno stop.'],
    ['Sugli asset volatili il piano di accumulo batte l’investimento unico', 'Investi un importo fisso ogni settimana o mese, qualunque sia il prezzo. Col tempo compri di più quando i prezzi sono bassi e meno quando sono alti, abbassando automaticamente il costo medio.'],
    ['La regola del 5% per le nuove posizioni', 'Non mettere mai più del 5% del portafoglio in una posizione nuova e non collaudata. Se fa 10 volte, guadagni comunque molto. Se va a zero, il portafoglio sopravvive. Lascia che siano i vincenti a guadagnarsi pesi maggiori.'],
    ['Prendi profitto salendo, non al massimo', 'Vendi il 25% di una posizione quando raddoppia. Un altro 25% quando triplica. Non venderai mai esattamente sul massimo, ma prendere profitto lungo la salita ti garantisce guadagni reali.'],
    ['Non guardare i prezzi più di due volte al giorno', 'Controllare di continuo innesca decisioni emotive. Imposta avvisi sui livelli chiave e guarda di persona solo a orari stabiliti. La noia è il peggior consulente di trading.'],
    ['Ribilancia ogni trimestre, non per reazione', 'Metti un promemoria ogni 3 mesi per riportare il portafoglio ai pesi voluti. Vendere i vincenti e comprare i ritardatari impone disciplina: vendi alto e compri basso in automatico.'],
    ['Tieni sempre il 10-20% in stablecoin', 'Una riserva permanente in stablecoin significa poter sempre comprare durante un crollo. Dà anche serenità: puoi guardare un crollo con calma sapendo di avere munizioni.'],
    ['La regola delle 48 ore per le vendite di panico', 'Quando durante un crollo vuoi disperatamente vendere, aspetta 48 ore. Se dopo averci ragionato con calma vuoi ancora vendere, vendi. Quasi tutti gli impulsi di panico svaniscono entro 24 ore.'],
    ['Controlla i dati on-chain prima di fidarti dei grafici', 'Il prezzo si può manipolare. Le metriche on-chain (indirizzi attivi, volume di transazioni, deflussi dagli exchange) dicono che cosa fanno davvero gli utenti, non ciò che i trader vogliono farti credere.'],
    ['La concentrazione è una scelta, non un difetto', 'Gran parte della ricchezza nasce da 1-3 scommesse di forte convinzione, non da 30 diversificate. Tieni 3-5 posizioni principali pari al 70% del portafoglio. La diversificazione evita le perdite; la concentrazione crea ricchezza.'],
    ['Il volume conferma le rotture', 'Una rottura su volumi bassi è probabilmente falsa. Aspetta una rottura accompagnata da un volume doppio della media: conferma un interesse d’acquisto reale, non una stretta momentanea.'],
    ['Tieni il prezzo di carico con scrupolo', 'Sappi sempre esattamente quanto hai pagato ogni posizione. Senza, non puoi calcolare utili reali, decidere razionalmente quando vendere né dichiarare correttamente. Registra ogni operazione in WalletLens.'],
    ['Niente leva finché non guadagni senza', 'La leva amplifica i guadagni E le perdite. Se non guadagni con costanza sul mercato a pronti, la leva accelererà soltanto le perdite. Prima le basi.'],
    ['La tua convinzione decide la dimensione della posizione', 'Dimensiona le posizioni in base a quanto le hai studiate. Convinzione alta = posizione più grande. Sentito su Twitter = massimo 1%. La convinzione si guadagna con la ricerca, non con la speranza.'],
    ['Il mercato premia la pazienza, non l’attività', 'La maggior parte degli investitori cripto in profitto fa meno di 20 operazioni l’anno. Ogni operazione ha un attrito (commissioni, eventi fiscali, costo emotivo). Spesso l’inattività è l’operazione più convinta.'],
    ['Segui il capitale intelligente, non la narrazione', 'Osserva dove accumulano istituzioni e grandi wallet. Avvisi sulle balene, tracker on-chain e dati dei dark pool rivelano dove va il denaro vero — spesso settimane prima che il prezzo reagisca.'],
    ['L’indice di paura e avidità come segnale contrarian', 'La paura estrema (0-25) è storicamente il momento migliore per accumulare. L’avidità estrema (75-100) è quando il capitale intelligente esce in silenzio. Sii avido quando gli altri hanno paura: la regola di Buffett vale anche per le cripto.'],
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

/** Hacks for one language, in display order, with their icon and category. */
export function hacks(lang) {
  const text = pick(HACK_TEXT, lang)
  return HACK_META.map((meta, i) => ({
    ...meta,
    title: text[i]?.[0] ?? HACK_TEXT.en[i][0],
    body: text[i]?.[1] ?? HACK_TEXT.en[i][1],
  }))
}
