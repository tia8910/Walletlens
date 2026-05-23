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
  add(['worldcoin','wld','world coin',
       'w l d','w-l-d','w ld','w led','double you el dee',
       'وورلد كوين','ورلدكوين','دبليو ال دي','دبليو ل د','دبليو لد'], 'worldcoin-wld', 'WLD', 'Worldcoin')
  add(['fetch','fet','فيتش','فتش','فتش اي اي'], 'fetch-ai', 'FET', 'Fetch.ai')
  add(['mantle','mnt','مانتل','منتل'], 'mantle', 'MNT', 'Mantle')
  add(['nano','xrb','raiblocks','نانو'], 'nano', 'NANO', 'Nano')
  add(['icon','icx','آيكون','ايكون'], 'icon', 'ICX', 'ICON')
  add(['iota','miota','ايوتا','ايوطا'], 'iota', 'MIOTA', 'IOTA')

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

// Mass-unit words → multiplier to convert into ounces (oz).
// Metals (gold/silver/platinum) are priced per troy ounce; copper per pound.
// When a user says "5 grams of gold", we convert 5 g → 5 / 28.3495 oz.
// Keys are stored in fullNormalize() form so dialectal variants merge.
const MASS_UNITS_TO_OZ = (() => {
  const raw = {
    gram: 1 / 28.3495, grams: 1 / 28.3495, gm: 1 / 28.3495, g: 1 / 28.3495,
    kilo: 1000 / 28.3495, kilos: 1000 / 28.3495,
    kg: 1000 / 28.3495, kilogram: 1000 / 28.3495, kilograms: 1000 / 28.3495,
    oz: 1, ounce: 1, ounces: 1, 'troy ounce': 1, 'troy ounces': 1,
    lb: 16, lbs: 16, pound: 16, pounds: 16,
    'جرام': 1 / 28.3495, 'غرام': 1 / 28.3495, 'غم': 1 / 28.3495,
    'كيلو': 1000 / 28.3495, 'كيلوجرام': 1000 / 28.3495, 'كيلوغرام': 1000 / 28.3495,
    'اوقيه': 1, 'اونصه': 1, 'اونس': 1,
    'رطل': 16,
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [fullNormalize(k), v]))
})()

function detectMassUnit(normalized) {
  const keys = Object.keys(MASS_UNITS_TO_OZ).sort((a, b) => b.length - a.length)
  for (const u of keys) {
    if (normalized.includes(' ' + u + ' ')) return u
  }
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
    // Arabic conjunction "و" (and) often attaches to the following number-word
    // without a space ("وواحد" = "and one"). Split it so the number is detected.
    if (/[؀-ۿ]/.test(p)) {
      out = out.split(' و' + p + ' ').join(' و ' + val + ' ')
    }
  }
  return out.slice(1, -1)
}

