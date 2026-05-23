import { useState, useRef, useEffect } from 'react'
import { loadData, saveData, bumpId } from '../data/storage'
import {
  POPULAR_TICKERS, POPULAR_FIAT,
  GOLD_ID, SILVER_ID, COPPER_ID, PLATINUM_ID,
  STOCK_PREFIX, FIAT_PREFIX,
} from '../data/assets'

// ── Arabic letter normalization — strips diacritics + unifies letter forms ─
// Critical for voice recognition where ا/أ/إ/آ, ي/ى, ة/ه, ث/س, ذ/ز
// often get transcribed inconsistently for the same spoken word.
function normalizeArabic(text) {
  return text
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // diacritics (fatha, kasra, etc.)
    .replace(/[أإآٱ]/g, 'ا')                              // alef variants → ا
    .replace(/ى/g, 'ي')                                   // alef maksura → ي
    .replace(/ة/g, 'ه')                                   // taa marbuta → ه
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/گ/g, 'ك')
    .replace(/ـ/g, '')                                    // tatweel
    // Arabic-Indic digits ٠-٩ → ASCII 0-9 (U+0660 = 0).
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30))
}

// Phonetic collapse — merges commonly-confused Arabic consonants so the
// same spoken word matches regardless of dialect or STT spelling.
// e.g. ثلاثة (classical) and تلاتة (Egyptian) both → تلاته.
// e.g. سولانا and صولانا both → سولانا. غ↔ج handles Egyptian g (دوغ↔دوج).
function phoneticArabic(text) {
  return text
    .replace(/ث/g, 'ت')   // theh → teh
    .replace(/ذ/g, 'د')   // thal → dal
    .replace(/ظ/g, 'د')   // zah  → dal
    .replace(/ض/g, 'د')   // dad  → dal
    .replace(/ز/g, 'د')   // zay  → dal (rare confusion)
    .replace(/ق/g, 'ك')   // qaf  → kaf
    .replace(/ص/g, 'س')   // sad  → seen
    .replace(/ط/g, 'ت')   // tah  → teh
    .replace(/ح/g, 'ه')   // haa  → hah
    .replace(/خ/g, 'ك')   // khaa → kaf
    .replace(/غ/g, 'ج')   // ghain → jeem (Egyptian g)
    .replace(/ع/g, 'ا')   // ain  → alef (often inaudible in STT)
}

// Full normalization pipeline — apply to BOTH the input transcript and
// every vocabulary entry so they're compared on equal footing.
function fullNormalize(text) {
  return phoneticArabic(normalizeArabic(text.toLowerCase()))
}

