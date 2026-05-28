import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Merchant } from '../merchants/merchants.entity';

@Entity('carts')
@Index(['merchantId', 'status'])
@Index(['merchantId', 'shopifyCheckoutId'])
@Index(['status', 'abandonedAt'])
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  merchantId!: string;

  @ManyToOne(() => Merchant, (merchant) => merchant.carts, {
    onDelete: 'CASCADE',
  })
  merchant!: Merchant;

  @Column()
  shopifyCheckoutId!: string;

  @Column()
  customerEmail!: string;

  @Column({ nullable: true })
  customerPhone!: string;

  @Column({ nullable: true })
  customerName!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  cartTotal!: number;

  @Column('simple-json', { nullable: true })
  cartItems!: Array<{
    title: string;
    quantity: number;
    price: string;
  }>;

  @Column('text', { nullable: true })
  checkoutUrl!: string;

  @Column({ default: 'abandoned' })
  status!: string; // 'abandoned', 'contacted', 'recovered', 'expired'

  @Column({ nullable: true })
  discountCode!: string;

  @Column({ default: 0 })
  discountPercent!: number;

  @Column({ default: 0 })
  messagesSent!: number;

  @Column({ nullable: true })
  lastMessageSentAt!: Date;

  @Column({ nullable: true })
  recoveredAt!: Date;

  @Column({ nullable: true })
  recoveredAmount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ nullable: true })
  abandonedAt!: Date;

  @Column({ nullable: true })
  expiresAt!: Date; // 30 days after abandoned
}
