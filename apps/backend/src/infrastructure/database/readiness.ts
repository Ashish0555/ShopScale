import { prisma } from "./prisma.js";

export async function checkDatabaseReadiness(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}
