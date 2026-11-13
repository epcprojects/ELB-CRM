import {
  getAttachmentFileKey,
  getUploadedFileUrl,
  uploadFilesDirectly,
} from './attachments';

export type MoveTicketResponse = {
  success: boolean;
  ticketId: string;
  projectId: string;
  statusKey: string;
  updatedAt: string;
  updatedBy: string;
  assigneeAddedToProject: boolean;
};

export async function moveTicketToProject(
  ticketId: string,
  targetProjectId: string,
): Promise<MoveTicketResponse> {
  const response = await fetch(`/api/tickets/${ticketId}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ targetProjectId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      Array.isArray(data?.message) && data.message.length
        ? data.message.join(', ')
        : data?.message || 'Failed to move ticket.';
    throw new Error(message);
  }
  return data as MoveTicketResponse;
}

// Lead count per configured status, as returned by the summary endpoints.
export type LeadStatusCount = {
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  isClosed: boolean;
  count: number;
};

export type LeadStatusSummary = {
  total: number;
  statuses: LeadStatusCount[];
};

// Headline stats: all leads, those still active and those in a closed status.
export function toLeadOverviewStats(summary?: LeadStatusSummary | null) {
  const total = summary?.total ?? 0;
  const closed = (summary?.statuses ?? [])
    .filter((status) => status.isClosed)
    .reduce((sum, status) => sum + status.count, 0);

  return [
    { title: 'Total Leads', count: total, color: '#17B26A' },
    { title: 'Active Leads', count: total - closed, color: '#F79009' },
    { title: 'Closed Leads', count: closed, color: '#667085' },
  ];
}

// Banner stat items, one per configured status.
export function toStatusStats(
  summary?: { statuses?: LeadStatusCount[] | null } | null,
) {
  return (summary?.statuses ?? []).map((status) => ({
    title: status.label,
    count: status.count,
    color: status.color,
  }));
}

export type CreateTicketPayload = {
  projectId: string;
  title: string;
  description?: string;
  statusKey: string;
  priorityKey?: string;
  ticketType: 'feature_request' | 'bug' | '';
  assigneeId?: string;
  dueDate?: string;
  contactId?: string;
  attachments?: File[];
};

export function hasRichTextContent(value?: string | null) {
  if (!value) {
    return false;
  }

  if (typeof DOMParser === 'undefined') {
    return (
      /<(?:img|video|audio)\b|data-attachment-node/i.test(value) ||
      value.replace(/<[^>]*>/g, '').trim().length > 0
    );
  }

  const parsedDescription = new DOMParser().parseFromString(value, 'text/html');

  return Boolean(
    parsedDescription.body.textContent?.replace(/\u00a0/g, ' ').trim() ||
      parsedDescription.body.querySelector(
        'img, video, audio, [data-attachment-node]',
      ),
  );
}

export async function createTicket(payload: CreateTicketPayload) {
  const validAttachments = (payload.attachments ?? []).filter(
    (attachment) => attachment.size > 0,
  );

  const uploadedAttachments = validAttachments.length
    ? await uploadFilesDirectly(
        validAttachments,
        `projects/${payload.projectId}/tickets/creation`,
      )
    : [];

  const inlineAttachmentKeys = getInlineAttachmentKeys(
    payload.description?.trim() ?? '',
  );
  const attachmentsWithSource = uploadedAttachments.map(
    (attachment, index) => ({
      ...attachment,
      fromDescription: inlineAttachmentKeys.has(
        getAttachmentFileKey(validAttachments[index]),
      ),
    }),
  );

  const body: Record<string, unknown> = {
    title: payload.title,
    statusKey: payload.statusKey,
    ticketType: payload.ticketType,
  };

  const description = replaceInlineAttachmentUrls(
    payload.description?.trim() ?? '',
    validAttachments,
    attachmentsWithSource,
  );

  if (description) {
    body.description = description;
  }

  if (payload.priorityKey?.trim()) {
    body.priorityKey = payload.priorityKey.trim();
  }

  if (payload.assigneeId?.trim()) {
    body.assigneeId = payload.assigneeId.trim();
  }

  if (payload.contactId?.trim()) {
    body.contactId = payload.contactId.trim();
  }

  if (payload.dueDate?.trim()) {
    body.dueDate = payload.dueDate.trim();
  }

  if (attachmentsWithSource.length) {
    body.attachments = attachmentsWithSource;
  }

  const response = await fetch(`/api/projects/${payload.projectId}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      Array.isArray(data?.message) && data.message.length
        ? data.message.join(', ')
        : data?.message || 'Failed to create lead.';

    throw new Error(message);
  }

  return data;
}

export function replaceInlineAttachmentUrls(
  description: string,
  files: File[],
  uploadedFiles: Awaited<ReturnType<typeof uploadFilesDirectly>>,
) {
  if (!description || typeof DOMParser === 'undefined') {
    return description;
  }

  const uploadedFileByKey = new Map(
    files.map((file, index) => [
      getAttachmentFileKey(file),
      uploadedFiles[index],
    ]),
  );
  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  parsedDescription
    .querySelectorAll<HTMLElement>('[data-attachment-key]')
    .forEach((attachment) => {
      const attachmentKey = attachment.dataset.attachmentKey ?? '';
      const uploadedFile = uploadedFileByKey.get(attachmentKey);

      if (!uploadedFile) {
        attachment.remove();
        return;
      }

      setInlineAttachmentUrl(attachment, uploadedFile.storageKey);
      attachment.dataset.storageKey = uploadedFile.storageKey;
      attachment.removeAttribute('data-attachment-key');
    });

  return serializeDescriptionImagesForStorage(
    parsedDescription.body.innerHTML,
  ).trim();
}

