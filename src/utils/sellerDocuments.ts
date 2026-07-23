import type { SellerActivity } from '../api/customer';

export type WorkflowDocument = {
  id: string;
  name: string;
  documentId?: string;
  fileUrl?: string;
};

function normalizeDocName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function docFromLegalItem(item: Record<string, unknown>): WorkflowDocument | null {
  const files = Array.isArray(item.files) ? item.files : [];
  const file = files.find((entry) => {
    const record = entry as Record<string, unknown>;
    return record?.url && record?.status !== 'rejected';
  }) as Record<string, unknown> | undefined ?? (files[0] as Record<string, unknown> | undefined);
  const documentId = String(file?.id ?? item.documentId ?? '').trim();
  const fileUrl = file?.url ? String(file.url) : undefined;
  if (!documentId && !fileUrl) return null;
  return {
    id: String(item.id ?? documentId ?? item.name ?? 'document'),
    name: String(item.name ?? file?.fileName ?? 'Document'),
    documentId: documentId || undefined,
    fileUrl,
  };
}

export function listAcquisitionDocuments(activity?: SellerActivity | null): WorkflowDocument[] {
  const documentation = (activity?.acquisition as Record<string, unknown> | null | undefined)?.documentation as Record<string, unknown> | undefined;
  const buckets = [
    ...(Array.isArray(documentation?.documents) ? documentation.documents : []),
    ...(Array.isArray(documentation?.customDocs) ? documentation.customDocs : []),
  ] as Record<string, unknown>[];
  const seen = new Set<string>();
  const docs: WorkflowDocument[] = [];
  for (const item of buckets) {
    const doc = docFromLegalItem(item);
    if (!doc || seen.has(doc.id)) continue;
    seen.add(doc.id);
    docs.push(doc);
  }
  for (const item of activity?.sellRequest?.documents ?? []) {
    if (!item?.fileUrl && !item?.documentId) continue;
    const id = String(item.documentId ?? item.name ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    docs.push({
      id,
      name: String(item.name ?? 'Document'),
      documentId: item.documentId,
      fileUrl: item.fileUrl,
    });
  }
  return docs;
}

export function findWorkflowDocument(activity: SellerActivity | null | undefined, matchers: string[]): WorkflowDocument | null {
  const docs = listAcquisitionDocuments(activity);
  const normalizedMatchers = matchers.map(normalizeDocName);
  return docs.find((doc) => {
    const name = normalizeDocName(doc.name);
    const id = normalizeDocName(doc.id);
    return normalizedMatchers.some((matcher) => name.includes(matcher) || id.includes(matcher));
  }) ?? null;
}

export function sellerDealTimelineLabel(activity?: SellerActivity | null): string {
  const acquisition = activity?.acquisition as Record<string, unknown> | null | undefined;
  const documentation = acquisition?.documentation as Record<string, unknown> | undefined;
  const registrationDate = documentation?.registrationDate;
  if (registrationDate) {
    return `Registration on ${new Date(String(registrationDate)).toLocaleDateString()}`;
  }
  const appointmentDate = activity?.registration?.appointment?.date;
  if (appointmentDate) {
    return `Registration appointment on ${new Date(appointmentDate).toLocaleDateString()}`;
  }
  const saleDate = activity?.sellRequest?.sale?.saleDate;
  if (saleDate) {
    return `Sale closed on ${new Date(saleDate).toLocaleDateString()}`;
  }
  const stage = String(acquisition?.stage ?? '');
  if (stage === 'documentation') return 'Documentation in progress';
  if (stage === 'seller_payout') return 'Seller payout in progress';
  if (stage === 'acquired') return 'Acquisition complete';
  const pending = (activity?.payoutSchedule ?? []).find((item) => item.status === 'pending' || item.status === 'upcoming');
  if (pending?.dueLabel) return pending.dueLabel;
  return 'Timeline will be updated after agreement';
}
