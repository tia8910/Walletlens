import { Router } from 'express';
import db from '../database.js';

const router = Router();

router.get('/', (req, res) => {
  const wallets = db.prepare('SELECT * FROM wallets ORDER BY created_at DESC').all();
  res.json(wallets);
});

router.get('/:id', (req, res) => {
  const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(req.params.id);
  if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
  res.json(wallet);
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = db.prepare('INSERT INTO wallets (name, description) VALUES (?, ?)').run(name, description || '');
  const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(wallet);
});

router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  db.prepare('UPDATE wallets SET name = ?, description = ? WHERE id = ?').run(name, description || '', req.params.id);
  const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(req.params.id);
  res.json(wallet);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM wallets WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
