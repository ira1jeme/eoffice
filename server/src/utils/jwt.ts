import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
}

const SECRET = process.env.JWT_SECRET as string;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!SECRET) {
  // Fail fast: never start the server with a missing secret.
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and configure it.');
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { 
    expiresIn: EXPIRES_IN as any 
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
