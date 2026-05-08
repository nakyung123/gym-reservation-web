import "server-only";
import { PrismaClient } from "@prisma/client";

// HMR 환경에서 PrismaClient가 여러 번 인스턴스화되는 것을 막는 표준 패턴.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
