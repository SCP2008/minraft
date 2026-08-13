const jwt = require('jsonwebtoken');

function requireRole(role) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Nao autenticado.' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.role !== role) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      req.auth = payload;
      return next();
    } catch {
      return res.status(401).json({ error: 'Sessao invalida ou expirada.' });
    }
  };
}

module.exports = {
  requireAuth: requireRole('admin'),
  requireVendorAuth: requireRole('vendor'),
};
