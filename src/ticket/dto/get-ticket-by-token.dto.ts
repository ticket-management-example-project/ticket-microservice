import { IsNotEmpty, IsString } from 'class-validator';

export class GetTicketByTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
