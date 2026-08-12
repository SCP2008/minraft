require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { attachSocket } = require('./socket');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const vendorRoutes = require('./routes/vendor');

const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_PASSWORD_HASH'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Variaveis de ambiente ausentes: ${missing.join(', ')}`);
  console.error('Copie .env.example para .env e configure. Use "npm run hash-password" para gerar ADMIN_PASSWORD_HASH.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || '*';

const io = attachSocket(server, corsOrigin);
app.set('io', io);

app.use(helmet({
  contentSecurityPolicy: false, // paginas simples, sem scripts de terceiros
}));
app.use(cors({ origin: corsOrigin }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '1d' }));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/player', express.static(path.join(__dirname, '..', 'public', 'player')));
app.use('/vendor', express.static(path.join(__dirname, '..', 'public', 'vendor')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', authRoutes);
app.use('/api', videoRoutes);
app.use('/api', vendorRoutes);

app.use('/', express.static(path.join(__dirname, '..', 'public', 'home')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sinalizacao digital rodando na porta ${PORT}`);
  console.log(`Painel admin: /admin`);
  console.log(`Player das TVs: /player`);
});
