import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TicketPriority } from '../domain/events/ticket-triaged.event';

export class CorrectTicketTriageDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsIn(['alta', 'media'])
  priority: TicketPriority;

  /** `null`/ausente = sin agente sugerido. */
  @IsOptional()
  @IsString()
  suggestedAgentId?: string | null;

  @IsString()
  @IsNotEmpty()
  reviewedBy: string;
}
