import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../carts/carts.entity';
import { MessagesService } from '../messages/messages.service';

interface DashboardResult {
  summary: {
    totalAbandoned: number;
    totalContacted: number;
    totalRecovered: number;
    recoveryRate: number;
    totalRecoveredRevenue: number;
    totalAbandonedRevenue: number;
  };
  messages: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  dailyBreakdown: Array<{
    date: string | null;
    abandoned: number;
    recovered: number;
    recoveredRevenue: number;
  }>;
  revenueTrend: Array<{
    date: string | null;
    recoveredRevenue: number;
  }>;
  topCustomers: Array<{
    customerEmail: string;
    customerName: string;
    cartTotal: number;
    status: string;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Cart)
    private cartsRepository: Repository<Cart>,
    private messagesService: MessagesService,
  ) {}

  async getDashboard(merchantId: string): Promise<DashboardResult> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalAbandoned, totalContacted, totalRecovered] = await Promise.all([
      this.cartsRepository.count({ where: { merchantId, status: 'abandoned' } }),
      this.cartsRepository.count({ where: { merchantId, status: 'contacted' } }),
      this.cartsRepository.count({ where: { merchantId, status: 'recovered' } }),
    ]);

    const abandonedRevenueRow = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('COALESCE(SUM(cart.cartTotal), 0)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'abandoned' })
      .getRawOne();

    const recoveredRevenueRow = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('COALESCE(SUM(cart.recoveredAmount), 0)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'recovered' })
      .getRawOne();

    const totalAbandonedRevenue = parseFloat(abandonedRevenueRow?.total ?? '0');
    const totalRecoveredRevenue = parseFloat(recoveredRevenueRow?.total ?? '0');
    const recoveryRate = totalAbandoned > 0 ? Math.round((totalRecovered / totalAbandoned) * 100) : 0;

    const dailyRows = await this.cartsRepository
      .createQueryBuilder('cart')
      .select("DATE_TRUNC('day', cart.abandonedAt)", 'date')
      .addSelect("COUNT(CASE WHEN cart.status = 'abandoned' THEN 1 END)", 'abandoned')
      .addSelect("COUNT(CASE WHEN cart.status = 'recovered' THEN 1 END)", 'recovered')
      .addSelect(
        "COALESCE(SUM(CASE WHEN cart.status = 'recovered' THEN cart.recoveredAmount ELSE 0 END), 0)",
        'recoveredRevenue',
      )
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.abandonedAt IS NOT NULL')
      .andWhere('cart.abandonedAt >= :since', { since: thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', cart.abandonedAt)")
      .orderBy("DATE_TRUNC('day', cart.abandonedAt)", 'ASC')
      .getRawMany();

    const dailyBreakdown = dailyRows.map((row) => ({
      date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
      abandoned: parseInt(row.abandoned, 10) || 0,
      recovered: parseInt(row.recovered, 10) || 0,
      recoveredRevenue: parseFloat(row.recoveredRevenue) || 0,
    }));

    const revenueTrend = dailyBreakdown.map((d) => ({
      date: d.date,
      recoveredRevenue: d.recoveredRevenue,
    }));

    const topCustomers = await this.cartsRepository
      .createQueryBuilder('cart')
      .select([
        'cart.customerEmail',
        'cart.customerName',
        'cart.cartTotal',
        'cart.status',
      ])
      .where('cart.merchantId = :merchantId', { merchantId })
      .orderBy('cart.cartTotal', 'DESC')
      .take(10)
      .getMany();

    const messageStats = await this.messagesService.getStatsByMerchant(merchantId);

    return {
      summary: {
        totalAbandoned,
        totalContacted,
        totalRecovered,
        recoveryRate,
        totalRecoveredRevenue,
        totalAbandonedRevenue,
      },
      messages: {
        sent: messageStats.sent,
        delivered: messageStats.delivered,
        read: messageStats.read,
        failed: messageStats.failed,
      },
      dailyBreakdown,
      revenueTrend,
      topCustomers: topCustomers.map((c) => ({
        customerEmail: c.customerEmail,
        customerName: c.customerName,
        cartTotal: Number(c.cartTotal),
        status: c.status,
      })),
    };
  }
}
