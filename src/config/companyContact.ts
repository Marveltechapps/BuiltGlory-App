import Constants from 'expo-constants';
import { Linking } from 'react-native';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DEFAULT_SUPPORT_PHONE_DISPLAY = '+91 8667769670';
const DEFAULT_WHATSAPP_DIGITS = '918667769670';

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
