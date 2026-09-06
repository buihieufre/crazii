const { PrismaClient } = require('@prisma/client');

let prismaInstance;

if (process.env.NODE_ENV === 'production') {
  prismaInstance = new PrismaClient();
} else {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      log: ['error', 'warn'],
    });
  }
  prismaInstance = global.prismaGlobal;
}

module.exports = {
  prisma: prismaInstance,
  default: prismaInstance
};
