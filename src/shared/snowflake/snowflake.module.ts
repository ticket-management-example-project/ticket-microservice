import { Global, Module } from '@nestjs/common';
import { envs } from 'src/shared/config/envs';
import { SNOWFLAKE_ID_GENERATOR } from 'src/shared/config/services';
import { SnowflakeIdGenerator } from './snowflake-id.generator';

@Global()
@Module({
  providers: [
    {
      provide: SNOWFLAKE_ID_GENERATOR,
      useFactory: () => new SnowflakeIdGenerator(envs.snowflakeMachineId),
    },
  ],
  exports: [SNOWFLAKE_ID_GENERATOR],
})
export class SnowflakeModule {}
