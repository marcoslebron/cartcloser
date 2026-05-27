import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './merchants.entity';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private merchantsRepository: Repository<Merchant>,
  ) {}

  async findById(merchantId: string): Promise<Merchant | null> {
    return this.merchantsRepository.findOne({ where: { id: merchantId } });
  }

  async getMerchantById(merchantId: string): Promise<Merchant | null> {
    return this.findById(merchantId);
  }

  async findByApiKey(apiKey: string): Promise<Merchant | null> {
    return this.merchantsRepository.findOne({ where: { apiKey, isActive: true } });
  }

  async getMerchantConfig(merchantId: string) {
    const merchant = await this.merchantsRepository.findOne({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return {
      messageTemplate: merchant.messageTemplate,
      defaultDiscountPercent: merchant.defaultDiscountPercent,
      whatsappPhoneNumber: merchant.whatsappPhoneNumber,
      whatsappPhoneNumberId: merchant.whatsappPhoneNumberId,
    };
  }

  async updateConfig(merchantId: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.findById(merchantId);
    if (!merchant) throw new NotFoundException('Merchant not found');
    Object.assign(merchant, dto);
    return this.merchantsRepository.save(merchant);
  }

  async create(data: {
    shopifyStoreName: string;
    whatsappPhoneNumber: string;
    apiKey: string;
  }): Promise<Merchant> {
    const merchant = this.merchantsRepository.create({
      ...data,
      shopifyAccessToken: '',
      apiSecret: '',
      isActive: true,
    });
    return this.merchantsRepository.save(merchant);
  }
}
