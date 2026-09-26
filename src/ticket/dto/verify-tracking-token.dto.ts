import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyTrackingTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
