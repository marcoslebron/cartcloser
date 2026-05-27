import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './messages.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
  ) {}

  async createMessage(data: {
    merchantId: string;
    cartId: string;
    phoneNumber: string;
    messageText: string;
  }): Promise<Message> {
    const message = this.messagesRepository.create({ ...data, status: 'pending' });
    return this.messagesRepository.save(message);
  }

  async updateStatus(
    twilioSid: string,
    status: string,
    errorMessage?: string,
  ): Promise<Message | null> {
    const message = await this.messagesRepository.findOne({
      where: { twilioMessageSid: twilioSid },
    });
    if (!message) return null;
    message.status = status;
    if (errorMessage) message.errorMessage = errorMessage;
    return this.messagesRepository.save(message);
  }

  async getMessagesByCart(cartId: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: { cartId },
      order: { sentAt: 'ASC' },
    });
  }

  async getStatsByMerchant(merchantId: string): Promise<{
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
  }> {
    const rows = await this.messagesRepository
      .createQueryBuilder('msg')
      .select('msg.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('msg.merchantId = :merchantId', { merchantId })
      .groupBy('msg.status')
      .getRawMany();

    const counts: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status] = parseInt(row.count, 10);
      }
    }
    return counts as { sent: number; delivered: number; read: number; failed: number; pending: number };
  }
}
