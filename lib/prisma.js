const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

async function connectWithRetry(maxRetries = 3, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('Conectado a la base de datos');
      return;
    } catch (err) {
      console.error(`Intento ${i + 1}/${maxRetries} - Error conectando a DB:`, err.message);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.warn('No se pudo conectar a la base de datos después de varios intentos');
}

connectWithRetry();

module.exports = prisma;
