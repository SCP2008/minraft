const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { withDb, readDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska']);
const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Formato de video nao suportado. Use MP4, WebM, OGG ou MOV.'));
    }
    cb(null, true);
  },
});

function notifyPlayers(req) {
  const io = req.app.get('io');
  if (io) io.emit('playlist:updated');
}

function sortByOrder(videos) {
  return [...videos].sort((a, b) => a.order - b.order);
}

// Publico: usado pelas TVs para montar a playlist. So retorna videos ativos.
router.get('/player/videos', (req, res) => {
  const { videos } = readDb();
  const active = sortByOrder(videos.filter((v) => v.active));
  res.json({ videos: active });
});

// Protegido: lista completa (ativos e inativos) para o painel admin.
router.get('/videos', requireAuth, (req, res) => {
  const { videos } = readDb();
  res.json({ videos: sortByOrder(videos) });
});

// Adiciona video por upload de arquivo.
router.post('/videos/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Falha no upload.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const title = (req.body.title || req.file.originalname || 'Video').trim();

    const video = await withDb((data) => {
      const maxOrder = data.videos.reduce((max, v) => Math.max(max, v.order), -1);
      const entry = {
        id: uuidv4(),
        title,
        type: 'upload',
        src: `/uploads/${req.file.filename}`,
        active: true,
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
      };
      data.videos.push(entry);
      return entry;
    });

    notifyPlayers(req);
    res.status(201).json({ video });
  });
});

// Adiciona video por link direto (mp4/webm publico).
router.post('/videos/url', requireAuth, async (req, res) => {
  const { title, url } = req.body || {};

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Informe um link de video valido (http/https).' });
  }

  const video = await withDb((data) => {
    const maxOrder = data.videos.reduce((max, v) => Math.max(max, v.order), -1);
    const entry = {
      id: uuidv4(),
      title: (title || url).trim(),
      type: 'url',
      src: url.trim(),
      active: true,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    data.videos.push(entry);
    return entry;
  });

  notifyPlayers(req);
  res.status(201).json({ video });
});

// Renomeia / ativa / desativa um video.
router.patch('/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, active } = req.body || {};

  const video = await withDb((data) => {
    const found = data.videos.find((v) => v.id === id);
    if (!found) return null;
    if (typeof title === 'string' && title.trim()) found.title = title.trim();
    if (typeof active === 'boolean') found.active = active;
    return found;
  });

  if (!video) return res.status(404).json({ error: 'Video nao encontrado.' });

  notifyPlayers(req);
  res.json({ video });
});

// Reordena a playlist. Espera { order: [id1, id2, id3, ...] }
router.put('/videos/reorder', requireAuth, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'Envie a lista ordenada de ids em "order".' });
  }

  const videos = await withDb((data) => {
    const positions = new Map(order.map((id, index) => [id, index]));
    data.videos.forEach((v) => {
      if (positions.has(v.id)) v.order = positions.get(v.id);
    });
    return data.videos;
  });

  notifyPlayers(req);
  res.json({ videos: sortByOrder(videos) });
});

// Remove um video (e o arquivo local, se for upload).
router.delete('/videos/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const removed = await withDb((data) => {
    const index = data.videos.findIndex((v) => v.id === id);
    if (index === -1) return null;
    const [video] = data.videos.splice(index, 1);
    return video;
  });

  if (!removed) return res.status(404).json({ error: 'Video nao encontrado.' });

  if (removed.type === 'upload') {
    const filePath = path.join(UPLOAD_DIR, path.basename(removed.src));
    fs.unlink(filePath, () => {});
  }

  notifyPlayers(req);
  res.json({ ok: true });
});

module.exports = router;