// Levenshtein distance — used for fuzzy coin/intent match when exact
// normalization isn't enough (user added/dropped a letter or two).
function editDistance(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

// ── Asset vocabulary (crypto + stocks + fiat + metals + bonds) ─────────────
// All aliases pass through fullNormalize() so dialect/STT variants collapse:
// سولانا and صولانا share a key; ثلاثة and تلاتة share a key.
// Each entry carries `category` so handleImport routes it correctly.
const COIN_MAP = (() => {
  const c = {}
  const add = (aliases, id, symbol, name, category = 'crypto') => {
    aliases.forEach(a => {
      const key = fullNormalize(a)
      // Don't clobber an earlier entry — crypto wins over stock when an
      // alias happens to clash (since crypto entries are registered first).
      if (!c[key]) c[key] = { id, symbol, name, category }
    })
  }
  add(['bitcoin','btc','bee tee cee','bitty','bitcorn','digital gold','the king','satoshi','sats',
       'بيتكوين','بتكوين','بيت كوين','بي تي سي','بيتكوبن','بيتكون','بتكون'], 'bitcoin', 'BTC', 'Bitcoin')
  // Ethereum: Arabic speech recognition produces many transliterations
  // (ث↔س, ي/ى, missing/extra letters). Include all observed variants.
  add(['ethereum','eth','ether','vitalik','smart contract coin',
       'إيثيريوم','إيثر','ايثيريوم','ايثر','اي تي اتش',
       'اثيريوم','اثيريم','ايثيريم','ايثريوم','اثريوم',
       'اسيريوم','اسيريام','ايثيريام','اسيريم','ايسيريوم','ايسيريام',
       'إيثيريم','إثيريوم','إثيريم','إيسيريوم'], 'ethereum', 'ETH', 'Ethereum')
  add(['solana','sol','salami','سولانا','سول','صولانا','صول','سولانه','صولانه'], 'solana', 'SOL', 'Solana')
  add(['bnb','binance coin','binance','بي إن بي','بي ان بي','بينانس','بايننس','بنانس','بنب'], 'binancecoin', 'BNB', 'BNB')
  add(['xrp','ripple','إكس آر بي','اكس ار بي','ريبل','ربيل','ريبيل','ربل'], 'ripple', 'XRP', 'XRP')
  add(['cardano','ada','كاردانو','ايه دي ايه','كردانو','كاردنو'], 'cardano', 'ADA', 'Cardano')
  add(['dogecoin','doge','the dog','elon coin','دوج','دوجكوين','دوجي','دوغ','دوغكوين','دوجى','دوغه'], 'dogecoin', 'DOGE', 'Dogecoin')
  add(['shiba','shib','shiba inu','شيبا','شيب','شيبه','شيبا اينو'], 'shiba-inu', 'SHIB', 'Shiba Inu')
  add(['pepe','pepe coin','the frog','بيبي','بيبيه','ببي','بيبى','بيبي كوين'], 'pepe', 'PEPE', 'Pepe')
  add(['polkadot','dot','بولكادوت','دوت','بولكا دوت','بولكادت','بولكدوت'], 'polkadot', 'DOT', 'Polkadot')
  add(['chainlink','link','تشين لينك','لينك','شين لينك','تشاينلينك','شاين لينك'], 'chainlink', 'LINK', 'Chainlink')
  add(['avalanche','avax','أفالانش','أفاكس','افاكس','افلانش','افالانش','افلانتش','افاكش'], 'avalanche-2', 'AVAX', 'Avalanche')
  add(['polygon','matic','pol','بوليجون','بوليغون','ماتيك','بوليكون','بوليجن','ماتك'], 'matic-network', 'POL', 'Polygon')
  add(['tron','trx','ترون','تي آر إكس','ترونكس','ترن','ترونيكس'], 'tron', 'TRX', 'TRON')
  add(['litecoin','ltc','لايتكوين','لايت كوين','لايتكون','لايت كون'], 'litecoin', 'LTC', 'Litecoin')
  add(['bitcoin cash','bch','بيتكوين كاش','بتكوين كاش','بيت كوين كاش'], 'bitcoin-cash', 'BCH', 'Bitcoin Cash')
  add(['tether','usdt','تيذر','تيثر','يو إس دي تي','يو اس دي تي','تيدر','تذر'], 'tether', 'USDT', 'Tether')
  add(['usdc','يو إس دي سي','يو اس دي سي','يو اس دي سى'], 'usd-coin', 'USDC', 'USD Coin')
  add(['uniswap','uni','يونيسواب','يوني سواب','يونى سواب','يونيسوب'], 'uniswap', 'UNI', 'Uniswap')
  add(['aave','آفي','افي','اف','افى'], 'aave', 'AAVE', 'Aave')
  add(['arbitrum','arb','أربيتروم','اربيتروم','اربتروم','اربيترم'], 'arbitrum', 'ARB', 'Arbitrum')
  add(['optimism','op','أوبتيميزم','اوبتيميزم','اوبتمزم','اوبتيمزم'], 'optimism', 'OP', 'Optimism')
  add(['near','نير','نيار','نيرو','نيار بروتوكول'], 'near', 'NEAR', 'NEAR')
  add(['stellar','xlm','ستيلر','ستيلار','ستلار'], 'stellar', 'XLM', 'Stellar')
  add(['cosmos','atom','كوزموس','أتوم','اتوم','كوسموس','اتم'], 'cosmos', 'ATOM', 'Cosmos')
  add(['hyperliquid','hype','هايبر','هايب','هايبرليكويد','هايبر ليكويد'], 'hyperliquid', 'HYPE', 'Hyperliquid')
  add(['sui','سوي','سوي كوين','سو','سوى'], 'sui', 'SUI', 'Sui')
  add(['aptos','apt','أبتوس','ابتوس','ابتس'], 'aptos', 'APT', 'Aptos')
  add(['wif','dogwifhat','dog wif hat','ويف','دوغ ويف هات'], 'dogwifcoin', 'WIF', 'dogwifhat')
  add(['bonk','بونك','بنك كوين'], 'bonk', 'BONK', 'Bonk')
  add(['floki','فلوكي','فلوكى','فلوكي اينو'], 'floki', 'FLOKI', 'Floki')
  add(['injective','inj','إنجيكتيف','انجيكتيف','انجكتيف'], 'injective-protocol', 'INJ', 'Injective')
  // ── Additional commonly-traded coins ───────────────────────────────────────
  add(['monero','xmr','مونيرو','مونرو'], 'monero', 'XMR', 'Monero')
  add(['ton','toncoin','تون','تونكوين','ذا اوبن نتورك'], 'the-open-network', 'TON', 'Toncoin')
  add(['render','rndr','رندر','ريندر'], 'render-token', 'RENDER', 'Render')
  add(['filecoin','fil','فايل كوين','فايلكوين'], 'filecoin', 'FIL', 'Filecoin')
  add(['vechain','vet','في تشاين','فيتشين'], 'vechain', 'VET', 'VeChain')
  add(['algorand','algo','الجوراند','الجو','الغوراند'], 'algorand', 'ALGO', 'Algorand')
  add(['fantom','ftm','فانتوم','فانتم'], 'fantom', 'FTM', 'Fantom')
  add(['hedera','hbar','هيديرا','اتش بار'], 'hedera-hashgraph', 'HBAR', 'Hedera')
  add(['immutable','imx','ايميوتابل','اميوتبل'], 'immutable-x', 'IMX', 'Immutable')
  add(['the graph','grt','جراف','ذا جراف','غراف'], 'the-graph', 'GRT', 'The Graph')
  add(['stacks','stx','ستاكس','ستكس'], 'blockstack', 'STX', 'Stacks')
  add(['maker','mkr','ميكر','ماكر'], 'maker', 'MKR', 'Maker')
  add(['dai','داي','داى','دي اي اي'], 'dai', 'DAI', 'Dai')
  add(['lido','ldo','ليدو','ليدوه'], 'lido-dao', 'LDO', 'Lido DAO')
  add(['celestia','tia','سيليستيا','تيا','سيلستيا'], 'celestia', 'TIA', 'Celestia')
  add(['sei','سي','سي ي','سيي'], 'sei-network', 'SEI', 'Sei')
  add(['kaspa','kas','كاسبا','كسبا'], 'kaspa', 'KAS', 'Kaspa')
  add(['ondo','اوندو','اندو'], 'ondo-finance', 'ONDO', 'Ondo')
  add(['pendle','بندل','بيندل'], 'pendle', 'PENDLE', 'Pendle')
  add(['jupiter','jup','جوبيتر','جوبتر'], 'jupiter-exchange-solana', 'JUP', 'Jupiter')
  add(['jito','jto','جيتو','جيتوه'], 'jito-governance-token', 'JTO', 'Jito')
  add(['worldcoin','wld','وورلد كوين','ورلدكوين'], 'worldcoin-wld', 'WLD', 'Worldcoin')
  add(['fetch','fet','فيتش','فتش','فتش اي اي'], 'fetch-ai', 'FET', 'Fetch.ai')
  add(['mantle','mnt','مانتل','منتل'], 'mantle', 'MNT', 'Mantle')

  // ── Stocks ─────────────────────────────────────────────────────────────────
  // Each ticker plus its full company name. Short company nicknames added
  // selectively. Single-letter tickers (V, C, MA) use company name only —
  // adding the letter as alias would match in any English sentence.
  const SINGLE_LETTER = /^[A-Z]{1,2}$/
  const STOCK_NAME_AR = {
    AAPL: ['apple','ابل','ابل كومبيوتر','تفاحه'],
    MSFT: ['microsoft','مايكروسوفت','ميكروسوفت'],
    NVDA: ['nvidia','انفيديا','نفيديا','نيفيديا','انفيدبا','نفيدبا'],
    GOOGL:['google','alphabet','جوجل','جوغل','جوكل'],
    META: ['meta','facebook','ميتا','فيسبوك','فيس بوك'],
    AMZN: ['amazon','امازون','امزون'],
    TSLA: ['tesla','تيسلا','تسلا'],
    AVGO: ['broadcom','برودكوم'],
    ORCL: ['oracle','اوراكل','اوركل'],
    CRM:  ['salesforce','سيلز فورس','سيلزفورس'],
    AMD:  ['amd','ايه ام دي','ا ام د'],
    INTC: ['intel','انتل','انتيل'],
    QCOM: ['qualcomm','كوالكوم','كولكوم'],
    IBM:  ['ibm','اي بي ام'],
    ADBE: ['adobe','ادوبي','ادوب'],
    NOW:  ['servicenow','سيرفس ناو'],
    PLTR: ['palantir','بالانتير','بالنتير'],
    NET:  ['cloudflare','كلاودفلير','كلاود فلير'],
    SNOW: ['snowflake','سنوفليك'],
    JPM:  ['jpmorgan','jpmorgan chase','جي بي مورجان'],
    V:    ['visa','فيزا','ڤيزا'],
    MA:   ['mastercard','master card','ماستر كارد','ماستركارد'],
    BAC:  ['bank of america','بنك امريكا'],
    GS:   ['goldman sachs','goldman','جولدمان ساكس','جولدمان'],
    MS:   ['morgan stanley','مورجان ستانلي'],
    WFC:  ['wells fargo','ويلز فارجو'],
    AXP:  ['american express','امريكان اكسبرس'],
    COIN: ['coinbase','كوين بيس','كوينبيس'],
    HOOD: ['robinhood','روبن هود','روبنهود'],
    LLY:  ['eli lilly','lilly','ايلي ليلي'],
    UNH:  ['unitedhealth','united health','يونايتد هيلث'],
    JNJ:  ['johnson and johnson','johnson & johnson','جونسون اند جونسون','جونسون'],
    ABBV: ['abbvie','ابفي'],
    PFE:  ['pfizer','فايزر','فيزر'],
    MRK:  ['merck','ميرك','مرك'],
    NVO:  ['novo nordisk','نوفو نورديسك'],
    WMT:  ['walmart','وول مارت','والمارت'],
    COST: ['costco','كوستكو','كوسكو'],
    MCD:  ["mcdonald's",'mcdonalds','ماكدونالدز','ماك دونالدز'],
    NKE:  ['nike','نايك','نايكي'],
    SBUX: ['starbucks','ستار باكس','ستاربكس'],
    KO:   ['coca cola','coca-cola','coke','كوكاكولا','كوكا كولا'],
    PEP:  ['pepsi','pepsico','بيبسي','بيبسى'],
    TGT:  ['target','تارجت','تارغت'],
    XOM:  ['exxon','exxonmobil','اكسون','اكسون موبيل'],
    CVX:  ['chevron','شيفرون'],
    COP:  ['conocophillips','كونوكو فيليبس'],
    OXY:  ['occidental','اوكسيدنتال'],
    SPY:  ['spy','s&p 500','sp500','اس اند بي 500','اس بي 500'],
    QQQ:  ['qqq','nasdaq 100','ناسداك 100'],
    IWM:  ['iwm','russell 2000','راسل 2000'],
    DIA:  ['dia','dow jones','داو جونز'],
    VOO:  ['voo','vanguard s&p 500','فانجارد'],
    VTI:  ['vti','vanguard total market','فانجارد توتال'],
    GLD:  ['gld','gold etf','etf ذهب'],
    TLT:  ['tlt','treasury etf','سندات الخزانه etf'],
    ARKK: ['arkk','ark innovation','ارك انوفيشن'],
    SOXX: ['soxx','semiconductor etf','اشباه الموصلات etf'],
    'BRK.B':['berkshire','berkshire hathaway','بيركشاير','بيركشاير هاثاواي'],
    BAC2: [], // placeholder
  }
  for (const t of POPULAR_TICKERS) {
    const ticker = t.ticker
    const aliases = []
    // The ticker itself (avoid 1-2 letter Latin tickers that would match
    // random text). Arabic-spelled ticker is always safe.
    if (!SINGLE_LETTER.test(ticker)) aliases.push(ticker.toLowerCase())
    // Always include the official name and our curated Arabic forms.
    if (t.name) aliases.push(t.name.toLowerCase())
    const extras = STOCK_NAME_AR[ticker] || []
    aliases.push(...extras)
    if (aliases.length) {
      add(aliases, `${STOCK_PREFIX}${ticker.toLowerCase()}`, ticker, t.name, 'stock')
    }
  }

  // ── Fiat currencies ────────────────────────────────────────────────────────
  const FIAT_ALIASES = {
    USD: ['us dollar','dollar','dollars','دولار','دولار امريكي'],
    EUR: ['euro','euros','يورو','اورو'],
    GBP: ['pound','sterling','british pound','جنيه استرليني','استرليني','جنيه انجليزي'],
    JPY: ['yen','japanese yen','ين','ين ياباني'],
    CHF: ['swiss franc','franc','فرنك سويسري','فرنك'],
    CAD: ['canadian dollar','دولار كندي'],
    AUD: ['australian dollar','دولار استرالي'],
    CNY: ['yuan','renminbi','يوان','يوان صيني'],
    INR: ['rupee','indian rupee','روبيه','روبيه هندي'],
    AED: ['dirham','uae dirham','درهم','درهم اماراتي'],
    EGP: ['egyptian pound','pound egypt','جنيه مصري','جنيه'],
  }
  for (const f of POPULAR_FIAT) {
    const aliases = [f.code.toLowerCase(), ...(FIAT_ALIASES[f.code] || [])]
    add(aliases, `${FIAT_PREFIX}${f.code.toLowerCase()}`, f.code, f.name, 'fiat')
  }

  // ── Metals ─────────────────────────────────────────────────────────────────
  add(['gold','xau','ذهب','دهب','جولد'], GOLD_ID, 'XAU', 'Gold (1 oz)', 'gold')
  add(['silver','xag','فضه','فضة','سيلفر'], SILVER_ID, 'XAG', 'Silver (1 oz)', 'silver')
  add(['copper','xcu','نحاس','كوبر'], COPPER_ID, 'XCU', 'Copper (1 lb)', 'copper')
  add(['platinum','xpt','بلاتين','بلاتينيوم','بلاتين كوين'], PLATINUM_ID, 'XPT', 'Platinum (1 oz)', 'platinum')
  add(['palladium','xpd','بلاديوم'], 'metal:xpd', 'XPD', 'Palladium (1 oz)', 'other')

  // ── Bonds ──────────────────────────────────────────────────────────────────
  add(['treasury bond','t-bond','tbond','treasuries','سندات الخزانه','سند الخزانه','تي بوند'], 'bond:treasury', 'T-BOND', 'Treasury Bond', 'bond')
  add(['savings bond','سند ادخار'], 'bond:savings', 'SAV-BOND', 'Savings Bond', 'bond')
  add(['corporate bond','سند شركات'], 'bond:corporate', 'CORP-BOND', 'Corporate Bond', 'bond')
  add(['municipal bond','muni bond','سند بلدي'], 'bond:municipal', 'MUNI-BOND', 'Municipal Bond', 'bond')

  // ── Other tangible assets ──────────────────────────────────────────────────
  add(['real estate','property','عقار','عقارات'], 'other:real-estate', 'PROPERTY', 'Real Estate', 'other')
  add(['oil','petroleum','نفط','بترول'], 'other:oil', 'OIL', 'Oil', 'other')
  add(['watch','rolex','ساعه','ساعة','رولكس'], 'other:watch', 'WATCH', 'Watch', 'other')
  add(['car','vehicle','سياره','سيارة','عربيه'], 'other:car', 'CAR', 'Vehicle', 'other')

  return c
})()

// ── Intent vocabulary — verbs and slang for buy/sell ───────────────────────
const BUY_WORDS = [
  'buy','bought','buying','get','got','getting','grab','grabbed','snag','snagged',
  'scoop','scooped','scoop up','load up','loaded','loaded up','stack','stacked','stacking',
  'ape','aped','aped into','yolo','yoloed','long','longed','went long','picked up',
  'cop','copped','dca','dollar cost average','accumulate','accumulated','accumulating',
  'purchase','purchased','add','added',
  'اشتريت','شريت','اشتري','شري','أخذت','اخذت','جبت','دخلت','جمعت','كومت','كسبت','استثمرت'
]

const SELL_WORDS = [
  'sell','sold','selling','dump','dumped','dumping','exit','exited','exiting',
  'cash out','cashed out','take profits','took profits','tp','tp\'d','offload','offloaded',
  'unload','unloaded','short','shorted','went short','rug','rugged','close','closed',
  'بعت','بيعت','بيع','صفيت','خرجت','خروج','اخرج'
]

// ── Word numbers — both languages, fractions included.
// All Arabic keys pass through fullNormalize() at lookup time so
// dialectal forms (ثلاثة/تلاتة/تلاته) merge under a single canonical key.
const AR_NUMBERS_RAW = {
  'صفر':0,
  'واحد':1,'واحده':1,'واحدة':1,'وحده':1,'وحدة':1,'وحد':1,
  'اثنين':2,'اثنان':2,'اتنين':2,'تنين':2,'ثنين':2,
  'ثلاثة':3,'ثلاثه':3,'ثلاث':3,'تلاته':3,'تلاتة':3,'تلت':3,'تلاتت':3,
  'اربعة':4,'اربعه':4,'اربع':4,'أربعة':4,
  'خمسة':5,'خمسه':5,'خمس':5,
  'ستة':6,'سته':6,'ست':6,
  'سبعة':7,'سبعه':7,'سبع':7,
  'ثمانية':8,'ثمانيه':8,'تمانيه':8,'تمانية':8,'تمن':8,
  'تسعة':9,'تسعه':9,'تسع':9,
  'عشرة':10,'عشره':10,'عشر':10,'عشرت':10,
  'احد عشر':11,'اثنا عشر':12,'اتناشر':12,
  'عشرين':20,'ثلاثين':30,'تلاتين':30,'اربعين':40,'خمسين':50,'ستين':60,'سبعين':70,'تمانين':80,'تسعين':90,
  'نص':0.5,'نصف':0.5,'نُص':0.5,'نوس':0.5,'ربع':0.25,'ثلث':0.333,
  'ميه':100,'مية':100,'مائة':100,'ماءه':100,'مايه':100,
  'الف':1000,'ألف':1000,'مليون':1000000,'مليار':1000000000,'بليون':1000000000,
}
// Build the canonical map by normalizing each raw key. Duplicate
// post-normalization keys (e.g. ثلاثه + تلاته → تلاته) collapse cleanly.
const AR_NUMBERS = Object.fromEntries(
  Object.entries(AR_NUMBERS_RAW).map(([k, v]) => [fullNormalize(k), v])
)
// Note: 'a' / 'an' / 'couple' deliberately omitted — too ambiguous
// (the article 'a' would match in unrelated sentences).
const EN_NUMBERS = {
  'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,
  'six':6,'seven':7,'eight':8,'nine':9,'ten':10,'eleven':11,'twelve':12,
  'thirteen':13,'fourteen':14,'fifteen':15,'twenty':20,'thirty':30,'fifty':50,'hundred':100,
  'thousand':1000,'million':1000000,'billion':1000000000,
  'half':0.5,'quarter':0.25,
}

function parseNumber(str) {
  if (!str) return null
  const trimmed = str.trim()
  // Plain number with optional unit suffix. Unit must not be followed by
  // a Latin letter (so "b" in "bitcoin" is not picked up as billion).
  // We use a lookahead instead of \b because \b doesn't apply after Arabic chars.
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|الف|مليون|مليار|بليون)?(?=[^a-zA-Z]|$)/i)
  if (m) {
    let n = parseFloat(m[1].replace(',', '.'))
    const unit = (m[2] || '').toLowerCase()
    if (['k','thousand','الف'].includes(unit)) n *= 1000
    else if (['m','million','مليون'].includes(unit)) n *= 1000000
    else if (['b','billion','بليون','مليار'].includes(unit)) n *= 1000000000
    return n
  }
  // Word numbers (single token) — try both raw and phonetically-normalized form
  const norm = fullNormalize(trimmed)
  if (AR_NUMBERS[norm] != null) return AR_NUMBERS[norm]
  if (EN_NUMBERS[trimmed] != null) return EN_NUMBERS[trimmed]
  return null
}

