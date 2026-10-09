import { BuyEnquiry } from '../api/customer';

type SalesDealLike = {
  stage?: string;
  financials?: { tokenPaid?: boolean };
  documentation?: {
    registration?: { status?: string };
    registrationStatus?: string;
    documents?: unknown[];
  };
  documents?: unknown[];
  closedAt?: string;
};

export function enquiryId(enquiry?: BuyEnquiry | null) {
  return String(enquiry?._id ?? enquiry?.id ?? enquiry?.referenceId ?? '');
}

export function dealOf(enquiry?: BuyEnquiry | null): SalesDealLike | null {
  const deal = (enquiry as { deal?: SalesDealLike } | null | undefined)?.deal;
  return deal && typeof deal === 'object' ? deal : null;
}

const DEAL_STAGE_LABELS: Record<string, string> = {
  active_leads: 'Active Lead',
  site_visits: 'Site Visits',
  negotiation: 'Negotiating',
  re_engagement: 'Re-engagement',
  token_payment: 'Token Payment',
  full_payment: 'Full Payment',
  stage_payment: 'Stage Payment',
  interior_design: 'Interior Design',
  documentation: 'Documentation',
  closed: 'Closed',
  lost: 'Lost',
};

export function enquiryStatusLabel(status?: string) {
  const value = String(status || 'new');
  const labels: Record<string, string> = {
    new: 'New',
    responded: 'Responded',
    visit_scheduled: 'Visit Scheduled',
    negotiating: 'Negotiating',
    closed: 'Closed',
    awaiting: 'Awaiting',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
}

export function formatPaymentStatus(status?: string) {
  const value = String(status || '').toLowerCase();
  const labels: Record<string, string> = {
    created: 'Initiated',
    pending: 'Awaiting verification',
    paid: 'Verified',
    failed: 'Failed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    rejected: 'Rejected',
  };
  return labels[value] ?? (value ? value.replace(/_/g, ' ') : 'Unknown');
}

export function getEnquiryDisplayStatus(enquiry?: BuyEnquiry | null) {
  const apiLabel = enquiry?.customerStageLabel;
  if (typeof apiLabel === 'string' && apiLabel.trim()) return apiLabel;
  const dealStage = String(dealOf(enquiry)?.stage || '');
  if (dealStage && DEAL_STAGE_LABELS[dealStage]) return DEAL_STAGE_LABELS[dealStage];
  return enquiryStatusLabel(enquiry?.status);
}

export function enquiryDisplayColor(enquiry?: BuyEnquiry | null) {
  const dealStage = String(dealOf(enquiry)?.stage || '');
  if (dealStage === 'closed' || enquiry?.status === 'closed') return 'ink';
  if (dealStage === 'lost') return 'rose';
  if (['token_payment', 'full_payment', 'stage_payment'].includes(dealStage)) return 'amber';
  if (dealStage === 'documentation') return 'green';
  const status = String(enquiry?.status || 'new');
  if (status.includes('cancel')) return 'rose';
  if (status === 'closed') return 'ink';
  if (status === 'negotiating') return 'amber';
  if (status === 'responded' || status.includes('completed') || status.includes('verified') || status.includes('paid')) return 'green';
  if (status.includes('await') || status.includes('pending')) return 'amber';
  return 'brand';
}
