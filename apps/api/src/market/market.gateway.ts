import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WS_EVENTS } from '@cryptomeme/shared';

/** Flux public des prix. Room "all" = résumé de tous les actifs ; room "asset:SYM" = trades d'un actif. */
@WebSocketGateway({ cors: { origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true } })
export class MarketGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage(WS_EVENTS.SUBSCRIBE)
  subscribe(@ConnectedSocket() socket: Socket, @MessageBody() symbol: string) {
    if (typeof symbol === 'string' && /^[A-Z0-9]{1,12}$/.test(symbol)) socket.join(`asset:${symbol}`);
  }

  @SubscribeMessage(WS_EVENTS.UNSUBSCRIBE)
  unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() symbol: string) {
    if (typeof symbol === 'string') socket.leave(`asset:${symbol}`);
  }

  broadcastTicks(ticks: unknown[]) {
    this.server?.emit(WS_EVENTS.TICK, ticks);
  }

  broadcastTrade(symbol: string, trade: unknown) {
    this.server?.to(`asset:${symbol}`).emit(WS_EVENTS.TRADE, trade);
  }
}
