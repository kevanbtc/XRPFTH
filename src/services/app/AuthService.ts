import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../logging/Logger'; // Corrected import

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey'; // Should be loaded from environment variables
const JWT_EXPIRES_IN = '1h';

export class AuthService {
  async register(email: string, password: string): Promise<any> {
    logger.info(`Attempting to register user: ${email}`);
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
        },
      });
      logger.info(`User registered successfully: ${user.email}`);
      return this.generateToken(user.id, user.email);
    } catch (error: any) {
      logger.error(`Registration failed for ${email}: ${error.message}`);
      throw new Error('User registration failed');
    }
  }

  async login(email: string, password: string): Promise<any> {
    logger.info(`Attempting to log in user: ${email}`);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logger.warn(`Login failed: User not found for ${email}`);
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn(`Login failed: Invalid password for ${email}`);
      throw new Error('Invalid credentials');
    }

    logger.info(`User logged in successfully: ${user.email}`);
    return this.generateToken(user.id, user.email);
  }

  private generateToken(userId: string, email: string): { token: string } {
    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { token };
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error: any) {
      logger.warn(`Token verification failed: ${error.message}`);
      throw new Error('Invalid or expired token');
    }
  }
}
