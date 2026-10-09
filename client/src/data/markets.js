// Stock markets beyond the US.
//
// A stock id is `stock:` plus its ticker. A US ticker is bare (stock:aapl);
// any other market's ticker carries Yahoo Finance's exchange suffix
// (stock:2222.sr is Saudi Aramco on Tadawul, stock:comi.ca is CIB on the
// Egyptian Exchange). Prices for those come back in the market's own
// currency and are converted to USD before the app sees them, so holdings,
// totals and P&L stay in one currency.
//
// Each market lists its best known names so the picker has something to show
// before anyone types; any other listed company is found through search.

// Yahoo exchange suffix → market code. A dotted ticker whose suffix is not
// here (BRK.B, BF.B) is a US share class, not a foreign listing.
export const SUFFIX_MARKET = {
  SR: 'SA', CA: 'EG', AE: 'AE', AD: 'AE', QA: 'QA', KW: 'KW',
  L: 'GB', DE: 'DE', F: 'DE', PA: 'FR', AS: 'NL', MC: 'ES', MI: 'IT', SW: 'CH',
  NS: 'IN', BO: 'IN', T: 'JP', HK: 'HK', KS: 'KR', KQ: 'KR',
  AX: 'AU', TO: 'CA', V: 'CA', SA: 'BR', IS: 'TR',
  SS: 'CN', SZ: 'CN', TW: 'TW', SI: 'SG', JK: 'ID', KL: 'MY', BK: 'TH',
  JO: 'ZA', MX: 'MX', ST: 'SE', OL: 'NO', CO: 'DK', HE: 'FI', BR: 'BE',
  VI: 'AT', WA: 'PL', NZ: 'NZ', TA: 'IL', BA: 'AR', SN: 'CL',
}

/** The suffix of a foreign listing (2222.SR → SR), or '' for a US ticker. */
export function tickerSuffix(ticker) {
  const m = String(ticker || '').toUpperCase().match(/\.([A-Z]{1,2})$/)
  return m && SUFFIX_MARKET[m[1]] ? m[1] : ''
}
export const isIntlTicker = ticker => !!tickerSuffix(ticker)
export const marketOfTicker = ticker => SUFFIX_MARKET[tickerSuffix(ticker)] || 'US'

const s = (ticker, name) => ({ ticker, name })

