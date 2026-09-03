import { prisma } from "../src/infrastructure/database/prisma.js";

async function main(): Promise<void> {
  await prisma.appMetadata.upsert({
    where: { key: "seed_status" },
    update: { value: "completed" },
    create: { key: "seed_status", value: "completed" }
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
