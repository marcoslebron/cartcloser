import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Merchant } from '../merchants/merchants.entity';
import { Cart } from '../carts/carts.entity';

@Entity('messages')
@Index(['merchantId', 'cartId'])
@Index(['merchantId', 'status'])
@Index(['sentAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  merchantId: string;

  @ManyToOne(() => Merchant, (merchant) => merchant.messages, {
    onDelete: 'CASCADE',
  })
  merchant: Merchant;

  @Column()
  cartId: string;

  @ManyToOne(() => Cart, { onDelete: 'CASCADE' })
  cart: Cart;

  @Column()
  phoneNumber: string;

  @Column('text')
  messageText: string;

  @Column({ default: 'pending' })
  status: string; // 'pending', 'sent', 'delivered', 'read', 'failed'

  @Column({ nullable: true })
  twilioMessageSid: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  retryCount: number;

  @CreateDateColumn()
  sentAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
