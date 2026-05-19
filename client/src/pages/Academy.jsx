import { useState, useEffect, useRef, useCallback } from 'react'
import { track } from '../analytics'

// ── Persistence helpers ───────────────────────────────────────────────────
const STORE_KEY = 'wl_academy_v1'
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch {} }

function getTodayStr() { return new Date().toISOString().split('T')[0] }

// ── Question bank ─────────────────────────────────────────────────────────
const QUESTIONS = [
  // Crypto basics
  { q: 'What does "HODL" mean in crypto?', opts: ['Hold On for Dear Life', 'High Order Digital Ledger', 'Hash On Distributed Layer', 'Hedge On Digital Limit'], a: 0, cat: 'Crypto', exp: 'HODL originated from a misspelled "hold" post in 2013. It means keeping assets long-term through volatility.' },
  { q: 'What is a blockchain?', opts: ['A type of crypto wallet', 'A chain of encrypted data blocks shared across a network', 'A trading platform', 'A type of mining hardware'], a: 1, cat: 'Crypto', exp: 'A blockchain is a distributed ledger where data is stored in blocks chained together cryptographically — making it tamper-resistant.' },
  { q: 'What is a "gas fee" in Ethereum?', opts: ['A fee for converting ETH to USD', 'Energy cost of mining', 'A fee paid to validators for processing transactions', 'A tax on DeFi profits'], a: 2, cat: 'Crypto', exp: 'Gas fees compensate validators for the computational work of processing and confirming transactions on Ethereum.' },
  { q: 'What does "DeFi" stand for?', opts: ['Digital Finance', 'Decentralized Finance', 'Distributed Fiat', 'Direct Finance'], a: 1, cat: 'DeFi', exp: 'DeFi (Decentralized Finance) refers to financial services built on blockchain without traditional intermediaries like banks.' },
  { q: 'What is a "seed phrase"?', opts: ['A password for an exchange', 'A 12-24 word phrase that recovers your wallet', 'A type of staking reward', 'An NFT minting code'], a: 1, cat: 'Security', exp: 'Your seed phrase is the master key to your wallet. Anyone with it can access all your funds. Never share it.' },
  { q: 'What is "market cap" in crypto?', opts: ['The total trading volume in 24h', 'Price × circulating supply', 'The highest ever price reached', 'The total number of wallets holding a coin'], a: 1, cat: 'Markets', exp: 'Market cap = price × circulating supply. It represents the total value of all coins in circulation and is used to rank coins.' },
  { q: 'What is a "honeypot" in crypto?', opts: ['A wallet that rewards holders', 'A token you can buy but not sell', 'A DeFi yield strategy', 'A type of cold wallet'], a: 1, cat: 'Security', exp: 'A honeypot is a scam token designed so users can buy but a hidden contract prevents them from selling — stealing their funds.' },
  { q: 'What does "ATH" stand for?', opts: ['Average Trade High', 'All-Time High', 'Annual Token History', 'Automated Trading Hub'], a: 1, cat: 'Markets', exp: 'ATH (All-Time High) is the highest price a coin has ever reached. Being far below ATH can signal either opportunity or permanent decline.' },
  { q: 'What is "DCA" in investing?', opts: ['Direct Crypto Access', 'Dollar Cost Averaging — buying fixed amounts regularly', 'Decentralized Capital Allocation', 'Digital Currency Accounting'], a: 1, cat: 'Strategy', exp: 'DCA (Dollar Cost Averaging) means investing a fixed amount at regular intervals. It removes the pressure of timing the market.' },
  { q: 'What is a "rug pull"?', opts: ['A market correction', 'When developers abandon a project and take investor funds', 'A type of flash crash', 'A forced liquidation'], a: 1, cat: 'Security', exp: 'A rug pull is when project developers suddenly withdraw all liquidity or sell their tokens, leaving investors with worthless assets.' },
  // Risk management
  { q: 'What does "diversification" mean in investing?', opts: ['Buying only Bitcoin', 'Spreading investments across different assets to reduce risk', 'Trading on multiple exchanges', 'Holding only stablecoins'], a: 1, cat: 'Risk', exp: 'Diversification reduces risk by ensuring no single bad investment can destroy your portfolio. "Don\'t put all eggs in one basket."' },
  { q: 'What is a "stop-loss"?', opts: ['A limit on how much you can deposit', 'A pre-set order to sell if price drops to a level to limit losses', 'A fee charged by exchanges', 'A type of smart contract'], a: 1, cat: 'Risk', exp: 'A stop-loss automatically sells your position if price drops to your set level, preventing further losses beyond your tolerance.' },
  { q: 'What does "position sizing" mean?', opts: ['The screen size for trading apps', 'Deciding how much of your portfolio to put into one trade', 'The number of coins in a trade', 'The physical size of your ledger device'], a: 1, cat: 'Risk', exp: 'Position sizing determines how much capital you risk per trade. Most professionals risk only 1-2% of their portfolio per position.' },
  { q: 'If a coin drops 50%, how much does it need to rise to break even?', opts: ['50%', '75%', '100%', '25%'], a: 2, cat: 'Math', exp: 'After a 50% drop, $100 becomes $50. To return to $100, it needs to double — a 100% gain. Losses are asymmetric!' },
  { q: 'What is "volatility" in crypto?', opts: ['The speed of transactions', 'The range and frequency of price swings', 'The number of daily trades', 'The supply inflation rate'], a: 1, cat: 'Risk', exp: 'High volatility means large, rapid price swings. Crypto is typically much more volatile than stocks or bonds.' },
  { q: 'What is "liquidity" in a token?', opts: ['How new the token is', 'How easily it can be bought or sold without moving the price significantly', 'The number of developers', 'The staking reward rate'], a: 1, cat: 'Markets', exp: 'High liquidity means large orders can be filled without major price impact. Low liquidity = hard to exit without crashing the price.' },
  { q: 'What is "concentration risk"?', opts: ['Danger of holding too many assets', 'Risk of having too much capital in one asset or sector', 'The risk of using centralised exchanges', 'Mining pool risk'], a: 1, cat: 'Risk', exp: 'Concentration risk means one bad investment can severely damage your total portfolio. Aim to keep no single asset above 20-30%.' },
  { q: 'What is "unrealised P&L"?', opts: ['Profits from closed trades', 'Gains or losses on open positions not yet sold', 'Fees paid to exchanges', 'Tax owed on gains'], a: 1, cat: 'Strategy', exp: 'Unrealised P&L is profit or loss that only exists on paper — you haven\'t sold yet so it isn\'t locked in. It can still reverse.' },
  // Psychology
  { q: 'What is "FOMO" in trading?', opts: ['Fundamental On-chain Market Overview', 'Fear Of Missing Out — buying impulsively when prices rise', 'A type of order book entry', 'Fast Order Market Operation'], a: 1, cat: 'Psychology', exp: 'FOMO causes investors to buy near tops because they fear missing a rally. It\'s one of the most common and costly emotional mistakes.' },
  { q: 'What is "FUD" in crypto?', opts: ['Fear, Uncertainty, Doubt — negative sentiment', 'Fundamental Utility Data', 'Fast Unwind Distribution', 'Fixed Utility Derivative'], a: 0, cat: 'Psychology', exp: 'FUD describes negative, often exaggerated information that causes panic selling. Learn to separate facts from FUD.' },
  { q: 'What does "buying the dip" mean?', opts: ['Selling when price rises', 'Purchasing an asset after its price has dropped', 'A type of margin trade', 'Buying at all-time highs'], a: 1, cat: 'Strategy', exp: 'Buying the dip means purchasing an asset after a price decline, with the expectation it will recover. Only works if the asset has strong fundamentals.' },
  { q: 'What is "capitulation" in markets?', opts: ['A breakout to new highs', 'Mass panic selling as investors give up', 'A bullish reversal pattern', 'A type of exchange listing'], a: 1, cat: 'Psychology', exp: 'Capitulation is when investors panic-sell regardless of losses. It often marks market bottoms — the "maximum pain" point.' },
  { q: 'What is "diamond hands"?', opts: ['A type of hardware wallet', 'Holding an asset through extreme volatility without selling', 'A DeFi protocol', 'An NFT collection'], a: 1, cat: 'Psychology', exp: 'Diamond hands means holding strong through huge dips and not panic selling. Opposite of "paper hands" (selling at first sign of loss).' },
  // Markets & coins
  { q: 'What is Bitcoin\'s maximum supply?', opts: ['100 million BTC', '21 million BTC', '1 billion BTC', 'Unlimited'], a: 1, cat: 'Crypto', exp: 'Bitcoin has a hard cap of 21 million coins — enforced by its code. This scarcity is a key part of its value proposition.' },
  { q: 'What is Ethereum\'s main innovation over Bitcoin?', opts: ['Faster transactions', 'Smart contracts — programmable self-executing agreements', 'Lower fees', 'Better privacy'], a: 1, cat: 'Crypto', exp: 'Ethereum introduced smart contracts in 2015, enabling decentralized applications (dApps), DeFi, NFTs, and much more.' },
  { q: 'What is a "stablecoin"?', opts: ['Any coin under $1', 'A cryptocurrency pegged to a stable asset like USD', 'A coin with low volatility ranking', 'A government-issued crypto'], a: 1, cat: 'Crypto', exp: 'Stablecoins (USDT, USDC, DAI) maintain a peg to a real-world asset. They provide stability within crypto ecosystems.' },
  { q: 'What is "proof of stake" (PoS)?', opts: ['Mining with computers', 'Validators lock up coins as collateral to validate transactions', 'A security audit process', 'A type of exchange listing process'], a: 1, cat: 'Crypto', exp: 'PoS replaces energy-intensive mining. Validators stake coins as collateral — bad actors lose their stake (slashing).' },
  { q: 'What is the "Fear & Greed Index"?', opts: ['A government report on crypto regulation', 'A market sentiment score from 0 (extreme fear) to 100 (extreme greed)', 'A volatility measure for Bitcoin only', 'An exchange liquidity score'], a: 1, cat: 'Markets', exp: 'The Fear & Greed Index aggregates volatility, volume, social media, surveys, and dominance data into a 0-100 sentiment score.' },
  { q: 'What is "slippage" in crypto trading?', opts: ['A fee for fast withdrawals', 'The difference between expected and actual execution price', 'Exchange downtime', 'A staking penalty'], a: 1, cat: 'Markets', exp: 'Slippage occurs when your order fills at a different price than expected — common in low-liquidity tokens or large orders.' },
  { q: 'What does "on-chain" mean?', opts: ['Data stored in a centralised database', 'Transactions and data recorded directly on the blockchain', 'Tokens listed on major exchanges', 'Smart contracts deployed to mainnet'], a: 1, cat: 'Crypto', exp: 'On-chain refers to activity recorded on the actual blockchain — fully transparent, verifiable, and immutable.' },
  { q: 'What is a "whale" in crypto?', opts: ['A pump-and-dump scheme', 'An entity holding a very large amount of a cryptocurrency', 'A high-frequency trading bot', 'A type of DEX trade'], a: 1, cat: 'Markets', exp: 'Whales hold enough crypto to significantly move markets with their trades. Tracking whale activity can signal market direction.' },
  // Security
  { q: 'What is a "cold wallet"?', opts: ['A wallet for storing stablecoins', 'A hardware or paper wallet not connected to the internet', 'An exchange wallet', 'A wallet with frozen funds'], a: 1, cat: 'Security', exp: 'Cold wallets (Ledger, Trezor, paper wallets) keep private keys offline — immune to online hacks. Best for long-term storage.' },
  { q: 'What is "2FA"?', opts: ['Two-Factor Authentication — a second verification step', 'Two-Fee Access for VIP traders', 'Dual Funding Allocation', 'Second-layer blockchain technology'], a: 0, cat: 'Security', exp: '2FA adds a second verification step (usually a time-based code) beyond your password. Always enable it on exchanges.' },
  { q: 'Which of these is SAFEST to click on?', opts: ['An email saying your exchange account is locked', 'A link from a friend\'s hacked social media', 'The official exchange URL typed manually', 'A Google ad for your exchange'], a: 2, cat: 'Security', exp: 'Always type URLs manually or use saved bookmarks. Phishing sites look identical to real exchanges. Emails and ads are common attack vectors.' },
  { q: 'What happens if you lose your seed phrase?', opts: ['You can recover it from the exchange', 'You permanently lose access to your wallet and funds', 'Customer support can reset it', 'You can regenerate it with your email'], a: 1, cat: 'Security', exp: 'Seed phrases are generated once and cannot be recovered. Losing it means losing your wallet permanently. Store it offline and securely.' },
  // DeFi
  { q: 'What is "yield farming"?', opts: ['Mining crypto using solar energy', 'Lending or providing liquidity to earn rewards', 'A long-term holding strategy', 'Generating NFTs for passive income'], a: 1, cat: 'DeFi', exp: 'Yield farming involves providing liquidity or lending crypto to protocols in exchange for interest or governance token rewards.' },
  { q: 'What is "impermanent loss"?', opts: ['A loss from a failed smart contract', 'Temporary loss from providing liquidity due to price changes', 'A fee for early unstaking', 'Loss from a hack on a DEX'], a: 1, cat: 'DeFi', exp: 'Impermanent loss happens when the price ratio of your liquidity pool tokens changes from when you deposited — reducing your value vs just holding.' },
  { q: 'What is a "DEX"?', opts: ['Decentralized Exchange — trades occur via smart contracts, no middleman', 'Digital Exchange with extra security', 'Direct Execution exchange', 'A type of blockchain wallet'], a: 0, cat: 'DeFi', exp: 'DEXs (Uniswap, dYdX, PancakeSwap) allow peer-to-peer trading via smart contracts — no KYC, no custodian, full self-custody.' },
  // Strategy
  { q: 'What is a "sell target"?', opts: ['The maximum price you paid', 'A pre-planned price at which you intend to take profit', 'The price an exchange charges to sell', 'A limit order that prevents selling below cost'], a: 1, cat: 'Strategy', exp: 'Setting sell targets before buying removes emotion from decisions. Plan your exit before you enter — not during a rally.' },
  { q: 'What does "taking profit" mean?', opts: ['Calculating total gains', 'Selling some or all of a position to lock in gains', 'Moving gains to a savings account', 'Reinvesting all gains'], a: 1, cat: 'Strategy', exp: 'Taking profit means selling while in the green to lock in real gains. Many investors watch profits disappear by never selling.' },
  { q: 'What is the best strategy during a bear market?', opts: ['Sell everything at a loss', 'Use maximum leverage to recover losses faster', 'DCA into quality assets and build for the next cycle', 'Buy only meme coins for quick recovery'], a: 2, cat: 'Strategy', exp: 'Bear markets reward disciplined accumulators. DCA into high-conviction assets, manage risk, and avoid leverage until conditions improve.' },
  { q: 'What is "rebalancing" a portfolio?', opts: ['Moving all funds to one asset', 'Adjusting allocations back to target weights by buying/selling', 'Closing all positions', 'Switching exchanges'], a: 1, cat: 'Strategy', exp: 'Rebalancing restores your target allocation. If BTC grows to 80% of your portfolio from 50%, you sell some and buy underweight assets.' },
  // Math / calculation
  { q: 'If you invest $1,000 and it grows to $3,000, what is your ROI?', opts: ['200%', '300%', '150%', '100%'], a: 0, cat: 'Math', exp: 'ROI = (Final - Initial) / Initial × 100 = (3000 - 1000) / 1000 × 100 = 200%. The profit is $2,000 on a $1,000 investment.' },
  { q: 'What does a volume/market cap ratio above 10% indicate?', opts: ['The coin is overvalued', 'High liquidity and strong trading interest', 'The coin is about to be delisted', 'Low investor confidence'], a: 1, cat: 'Markets', exp: 'Volume/market cap > 10% signals active trading and good liquidity — making it easier to enter or exit large positions.' },
  { q: 'What is "break-even price"?', opts: ['The price when a coin was first listed', 'The price you need to sell at to recover your investment', 'The 52-week average price', 'The price after deducting exchange fees'], a: 1, cat: 'Math', exp: 'Break-even is your average buy price — the price you need to reach to recover what you invested. Below it you\'re at a loss.' },
]