// The markets the picker offers, each with its best known names. flag is the
// ISO 3166 code for flag-icons; currency is what Yahoo quotes the market in.
export const MARKETS = [
  { code: 'US', flag: 'us', exchange: 'NYSE · Nasdaq', currency: 'USD', stocks: null }, // the US list lives in POPULAR_TICKERS
  { code: 'SA', flag: 'sa', exchange: 'Tadawul', currency: 'SAR', stocks: [
    s('2222.SR', 'Saudi Aramco'), s('1120.SR', 'Al Rajhi Bank'), s('1180.SR', 'Saudi National Bank'),
    s('2010.SR', 'SABIC'), s('7010.SR', 'stc'), s('2082.SR', 'ACWA Power'), s('1211.SR', "Ma'aden"),
    s('1150.SR', 'Alinma Bank'), s('2280.SR', 'Almarai'), s('4190.SR', 'Jarir'),
  ] },
  { code: 'EG', flag: 'eg', exchange: 'EGX', currency: 'EGP', stocks: [
    s('COMI.CA', 'Commercial International Bank'), s('TMGH.CA', 'Talaat Moustafa Group'),
    s('EAST.CA', 'Eastern Company'), s('HRHO.CA', 'EFG Holding'), s('SWDY.CA', 'Elsewedy Electric'),
    s('ETEL.CA', 'Telecom Egypt'), s('ABUK.CA', 'Abu Qir Fertilizers'), s('FWRY.CA', 'Fawry'),
    s('ORAS.CA', 'Orascom Construction'), s('EFIH.CA', 'e-finance'),
  ] },
  { code: 'AE', flag: 'ae', exchange: 'DFM · ADX', currency: 'AED', stocks: [
    s('EMAAR.AE', 'Emaar Properties'), s('EMIRATESNBD.AE', 'Emirates NBD'), s('DIB.AE', 'Dubai Islamic Bank'),
    s('DEWA.AE', 'DEWA'), s('SALIK.AE', 'Salik'), s('FAB.AD', 'First Abu Dhabi Bank'),
    s('IHC.AD', 'International Holding Co'), s('ALDAR.AD', 'Aldar Properties'), s('EAND.AD', 'e&'),
    s('ADNOCDRILL.AD', 'ADNOC Drilling'),
  ] },
  { code: 'QA', flag: 'qa', exchange: 'QSE', currency: 'QAR', stocks: [
    s('QNBK.QA', 'QNB'), s('IQCD.QA', 'Industries Qatar'), s('QIBK.QA', 'Qatar Islamic Bank'),
    s('ORDS.QA', 'Ooredoo'), s('MARK.QA', 'Masraf Al Rayan'),
  ] },
  { code: 'KW', flag: 'kw', exchange: 'Boursa Kuwait', currency: 'KWD', stocks: [
    s('NBK.KW', 'National Bank of Kuwait'), s('KFH.KW', 'Kuwait Finance House'), s('ZAIN.KW', 'Zain'),
    s('AGLTY.KW', 'Agility'),
  ] },
  { code: 'GB', flag: 'gb', exchange: 'LSE', currency: 'GBP', stocks: [
    s('SHEL.L', 'Shell'), s('AZN.L', 'AstraZeneca'), s('HSBA.L', 'HSBC'), s('ULVR.L', 'Unilever'),
    s('BP.L', 'BP'), s('RIO.L', 'Rio Tinto'), s('GSK.L', 'GSK'), s('BARC.L', 'Barclays'),
    s('LLOY.L', 'Lloyds'), s('VOD.L', 'Vodafone'),
  ] },
  { code: 'DE', flag: 'de', exchange: 'Xetra', currency: 'EUR', stocks: [
    s('SAP.DE', 'SAP'), s('SIE.DE', 'Siemens'), s('ALV.DE', 'Allianz'), s('DTE.DE', 'Deutsche Telekom'),
    s('MBG.DE', 'Mercedes-Benz'), s('BMW.DE', 'BMW'), s('VOW3.DE', 'Volkswagen'), s('BAS.DE', 'BASF'),
    s('ADS.DE', 'adidas'),
  ] },
  { code: 'FR', flag: 'fr', exchange: 'Euronext Paris', currency: 'EUR', stocks: [
    s('MC.PA', 'LVMH'), s('OR.PA', "L'Oréal"), s('TTE.PA', 'TotalEnergies'), s('SAN.PA', 'Sanofi'),
    s('AIR.PA', 'Airbus'), s('RMS.PA', 'Hermès'), s('BNP.PA', 'BNP Paribas'), s('SU.PA', 'Schneider Electric'),
    s('AI.PA', 'Air Liquide'),
  ] },
  { code: 'NL', flag: 'nl', exchange: 'Euronext Amsterdam', currency: 'EUR', stocks: [
    s('ASML.AS', 'ASML'), s('INGA.AS', 'ING'), s('ADYEN.AS', 'Adyen'), s('HEIA.AS', 'Heineken'),
    s('PHIA.AS', 'Philips'), s('PRX.AS', 'Prosus'),
  ] },
  { code: 'ES', flag: 'es', exchange: 'BME', currency: 'EUR', stocks: [
    s('ITX.MC', 'Inditex'), s('SAN.MC', 'Banco Santander'), s('IBE.MC', 'Iberdrola'),
    s('BBVA.MC', 'BBVA'), s('TEF.MC', 'Telefónica'),
  ] },
  { code: 'IT', flag: 'it', exchange: 'Borsa Italiana', currency: 'EUR', stocks: [
    s('RACE.MI', 'Ferrari'), s('ENI.MI', 'Eni'), s('ISP.MI', 'Intesa Sanpaolo'), s('UCG.MI', 'UniCredit'),
    s('ENEL.MI', 'Enel'), s('STLAM.MI', 'Stellantis'),
  ] },
  { code: 'CH', flag: 'ch', exchange: 'SIX', currency: 'CHF', stocks: [
    s('NESN.SW', 'Nestlé'), s('NOVN.SW', 'Novartis'), s('ROG.SW', 'Roche'), s('UBSG.SW', 'UBS'),
    s('ZURN.SW', 'Zurich Insurance'), s('ABBN.SW', 'ABB'),
  ] },
  { code: 'TR', flag: 'tr', exchange: 'Borsa Istanbul', currency: 'TRY', stocks: [
    s('THYAO.IS', 'Turkish Airlines'), s('ASELS.IS', 'Aselsan'), s('KCHOL.IS', 'Koç Holding'),
    s('BIMAS.IS', 'BİM'), s('GARAN.IS', 'Garanti BBVA'), s('AKBNK.IS', 'Akbank'), s('TUPRS.IS', 'Tüpraş'),
  ] },
  { code: 'IN', flag: 'in', exchange: 'NSE', currency: 'INR', stocks: [
    s('RELIANCE.NS', 'Reliance Industries'), s('TCS.NS', 'Tata Consultancy Services'), s('HDFCBANK.NS', 'HDFC Bank'),
    s('INFY.NS', 'Infosys'), s('ICICIBANK.NS', 'ICICI Bank'), s('BHARTIARTL.NS', 'Bharti Airtel'),
    s('SBIN.NS', 'State Bank of India'), s('ITC.NS', 'ITC'), s('LT.NS', 'Larsen & Toubro'),
  ] },
  { code: 'JP', flag: 'jp', exchange: 'Tokyo', currency: 'JPY', stocks: [
    s('7203.T', 'Toyota'), s('6758.T', 'Sony'), s('9984.T', 'SoftBank Group'), s('8306.T', 'MUFG'),
    s('6861.T', 'Keyence'), s('9983.T', 'Fast Retailing'), s('7974.T', 'Nintendo'), s('8035.T', 'Tokyo Electron'),
  ] },
  { code: 'HK', flag: 'hk', exchange: 'HKEX', currency: 'HKD', stocks: [
    s('0700.HK', 'Tencent'), s('9988.HK', 'Alibaba'), s('3690.HK', 'Meituan'), s('1299.HK', 'AIA'),
    s('0005.HK', 'HSBC'), s('0941.HK', 'China Mobile'), s('1810.HK', 'Xiaomi'), s('0939.HK', 'CCB'),
  ] },
  { code: 'KR', flag: 'kr', exchange: 'KRX', currency: 'KRW', stocks: [
    s('005930.KS', 'Samsung Electronics'), s('000660.KS', 'SK hynix'), s('035420.KS', 'NAVER'),
    s('005380.KS', 'Hyundai Motor'), s('051910.KS', 'LG Chem'),
  ] },
  { code: 'AU', flag: 'au', exchange: 'ASX', currency: 'AUD', stocks: [
    s('BHP.AX', 'BHP'), s('CBA.AX', 'Commonwealth Bank'), s('CSL.AX', 'CSL'), s('NAB.AX', 'NAB'),
    s('WBC.AX', 'Westpac'), s('ANZ.AX', 'ANZ'), s('WES.AX', 'Wesfarmers'), s('MQG.AX', 'Macquarie'),
  ] },
  { code: 'CA', flag: 'ca', exchange: 'TSX', currency: 'CAD', stocks: [
    s('RY.TO', 'Royal Bank of Canada'), s('TD.TO', 'TD Bank'), s('SHOP.TO', 'Shopify'), s('ENB.TO', 'Enbridge'),
    s('CNR.TO', 'CN Rail'), s('BN.TO', 'Brookfield'), s('BMO.TO', 'BMO'),
  ] },
  { code: 'BR', flag: 'br', exchange: 'B3', currency: 'BRL', stocks: [
    s('PETR4.SA', 'Petrobras'), s('VALE3.SA', 'Vale'), s('ITUB4.SA', 'Itaú Unibanco'), s('BBDC4.SA', 'Bradesco'),
    s('ABEV3.SA', 'Ambev'), s('WEGE3.SA', 'WEG'), s('B3SA3.SA', 'B3'),
  ] },
]
export const MARKET_BY_CODE = Object.fromEntries(MARKETS.map(m => [m.code, m]))

