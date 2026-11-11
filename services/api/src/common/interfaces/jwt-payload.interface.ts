export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: "STUDENT" | "ADMIN";
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // unique token id for rotation tracking
  iat?: number;
  exp?: number;
}