// Shuffle deterministically by day so everyone gets the same daily question
function getDailyQuestion() {
  const daysSinceEpoch = Math.floor(Date.now() / 86400000)
  return QUESTIONS[daysSinceEpoch % QUESTIONS.length]
}

// ── Game: Crypto Guessr ───────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const GUESSR_COINS = [
  { name: 'Bitcoin',   symbol: 'BTC', emoji: '🟠', clues: ['I was created in 2009 by an anonymous person', 'My supply is capped at 21 million coins', 'I pioneered the blockchain technology', 'I am the largest cryptocurrency by market cap', 'My symbol comes from the first letter of my name'], wrong: ['Ethereum', 'Litecoin', 'Monero'] },
  { name: 'Ethereum',  symbol: 'ETH', emoji: '💎', clues: ['I introduced smart contracts to the world', 'Vitalik Buterin co-created me in 2015', 'I transitioned from Proof of Work to Proof of Stake', 'DeFi and NFTs were born on my network', 'Gas fees are paid in my native token'], wrong: ['Solana', 'Cardano', 'Avalanche'] },
  { name: 'Solana',    symbol: 'SOL', emoji: '🌊', clues: ['I can process over 65,000 transactions per second', 'I use a Proof of History consensus mechanism', 'I am known for extremely low transaction fees', 'I was founded by Anatoly Yakovenko in 2020', 'FTX\'s collapse caused my price to crash heavily'], wrong: ['Ethereum', 'Avalanche', 'Polkadot'] },
  { name: 'Dogecoin',  symbol: 'DOGE', emoji: '🐶', clues: ['I started as an internet meme in 2013', 'My logo features a Shiba Inu dog', 'Elon Musk tweets about me frequently', 'I was created by Billy Markus and Jackson Palmer', 'I have no supply cap — new coins are minted every block'], wrong: ['Shiba Inu', 'Floki', 'SafeMoon'] },
  { name: 'XRP',       symbol: 'XRP', emoji: '💧', clues: ['I was designed for fast cross-border payments', 'Ripple Labs created and holds a large supply of me', 'Banks use my network for international settlements', 'The SEC sued my creator claiming I am a security', 'Transactions on my network settle in 3-5 seconds'], wrong: ['Stellar', 'Litecoin', 'SWIFT'] },
  { name: 'Cardano',   symbol: 'ADA', emoji: '🔵', clues: ['My name comes from an Italian mathematician', 'Charles Hoskinson co-founded Ethereum before creating me', 'I use peer-reviewed academic research for development', 'My native token is named after Ada Lovelace', 'I use the Ouroboros Proof of Stake protocol'], wrong: ['Polkadot', 'Algorand', 'Tezos'] },
  { name: 'Chainlink', symbol: 'LINK', emoji: '🔗', clues: ['I connect smart contracts to real-world data', 'I am the leading decentralized oracle network', 'Without me, smart contracts would be blind to off-chain events', 'My nodes are run by independent node operators', 'Price feeds for DeFi protocols rely heavily on me'], wrong: ['The Graph', 'Band Protocol', 'API3'] },
  { name: 'Polkadot',  symbol: 'DOT', emoji: '⚫', clues: ['Gavin Wood, an Ethereum co-founder, created me', 'I enable different blockchains to communicate with each other', 'Projects build on me by renting "parachain" slots', 'My relay chain coordinates the whole network', 'I use a nominated Proof of Stake consensus'], wrong: ['Cosmos', 'Avalanche', 'Kusama'] },
  { name: 'Avalanche', symbol: 'AVAX', emoji: '🔺', clues: ['I can finalize transactions in under 2 seconds', 'I launched in 2020 and quickly became an Ethereum rival', 'I have three built-in blockchains: X, P, and C chains', 'I use the Avalanche consensus protocol', 'My name suggests speed and force'], wrong: ['Solana', 'Fantom', 'Near Protocol'] },
  { name: 'Uniswap',   symbol: 'UNI', emoji: '🦄', clues: ['My mascot is a mythical horse with a horn', 'I am the most popular decentralized exchange on Ethereum', 'I use an Automated Market Maker model', 'I replaced order books with liquidity pools', 'Hayden Adams launched me in 2018'], wrong: ['SushiSwap', 'Curve', 'Balancer'] },
  { name: 'Shiba Inu', symbol: 'SHIB', emoji: '🐕', clues: ['I was created anonymously in 2020 as a DOGE competitor', 'Half my supply was sent to Vitalik Buterin who burned most of it', 'My community calls themselves the "SHIB Army"', 'I trade at fractions of a cent with trillions in supply', 'I have a DEX called ShibaSwap'], wrong: ['Dogecoin', 'Floki', 'Baby Doge'] },
  { name: 'Tether',    symbol: 'USDT', emoji: '💵', clues: ['I am pegged 1:1 to the US Dollar', 'I am the largest stablecoin by market cap', 'Tether Limited issues and backs me', 'I am the most traded cryptocurrency by volume', 'Controversy surrounds whether I am fully backed by reserves'], wrong: ['USD Coin', 'DAI', 'BUSD'] },
  { name: 'Litecoin',  symbol: 'LTC', emoji: '🥈', clues: ['Charlie Lee, a former Google engineer, created me', 'I was launched in 2011 as the "silver to Bitcoin\'s gold"', 'I have a max supply of 84 million coins', 'My block time is 4x faster than Bitcoin', 'I use the Scrypt hashing algorithm'], wrong: ['Bitcoin Cash', 'Bitcoin SV', 'Dash'] },
  { name: 'Cosmos',    symbol: 'ATOM', emoji: '🌌', clues: ['My vision is an "Internet of Blockchains"', 'I let independent chains communicate via IBC protocol', 'Tendermint BFT is my core consensus engine', 'My hub-and-zone architecture powers cross-chain transfers', 'Jae Kwon and Ethan Buchman co-founded me'], wrong: ['Polkadot', 'Algorand', 'Harmony'] },
  { name: 'NEAR Protocol', symbol: 'NEAR', emoji: '🌐', clues: ['I use human-readable account names like "alice.near"', 'My sharding approach is called Nightshade', 'I focus on developer and user experience above all', 'I am carbon neutral and environmentally friendly', 'Aurora, an Ethereum-compatible layer, runs on top of me'], wrong: ['Fantom', 'Harmony', 'Algorand'] },
]

