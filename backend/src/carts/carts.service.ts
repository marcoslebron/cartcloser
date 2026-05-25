import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cart } from './carts.entity';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart)
    private cartsRepository: Repository<Cart>,
  ) {}

  /**
   * Create abandoned cart from Shopify webhook
   */
  async createAbandonedCart(merchantId: string, webhookData: any) {
    // Check if cart already exists
    const existing = await this.cartsRepository.findOne({
      where: {
        merchantId,
        shopifyCheckoutId: webhookData.id,
      },
    });

    if (existing) {
      return existing;
    }

    const cart = this.cartsRepository.create({
      merchantId,
      shopifyCheckoutId: webhookData.id,
      customerEmail: webhookData.customer?.email || webhookData.email,
      customerPhone: webhookData.customer?.phone || webhookData.phone,
      customerName: webhookData.customer?.first_name,
      cartTotal: parseFloat(webhookData.total_price),
      cartItems: webhookData.line_items || [],
      checkoutUrl: webhookData.abandoned_checkout_url || '',
      abandonedAt: new Date(),
      status: 'abandoned',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return this.cartsRepository.save(cart);
  }

  /**
   * Get cart by ID
   */
  async getCart(cartId: string) {
    return this.cartsRepository.findOne({
      where: { id: cartId },
    });
  }

  /**
   * Mark message as sent
   */
  async markMessageSent(cartId: string) {
    return this.cartsRepository.update(
      { id: cartId },
      {
        messagesSent: () => 'messagesSent + 1',
        lastMessageSentAt: new Date(),
      },
    );
  }

  /**
   * Mark cart as recovered
   */
  async markRecovered(cartId: string, recoveredAmount?: number) {
    return this.cartsRepository.update(
      { id: cartId },
      {
        status: 'recovered',
        recoveredAt: new Date(),
        recoveredAmount: recoveredAmount || null,
      },
    );
  }

  /**
   * Get unmessaged carts for a merchant (last 24h)
   */
  async getUnmessagedCarts(merchantId: string, limit: number = 100) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.cartsRepository.find({
      where: {
        merchantId,
        status: 'abandoned',
      },
      order: { abandonedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get stats for merchant dashboard
   */
  async getStats(merchantId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total abandoned carts (last 30 days)
    const totalAbandoned = await this.cartsRepository.count({
      where: {
        merchantId,
        status: 'abandoned',
        abandonedAt: Between(thirtyDaysAgo, now),
      },
    });

    // Recovered carts (last 30 days)
    const recovered = await this.cartsRepository.count({
      where: {
        merchantId,
        status: 'recovered',
        recoveredAt: Between(thirtyDaysAgo, now),
      },
    });

    // Total value abandoned
    const abandonedValue = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('SUM(cart.cartTotal)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'abandoned' })
      .andWhere('cart.abandonedAt BETWEEN :start AND :end', {
        start: thirtyDaysAgo,
        end: now,
      })
      .getRawOne();

    // Total value recovered
    const recoveredValue = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('SUM(cart.recoveredAmount)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'recovered' })
      .andWhere('cart.recoveredAt BETWEEN :start AND :end', {
        start: thirtyDaysAgo,
        end: now,
      })
      .getRawOne();

    const recoveryRate =
      totalAbandoned > 0 ? ((recovered / totalAbandoned) * 100).toFixed(2) : 0;

    return {
      totalAbandoned,
      recovered,
      recoveryRate: parseFloat(recoveryRate as string),
      totalValue: parseFloat(abandonedValue?.total || 0),
      recoveredValue: parseFloat(recoveredValue?.total || 0),
      potentialRevenue:
        parseFloat(abandonedValue?.total || 0) -
        parseFloat(recoveredValue?.total || 0),
    };
  }

  /**
   * Get recent carts for dashboard
   */
  async getRecentCarts(merchantId: string, limit: number = 10) {
    return this.cartsRepository.find({
      where: { merchantId },
      order: { abandonedAt: 'DESC' },
      take: limit,
    });
  }
}