// ── The brain: parse a transcript into one or more structured trades ───────
// Returns { original, transactions: [...] } — one tx per intent verb, and
// when a single intent governs multiple coins ("bought BTC and ETH") each
// coin becomes its own transaction.
function parseVoiceCommand(text) {
  const original = text
  let normalized = ' ' + text.toLowerCase().trim().replace(/[!?]/g, ' ') + ' '
  normalized = fullNormalize(normalized).replace(/\s+/g, ' ')
  normalized = ' ' + digitizeWordNumbers(normalized.trim()) + ' '

  // Anchor 1: all intent verbs in the text
  const intents = findIntentPositions(normalized)

  // Split text by intent positions into base segments
  let baseSegments
  if (intents.length === 0) {
    baseSegments = [{ text: normalized, type: null, matchedWord: null }]
  } else {
    baseSegments = intents.map((intent, i) => {
      const start = intent.start
      const end = (i + 1 < intents.length) ? intents[i + 1].start : normalized.length
      return {
        text: ' ' + normalized.slice(start, end).trim() + ' ',
        type: intent.type,
        matchedWord: intent.matchedWord,
      }
    })
  }

  // Anchor 2: each base segment may mention several coins — split further
  const transactions = []
  for (const seg of baseSegments) {
    const coinPositions = findAllCoinPositions(seg.text)
    if (coinPositions.length <= 1) {
      transactions.push(parseOneSegment(seg.text, seg.type, seg.matchedWord))
    } else {
      // Split text at the midpoint between consecutive coins so the
      // amount appearing BEFORE each coin lands inside that coin's
      // sub-segment. Example: "buy 1 BTC and 1 ETH" → "buy 1 BTC and" + "1 ETH"
      for (let i = 0; i < coinPositions.length; i++) {
        const subStart = (i === 0)
          ? 0
          : Math.floor((coinPositions[i - 1].end + coinPositions[i].start) / 2)
        const subEnd = (i + 1 < coinPositions.length)
          ? Math.floor((coinPositions[i].end + coinPositions[i + 1].start) / 2)
          : seg.text.length
        const subText = ' ' + seg.text.slice(subStart, subEnd).trim() + ' '
        const tx = parseOneSegment(subText, seg.type, seg.matchedWord)
        tx.coin = coinPositions[i].coin
        tx.suggestions = null
        transactions.push(tx)
      }
    }
  }

  return { original, transactions }
}

// Locate every non-overlapping intent verb in the normalized text.
// Longer keys win when keys overlap (e.g. "took profits" beats "took").
function findIntentPositions(normalized) {
  const intents = []
  const allKws = [
    ...BUY_WORDS.map(w => ({ key: fullNormalize(w), type: 'buy', matchedWord: w })),
    ...SELL_WORDS.map(w => ({ key: fullNormalize(w), type: 'sell', matchedWord: w })),
  ].sort((a, b) => b.key.length - a.key.length)

  const taken = new Array(normalized.length).fill(false)
  for (const { key, type, matchedWord } of allKws) {
    const needle = ' ' + key + ' '
    let idx = 0
    while ((idx = normalized.indexOf(needle, idx)) !== -1) {
      const s = idx + 1
      const e = s + key.length
      let conflict = false
      for (let i = s; i < e; i++) { if (taken[i]) { conflict = true; break } }
      if (!conflict) {
        for (let i = s; i < e; i++) taken[i] = true
        intents.push({ start: s, end: e, type, matchedWord })
      }
      idx++
    }
  }
  intents.sort((a, b) => a.start - b.start)
  return intents
}

// Locate every non-overlapping coin alias mention in the normalized text.
function findAllCoinPositions(normalized) {
  const found = []
  const aliases = Object.keys(COIN_MAP).sort((a, b) => b.length - a.length)
  const taken = new Array(normalized.length).fill(false)
  for (const alias of aliases) {
    const needle = ' ' + alias + ' '
    let idx = 0
    while ((idx = normalized.indexOf(needle, idx)) !== -1) {
      const s = idx + 1
      const e = s + alias.length
      let conflict = false
      for (let i = s; i < e; i++) { if (taken[i]) { conflict = true; break } }
      if (!conflict) {
        for (let i = s; i < e; i++) taken[i] = true
        found.push({ start: s, end: e, coin: COIN_MAP[alias] })
      }
      idx++
    }
  }
  found.sort((a, b) => a.start - b.start)
  return found
}

