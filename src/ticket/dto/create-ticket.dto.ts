import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  tenantSlug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  description: string;

  /** Gateway-side request correlationId (distinct from the domain event's
   * correlationId = Ticket aggregate root id); optional so direct NATS
   * callers that don't set it still work. */
  @IsOptional()
  @IsString()
  correlationId?: string;
}
