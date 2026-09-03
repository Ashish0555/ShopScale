export type UserRole = "CUSTOMER" | "ADMIN";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
};

export type StoredUser = PublicUser & {
  passwordHash: string;
  isActive: boolean;
};

export type RefreshTokenRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export type AuthResponse = TokenPair & {
  user: PublicUser;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RefreshInput = {
  refreshToken: string;
};

export type LogoutInput = {
  refreshToken: string;
};

export type AuthRepository = {
  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<StoredUser>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  listUsers(): Promise<PublicUser[]>;
  createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  rotateRefreshToken(input: {
    tokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<{ userId: string; nextRefreshToken: RefreshTokenRecord } | null>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string, replacedByTokenId?: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
};
