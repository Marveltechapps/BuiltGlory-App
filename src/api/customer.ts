import { CUSTOMER_API_BASE_URL } from '../config/api';

export { API_BASE_URL, CUSTOMER_API_BASE_URL, getApiBaseUrl, getApiOrigin } from '../config/api';

export type ApiEnvelope<T> = {
  data: T;
  meta?: {
    requestId?: string;
    [key: string]: unknown;
  };
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
  };
};

export class CustomerApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  requestId?: string;

  constructor(message: string, options: { status: number; code?: string; details?: unknown; requestId?: string }) {
    super(message);
    this.name = 'CustomerApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  accessToken?: string;
  skipAuthRefresh?: boolean;
};

type CustomerSessionRefreshHandler = (expiredAccessToken: string) => Promise<AuthSession | null>;

let customerSessionRefreshHandler: CustomerSessionRefreshHandler | null = null;

export function setCustomerSessionRefreshHandler(handler: CustomerSessionRefreshHandler | null) {
  customerSessionRefreshHandler = handler;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.append(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

async function readResponseBody<T>(response: Response): Promise<{ payload: T | null; rawText: string }> {
  const rawText = await response.text();
  if (!rawText) return { payload: null, rawText };
  try {
    return { payload: JSON.parse(rawText) as T, rawText };
  } catch {
    return { payload: null, rawText };
  }
}

function readApiError(
  response: Response,
  payload: ApiEnvelope<unknown> | ApiErrorPayload | null,
  rawText: string,
) {
  const errorPayload = payload as ApiErrorPayload | null;
  const message =
    errorPayload?.error?.message
    ?? (response.status === 429 ? 'Too many requests. Please wait a moment and try again.' : null)
    ?? (rawText.trim() || 'Request failed.');
  return new CustomerApiError(message, {
    status: response.status,
    code: errorPayload?.error?.code ?? (response.status === 429 ? 'RATE_LIMITED' : undefined),
    details: errorPayload?.error?.details,
    requestId: errorPayload?.meta?.requestId,
  });
}

async function refreshAccessToken(expiredAccessToken: string) {
  if (!customerSessionRefreshHandler) return null;
  try {
    return await customerSessionRefreshHandler(expiredAccessToken);
  } catch {
    return null;
  }
}

async function customerMultipartRequest<T>(path: string, accessToken: string, formData: FormData, skipAuthRefresh = false) {
  const response = await fetch(`${CUSTOMER_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const { payload, rawText } = await readResponseBody<ApiEnvelope<T> | ApiErrorPayload>(response);
  if (!response.ok) {
    if (response.status === 401 && !skipAuthRefresh) {
      const refreshedSession = await refreshAccessToken(accessToken);
      if (refreshedSession?.accessToken && refreshedSession.accessToken !== accessToken) {
        return customerMultipartRequest<T>(path, refreshedSession.accessToken, formData, true);
      }
    }
    throw readApiError(response, payload, rawText);
  }

  if (!payload) return null as T;
  return (payload as ApiEnvelope<T>).data;
}

export async function customerApiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  const response = await fetch(`${CUSTOMER_API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const { payload, rawText } = await readResponseBody<ApiEnvelope<T> | ApiErrorPayload>(response);
  if (!response.ok) {
    if (response.status === 401 && options.accessToken && !options.skipAuthRefresh) {
      const refreshedSession = await refreshAccessToken(options.accessToken);
      if (refreshedSession?.accessToken && refreshedSession.accessToken !== options.accessToken) {
        return customerApiRequest<T>(path, {
          ...options,
          accessToken: refreshedSession.accessToken,
          skipAuthRefresh: true,
        });
      }
    }
    throw readApiError(response, payload, rawText);
  }

  if (!payload) return null as T;
  return (payload as ApiEnvelope<T>).data;
}

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type CustomerProfile = {
  _id?: string;
  id?: string;
  referenceId?: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  phoneNormalized?: string;
  mobileNumber?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  role?: string;
  userType?: string;
  [key: string]: unknown;
};

export type UpdateCustomerProfileInput = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  mobileNumber?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  profilePhoto?: string | null;
  userType?: 'resident' | 'nri' | 'pio';
  role?: 'buyer' | 'seller' | 'both';
  bankDetails?: {
    accountHolderName: string;
    bankName: string;
    accountNumberLast4: string;
    ifsc: string;
    branch?: string | null;
    upiId?: string | null;
    updatedAt?: string;
  };
  notificationPreferences?: Partial<Record<'sms' | 'whatsapp' | 'email' | 'push' | 'in_app', {
    transactional?: boolean;
    marketing?: boolean;
  }>>;
};

export type SendCustomerOtpResponse = {
  requestId: string;
  expiresInSeconds: number;
  canResendAt: string;
};

export async function sendCustomerOtp(phone: string, countryCode = '+91', purpose: 'login' | 'change_phone' = 'login') {
  return customerApiRequest<SendCustomerOtpResponse>('/auth/customer/otp/send', {
    method: 'POST',
    body: { countryCode, phone, purpose },
  });
}

export type VerifyCustomerOtpInput = {
  phone: string;
  otp: string;
  countryCode?: string;
  requestId?: string;
  purpose?: 'login' | 'change_phone';
};

export type VerifyCustomerOtpResponse = AuthSession & {
  user?: CustomerProfile;
  verified?: boolean;
  phone?: string;
  phoneNormalized?: string;
};

export async function verifyCustomerOtp({ phone, otp, countryCode = '+91', requestId, purpose }: VerifyCustomerOtpInput) {
  return customerApiRequest<VerifyCustomerOtpResponse>('/auth/customer/otp/verify', {
    method: 'POST',
    body: { countryCode, phone, otp, requestId, purpose },
  });
}

export type SendEmailOtpResponse = {
  requestId: string;
  email: string;
  expiresInSeconds: number;
  canResendAt: string;
};

export async function sendEmailOtp(email: string) {
  return customerApiRequest<SendEmailOtpResponse>('/auth/email/otp/send', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });
}

export async function resendEmailOtp(email: string) {
  return customerApiRequest<SendEmailOtpResponse>('/auth/email/otp/resend', {
    method: 'POST',
    body: { email: email.trim().toLowerCase() },
  });
}

export type VerifyEmailOtpInput = {
  email: string;
  otp: string;
  requestId?: string;
};

export type VerifyEmailOtpResponse = AuthSession & {
  user?: CustomerProfile;
};

export async function verifyEmailOtp({ email, otp, requestId }: VerifyEmailOtpInput) {
  return customerApiRequest<VerifyEmailOtpResponse>('/auth/email/otp/verify', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), otp, requestId },
  });
}

