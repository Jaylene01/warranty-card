const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      ts TEXT,
      customer TEXT,
      vehicle TEXT,
      mileage TEXT,
      activation TEXT,
      activation_raw TEXT,
      expiry TEXT,
      warranty TEXT,
      warranty_months TEXT,
      status TEXT,
      status_value TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function rowToRecord(row) {
  return {
    id: row.id,
    ts: row.ts,
    customer: row.customer,
    vehicle: row.vehicle,
    mileage: row.mileage,
    activation: row.activation,
    activationRaw: row.activation_raw,
    expiry: row.expiry,
    warranty: row.warranty,
    warrantyMonths: row.warranty_months,
    status: row.status,
    statusValue: row.status_value
  };
}

app.get('/api/records', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM records ORDER BY created_at DESC');
    res.json(rows.map(rowToRecord));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/records', async (req, res) => {
  try {
    const r = req.body || {};
    const ts = new Date().toLocaleString('zh-CN', { hour12: false });
    const { rows } = await pool.query(
      `INSERT INTO records
        (ts, customer, vehicle, mileage, activation, activation_raw, expiry, warranty, warranty_months, status, status_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [ts, r.customer, r.vehicle, r.mileage, r.activation, r.activationRaw, r.expiry, r.warranty, r.warrantyMonths, r.status, r.statusValue]
    );
    res.json(rowToRecord(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM records WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/records', async (req, res) => {
  try {
    await pool.query('DELETE FROM records');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log('Server listening on port ' + PORT));
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
