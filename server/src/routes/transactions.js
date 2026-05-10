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
  const portfolio = wallet_id
    ? db.prepare(`
        SELECT
          coin_id,
          coin_symbol,
          SUM(CASE WHEN type = 'buy' THEN  amount     ELSE -amount     END) AS amount,
          SUM(CASE WHEN type = 'buy' THEN  total_cost ELSE -total_cost END) AS total_invested
        FROM transactions
        WHERE wallet_id = ?
        GROUP BY coin_id, coin_symbol
        HAVING amount > 0.00000001
      `).all(wallet_id)
    : db.prepare(`
        SELECT
          coin_id,
          coin_symbol,
          SUM(CASE WHEN type = 'buy' THEN  amount     ELSE -amount     END) AS amount,
          SUM(CASE WHEN type = 'buy' THEN  total_cost ELSE -total_cost END) AS total_invested
        FROM transactions
        GROUP BY coin_id, coin_symbol
        HAVING amount > 0.00000001
      `).all();
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