const GUESSR_ROUNDS = 5

function CryptoGuessr({ onIqGain }) {
  const [phase, setPhase] = useState('idle') // idle | playing | over
  const [round, setRound] = useState(0)
  const [clueIdx, setClueIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [roundResult, setRoundResult] = useState(null) // null | 'correct' | 'wrong'
  const [chosen, setChosen] = useState(null)
  const [coins, setCoins] = useState([])
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem('wl_guessr_hs') || '0') } catch { return 0 }
  })

  function startGame() {
    const picked = shuffle(GUESSR_COINS).slice(0, GUESSR_ROUNDS)
    setCoins(picked)
    setRound(0); setClueIdx(0); setScore(0); setRoundResult(null); setChosen(null)
    setPhase('playing')
    track('guessr_start')
  }

  function getOptions(coin) {
    const wrongs = shuffle(coin.wrong).slice(0, 3)
    return shuffle([coin.name, ...wrongs])
  }

  function revealClue() {
    if (clueIdx < 4) setClueIdx(c => c + 1)
  }

  function handleGuess(name) {
    if (roundResult !== null) return
    const coin = coins[round]
    const correct = name === coin.name
    const pts = correct ? [50, 40, 30, 20, 10][clueIdx] : 0
    setChosen(name)
    setRoundResult(correct ? 'correct' : 'wrong')
    if (pts > 0) setScore(s => s + pts)
  }

  function nextRound() {
    if (round + 1 >= GUESSR_ROUNDS) {
      endGame()
    } else {
      setRound(r => r + 1)
      setClueIdx(0)
      setRoundResult(null)
      setChosen(null)
    }
  }

  function endGame() {
    setPhase('over')
    const finalScore = score
    if (finalScore > highScore) {
      setHighScore(finalScore)
      try { localStorage.setItem('wl_guessr_hs', String(finalScore)) } catch {}
    }
    const iqGain = Math.floor(finalScore / 5)
    if (iqGain > 0) onIqGain(iqGain)
    track('guessr_end', { score: finalScore })
  }

  if (phase === 'idle') {
    return (
      <div className="guessr-idle">
        <div className="guessr-idle-icon">🕵️</div>
        <div className="guessr-idle-title">Crypto Guessr</div>
        <div className="guessr-idle-sub muted">
          A mystery coin is described clue by clue.<br />
          Guess earlier = more points. 5 rounds per game.
        </div>
        <div className="guessr-pts-table">
          {['50 pts — 1st clue', '40 pts — 2nd clue', '30 pts — 3rd clue', '20 pts — 4th clue', '10 pts — 5th clue'].map(r => (
            <div key={r} className="guessr-pts-row muted">{r}</div>
          ))}
        </div>
        <div className="blitz-hs-row">
          <span className="muted">Best score:</span>
          <span className="blitz-hs">{highScore} pts</span>
        </div>
        <button className="blitz-start-btn" onClick={startGame}>Start Game 🕵️</button>
      </div>
    )
  }

  if (phase === 'over') {
    const isNewHs = score >= highScore && score > 0
    return (
      <div className="blitz-over">
        <div className="blitz-over-icon">{isNewHs ? '🏆' : '🕵️'}</div>
        <div className="blitz-over-score">{score}</div>
        <div className="blitz-over-label">points</div>
        {isNewHs && <div className="blitz-new-hs">🎉 New high score!</div>}
        <div className="blitz-iq-gain muted">+{Math.floor(score / 5)} IQ earned</div>
        <div className="blitz-hs-row">
          <span className="muted">Best:</span>
          <span className="blitz-hs">{Math.max(score, highScore)} pts</span>
        </div>
        <button className="blitz-start-btn" onClick={startGame}>Play Again 🕵️</button>
      </div>
    )
  }

  const coin = coins[round]
  if (!coin) return null
  const clues = coin.clues.slice(0, clueIdx + 1)
  const options = getOptions(coin)
  const ptsAvailable = [50, 40, 30, 20, 10][clueIdx]

  return (
    <div className="guessr-playing">
      <div className="guessr-header">
        <div className="guessr-round muted">Round {round + 1} / {GUESSR_ROUNDS}</div>
        <div className="guessr-score-pill">{score} pts</div>
      </div>

      <div className="guessr-mystery-coin">
        <div className="guessr-mystery-icon">❓</div>
        <div className="guessr-mystery-label">Mystery Coin</div>
        <div className="guessr-pts-badge">+{ptsAvailable} pts if correct now</div>
      </div>

      <div className="guessr-clues">
        {clues.map((clue, i) => (
          <div key={i} className="guessr-clue">
            <span className="guessr-clue-num">{i + 1}</span>
            <span>{clue}</span>
          </div>
        ))}
      </div>

      {roundResult === null && clueIdx < 4 && (
        <button className="guessr-reveal-btn" onClick={revealClue}>
          Reveal next clue (−10 pts)
        </button>
      )}

      {roundResult === null && (
        <div className="guessr-options">
          {options.map(name => (
            <button key={name} className="guessr-option" onClick={() => handleGuess(name)}>
              {name}
            </button>
          ))}
        </div>
      )}

      {roundResult !== null && (
        <div className={`guessr-result ${roundResult === 'correct' ? 'guessr-result-correct' : 'guessr-result-wrong'}`}>
          <div className="guessr-result-row">
            <span>{roundResult === 'correct' ? '✅' : '❌'}</span>
            <span>
              {roundResult === 'correct'
                ? `Correct! +${ptsAvailable} pts`
                : `Wrong. It was ${coin.emoji} ${coin.name} (${coin.symbol})`}
            </span>
          </div>
          <div className="guessr-result-options">
            {options.map(name => (
              <div key={name} className={`guessr-result-opt ${name === coin.name ? 'guessr-result-correct-opt' : name === chosen ? 'guessr-result-wrong-opt' : ''}`}>
                {name}
              </div>
            ))}
          </div>
          <button className="blitz-start-btn" style={{ marginTop: '1rem' }} onClick={nextRound}>
            {round + 1 >= GUESSR_ROUNDS ? 'See Results' : 'Next Round →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Investment Hacks ─────────────────────────────────────────────────────
const HACKS = [
  { icon: '🎯', cat: 'Entry', title: 'Buy in thirds, not all at once', body: 'Split your planned buy into 3 equal parts. Enter 1/3 now, 1/3 on a 10% dip, 1/3 on a 20% dip. You will never perfectly time the market — but you can average into a better price every time.' },
  { icon: '🔒', cat: 'Risk', title: 'Set your stop-loss before you buy', body: 'Decide the maximum you are willing to lose BEFORE you enter a position. Write it down. When price hits that level, sell — no second-guessing. Emotional stops are no stops at all.' },
  { icon: '🌊', cat: 'Strategy', title: 'DCA beats lump-sum for volatile assets', body: 'Invest a fixed amount every week or month regardless of price. Over time, you buy more when prices are low and less when they are high — automatically reducing your average cost.' },
  { icon: '📊', cat: 'Portfolio', title: 'The 5% rule for new positions', body: 'Never put more than 5% of your portfolio into a single new, unproven position. If it does a 10x, you still win big. If it goes to zero, your portfolio survives. Let winners earn larger allocations.' },
  { icon: '💰', cat: 'Profit', title: 'Take profit on the way up, not at the top', body: 'Sell 25% of a position when it doubles. Sell another 25% when it triples. You can never sell at the exact top — but taking profits on the way up guarantees you lock in real gains.' },
  { icon: '🧠', cat: 'Psychology', title: 'Never check prices more than twice a day', body: 'Frequent price checking triggers emotional decisions. Set price alerts for key levels and check manually only at pre-set times. Boredom is your worst trading advisor.' },
  { icon: '🔄', cat: 'Strategy', title: 'Rebalance quarterly, not reactively', body: 'Set a calendar reminder every 3 months to bring your portfolio back to target weights. Selling winners and buying laggards forces discipline — you sell high and buy low automatically.' },
  { icon: '🛡️', cat: 'Risk', title: 'Keep 10-20% in stablecoins at all times', body: 'A permanent stablecoin reserve means you can always buy a crash. It also gives psychological comfort — you can watch a crash calmly knowing you have dry powder to deploy.' },
  { icon: '📉', cat: 'Psychology', title: 'The 48-hour rule for panic sells', body: 'When you desperately want to sell during a crash, wait 48 hours. If you still want to sell after thinking it through calmly, then sell. Most panic impulses dissolve within 24 hours.' },
  { icon: '🔍', cat: 'Research', title: 'Check on-chain data before trusting charts', body: 'Price can be manipulated. On-chain metrics (active addresses, transaction volume, exchange outflows) tell you what users are actually doing — not what traders want you to believe.' },
  { icon: '⚖️', cat: 'Portfolio', title: 'Concentration is a feature, not a bug', body: 'Most wealth is made in 1-3 high-conviction bets, not 30 diversified ones. Have 3-5 core positions making up 70% of your portfolio. Diversification prevents loss; concentration creates wealth.' },
  { icon: '🕐', cat: 'Entry', title: 'Volume confirms breakouts', body: 'A price breakout on low volume is likely fake. Wait for a breakout accompanied by volume 2× the average. That confirms real buying interest, not just a momentary squeeze.' },
  { icon: '📅', cat: 'Strategy', title: 'Track your cost basis religiously', body: 'Always know exactly what you paid for each position. Without this, you cannot calculate real P&L, make rational sell decisions, or file accurate taxes. Use WalletLens to track every trade.' },
  { icon: '🚫', cat: 'Risk', title: 'Avoid leverage until you are profitable without it', body: 'Leverage amplifies gains AND losses. If you cannot make money in spot markets consistently, leverage will just speed up your losses. Master the basics first.' },
  { icon: '💎', cat: 'Psychology', title: 'Your conviction determines your position size', body: 'Size positions by how thoroughly you have researched them. High conviction = larger position. Heard-it-on-Twitter = 1% max. Conviction is earned through research, not hope.' },
  { icon: '📈', cat: 'Strategy', title: 'The market rewards patience, not activity', body: 'Most profitable crypto investors make fewer than 20 trades per year. Every trade has friction (fees, tax events, emotional cost). Inactivity is often the highest-conviction trade.' },
  { icon: '🌍', cat: 'Research', title: 'Follow the smart money, not the narrative', body: 'Watch where institutions and large wallets are accumulating. CoinGecko Whale Alerts, on-chain trackers, and dark pool data reveal where real money flows — often weeks before price reacts.' },
  { icon: '⚡', cat: 'Entry', title: 'Fear and Greed Index as a contrarian signal', body: 'Extreme Fear (0-25) is historically the best time to accumulate. Extreme Greed (75-100) is when smart money quietly exits. Be greedy when others are fearful — Buffett\'s rule applies to crypto.' },
]

const CAT_COLORS = {
  Entry: 'var(--g)', Risk: '#f87171', Strategy: '#a78bfa',
  Portfolio: '#60a5fa', Profit: '#fbbf24', Psychology: '#f472b6',
  Research: '#38bdf8',
}

// ── Achievements definition ───────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_lesson',    icon: '📖', title: 'First Lesson',       desc: 'Complete your first daily challenge',         pts: 50  },
  { id: 'streak_3',        icon: '🔥', title: '3-Day Streak',       desc: 'Complete challenges 3 days in a row',          pts: 100 },
  { id: 'streak_7',        icon: '⚡', title: 'Week Warrior',        desc: 'Complete challenges 7 days in a row',          pts: 200 },
  { id: 'streak_30',       icon: '💎', title: 'Diamond Habit',       desc: '30-day challenge streak',                      pts: 500 },
  { id: 'perfect_score',   icon: '🎯', title: 'Sharpshooter',        desc: 'Answer correctly on first try',                pts: 75  },
  { id: 'fast_answer',     icon: '⚡', title: 'Lightning Brain',     desc: 'Answer correctly in under 3 seconds',          pts: 100 },
  { id: 'all_categories',  icon: '🌈', title: 'Well Rounded',        desc: 'Answer questions from 5 different categories', pts: 150 },
  { id: 'security_expert', icon: '🛡️', title: 'Security Expert',     desc: 'Answer 5 Security questions correctly',        pts: 120 },
  { id: 'defi_master',     icon: '🏦', title: 'DeFi Master',         desc: 'Answer 3 DeFi questions correctly',            pts: 100 },
  { id: 'risk_aware',      icon: '⚠️', title: 'Risk Aware',          desc: 'Answer 5 Risk questions correctly',            pts: 120 },
  { id: 'crypto_scholar',  icon: '🎓', title: 'Crypto Scholar',      desc: 'Answer 10 Crypto questions correctly',         pts: 200 },
  { id: 'psychologist',    icon: '🧠', title: 'Market Psychologist', desc: 'Answer 3 Psychology questions correctly',      pts: 100 },
  { id: 'iq_500',          icon: '🥉', title: 'Analyst',             desc: 'Reach 500 Investor IQ',                        pts: 0   },
  { id: 'iq_1000',         icon: '🥈', title: 'Strategist',          desc: 'Reach 1,000 Investor IQ',                      pts: 0   },
  { id: 'iq_2000',         icon: '🥇', title: 'Whale',               desc: 'Reach 2,000 Investor IQ',                      pts: 0   },
  { id: 'iq_5000',         icon: '👑', title: 'Legend',              desc: 'Reach 5,000 Investor IQ',                      pts: 0   },
]

function getRank(iq) {
  if (iq >= 5000) return { label: 'Legend', color: '#ffd700', icon: '👑' }
  if (iq >= 2000) return { label: 'Whale',  color: '#a78bfa', icon: '🥇' }
  if (iq >= 1000) return { label: 'Strategist', color: '#60a5fa', icon: '🥈' }
  if (iq >= 500)  return { label: 'Analyst', color: 'var(--g)', icon: '🥉' }
  if (iq >= 200)  return { label: 'Trader',  color: '#f59e0b', icon: '📈' }
  return { label: 'Rookie', color: 'rgba(255,255,255,0.5)', icon: '🌱' }
}

// ── Share hack as image ────────────────────────────────────────────────────
function drawHackImage(hack, color) {
  const W = 1200, H = 630
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')

  // Background
  ctx.fillStyle = '#071a0c'
  ctx.fillRect(0, 0, W, H)

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(var(--g-rgb),0.06)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  // Left accent bar
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 6, H)

  // WalletLens logo (concentric circles)
  const lx = 72, ly = 72, r = 38
  ctx.strokeStyle = '#00c853'; ctx.lineWidth = 7
  ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 4; ctx.globalAlpha = 0.55
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.59, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#00c853'
  ctx.beginPath(); ctx.arc(lx, ly, r * 0.34, 0, Math.PI * 2); ctx.fill()

  // Brand name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText('WalletLens', 122, 65)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('walletlens.cc', 124, 90)

  // Category pill
  ctx.fillStyle = color + '33'
  const pillW = 140, pillH = 36
  ctx.beginPath(); ctx.roundRect(68, 150, pillW, pillH, 18); ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillText(`${hack.icon}  ${hack.cat}`, 88, 174)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  const words = hack.title.split(' ')
  let line = '', y = 260, lineH = 64
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) { ctx.fillText(line, 68, y); line = w; y += lineH }
    else line = test
  }
  ctx.fillText(line, 68, y)

  // Body text (wrapped, smaller)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '24px system-ui, sans-serif'
  const bodyWords = hack.body.split(' ')
  let bl = '', by = y + 70, bLineH = 38, bLines = 0
  for (const w of bodyWords) {
    const test = bl ? bl + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) {
      if (bLines < 3) { ctx.fillText(bl, 68, by); by += bLineH; bLines++ }
      bl = w
    } else bl = test
  }
  if (bLines < 3 && bl) ctx.fillText(bl, 68, by)

  // Bottom bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, H - 60, W, 60)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('💡 Investment Hack  •  walletlens.cc/academy', 68, H - 22)

  return c.toDataURL('image/png')
}

