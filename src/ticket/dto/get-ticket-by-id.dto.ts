import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GetTicketByIdDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsString()
  correlationId?: string;
}
