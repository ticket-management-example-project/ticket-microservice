import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmTicketTriageDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  reviewedBy: string;
}
