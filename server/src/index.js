import express from 'express';
import cors from 'cors';
import walletsRouter from './routes/wallets.js';
import transactionsRouter from './routes/transactions.js';
import pricesRouter from './routes/prices.js';
import exchangesRouter from './routes/exchanges.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/wallets', walletsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/exchanges', exchangesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
