// db.js
import { PrismaClient } from '@prisma/client';

// Check if there is already an instance of PrismaClient
let prisma;

if (process.env.NODE_ENV === 'production') {
  // In production, create a new instance every time
  prisma = new PrismaClient();
} else {
  // In development, use a global variable to store the client across modules
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

// Export the Prisma client instance
export default prisma;
