import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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

  /** Story 3.2: optional Requester contact channel (FR-18) -- rejected as a
   * 400 validation error when present but malformed, never persisted/passed
   * through as-is (defense in depth, `Ticket.create()` re-validates format
   * regardless of caller). `@ValidateIf` (not `@IsOptional`) so an explicit
   * empty string is ALSO treated as absent, never rejected -- its absence
   * must never block creation. */
  @ValidateIf((o) => o.contactEmail !== undefined && o.contactEmail !== '')
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;
}
