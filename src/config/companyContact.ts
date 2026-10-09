import Constants from 'expo-constants';
import { Linking } from 'react-native';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DEFAULT_SUPPORT_PHONE_DISPLAY = '+91 8667769670';
const DEFAULT_WHATSAPP_DIGITS = '918667769670';
const DEFAULT_SUPPORT_EMAIL = 'support@builtglory.com';

export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

function readEnv(key: string) {
  const fromProcess = process?.env?.[key]?.trim();
  if (fromProcess) return fromProcess;

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return extra?.[key]?.trim();
}

const configuredPhone =
  readEnv('EXPO_PUBLIC_COMPANY_SUPPORT_PHONE') || DEFAULT_SUPPORT_PHONE_DISPLAY;

export const COMPANY_SUPPORT_PHONE_DISPLAY = configuredPhone;

export const COMPANY_SUPPORT_PHONE_E164 = `+${phoneDigits(configuredPhone)}`;

export const COMPANY_WHATSAPP_DIGITS =
  readEnv('EXPO_PUBLIC_COMPANY_WHATSAPP_NUMBER') ||
  phoneDigits(configuredPhone) ||
  DEFAULT_WHATSAPP_DIGITS;

export const COMPANY_WHATSAPP_URL = `https://wa.me/${COMPANY_WHATSAPP_DIGITS}`;

export const COMPANY_TEL_URL = `tel:${COMPANY_SUPPORT_PHONE_E164}`;

export const COMPANY_SUPPORT_EMAIL =
  readEnv('EXPO_PUBLIC_COMPANY_SUPPORT_EMAIL') || DEFAULT_SUPPORT_EMAIL;

export const COMPANY_SUPPORT_EMAIL_SUBJECT = 'Customer Support Request';

/** Default on-property advisor card (B-04). Call uses company support phone. */
export const DEFAULT_PROPERTY_ADVISOR = {
  name: 'BuiltGlory Advisor',
  role: 'Property specialist',
} as const;

export function advisorInitials(name = DEFAULT_PROPERTY_ADVISOR.name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'BG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const COMPANY_SUPPORT_WHATSAPP_MESSAGE =
  'Hi BuiltGlory team, I need support regarding ';

export function buildCompanyWhatsAppUrl(message = COMPANY_SUPPORT_WHATSAPP_MESSAGE) {
  const text = message.trim();
  return text
    ? `${COMPANY_WHATSAPP_URL}?text=${encodeURIComponent(text)}`
    : COMPANY_WHATSAPP_URL;
}

export async function openCompanyWhatsApp(message = COMPANY_SUPPORT_WHATSAPP_MESSAGE) {
  await Linking.openURL(buildCompanyWhatsAppUrl(message));
}

export async function openCompanyCall() {
  await Linking.openURL(COMPANY_TEL_URL);
}

export type SupportEmailContext = {
  userName?: string | null;
  userEmail?: string | null;
  userId?: string | null;
  orderId?: string | null;
  issueDescription?: string | null;
};

function supportEmailLine(label: string, value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

export function buildSupportEmailBody(context: SupportEmailContext = {}) {
  const details = [
    supportEmailLine('Name', context.userName),
    supportEmailLine('Registered email', context.userEmail),
    supportEmailLine('User ID', context.userId),
    supportEmailLine('Order ID', context.orderId),
  ].filter((line): line is string => Boolean(line));

  const issue = String(context.issueDescription ?? '').trim();
  const parts = [
    'Hello BuiltGlory Support,',
    '',
    issue || 'Please help me with the following issue:',
    '',
  ];
  if (details.length) {
    parts.push('---', 'Account details', ...details, '');
  }
  parts.push('Sent from the BuiltGlory app.');
  return parts.join('\n');
}

export function buildCompanySupportMailtoUrl(
  context: SupportEmailContext = {},
  subject = COMPANY_SUPPORT_EMAIL_SUBJECT,
) {
  const query = [
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(buildSupportEmailBody(context))}`,
  ].join('&');
  return `mailto:${COMPANY_SUPPORT_EMAIL}?${query}`;
}

/** Opens the device email app. Returns false when no mail client is available. */
export async function openCompanySupportEmail(context: SupportEmailContext = {}) {
  const url = buildCompanySupportMailtoUrl(context);
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
  } catch {
    // Android can report mailto as unsupported even when a client exists.
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
