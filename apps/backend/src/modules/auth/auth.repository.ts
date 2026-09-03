import { Prisma, type PrismaClient } from "@prisma/client";
import createHttpError from "http-errors";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "./auth.types.js";

type PrismaUser = Awaited<ReturnType<PrismaClient["user"]["findUnique"]>>;
type PrismaRefreshToken = Awaited<ReturnType<PrismaClient["refreshToken"]["findUnique"]>>;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<StoredUser> {
    try {
      const user = await this.prisma.user.create({
        data: input
      });

      return mapStoredUser(user);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw createHttpError(409, "A user with this email already exists");
      }

      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    return user ? mapStoredUser(user) : null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id }
    });

    return user ? mapStoredUser(user) : null;
  }

  async listUsers(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" }
    });

    return users.map(mapPublicUser);
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const refreshToken = await this.prisma.refreshToken.create({
      data: input
    });

    return mapRefreshToken(refreshToken);
  }

  async rotateRefreshToken(input: {
    tokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<{ userId: string; nextRefreshToken: RefreshTokenRecord } | null> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const currentRefreshToken = await transaction.refreshToken.findUnique({
          where: { tokenHash: input.tokenHash }
        });

        if (
          !currentRefreshToken ||
          currentRefreshToken.revokedAt ||
          currentRefreshToken.expiresAt <= input.now
        ) {
          return null;
        }

        const nextRefreshToken = await transaction.refreshToken.create({
          data: {
            userId: currentRefreshToken.userId,
            tokenHash: input.nextTokenHash,
            expiresAt: input.nextExpiresAt
          }
        });

        const update = await transaction.refreshToken.updateMany({
          where: {
            id: currentRefreshToken.id,
            revokedAt: null,
            expiresAt: {
              gt: input.now
            }
          },
          data: {
            revokedAt: input.now,
            replacedByTokenId: nextRefreshToken.id
          }
        });

        if (update.count !== 1) {
          throw new RefreshTokenRotationConflictError();
        }

        return {
          userId: currentRefreshToken.userId,
          nextRefreshToken: mapRefreshToken(nextRefreshToken)
        };
      });
    } catch (error: unknown) {
      if (error instanceof RefreshTokenRotationConflictError) {
        return null;
      }

      throw error;
    }
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash }
    });

    return refreshToken ? mapRefreshToken(refreshToken) : null;
  }

  async revokeRefreshToken(id: string, replacedByTokenId?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId
      }
    });
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }
}

class RefreshTokenRotationConflictError extends Error {
  constructor() {
    super("Refresh token was already rotated");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function mapPublicUser(user: NonNullable<PrismaUser>): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
}

function mapStoredUser(user: NonNullable<PrismaUser>): StoredUser {
  return {
    ...mapPublicUser(user),
    passwordHash: user.passwordHash,
    isActive: user.isActive
  };
}

function mapRefreshToken(refreshToken: NonNullable<PrismaRefreshToken>): RefreshTokenRecord {
  return {
    id: refreshToken.id,
    tokenHash: refreshToken.tokenHash,
    userId: refreshToken.userId,
    expiresAt: refreshToken.expiresAt,
    revokedAt: refreshToken.revokedAt,
    replacedByTokenId: refreshToken.replacedByTokenId
  };
}