// Countries without a market of their own here are shown the market most of
// their investors use; everyone else falls back to the US.
const COUNTRY_MARKET = { AT: 'DE', LU: 'DE', BE: 'FR', MC: 'FR', PT: 'ES', IE: 'GB', MO: 'HK', CN: 'HK', NZ: 'AU', BH: 'SA', OM: 'AE' }
/** The market to open for someone in this country (ISO 3166 alpha-2). */
export function marketForCountry(country) {
  const c = String(country || '').toUpperCase()
  if (MARKET_BY_CODE[c]) return c
  return COUNTRY_MARKET[c] || 'US'
}

/** Company name for a listed ticker, when the catalog knows it. */
export function intlStockName(ticker) {
  const t = String(ticker || '').toUpperCase()
  for (const m of MARKETS) for (const x of m.stocks || []) if (x.ticker === t) return x.name
  return ''
}

// Yahoo quotes a few markets in their minor unit: London in pence (GBp),
// Tel Aviv in agorot (ILA), Johannesburg in cents (ZAc).
const MINOR_UNITS = { GBP: ['GBP', 100], GBX: ['GBP', 100], GBp: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100] }
/** A quote's price in the currency's main unit: { price, currency }. */
export function toMajorUnit(price, currency) {
  const c = String(currency || 'USD')
  if (c === 'GBp' || c === 'GBX' || c === 'ILA' || c === 'ZAc' || c === 'ZAC') {
    const [major, div] = MINOR_UNITS[c]
    return { price: price / div, currency: major }
  }
  return { price, currency: c.toUpperCase() }
}

// Region from the device's language (ar-EG → EG), then its time zone.
const TZ_COUNTRY = {
  'Asia/Riyadh': 'SA', 'Africa/Cairo': 'EG', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM', 'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Zurich': 'CH', 'Europe/Istanbul': 'TR',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Tokyo': 'JP', 'Asia/Hong_Kong': 'HK', 'Asia/Seoul': 'KR',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Sao_Paulo': 'BR',
}
export function countryFromDevice(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  for (const l of [...(nav.languages || []), nav.language].filter(Boolean)) {
    const m = String(l).match(/[-_]([A-Za-z]{2})$/)
    if (m) return m[1].toUpperCase()
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz]
  } catch {}
  return ''
}
