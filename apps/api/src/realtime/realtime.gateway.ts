import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import { PERMISSIONS } from '@riad/shared';
import type { Server, Socket } from 'socket.io';
import { PrincipalCacheService } from '../common/auth/principal-cache.service';
import { ACCESS_COOKIE, type AccessTokenPayload } from '../common/auth/principal';
import { env } from '../config/env';

export const REALTIME_PATH = '/api/v1/socket.io';

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Staff dashboards connect here with their session cookie and join their riad's room.
 * Events are notifications only ("something changed, reload"); data still comes from REST.
 */
@WebSocketGateway({
  path: REALTIME_PATH,
  cors: { origin: env().CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly principals: PrincipalCacheService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = readCookie(client.handshake.headers.cookie, ACCESS_COOKIE);
      if (!token) throw new Error('no session');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: env().JWT_ACCESS_SECRET,
      });
      const principal = await this.principals.get(payload.sub);
      if (!principal || principal.riadId !== payload.riadId) throw new Error('inactive user');
      if (!principal.permissions.includes(PERMISSIONS.STAYS_READ)) throw new Error('no stays.read');
      await client.join(`riad:${principal.riadId}`);
    } catch (e) {
      this.logger.debug(`Socket rejected: ${String(e)}`);
      client.emit('auth:error');
      client.disconnect(true);
    }
  }

  emitToRiad(riadId: string, event: string, payload: unknown): void {
    this.server?.to(`riad:${riadId}`).emit(event, payload);
  }
}
