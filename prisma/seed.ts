import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("Set SEED_ADMIN_PASSWORD (>=8 chars) before seeding.");
  }
  const exists = await prisma.adminUser.findUnique({ where: { username } });
  if (exists) {
    console.log(`Admin "${username}" already exists; skipping.`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: {
      id: crypto.randomUUID(),
      username,
      passwordHash,
      passwordVersion: 2,
      displayName: "システム管理者",
      role: "super_admin",
      isActive: true,
      updatedAt: new Date(),
    },
  });
  console.log(`Created super_admin "${username}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