// Multiplier words handled by the unit-suffix regex, NOT digitized.
// Otherwise "60 الف" would become "60 1000" — two separate numbers.
// Stored as a Set of phonetically-normalized keys.
const MULTIPLIER_WORDS = new Set([
  'hundred','thousand','million','billion',
  fullNormalize('ميه'), fullNormalize('ماءه'), fullNormalize('مية'),
  fullNormalize('الف'), fullNormalize('مليون'), fullNormalize('مليار'),
  fullNormalize('بليون'),
])

// Convert spoken word-numbers to digits in-place so the existing
// number regex catches them. Handles "one ETH", "half of ETH", "واحد بيتكوين".
// Multi-word phrases (e.g. "a half") replaced before single words.
function digitizeWordNumbers(text) {
  let out = ' ' + text + ' '
  const all = { ...AR_NUMBERS, ...EN_NUMBERS }
  const phrases = Object.keys(all)
    .filter(p => !MULTIPLIER_WORDS.has(p))
    .sort((a, b) => b.length - a.length)
  for (const p of phrases) {
    const val = String(all[p])
    out = out.split(' ' + p + ' ').join(' ' + val + ' ')
  }
  return out.slice(1, -1)
}

// ── The brain: parse a transcript into a structured trade ──────────────────
function parseVoiceCommand(text) {
  const original = text
  // Normalize: lowercase, strip ! and ? (NOT . or , — those are decimal separators).
  let normalized = ' ' + text.toLowerCase().trim().replace(/[!?]/g, ' ') + ' '
  // Run the full normalization pipeline (Arabic letter unification +
  // phonetic collapse) so dialectal variants compare against canonical aliases.
  normalized = fullNormalize(normalized).replace(/\s+/g, ' ')
  // Replace word-numbers with digits (one→1, half→0.5, واحد→1, نص→0.5)
  normalized = ' ' + digitizeWordNumbers(normalized.trim()) + ' '

  // 1. Intent (buy / sell)
  let type = null
  let matchedWord = null
  for (const kw of BUY_WORDS) {
    const k = fullNormalize(kw)
    if (normalized.includes(' ' + k + ' ')) { type = 'buy'; matchedWord = kw; break }
  }
  if (!type) {
    for (const kw of SELL_WORDS) {
      const k = fullNormalize(kw)
      if (normalized.includes(' ' + k + ' ')) { type = 'sell'; matchedWord = kw; break }
    }
  }

  // 2. Coin — three-tier match strategy:
  //    a) exact word-boundary match against any alias (longest first)
  //    b) substring match for Arabic aliases (≥4 chars) — STT often
  //       attaches/detaches words
  //    c) Levenshtein fuzzy match per token — handles novel mishears
  let coin = null
  const aliases = Object.keys(COIN_MAP).sort((a, b) => b.length - a.length)
  for (const alias of aliases) {
    if (normalized.includes(' ' + alias + ' ')) { coin = COIN_MAP[alias]; break }
  }
  if (!coin) {
    for (const alias of aliases) {
      if (alias.length >= 4 && /[؀-ۿ]/.test(alias) && normalized.includes(alias)) {
        coin = COIN_MAP[alias]; break
      }
    }
  }
  if (!coin) {
    // Fuzzy fallback: for each input token (≥4 chars, not pure digits),
    // find the closest alias by edit distance. Accept if distance ≤ 1
    // for short tokens (4-5 chars) or ≤ 2 for longer tokens.
    // Skip tokens that are intent verbs ("sold" is 1 edit from "gold").
    const stopWords = new Set([
      ...BUY_WORDS.map(fullNormalize), ...SELL_WORDS.map(fullNormalize),
      'today','tomorrow','yesterday','share','shares','units','unit','each',
      'النهارده','بكره','امس','اليوم','حصه','حصص','وحده','سهم','اسهم',
    ])
    const tokens = normalized.trim().split(/\s+/)
      .filter(t => t.length >= 4 && !/^\d/.test(t) && !stopWords.has(t))
    let bestDist = Infinity, bestCoin = null
    for (const tok of tokens) {
      for (const alias of aliases) {
        if (alias.length < 4) continue
        if (Math.abs(alias.length - tok.length) > 2) continue
        const d = editDistance(tok, alias)
        const maxLen = Math.max(tok.length, alias.length)
        const threshold = maxLen <= 5 ? 1 : 2
        if (d <= threshold && d < bestDist) {
          bestDist = d
          bestCoin = COIN_MAP[alias]
        }
      }
    }
    if (bestCoin) coin = bestCoin
  }

  // 3. Numbers — find all, then figure out which is amount vs price
  // Look for explicit "at $X" / "for $X" / "بسعر X" / "ب X" patterns for price.
  // Unit suffix uses lookahead [^a-zA-Z] so "b" inside "bitcoin" is not
  // billion, and so Arabic units like "الف" match (\b fails after Arabic).
  let price = null
  const priceRegex = /(?:at|for|@|بسعر|ب)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|الف|مليون|مليار|بليون)?(?=[^a-zA-Z]|$)/i
  const priceMatch = normalized.match(priceRegex)
  if (priceMatch) {
    price = parseNumber(priceMatch[1] + (priceMatch[2] || ''))
  }

  // Find all numbers
  const allNumbers = []
  const numRegex = /(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|الف|مليون|مليار|بليون)?(?=[^a-zA-Z]|$)/gi
  let nm
  while ((nm = numRegex.exec(normalized)) !== null) {
    const parsed = parseNumber(nm[1] + (nm[2] || ''))
    if (parsed != null) allNumbers.push(parsed)
  }

  // Amount = first number that isn't the price
  let amount = null
  if (allNumbers.length > 0) {
    amount = allNumbers.find(n => n !== price)
    if (amount == null && allNumbers.length === 1 && price == null) amount = allNumbers[0]
    if (amount == null && price == null) amount = allNumbers[0]
  }

  // If we only got one number and no explicit price, treat it as amount
  if (amount != null && price == null && allNumbers.length >= 2) {
    // Heuristic: larger one is price (USD), smaller is amount of coin
    const others = allNumbers.filter(n => n !== amount)
    if (others.length > 0) {
      const possible = others[0]
      if (possible > amount * 10) price = possible
      else if (amount > possible * 10) { price = amount; amount = possible }
    }
  }

  // "سهم" / "share" (singular) without an explicit count implies quantity = 1.
  // Plural "أسهم" / "shares" with no number also reasonably defaults to 1 here
  // since we have no better signal.
  if (amount == null) {
    const shareForms = [fullNormalize('سهم'), fullNormalize('اسهم'), 'share', 'shares']
    if (shareForms.some(w => normalized.includes(' ' + w + ' '))) {
      amount = 1
    }
  }

  return { type, coin, amount, price, original, matchedWord }
}

