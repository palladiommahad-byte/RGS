import { Global, Module } from '@nestjs/common';
import { env } from '../../config/env';
import { FieldEncryption } from './field-encryption';

@Global()
@Module({
  providers: [
    {
      provide: FieldEncryption,
      useFactory: () => new FieldEncryption(env().FIELD_ENCRYPTION_KEY, env().FIELD_HASH_KEY),
    },
  ],
  exports: [FieldEncryption],
})
export class CryptoModule {}
