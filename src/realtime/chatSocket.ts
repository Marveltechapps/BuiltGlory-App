import { io, Socket } from 'socket.io-client';
import { CUSTOMER_API_BASE_URL, SellerActivity, SupportTicket } from '../api/customer';

type Ack<T> = { ok: true } & T | { ok: false; error?: string };

type ServerToClientEvents = {
  'support:ticket_updated': (payload: { ticket: SupportTicket }) => void;
  'sell:activity_updated': (payload: { activity: SellerActivity }) => void;
};

type ClientToServerEvents = {
  'support:join': (payload: { ticketId: string }, ack?: (payload: Ack<{ ticket: SupportTicket }>) => void) => void;
  'support:send': (payload: { ticketId: string; message: string }, ack?: (payload: Ack<{ ticket: SupportTicket }>) => void) => void;
  'sell:join': (payload: { sellRequestId: string }, ack?: (payload: Ack<{ activity: SellerActivity }>) => void) => void;
  'sell:send': (payload: { sellRequestId: string; text: string }, ack?: (payload: Ack<{ activity: SellerActivity }>) => void) => void;
};

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function chatServerUrl() {
  return CUSTOMER_API_BASE_URL
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/api\/?$/, '');
}

export function createChatSocket(accessToken: string): ChatSocket {
  return io(`${chatServerUrl()}/chat`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
  });
}
