'use client';

import { DownloadIcon } from '../../../public/icons';
import type { DiscussionAttachment } from './types';

export function shouldShowAttachmentDownload(attachment: DiscussionAttachment) {
  return Boolean(attachment.storageKey ?? attachment.url);
}

export default function AttachmentDownloadButton({
  attachment,
}: {
  attachment: DiscussionAttachment;
}) {
  if (!shouldShowAttachmentDownload(attachment)) {
    return null;
  }

  const source = attachment.storageKey ?? attachment.url;

  if (!source) {
    return null;
  }

  const searchParams = new URLSearchParams({
    storageKey: source,
    fileName: attachment.name,
  });

  return (
    <a
      href={`/api/projects/files/download?${searchParams.toString()}`}
      download={attachment.name}
      // aria-label={`Download ${attachment.name}`}
      // title={`Download ${attachment.name}`}
      className="opacity-0 flex group-hover:opacity-100 h-8 w-8 absolute inset-e-2 top-2 shrink-0 items-center justify-center rounded-full text-gray-500 transition group-hover:bg-white drop-shadow hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-primary"
      onClick={(event) => event.stopPropagation()}
    >
      <DownloadIcon />
    </a>
  );
}

