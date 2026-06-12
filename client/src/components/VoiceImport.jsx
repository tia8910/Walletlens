import { useState, useRef, useEffect } from 'react'
import { loadData, saveData, bumpId } from '../data/storage'
import { track, trackProfileCreated } from '../analytics'
import { api } from '../api'
import { useLanguage } from '../LanguageContext'
import { parseTradesWithClaude } from '../voiceAi'
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
  // Top coins include common Google/Apple STT phonetic mis-hearings (e.g.
  // Solana → "selena", Ethereum → "a theorem", XRP → "ex our pee") so the
  // parser still recognises the coin when the speech-to-text engine garbles
  // a familiar word.
  add(['bitcoin','btc','bee tee cee','bitty','bitcorn','digital gold','the king','satoshi','sats',
       // STT mis-hearings
       'big coin','big point','bit corn','bit con','bit coin','bitkoin','bit kong',
       'بيتكوين','بتكوين','بيت كوين','بي تي سي','بيتكوبن','بيتكون','بتكون'], 'bitcoin', 'BTC', 'Bitcoin')
  // Ethereum: Arabic speech recognition produces many transliterations
  // (ث↔س, ي/ى, missing/extra letters). Include all observed variants.
  add(['ethereum','eth','ether','vitalik','smart contract coin',
       // STT mis-hearings (English engines hearing the word)
       'a theorem','e theorem','atherium','etherium','etherian','etheria','mythirium',
       'aetherium','aether','ether room',
       'إيثيريوم','إيثر','ايثيريوم','ايثر','اي تي اتش',
       'اثيريوم','اثيريم','ايثيريم','ايثريوم','اثريوم',
       'اسيريوم','اسيريام','ايثيريام','اسيريم','ايسيريوم','ايسيريام',
       'إيثيريم','إثيريوم','إثيريم','إيسيريوم'], 'ethereum', 'ETH', 'Ethereum')
  add(['solana','sol','salami',
       // STT mis-hearings — "Selena" is the classic Google STT failure
       'selena','salina','celina','celine','salonia','solania','solanas','sue lana','solar',
       'salem','solanya','soul lana','suelena',
       'سولانا','سول','صولانا','صول','سولانه','صولانه'], 'solana', 'SOL', 'Solana')
  add(['bnb','binance coin','binance','b n b','bee n bee','banance','banance coin',
       'بي إن بي','بي ان بي','بينانس','بايننس','بنانس','بنب'], 'binancecoin', 'BNB', 'BNB')
  add(['xrp','ripple','x r p','ex our pee','ex ar p','ex r p','x ah r p','exarp','ex rp',
       'إكس آر بي','اكس ار بي','ريبل','ربيل','ريبيل','ربل'], 'ripple', 'XRP', 'XRP')
  add(['cardano','ada','car the no','cardamom','cardenas','car dano','card dano',
       'كاردانو','ايه دي ايه','كردانو','كاردنو'], 'cardano', 'ADA', 'Cardano')
  add(['dogecoin','doge','the dog','elon coin','dog coin','doggie coin','doggie',
       'dough','dough coin','dosh','dohj',
       'دوج','دوجكوين','دوجي','دوغ','دوغكوين','دوجى','دوغه'], 'dogecoin', 'DOGE', 'Dogecoin')
  add(['shiba','shib','shiba inu','sheba','sheeba','sheeba inu','she bah',
       'شيبا','شيب','شيبه','شيبا اينو'], 'shiba-inu', 'SHIB', 'Shiba Inu')
  add(['pepe','pepe coin','the frog','peppy','pepay','pe pay',
       'بيبي','بيبيه','ببي','بيبى','بيبي كوين'], 'pepe', 'PEPE', 'Pepe')
  add(['polkadot','dot','polka dot','paul ka dot','paul cadot','polka',
       'بولكادوت','دوت','بولكا دوت','بولكادت','بولكدوت'], 'polkadot', 'DOT', 'Polkadot')
  add(['chainlink','link','chain link','jane link','chain leek','change link',
       'تشين لينك','لينك','شين لينك','تشاينلينك','شاين لينك'], 'chainlink', 'LINK', 'Chainlink')
  add(['avalanche','avax','ava lunch','a valance','avalon','avalanche coin','a wax','a vax',
       'أفالانش','أفاكس','افاكس','افلانش','افالانش','افلانتش','افاكش'], 'avalanche-2', 'AVAX', 'Avalanche')
  add(['polygon','matic','pol','poly gone','poly gun','mattic','magic','plastic','mateek',
       'بوليجون','بوليغون','ماتيك','بوليكون','بوليجن','ماتك'], 'matic-network', 'POL', 'Polygon')
  add(['tron','trx','throne','tron coin','t r x',
       'ترون','تي آر إكس','ترونكس','ترن','ترونيكس'], 'tron', 'TRX', 'TRON')
  add(['litecoin','ltc','lite coin','light coin','light kong','l t c',
       'لايتكوين','لايت كوين','لايتكون','لايت كون'], 'litecoin', 'LTC', 'Litecoin')
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
// Arabic entries cover MSA + Gulf (Saudi/Emirati/Kuwaiti/Qatari) + Levantine
// (Syrian/Lebanese/Jordanian/Palestinian) + Egyptian + Maghrebi (Moroccan/
// Algerian/Tunisian) + Iraqi + chat-slang (latinised forms typed by users).
// All entries pass through fullNormalize() so dialectal letter variants
// (ث↔ت, ذ↔د, ق↔ك, etc.) collapse to a single canonical key.
const BUY_WORDS = [
  // ── English: formal + crypto/trader slang + chat shorthand ──
  'buy','bought','buying','buys','buy in','bought in','buying in',
  'get','got','getting','gets',
  'grab','grabbed','grabbing','snag','snagged','snagging',
  'scoop','scooped','scooping','scoop up','scooped up',
  'load up','loaded','loaded up','loading up','load',
  'stack','stacked','stacking','stack sats','stacked sats','stacking sats',
  'ape','aped','aped in','aped into','aping','aping in',
  'yolo','yoloed','yolo into','yolo\'d',
  'long','longed','longing','went long','going long',
  'pick up','picked up','picking up','picked',
  'cop','copped','copping',
  'dca','dca\'d','dca into','dca-ed','dollar cost average','dollar-cost-averaged','dollar cost averaged',
  'accumulate','accumulated','accumulating','accumulation',
  'purchase','purchased','purchasing','purchases',
  'add','added','adding','adds','add to','added to',
  'bag','bagged','bagging','bag up',
  'hodl','hodled','hodling','hold','held','holding',
  'fomo','fomoed','fomo\'d','fomo into','fomoing',
  'snipe','sniped','sniping',
  'nabbed','nabbing','nab',
  'jumped in','jumping in','jump in','dive in','dove in','diving in',
  'hop in','hopped in','hopping in','hopped on',
  'entered','enter','entering','entry',
  'market buy','market-bought','limit buy','swing','swung','swinging',
  'in for','i\'m in','went in','going in',
  'rebought','re-bought','re bought','reentered','re-entered',
  'bull','bullish','went bull','went bullish',
  // ── Arabic: MSA — past / present / imperative ──
  'اشتريت','اشتري','اشترى','اشتروا','نشتري','يشتري','تشتري',
  'شريت','شري','شريته','شريتها','شرينا','اشري',
  'قمت بشراء','قام بشراء','قاموا بشراء','اقوم بشراء','شراء',
  // ── Gulf (Saudi / Emirati / Kuwaiti / Qatari / Bahraini / Omani) ──
  'أخذت','اخذت','أخذ','اخذ','ياخذ','ياخد','خذت','خد','خذ','ماخد','ماخذ',
  'جبت','جبتها','جبته','جايب','جاب','جابها','يجيب','نجيب',
  'حطيت','حط','حطيتها','حطيت فيها','حطيت عليها','اللي حطيت','نحط','يحط',
  'دخلت','داخل','دخل','دخلني','دخلت فيها','نزلت فيها',
  'كومت','كوم','كومت عليها','كومت منها','يكوم','مكوم',
  // ── Levantine (Syrian / Lebanese / Jordanian / Palestinian) ──
  'جمعت','جامع','جمع','يجمع','بجمع','جمعنا','اجمع',
  'كسبت','كاسب','كسب','بكسب','كسبنا',
  'استثمرت','استثمار','مستثمر','يستثمر','استثمرنا','بستثمر','هاستثمر',
  'ضيفت','اضفت','أضفت','زود','زودت','نضيف','بضيف',
  'نزلت','نزلتها','نزل','بنزل','هانزل',
  'لقفت','لقف','تلقفت','بلقف',
  // ── Egyptian — colloquial + slang ──
  'بشتري','هشتري','هاشتري','بحطها','حطها','هحطها',
  'فتت','هاوش','اخدت','هاخد','بخد','بشيل','شلت',
  'دخلت بيها','دخلت بفلوس','صرفت على',
  'باي','بايت','بايد','بايز',
  // ── Maghrebi (Moroccan / Algerian / Tunisian) ──
  'شريت بزاف','شريتها','نشري','نشريو','شراو','شراه','شراها',
  'دزت','دزينا','دز','دزها',
  // ── Iraqi ──
  'كميت','كمي','كميتها','اكمي','كمينا',
  'سويت شراء','اسوي شراء','سوينا شراء',
  // ── Chat-slang (latinised — written by Arabic speakers in English chars) ──
  'eshtarayt','eshtaraitu','eshtreet','eshtryt','ishtaret',
  'sharet','shareit','sharaytu','sharet','shereet',
  'akhadt','akhthet','jbet','jibt','jibtha',
  'hatet','7atet','7attet','daakhal','dakhalt',
  'bashtri','hashtri','hashteri',
  'hodol','hawdal','hodled','bagged it',
  'hodl','hodla'
]

