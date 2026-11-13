'use client';

import type { ProjectMember } from '../../lib/project-members';
import AppModal from '../modals/AppModal';
import RichTextEditor from '../RichTextEditor';
import ThemeButton from '../ui/ThemeButton';
import EmojiPickerButton from './EmojiPickerButton';

type ExpandedMessageEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  onSelectEmoji: (emoji: string) => void;
  onSave: () => Promise<void> | void;
  onAddInlineAttachments: (files: File[]) => boolean;
  mentionMembers: ProjectMember[];
  characterCount: number;
  maxLength: number;
  disabled: boolean;
  saveDisabled: boolean;
};

export default function ExpandedMessageEditModal({
  isOpen,
  onClose,
  value,
  onChange,
  onSelectEmoji,
  onSave,
  onAddInlineAttachments,
  mentionMembers,
  characterCount,
  maxLength,
  disabled,
  saveDisabled,
}: ExpandedMessageEditModalProps) {
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit message"
      size="extraLarge"
      scrollNeeded={false}
      outSideClickClose={false}
    >
      <div className="flex min-h-0 flex-col gap-3 p-4">
        <RichTextEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
          editorHeight="h-[55dvh]"
          showCharacterCount={false}
          mentionMembers={mentionMembers}
          onAttachmentFilesAdded={onAddInlineAttachments}
          onPastedAttachmentFilesAdded={onAddInlineAttachments}
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {characterCount}/{maxLength}
          </span>
          <div className="flex items-center gap-1.5">
            <EmojiPickerButton
              disabled={disabled}
              onSelectEmoji={onSelectEmoji}
            />
            <ThemeButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={disabled}
            >
              Cancel
            </ThemeButton>
            <ThemeButton
              type="button"
              variant="primaryGradient"
              size="sm"
              onClick={() => void onSave()}
              disabled={saveDisabled}
            >
              {disabled ? 'Saving...' : 'Save'}
            </ThemeButton>
          </div>
        </div>
      </div>
    </AppModal>
  );
}

