import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MarketTick, MarketTrade, WS_EVENTS } from '@cryptomeme/shared';

/** Flux public des prix. Room "all" = résumé de tous les actifs ; room "asset:SYM" = trades d'un actif. */
@WebSocketGateway({ cors: { origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true } })
export class MarketGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage(WS_EVENTS.SUBSCRIBE)
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() symbol: unknown) {
    if (typeof symbol === 'string' && /^[A-Z0-9]{1,12}$/.test(symbol)) await socket.join(`asset:${symbol}`);
  }

  @SubscribeMessage(WS_EVENTS.UNSUBSCRIBE)
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() symbol: unknown) {
    if (typeof symbol === 'string') await socket.leave(`asset:${symbol}`);
  }

  broadcastTicks(ticks: MarketTick[]) {
    this.server?.emit(WS_EVENTS.TICK, ticks);
  }

  broadcastTrade(symbol: string, trade: MarketTrade) {
    this.server?.to(`asset:${symbol}`).emit(WS_EVENTS.TRADE, trade);
  }

  /** Les événements de jeu ont changé : les clients rechargent le fil. */
  broadcastEventsChanged() {
    this.server?.emit(WS_EVENTS.EVENTS_CHANGED);
  }
}
