import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetTicketsByRequesterDto {
  @IsString()
  @IsNotEmpty()
  tenantSlug: string;

  @IsString()
  @IsNotEmpty()
  requesterId: string;

  @IsOptional()
  @IsString()
  correlationId?: string;
}