export async function refreshCustomerSession(refreshToken: string) {
  return customerApiRequest<AuthSession>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

export async function logoutCustomerSession(accessToken: string | null, refreshToken: string) {
  return customerApiRequest<{ revoked: boolean }>('/auth/logout', {
    method: 'POST',
    accessToken: accessToken ?? undefined,
    skipAuthRefresh: true,
    body: { refreshToken },
  });
}

export async function getCurrentCustomer(accessToken: string) {
  return customerApiRequest<CustomerProfile>('/me', {
    accessToken,
  });
}

export type PublicAppConfig = {
  versions: {
    current: string;
    minimumSupported: string;
    latest: string;
  };
  storeUrls: {
    ios?: string | null;
    android?: string | null;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    expectedBackAt?: string | null;
  };
  featureFlags: Record<string, unknown>;
  payment?: {
    tokenAmount?: number;
    escrow?: {
      accountHolder?: string | null;
      bankName?: string | null;
      accountNumber?: string | null;
      ifsc?: string | null;
      branch?: string | null;
      upiId?: string | null;
      chequePayee?: string | null;
      chequeInstructions?: string[];
    } | null;
  };
};

export async function getPublicAppConfig() {
  return customerApiRequest<PublicAppConfig>('/app/config');
}

export type PublicContentItem = {
  _id?: string;
  id?: string;
  referenceId?: string;
  slug: string;
  section: 'home' | 'onboarding' | 'faq' | 'legal' | 'about' | 'news' | 'general' | 'banner';
  title: string;
  excerpt?: string | null;
  body?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  cta?: {
    label?: string | null;
    target?: string | null;
  } | null;
  tags?: string[];
  order?: number;
  metadata?: Record<string, unknown>;
  publishedAt?: string | null;
  updatedAt?: string;
};

export type ListPublicContentParams = {
  section?: PublicContentItem['section'];
  category?: string;
  search?: string;
  limit?: number;
};

export async function listPublicContent(params: ListPublicContentParams = {}) {
  return customerApiRequest<PublicContentItem[]>(`/content${buildQuery(params)}`);
}

export async function getPublicContent(slug: string) {
  return customerApiRequest<PublicContentItem>(`/content/${encodeURIComponent(slug)}`);
}

export async function updateCurrentCustomer(accessToken: string, data: UpdateCustomerProfileInput) {
  return customerApiRequest<CustomerProfile>('/me', {
    method: 'PATCH',
    accessToken,
    body: data,
  });
}

export type RegisterPushTokenInput = {
  token: string;
  platform?: 'android' | 'ios' | 'web';
  deviceId?: string | null;
};

export async function registerCustomerPushToken(accessToken: string, data: RegisterPushTokenInput) {
  return customerApiRequest<{ registered: boolean; tokenCount: number }>('/me/push-token', {
    method: 'PUT',
    accessToken,
    body: data,
  });
}

export async function removeCustomerPushToken(accessToken: string, token: string) {
  return customerApiRequest<{ removed: boolean; tokenCount: number }>('/me/push-token', {
    method: 'DELETE',
    accessToken,
    body: { token },
  });
}

export type AccountDeletionStatus = {
  status: 'none' | 'requested' | 'cancelled' | 'completed';
  reason?: string | null;
  verificationStatus?: 'not_started' | 'pending' | 'verified' | 'failed';
  requestedAt?: string | null;
  scheduledDeletionAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
};

export async function getAccountDeletionStatus(accessToken: string) {
  return customerApiRequest<AccountDeletionStatus>('/me/account-deletion', { accessToken });
}

export async function requestAccountDeletion(accessToken: string, data: { confirmation: 'DELETE'; reason?: string | null }) {
  return customerApiRequest<AccountDeletionStatus>('/me/account-deletion', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function cancelAccountDeletion(accessToken: string) {
  return customerApiRequest<AccountDeletionStatus>('/me/account-deletion', {
    method: 'DELETE',
    accessToken,
  });
}

type RawEntity = Record<string, any>;

function idOf(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const entity = value as RawEntity;
    return String(entity.id ?? entity._id ?? '');
  }
  return String(value);
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export type CustomerNotification = {
  id: string;
  title: string;
  body: string;
  event: string;
  channel: string;
  status: string;
  unread: boolean;
  createdAt: string;
  deepLink?: string | null;
  screen?: string | null;
  screenKey?: string | null;
  notificationType?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  image?: string | null;
  listingId?: string | null;
  enquiryId?: string | null;
  dealId?: string | null;
  propertyId?: string | null;
};

function mapCustomerNotification(raw: RawEntity): CustomerNotification {
  const payload = (raw.payload ?? {}) as RawEntity;
  const status = stringOf(raw.status, 'queued');
  const isRead = raw.isRead === true || raw.readAt != null;
  const event = stringOf(raw.event, 'notification');
  return {
    id: idOf(raw),
    title: stringOf(payload.title ?? raw.title, event.replace(/[_-]/g, ' ')),
    body: stringOf(payload.body ?? payload.message ?? raw.message ?? raw.failureReason, stringOf(raw.recipient)),
    event,
    channel: stringOf(raw.channel, 'in_app'),
    status,
    unread: !isRead,
    createdAt: stringOf(raw.createdAt ?? payload.createdAt ?? raw.sentAt ?? new Date().toISOString()),
    deepLink: stringOf(payload.deepLink ?? payload.screenKey) || null,
    screen: stringOf(raw.screen ?? payload.screen) || null,
    screenKey: stringOf(payload.screenKey ?? payload.deepLink) || null,
    notificationType: stringOf(raw.notificationType ?? payload.notificationType ?? payload.type) || null,
    entityId: stringOf(raw.entityId ?? payload.entityId) || null,
    entityType: stringOf(raw.entityType ?? payload.entityType) || null,
    image: stringOf(raw.image ?? payload.image) || null,
    listingId: stringOf(raw.listingId ?? payload.listingId) || null,
    enquiryId: stringOf(raw.enquiryId ?? payload.enquiryId) || null,
    dealId: stringOf(raw.dealId ?? payload.dealId) || null,
    propertyId: stringOf(raw.propertyId ?? payload.propertyId) || null,
  };
}

export async function listCustomerNotifications(accessToken: string, params: { limit?: number; status?: string } = {}) {
  return customerApiRequest<RawEntity[]>(`/me/notifications${buildQuery({ limit: params.limit ?? 50, status: params.status })}`, {
    accessToken,
  }).then((items) => (items ?? []).map(mapCustomerNotification));
}

export async function markCustomerNotificationsRead(accessToken: string, ids?: string[]) {
  return customerApiRequest<RawEntity[]>('/me/notifications/read', {
    method: 'PATCH',
    accessToken,
    body: ids?.length ? { ids } : {},
  }).then((items) => (items ?? []).map(mapCustomerNotification));
}

export async function markCustomerNotificationRead(accessToken: string, notificationId: string) {
  return customerApiRequest<RawEntity>(`/me/notifications/${notificationId}/read`, {
    method: 'PATCH',
    accessToken,
  }).then(mapCustomerNotification);
}

export async function deleteCustomerNotification(accessToken: string, notificationId: string) {
  return customerApiRequest<{ deleted: boolean; id: string }>(`/me/notifications/${notificationId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export type CustomerProperty = {
  _id?: string;
  id?: string;
  referenceId?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  isFeatured?: boolean;
  isUpcoming?: boolean;
  address?: {
    line1?: string;
    line2?: string;
    locality?: string;
    city?: string;
    state?: string;
    pincode?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
  };
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  isNegotiable?: boolean;
  specs?: {
    bhk?: string | number;
    builtUpArea?: number;
    carpetArea?: number;
    plotArea?: number;
    floor?: string;
    totalFloors?: number;
    facing?: string;
    age?: string;
    furnishing?: string;
    parking?: string;
    reraNumber?: string;
    possession?: string;
    vastuCompliant?: boolean;
    transactionType?: string;
  };
  amenities?: string[];
  media?: {
    photos?: string[];
    coverPhoto?: string;
    videoUrl?: string;
    droneImageUrl?: string;
    tour3dUrl?: string;
    floorPlanUrl?: string;
  };
  metrics?: {
    savedCount?: number;
    views?: number;
    enquiries?: number;
  };
  source?: string;
  launchDate?: string;
  possessionDate?: string;
  soldAt?: string;
  advantages?: {
    investment?: string[];
    location?: string[];
    connectivity?: string[];
  };
  nearbyPlaces?: Array<{
    name?: string;
    type?: string;
    distance?: string;
  }>;
  highlights?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type ListCustomerPropertiesParams = {
  type?: string;
  city?: string;
  locality?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  bhk?: string;
  amenities?: string;
  facing?: string;
  furnishing?: string;
  propertyAge?: string;
  possession?: string;
  constructionStatus?: string;
  postedBy?: string;
  verified?: boolean;
  featured?: boolean;
  upcoming?: boolean;
  search?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  limit?: number;
};

export async function listCustomerProperties(params: ListCustomerPropertiesParams = {}) {
  return customerApiRequest<CustomerProperty[]>(`/properties${buildQuery(params)}`);
}

export async function listTrendingSearches(params: { limit?: number } = {}) {
  return customerApiRequest<string[]>(`/search/trending${buildQuery({ limit: params.limit })}`);
}

export async function listRecentSearches(accessToken: string) {
  return customerApiRequest<string[]>('/me/searches', { accessToken });
}

export async function recordRecentSearch(accessToken: string, term: string, resultCount = 0) {
  return customerApiRequest<string[]>('/me/searches', {
    method: 'POST',
    accessToken,
    body: { term, resultCount },
  });
}

export async function clearRecentSearches(accessToken: string) {
  return customerApiRequest<string[]>('/me/searches', {
    method: 'DELETE',
    accessToken,
  });
}

export async function getCustomerProperty(propertyId: string) {
  return customerApiRequest<CustomerProperty>(`/properties/${propertyId}`);
}

export type CustomerDocumentReadUrl = {
  documentId: string;
  readUrl: string;
  expiresInSeconds: number;
};

export type CustomerUploadedDocument = {
  _id?: string;
  id?: string;
  referenceId?: string;
  ownerType?: string;
  ownerId?: string;
  purpose?: string;
  documentType?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  status?: string;
  scanStatus?: string;
};

export async function getCustomerDocumentReadUrl(accessToken: string, documentId: string, expiresIn = 900) {
  return customerApiRequest<CustomerDocumentReadUrl>(
    `/documents/${documentId}/read-url${buildQuery({ expiresIn })}`,
    { accessToken }
  );
}

export async function uploadCustomerDocument(
  accessToken: string,
  data: {
    file: { uri: string; name: string; type: string };
    ownerType: 'user' | 'sell_request' | 'support_ticket' | 'sales_deal';
    ownerId: string;
    purpose: 'kyc' | 'legal' | 'property_media' | 'payment_proof' | 'support_attachment';
    documentType?: string;
  }
) {
  const formData = new FormData();
  formData.append('ownerType', data.ownerType);
  formData.append('ownerId', data.ownerId);
  formData.append('purpose', data.purpose);
  if (data.documentType) formData.append('documentType', data.documentType);
  formData.append('file', data.file as any);
  return customerMultipartRequest<CustomerUploadedDocument>('/documents', accessToken, formData);
}

export async function getFavoriteProperties(accessToken: string) {
  return customerApiRequest<CustomerProperty[]>('/me/favorites', { accessToken });
}

export async function saveCustomerProperty(accessToken: string, propertyId: string) {
  return customerApiRequest<CustomerProperty>(`/properties/${propertyId}/save`, {
    method: 'POST',
    accessToken,
  });
}

export async function unsaveCustomerProperty(accessToken: string, propertyId: string) {
  return customerApiRequest<null>(`/properties/${propertyId}/save`, {
    method: 'DELETE',
    accessToken,
  });
}

export type CreateCallbackInput = {
  source: 'help_support' | 'profile_support' | 'property_detail' | 'payment' | 'interior';
  sourceScreen?: string | null;
  category?: 'property_inquiry' | 'pricing' | 'technical_issue' | 'complaint' | 'general' | 'stage_payment' | 'interior';
  propertyId?: string;
  reason?: string | null;
  preferredTime?: string;
  bestTimePreference?: 'morning' | 'afternoon' | 'evening';
};

export async function createCallbackRequest(accessToken: string, data: CreateCallbackInput) {
  return customerApiRequest<{ _id?: string; referenceId?: string; status?: string }>('/callbacks', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export type SupportTicket = {
  _id?: string;
  id?: string;
  referenceId?: string;
  category?: string;
  subject?: string;
  message?: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
  responses?: SupportTicketResponse[];
};

export type SupportTicketResponse = {
  _id?: string;
  id?: string;
  message?: string;
  responderType?: 'admin' | 'customer' | string;
  responderId?: string;
  createdAt?: string;
};

export type CreateSupportTicketInput = {
  category: 'property_inquiry' | 'payment' | 'technical' | 'kyc' | 'general' | 'complaint';
  subject: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  attachments?: string[];
};

export async function createSupportTicket(accessToken: string, data: CreateSupportTicketInput) {
  return customerApiRequest<SupportTicket>('/support/tickets', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function listSupportTickets(accessToken: string, params: { page?: number; limit?: number; sort?: 'newest' | 'oldest' } = {}) {
  return customerApiRequest<SupportTicket[]>(`/me/support/tickets${buildQuery(params)}`, {
    accessToken,
  });
}

export async function getSupportTicket(accessToken: string, ticketId: string) {
  return customerApiRequest<SupportTicket>(`/me/support/tickets/${encodeURIComponent(ticketId)}`, {
    accessToken,
  });
}

export async function addSupportTicketResponse(accessToken: string, ticketId: string, message: string) {
  return customerApiRequest<SupportTicket>(`/me/support/tickets/${encodeURIComponent(ticketId)}/responses`, {
    method: 'POST',
    accessToken,
    body: { message },
  });
}

export type AppFeedback = {
  _id?: string;
  id?: string;
  referenceId?: string;
  message?: string;
  status?: string;
  source?: string;
  sourceScreen?: string;
  createdAt?: string;
};

export async function createAppFeedback(accessToken: string, data: { message: string; source?: string; sourceScreen?: string; metadata?: Record<string, unknown> }) {
  return customerApiRequest<AppFeedback>('/feedback', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export type CreateBuyEnquiryInput = {
  propertyId: string;
  enquiryTypes?: string[];
  preferredContact: 'phone' | 'whatsapp' | 'email';
  interestType: 'schedule_visit' | 'price_negotiation' | 'more_details';
  preferredVisitTime?: 'tomorrow_morning' | 'tomorrow_afternoon' | 'this_weekend_morning' | 'this_weekend_afternoon' | 'custom' | null;
  preferredVisitDate?: string | null;
  preferredVisitTimeSlot?: string | null;
  additionalMessage?: string | null;
};

export type BuyEnquiry = {
  _id?: string;
  id?: string;
  referenceId?: string;
  status?: string;
  propertyId?: string | CustomerProperty;
  propertySnapshot?: {
    title?: string;
    price?: number;
    type?: string;
    location?: string;
  };
  assignedTo?: string;
  submittedAt?: string;
  customerStage?: string | null;
  customerStageLabel?: string | null;
  visits?: CustomerVisit[];
  deal?: unknown;
};

export async function createBuyEnquiry(accessToken: string, data: CreateBuyEnquiryInput) {
  return customerApiRequest<BuyEnquiry>('/buy-enquiries', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function getBuyEnquiry(accessToken: string, enquiryId: string) {
  return customerApiRequest<BuyEnquiry>(`/me/buy-enquiries/${enquiryId}`, { accessToken });
}

export async function listBuyEnquiries(accessToken: string, params: { page?: number; limit?: number; sort?: 'newest' | 'oldest'; status?: string; propertyId?: string } = {}) {
  return customerApiRequest<BuyEnquiry[]>(`/me/buy-enquiries${buildQuery(params)}`, { accessToken });
}

export async function cancelBuyEnquiry(accessToken: string, enquiryId: string, reason?: string) {
  return customerApiRequest<BuyEnquiry>(`/me/buy-enquiries/${enquiryId}/cancel`, {
    method: 'PATCH',
    accessToken,
    body: { reason: reason ?? null },
  });
}

export type CreateVisitInput = {
  propertyId: string;
  enquiryId?: string;
  visitDate: string;
  visitTime: string;
  visitType: 'physical' | 'virtual';
  virtualPlatform?: 'zoom' | 'google_meet' | 'teams' | 'whatsapp_video' | null;
  meetingLink?: string | null;
};

export type CustomerVisit = {
  _id?: string;
  id?: string;
  referenceId?: string;
  propertyId?: string | CustomerProperty;
  enquiryId?: string | BuyEnquiry;
  visitDate?: string;
  visitTime?: string;
  visitType?: 'physical' | 'virtual';
  virtualPlatform?: string | null;
  meetingLink?: string | null;
  status?: string;
  rescheduleCount?: number;
};

export type VisitAvailabilitySlot = {
  time: string;
  available: boolean;
  status: 'available' | 'booked';
  remainingCapacity: number;
  bookedCount: number;
};

export type VisitAvailabilityDay = {
  date: string;
  slots: VisitAvailabilitySlot[];
};

export type VisitAvailability = {
  propertyId: string;
  visitType: 'physical' | 'virtual';
  timezone: string;
  from: string;
  to: string;
  days: VisitAvailabilityDay[];
};

export async function getVisitAvailability(
  accessToken: string,
  params: { propertyId: string; visitType?: 'physical' | 'virtual'; from?: string; days?: number }
) {
  return customerApiRequest<VisitAvailability>(`/visits/availability${buildQuery(params)}`, {
    accessToken,
  });
}

export async function createVisit(accessToken: string, data: CreateVisitInput) {
  return customerApiRequest<CustomerVisit>('/visits', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function rescheduleVisit(accessToken: string, visitId: string, data: { visitDate: string; visitTime: string; reason?: string | null }) {
  return customerApiRequest<CustomerVisit>(`/visits/${visitId}/reschedule`, {
    method: 'PATCH',
    accessToken,
    body: data,
  });
}

export async function cancelVisit(accessToken: string, visitId: string, reason: string) {
  return customerApiRequest<CustomerVisit>(`/visits/${visitId}/cancel`, {
    method: 'PATCH',
    accessToken,
    body: { reason },
  });
}

export type CreateTokenPaymentInput = {
  dealId: string;
  propertyId?: string;
  type?: 'token';
  amount: number;
  currency?: 'INR';
  idempotencyKey?: string;
};

export type CustomerPayment = {
  _id?: string;
  id?: string;
  referenceId?: string;
  dealId?: string;
  propertyId?: string;
  type?: string;
  amount?: number;
  currency?: string;
  status?: string;
  gateway?: string;
  gatewayOrderId?: string;
  failureReason?: string;
  paidAt?: string;
  createdAt?: string;
};

export async function createTokenPayment(accessToken: string, data: CreateTokenPaymentInput) {
  return customerApiRequest<CustomerPayment>('/payments/token', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function listCustomerPayments(accessToken: string, params: { page?: number; limit?: number; sort?: 'newest' | 'oldest'; status?: string; type?: string } = {}) {
  return customerApiRequest<CustomerPayment[]>(`/me/payments${buildQuery(params)}`, { accessToken });
}

export type SellRequestDocument = {
  documentId?: string;
  name?: string;
  status?: 'uploaded' | 'missing' | 'pending' | 'verified' | 'rejected' | string;
  fileUrl?: string;
  scanStatus?: string;
  rejectionReason?: string;
};

export type SellRequest = {
  _id?: string;
  id?: string;
  referenceId?: string;
  propertyTitle?: string;
  propertyType?: string;
  askingPrice?: number;
  negotiable?: boolean;
  address?: {
    street?: string | null;
    locality?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    landmark?: string | null;
    latitude?: number;
    longitude?: number;
  };
  ownershipType?: string;
  possessionStatus?: string;
  loanOnProperty?: boolean;
  loanDetails?: Record<string, unknown>;
  photos?: string[];
  photosCount?: number;
  documentsCount?: number;
  completenessPercent?: number;
  description?: string | null;
  amenities?: string[];
  specifications?: Record<string, unknown>;
  documents?: SellRequestDocument[];
  status?: string;
  isDraft?: boolean;
  draftStep?: number;
  draftSavedAt?: string;
  rejectionReason?: string;
  pauseReason?: string;
  changeRequests?: string[];
  metrics?: {
    views?: number;
    enquiryCount?: number;
    visitCount?: number;
    saveCount?: number;
    viewsThisWeek?: number[];
  };
  sale?: {
    salePrice?: number;
    saleDate?: string;
    buyerName?: string;
  };
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SellerActivityOffer = {
  amount: number;
  status?: string;
  expiresAt?: string | null;
  counterAmount?: number | null;
  notes?: string | null;
};

export type SellerActivityEnquiry = {
  _id?: string;
  referenceId?: string;
  buyerSnapshot?: { name?: string; phone?: string; email?: string; userType?: string };
  interestType?: string;
  preferredContact?: string;
  preferredVisitDate?: string;
  preferredVisitTimeSlot?: string;
  status?: string;
  submittedAt?: string;
};

export type SellerActivityVisit = {
  _id?: string;
  referenceId?: string;
  visitDate?: string;
  visitTime?: string;
  visitType?: 'physical' | 'virtual' | string;
  status?: string;
  rescheduleCount?: number;
  feedback?: Record<string, unknown>;
};

export type SellerActivityMessage = {
  threadId?: string;
  logId?: string;
  referenceId?: string;
  sender?: 'buyer' | 'admin' | 'seller' | string;
  type?: 'text' | 'offer' | 'deal_agreed' | string;
  text?: string;
  offerAmount?: number;
  offerStatus?: string;
  createdAt?: string;
};

export type SellerPayoutScheduleItem = {
  key: string;
  label: string;
  amount: number;
  dueLabel?: string;
  status?: string;
};

export type SellerRegistrationState = {
  appointment?: {
    date?: string;
    time?: string;
    officeName?: string;
    address?: string;
    [key: string]: unknown;
  } | null;
  status?: string;
  checklist?: string[];
};

export type SellerActivity = {
  sellRequest: SellRequest;
  acquisition?: Record<string, any> | null;
  property?: Record<string, any> | null;
  offer?: SellerActivityOffer | null;
  enquiries: SellerActivityEnquiry[];
  visits: SellerActivityVisit[];
  chatThreads: Array<Record<string, any>>;
  messages: SellerActivityMessage[];
  payoutSchedule: SellerPayoutScheduleItem[];
  registration: SellerRegistrationState;
  metrics: {
    enquiryCount: number;
    visitCount: number;
    chatCount: number;
    payoutCount: number;
  };
};

export type SellValuationEstimate = {
  sellRequestId?: string;
  source: 'comparables' | 'baseline' | string;
  confidence: 'high' | 'medium' | 'low' | 'baseline' | string;
  estimatedPrice: number;
  low: number;
  high: number;
  pricePerSqft: number;
  area: number;
  comparableCount: number;
  basis: string;
  askingPriceDeltaPercent?: number | null;
  comparables?: Array<{
    _id?: string;
    title?: string;
    price?: number;
    status?: string;
    locality?: string;
    city?: string;
    area?: number;
    pricePerSqft?: number;
  }>;
};

export type SellRequestInput = {
  propertyType?: string;
  propertyTitle?: string;
  askingPrice?: number;
  negotiable?: boolean;
  address?: SellRequest['address'];
  specifications?: Record<string, unknown>;
  amenities?: string[];
  ownershipType?: string;
  possessionStatus?: string;
  loanOnProperty?: boolean;
  loanDetails?: Record<string, unknown>;
  description?: string | null;
  photos?: string[];
  documents?: SellRequestDocument[];
  draftStep?: number;
  isDraft?: boolean;
  status?: 'draft' | 'new';
  changeRequests?: string[];
  rejectionReason?: string | null;
};

export type ListSellRequestsParams = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: 'newest' | 'oldest';
  status?: string;
  propertyType?: string;
  city?: string;
};

export async function createSellRequestDraft(accessToken: string, data: SellRequestInput) {
  return customerApiRequest<SellRequest>('/sell-requests/drafts', {
    method: 'POST',
    accessToken,
    body: { ...data, isDraft: true, status: 'draft' },
  });
}

export async function createSellRequest(accessToken: string, data: SellRequestInput) {
  return customerApiRequest<SellRequest>('/sell-requests', {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function listSellRequests(accessToken: string, params: ListSellRequestsParams = {}) {
  return customerApiRequest<SellRequest[]>(`/me/sell-requests${buildQuery(params)}`, { accessToken });
}

export async function getSellRequest(accessToken: string, sellRequestId: string) {
  return customerApiRequest<SellRequest>(`/me/sell-requests/${sellRequestId}`, { accessToken });
}

export async function getSellerActivity(accessToken: string, sellRequestId: string) {
  return customerApiRequest<SellerActivity>(`/me/sell-requests/${sellRequestId}/activity`, { accessToken });
}

export async function getSellValuationEstimate(accessToken: string, sellRequestId: string, data: Partial<SellRequestInput> = {}) {
  return customerApiRequest<SellValuationEstimate>(`/me/sell-requests/${sellRequestId}/valuation-estimate`, {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function sendSellerMessage(accessToken: string, sellRequestId: string, text: string) {
  return customerApiRequest<SellerActivity>(`/me/sell-requests/${sellRequestId}/messages`, {
    method: 'POST',
    accessToken,
    body: { text },
  });
}

export async function submitSellerVisitAction(
  accessToken: string,
  sellRequestId: string,
  visitId: string,
  data: { action: 'confirm' | 'reschedule'; visitDate?: string; visitTime?: string; reason?: string | null; meetingLink?: string | null }
) {
  return customerApiRequest<SellerActivity>(`/me/sell-requests/${sellRequestId}/visits/${visitId}/action`, {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function updateSellRequest(accessToken: string, sellRequestId: string, data: SellRequestInput) {
  return customerApiRequest<SellRequest>(`/me/sell-requests/${sellRequestId}`, {
    method: 'PATCH',
    accessToken,
    body: data,
  });
}

export async function submitSellRequest(accessToken: string, sellRequestId: string, data: SellRequestInput = {}) {
  return customerApiRequest<SellRequest>(`/me/sell-requests/${sellRequestId}/submit`, {
    method: 'POST',
    accessToken,
    body: data,
  });
}

export async function submitSellerOfferDecision(
  accessToken: string,
  sellRequestId: string,
  data: { decision: 'accepted' | 'countered'; counterAmount?: number; notes?: string | null }
) {
  return customerApiRequest<SellerActivity>(`/me/sell-requests/${sellRequestId}/offer-decision`, {
    method: 'POST',
    accessToken,
    body: data,
  });
}
