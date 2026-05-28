import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cart } from '../carts/carts.entity';
import { Message } from '../messages/messages.entity';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  shopifyStoreName!: string; // mystore.myshopify.com

  @Column({ type: 'text', select: false })
  shopifyAccessToken!: string; // Encrypted in production

  @Column()
  whatsappPhoneNumber!: string; // +1234567890

  @Column({ nullable: true })
  whatsappPhoneNumberId!: string;

  @Column({ unique: true })
  apiKey!: string; // For API authentication

  @Column({ type: 'text', select: false })
  apiSecret!: string; // Encrypted in production

  @Column({
    type: 'text',
    default: 'Hola! 👋 Dejaste ${cartTotal} en tu carrito. Completa tu compra ahora con 15% OFF. ${link}',
  })
  messageTemplate!: string;

  @Column({ type: 'int', default: 15 })
  defaultDiscountPercent!: number;

  @Column({ type: 'varchar', length: 50, default: 'abandoned' })
  webhookStatus!: string; // 'installed', 'abandoned', 'inactive'

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Cart, (cart) => cart.merchant, { cascade: true })
  carts!: Cart[];

  @OneToMany(() => Message, (message) => message.merchant, { cascade: true })
  messages!: Message[];

  // Helper: Get stats summary
  async getQuickStats() {
    return {
      merchantId: this.id,
      shopifyStore: this.shopifyStoreName,
      isActive: this.isActive,
      discountPercent: this.defaultDiscountPercent,
    };
  }
}
