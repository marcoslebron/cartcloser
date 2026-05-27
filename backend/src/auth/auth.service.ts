import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { Merchant } from '../merchants/merchants.entity';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      merchantId: user.merchantId,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      merchantId: user.merchantId,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    return this.dataSource.transaction(async (manager) => {
      const merchantRepo = manager.getRepository(Merchant);
      const userRepo = manager.getRepository(User);

      const merchant = merchantRepo.create({
        shopifyStoreName: dto.shopifyStoreName,
        whatsappPhoneNumber: dto.whatsappPhoneNumber,
        apiKey: randomUUID(),
        shopifyAccessToken: '',
        apiSecret: '',
        isActive: true,
      });
      const savedMerchant = await merchantRepo.save(merchant);

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = userRepo.create({
        email: dto.email,
        passwordHash,
        merchantId: savedMerchant.id,
        role: 'owner',
      });
      const savedUser = await userRepo.save(user);

      const payload = {
        sub: savedUser.id,
        merchantId: savedMerchant.id,
        email: savedUser.email,
        role: savedUser.role,
      };
      return {
        accessToken: this.jwtService.sign(payload),
        merchantId: savedMerchant.id,
      };
    });
  }
}
