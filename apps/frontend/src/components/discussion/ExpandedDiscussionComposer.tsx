'use client';

import { useEffect, useState } from 'react';
import AppModal from '../modals/AppModal';
import RichTextEditor from '../RichTextEditor';
import EmojiPickerButton from './EmojiPickerButton';
import type { ProjectMember } from '../../lib/project-members';
import { isVoiceNoteFile } from '../../lib/voice-notes';
import { FileTypePlaceholder, TrashIcon } from '../../../public/icons';
import VoiceRecorderButton, { VoiceNotePreview } from './VoiceRecorderButton';

type ExpandedDiscussionComposerProps = {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mentionMembers: ProjectMember[];
  attachments: File[];
  onRemoveAttachment: (file: File) => void;
  onPasteAttachments: (files: File[]) => boolean;
  onSelectEmoji: (emoji: string) => void;
  onOpenAttachmentPicker: () => void;
  onVoiceRecorded: (file: File) => void;
  onRecordingChange: (isRecording: boolean) => void;
  onSend: () => Promise<void> | void;
  canAttachFile: boolean;
  disabled: boolean;
  sendDisabled: boolean;
  characterCount: number;
  maxLength: number;
};

export default function ExpandedDiscussionComposer({
  isOpen,
  onClose,
  value,
  onChange,
  placeholder,
  mentionMembers,
  attachments,
  onRemoveAttachment,
  onPasteAttachments,
  onSelectEmoji,
  onOpenAttachmentPicker,
  onVoiceRecorded,
  onRecordingChange,
  onSend,
  canAttachFile,
  disabled,
  sendDisabled,
  characterCount,
  maxLength,
}: ExpandedDiscussionComposerProps) {
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose message"
      size="extraLarge"
      scrollNeeded={false}
      outSideClickClose={false}
    >
      <div className="flex min-h-0 flex-1 h-full flex-col gap-3 p-4">
        <RichTextEditor
          value={value}
          onChange={onChange}
          onEnter={() => {
            if (!sendDisabled) {
              void onSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
         editorHeight="h-full md:h-[55dvh]"
         className="
  flex min-h-0 flex-1 flex-col
  [&_.rich-text-editor]:flex-1
  sm:flex-none
  sm:[&_.rich-text-editor]:flex-none
"
          showCharacterCount={false}
          mentionMembers={mentionMembers}
          onAttachmentFilesAdded={onPasteAttachments}
          onPastedAttachmentFilesAdded={onPasteAttachments}
        />

        {attachments.length ? (
      <div className="flex max-h-32 w-full min-w-0 shrink-0 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden scrollbar-thin md:flex-wrap md:overflow-y-auto">
            {attachments.map((file) => (
              <div
                key={`${file.name}-${file.size}-${file.lastModified}`}
               className="flex min-w-30 shrink-0 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 py-0.5 pr-2 pl-0.5 md:w-full md:max-w-65 md:min-w-0 md:shrink"
              >
                {isVoiceNoteFile(file) ? (
                  <VoiceNotePreview file={file} />
                ) : (
                  <>
                    <LocalAttachmentPreview file={file} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatAttachmentSize(file.size)}
                      </p>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(file)}
                  disabled={disabled}
                  className="text-xs font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Remove ${file.name}`}
                >
                  <TrashIcon width="16" height="16" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex shrink-0 items-end justify-between gap-3">
          <span className="text-xs text-gray-500">
            {characterCount}/{maxLength}
          </span>
          <div className="flex items-center gap-2">
            <EmojiPickerButton
              disabled={disabled}
              onSelectEmoji={onSelectEmoji}
            />
            {canAttachFile ? (
              <button
                type="button"
                onClick={onOpenAttachmentPicker}
                disabled={disabled}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Attach files"
              >
                <PaperclipIcon />
              </button>
            ) : null}
            {canAttachFile ? (
              <VoiceRecorderButton
                disabled={disabled}
                onRecorded={onVoiceRecorded}
                onRecordingChange={onRecordingChange}
              />
            ) : null}
            <button
              type="button"
              onClick={() => {
                void onSend();
              }}
              disabled={sendDisabled}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10175A] text-white disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send message"
            >
              {disabled ? <ButtonSpinner /> : <SendIcon />}
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}

function LocalAttachmentPreview({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file, isImage]);

  if (isImage && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={file.name}
        className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover"
      />
    );
  }

  const extension = normalizeAttachmentExtension(file.name.split('.').pop());

  return (
    <span className="relative shrink-0">
      <span
        className={`absolute top-4 rounded-xs px-0.75 pt-0.75 pb-0.5 text-[7.5px] leading-none! font-bold text-white uppercase ${getAttachmentBadgeClassName(extension)}`}
      >
        {extension}
      </span>
      <FileTypePlaceholder />
    </span>
  );
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeAttachmentExtension(extension?: string) {
  const value = (extension ?? 'file').trim().toUpperCase();
  return value === 'JPEG' ? 'JPG' : value.slice(0, 4) || 'FILE';
}

function getAttachmentBadgeClassName(extension: string) {
  if (extension === 'PDF') return 'bg-red-500';
  if (extension === 'DOC' || extension === 'DOCX') return 'bg-blue-600';
  if (extension === 'XLS' || extension === 'XLSX') return 'bg-green-600';
  if (['PNG', 'JPG', 'JPEG', 'SVG'].includes(extension)) return 'bg-violet-500';
  if (extension === 'ZIP') return 'bg-gray-600';
  return 'bg-[#10175A]';
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.5 3.75C7.15279 3.75 5.25 5.65279 5.25 8V13.5001C5.25 17.228 8.27208 20.2501 12 20.2501C15.7279 20.2501 18.75 17.228 18.75 13.5001V12.0001C18.75 11.5859 19.0858 11.2501 19.5 11.2501C19.9142 11.2501 20.25 11.5859 20.25 12.0001V13.5001C20.25 18.0564 16.5563 21.7501 12 21.7501C7.44365 21.7501 3.75 18.0564 3.75 13.5001V8C3.75 4.82436 6.32436 2.25 9.5 2.25C12.6756 2.25 15.25 4.82436 15.25 8V13.5C15.25 15.2949 13.7949 16.75 12 16.75C10.2051 16.75 8.75 15.2949 8.75 13.5V9.5C8.75 9.08579 9.08579 8.75 9.5 8.75C9.91421 8.75 10.25 9.08579 10.25 9.5V13.5C10.25 14.4665 11.0335 15.25 12 15.25C12.9665 15.25 13.75 14.4665 13.75 13.5V8C13.75 5.65279 11.8472 3.75 9.5 3.75Z"
        fill="#020F52"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.8029 13.0897L9.80288 13.0896L8.02961 11.0735C7.15174 10.0754 7.04779 9.63681 7.10555 9.54226L7.77109 9.00624L10.4686 6.89628C10.6861 6.72615 10.7245 6.41191 10.5544 6.1944C10.3843 5.97689 10.07 5.93848 9.85253 6.10861L7.15216 8.22073L6.34009 8.88355C6.15052 9.08701 6.02962 9.43495 6.16147 9.92972C6.28453 10.3915 6.62968 11.0017 7.36459 11.8396L7.09316 12.3748C6.91786 12.6185 6.7551 12.8447 6.6053 12.9998C6.45646 13.1539 6.18601 13.3804 5.80932 13.3054C5.43759 13.2315 5.27077 12.9241 5.18818 12.7269C5.1043 12.5266 5.03326 12.255 4.95618 11.9602L4.62184 10.6826C4.43614 9.97294 4.37201 9.76896 4.25117 9.61882C4.23592 9.59987 4.22003 9.58156 4.20355 9.56391C4.07597 9.42731 3.8958 9.34325 3.23583 9.0787L3.19968 9.06421C2.54928 8.80352 2.01354 8.58879 1.63882 8.37781C1.27579 8.17341 0.883764 7.87625 0.838665 7.37487C0.831655 7.29695 0.831776 7.21852 0.839024 7.14062C0.885665 6.63934 1.27866 6.34344 1.64233 6.14025C2.01771 5.93051 2.55412 5.71755 3.20531 5.45903L11.1947 2.28701C12.0119 1.96253 12.6802 1.6972 13.2052 1.57623C13.7406 1.4529 14.2936 1.43984 14.7269 1.84067C15.1517 2.23359 15.2025 2.78712 15.1496 3.34498C15.0971 3.89847 14.9244 4.61828 14.7114 5.5062L13.0983 12.2309C12.9626 12.7969 12.848 13.2747 12.7105 13.6214C12.5717 13.9716 12.349 14.3478 11.8991 14.4667C11.4437 14.5871 11.0674 14.3627 10.7814 14.1206C10.5005 13.8829 10.1801 13.5186 9.8029 13.0897Z"
        fill="white"
      />
    </svg>
  );
}

function ButtonSpinner() {
  return (
    <span className="inline-flex h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
  );
}
