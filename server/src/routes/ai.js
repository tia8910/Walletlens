import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// Build compact portfolio context string shared by both endpoints
function buildPortfolioContext({ portfolio, prices, transactions, coinTargets, totalValue, totalInvested, totalPnL }) {
  const holdingsSummary = (portfolio || []).map(h => {
    const price    = prices?.[h.coin_id]?.usd ?? prices?.[h.coin_id]?.price ?? 0;
    const value    = h.amount * price;
    const pnl      = value - h.total_invested;
    const pnlPct   = h.total_invested > 0 ? ((pnl / h.total_invested) * 100).toFixed(1) : '0';
    const change24 = prices?.[h.coin_id]?.usd_24h_change?.toFixed(2) ?? '?';
    const targets  = coinTargets?.[h.coin_id]?.targets || [];
    return [
      `${h.coin_symbol?.toUpperCase()} (${h.coin_id})`,
      `  Amount: ${h.amount} | Avg buy: $${h.avg_buy_price ?? (h.total_invested / h.amount || 0).toFixed(4)}`,
      `  Price: $${price.toFixed(4)} (24h: ${change24}%) | Value: $${value.toFixed(2)} | P&L: $${pnl.toFixed(2)} (${pnlPct}%)`,
      targets.length ? `  Sell targets: ${targets.map(t => `$${t.price}`).join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const recentTxs = (transactions || []).slice(-15).map(tx =>
    `${tx.type?.toUpperCase()} ${tx.amount} ${tx.coin_symbol} @ $${tx.price_per_unit} on ${tx.created_at?.slice(0, 10) ?? '?'}`
  ).join('\n');

  return `
PORTFOLIO SNAPSHOT
Total Value: $${(totalValue || 0).toLocaleString()} | Invested: $${(totalInvested || 0).toLocaleString()} | P&L: $${(totalPnL || 0).toLocaleString()} (${totalInvested > 0 ? (((totalPnL || 0) / totalInvested) * 100).toFixed(2) : 0}%)
Assets: ${(portfolio || []).length}

HOLDINGS
${holdingsSummary || 'No holdings'}

RECENT TRANSACTIONS
${recentTxs || 'None'}`.trim();
}

const SYSTEM_PROMPT = `You are an elite crypto portfolio advisor — CFA-level analyst who deeply understands blockchain, market cycles, DeFi, and on-chain dynamics. You have full access to the user's portfolio: holdings, cost basis, unrealized P&L, sell targets, and transaction history.

Be specific, direct, and reference real numbers from the portfolio. Never give generic advice. Make clear calls. Be concise but insightful. Use markdown for structure when helpful.`;

// ── POST /api/ai/analyze — one-shot deep analysis ─────────────────────────
router.post('/analyze', async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ error: 'Set ANTHROPIC_API_KEY on the server to enable AI Advisor.' });

  const ctx = buildPortfolioContext(req.body);

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${ctx}\n\nGive me a comprehensive portfolio analysis with these sections:\n\n## Portfolio Health: [Grade] — [verdict]\nOne honest paragraph.\n\n## 🔴 Top Risks\n3–5 specific risks based on actual holdings and percentages.\n\n## 🟢 Opportunities\n3–5 specific opportunities or optimizations.\n\n## ⚡ Priority Actions\n3–5 concrete actions ranked by urgency. Name the asset, price level, and reasoning.\n\n## 📊 Stress Test\nBear case (BTC -50%), Sideways (6 months), Bull case (BTC +100%) — estimated portfolio impact each.\n\n## 💡 Contrarian Insight\nOne surprising insight most retail investors miss about this specific portfolio.`,
      }],
    });

    const text = message.content.find(b => b.type === 'text')?.text || '';
    res.json({ analysis: text, model: message.model });
  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// ── POST /api/ai/chat — streaming chat ────────────────────────────────────
router.post('/chat', async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ error: 'Set ANTHROPIC_API_KEY on the server to enable AI Advisor.' });

  const { messages: history, portfolioContext } = req.body;
  if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'messages array required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const systemWithPortfolio = `${SYSTEM_PROMPT}\n\nCurrent portfolio context:\n${portfolioContext || 'No portfolio data provided.'}`;

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system: systemWithPortfolio,
      messages: history,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('AI chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Chat failed' })}\n\n`);
    res.end();
  }
});

export default router;
