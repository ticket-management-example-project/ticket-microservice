import { IsNotEmpty, IsString } from 'class-validator';

export class ListTicketsByTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
