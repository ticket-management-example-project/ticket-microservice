import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LinkTicketToAccountDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  requesterId: string;

  @IsOptional()
  @IsString()
  correlationId?: string;
}