function getInlineAttachmentKeys(description: string) {
  if (!description || typeof DOMParser === 'undefined') {
    return new Set<string>();
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  return new Set(
    Array.from(
      parsedDescription.querySelectorAll<HTMLElement>('[data-attachment-key]'),
    )
      .map((attachment) => attachment.dataset.attachmentKey ?? '')
      .filter(Boolean),
  );
}

export function normalizeDescriptionImageUrls(description: string) {
  if (!description || typeof DOMParser === 'undefined') {
    return description;
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  parsedDescription
    .querySelectorAll<HTMLElement>('img, [data-attachment-node]')
    .forEach((attachment) => {
      const storageKey =
        attachment.dataset.storageKey ||
        extractDescriptionAttachmentStorageKey(
          getInlineAttachmentUrl(attachment),
        );

      if (!storageKey) {
        return;
      }

      attachment.dataset.storageKey = storageKey;
      setInlineAttachmentUrl(attachment, getUploadedFileUrl(storageKey));
    });

  return parsedDescription.body.innerHTML;
}

export function serializeDescriptionImagesForStorage(description: string) {
  if (!description || typeof DOMParser === 'undefined') {
    return description;
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  parsedDescription
    .querySelectorAll<HTMLElement>('img, [data-attachment-node]')
    .forEach((attachment) => {
      const storageKey =
        attachment.dataset.storageKey ||
        extractDescriptionAttachmentStorageKey(
          getInlineAttachmentUrl(attachment),
        );

      if (!storageKey) {
        return;
      }

      attachment.dataset.storageKey = storageKey;
      setInlineAttachmentUrl(attachment, storageKey);
    });

  return parsedDescription.body.innerHTML;
}

function extractDescriptionAttachmentStorageKey(src: string) {
  if (!src) {
    return '';
  }

  try {
    const urlValue = src.match(/https?:\/\/[^\s\])"]+/g)?.at(-1) ?? src;
    const parsedUrl = new URL(urlValue, 'http://localhost');
    const storageKeyFromQuery = parsedUrl.searchParams.get('storageKey');

    if (storageKeyFromQuery) {
      return storageKeyFromQuery.replace(/^\/+/, '');
    }

    const decodedPath = decodeURIComponent(parsedUrl.pathname).replace(
      /^\/+/,
      '',
    );
    const ticketStoragePath = decodedPath.match(
      /(?:^|\/)(projects\/[^/]+\/tickets\/.+)$/,
    );

    return ticketStoragePath?.[1] ?? '';
  } catch {
    return '';
  }
}

function getInlineAttachmentUrl(attachment: HTMLElement) {
  if (attachment instanceof HTMLImageElement) {
    return attachment.getAttribute('src') ?? '';
  }

  return (
    attachment.dataset.src ||
    attachment.querySelector('video, audio')?.getAttribute('src') ||
    attachment.querySelector('a')?.getAttribute('href') ||
    ''
  );
}

function setInlineAttachmentUrl(attachment: HTMLElement, url: string) {
  if (attachment instanceof HTMLImageElement) {
    attachment.setAttribute('src', url);
    return;
  }

  attachment.dataset.src = url;
  attachment.querySelector('video, audio')?.setAttribute('src', url);
  attachment.querySelector('a')?.setAttribute('href', url);
}

export type TicketReporter = {
  id: string;
  fullName: string;
};

// Distinct users who have actually created a ticket in the given projects —
// used for the Created By filter, as opposed to every project member.
export async function fetchTicketReporters(
  projectIds: string[] = [],
): Promise<TicketReporter[]> {
  if (projectIds.length === 0) {
    return [];
  }

  const searchParams = new URLSearchParams();

  projectIds.forEach((projectId) => {
    if (projectId) {
      searchParams.append('projectIds', projectId);
    }
  });

  const response = await fetch(
    `/api/dashboard/tickets/reporters?${searchParams}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | TicketReporter[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead creators.'
        : 'Failed to fetch lead creators.',
    );
  }

  return payload;
}

// Same as fetchTicketReporters, scoped to a single project's own tickets.
export async function fetchProjectTicketReporters(
  projectId: string,
): Promise<TicketReporter[]> {
  if (!projectId) {
    return [];
  }

  const response = await fetch(`/api/projects/${projectId}/tickets/reporters`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | TicketReporter[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead creators.'
        : 'Failed to fetch lead creators.',
    );
  }

  return payload;
}

export type TicketAssignee = {
  id: string;
  fullName: string;
};

// Distinct users who actually have a ticket assigned to them in the given
// projects — used for the Agent filter, as opposed to every member.
export async function fetchTicketAssignees(
  projectIds: string[] = [],
): Promise<TicketAssignee[]> {
  if (projectIds.length === 0) {
    return [];
  }

  const searchParams = new URLSearchParams();

  projectIds.forEach((projectId) => {
    if (projectId) {
      searchParams.append('projectIds', projectId);
    }
  });

  const response = await fetch(
    `/api/dashboard/tickets/assignees?${searchParams}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | TicketAssignee[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead agents.'
        : 'Failed to fetch lead agents.',
    );
  }

  return payload;
}

// Same as fetchTicketAssignees, scoped to a single project's own tickets.
export async function fetchProjectTicketAssignees(
  projectId: string,
): Promise<TicketAssignee[]> {
  if (!projectId) {
    return [];
  }

  const response = await fetch(`/api/projects/${projectId}/tickets/assignees`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | TicketAssignee[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead agents.'
        : 'Failed to fetch lead agents.',
    );
  }

  return payload;
}
