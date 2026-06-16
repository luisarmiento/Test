const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (existing) {
    console.log('El usuario admin ya existe');
    return;
  }

  const hashedPassword = bcrypt.hashSync('admin123', 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      role: 'admin'
    }
  });

  console.log('Usuario admin creado (admin / admin123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