// Parse a single segment (already-normalized) into one transaction.
// `forcedType` / `forcedMatchedWord` skip intent detection when the caller
// already knows it from the surrounding split.
function parseOneSegment(normalized, forcedType, forcedMatchedWord) {
  let type = forcedType || null
  let matchedWord = forcedMatchedWord || null
  if (!type) {
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
  }

  // Coin — exact / substring / fuzzy
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
  let suggestions = null
  if (!coin) {
    const stopWords = new Set([
      ...BUY_WORDS.map(fullNormalize), ...SELL_WORDS.map(fullNormalize),
      'today','tomorrow','yesterday','share','shares','units','unit','each',
      'النهارده','بكره','امس','اليوم','حصه','حصص','وحده','سهم','اسهم',
    ])
    const tokens = normalized.trim().split(/\s+/)
      .filter(t => t.length >= 4 && !/^\d/.test(t) && !stopWords.has(t))
    let bestDist = Infinity, bestCoin = null
    const nearMisses = []
    for (const tok of tokens) {
      for (const alias of aliases) {
        if (alias.length < 4) continue
        if (Math.abs(alias.length - tok.length) > 3) continue
        const d = editDistance(tok, alias)
        const maxLen = Math.max(tok.length, alias.length)
        const autoThresh = maxLen <= 5 ? 1 : 2
        if (d <= autoThresh && d < bestDist) {
          bestDist = d
          bestCoin = COIN_MAP[alias]
        } else if (d <= autoThresh + 1) {
          nearMisses.push({ dist: d, coin: COIN_MAP[alias] })
        }
      }
    }
    if (bestCoin) {
      coin = bestCoin
    } else if (nearMisses.length) {
      const byId = new Map()
      for (const { dist, coin: c } of nearMisses) {
        if (!byId.has(c.id) || byId.get(c.id).dist > dist) byId.set(c.id, { dist, coin: c })
      }
      suggestions = [...byId.values()].sort((a, b) => a.dist - b.dist).slice(0, 4).map(s => s.coin)
    }
  }

  // Numbers (amount + price)
  let price = null
  const priceRegex = /(?:at|for|@|بسعر|ب)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|الف|مليون|مليار|بليون)?(?=[^a-zA-Z]|$)/i
  const priceMatch = normalized.match(priceRegex)
  if (priceMatch) {
    price = parseNumber(priceMatch[1] + (priceMatch[2] || ''))
  }
  const allNumbers = []
  const numRegex = /(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|الف|مليون|مليار|بليون)?(?=[^a-zA-Z]|$)/gi
  let nm
  while ((nm = numRegex.exec(normalized)) !== null) {
    const parsed = parseNumber(nm[1] + (nm[2] || ''))
    if (parsed != null) allNumbers.push(parsed)
  }
  let amount = null
  if (allNumbers.length > 0) {
    amount = allNumbers.find(n => n !== price)
    if (amount == null && allNumbers.length === 1 && price == null) amount = allNumbers[0]
    if (amount == null && price == null) amount = allNumbers[0]
  }
  if (amount != null && price == null && allNumbers.length >= 2) {
    const others = allNumbers.filter(n => n !== amount)
    if (others.length > 0) {
      const possible = others[0]
      if (possible > amount * 10) price = possible
      else if (amount > possible * 10) { price = amount; amount = possible }
    }
  }
  if (amount == null) {
    const shareForms = [fullNormalize('سهم'), fullNormalize('اسهم'), 'share', 'shares']
    if (shareForms.some(w => normalized.includes(' ' + w + ' '))) {
      amount = 1
    }
  }

  // Unit conversion for metals: "5 grams of gold" → 0.1764 oz; "1 kg silver" → 35.27 oz.
  // Copper is priced per pound, so we go via oz / 16.
  let unitNote = null
  if (amount != null && coin) {
    const ozCats = new Set(['gold', 'silver', 'platinum'])
    const lbCats = new Set(['copper'])
    if (ozCats.has(coin.category) || lbCats.has(coin.category)) {
      const unit = detectMassUnit(normalized)
      if (unit) {
        const ozMul = MASS_UNITS_TO_OZ[unit]
        const before = amount
        amount = lbCats.has(coin.category) ? amount * (ozMul / 16) : amount * ozMul
        unitNote = `${before} ${unit}`
      }
    }
  }

  return { type, coin, suggestions, amount, price, matchedWord, unitNote }
}

