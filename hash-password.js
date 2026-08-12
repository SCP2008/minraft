#!/usr/bin/env node
// Gera o hash bcrypt de uma senha para colocar em ADMIN_PASSWORD_HASH no .env
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Uso: npm run hash-password -- "sua-senha-aqui"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nAdicione esta linha ao seu arquivo .env:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
