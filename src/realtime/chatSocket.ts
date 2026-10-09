import { io, Socket } from 'socket.io-client';
import { SellerActivity, SupportTicket } from '../api/customer';
import { getChatServerOrigin } from '../config/api';

type Ack<T> = { ok: true } & T | { ok: false; error?: string };

type ServerToClientEvents = {
  'support:ticket_updated': (payload: { ticket: SupportTicket }) => void;
  'support:message:new': (payload: {
    ticketId: string;
    message?: string;
    clientMessageId?: string | null;
    senderType?: string;
    ticket: SupportTicket;
  }) => void;
  'support:message:read': (payload: {
    ticketId: string;
    readerType?: string;
    unreadCustomerCount?: number;
    unreadAgentCount?: number;
  }) => void;
  'support:chat:status': (payload: {
    ticketId: string;
    status?: string;
    unreadCustomerCount?: number;
    unreadAgentCount?: number;
  }) => void;
  'sell:activity_updated': (payload: { activity: SellerActivity }) => void;
};

type ClientToServerEvents = {
  'support:join': (payload: { ticketId: string }, ack?: (payload: Ack<{ ticket: SupportTicket }>) => void) => void;
  'support:leave': (payload: { ticketId: string }, ack?: (payload: Ack<Record<string, never>>) => void) => void;
  'support:send': (
    payload: { ticketId: string; message: string; clientMessageId?: string },
    ack?: (payload: Ack<{ ticket: SupportTicket }>) => void,
  ) => void;
  'support:read': (payload: { ticketId: string }, ack?: (payload: Ack<{ ticket: SupportTicket }>) => void) => void;
  'sell:join': (payload: { sellRequestId: string }, ack?: (payload: Ack<{ activity: SellerActivity }>) => void) => void;
  'sell:send': (payload: { sellRequestId: string; text: string }, ack?: (payload: Ack<{ activity: SellerActivity }>) => void) => void;
};

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ChatConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export function createChatSocket(accessToken: string): ChatSocket {
  return io(`${getChatServerOrigin()}/chat`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 15000,
  });
}