const SELL_WORDS = [
  // ── English: formal + crypto/trader slang + chat shorthand ──
  'sell','sold','selling','sells','sell off','sold off','selling off',
  'dump','dumped','dumping','dumps','dump on','dumped on',
  'exit','exited','exiting','exit out','exited out',
  'cash out','cashed out','cashing out','cash-out',
  'take profits','took profits','taking profits','take profit','took profit','tp','tp\'d','tp-ed','tped',
  'offload','offloaded','offloading','offload some',
  'unload','unloaded','unloading',
  'short','shorted','shorting','went short','going short',
  'rug','rugged','rugging','got rugged',
  'close','closed','closing','close out','closed out',
  'liquidate','liquidated','liquidating','got liquidated',
  'flip','flipped','flipping','flip for profit',
  'ditch','ditched','ditching',
  'drop','dropped','dropping','drop the bag',
  'get out','got out','getting out','gtfo','rugged out',
  'bail','bailed','bailing','bail out','bailed out',
  'jump out','jumped out','jumping out','hopped out',
  'scale out','scaled out','scaling out','sold half','sold some','sold part','sold all',
  'market sell','market-sold','limit sell','stop loss','stop-loss','sl','sl\'d',
  'puked','puking','puke','panic sold','panic-sold','panic sold out',
  'paper hand','paper-handed','paper handed','paper hands','paper-handed it',
  'realised','realized','realised gains','realized gains','took the win','took the loss',
  'rebalanced','rebalanced out','trimmed','trimming','trim','trimmed position',
  'bear','bearish','went bear','went bearish',
  // ── Arabic: MSA — past / present / imperative ──
  'بعت','بعتها','بعته','بعنا','بيعت','بيع','ابيع','بايع','نبيع','يبيع','تبيع',
  'قمت ببيع','قام ببيع','قاموا ببيع','اقوم ببيع','بيع',
  // ── Gulf (Saudi / Emirati / Kuwaiti / Qatari) ──
  'صفيت','صفيتها','صفي','تصفية','نصفي','يصفي',
  'سحبت','سحب','اسحب','سحبتها','سحبت ربح','سحبت فلوس','نسحب','بسحب',
  'فلت','فل','فلتها','فلت بالفلوس','فلت بالربح','نفل','يفل',
  'كسرت','كسر','كسرتها','كسرت الحظ','نكسر','بكسر',
  'خرجت','خروج','اخرج','اخرجت','خرج','خرجت بربح','خرجت بخسارة',
  // ── Levantine (Syrian / Lebanese / Jordanian / Palestinian) ──
  'بعت بربح','اخدت ربح','ربحت','ربح','حصلت ربح','جنيت','جني',
  'تخلصت','اتخلصت','اتخلص','تخلص','نتخلص',
  'طرحت','طرح','اطرح','نطرح','بطرح',
  'رميت','رمى','ارمي','نرمي','بترمي',
  'صرفت','صرف','اصرف','نصرف','بصرف',
  // ── Egyptian — colloquial + slang ──
  'بشيع','هبيع','هبيعها','هبيعه','بيعتها','بعتها بربح','بعتها بخسارة',
  'هطلعها','طلعتها','طلعت','نزلت السوق',
  'هخرج','هخرج بربح','هخرج بخسارة','هاطلع','طلعت كاش',
  'صفيتها كاش','صفيت السوق','سيلت','سيل',
  // ── Maghrebi (Moroccan / Algerian / Tunisian) ──
  'بعتها بزاف','بعنا','نبيعو','بيع بزاف','تبيعهم',
  'فك','فكيت','فكينا','نفك',
  // ── Iraqi ──
  'سويت بيع','اسوي بيع','سوينا بيع','بعتها بفلوس',
  // ── Chat-slang (latinised) ──
  'be3t','baat','beit','beitha','baeat','baea',
  'safet','saffet','sa7abt','sahabt','7arajt','kharajt',
  'tp\'ed','tped','dumped it','rugged it','sold it','flipped it'
]

