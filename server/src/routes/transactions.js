import { Router } from 'express';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const { wallet_id } = req.query;
  let transactions;
  if (wallet_id) {
    transactions = db.prepare(
      'SELECT * FROM transactions WHERE wallet_id = ? ORDER BY date DESC'
    ).all(wallet_id);
  } else {
    transactions = db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  }
  res.json(transactions);
});

router.get('/portfolio', (req, res) => {
  const { wallet_id } = req.query;
  let rows;
  if (wallet_id) {
    rows = db.prepare(`
      SELECT coin_id, coin_symbol, type, SUM(amount) as total_amount, SUM(total_cost) as total_cost
      FROM transactions WHERE wallet_id = ?
      GROUP BY coin_id, type
    `).all(wallet_id);
  } else {
    rows = db.prepare(`
      SELECT coin_id, coin_symbol, type, SUM(amount) as total_amount, SUM(total_cost) as total_cost
      FROM transactions
      GROUP BY coin_id, type
    `).all();
  }

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
  res.json(portfolio);
});

router.post('/', (req, res) => {
  const { wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, exchange, notes, date } = req.body;

  if (!wallet_id || !type || !coin_id || !coin_symbol || !amount || !price_per_unit) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const total_cost = amount * price_per_unit;
  const result = db.prepare(`
    INSERT INTO transactions (wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, total_cost, exchange, notes, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(wallet_id, type, coin_id, coin_symbol, amount, price_per_unit, total_cost, exchange || '', notes || '', date || new Date().toISOString().split('T')[0]);

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(transaction);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
