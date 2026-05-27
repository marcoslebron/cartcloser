import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  whatsappPhoneNumber?: string;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  defaultDiscountPercent?: number;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;
}