async function shareHackToX(hack, color) {
  const dataUrl = drawHackImage(hack, color)
  const text = `${hack.icon} ${hack.title}\n\n${hack.body.slice(0, 160)}…\n\n#WalletLens #Crypto #InvestmentTips`
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://walletlens.cc')}`

  // Try Web Share API first (mobile)
  if (navigator.canShare) {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], 'walletlens-hack.png', { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: hack.title, text })
        return
      }
    } catch { /* fall through */ }
  }

  // Desktop fallback: download image + open X
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'walletlens-hack.png'
  a.click()
  setTimeout(() => window.open(xUrl, '_blank'), 400)
}

// ── HackCard ──────────────────────────────────────────────────────────────
function HackCard({ hack, color }) {
  const [open, setOpen] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function handleShare(e) {
    e.stopPropagation()
    setSharing(true)
    track('hack_share', { title: hack.title })
    await shareHackToX(hack, color)
    setSharing(false)
  }

  return (
    <div className={`acad-hack-card ${open ? 'acad-hack-open' : ''}`}
      onClick={() => { if (!open) track('hack_expand', { title: hack.title, cat: hack.cat }); setOpen(o => !o) }}
      style={{ '--hack-color': color }}>
      <div className="acad-hack-header">
        <span className="acad-hack-icon">{hack.icon}</span>
        <div className="acad-hack-meta">
          <span className="acad-hack-cat" style={{ color }}>{hack.cat}</span>
          <div className="acad-hack-title">{hack.title}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <button className="hack-share-btn" onClick={handleShare} disabled={sharing}
            title="Share on X">
            {sharing ? '⏳' : '𝕏'}
          </button>
          <span className="acad-hack-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="acad-hack-body">{hack.body}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Academy() {
  const [store, setStore] = useState(loadStore)
  const [phase, setPhase]         = useState('idle')  // idle | playing | result | explanation
  const [selected, setSelected]   = useState(null)
  const [timeLeft, setTimeLeft]   = useState(10)
  const [newBadges, setNewBadges] = useState([])
  const [activeTab, setActiveTab] = useState('challenge') // challenge | badges | game
  const timerRef = useRef(null)
  const startTime = useRef(null)

  const todayStr   = getTodayStr()
  const alreadyDone = store.lastPlayed === todayStr
  const question   = getDailyQuestion()

  // Init store defaults
  useEffect(() => {
    track('academy_view')
    setStore(prev => ({
      iq: 0, streak: 0, lastPlayed: null, totalCorrect: 0,
      categoryCounts: {}, earnedBadges: [],
      ...prev,
    }))
  }, [])

  // Countdown timer
  useEffect(() => {
    if (phase !== 'playing') { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleTimeout(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  function startChallenge() {
    setPhase('playing')
    setSelected(null)
    setTimeLeft(10)
    startTime.current = Date.now()
    track('academy_challenge_start', { question_cat: question.cat })
  }

  function handleTimeout() {
    setSelected(-1) // timed out
    setPhase('result')
    updateStore(false, 99)
  }

  function handleAnswer(idx) {
    if (phase !== 'playing' || selected !== null) return
    clearInterval(timerRef.current)
    const elapsed = (Date.now() - startTime.current) / 1000
    const correct = idx === question.a
    setSelected(idx)
    setPhase('result')
    updateStore(correct, elapsed)
    track('academy_answer', { correct, cat: question.cat, elapsed_s: elapsed.toFixed(1) })
  }

  function updateStore(correct, elapsed) {
    setStore(prev => {
      const today = getTodayStr()
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const newStreak = correct
        ? (prev.lastPlayed === yesterday ? (prev.streak || 0) + 1 : 1)
        : 0

      const catCounts = { ...(prev.categoryCounts || {}) }
      if (correct) catCounts[question.cat] = (catCounts[question.cat] || 0) + 1

      const iqGain = correct
        ? 20 + (elapsed < 3 ? 30 : elapsed < 5 ? 10 : 0) + (newStreak >= 7 ? 20 : newStreak >= 3 ? 10 : 0)
        : 0
      const newIq = (prev.iq || 0) + iqGain
      const newCorrect = (prev.totalCorrect || 0) + (correct ? 1 : 0)

      // Check badge unlocks
      const earned = new Set(prev.earnedBadges || [])
      const freshBadges = []
      function maybeEarn(id) { if (!earned.has(id)) { earned.add(id); freshBadges.push(id) } }

      if (correct && newCorrect === 1)   maybeEarn('first_lesson')
      if (correct && newStreak >= 3)     maybeEarn('streak_3')
      if (correct && newStreak >= 7)     maybeEarn('streak_7')
      if (correct && newStreak >= 30)    maybeEarn('streak_30')
      if (correct)                        maybeEarn('perfect_score')
      if (correct && elapsed < 3)        maybeEarn('fast_answer')
      if (Object.keys(catCounts).length >= 5) maybeEarn('all_categories')
      if ((catCounts['Security'] || 0) >= 5)  maybeEarn('security_expert')
      if ((catCounts['DeFi'] || 0) >= 3)      maybeEarn('defi_master')
      if ((catCounts['Risk'] || 0) >= 5)      maybeEarn('risk_aware')
      if ((catCounts['Crypto'] || 0) >= 10)   maybeEarn('crypto_scholar')
      if ((catCounts['Psychology'] || 0) >= 3) maybeEarn('psychologist')
      if (newIq >= 500)  maybeEarn('iq_500')
      if (newIq >= 1000) maybeEarn('iq_1000')
      if (newIq >= 2000) maybeEarn('iq_2000')
      if (newIq >= 5000) maybeEarn('iq_5000')

      const badgePts = freshBadges.reduce((s, id) => {
        const b = ACHIEVEMENTS.find(a => a.id === id)
        return s + (b?.pts || 0)
      }, 0)

      if (freshBadges.length) setNewBadges(freshBadges)

      const updated = {
        ...prev,
        iq: newIq + badgePts,
        streak: newStreak,
        lastPlayed: today,
        totalCorrect: newCorrect,
        categoryCounts: catCounts,
        earnedBadges: [...earned],
      }
      saveStore(updated)
      return updated
    })
  }

  const rank = getRank(store.iq || 0)
  const earnedSet = new Set(store.earnedBadges || [])

  return (
    <div className="acad-root">
      {/* New badge toast */}
      {newBadges.length > 0 && (
        <div className="acad-toast-wrap">
          {newBadges.map(id => {
            const b = ACHIEVEMENTS.find(a => a.id === id)
            return b ? (
              <div key={id} className="acad-toast" onAnimationEnd={() => setNewBadges(p => p.filter(x => x !== id))}>
                <span className="acad-toast-icon">{b.icon}</span>
                <div>
                  <div className="acad-toast-title">Badge Unlocked!</div>
                  <div className="acad-toast-badge">{b.title}</div>
                </div>
              </div>
            ) : null
          })}
        </div>
      )}

      {/* Header */}
      <div className="acad-header">
        <div className="acad-header-left">
          <div className="acad-logo">🎓</div>
          <div>
            <div className="acad-title">WalletLens Academy</div>
            <div className="acad-subtitle muted">Level up your investment knowledge</div>
          </div>
        </div>
        <div className="acad-iq-pill" style={{ borderColor: rank.color + '44', background: rank.color + '12' }}>
          <span style={{ color: rank.color }}>{rank.icon} {store.iq || 0}</span>
          <span className="muted" style={{ fontSize: '0.7rem' }}>IQ</span>
        </div>
      </div>

      {/* Rank card */}
      <div className="glass-card acad-rank-card">
        <div className="acad-rank-left">
          <div className="acad-rank-icon" style={{ color: rank.color }}>{rank.icon}</div>
          <div>
            <div className="acad-rank-label" style={{ color: rank.color }}>{rank.label}</div>
            <div className="muted" style={{ fontSize: '0.74rem' }}>Investor IQ: {(store.iq || 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="acad-rank-stats">
          <div className="acad-stat">
            <div className="acad-stat-val">{store.totalCorrect || 0}</div>
            <div className="acad-stat-lbl muted">Correct</div>
          </div>
          <div className="acad-stat">
            <div className="acad-stat-val">{store.streak || 0}🔥</div>
            <div className="acad-stat-lbl muted">Streak</div>
          </div>
          <div className="acad-stat">
            <div className="acad-stat-val">{(store.earnedBadges || []).length}</div>
            <div className="acad-stat-lbl muted">Badges</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="acad-tabs">
        {[
          { id: 'challenge', label: '📅 Daily Challenge' },
          { id: 'badges',    label: `🏆 Badges (${(store.earnedBadges||[]).length}/${ACHIEVEMENTS.length})` },
          { id: 'game',      label: '🕵️ Crypto Guessr' },
          { id: 'hacks',     label: '💡 Investment Hacks' },
        ].map(tab => (
          <button key={tab.id} className={`acad-tab ${activeTab === tab.id ? 'acad-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab.id); track('academy_tab_switch', { tab: tab.id }) }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CHALLENGE TAB ── */}
      {activeTab === 'challenge' && (
        <div className="glass-card acad-challenge-card">
          {/* Category + timer */}
          <div className="acad-challenge-meta">
            <span className="acad-cat-badge">{question.cat}</span>
            {phase === 'playing' && (
              <div className="acad-timer" style={{ color: timeLeft <= 3 ? '#f87171' : 'var(--g)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {timeLeft}s
              </div>
            )}
          </div>

          {/* Question */}
          <div className="acad-question">{question.q}</div>

          {/* Options */}
          <div className="acad-options">
            {question.opts.map((opt, i) => {
              let cls = 'acad-option'
              if (phase === 'result' || phase === 'explanation') {
                if (i === question.a) cls += ' acad-option-correct'
                else if (i === selected) cls += ' acad-option-wrong'
              }
              return (
                <button key={i} className={cls}
                  onClick={() => handleAnswer(i)}
                  disabled={phase !== 'playing'}>
                  <span className="acad-option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>

          {/* Idle state */}
          {phase === 'idle' && !alreadyDone && (
            <button className="acad-start-btn" onClick={startChallenge}>
              Start Today's Challenge
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          )}

          {/* Already done */}
          {alreadyDone && phase === 'idle' && (
            <div className="acad-done-msg">
              <span className="acad-done-icon">✅</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--g)' }}>Challenge complete for today!</div>
                <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>Come back tomorrow for a new question. Streak: {store.streak}🔥</div>
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && (
            <div className={`acad-result ${selected === question.a ? 'acad-result-correct' : 'acad-result-wrong'}`}>
              {selected === -1 ? (
                <><span>⏱️</span> Time's up! The answer was <strong>{question.opts[question.a]}</strong></>
              ) : selected === question.a ? (
                <><span>✅</span> Correct! +{selected === question.a && (Date.now() - startTime.current) / 1000 < 3 ? '50' : '20'} IQ</>
              ) : (
                <><span>❌</span> Wrong. Correct answer: <strong>{question.opts[question.a]}</strong></>
              )}
              <button className="acad-explain-btn" onClick={() => setPhase('explanation')}>Why? →</button>
            </div>
          )}

          {/* Explanation */}
          {phase === 'explanation' && (
            <div className="acad-explanation">
              <div className="acad-explain-title">💡 Explanation</div>
              <div className="acad-explain-text">{question.exp}</div>
            </div>
          )}
        </div>
      )}

      {/* ── BADGES TAB ── */}
      {activeTab === 'badges' && (
        <div className="acad-badges-grid">
          {ACHIEVEMENTS.map(b => {
            const earned = earnedSet.has(b.id)
            return (
              <div key={b.id} className={`acad-badge-card ${earned ? 'acad-badge-earned' : 'acad-badge-locked'}`}>
                <div className="acad-badge-icon" style={{ opacity: earned ? 1 : 0.3 }}>{b.icon}</div>
                <div className="acad-badge-title" style={{ color: earned ? 'var(--text)' : 'var(--text-sub)' }}>{b.title}</div>
                <div className="acad-badge-desc muted">{b.desc}</div>
                {b.pts > 0 && <div className="acad-badge-pts" style={{ color: earned ? '#fbbf24' : 'var(--text-sub)' }}>+{b.pts} IQ</div>}
                {earned && <div className="acad-badge-earned-label">EARNED</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── GAME TAB ── */}
      {activeTab === 'game' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <CryptoGuessr onIqGain={pts => {
            setStore(prev => {
              const updated = { ...prev, iq: (prev.iq || 0) + pts }
              saveStore(updated)
              return updated
            })
          }} />
        </div>
      )}

      {/* ── HACKS TAB ── */}
      {activeTab === 'hacks' && (
        <div className="acad-hacks-list">
          {HACKS.map((h, i) => {
            const color = CAT_COLORS[h.cat] || '#a78bfa'
            return (
              <HackCard key={i} hack={h} color={color} />
            )
          })}
        </div>
      )}

      {/* IQ guide */}
      <div className="glass-card acad-iq-guide">
        <div className="acad-iq-guide-title">Investor IQ Ranks</div>
        <div className="acad-iq-guide-grid">
          {[
            { icon: '🌱', label: 'Rookie',     range: '0–199' },
            { icon: '📈', label: 'Trader',     range: '200–499' },
            { icon: '🥉', label: 'Analyst',    range: '500–999' },
            { icon: '🥈', label: 'Strategist', range: '1,000–1,999' },
            { icon: '🥇', label: 'Whale',      range: '2,000–4,999' },
            { icon: '👑', label: 'Legend',     range: '5,000+' },
          ].map(r => (
            <div key={r.label} className="acad-iq-guide-row">
              <span>{r.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{r.label}</span>
              <span className="muted" style={{ fontSize: '0.74rem' }}>{r.range}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.75rem', lineHeight: 1.5 }}>
          Earn IQ by answering daily challenges (+20 base, +30 for sub-3s answers, streak bonuses) and unlocking badges.
        </p>
      </div>
    </div>
  )
}
