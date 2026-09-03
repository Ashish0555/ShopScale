import createHttpError from "http-errors";
import type { AuthRepository, AuthResponse, LoginInput, LogoutInput, PublicUser, RefreshInput, RegisterInput } from "./auth.types.js";
import type { PasswordHasher } from "./password.service.js";
import type { JwtTokenService } from "./token.service.js";

export type AuthServiceDependencies = {
  repository: AuthRepository;
  passwordHasher: PasswordHasher;
  tokenService: JwtTokenService;
};

export class AuthService {
  constructor(private readonly dependencies: AuthServiceDependencies) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existingUser = await this.dependencies.repository.findUserByEmail(input.email);

    if (existingUser) {
      throw createHttpError(409, "A user with this email already exists");
    }

    const passwordHash = await this.dependencies.passwordHasher.hash(input.password);
    const user = await this.dependencies.repository.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
      role: "CUSTOMER"
    });

    return this.issueAuthResponse(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.dependencies.repository.findUserByEmail(input.email);

    if (!user || !user.isActive) {
      throw createHttpError(401, "Invalid email or password");
    }

    const passwordMatches = await this.dependencies.passwordHasher.verify(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw createHttpError(401, "Invalid email or password");
    }

    return this.issueAuthResponse(user);
  }

  async refresh(input: RefreshInput): Promise<AuthResponse> {
    const tokenHash = this.dependencies.tokenService.hashRefreshToken(input.refreshToken);
    const nextRefreshToken = this.dependencies.tokenService.generateRefreshToken();
    const rotation = await this.dependencies.repository.rotateRefreshToken({
      tokenHash,
      nextTokenHash: nextRefreshToken.tokenHash,
      nextExpiresAt: nextRefreshToken.expiresAt,
      now: new Date()
    });

    if (!rotation) {
      throw createHttpError(401, "Invalid refresh token");
    }

    const user = await this.dependencies.repository.findUserById(rotation.userId);

    if (!user || !user.isActive) {
      throw createHttpError(401, "Invalid refresh token");
    }

    return {
      user: toPublicUser(user),
      accessToken: this.dependencies.tokenService.signAccessToken(user),
      refreshToken: nextRefreshToken.token,
      tokenType: "Bearer",
      expiresIn: this.dependencies.tokenService.accessTokenExpiresInSeconds
    };
  }

  async logout(input: LogoutInput): Promise<void> {
    const tokenHash = this.dependencies.tokenService.hashRefreshToken(input.refreshToken);
    const refreshToken = await this.dependencies.repository.findRefreshTokenByHash(tokenHash);

    if (refreshToken && !refreshToken.revokedAt) {
      await this.dependencies.repository.revokeRefreshToken(refreshToken.id);
    }
  }

  private async issueAuthResponse(user: PublicUser): Promise<AuthResponse> {
    const refreshToken = this.dependencies.tokenService.generateRefreshToken();

    await this.dependencies.repository.createRefreshToken({
      userId: user.id,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt
    });

    return {
      user: toPublicUser(user),
      accessToken: this.dependencies.tokenService.signAccessToken(user),
      refreshToken: refreshToken.token,
      tokenType: "Bearer",
      expiresIn: this.dependencies.tokenService.accessTokenExpiresInSeconds
    };
  }
}

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
}
