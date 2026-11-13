export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.svg',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.pdf',
  '.zip',
  '.webp',
  '.html',
  '.csv',
  '.txt',
  '.mp4',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.weba',
  '.mov',
  '.fig',
];

export const ALLOWED_ATTACHMENT_ACCEPT =
  ALLOWED_ATTACHMENT_EXTENSIONS.join(',');

export const ALLOWED_ATTACHMENT_HELPER_TEXT =
  'JPG, PNG, SVG, Word, Excel, PDF, WEBP, TXT, ,MP4 ,MP3 ,WAV ,M4A ,OGG ,MOV ,FIG, HTML, or ZIP up to 50 MB total';

export const ALLOWED_ATTACHMENT_ERROR_TEXT = `Allowed file types: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')}`;

export const MAX_ATTACHMENT_SIZE_ERROR_TEXT =
  'Total attachment size must be 50 MB or less.';

export function isAllowedAttachmentFile(file: File) {
  const lowerCaseName = file.name.toLowerCase();

  return ALLOWED_ATTACHMENT_EXTENSIONS.some((extension) =>
    lowerCaseName.endsWith(extension),
  );
}

export function validateAttachments(files: File[]) {
  if (files.some((file) => !isAllowedAttachmentFile(file))) {
    return ALLOWED_ATTACHMENT_ERROR_TEXT;
  }

  const totalAttachmentSize = files.reduce((sum, file) => sum + file.size, 0);

  if (totalAttachmentSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
    return MAX_ATTACHMENT_SIZE_ERROR_TEXT;
  }

  return '';
}

export function getAttachmentFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function getUploadedFileUrl(storageKey: string) {
  if (/^https?:\/\//i.test(storageKey)) {
    const cloudfrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL?.trim();

    try {
      const sourceUrl = new URL(storageKey);
      const cloudfrontHost = cloudfrontUrl
        ? new URL(cloudfrontUrl).host
        : '';

      if (!cloudfrontHost || sourceUrl.host !== cloudfrontHost) {
        return storageKey;
      }

      storageKey = decodeURIComponent(sourceUrl.pathname).replace(/^\/+/, '');
    } catch {
      return storageKey;
    }
  }

  const normalizedStorageKey = storageKey.replace(/^\/+/, '');

  return `/api/projects/files/download?${new URLSearchParams({
    storageKey: normalizedStorageKey,
    preview: '1',
  }).toString()}`;
}

export type UploadedFileDto = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fromDescription?: boolean;
};

async function uploadFileDirectly(
  file: File,
  keyPrefix: string,
): Promise<UploadedFileDto> {
  const key = `${keyPrefix}/${crypto.randomUUID()}/${Date.now()}-${file.name}`;

  const presignParams = new URLSearchParams({
    key,
    action: 'upload',
    contentType: file.type || 'application/octet-stream',
  });

  const presignRes = await fetch(
    `/api/utility/presigned-url?${presignParams.toString()}`,
    { method: 'GET' },
  );

  const presignData = await presignRes.json().catch(() => null);

  if (!presignRes.ok || !presignData?.url) {
    throw new Error(
      presignData?.message || `Failed to get upload URL for ${file.name}.`,
    );
  }

  const putRes = await fetch(presignData.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Failed to upload ${file.name} to storage.`);
  }

  return {
    storageKey: key,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

export async function uploadFilesDirectly(
  files: File[],
  keyPrefix: string,
): Promise<UploadedFileDto[]> {
  const validationError = validateAttachments(files);

  if (validationError) {
    throw new Error(validationError);
  }

  return Promise.all(files.map((file) => uploadFileDirectly(file, keyPrefix)));
}
