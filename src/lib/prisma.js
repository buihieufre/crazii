const { PrismaClient } = require('@prisma/client');

// Automatically ensure ?pgbouncer=true is present whenever connecting to Supabase / PostgreSQL
// This prevents PostgreSQL error 26000 ("prepared statement does not exist")
let dbUrl = (process.env.DATABASE_URL || '').trim();
if (dbUrl) {
  if ((dbUrl.startsWith('"') && dbUrl.endsWith('"')) || (dbUrl.startsWith("'") && dbUrl.endsWith("'"))) {
    dbUrl = dbUrl.slice(1, -1).trim();
  }
  if (!dbUrl.includes('pgbouncer=true')) {
    const sep = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${sep}pgbouncer=true`;
  }
  process.env.DATABASE_URL = dbUrl;
}

let prismaInstance;

const clientOptions = {
  log: ['error', 'warn'],
};
if (dbUrl) {
  clientOptions.datasources = {
    db: { url: dbUrl }
  };
}

if (process.env.NODE_ENV === 'production') {
  prismaInstance = new PrismaClient(clientOptions);
} else {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient(clientOptions);
  }
  prismaInstance = global.prismaGlobal;
}

module.exports = prismaInstance;
module.exports.prisma = prismaInstance;
module.exports.default = prismaInstance;
