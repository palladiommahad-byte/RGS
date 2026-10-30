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
 * Staff dashboards connect here with their session cookie. Events are notifications only
 * ("something changed, reload"); data still comes from REST. Two channels per riad:
 * - `riad:<id>` (stays.read): stay events, which may carry guest names;
 * - `rooms:<id>` (rooms.read): room status changes, no guest data — housekeeping too.
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
      const stays = principal.permissions.includes(PERMISSIONS.STAYS_READ);
      const rooms = principal.permissions.includes(PERMISSIONS.ROOMS_READ);
      if (!stays && !rooms) throw new Error('no stays.read or rooms.read');
      if (stays) await client.join(`riad:${principal.riadId}`);
      if (rooms) await client.join(`rooms:${principal.riadId}`);
    } catch (e) {
      this.logger.debug(`Socket rejected: ${String(e)}`);
      client.emit('auth:error');
      client.disconnect(true);
    }
  }

  emitToRiad(riadId: string, event: string, payload: unknown): void {
    this.server?.to(`riad:${riadId}`).emit(event, payload);
  }

  /** A room's status or details changed (check-in, check-out, room move, housekeeping…). */
  roomsChanged(riadId: string): void {
    this.server?.to(`rooms:${riadId}`).emit('rooms:changed', {});
  }

  /** A stay was created, edited, confirmed, checked out, cancelled or rejected. */
  staysChanged(riadId: string): void {
    this.emitToRiad(riadId, 'stays:changed', {});
  }
}