// ── Word numbers — both languages, fractions included.
// All Arabic keys pass through fullNormalize() at lookup time so
// dialectal forms (ثلاثة/تلاتة/تلاته) merge under a single canonical key.
const AR_NUMBERS_RAW = {
  'صفر':0,
  'واحد':1,'واحده':1,'واحدة':1,'وحده':1,'وحدة':1,'وحد':1,'احد':1,'أحد':1,'واحدا':1,'وحدا':1,
  'اثنين':2,'اثنان':2,'اتنين':2,'تنين':2,'ثنين':2,'اثنينا':2,'إثنين':2,
  'ثلاثة':3,'ثلاثه':3,'ثلاث':3,'تلاته':3,'تلاتة':3,'تلاتت':3,'ثلاثا':3,
  'اربعة':4,'اربعه':4,'اربع':4,'أربعة':4,'أربعه':4,'أربع':4,
  'خمسة':5,'خمسه':5,'خمس':5,'خمسا':5,
  'ستة':6,'سته':6,'ست':6,'ستا':6,
  'سبعة':7,'سبعه':7,'سبع':7,'سبعا':7,
  'ثمانية':8,'ثمانيه':8,'تمانيه':8,'تمانية':8,'تمن':8,'تمانيا':8,
  'تسعة':9,'تسعه':9,'تسع':9,'تسعا':9,
  'عشرة':10,'عشره':10,'عشر':10,'عشرت':10,'عشرا':10,
  'احد عشر':11,'احدعشر':11,'حداشر':11,'حداش':11,
  'اثنا عشر':12,'اتناشر':12,'اطناشر':12,'اتناش':12,
  'تلتاشر':13,'تلتاش':13,'اربعتاشر':14,'خمستاشر':15,'ستاشر':16,'سبعتاشر':17,'تمنتاشر':18,'تسعتاشر':19,
  'عشرين':20,'ثلاثين':30,'تلاتين':30,'اربعين':40,'خمسين':50,'ستين':60,'سبعين':70,'تمانين':80,'تسعين':90,
  'نص':0.5,'نصف':0.5,'نُص':0.5,'نوس':0.5,'نص واحد':0.5,
  'ربع':0.25,'ربعة':0.25,'ربعه':0.25,
  'ثلث':0.333,'تلت':0.333,
  'ميه':100,'مية':100,'مائة':100,'ماءه':100,'مايه':100,'مايتين':200,'ميتين':200,'ميتان':200,
  'الف':1000,'ألف':1000,'الفين':2000,'ألفين':2000,
  'مليون':1000000,'مليونين':2000000,'مليار':1000000000,'بليون':1000000000,
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
  'thirteen':13,'fourteen':14,'fifteen':15,'sixteen':16,'seventeen':17,'eighteen':18,'nineteen':19,
  'twenty':20,'thirty':30,'forty':40,'fifty':50,'sixty':60,'seventy':70,'eighty':80,'ninety':90,
  'hundred':100,'thousand':1000,'million':1000000,'billion':1000000000,'trillion':1000000000000,
  // Slang multipliers used as standalone words
  'grand':1000,'grands':1000,'k':1000,'mil':1000000,'mils':1000000,
  'bil':1000000000,'bils':1000000000,'ticket':1000,'rack':1000,'racks':1000,
  // Fractions
  'half':0.5,'halves':0.5,'a half':0.5,'one half':0.5,
  'quarter':0.25,'quarters':0.25,'a quarter':0.25,'one quarter':0.25,
  'third':0.333,'thirds':0.333,'a third':0.333,'one third':0.333,
  'eighth':0.125,'an eighth':0.125,'one eighth':0.125,
  // Crypto-specific
  'sat':0.00000001,'sats':0.00000001,'satoshi':0.00000001,'satoshis':0.00000001,
  'gwei':0.000000001,
}