// ── Fun reactions for slang detected — adds personality ────────────────────
function getReaction(text, parsed) {
  const t = text.toLowerCase()
  if (t.includes('yolo') || t.includes('aped')) return { emoji:'🦍', msg:'Apes together strong!' }
  if (t.includes('diamond') || t.includes('hodl')) return { emoji:'💎', msg:'Diamond hands!' }
  if (t.includes('moon') || t.includes('to the moon')) return { emoji:'🚀', msg:'To the moon!' }
  if (t.includes('rugged') || t.includes('dumped')) return { emoji:'📉', msg:'Got it. Better luck next time.' }
  if (t.includes('took profits') || t.includes('tp\'d')) return { emoji:'💰', msg:'Nice profits!' }
  if (t.includes('بعت') && parsed.type === 'sell') return { emoji:'💸', msg:'تم البيع!' }
  if (t.includes('اشتريت') && parsed.type === 'buy') return { emoji:'🎯', msg:'صفقة شراء!' }
  if (parsed.type === 'buy') return { emoji:'📈', msg:'New position locked in.' }
  if (parsed.type === 'sell') return { emoji:'✅', msg:'Position closed.' }
  return null
}

function fmtAmt(n) {
  if (n == null) return '—'
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

// ── Example commands shown to user ─────────────────────────────────────────
const EXAMPLES_EN = [
  '"I bought 0.5 Bitcoin at 60k"',
  '"Sold 10 Apple shares at 220"',
  '"Bought 100 Tesla at 280"',
  '"Bought 1 oz of gold"',
  '"Sold 5000 USD at 1.1"',
]
const EXAMPLES_AR = [
  '"اشتريت بيتكوين 0.5 بسعر 60 ألف"',
  '"اشتريت 10 ابل بسعر 220"',
  '"اشتريت 100 تيسلا"',
  '"اشتريت 1 ذهب"',
  '"بعت 5000 دولار"',
]

// ── Web Speech API support check ───────────────────────────────────────────
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const SUPPORTED = !!SR

// ── Component ───────────────────────────────────────────────────────────────
export default function VoiceImport({ hideTrigger = false }) {
  const [open, setOpen] = useState(hideTrigger)
  const [lang, setLang] = useState('en') // 'en' | 'ar'
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const listenTimerRef = useRef(null)

  const startListening = () => {
    if (!SUPPORTED) { setError('Voice recognition not supported in this browser. Try Chrome or Edge.'); return }
    setError(''); setTranscript(''); setParsed(null); setReaction(null); setConfirmed(false)

    const rec = new SR()
    rec.continuous = true      // keep listening until explicitly stopped
    rec.interimResults = true
    // Use bare 'ar' (not 'ar-SA') — lets Chrome pick whichever Arabic dialect
    // the device supports. 'ar-SA' often fails with "network" on Android if
    // Google's SA endpoint isn't reachable from the user's region.
    rec.lang = lang === 'ar' ? 'ar' : 'en-US'

    const clearTimer = () => { clearTimeout(listenTimerRef.current); listenTimerRef.current = null }
    const scheduleStop = (ms) => { clearTimer(); listenTimerRef.current = setTimeout(() => { try { rec.stop() } catch {} }, ms) }

    const isArabic = lang === 'ar'
    rec.onstart = () => { setListening(true); scheduleStop(15000) }
    rec.onend   = () => { setListening(false); clearTimer() }
    rec.onerror = e => {
      setListening(false); clearTimer()
      if (e.error === 'not-allowed')
        setError(isArabic ? 'تم رفض إذن الميكروفون — اسمح بالوصول وحاول مرة أخرى' : 'Microphone permission denied. Please allow mic access.')
      else if (e.error === 'no-speech')
        setError(isArabic ? 'لم أسمع شيئاً — حاول مرة أخرى' : "I didn't catch that — please try again.")
      else if (e.error === 'network')
        setError(isArabic ? 'تعذر الاتصال بخدمة التعرف على الصوت — تحقق من الإنترنت وأعد المحاولة' : 'Could not reach speech service — check your connection and try again.')
      else if (e.error === 'language-not-supported')
        setError(isArabic ? 'اللغة العربية غير مدعومة في هذا المتصفح — جرّب Chrome' : 'Language not supported — try Chrome.')
      else
        setError(isArabic ? `خطأ في التعرف على الصوت: ${e.error}` : `Voice error: ${e.error}`)
    }

    rec.onresult = e => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript
      }
      setTranscript(text)
      const p = parseVoiceCommand(text)
      if (p.type || p.coin || p.amount) {
        setParsed(p)
        setReaction(getReaction(text, p))
        // Valid command heard — stop 1.5 s after the final transcript segment
        if (e.results[e.results.length - 1]?.isFinal) scheduleStop(1500)
      }
    }

    recRef.current = rec

    // Speak greeting BEFORE mic opens so it doesn't appear in the transcript.
    // `onend` alone is unreliable — Chrome Android / iOS often never fire it.
    // We use a `setTimeout` (created here, inside the gesture handler) as the
    // primary trigger, so the mic always opens even if TTS fails or stalls.
    const greetingText = lang === 'ar'
      ? 'اهلا بيك، اشتريت او بعت ايه النهارده؟'
      : 'Hey! What did you buy or sell today?'

    let recStarted = false
    const doStart = () => {
      if (recStarted) return
      recStarted = true
      try { rec.start() } catch {}
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(greetingText)
        utt.rate = 0.95
        // Pick best available voice for the selected language.
        // Many Android devices don't have Arabic TTS — fall back to any voice
        // (browser default) rather than failing silently.
        const voices = window.speechSynthesis.getVoices()
        const arabicVoice = lang === 'ar'
          ? voices.find(v => v.lang.startsWith('ar'))
          : null
        if (arabicVoice) {
          utt.voice = arabicVoice
          utt.lang = arabicVoice.lang
        } else if (lang === 'ar') {
          // No Arabic voice — speak English greeting instead
          utt.text = 'Hey! What did you buy or sell today?'
          utt.lang = 'en-US'
        } else {
          utt.lang = 'en-US'
        }
        utt.onend = doStart
        utt.onerror = doStart
        window.speechSynthesis.speak(utt)
      } catch {
        // speechSynthesis unavailable
      }
      // Safety net: mic opens after 3 s max regardless of TTS state.
      setTimeout(doStart, 3000)
    } else {
      doStart()
    }
  }

  const stopListening = () => {
    clearTimeout(listenTimerRef.current)
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }

  useEffect(() => () => {
    clearTimeout(listenTimerRef.current)
    try { recRef.current?.stop() } catch {}
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
  }, [])

  const handleImport = () => {
    if (!parsed?.coin || !parsed?.type || !parsed?.amount) return
    const wallets = loadData('wallets')
    const walletId = wallets[0]?.id || 1
    const txs = loadData('transactions')
    const today = new Date().toISOString().split('T')[0]
    const pricePerUnit = parsed.price || 0
    const totalCost = parsed.amount * pricePerUnit
    txs.unshift({
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(walletId),
      type: parsed.type, category: parsed.coin.category || 'crypto',
      coin_id: parsed.coin.id,
      coin_symbol: parsed.coin.symbol,
      coin_name: parsed.coin.name,
      coin_image: '',
      amount: parsed.amount,
      price_per_unit: pricePerUnit,
      total_cost: totalCost,
      exchange: 'Voice Import',
      notes: `"${transcript}"`,
      date: today,
      created_at: new Date().toISOString(),
    })
    saveData('transactions', txs)
    setConfirmed(true)
  }

  const isAr = lang === 'ar'
  const canImport = parsed?.coin && parsed?.type && parsed?.amount

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!hideTrigger && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: open ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.18))' : 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.1))',
            border: '1px solid rgba(168,85,247,0.35)',
            borderRadius: '12px', color: '#c084fc',
            padding: '0.55rem 0.9rem', fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: '0.5rem', width: '100%', justifyContent: 'space-between',
          }}
        >
          <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            Import by Voice <span style={{ fontSize:'0.7rem', opacity:0.7 }}>· EN / عربي</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(236,72,153,0.06))',
          border: '1px solid rgba(168,85,247,0.2)',
          borderRadius: '16px', padding: '1.25rem', marginTop: '0.6rem',
          backdropFilter: 'blur(12px)',
          direction: isAr ? 'rtl' : 'ltr',
        }}>
          {/* Language toggle */}
          <div style={{ display:'flex', gap:'0.4rem', justifyContent:'center', marginBottom:'1rem' }}>
            <button onClick={() => setLang('en')} style={{
              padding:'0.3rem 0.85rem', borderRadius:'18px', fontSize:'0.78rem', fontWeight:700,
              cursor:'pointer', border:'1.5px solid',
              borderColor: lang === 'en' ? '#c084fc' : 'rgba(255,255,255,0.12)',
              background: lang === 'en' ? 'rgba(192,132,252,0.2)' : 'transparent',
              color: lang === 'en' ? '#e9d5ff' : 'var(--text-muted)',
            }}>🇺🇸 English</button>
            <button onClick={() => setLang('ar')} style={{
              padding:'0.3rem 0.85rem', borderRadius:'18px', fontSize:'0.78rem', fontWeight:700,
              cursor:'pointer', border:'1.5px solid',
              borderColor: lang === 'ar' ? '#c084fc' : 'rgba(255,255,255,0.12)',
              background: lang === 'ar' ? 'rgba(192,132,252,0.2)' : 'transparent',
              color: lang === 'ar' ? '#e9d5ff' : 'var(--text-muted)',
            }}>🇸🇦 عربي</button>
          </div>

          {/* Mic button — center */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.7rem', marginBottom:'1rem' }}>
            <div style={{ position:'relative', width:96, height:96 }}>
              {listening && (
                <>
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(192,132,252,0.5), transparent 70%)',
                    animation:'vi-pulse 1.5s ease-out infinite',
                  }} />
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)',
                    animation:'vi-pulse 1.5s ease-out infinite 0.5s',
                  }} />
                </>
              )}
              <button
                onClick={listening ? stopListening : startListening}
                disabled={!SUPPORTED}
                style={{
                  position:'relative', width:96, height:96, borderRadius:'50%',
                  border:'none', cursor: SUPPORTED ? 'pointer' : 'not-allowed',
                  background: listening
                    ? 'linear-gradient(135deg, #f87171, #ec4899)'
                    : 'linear-gradient(135deg, #a855f7, #ec4899)',
                  boxShadow: listening
                    ? '0 0 40px rgba(236,72,153,0.6), inset 0 -3px 0 rgba(0,0,0,0.2)'
                    : '0 8px 24px rgba(168,85,247,0.4), inset 0 -3px 0 rgba(0,0,0,0.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'transform 0.15s, box-shadow 0.2s',
                  transform: listening ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            </div>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0, textAlign:'center' }}>
              {listening
                ? (isAr ? '🎙️ أتحدث الآن…' : '🎙️ Listening… speak now')
                : (isAr ? 'اضغط الميكروفون وقل صفقتك' : 'Tap the mic and say your trade')}
            </p>
          </div>

          {/* Live transcript */}
          {transcript && (
            <div style={{
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
              borderRadius:'12px', padding:'0.75rem 1rem', marginBottom:'0.75rem',
            }}>
              <p style={{ fontSize:'0.7rem', color:'#c084fc', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 0.3rem' }}>
                {isAr ? 'سمعت' : 'I heard'}
              </p>
              <p style={{ margin:0, fontSize:'0.92rem', color:'var(--text)', fontStyle:'italic', lineHeight:1.4 }}>
                "{transcript}"
              </p>
            </div>
          )}

          {/* Parsed result card */}
          {parsed && (
            <div style={{
              background: canImport
                ? 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(34,197,94,0.08))'
                : 'rgba(245,158,11,0.08)',
              border: `1.5px solid ${canImport ? 'rgba(74,222,128,0.35)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius:'12px', padding:'0.85rem 1rem', marginBottom:'0.75rem',
            }}>
              {reaction && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem' }}>
                  <span style={{ fontSize:'1.4rem' }}>{reaction.emoji}</span>
                  <span style={{ fontSize:'0.82rem', color:'var(--text)', fontWeight:600 }}>{reaction.msg}</span>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'0.35rem 0.85rem', fontSize:'0.82rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'النوع' : 'Action'}</span>
                <span style={{ color: parsed.type === 'buy' ? '#4ade80' : parsed.type === 'sell' ? '#f87171' : 'var(--text-muted)', fontWeight:700 }}>
                  {parsed.type ? (parsed.type === 'buy' ? (isAr ? '🟢 شراء' : '🟢 Buy') : (isAr ? '🔴 بيع' : '🔴 Sell')) : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'الأصل' : 'Asset'}</span>
                <span style={{ color:'var(--text)', fontWeight:700 }}>
                  {parsed.coin ? (
                    <>
                      {parsed.coin.symbol} · {parsed.coin.name}
                      {parsed.coin.category && parsed.coin.category !== 'crypto' && (
                        <span style={{
                          marginInlineStart: '0.4rem', fontSize: '0.68rem', fontWeight: 700,
                          padding: '0.1rem 0.45rem', borderRadius: '6px',
                          background: 'rgba(192,132,252,0.15)', color: '#c084fc',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>{parsed.coin.category}</span>
                      )}
                    </>
                  ) : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'الكمية' : 'Amount'}</span>
                <span style={{ color:'var(--text)', fontWeight:700, fontFamily:'monospace' }}>
                  {parsed.amount != null ? fmtAmt(parsed.amount) : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'السعر' : 'Price'}</span>
                <span style={{ color:'var(--text)', fontFamily:'monospace' }}>
                  {parsed.price != null ? '$' + fmtAmt(parsed.price) : (isAr ? 'لم يُذكر' : 'Not specified')}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'8px', color:'#f87171',
              padding:'0.5rem 0.75rem', fontSize:'0.82rem', marginBottom:'0.75rem',
            }}>
              {error}
            </div>
          )}

          {/* Confirm / imported */}
          {parsed && canImport && (
            confirmed ? (
              <div style={{
                background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.35)',
                borderRadius:'10px', color:'#4ade80',
                padding:'0.6rem 0.75rem', fontSize:'0.85rem', textAlign:'center', fontWeight:700,
              }}>
                ✅ {isAr ? 'تم إضافة الصفقة بنجاح!' : 'Trade added successfully!'}
              </div>
            ) : (
              <button onClick={handleImport} style={{
                width:'100%',
                background:'linear-gradient(135deg, #4ade80, #22c55e)',
                border:'none', borderRadius:'10px', color:'#fff',
                padding:'0.7rem', fontWeight:800, fontSize:'0.9rem', cursor:'pointer',
                boxShadow:'0 4px 14px rgba(34,197,94,0.4)',
              }}>
                ✨ {isAr ? 'إضافة الصفقة' : 'Add this trade'}
              </button>
            )
          )}

          {/* Examples */}
          {!transcript && !error && (
            <div style={{ marginTop:'0.5rem' }}>
              <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 0.5rem', textAlign:'center' }}>
                {isAr ? '💡 جرّب أن تقول' : '💡 Try saying'}
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                {(isAr ? EXAMPLES_AR : EXAMPLES_EN).map((ex, i) => (
                  <div key={i} style={{
                    fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic',
                    padding:'0.4rem 0.7rem', background:'rgba(255,255,255,0.03)',
                    borderRadius:'8px', border:'1px solid rgba(255,255,255,0.06)',
                  }}>
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!SUPPORTED && (
            <p style={{ fontSize:'0.75rem', color:'#f59e0b', margin:'0.75rem 0 0', textAlign:'center' }}>
              ⚠️ {isAr ? 'المتصفح لا يدعم التعرف على الصوت' : 'Your browser does not support voice recognition. Try Chrome, Edge, or Safari.'}
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes vi-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
