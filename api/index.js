require('dotenv').config();
require('../lib/tracing');

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const prisma = require('../lib/prisma');
const { loginCounter, registerCounter, calculationCounter, calculationHistogram, errorCounter } = require('../lib/tracing');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'calculadora-jwt-secret-2024';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function getTokenUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getTokenUser(req);
  if (!user) {
    errorCounter.add(1);
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.userId = user.userId;
  req.username = user.username;
  req.role = user.role;
  next();
}

function requireAdmin(req, res, next) {
  const user = getTokenUser(req);
  if (!user) {
    errorCounter.add(1);
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (user.role !== 'admin') {
    errorCounter.add(1);
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  req.userId = user.userId;
  req.username = user.username;
  req.role = user.role;
  next();
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword }
    });
    registerCounter.add(1);
    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: user.username, role: user.role });
  } catch (err) {
    errorCounter.add(1);
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    loginCounter.add(1);
    const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, username: user.username, role: user.role });
  } catch {
    errorCounter.add(1);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.userId, username: req.username, role: req.role });
});

app.post('/api/calculate', requireAuth, async (req, res) => {
  const { expression } = req.body;
  if (!expression) {
    return res.status(400).json({ error: 'Expresión requerida' });
  }
  const start = Date.now();
  try {
    const sanitized = expression.replace(/[^0-9+\-*/.()%\s]/g, '');
    if (!sanitized) {
      errorCounter.add(1);
      return res.status(400).json({ error: 'Expresión inválida' });
    }
    const result = Function('"use strict"; return (' + sanitized + ')')();
    if (typeof result !== 'number' || !isFinite(result)) {
      errorCounter.add(1);
      return res.status(400).json({ error: 'Resultado inválido' });
    }
    const resultStr = Number.isInteger(result) ? result.toString() : result.toFixed(4);
    await prisma.calculation.create({
      data: {
        user_id: req.userId,
        expression,
        result: resultStr
      }
    });
    calculationCounter.add(1);
    calculationHistogram.record(Date.now() - start, { expression_type: expression.match(/[+\-*/]/)?.[0] || 'unknown' });
    res.json({ expression, result: resultStr });
  } catch {
    errorCounter.add(1);
    res.status(400).json({ error: 'Expresión inválida' });
  }
});

app.get('/api/calculations', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const total = await prisma.calculation.count({ where: { user_id: req.userId } });
  const data = await prisma.calculation.findMany({
    where: { user_id: req.userId },
    orderBy: { created_at: 'desc' },
    skip: offset,
    take: limit
  });
  res.json({ data, total, page, limit });
});

app.delete('/api/calculations/:id', requireAuth, async (req, res) => {
  const calc = await prisma.calculation.findFirst({
    where: { id: parseInt(req.params.id), user_id: req.userId }
  });
  if (!calc) {
    return res.status(404).json({ error: 'Cálculo no encontrado' });
  }
  await prisma.calculation.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { created_at: 'desc' },
    select: { id: true, username: true, role: true, created_at: true }
  });
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  const user = await prisma.user.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.username === 'admin') return res.status(400).json({ error: 'No puedes cambiar el rol del admin principal' });
  await prisma.user.update({
    where: { id: parseInt(req.params.id) },
    data: { role }
  });
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.username === 'admin') return res.status(400).json({ error: 'No puedes eliminar al admin principal' });
  await prisma.calculation.deleteMany({ where: { user_id: parseInt(req.params.id) } });
  await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

app.get('/api/admin/calculations', requireAdmin, async (req, res) => {
  const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const where = userId ? { user_id: userId } : {};
  const total = await prisma.calculation.count({ where });
  const data = await prisma.calculation.findMany({
    where,
    orderBy: { created_at: 'desc' },
    skip: offset,
    take: limit,
    include: { user: { select: { username: true } } }
  });
  const mapped = data.map(c => ({
    ...c,
    username: c.user.username,
    user: undefined
  }));
  res.json({ data: mapped, total, page, limit });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Admin: admin / admin123`);
  });
}

module.exports = app;
