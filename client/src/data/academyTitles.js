// Titles ready for the next Shorts. Upload a video under any title here and
// the Update Videos workflow links it to its lesson by itself: the takeaway
// under it, the course shelf it sits on and its "Try it" button come from the
// row it is in. A title stays hidden in the app until its video is on the
// channel. Add a title by adding it to a row; never rename one already used,
// or the next sync will not find its video.
//
// One row per lesson in HACK_TEXT (academyContent.js), already written in every
// app language: [hack, course, act, emoji, English titles, Arabic titles].
const ROWS = [
  [0, 'trading', 'alerts', '🎯',
    ['Never Go All In', 'Three Bullets, Not One', 'The Thirds Plan', 'Scared to Buy the Dip?', 'One Third at a Time'],
    ['لا تدخل بكل أموالك مرة واحدة', 'اشترِ على ثلاث دفعات']],
  [1, 'risk', 'alerts', '🪂',
    ['Set the Exit First', 'The Exit Before the Entry', 'Where Do You Get Out?', 'The Floor You Choose', 'Decide Your Loss Before You Buy'],
    ['حدد مخرجك قبل أن تشتري', 'وقف الخسارة أولاً']],
  [2, 'trading', 'coach', '📅',
    ['The Boring Way to Win', 'Same Day Every Month', 'Stop Timing the Market', 'The $100 a Month Habit', 'Lump Sum or Little by Little?'],
    ['الشراء الشهري يهزم التوقيت', '١٠٠ دولار كل شهر']],
  [3, 'risk', 'rebalance', '🧮',
    ['Never Bet the Farm', 'Small Bets, Long Life', 'How Big Should a Bet Be?', 'Your First Buy Should Be Small'],
    ['لا تراهن بكل شيء', 'قاعدة الخمسة بالمئة']],
  [4, 'trading', 'signals', '💰',
    ['Nobody Sells the Top', 'Ring the Register', 'Pay Yourself on the Way Up', 'The Ladder Out', 'When to Take Profit'],
    ['اجنِ أرباحك وهي تصعد', 'لا أحد يبيع في القمة']],
  [5, 'mindset', 'alerts', '📵',
    ['Put the Phone Down', 'The Refresh Trap', 'Stop Watching the Chart', '100 Price Checks a Day', 'Your Portfolio Does Not Need You Today'],
    ['ضع الهاتف جانباً', 'فخ تحديث الأسعار']],
  [6, 'risk', 'rebalance', '⚖️',
    ['Four Dates a Year', 'Trim the Winners', 'The Portfolio Tune Up', 'Drift Happens', 'Rebalance on a Calendar, Not a Feeling'],
    ['أعد التوازن أربع مرات في السنة', 'قص الرابحين']],
  [7, 'risk', 'rebalance', '🏦',
    ['Dry Powder', 'Cash Is a Position', 'Ready When the Dip Comes', 'Why I Always Hold Stablecoins'],
    ['السيولة مركز استثماري', 'جاهز عندما يهبط السوق']],
  [8, 'mindset', 'coach', '⏳',
    ['Sleep On It', 'Two Nights Before You Sell', 'Do Not Sell Today', 'The Panic Sell Timer'],
    ['نم عليها قبل أن تبيع', 'لا تبع اليوم']],
  [9, 'trading', 'signals', '⛓️',
    ['Check on-chain data before trusting charts', 'Charts Lie, Wallets Don’t', 'Follow the Wallets', 'What the Blockchain Knows', 'Exchange Inflows Warning'],
    ['البيانات على السلسلة قبل الرسم البياني', 'تتبع المحافظ']],
  [10, 'risk', 'rebalance', '🎯',
    ['Too Many Coins', 'Own Less, Know More', 'The 30 Coin Problem', 'Diversified Into Nothing'],
    ['عملات كثيرة جداً', 'امتلك أقل واعرف أكثر']],
  [11, 'trading', 'signals', '📊',
    ['Fake Breakout', 'Where Is the Volume?', 'Loud Moves, Quiet Moves', 'Breakouts Need a Crowd'],
    ['الاختراق الكاذب', 'أين حجم التداول؟']],
  [12, 'trading', 'coach', '🧾',
    ['What Did You Really Pay?', 'Your Real Break Even', 'The Tax Surprise', 'Know Your Average Price'],
    ['كم دفعت فعلاً؟', 'سعر التعادل الحقيقي']],
  [13, 'risk', 'coach', '💥',
    ['Liquidated in a Minute', 'Borrowed Money, Borrowed Time', 'Why 10x Wipes You Out', 'Win Without Leverage First'],
    ['التصفية في دقيقة', 'لماذا تمسحك الرافعة المالية']],
  [14, 'risk', 'rebalance', '📐',
    ['Size Is the Strategy', 'How Sure Are You?', 'Bet Big Only When You Know', 'Conviction Sets the Size'],
    ['حجم الصفقة هو الاستراتيجية', 'ما مدى ثقتك؟']],
  [15, 'mindset', 'coach', '🎣',
    ['Do Nothing, Win More', 'The Hardest Trade Is No Trade', 'Twenty Trades a Year', 'Boredom Is a Strategy'],
    ['لا تفعل شيئاً واربح أكثر', 'أصعب صفقة هي ألا تتداول']],
  [16, 'trading', 'signals', '🐋',
    ['Ignore the Hype', 'Where the Whales Go', 'The Story vs the Money', 'Smart Money Moves First'],
    ['تجاهل الضجة', 'أين تذهب الحيتان']],
  [17, 'mindset', 'feargreed', '😱',
    ['Buy When They Panic', 'Greed Is a Warning', 'Extreme Fear, Quiet Buyers', 'When Everyone Is Euphoric'],
    ['اشترِ عندما يذعرون', 'الطمع إشارة تحذير']],
]

const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Catalog entries for every title: shorts, hidden until their video is linked. */
export const TITLE_BANK = ROWS.flatMap(([hack, course, act, emoji, en, ar]) => [
  ...en.map(name => ({ key: `t-${slug(name)}`, kind: 'story', lang: 'en', name, emoji, hack, course, act, youtube: '' })),
  ...ar.map((name, i) => ({ key: `t-ar-${hack}-${i + 1}`, kind: 'story', lang: 'ar', name, emoji, hack, course, act, youtube: '' })),
])
