import type { CustomerNotification } from '../api/customer';

export type NotificationFilter = 'all' | 'unread' | 'visits' | 'deals' | 'documents' | 'payments' | 'registration';

export type NotificationSection = {
  key: string;
  title: string;
  data: CustomerNotification[];
};

export function normalizeNotificationType(value?: string | null): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (/^N\d{1,2}$/.test(compact)) {
    return `N-${compact.slice(1).padStart(2, '0')}`;
  }
  return raw;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.max(1, Math.round(elapsed / 60_000))}m ago`;
  if (elapsed < 86_400_000) return `${Math.max(1, Math.round(elapsed / 3_600_000))}h ago`;
  if (elapsed < 172_800_000) return 'Yesterday';
  if (elapsed < 604_800_000) return `${Math.round(elapsed / 86_400_000)}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function sectionTitleForDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const key = date.toDateString();
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function groupNotificationsByDate(items: CustomerNotification[]): NotificationSection[] {
  const buckets = new Map<string, NotificationSection>();
  for (const item of items) {
    const title = sectionTitleForDate(item.createdAt);
    const key = new Date(item.createdAt).toDateString();
    const section = buckets.get(key) ?? { key, title, data: [] };
    section.data.push(item);
    buckets.set(key, section);
  }
  return Array.from(buckets.values()).sort(
    (a, b) => new Date(b.data[0]?.createdAt ?? 0).getTime() - new Date(a.data[0]?.createdAt ?? 0).getTime(),
  );
}

export function notificationIcon(notification: CustomerNotification): string {
  const type = normalizeNotificationType(notification.notificationType || notification.event);
  const event = notification.event.toLowerCase();
  if (type === 'N-03' || event.includes('visit')) return 'calendar';
  if (type === 'N-04' || event.includes('offer')) return 'tag';
  if (type === 'N-05' || event.includes('deal')) return 'handshake';
  if (type === 'N-06' || event.includes('document')) return 'file-text';
  if (type === 'N-07' || event.includes('payment')) return 'credit-card';
  if (type === 'N-08' || event.includes('registration')) return 'badge-check';
  if (event.includes('price')) return 'trending-up';
  if (event.includes('verified')) return 'shield-check';
  return 'bell';
}

export function notificationStatusChip(notification: CustomerNotification): { label: string; color: 'brand' | 'green' | 'amber' | 'rose' | 'ink' } {
  const type = normalizeNotificationType(notification.notificationType || notification.event);
  const event = notification.event.toLowerCase();
  if (type === 'N-01' || event.includes('enquiry')) return { label: 'Enquiry', color: 'brand' };
  if (type === 'N-02' || event.includes('call')) return { label: 'Call', color: 'ink' };
  if (type === 'N-03' || event.includes('visit')) return { label: 'Visit', color: 'green' };
  if (type === 'N-04' || event.includes('offer')) return { label: 'Offer', color: 'amber' };
  if (type === 'N-05' || event.includes('deal')) return { label: 'Deal', color: 'green' };
  if (type === 'N-06' || event.includes('document')) return { label: 'Documents', color: 'brand' };
  if (type === 'N-07' || event.includes('payment')) return { label: 'Payment', color: 'amber' };
  if (type === 'N-08' || event.includes('registration')) return { label: 'Registration', color: 'green' };
  if (event.includes('reject')) return { label: 'Action', color: 'rose' };
  return { label: 'Update', color: 'ink' };
}

export function matchesNotificationFilter(
  notification: CustomerNotification,
  filter: NotificationFilter,
  locallyRead: Set<string>,
): boolean {
  const type = normalizeNotificationType(notification.notificationType || notification.event);
  const event = notification.event.toLowerCase();
  const unread = notification.unread && !locallyRead.has(notification.id);
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return unread;
    case 'visits':
      return type === 'N-03' || event.includes('visit');
    case 'deals':
      return type === 'N-04' || type === 'N-05' || event.includes('deal') || event.includes('offer');
    case 'documents':
      return type === 'N-06' || event.includes('document');
    case 'payments':
      return type === 'N-07' || event.includes('payment');
    case 'registration':
      return type === 'N-08' || event.includes('registration');
    default:
      return true;
  }
}

export function matchesNotificationSearch(notification: CustomerNotification, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    notification.title.toLowerCase().includes(q)
    || notification.body.toLowerCase().includes(q)
    || notification.event.toLowerCase().includes(q)
  );
}

export const NOTIFICATION_FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'visits', label: 'Visits' },
  { key: 'deals', label: 'Deals' },
  { key: 'documents', label: 'Documents' },
  { key: 'payments', label: 'Payments' },
  { key: 'registration', label: 'Registration' },
];