// Search assets by free text (used by the "edit asset" picker in each card).
function searchAssets(query) {
  if (!query || !query.trim()) return []
  const q = fullNormalize(query.trim())
  const aliases = Object.keys(COIN_MAP)
  const matched = new Map()
  // First pass: prefix matches (better quality)
  for (const alias of aliases) {
    if (alias.startsWith(q)) {
      const c = COIN_MAP[alias]
      if (!matched.has(c.id)) matched.set(c.id, c)
    }
  }
  // Second pass: contains matches
  for (const alias of aliases) {
    if (matched.size >= 8) break
    if (alias.includes(q)) {
      const c = COIN_MAP[alias]
      if (!matched.has(c.id)) matched.set(c.id, c)
    }
  }
  return [...matched.values()].slice(0, 8)
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
export default function VoiceImport({ hideTrigger = false, onImported }) {
  const [open, setOpen] = useState(hideTrigger)
  const [lang, setLang] = useState('en') // 'en' | 'ar'
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  // Per-transaction free-text asset search ({ [txIdx]: query })
  const [assetQueries, setAssetQueries] = useState({})
  const recRef = useRef(null)
  const listenTimerRef = useRef(null)
  const arVoiceRef = useRef(null)  // best Arabic voice, loaded async at mount

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const pickBest = () => {
      const voices = window.speechSynthesis.getVoices()
      if (!voices.length) return
      // Prefer neural / enhanced / premium voices, then EG dialect, then any Arabic
      arVoiceRef.current =
        voices.find(v => v.lang.startsWith('ar') &&
          /neural|enhanced|premium|wavenet|journey/i.test(v.name)) ||
        voices.find(v => v.lang === 'ar-EG') ||
        voices.find(v => v.lang.startsWith('ar')) ||
        null
    }
    pickBest()
    window.speechSynthesis.addEventListener('voiceschanged', pickBest)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickBest)
  }, [])

  const startListening = () => {
    if (!SUPPORTED) { setError('Voice recognition not supported in this browser. Try Chrome or Edge.'); return }
    setError(''); setTranscript(''); setParsed(null); setReaction(null); setConfirmed(false); setAssetQueries({})

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 3   // try top-3 STT hypotheses → pick best parse
    rec.lang = lang === 'ar' ? 'ar-EG' : 'en-US'

    const clearTimer = () => { clearTimeout(listenTimerRef.current); listenTimerRef.current = null }
    const scheduleStop = (ms) => { clearTimer(); listenTimerRef.current = setTimeout(() => { try { rec.stop() } catch {} }, ms) }

    const isArabic = lang === 'ar'
    // 5-minute safety ceiling — user is expected to tap the mic to stop.
    rec.onstart = () => { setListening(true); scheduleStop(5 * 60 * 1000) }
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
      // Chrome on Android emits PROGRESSIVE SNAPSHOTS — each new result entry
      // can contain the full cumulative transcript so far, not just the new
      // word. Naively concatenating all entries produces duplicates like
      // "II boughtI bought oneI bought one Bitcoin" or
      // "اشتريت اشتريت 10 اشتريت 10 بيتكوين…".
      //
      // Strategy: walk results left→right, collapsing consecutive snapshots
      // (where current trimmed text starts with previous trimmed text) into
      // the latest. When a result does NOT start with the previous, treat
      // it as a NEW utterance and append. This handles both Chrome desktop
      // (distinct utterances) and Chrome Android (snapshot mode).
      const segments = []
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i]
        let best = result[0].transcript
        let bestScore = -1
        const baseline = segments.map(s => s.text).join(' ')
        for (let k = 0; k < result.length; k++) {
          const candidate = (baseline + ' ' + result[k].transcript).trim()
          const p = parseVoiceCommand(candidate)
          const score = p.transactions.reduce((s, t) =>
            s + (t.type ? 2 : 0) + (t.coin ? 4 : 0) + (t.amount != null ? 1 : 0), 0)
          if (score > bestScore) { bestScore = score; best = result[k].transcript }
        }
        const trimmed = best.trim()
        if (!trimmed) continue

        const last = segments[segments.length - 1]
        if (last && trimmed.startsWith(last.text.trim())) {
          // Progressive snapshot of the same utterance — replace, don't append
          last.text = best
          last.isFinal = result.isFinal
        } else {
          segments.push({ text: best, isFinal: result.isFinal })
        }
      }

      const text = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim()
      setTranscript(text)
      const p = parseVoiceCommand(text)
      const anyUseful = p.transactions.some(t => t.type || t.coin || t.amount != null || t.suggestions?.length)
      if (anyUseful) {
        setParsed(p)
        setReaction(getReaction(text, p.transactions[0] || {}))
      }
    }

    recRef.current = rec

    // Speak greeting BEFORE mic opens so it doesn't appear in the transcript.
    // `onend` alone is unreliable — Chrome Android / iOS often never fire it.
    // We use a `setTimeout` (created here, inside the gesture handler) as the
    // primary trigger, so the mic always opens even if TTS fails or stalls.
    // Always speak English TTS — Arabic TTS is robotic on most Android devices
    // and the user prefers the English voice regardless of UI language.
    const greetingText = 'Hey! What did you buy or sell today?'

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
        utt.lang = 'en-US'
        utt.rate  = 0.95
        utt.pitch = 1
        if (lang === 'ar' && arVoiceRef.current) utt.voice = arVoiceRef.current
        utt.onend = doStart
        utt.onerror = doStart  // if TTS fails, mic still opens
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

  const updateTx = (idx, patch) => {
    setParsed(p => {
      if (!p) return p
      return {
        ...p,
        transactions: p.transactions.map((t, i) => i === idx ? { ...t, ...patch } : t),
      }
    })
  }

  const removeTx = (idx) => {
    setParsed(p => {
      if (!p) return p
      const next = p.transactions.filter((_, i) => i !== idx)
      return next.length ? { ...p, transactions: next } : null
    })
  }

  const handleImport = () => {
    const ready = (parsed?.transactions || []).filter(t => t.coin && t.type && t.amount)
    if (!ready.length) return
    const wallets = loadData('wallets')
    const walletId = wallets[0]?.id || 1
    const txs = loadData('transactions')
    const today = new Date().toISOString().split('T')[0]
    for (const tx of ready) {
      const pricePerUnit = tx.price || 0
      const totalCost = tx.amount * pricePerUnit
      txs.unshift({
        id: bumpId('crypto_tracker_next_tx_id'),
        wallet_id: parseInt(walletId),
        type: tx.type, category: tx.coin.category || 'crypto',
        coin_id: tx.coin.id,
        coin_symbol: tx.coin.symbol,
        coin_name: tx.coin.name,
        coin_image: '',
        amount: tx.amount,
        price_per_unit: pricePerUnit,
        total_cost: totalCost,
        exchange: 'Voice Import',
        notes: `"${transcript}"`,
        date: today,
        created_at: new Date().toISOString(),
      })
    }
    saveData('transactions', txs)
    onImported?.()
    setConfirmed(true)
  }

  const isAr = lang === 'ar'
  const readyCount = (parsed?.transactions || []).filter(t => t.coin && t.type && t.amount).length
  const canImport = readyCount > 0

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

          {/* Reaction banner */}
          {reaction && parsed && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.6rem' }}>
              <span style={{ fontSize:'1.4rem' }}>{reaction.emoji}</span>
              <span style={{ fontSize:'0.83rem', color:'var(--text)', fontWeight:600 }}>{reaction.msg}</span>
            </div>
          )}

          {/* Per-transaction editable cards */}
          {parsed && parsed.transactions.map((tx, idx) => {
            const txReady = tx.coin && tx.type && tx.amount != null
            const q = assetQueries[idx] || ''
            const assetResults = searchAssets(q)
            return (
              <div key={idx} style={{
                background: txReady ? 'linear-gradient(135deg,rgba(74,222,128,0.10),rgba(34,197,94,0.06))' : 'rgba(245,158,11,0.07)',
                border: `1.5px solid ${txReady ? 'rgba(74,222,128,0.35)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius:'12px', padding:'0.85rem 1rem', marginBottom:'0.65rem',
              }}>
                {/* header: trade N / remove */}
                {parsed.transactions.length > 1 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.55rem' }}>
                    <span style={{ fontSize:'0.7rem', fontWeight:700, color:'#c084fc', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      {isAr ? `صفقة ${idx + 1}` : `Trade ${idx + 1}`}
                    </span>
                    <button onClick={() => removeTx(idx)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1rem', lineHeight:1 }}>✕</button>
                  </div>
                )}

                {/* Action toggle */}
                <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.6rem' }}>
                  {['buy','sell'].map(t => (
                    <button key={t} onClick={() => updateTx(idx, { type: t })} style={{
                      flex:1, padding:'0.35rem 0', borderRadius:'8px', fontWeight:700, fontSize:'0.8rem', cursor:'pointer',
                      border: tx.type === t ? 'none' : '1.5px solid rgba(255,255,255,0.1)',
                      background: tx.type === t
                        ? (t === 'buy' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)')
                        : 'transparent',
                      color: tx.type === t
                        ? (t === 'buy' ? '#4ade80' : '#f87171')
                        : 'var(--text-muted)',
                    }}>
                      {t === 'buy' ? (isAr ? '🟢 شراء' : '🟢 Buy') : (isAr ? '🔴 بيع' : '🔴 Sell')}
                    </button>
                  ))}
                </div>

                {/* Asset row */}
                <div style={{ marginBottom:'0.55rem' }}>
                  <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{isAr ? 'الأصل' : 'Asset'}</span>
                  {tx.coin ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>
                        {tx.coin.symbol} · {tx.coin.name}
                        {tx.coin.category && tx.coin.category !== 'crypto' && (
                          <span style={{ marginInlineStart:'0.4rem', fontSize:'0.66rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:'5px', background:'rgba(192,132,252,0.15)', color:'#c084fc', textTransform:'uppercase' }}>{tx.coin.category}</span>
                        )}
                      </span>
                      <button onClick={() => { updateTx(idx, { coin: null, suggestions: null }); setAssetQueries(q => ({...q, [idx]: ''})) }}
                        style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:'6px', color:'var(--text-muted)', cursor:'pointer', padding:'0.15rem 0.5rem', fontSize:'0.72rem' }}>
                        {isAr ? 'تغيير' : 'Change'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop:'0.3rem' }}>
                      {/* Suggestion chips */}
                      {tx.suggestions?.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', marginBottom:'0.45rem' }}>
                          <span style={{ fontSize:'0.72rem', color:'#c084fc', fontWeight:600, alignSelf:'center' }}>{isAr ? 'هل تقصد؟' : 'Did you mean?'}</span>
                          {tx.suggestions.map(s => (
                            <button key={s.id} onClick={() => updateTx(idx, { coin: s, suggestions: null })} style={{
                              padding:'0.28rem 0.65rem', borderRadius:'16px', background:'rgba(192,132,252,0.15)', border:'1.5px solid rgba(192,132,252,0.4)',
                              color:'#e9d5ff', fontWeight:700, fontSize:'0.78rem', cursor:'pointer',
                            }}>
                              {s.symbol} <span style={{ opacity:0.7, fontWeight:400 }}>{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Free-text search */}
                      <input
                        type="text"
                        value={q}
                        onChange={e => setAssetQueries(prev => ({...prev, [idx]: e.target.value}))}
                        placeholder={isAr ? 'ابحث عن الأصل… (مثال: bitcoin، tesla)' : 'Search asset… (e.g. bitcoin, tesla)'}
                        style={{
                          width:'100%', boxSizing:'border-box', padding:'0.45rem 0.7rem',
                          borderRadius:'8px', border:'1.5px solid rgba(192,132,252,0.35)',
                          background:'rgba(255,255,255,0.05)', color:'var(--text)',
                          fontSize:'0.82rem', outline:'none',
                        }}
                      />
                      {assetResults.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginTop:'0.4rem' }}>
                          {assetResults.map(c => (
                            <button key={c.id} onClick={() => { updateTx(idx, { coin: c, suggestions: null }); setAssetQueries(prev => ({...prev, [idx]: ''})) }} style={{
                              padding:'0.28rem 0.65rem', borderRadius:'16px', background:'rgba(168,85,247,0.18)', border:'1.5px solid rgba(168,85,247,0.4)',
                              color:'#e9d5ff', fontWeight:600, fontSize:'0.78rem', cursor:'pointer',
                            }}>
                              {c.symbol} <span style={{ opacity:0.7 }}>{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Amount + Price inputs */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                  <div>
                    <label style={{ fontSize:'0.72rem', color: tx.amount == null ? '#f59e0b' : 'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'0.2rem' }}>
                      {tx.amount == null ? (isAr ? '⚠️ الكمية' : '⚠️ Amount') : (isAr ? 'الكمية' : 'Amount')}
                    </label>
                    <input
                      type="number" min="0" step="any"
                      value={tx.amount ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseFloat(e.target.value)
                        updateTx(idx, { amount: isNaN(v) ? null : v })
                      }}
                      placeholder={isAr ? 'أدخل الكمية' : 'Enter amount'}
                      style={{
                        width:'100%', boxSizing:'border-box', padding:'0.42rem 0.6rem',
                        borderRadius:'8px', border: `1.5px solid ${tx.amount == null ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.12)'}`,
                        background:'rgba(255,255,255,0.05)', color:'var(--text)',
                        fontSize:'0.85rem', fontFamily:'monospace', outline:'none',
                      }}
                    />
                    {tx.unitNote && (
                      <span style={{ fontSize:'0.68rem', color:'#c084fc', marginTop:'0.15rem', display:'block' }}>
                        {isAr ? `محوّل من ${tx.unitNote}` : `from ${tx.unitNote}`}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'0.2rem' }}>
                      {isAr ? 'السعر ($)' : 'Price ($)'}
                    </label>
                    <input
                      type="number" min="0" step="any"
                      value={tx.price ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseFloat(e.target.value)
                        updateTx(idx, { price: isNaN(v) ? null : v })
                      }}
                      placeholder={isAr ? 'اختياري' : 'Optional'}
                      style={{
                        width:'100%', boxSizing:'border-box', padding:'0.42rem 0.6rem',
                        borderRadius:'8px', border:'1.5px solid rgba(255,255,255,0.12)',
                        background:'rgba(255,255,255,0.05)', color:'var(--text)',
                        fontSize:'0.85rem', fontFamily:'monospace', outline:'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          {error && (
            <div style={{
              background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'8px', color:'#f87171',
              padding:'0.5rem 0.75rem', fontSize:'0.82rem', marginBottom:'0.75rem',
            }}>
              {error}
            </div>
          )}

          {/* Import / confirmed */}
          {confirmed ? (
            <div style={{
              background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.35)',
              borderRadius:'10px', color:'#4ade80',
              padding:'0.6rem 0.75rem', fontSize:'0.85rem', textAlign:'center', fontWeight:700,
            }}>
              ✅ {isAr
                ? `تم إضافة ${readyCount} صفقة بنجاح!`
                : `${readyCount} trade${readyCount > 1 ? 's' : ''} added!`}
            </div>
          ) : parsed && canImport ? (
            <button onClick={handleImport} style={{
              width:'100%',
              background:'linear-gradient(135deg, #4ade80, #22c55e)',
              border:'none', borderRadius:'10px', color:'#fff',
              padding:'0.7rem', fontWeight:800, fontSize:'0.9rem', cursor:'pointer',
              boxShadow:'0 4px 14px rgba(34,197,94,0.4)',
            }}>
              ✨ {readyCount > 1
                ? (isAr ? `إضافة ${readyCount} صفقات` : `Add ${readyCount} trades`)
                : (isAr ? 'إضافة الصفقة' : 'Add this trade')}
            </button>
          ) : null}

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
