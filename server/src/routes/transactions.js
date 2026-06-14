import { Router } from 'express';
import crypto from 'crypto';
import db from '../database.js';

const router = Router();

// Module-level prepared statements — compiled once, reused on every request.
const stmts = {
  countAll:          db.prepare('SELECT COUNT(*) as cnt FROM transactions'),
  countByWallet:     db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE wallet_id = ?'),
  pageAll:           db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT ? OFFSET ?'),
  pageByWallet:      db.prepare('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY date DESC, id DESC LIMIT ? OFFSET ?'),
  allTx:             db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC'),
  allByWallet:       db.prepare('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY date DESC, id DESC'),
  portfolioAll:      db.prepare('SELECT coin_id, coin_symbol, type, SUM(amount) as total_amount, SUM(total_cost) as total_cost FROM transactions GROUP BY coin_id, type'),
  portfolioByWallet: db.prepare('SELECT coin_id, coin_symbol, type, SUM(amount) as total_amount, SUM(total_cost) as total_cost FROM transactions WHERE wallet_id = ? GROUP BY coin_id, type'),
  insertTx:          db.prepare('INSERT INTO transactions (wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, total_cost, exchange, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getTxById:         db.prepare('SELECT * FROM transactions WHERE id = ?'),
  deleteTx:          db.prepare('DELETE FROM transactions WHERE id = ?'),
};

router.get('/', (req, res) => {
  const { wallet_id, page, limit } = req.query;

  // Pagination: default to no limit for backward compat; opt-in via ?page=1&limit=50
  if (page !== undefined || limit !== undefined) {
    const pageSize = Math.min(500, Math.max(1, parseInt(limit) || 50));
    const offset   = (Math.max(1, parseInt(page) || 1) - 1) * pageSize;

    let total, transactions;
    if (wallet_id) {
      total        = stmts.countByWallet.get(wallet_id).cnt;
      transactions = stmts.pageByWallet.all(wallet_id, pageSize, offset);
    } else {
      total        = stmts.countAll.get().cnt;
      transactions = stmts.pageAll.all(pageSize, offset);
    }
    res.set('X-Total-Count', String(total));
    res.set('X-Page', String(Math.max(1, parseInt(page) || 1)));
    res.set('X-Page-Size', String(pageSize));
    return res.json(transactions);
  }

  // Legacy: return all (unchanged behaviour for existing clients)
  const transactions = wallet_id
    ? stmts.allByWallet.all(wallet_id)
    : stmts.allTx.all();
  res.json(transactions);
});

router.get('/portfolio', (req, res) => {
  const { wallet_id } = req.query;
  const rows = wallet_id
    ? stmts.portfolioByWallet.all(wallet_id)
    : stmts.portfolioAll.all();

  const holdings = {};
  for (const row of rows) {
    if (!holdings[row.coin_id]) {
      holdings[row.coin_id] = { coin_id: row.coin_id, coin_symbol: row.coin_symbol, amount: 0, total_invested: 0 };
    }
    if (row.type === 'buy') {
      holdings[row.coin_id].amount += row.total_amount;
      holdings[row.coin_id].total_invested += row.total_cost;
    } else {
      holdings[row.coin_id].amount -= row.total_amount;
      holdings[row.coin_id].total_invested -= row.total_cost;
    }
  }

  const portfolio = Object.values(holdings).filter(h => h.amount > 0.00000001);

  // ETag: lets clients skip parsing an unchanged portfolio on repeated polls
  const etag = `"${crypto.createHash('md5').update(JSON.stringify(portfolio)).digest('hex').slice(0, 12)}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.json(portfolio);
});

router.post('/', (req, res) => {
  const { wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, exchange, notes, date } = req.body;

  if (!wallet_id || !type || !coin_id || !coin_symbol || !amount || !price_per_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const total_cost = amount * price_per_unit;
  const result = stmts.insertTx.run(wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, total_cost, exchange || '', notes || '', date || new Date().toISOString().split('T')[0]);

  const transaction = stmts.getTxById.get(result.lastInsertRowid);
  res.status(201).json(transaction);
});

router.delete('/:id', (req, res) => {
  stmts.deleteTx.run(req.params.id);
  res.status(204).send();
});

export default router;
