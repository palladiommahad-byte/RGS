import { Global, Module } from '@nestjs/common';
import { PrincipalCacheService } from './principal-cache.service';

@Global()
@Module({
  providers: [PrincipalCacheService],
  exports: [PrincipalCacheService],
})
export class AuthCoreModule {}
