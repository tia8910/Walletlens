const a=[{slug:"cost-basis",term:"Cost Basis",short:"Cost basis is the total amount you originally paid to acquire an asset, including fees, used to calculate your profit or loss when you sell.",body:`Cost basis is the original value of an asset for tax and tracking purposes. It is usually the purchase price plus any commissions or fees you paid to acquire it.

Your cost basis matters because it is the baseline against which gains and losses are measured. If you buy one Bitcoin for $30,000 and later sell it for $40,000, your $10,000 gain is the difference between the sale price and your cost basis.

When you buy the same asset multiple times at different prices, your cost basis is typically the average of those purchases (average cost) or tracked per lot, depending on the accounting method you use.

WalletLens calculates your cost basis automatically as you log trades, so you always know your true profit or loss across crypto, stocks and metals without keeping a spreadsheet.`,related:["unrealized-gain","roi","break-even-price"]},{slug:"roi",term:"ROI (Return on Investment)",short:"ROI measures how much you have gained or lost on an investment relative to its cost, expressed as a percentage of the amount invested.",body:`Return on investment, or ROI, is a simple measure of profitability. It tells you what percentage you have earned or lost on the money you put in.

The formula is straightforward: ROI = (current value − cost basis) ÷ cost basis × 100. If you invested $1,000 and your holding is now worth $1,250, your ROI is 25%.

ROI is useful for comparing very different investments on equal footing, because it normalises returns to a percentage regardless of the dollar amounts involved. However, basic ROI ignores time, so a 25% return over one month is far better than the same return over five years.

For that reason, investors often pair ROI with annualised return figures to compare opportunities fairly over different holding periods.`,related:["cost-basis","pnl","compound-interest"]},{slug:"pnl",term:"P&L (Profit and Loss)",short:"Profit and loss, or P&L, is the total gain or loss on your holdings, combining both realized profits from sales and unrealized changes in value.",body:`P&L stands for profit and loss. It is the running total of how much money you have made or lost on an investment or an entire portfolio.

P&L has two parts. Realized P&L comes from positions you have actually sold or closed. Unrealized P&L reflects the paper gain or loss on positions you still hold, based on the current market price versus your cost basis.

Tracking P&L helps you see performance at a glance and make decisions about when to take profits or cut losses. A green portfolio P&L means your assets are collectively worth more than you paid.

WalletLens calculates your P&L automatically across every asset, showing both realized and unrealized figures so you can see your true performance without manual math.`,related:["unrealized-gain","realized-gain","roi"]},{slug:"break-even-price",term:"Break-Even Price",short:"The break-even price is the price at which an asset must trade for you to recover exactly what you paid, with no profit and no loss.",body:`The break-even price is the point where your investment is neither up nor down. At this price, selling would return exactly your cost basis, including any fees.

For a single purchase, your break-even is simply your average buy price plus trading costs. For multiple purchases at different prices, it is the weighted average cost across all your buys.

Knowing your break-even is helpful for setting expectations and exit plans. If an asset is trading below your break-even, you are at an unrealized loss; above it, you are in profit.

Break-even shifts when you add to a position. Buying more at a lower price pulls your break-even down (dollar-cost averaging), while buying higher pushes it up.`,related:["cost-basis","dollar-cost-averaging","pnl"]},{slug:"market-cap",term:"Market Capitalization",short:"Market cap is the total value of an asset, calculated by multiplying its current price by the number of units or shares in circulation.",body:`Market capitalization, or market cap, measures the total market value of a company or cryptocurrency. It is calculated by multiplying the current price by the circulating supply of shares or coins.

For example, if a coin trades at $2 and has 100 million coins in circulation, its market cap is $200 million. Market cap is often a better gauge of size than price alone, because a low price with a huge supply can still mean a large total valuation.

Investors use market cap to compare assets and gauge relative risk. Large-cap assets tend to be more established and less volatile, while small-cap assets can offer higher growth potential alongside greater risk.

For crypto, circulating supply excludes locked or not-yet-released tokens, which is why fully diluted valuation can differ significantly from market cap.`,related:["fully-diluted-valuation","volatility","liquidity"]},{slug:"fully-diluted-valuation",term:"Fully Diluted Valuation (FDV)",short:"FDV is the theoretical market cap of a crypto asset if its entire maximum supply were already in circulation at the current price.",body:`Fully diluted valuation, or FDV, estimates what an asset would be worth if every possible token were already issued and trading at the current price.

It is calculated by multiplying the current price by the maximum or total supply, rather than just the circulating supply used for market cap. If many tokens are still locked, vesting, or unmined, FDV can be far higher than the current market cap.

FDV matters because it hints at future dilution. When large amounts of new supply unlock over time, that selling pressure can weigh on the price even if demand stays constant.

Comparing market cap to FDV gives a quick sense of how much potential dilution is ahead. A market cap far below FDV is a signal to research the token release schedule.`,related:["market-cap","volatility","blockchain"]},{slug:"dollar-cost-averaging",term:"Dollar-Cost Averaging (DCA)",short:"Dollar-cost averaging is investing a fixed amount at regular intervals regardless of price, which smooths out your average entry cost over time.",body:`Dollar-cost averaging, or DCA, is a strategy of investing a fixed dollar amount on a regular schedule, such as $100 every week, no matter what the price is doing.

Because you buy more units when prices are low and fewer when prices are high, your average cost tends to smooth out over time. This removes the pressure of trying to time the market perfectly.

DCA is popular because it is simple, disciplined, and reduces the emotional temptation to buy at peaks or panic-sell at lows. It works especially well for volatile assets like cryptocurrencies.

The trade-off is that in a steadily rising market, investing a lump sum early can outperform DCA. The strategy is more about consistency and risk management than maximising returns.`,related:["cost-basis","volatility","break-even-price"]},{slug:"rsi",term:"RSI (Relative Strength Index)",short:"RSI is a momentum indicator from 0 to 100 that gauges whether an asset may be overbought or oversold based on recent price changes.",body:`The Relative Strength Index, or RSI, is a technical momentum indicator that measures the speed and magnitude of recent price moves on a scale of 0 to 100.

Traditionally, an RSI above 70 suggests an asset may be overbought and due for a pullback, while an RSI below 30 suggests it may be oversold and could bounce. These are guidelines, not guarantees.

RSI is calculated by comparing the average size of recent gains to the average size of recent losses over a set period, usually 14 days.

Traders use RSI to spot potential reversals and confirm trends, often alongside other indicators. In strong trends, RSI can stay overbought or oversold for long stretches, so it works best as one input among several.`,related:["macd","moving-average","volatility"]},{slug:"macd",term:"MACD",short:"MACD is a trend-following momentum indicator that shows the relationship between two moving averages to highlight shifts in momentum.",body:`MACD stands for Moving Average Convergence Divergence. It is a trend-following momentum indicator that reveals changes in the strength and direction of a price trend.

MACD is built from two exponential moving averages, typically the 12-period and 26-period. The MACD line is the difference between them, and a 9-period signal line is plotted on top of it.

When the MACD line crosses above the signal line, it is often read as bullish momentum; a cross below is read as bearish. The histogram shows the gap between the two lines, making momentum shifts easier to see.

Like all indicators, MACD lags price because it is based on averages. Traders combine it with other tools to avoid false signals during choppy, sideways markets.`,related:["rsi","moving-average","bull-market"]},{slug:"moving-average",term:"Moving Average",short:"A moving average smooths price data by averaging it over a set period, helping reveal the underlying trend by filtering out short-term noise.",body:`A moving average is one of the most common technical analysis tools. It averages an asset price over a chosen number of periods and updates as new data arrives, producing a smooth line that follows the trend.

The two main types are the simple moving average (SMA), which weights all periods equally, and the exponential moving average (EMA), which gives more weight to recent prices and reacts faster.

Common periods include the 50-day and 200-day averages. When a shorter average crosses above a longer one, traders call it a golden cross and read it as bullish; the opposite, a death cross, is read as bearish.

Moving averages are useful for identifying trend direction and potential support or resistance levels, but they lag price because they look backward.`,related:["macd","rsi","bull-market"]},{slug:"fear-and-greed-index",term:"Fear and Greed Index",short:"The Fear and Greed Index is a sentiment gauge from 0 to 100 that estimates whether market participants are feeling fearful or greedy.",body:`The Fear and Greed Index is a market sentiment indicator that scores overall investor emotion from 0 (extreme fear) to 100 (extreme greed).

For crypto, it blends inputs such as volatility, market momentum, social media activity, and trading volume into a single number. Stock-market versions use similar measures of breadth, momentum, and demand for safe havens.

The idea, rooted in contrarian investing, is that extreme fear can signal a buying opportunity when assets are oversold, while extreme greed can warn that a market is overheated and due for a correction.

It is a sentiment snapshot, not a precise timing tool. Many investors use it as a gut-check against their own emotions rather than as a standalone buy or sell signal.`,related:["volatility","bull-market","bear-market"]},{slug:"stablecoin",term:"Stablecoin",short:"A stablecoin is a cryptocurrency designed to hold a steady value, usually pegged to a fiat currency like the US dollar at a one-to-one rate.",body:`A stablecoin is a type of cryptocurrency engineered to maintain a stable price, most often pegged to a fiat currency such as the US dollar.

There are several designs. Fiat-backed stablecoins hold cash and equivalents in reserve to back each token. Crypto-backed stablecoins are over-collateralised with other cryptocurrencies. Algorithmic stablecoins try to hold the peg through supply-and-demand mechanisms, which have historically proven riskier.

Stablecoins are widely used to move value between exchanges, park funds during volatility, and provide liquidity in decentralised finance, all without converting back to a bank account.

The main risk is whether the peg holds. Reserve quality, transparency, and the mechanism behind the coin all affect how reliably it stays near its target value.`,related:["fiat","defi","liquidity"]},{slug:"market-order",term:"Market Order",short:"A market order is an instruction to buy or sell an asset immediately at the best available current price, prioritising speed over price control.",body:`A market order tells your broker or exchange to execute a trade right away at the best price currently available in the market.

The main advantage is speed and certainty of execution. If you need to get in or out of a position immediately, a market order will fill almost instantly while the market is open and liquid.

The trade-off is price uncertainty. In fast-moving or thinly traded markets, the price you actually get can differ from the last quoted price, a phenomenon called slippage.

Market orders work best for liquid assets with tight spreads, where the difference between bid and ask is small. For less liquid assets or precise entries, a limit order gives you more control.`,related:["limit-order","liquidity","volatility"]},{slug:"limit-order",term:"Limit Order",short:"A limit order is an instruction to buy or sell only at a specified price or better, giving you price control but no guarantee it will execute.",body:`A limit order lets you set the exact price at which you are willing to buy or sell. A buy limit executes only at or below your price; a sell limit executes only at or above it.

This gives you precise control over your entry or exit price, which is valuable in volatile markets or when trading less liquid assets where slippage is a concern.

The downside is that there is no guarantee of execution. If the market never reaches your specified price, the order simply sits unfilled, and you may miss the move entirely.

Traders use limit orders to enter positions at target prices, take profit at predetermined levels, and avoid overpaying during sudden spikes. They are the opposite of market orders, which prioritise speed over price.`,related:["market-order","liquidity","volatility"]},{slug:"bull-market",term:"Bull Market",short:"A bull market is a sustained period of rising prices and optimism, where investors expect gains and asset values trend upward over time.",body:`A bull market is a prolonged period during which asset prices rise and investor confidence is high. The term often refers to a gain of 20% or more from recent lows.

Bull markets are characterised by optimism, strong demand, rising trading activity, and a general expectation that prices will keep climbing. Good economic news and growing earnings often fuel the trend.

During a bull market, strategies like buying dips and holding for the long term tend to work well, since the overall direction is upward. The risk is that sustained gains can breed overconfidence and inflated valuations.

No bull market lasts forever. They eventually give way to corrections or bear markets, which is why diversification and a clear plan matter even when sentiment is euphoric.`,related:["bear-market","fear-and-greed-index","volatility"]},{slug:"bear-market",term:"Bear Market",short:"A bear market is a sustained period of falling prices and pessimism, typically defined as a decline of 20% or more from recent highs.",body:`A bear market is an extended stretch of declining asset prices, commonly defined as a drop of 20% or more from a recent peak.

Bear markets are marked by pessimism, fear, weak demand, and a widespread expectation that prices will continue to fall. They often coincide with economic slowdowns, rising interest rates, or shocks to confidence.

While painful, bear markets are a normal part of market cycles. They can present long-term buying opportunities for patient investors, as quality assets often trade at discounted prices.

Strategies that help during bear markets include dollar-cost averaging, holding cash or stablecoins for flexibility, and resisting the urge to panic-sell at the bottom. Bear markets eventually give way to recovery and new bull runs.`,related:["bull-market","fear-and-greed-index","risk-tolerance"]},{slug:"volatility",term:"Volatility",short:"Volatility measures how much and how quickly an asset price moves up and down, reflecting the degree of risk and uncertainty in its returns.",body:`Volatility describes the size and frequency of price swings in an asset. High volatility means prices move sharply in both directions; low volatility means prices are relatively stable.

It is often measured statistically using standard deviation of returns over a period. Cryptocurrencies are known for high volatility, while government bonds and stablecoins sit at the low end.

Volatility is a double-edged sword. It creates opportunity for large gains but also exposes investors to steep losses, which is why it is closely tied to risk.

Understanding an asset volatility helps you size positions appropriately and match investments to your risk tolerance. Strategies like dollar-cost averaging and diversification are designed in part to manage the impact of volatility.`,related:["risk-tolerance","diversification","fear-and-greed-index"]},{slug:"liquidity",term:"Liquidity",short:"Liquidity is how easily an asset can be bought or sold quickly at a stable price without causing a large move in its market value.",body:`Liquidity refers to how quickly and easily an asset can be converted to cash without significantly affecting its price. Highly liquid assets have many buyers and sellers ready to trade.

Major cryptocurrencies and large-cap stocks are highly liquid, with tight spreads between bid and ask prices. Obscure tokens, small-cap stocks, or physical assets like real estate are far less liquid.

Liquidity matters because it affects how cleanly you can enter or exit a position. In illiquid markets, large orders can cause slippage, moving the price against you.

Low liquidity also increases volatility and risk, since even modest buying or selling can swing the price. When choosing what to trade, liquidity is a key factor alongside potential returns.`,related:["market-order","volatility","market-cap"]},{slug:"portfolio-rebalancing",term:"Portfolio Rebalancing",short:"Rebalancing is periodically adjusting your holdings back to your target allocation by buying underweight assets and trimming overweight ones.",body:`Portfolio rebalancing is the process of bringing your asset mix back in line with your target allocation after market movements have shifted it.

Over time, winning assets grow to take up a larger share of your portfolio than you intended, increasing your risk. Rebalancing means selling some of the overweight positions and buying the underweight ones to restore your plan.

This enforces a disciplined buy-low, sell-high habit and keeps your risk level consistent with your goals. Investors typically rebalance on a schedule, such as quarterly, or when an allocation drifts beyond a set threshold.

WalletLens shows your live allocation across crypto, stocks, metals and cash, so you can see at a glance when a position has drifted and decide whether to rebalance.`,related:["asset-allocation","diversification","risk-tolerance"]},{slug:"asset-allocation",term:"Asset Allocation",short:"Asset allocation is how you divide your portfolio across different asset classes such as stocks, crypto, metals, and cash to balance risk and return.",body:`Asset allocation is the strategy of spreading your investments across different asset classes, such as stocks, bonds, cryptocurrencies, precious metals, and cash.

The mix you choose is one of the biggest drivers of your long-term returns and risk. A more aggressive allocation tilts toward growth assets like stocks and crypto, while a conservative one favours stable assets like bonds and cash.

Your ideal allocation depends on your goals, time horizon, and risk tolerance. A younger investor with decades ahead can usually accept more volatility than someone nearing a financial goal.

Good allocation balances potential return against the risk you can comfortably stomach. It works hand in hand with diversification and rebalancing to keep a portfolio aligned with your plan.`,related:["diversification","portfolio-rebalancing","risk-tolerance"]},{slug:"diversification",term:"Diversification",short:"Diversification means spreading investments across many assets so that poor performance in one is offset by others, reducing overall portfolio risk.",body:`Diversification is the practice of not putting all your eggs in one basket. By holding a variety of assets, you reduce the impact that any single losing investment has on your overall portfolio.

The principle works because different assets often move independently. When one falls, another may hold steady or rise, smoothing out your returns and lowering volatility.

You can diversify across asset classes (stocks, crypto, metals), across sectors and regions, and across individual holdings within each class. The goal is to avoid concentration risk.

Diversification does not eliminate risk entirely, and over-diversifying can dilute returns. The aim is a sensible balance that protects you from catastrophic single-asset losses while still capturing growth.`,related:["asset-allocation","portfolio-rebalancing","risk-tolerance"]},{slug:"net-worth",term:"Net Worth",short:"Net worth is the total value of everything you own minus everything you owe, giving a single snapshot of your overall financial position.",body:`Net worth is the most complete measure of your financial health. It is calculated by adding up all your assets and subtracting all your liabilities.

Assets include cash, investments, crypto, retirement accounts, property, and valuables. Liabilities include debts such as loans, mortgages, and credit card balances. The difference between the two is your net worth.

Tracking net worth over time is more meaningful than watching any single account, because it shows whether your overall wealth is growing. A rising net worth means you are building wealth faster than you are taking on debt.

WalletLens gives you a free, private net-worth view that combines your crypto, stocks, metals and cash in one place, updating with live prices and no account required.`,related:["asset-allocation","pnl","diversification"]},{slug:"unrealized-gain",term:"Unrealized Gain",short:"An unrealized gain is a paper profit on an asset you still hold, equal to its current value above your cost basis, not yet locked in by selling.",body:`An unrealized gain, sometimes called a paper gain, is the profit you have on an investment you still own but have not sold.

It is the difference between the asset current market value and your cost basis. If you bought a stock for $50 and it now trades at $70, you have a $20 unrealized gain per share.

Unrealized gains are not final. They rise and fall with the market until you actually sell, at which point they become realized gains. Because of this, the value on paper can change at any moment.

In most jurisdictions, unrealized gains are not taxed because no sale has occurred. WalletLens shows your unrealized gains in real time so you always know where your positions stand before you decide to sell.`,related:["realized-gain","cost-basis","capital-gains-tax"]},{slug:"realized-gain",term:"Realized Gain",short:"A realized gain is the locked-in profit you make when you actually sell an asset for more than your cost basis, often triggering a taxable event.",body:`A realized gain is the profit that becomes final the moment you sell an asset for more than you paid for it. Unlike an unrealized gain, it is no longer subject to market swings.

It is calculated as the sale price minus your cost basis, less any fees. If you bought crypto for $1,000 and sold it for $1,800, you have an $800 realized gain.

Realized gains usually matter for taxes. In many countries, selling an asset at a profit triggers a capital gains tax event, and the holding period can affect the rate you pay.

Understanding the line between unrealized and realized gains helps you plan sales thoughtfully, taking tax timing and your overall strategy into account before locking in profits.`,related:["unrealized-gain","capital-gains-tax","cost-basis"]},{slug:"capital-gains-tax",term:"Capital Gains Tax",short:"Capital gains tax is the tax you owe on the profit when you sell an asset for more than you paid, with rates often depending on how long you held it.",body:`Capital gains tax is a tax levied on the profit, or capital gain, you make when you sell an investment for more than its cost basis.

Many tax systems distinguish between short-term gains on assets held briefly and long-term gains on assets held longer, often taxing long-term gains at lower rates to reward patient investing.

Only realized gains are taxed; simply holding an appreciating asset does not trigger the tax until you sell. Losses can often be used to offset gains, a practice known as tax-loss harvesting.

Rules vary widely by country, and crypto is increasingly treated as a taxable asset. This is general information, not tax advice, so consult a qualified professional about your specific situation.`,related:["realized-gain","unrealized-gain","cost-basis"]},{slug:"hodl",term:"HODL",short:'HODL is crypto slang for holding an asset long term through market ups and downs rather than selling, originating from a misspelling of "hold."',body:`HODL is a popular term in the crypto community that means to hold an asset for the long term instead of selling during volatility. It originated from a 2013 forum post in which a user misspelled "hold."

The word has since been playfully reinterpreted as "Hold On for Dear Life." It captures a buy-and-hold philosophy that ignores short-term price swings in favour of long-term conviction.

HODLers believe that trying to time the market is difficult and that patience tends to reward holders of quality assets. The strategy avoids the stress and fees of frequent trading.

The risk is holding through a permanent decline if an asset fundamentally fails. HODLing works best when paired with research and diversification rather than blind faith.`,related:["dollar-cost-averaging","volatility","bear-market"]},{slug:"fiat",term:"Fiat Currency",short:"Fiat is government-issued currency like the US dollar or euro that is not backed by a physical commodity but by trust in the issuing government.",body:`Fiat currency is money issued and backed by a government rather than by a physical commodity such as gold. Its value comes from public trust and the authority of the issuing state.

Examples include the US dollar, euro, yen, and British pound. Fiat is legal tender, meaning it must be accepted for debts and transactions within its country.

Because central banks can adjust the money supply, fiat currencies can lose purchasing power over time through inflation. This is one reason some investors hold assets like gold or Bitcoin as a potential hedge.

In crypto, "fiat" is the everyday word for traditional currency, as in "cashing out to fiat" or "fiat on-ramp," which describes converting between government money and digital assets.`,related:["stablecoin","inflation-hedge","blockchain"]},{slug:"defi",term:"DeFi (Decentralized Finance)",short:"DeFi is a system of financial services like lending and trading built on blockchains that run without banks or central intermediaries.",body:`DeFi, short for decentralized finance, refers to financial applications built on public blockchains that operate without traditional intermediaries like banks or brokers.

Through smart contracts, DeFi lets users lend, borrow, trade, earn yield, and provide liquidity directly from their own wallets. The code enforces the rules automatically, and anyone with an internet connection can participate.

The appeal is openness, transparency, and control: you hold your own assets and can verify how protocols work on-chain. Popular DeFi activities include decentralised exchanges, lending platforms, and yield farming.

DeFi also carries real risks, including smart-contract bugs, hacks, volatile collateral, and complex mechanics. Users should research protocols carefully and understand that there is often no safety net if something goes wrong.`,related:["staking","yield","blockchain"]},{slug:"staking",term:"Staking",short:"Staking is locking up cryptocurrency to help secure a proof-of-stake blockchain, earning rewards in return much like interest on a deposit.",body:`Staking is the process of committing your cryptocurrency to support the operation of a proof-of-stake blockchain. In return for helping secure the network and validate transactions, you earn rewards.

In proof-of-stake systems, validators are chosen to confirm blocks based partly on how much they have staked. By staking your coins, you contribute to this security and share in the rewards, somewhat like earning interest.

You can stake directly by running a validator, delegate to a validator, or use a staking service or pool. Reward rates vary by network and conditions.

Staking carries risks, including lock-up periods where funds cannot be withdrawn, potential penalties called slashing for validator misbehaviour, and the underlying price volatility of the staked asset.`,related:["yield","defi","blockchain"]},{slug:"yield",term:"Yield",short:"Yield is the income an investment generates, expressed as a percentage of its value, such as interest, dividends, or crypto staking rewards.",body:`Yield is the return an asset produces in the form of income, usually expressed as an annual percentage of the amount invested or the asset value.

In traditional finance, yield comes from sources like bond interest or stock dividends. In crypto, yield can come from staking rewards, lending, or providing liquidity in DeFi protocols.

A higher yield can be attractive, but it almost always comes with higher risk. Unusually high advertised yields in crypto are a common warning sign of unsustainable or risky schemes.

When comparing yields, look at the source of the income, whether it is sustainable, and the risks to your principal. A modest, reliable yield often beats a flashy one that could collapse.`,related:["staking","defi","dividend"]},{slug:"blockchain",term:"Blockchain",short:"A blockchain is a shared, tamper-resistant digital ledger that records transactions across many computers so no single party controls the data.",body:`A blockchain is a distributed digital ledger that records transactions in linked blocks across a network of computers. Each block is cryptographically connected to the previous one, making the history very hard to alter.

Because copies of the ledger are held by many participants, there is no single point of control or failure. This decentralisation is what allows cryptocurrencies to operate without a central bank or administrator.

New transactions are validated by network participants through a consensus mechanism such as proof-of-work or proof-of-stake, then permanently added to the chain.

Beyond cryptocurrency, blockchain technology underpins smart contracts, DeFi, NFTs, and supply-chain tracking. Its core strengths are transparency, security, and resistance to tampering.`,related:["wallet","private-key","defi"]},{slug:"wallet",term:"Crypto Wallet",short:"A crypto wallet is a tool that stores the keys used to access and manage your cryptocurrency, rather than holding the coins themselves directly.",body:`A crypto wallet is software or hardware that stores your private and public keys, letting you send, receive, and manage cryptocurrency. The coins themselves live on the blockchain; the wallet holds the keys that prove ownership.

Wallets come in two broad types. Hot wallets are connected to the internet and convenient for frequent use, while cold wallets, such as hardware devices, stay offline for stronger security.

There is also a custody distinction. With a self-custody wallet, you alone control the keys and bear full responsibility. With a custodial wallet, a third party like an exchange holds the keys for you.

Whoever controls the private keys controls the funds, which is why the phrase "not your keys, not your coins" is a core principle of crypto self-custody.`,related:["private-key","blockchain","gas-fee"]},{slug:"private-key",term:"Private Key",short:"A private key is a secret code that proves ownership of crypto and authorises transactions; anyone who has it can control the associated funds.",body:`A private key is a long, secret cryptographic code that grants control over the cryptocurrency tied to a particular address. It is essentially the master password to your funds.

When you send crypto, your private key signs the transaction, proving you own the assets without revealing the key itself. The matching public key, or address, is safe to share so others can send you funds.

Security is paramount. Anyone who obtains your private key can take your assets, and if you lose it, there is usually no way to recover access. There is no central authority to reset it.

Best practices include storing keys offline, using hardware wallets, and safeguarding your recovery phrase. The principle "not your keys, not your coins" underscores how central the private key is to ownership.`,related:["wallet","blockchain","defi"]},{slug:"gas-fee",term:"Gas Fee",short:"A gas fee is the payment you make to a blockchain network to process and confirm your transaction, varying with network demand and complexity.",body:`A gas fee is the cost of performing a transaction or running a smart contract on a blockchain. It compensates the validators or miners who process and secure the network.

Fees vary with network congestion. When demand is high, gas fees rise as users compete to have their transactions confirmed sooner. Complex transactions, like interacting with DeFi protocols, cost more than simple transfers.

The term originated with Ethereum, where computational effort is measured in units of "gas," but similar fees exist on most blockchains under different names.

Understanding gas fees helps you avoid overpaying. Many users time transactions for periods of lower congestion or choose lower-fee networks for routine activity.`,related:["blockchain","wallet","defi"]},{slug:"etf",term:"ETF (Exchange-Traded Fund)",short:"An ETF is a basket of assets that trades on an exchange like a single stock, giving instant diversified exposure to many holdings at once.",body:`An exchange-traded fund, or ETF, is an investment fund that holds a basket of assets, such as stocks, bonds, or commodities, and trades on an exchange like an individual stock.

Buying one share of an ETF gives you proportional exposure to all its underlying holdings, making instant diversification simple and affordable. Many ETFs track an index, sector, or theme.

ETFs are popular for their low costs, transparency, tax efficiency, and intraday tradability. You can buy or sell them anytime the market is open, unlike traditional mutual funds priced once a day.

There are ETFs for almost everything, from broad market indexes to gold to specific industries and even crypto. They are a core building block for diversified, low-effort portfolios.`,related:["index-fund","diversification","dividend"]},{slug:"index-fund",term:"Index Fund",short:"An index fund is a low-cost investment that aims to match the performance of a market index, such as the S&P 500, rather than beat it.",body:`An index fund is a type of fund designed to track the performance of a specific market index, such as the S&P 500, by holding the same securities in the same proportions.

Rather than trying to beat the market through active stock-picking, index funds simply aim to match it. This passive approach keeps costs and fees very low.

Decades of evidence show that most active managers fail to beat their benchmark index over the long run, which is a big reason index funds have become so popular for long-term investing.

Index funds offer broad diversification, low costs, and simplicity, making them a favourite for retirement and buy-and-hold strategies. They are available as both traditional mutual funds and ETFs.`,related:["etf","diversification","asset-allocation"]},{slug:"dividend",term:"Dividend",short:"A dividend is a portion of a company profits paid out to shareholders, usually in cash and on a regular schedule, as a return on owning the stock.",body:`A dividend is a payment a company makes to its shareholders out of its profits, rewarding them for owning the stock. Dividends are most often paid in cash on a regular schedule, such as quarterly.

Not all companies pay dividends. Mature, profitable firms often do, while fast-growing companies may reinvest profits instead. The dividend yield expresses the annual payout as a percentage of the share price.

Dividends provide a stream of income on top of any price appreciation, and reinvesting them can significantly boost long-term returns through compounding.

Investors who prioritise income often build portfolios around reliable dividend payers. However, a very high yield can sometimes signal trouble, so it is worth examining whether the payout is sustainable.`,related:["yield","compound-interest","etf"]},{slug:"compound-interest",term:"Compound Interest",short:"Compound interest is earning returns on both your original investment and on previously earned returns, causing growth to accelerate over time.",body:`Compound interest is the process of earning returns not just on your original investment, but also on the returns it has already generated. Over time, this creates a snowball effect.

The longer your money compounds, the more dramatic the growth, because each period builds on a larger base. This is why starting early is so powerful, even with modest amounts.

For example, reinvesting dividends or staking rewards rather than spending them lets those earnings generate their own earnings, accelerating wealth accumulation.

Albert Einstein is often quoted, perhaps apocryphally, calling compound interest the eighth wonder of the world. Whether or not he said it, the math is undeniable: time and consistency are an investor greatest allies.`,related:["roi","dividend","yield"]},{slug:"inflation-hedge",term:"Inflation Hedge",short:"An inflation hedge is an asset expected to hold or grow in value as prices rise, helping protect your purchasing power against inflation.",body:`An inflation hedge is an investment that is expected to maintain or increase its value when inflation erodes the purchasing power of cash.

When the cost of living rises, money sitting in a bank account buys less over time. Inflation hedges aim to counter this by appreciating alongside or faster than rising prices.

Traditional hedges include gold, real estate, commodities, and inflation-protected bonds. Some investors view Bitcoin as a modern, digital inflation hedge, though its high volatility makes that role debated.

No hedge is perfect, and their effectiveness varies with conditions. Holding a diversified mix of assets is generally a more reliable way to protect purchasing power than relying on any single hedge.`,related:["fiat","diversification","volatility"]},{slug:"risk-tolerance",term:"Risk Tolerance",short:"Risk tolerance is how much volatility and potential loss you can comfortably handle, both financially and emotionally, when investing.",body:`Risk tolerance is the degree of uncertainty and potential loss you are willing and able to accept in pursuit of investment returns. It has both a financial and an emotional dimension.

Financially, it depends on factors like your time horizon, income stability, and how much you can afford to lose without derailing your goals. Emotionally, it reflects how well you sleep at night when markets fall.

Understanding your risk tolerance helps you build a portfolio you can actually stick with. Taking on more risk than you can stomach often leads to panic-selling at the worst moments.

Your asset allocation should match your risk tolerance: more aggressive if you can handle big swings, more conservative if you cannot. Reassess it as your circumstances and goals change over time.`,related:["asset-allocation","volatility","diversification"]}],i=e=>a.find(t=>t.slug===e);export{a as G,i as f};
