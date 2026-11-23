import "server-only";
import { PrismaClient } from "@prisma/client";

// Giữ một PrismaClient duy nhất khi hot reload ở môi trường dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