function parseNumber(str) {
  if (!str) return null
  const trimmed = str.trim()
  // Plain number with optional unit suffix. Unit must not be followed by
  // a Latin letter (so "b" in "bitcoin" is not picked up as billion).
  // We use a lookahead instead of \b because \b doesn't apply after Arabic chars.
  // Slang multipliers covered: k, m, b, g, grand, mil, bil, rack, racks,
  // ticket, stack (English) and الف, مليون, مليار, بليون, ميه, مية (Arabic).
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(k|m|b|g|grand|grands|mil|mils|bil|bils|rack|racks|ticket|tickets|stack|stacks|thousand|million|billion|trillion|الف|مليون|مليار|بليون|ميه|مية|مائه|مائة)?(?=[^a-zA-Z]|$)/i)
  if (m) {
    let n = parseFloat(m[1].replace(',', '.'))
    const unit = (m[2] || '').toLowerCase()
    if (['k','grand','grands','g','rack','racks','ticket','tickets','stack','stacks','thousand','الف'].includes(unit)) n *= 1000
    else if (['m','mil','mils','million','مليون'].includes(unit)) n *= 1000000
    else if (['b','bil','bils','billion','بليون','مليار'].includes(unit)) n *= 1000000000
    else if (['trillion'].includes(unit)) n *= 1000000000000
    else if (['ميه','مية','مائه','مائة'].includes(unit)) n *= 100
    return n
  }
  // Word numbers (single token) — try both raw and phonetically-normalized form
  const norm = fullNormalize(trimmed)
  if (AR_NUMBERS[norm] != null) return AR_NUMBERS[norm]
  if (EN_NUMBERS[trimmed.toLowerCase()] != null) return EN_NUMBERS[trimmed.toLowerCase()]
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
  'hundred','thousand','million','billion','trillion',
  'grand','grands','mil','mils','bil','bils',
  'rack','racks','ticket','tickets','stack','stacks',
  fullNormalize('ميه'), fullNormalize('ماءه'), fullNormalize('مية'),
  fullNormalize('مائه'), fullNormalize('مائة'),
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
  // Single-letter Arabic prepositions / conjunctions that frequently attach
  // to the following number-word without a space ("وواحد"=and one,
  // "بواحد"=with one, "لواحد"=for one, "فواحد"=so one). Strip them so the
  // number is still detected.
  const AR_PREFIXES = ['و', 'ب', 'ل', 'ف']
  for (const p of phrases) {
    const val = String(all[p])
    out = out.split(' ' + p + ' ').join(' ' + val + ' ')
    if (/[؀-ۿ]/.test(p)) {
      for (const prefix of AR_PREFIXES) {
        out = out.split(' ' + prefix + p + ' ').join(' ' + prefix + ' ' + val + ' ')
      }
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

// ── Payment-leg options (Buy with / Sell for) — mirrors the trade window ───
const BUY_WITH_OPTS  = ['NONE', 'USDT', 'USDC', 'USD', 'BTC', 'EUR']
const SELL_FOR_OPTS  = ['USD', 'USDT', 'USDC', 'BTC', 'EUR', 'REMOVE']
const LEG_LABEL = { NONE: 'None', REMOVE: 'Remove', USDT: 'USDT', USDC: 'USDC', USD: 'USD', BTC: 'BTC', EUR: 'EUR' }

// Build the spend/receive leg for a chosen payment currency, same as the
// trade window: a buy "spends" the leg asset (records a sell), a sell
// "receives" the leg asset (records a buy). Returns null for NONE/REMOVE.
async function buildVoiceLeg(legKey, isBuy, costUsd) {
  const k = (legKey || '').toUpperCase()
  if (!k || k === 'NONE' || k === 'REMOVE' || !costUsd) return null
  const type = isBuy ? 'sell' : 'buy'
  if (k === 'USD')  return { type, coin_id: `${FIAT_PREFIX}usd`, symbol: 'USD',  name: 'US Dollar', category: 'fiat',   amount: costUsd, pricePerUnit: 1 }
  if (k === 'USDT') return { type, coin_id: 'tether',            symbol: 'USDT', name: 'Tether',    category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (k === 'USDC') return { type, coin_id: 'usd-coin',          symbol: 'USDC', name: 'USD Coin',  category: 'crypto', amount: costUsd, pricePerUnit: 1 }
  if (k === 'BTC') {
    try {
      const px = await api.getPrices('bitcoin'); const usd = px?.bitcoin?.usd || 0
      if (usd) return { type, coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'crypto', amount: costUsd / usd, pricePerUnit: usd }
    } catch {}
    return null
  }
  if (k === 'EUR') {
    let eurUsd = 1.08
    try { const r = await api.getPrices(`${FIAT_PREFIX}eur`); eurUsd = r?.[`${FIAT_PREFIX}eur`]?.usd || 1.08 } catch {}
    return { type, coin_id: `${FIAT_PREFIX}eur`, symbol: 'EUR', name: 'Euro', category: 'fiat', amount: costUsd / eurUsd, pricePerUnit: eurUsd }
  }
  return null
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
  '"BTC" or "Bitcoin" — opens edit card to fill in details',
  '"I bought 0.5 Bitcoin at 60k"',
  '"Sold 10 Apple shares at 220"',
  '"Bought 100 Tesla at 280"',
  '"Bought 1 oz of gold"',
]
const EXAMPLES_AR = [
  '"BTC" أو "بيتكوين" — يفتح بطاقة لتكملة التفاصيل',
  '"اشتريت بيتكوين 0.5 بسعر 60 ألف"',
  '"اشتريت 10 ابل بسعر 220"',
  '"اشتريت 100 تيسلا"',
  '"اشتريت 1 ذهب"',
]

// ── Web Speech API support check ───────────────────────────────────────────
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const SUPPORTED = !!SR
// iOS Safari supports webkitSpeechRecognition but stops after each utterance
// (no true continuous mode). We detect iOS to auto-restart on onend.
const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)

// ── Component ───────────────────────────────────────────────────────────────
export default function VoiceImport({ hideTrigger = false, onImported }) {
  const [open, setOpen] = useState(hideTrigger)
  const { lang: appLang } = useLanguage()
  const lang = appLang === 'ar' ? 'ar-sa' : 'en'
  // User-selectable STT language: 'ar' runs ar-SA + ar-EG, 'en' runs en-US only
  // Default matches the app's UI language so English users don't get Arabic recognizers
  const [voiceLang, setVoiceLang] = useState(appLang === 'ar' ? 'ar' : 'en')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [typedText, setTypedText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  // Per-transaction free-text asset search ({ [txIdx]: query })
  const [assetQueries, setAssetQueries] = useState({})
  const [noSpeechHint, setNoSpeechHint] = useState(false)
  // BILINGUAL: we run TWO recognizers in parallel — one for Arabic (ar-SA,
  // covering MSA + Gulf + Levantine + Egyptian dialects) and one for English.
  // Whichever produces a higher-confidence parse wins on screen. This means
  // the user can speak in either language regardless of which one the app UI
  // is set to. On iOS (which only allows one mic recognizer at a time) we
  // automatically degrade to a single recognizer matching the app's UI lang.
  const recsRef = useRef([])
  // Keyed by BCP-47 langCode (e.g. 'ar-SA', 'ar-EG', 'en-US').
  // Multiple Arabic recognizers compete; the best parse wins.
  const transcriptsRef = useRef({})
  const listenTimerRef = useRef(null)
  const noSpeechTimerRef = useRef(null)
  const hasTranscriptRef = useRef(false)
  const listeningRef = useRef(false)
  // Incremented on every startListening call. Each recognizer closure
  // captures its own sessionId; stale callbacks bail out immediately.
  const sessionRef = useRef(0)

  // Score a parsed command — higher means we're more confident the transcript
  // captured a real trade. Used to compare en-US vs ar-SA transcripts.
  const scoreParsed = (parsed) =>
    parsed.transactions.reduce((s, t) =>
      s + (t.type ? 2 : 0) + (t.coin ? 4 : 0) + (t.amount != null ? 3 : 0) + (t.suggestions?.length ? 1 : 0), 0)

  // Collapse Chrome-Android progressive snapshots into a single transcript.
  const buildBestTranscript = (results) => {
    const segments = []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      let best = result[0].transcript
      let bestScore = -1
      const baseline = segments.map(s => s.text).join(' ')
      for (let k = 0; k < result.length; k++) {
        const candidate = (baseline + ' ' + result[k].transcript).trim()
        const score = scoreParsed(parseVoiceCommand(candidate))
        if (score > bestScore) { bestScore = score; best = result[k].transcript }
      }
      const trimmed = best.trim()
      if (!trimmed) continue
      const last = segments[segments.length - 1]
      if (last && trimmed.startsWith(last.text.trim())) {
        last.text = best; last.isFinal = result.isFinal
      } else {
        segments.push({ text: best, isFinal: result.isFinal })
      }
    }
    return segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim()
  }

  const startListening = () => {
    if (!SUPPORTED) {
      track('voice_unsupported', { lang })
      setError('Voice recognition not supported in this browser. Try Chrome or Edge.'); return
    }
    // Stop any lingering recognizers from the previous session.
    recsRef.current.forEach(r => { try { r.stop() } catch {} })
    recsRef.current = []
    transcriptsRef.current = {}

    track('voice_listen_start', { lang })
    setError(''); setTranscript(''); setParsed(null); setReaction(null); setConfirmed(false); setAssetQueries({}); setNoSpeechHint(false)
    hasTranscriptRef.current = false
    clearTimeout(noSpeechTimerRef.current)
    noSpeechTimerRef.current = setTimeout(() => {
      if (!hasTranscriptRef.current) setNoSpeechHint(true)
    }, 10000)
    listeningRef.current = true
    setListening(true)

    const sessionId = ++sessionRef.current
    const isAppArabic = voiceLang === 'ar'

    // 5-minute safety ceiling — stops ALL recognizers.
    clearTimeout(listenTimerRef.current)
    listenTimerRef.current = setTimeout(() => {
      listeningRef.current = false
      setListening(false)
      recsRef.current.forEach(r => { try { r.stop() } catch {} })
    }, 5 * 60 * 1000)

    // Always run Arabic + English recognizers in parallel on non-iOS so the
    // user can speak either language regardless of the UI language selector.
    // ar-SA covers Gulf/MSA, ar-EG covers Egyptian, en-US handles English +
    // phonetic mis-hearings of Arabic words by English STT engines.
    // On iOS only one mic recognizer is allowed — use the selected language.
    const langCodes = IS_IOS
      ? [isAppArabic ? 'ar-SA' : 'en-US']
      : ['ar-SA', 'ar-EG', 'en-US']

    const createRec = (langCode) => {
      const isArabic = langCode.startsWith('ar')
      const rec = new SR()
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = isArabic ? 8 : 5
      rec.lang = langCode

      rec.onstart = () => {
        if (sessionRef.current !== sessionId) return
        listeningRef.current = true; setListening(true)
      }

      rec.onend = () => {
        if (sessionRef.current !== sessionId) return
        // Auto-restart THIS recognizer (not the other one) — iOS / desktop
        // Chrome both end after silence and we want a seamless session.
        if (listeningRef.current) {
          setTimeout(() => {
            if (listeningRef.current && sessionRef.current === sessionId) {
              try { rec.start() } catch {}
            }
          }, 150)
        } else if (recsRef.current.every(r => r === rec || r.__ended)) {
          setListening(false)
        }
        rec.__ended = true
      }

      rec.onerror = e => {
        if (sessionRef.current !== sessionId) return
        // Transient — let onend handle restart.
        if (e.error === 'no-speech' || e.error === 'aborted') return
        // This language isn't installed in the browser — just give up on it
        // silently; the other recognizer can still carry the session.
        if (e.error === 'language-not-supported') return
        // Permission denied / network / other fatal: shut everything down.
        listeningRef.current = false; setListening(false)
        if (e.error === 'not-allowed')
          setError(isAppArabic ? 'تم رفض إذن الميكروفون — اسمح بالوصول وحاول مرة أخرى' : 'Microphone permission denied. Please allow mic access.')
        else if (e.error === 'network')
          setError(isAppArabic ? 'تعذر الاتصال بخدمة التعرف على الصوت — تحقق من الإنترنت وأعد المحاولة' : 'Could not reach speech service — check your connection and try again.')
        else
          setError(isAppArabic ? `خطأ في التعرف على الصوت: ${e.error}` : `Voice error: ${e.error}`)
        recsRef.current.forEach(r => { try { r.stop() } catch {} })
      }

      rec.onresult = e => {
        if (sessionRef.current !== sessionId) return
        const text = buildBestTranscript(e.results)
        transcriptsRef.current[langCode] = text

        // Multi-channel winner pick: parse every stored transcript and take
        // the one with the highest parse score. Ties break on transcript length
        // so the user sees live feedback even before any intent is recognised.
        let winnerText = '', winnerParsed = { transactions: [] }, winnerScore = -1
        for (const [, t] of Object.entries(transcriptsRef.current)) {
          if (!t) continue
          const p = parseVoiceCommand(t)
          const s = scoreParsed(p)
          if (s > winnerScore || (s === winnerScore && t.length > winnerText.length)) {
            winnerText = t; winnerParsed = p; winnerScore = s
          }
        }

        if (winnerText) { hasTranscriptRef.current = true; clearTimeout(noSpeechTimerRef.current); setNoSpeechHint(false) }
        setTranscript(winnerText)
        const anyUseful = winnerParsed.transactions.some(t => t.type || t.coin || t.amount != null || t.suggestions?.length)
        if (anyUseful) {
          setParsed(winnerParsed)
          setReaction(getReaction(winnerText, winnerParsed.transactions[0] || {}))
        }
      }

      return rec
    }

    for (const code of langCodes) {
      try {
        const rec = createRec(code)
        rec.start()
        recsRef.current.push(rec)
      } catch {
        // This recognizer couldn't claim the mic (e.g. iOS / mobile WebView
        // limit of 1 recognizer). Skip and continue with the others.
      }
    }

    if (recsRef.current.length === 0) {
      listeningRef.current = false
      setListening(false)
      setError(isAppArabic
        ? 'تعذر بدء الميكروفون — أعد تحميل الصفحة وحاول مرة أخرى'
        : 'Could not start mic. Please reload and try again.')
    }
  }

  // Symbol → coin object map, built lazily once. Used to convert Claude's
  // ticker output (e.g. "SOL") back into our internal COIN_MAP entry.
  const symbolIndexRef = useRef(null)
  const getSymbolIndex = () => {
    if (symbolIndexRef.current) return symbolIndexRef.current
    const idx = {}
    for (const alias in COIN_MAP) {
      const c = COIN_MAP[alias]
      const key = (c.symbol || '').toUpperCase()
      if (key && !idx[key]) idx[key] = c
    }
    symbolIndexRef.current = idx
    return idx
  }

  const [aiThinking, setAiThinking] = useState(false)

  // Detect whether a transcript is predominantly Arabic or English so the
  // AI prompt uses the right language hint regardless of the UI toggle.
  const detectHintLang = (text) => {
    const arabicChars = (text.match(/[؀-ۿ]/g) || []).length
    return arabicChars > text.length * 0.15 ? 'ar' : 'en'
  }

  // Ask Claude to interpret a transcript the local regex parser couldn't fully
  // resolve. Runs DIRECTLY in the browser with the user's own key (falling back
  // to the serverless endpoint), so it handles multi-trade sentences, dialects,
  // and slang in Arabic + English — e.g. "I bought 1 Bitcoin and 1 Ethereum"
  // becomes two orders. Replaces the parsed result on success; silently keeps
  // the local parse on any failure.
  const tryAiFallback = async (rawText, localComplete = 0, alternatives = []) => {
    if (!rawText || rawText.length < 3) return
    setAiThinking(true)
    setError('')
    try {
      const trades = await parseTradesWithClaude(rawText, detectHintLang(rawText), alternatives)
      if (!trades.length) {
        // AI returned nothing — fall back to the local parser. If it found coins
        // (even without a verb or amount), show them as partial cards so the user
        // can fill in the details, rather than showing a hard error. This handles
        // bare coin names like "Bitcoin" without requiring a Deno redeploy.
        const localParsed = parseVoiceCommand(rawText)
        const hasCoins = localParsed.transactions.some(t => t.coin || t.suggestions?.length)
        if (hasCoins) {
          setParsed(localParsed)
          setReaction(getReaction(rawText, localParsed.transactions[0] || {}))
          return
        }
        if (!parsed?.transactions?.some(t => t.coin && t.type && t.amount != null))
          setError(voiceLang === 'ar' ? 'لم أفهم — أضف فعلاً وكمية، مثال: "اشتريت واحد بيتكوين"' : 'Couldn\'t parse — include a verb & amount, e.g. "I bought 1 Bitcoin"')
        return
      }
      // Claude (with every recognizer transcript to triangulate) is far more
      // reliable than the local regex parser for Arabic dialects and multi-trade
      // sentences, so whenever it returns trades we trust it over the local parse.
      // The local result is only kept when Claude returns nothing (offline/no key),
      // handled by the early return above.
      void localComplete
      const idx = getSymbolIndex()
      const transactions = trades.map(t => {
        const coin = idx[(t.symbol || '').toUpperCase()] || null
        return {
          type: t.type,
          coin,
          amount: typeof t.amount === 'number' ? t.amount : null,
          price: typeof t.price === 'number' ? t.price : null,
          matchedWord: t.type === 'buy' ? 'bought' : t.type === 'sell' ? 'sold' : '',
          // Keep unmatched symbols so the user can resolve them via search,
          // and remember the spoken name to seed that search box.
          coinSymbol: (t.symbol || '').toUpperCase(),
          coinName: t.name || '',
          suggestions: coin ? null : [],
        }
      }).filter(t => t.coin || t.coinSymbol)
      if (!transactions.length) return
      const aiParsed = { original: rawText, transactions }
      setParsed(aiParsed)
      // Pre-fill the asset search for any coin Claude named but we couldn't map
      // to an internal entry, so matching results appear without retyping.
      const seed = {}
      transactions.forEach((t, i) => { if (!t.coin && t.coinName) seed[i] = t.coinName })
      if (Object.keys(seed).length) setAssetQueries(seed)
      setReaction(getReaction(rawText, aiParsed.transactions[0] || {}))
      track('voice_ai_fallback_used', { tx_count: transactions.length })
    } catch {
      // Network / parse error — keep the local parse result
    } finally {
      setAiThinking(false)
    }
  }

  const stopListening = () => {
    clearTimeout(listenTimerRef.current)
    clearTimeout(noSpeechTimerRef.current)
    listeningRef.current = false  // must be false BEFORE stop() so onend doesn't restart
    setListening(false)
    recsRef.current.forEach(r => { try { r.stop() } catch {} })
    track('voice_listen_stop', { lang, has_transcript: transcript ? 'yes' : 'no' })

    // Always ask Claude to interpret the finalized transcript. The local
    // regex parser frequently catches only the FIRST coin in a multi-trade
    // sentence ("1 Bitcoin and 1 Ethereum" → just BTC) and reports it as
    // "complete", so relying on incompleteness alone silently drops trades.
    // Claude is authoritative for multi-trade + dialects; if it returns
    // nothing (no key / offline) we keep whatever the local parser found.
    // Pick the highest-scoring transcript as primary (tiebreak: length).
    // A transcript that parsed 2 clean trades beats a longer garbled one.
    const candidates = Object.values(transcriptsRef.current).filter(Boolean)
    const best = candidates.reduce((bestSoFar, t) => {
      if (!bestSoFar) return t
      const sT    = scoreParsed(parseVoiceCommand(t))
      const sBest = scoreParsed(parseVoiceCommand(bestSoFar))
      return sT > sBest || (sT === sBest && t.length > bestSoFar.length) ? t : bestSoFar
    }, '') || transcript
    const localComplete = (parsed?.transactions || []).filter(t => t.type && t.coin && t.amount != null).length
    // Pass EVERY recognizer's transcript so Claude can triangulate the true
    // utterance — far more accurate than a single best-guess for accented or
    // garbled speech.
    if (best && best.trim().length >= 3) tryAiFallback(best, localComplete, candidates)
  }

  useEffect(() => () => {
    clearTimeout(listenTimerRef.current)
    clearTimeout(noSpeechTimerRef.current)
    recsRef.current.forEach(r => { try { r.stop() } catch {} })
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
  }, [])

  const fetchAndSetPrice = async (idx, coinId) => {
    try {
      const prices = await api.getPrices(coinId)
      const p = prices[coinId]
      const usd = p?.usd ?? p?.price ?? null
      if (usd) updateTx(idx, { price: parseFloat(usd.toFixed(usd >= 1 ? 2 : 8)) })
    } catch {}
  }

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

  // Auto-fetch live price for any tx with a detected coin but no price yet
  const coinKey = (parsed?.transactions || []).map(t => t.coin?.id ?? '').join(',')
  useEffect(() => {
    if (!parsed?.transactions) return
    parsed.transactions.forEach((tx, idx) => {
      if (tx.coin && (tx.price == null || tx.price === 0)) {
        fetchAndSetPrice(idx, tx.coin.id)
      }
    })
  }, [coinKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Append a blank order card so the user can manually build multiple orders.
  const addBlankTx = () => {
    setConfirmed(false)
    setParsed(p => {
      const base = p || { original: transcript || '', transactions: [] }
      return { ...base, transactions: [...base.transactions, { type: 'buy', coin: null, amount: null, price: null, suggestions: null, leg: 'NONE' }] }
    })
  }

  const handleImport = async () => {
    const ready = (parsed?.transactions || []).filter(t => t.coin && t.type && t.amount)
    if (!ready.length) return
    const wallets = loadData('wallets')
    const walletId = parseInt(wallets[0]?.id || 1)
    const txs = loadData('transactions')
    const today = new Date().toISOString().split('T')[0]
    for (const tx of ready) {
      const pricePerUnit = tx.price || 0
      const totalCost = tx.amount * pricePerUnit
      txs.unshift({
        id: bumpId('crypto_tracker_next_tx_id'),
        wallet_id: walletId,
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
      // Buy with / Sell for payment leg (same model as the trade window)
      const legKey = tx.leg ?? (tx.type === 'buy' ? 'NONE' : 'REMOVE')
      const leg = await buildVoiceLeg(legKey, tx.type === 'buy', totalCost)
      if (leg) {
        txs.unshift({
          id: bumpId('crypto_tracker_next_tx_id'),
          wallet_id: walletId,
          type: leg.type, category: leg.category,
          coin_id: leg.coin_id, coin_symbol: leg.symbol, coin_name: leg.name, coin_image: '',
          amount: leg.amount, price_per_unit: leg.pricePerUnit,
          total_cost: leg.amount * leg.pricePerUnit,
          exchange: 'Voice Import',
          notes: tx.type === 'buy' ? `Spent on buying ${tx.coin.symbol}` : `Proceeds from selling ${tx.coin.symbol}`,
          date: today,
          created_at: new Date().toISOString(),
        })
      }
    }
    saveData('transactions', txs)
    trackProfileCreated({ method: 'voice', assetCount: ready.length, source: 'voice_import' })
    track('voice_import_saved', {
      lang,
      tx_count: ready.length,
      multi_tx: ready.length > 1 ? 'yes' : 'no',
      buy_count: ready.filter(t => t.type === 'buy').length,
      sell_count: ready.filter(t => t.type === 'sell').length,
      symbols: ready.map(t => t.coin.symbol?.toUpperCase()).join(','),
    })
    onImported?.()
    setConfirmed(true)
  }

  const isAr = lang.startsWith('ar')
  const readyCount = (parsed?.transactions || []).filter(t => t.coin && t.type && t.amount).length
  const canImport = readyCount > 0

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!hideTrigger && (
        <button
          onClick={() => {
            const next = !open
            setOpen(next)
            if (next) {
              track('voice_import_opened')
              // Auto-start listening + greeting in the SAME user gesture.
              // One tap = panel opens, mic listens, AI greets. No second tap needed.
              startListening()
            }
          }}
          style={{
            background: open ? 'linear-gradient(135deg, rgba(5,150,105,0.18), rgba(16,185,129,0.18))' : 'linear-gradient(135deg, rgba(5,150,105,0.1), rgba(16,185,129,0.1))',
            border: '1px solid rgba(5,150,105,0.35)',
            borderRadius: '12px', color: 'var(--g-ink)',
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
            Import by Voice
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(5,150,105,0.06), rgba(16,185,129,0.06))',
          border: '1px solid rgba(5,150,105,0.2)',
          borderRadius: '16px', padding: '1.25rem', marginTop: '0.6rem',
          backdropFilter: 'blur(12px)',
          direction: isAr ? 'rtl' : 'ltr',
        }}>
          {/* Language hint */}
          <div style={{
            textAlign: 'center', marginBottom: '0.6rem',
            fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            {isAr ? 'اختر لغتك ثم تحدث' : 'Choose your language then speak'}
          </div>

          {/* Language selector — pick Arabic or English before speaking */}
          <div style={{ display:'flex', justifyContent:'center', gap:'0.6rem', marginBottom:'1rem' }}>
            {[
              { value:'ar', flags:'🇸🇦🇪🇬', label: isAr ? 'عربي' : 'Arabic', color:'#f59e0b', bg:'rgba(245,158,11,0.14)', border:'rgba(245,158,11,0.45)' },
              { value:'en', flags:'🇺🇸',     label: isAr ? 'إنجليزي' : 'English', color:'#60a5fa', bg:'rgba(96,165,250,0.14)', border:'rgba(96,165,250,0.45)' },
            ].map(m => {
              const active = voiceLang === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => { if (!listening) setVoiceLang(m.value) }}
                  style={{
                    fontSize:'0.82rem', fontWeight:700, padding:'0.4rem 1.1rem',
                    borderRadius:24, cursor: listening ? 'not-allowed' : 'pointer',
                    border: `2px solid ${active ? m.color : 'rgba(255,255,255,0.1)'}`,
                    background: active ? m.bg : 'transparent',
                    color: active ? m.color : 'var(--text-muted)',
                    display:'flex', alignItems:'center', gap:'0.4rem',
                    transition:'all 0.18s', opacity: listening && !active ? 0.4 : 1,
                  }}
                >
                  <span style={{ fontSize:'1rem', lineHeight:1 }}>{m.flags}</span>
                  {m.label}
                  {active && (
                    <span style={{
                      width:7, height:7, borderRadius:'50%', background:m.color,
                      display:'inline-block', flexShrink:0,
                      boxShadow: listening ? `0 0 8px ${m.color}` : 'none',
                      animation: listening ? 'vi-wave 1s ease-in-out infinite' : 'none',
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Mic button — center */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.7rem', marginBottom:'1rem' }}>
            {/* Waveform bars flanking the mic when idle */}
            <div style={{ display:'flex', alignItems:'center', gap:'0.85rem' }}>
              {/* Left bars */}
              <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                {[['0.7s','12px'],['0.5s','18px'],['0.9s','10px']].map(([delay, h], i) => (
                  <span key={i} style={{
                    display:'inline-block', width:'4px', borderRadius:'3px',
                    height: listening ? h : '6px',
                    background: listening ? 'linear-gradient(to top,#047857,#10b981)' : 'rgba(5,150,105,0.3)',
                    animation: listening ? `vi-wave ${0.6 + i*0.15}s ease-in-out infinite` : 'none',
                    animationDelay: delay,
                    transition:'height 0.3s',
                  }} />
                ))}
              </div>

            <div style={{ position:'relative', width:96, height:96 }}>
              {listening && (
                <>
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(239,68,68,0.5), transparent 70%)',
                    animation:'vi-pulse 1.5s ease-out infinite',
                  }} />
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(220,38,38,0.4), transparent 70%)',
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
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'linear-gradient(135deg, #047857, #10b981)',
                  boxShadow: listening
                    ? '0 0 40px rgba(239,68,68,0.6), inset 0 -3px 0 rgba(0,0,0,0.2)'
                    : '0 8px 24px rgba(5,150,105,0.45), inset 0 -3px 0 rgba(0,0,0,0.2)',
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

              {/* Right bars */}
              <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
                {[['0.8s','10px'],['0.4s','18px'],['1.1s','12px']].map(([delay, h], i) => (
                  <span key={i} style={{
                    display:'inline-block', width:'4px', borderRadius:'3px',
                    height: listening ? h : '6px',
                    background: listening ? 'linear-gradient(to top,#10b981,#047857)' : 'rgba(16,185,129,0.3)',
                    animation: listening ? `vi-wave ${0.6 + i*0.15}s ease-in-out infinite` : 'none',
                    animationDelay: delay,
                    transition:'height 0.3s',
                  }} />
                ))}
              </div>
            </div>

            <p style={{ fontSize:'0.82rem', color: listening ? '#a7f3d0' : 'var(--text)', margin:0, textAlign:'center', fontWeight: listening ? 700 : 500 }}>
              {listening
                ? (isAr ? 'أتحدث الآن…' : 'Listening… speak now')
                : (isAr ? 'اضغط الميكروفون وقل صفقتك' : 'Tap the mic and say your trade')}
            </p>
            <style>{`@keyframes vi-wave { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }`}</style>
          </div>

          {/* Universal type-a-trade box — works on EVERY OS/browser, even ones
              without speech recognition (Firefox, in-app/WebView browsers).
              Runs through the same Claude parser, so multi-trade works here too. */}
          <div style={{ marginBottom:'0.9rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', margin:'0 0 0.4rem', color:'var(--text-sub)', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              <span style={{ flex:1, height:1, background:'rgba(var(--g-rgb),0.15)' }} />
              {isAr ? 'أو اكتب صفقتك' : 'or type your trade'}
              <span style={{ flex:1, height:1, background:'rgba(var(--g-rgb),0.15)' }} />
            </div>
            <div style={{ display:'flex', gap:'0.45rem' }}>
              <input
                type="text"
                value={typedText}
                onChange={e => setTypedText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && typedText.trim().length >= 3 && !aiThinking) { tryAiFallback(typedText.trim(), 0); } }}
                placeholder={isAr ? 'مثال: BTC · بيتكوين · اشتريت واحد بيتكوين' : 'e.g. BTC · Bitcoin · I bought 1 Bitcoin'}
                dir={isAr ? 'rtl' : 'ltr'}
                style={{
                  flex:1, minWidth:0, padding:'0.6rem 0.8rem', borderRadius:'10px',
                  border:'1.5px solid rgba(var(--g-rgb),0.25)', background:'var(--surface-1)',
                  color:'var(--text)', fontSize:'0.84rem', outline:'none',
                }}
              />
              <button
                onClick={() => { if (typedText.trim().length >= 3 && !aiThinking) tryAiFallback(typedText.trim(), 0) }}
                disabled={typedText.trim().length < 3 || aiThinking}
                style={{
                  flexShrink:0, padding:'0 1rem', borderRadius:'10px', border:'none',
                  cursor: (typedText.trim().length < 3 || aiThinking) ? 'not-allowed' : 'pointer',
                  fontWeight:800, fontSize:'0.84rem', color:'#fff',
                  background: (typedText.trim().length < 3 || aiThinking)
                    ? 'rgba(var(--g-rgb),0.3)'
                    : 'linear-gradient(135deg,#047857,#10b981)',
                }}
              >
                {isAr ? 'تحليل' : 'Parse'}
              </button>
            </div>
          </div>

          {/* No-speech hint */}
          {!transcript && noSpeechHint && (
            <div style={{ marginBottom:'0.8rem', padding:'0.55rem 0.9rem', borderRadius:'10px', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)' }}>
              <p style={{ margin:0, fontSize:'0.82rem', color:'#f59e0b', fontWeight:600 }}>
                {isAr
                  ? '⚠️ لم أسمع شيئاً — تحدث بوضوح، أو تحقق من إذن الميكروفون والإنترنت'
                  : '⚠️ Not hearing you — speak clearly, or check mic permission and internet connection'}
              </p>
            </div>
          )}

          {/* AI interpreting indicator */}
          {aiThinking && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem', marginBottom:'0.6rem', padding:'0.5rem 0.9rem', borderRadius:'10px', background:'rgba(129,140,248,0.1)', border:'1px solid rgba(129,140,248,0.3)' }}>
              <span style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(129,140,248,0.35)', borderTopColor:'#818cf8', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
              <span style={{ fontSize:'0.8rem', color:'#818cf8', fontWeight:700 }}>
                {isAr ? '✨ الذكاء الاصطناعي يحلل كلامك…' : '✨ AI is interpreting your trade…'}
              </span>
            </div>
          )}

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
                    <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--g-ink)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      {isAr ? `صفقة ${idx + 1}` : `Trade ${idx + 1}`}
                    </span>
                    <button onClick={() => removeTx(idx)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1rem', lineHeight:1 }}>✕</button>
                  </div>
                )}

                {/* Action toggle */}
                <div style={{ display:'flex', gap:'0.4rem', marginBottom:'0.6rem' }}>
                  {['buy','sell'].map(t => (
                    <button key={t} onClick={() => updateTx(idx, { type: t, leg: t === 'buy' ? 'NONE' : 'REMOVE' })} style={{
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
                          <span style={{ marginInlineStart:'0.4rem', fontSize:'0.66rem', fontWeight:700, padding:'0.1rem 0.4rem', borderRadius:'5px', background:'rgba(52,211,153,0.15)', color:'var(--g-ink)', textTransform:'uppercase' }}>{tx.coin.category}</span>
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
                          <span style={{ fontSize:'0.72rem', color:'var(--g-ink)', fontWeight:600, alignSelf:'center' }}>{isAr ? 'هل تقصد؟' : 'Did you mean?'}</span>
                          {tx.suggestions.map(s => (
                            <button key={s.id} onClick={() => { updateTx(idx, { coin: s, suggestions: null }); fetchAndSetPrice(idx, s.id) }} style={{
                              padding:'0.28rem 0.65rem', borderRadius:'16px', background:'rgba(52,211,153,0.15)', border:'1.5px solid rgba(52,211,153,0.4)',
                              color:'#a7f3d0', fontWeight:700, fontSize:'0.78rem', cursor:'pointer',
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
                          borderRadius:'8px', border:'1.5px solid rgba(52,211,153,0.35)',
                          background:'rgba(255,255,255,0.05)', color:'var(--text)',
                          fontSize:'0.82rem', outline:'none',
                        }}
                      />
                      {assetResults.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginTop:'0.4rem' }}>
                          {assetResults.map(c => (
                            <button key={c.id} onClick={() => { updateTx(idx, { coin: c, suggestions: null }); setAssetQueries(prev => ({...prev, [idx]: ''})); fetchAndSetPrice(idx, c.id) }} style={{
                              padding:'0.28rem 0.65rem', borderRadius:'16px', background:'rgba(5,150,105,0.18)', border:'1.5px solid rgba(5,150,105,0.4)',
                              color:'#a7f3d0', fontWeight:600, fontSize:'0.78rem', cursor:'pointer',
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
                      <span style={{ fontSize:'0.68rem', color:'var(--g-ink)', marginTop:'0.15rem', display:'block' }}>
                        {isAr ? `محوّل من ${tx.unitNote}` : `from ${tx.unitNote}`}
                      </span>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'0.2rem' }}>
                      {isAr ? 'السعر ($)' : 'Price ($)'}
                      {tx.price > 0 && <span style={{ fontSize:'0.65rem', fontWeight:400, color:'#a3e635', marginInlineStart:'0.3rem' }}>{isAr ? '· السوق' : '· market'}</span>}
                    </label>
                    <input
                      type="number" min="0" step="any"
                      value={tx.price ?? ''}
                      onChange={e => {
                        const v = e.target.value === '' ? null : parseFloat(e.target.value)
                        updateTx(idx, { price: isNaN(v) ? null : v })
                      }}
                      placeholder={isAr ? 'جارٍ الجلب…' : 'Fetching…'}
                      style={{
                        width:'100%', boxSizing:'border-box', padding:'0.42rem 0.6rem',
                        borderRadius:'8px', border:'1.5px solid rgba(255,255,255,0.12)',
                        background:'rgba(255,255,255,0.05)', color:'var(--text)',
                        fontSize:'0.85rem', fontFamily:'monospace', outline:'none',
                      }}
                    />
                  </div>
                </div>

                {/* Buy with / Sell for — payment leg selector (mirrors trade window) */}
                {(() => {
                  const isBuyLeg = tx.type !== 'sell'
                  const opts = isBuyLeg ? BUY_WITH_OPTS : SELL_FOR_OPTS
                  const current = tx.leg ?? (isBuyLeg ? 'NONE' : 'REMOVE')
                  return (
                    <div style={{ marginTop:'0.6rem' }}>
                      <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        {isBuyLeg ? (isAr ? 'الدفع بـ' : 'Buy with') : (isAr ? 'البيع مقابل' : 'Sell for')}
                      </span>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginTop:'0.3rem' }}>
                        {opts.map(o => {
                          const active = current === o
                          return (
                            <button key={o} onClick={() => updateTx(idx, { leg: o })} style={{
                              padding:'0.3rem 0.7rem', borderRadius:'16px', cursor:'pointer',
                              fontSize:'0.76rem', fontWeight:700, fontFamily:'inherit',
                              border: `1.5px solid ${active ? 'rgba(52,211,153,0.55)' : 'rgba(255,255,255,0.12)'}`,
                              background: active ? 'rgba(52,211,153,0.16)' : 'transparent',
                              color: active ? 'var(--g-ink)' : 'var(--text-muted)',
                              transition:'all 0.15s',
                            }}>
                              {LEG_LABEL[o] || o}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* Add another order manually */}
          {(parsed || transcript) && !confirmed && (
            <button onClick={addBlankTx} style={{
              width:'100%', marginBottom:'0.65rem',
              background:'transparent', border:'1.5px dashed rgba(52,211,153,0.4)',
              borderRadius:'10px', color:'var(--g-ink)', padding:'0.6rem',
              fontWeight:700, fontSize:'0.83rem', cursor:'pointer',
            }}>
              ＋ {isAr ? 'إضافة صفقة أخرى' : 'Add another order'}
            </button>
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

          {/* Import / confirmed */}
          {confirmed ? (
            <div style={{
              background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.35)',
              borderRadius:'10px', color:'var(--g-ink)',
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
              ⚠️ {IS_IOS
                ? (isAr ? 'افتح التطبيق في Safari على iOS 14.5 أو أحدث لدعم الصوت' : 'Open in Safari (iOS 14.5+) to use voice import.')
                : (isAr ? 'المتصفح لا يدعم التعرف على الصوت' : 'Your browser does not support voice recognition. Try Chrome, Edge, or Safari.')}
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
