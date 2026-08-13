const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { withDb, readDb } = require('../db');
const { requireVendorAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

router.post('/vendor/login', loginLimiter, async (req, res) => {
  const { password } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe a senha.' });
  }

  const hash = process.env.VENDOR_PASSWORD_HASH;
  if (!hash) {
    return res.status(500).json({ error: 'Painel de fornecedor nao configurado (VENDOR_PASSWORD_HASH ausente).' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }

  const token = jwt.sign({ role: 'vendor' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

const ONLINE_THRESHOLD_MS = 90 * 1000; // player consulta a cada 60s; margem de folga

router.get('/vendor/devices', requireVendorAuth, (req, res) => {
  const { devices } = readDb();
  const maxTvs = parseInt(process.env.MAX_TVS, 10) || 2;
  const now = Date.now();

  const enriched = devices.map((d, index) => ({
    ...d,
    screen: index + 1,
    online: now - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS,
  }));

  res.json({ devices: enriched, maxTvs });
});

router.delete('/vendor/devices/:id', requireVendorAuth, async (req, res) => {
  const { id } = req.params;

  const removed = await withDb((data) => {
    const index = data.devices.findIndex((d) => d.id === id);
    if (index === -1) return false;
    data.devices.splice(index, 1);
    return true;
  });

  if (!removed) return res.status(404).json({ error: 'Dispositivo nao encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
