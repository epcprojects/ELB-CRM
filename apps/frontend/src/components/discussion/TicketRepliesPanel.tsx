'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useLayoutEffect,
} from 'react';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  validateAttachments,
} from '../../lib/attachments';
import {
  EmptyRepliesIcon,
  FileTypePlaceholder,
  ThreedotIcon,
  TrashIcon,
} from '../../../public/icons';
import { getFileUrl } from '../projects/ProjectFilesPanel';
import ConfirmActionModal from '../modals/ConfirmActionModal';
import ImageGalleryLightbox, {
  VideoThumbnail,
} from '../ui/ImageGalleryLightbox';
import AttachmentCollage, { getCollageType } from './AttachmentCollage';
import AttachmentDownloadButton from './AttachmentDownloadButton';
import MediaAttachmentPreview, {
  getAttachmentMediaType,
  hasOnlyAudioAttachments,
} from './MediaAttachmentPreview';
import type { DiscussionAttachment, DiscussionReply } from './types';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import EmojiPickerButton from './EmojiPickerButton';
import MessageReactionBar from './MessageReactionBar';
import ThemeButton from '../ui/ThemeButton';
import TopLoadingBar from '../ui/TopLoadingBar';
import { getMentionedUserIdsFromPlainText } from './DiscussionMentionsInput';
import type { ProjectMember } from '../../lib/project-members';
import RichTextEditor from '../RichTextEditor';
import {
  hasRichTextContent,
  normalizeDescriptionImageUrls,
  serializeDescriptionImagesForStorage,
} from '../../lib/tickets';
import DOMPurify from 'dompurify';
import ExpandedDiscussionComposer from './ExpandedDiscussionComposer';
import ExpandedMessageEditModal from './ExpandedMessageEditModal';
import { useAppLoader } from '../../app/providers/AppLoaderProvider';
import { isVoiceNoteFile } from '../../lib/voice-notes';
import VoiceRecorderButton, { VoiceNotePreview } from './VoiceRecorderButton';

const EMOJI_TEXT_STYLE = {
  fontFamily:
    "var(--poppins), 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif",
};
const MAX_DISCUSSION_MESSAGE_LENGTH = 4000;

function clampDiscussionMessage(value: string) {
  return value.slice(0, MAX_DISCUSSION_MESSAGE_LENGTH);
}

type DiscussionPanelProps = {
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  headerReply?: DiscussionReply | null;
  replies: DiscussionReply[];
  mentionMembers?: ProjectMember[];
  emptyTitle?: string;
  emptyDescription?: string;
  composerPlaceholder?: string;
  onSubmitReply?: (payload: {
    message: string;
    attachments: File[];
    inlineAttachments: File[];
    mentionedUserIds: string[];
  }) => Promise<void> | void;
  isSubmittingReply?: boolean;
  canCompose?: boolean;
  // Shown instead of the composer when the user can see the lead but not write
  readOnlyNotice?: string;
  canAttachFile?: boolean;
  requireMessage?: boolean;
  currentUserId?: string;
  showReplyMeta?: boolean;
  onReplyClick?: (reply: DiscussionReply) => void;
  onDeleteAttachment?: (attachment: DiscussionAttachment) => void;
  deletingAttachmentId?: string;
  onDeleteReply?: (reply: DiscussionReply) => void;
  deletingReplyId?: string;
  onEditReply?: (payload: {
    reply: DiscussionReply;
    message: string;
    inlineAttachments: File[];
    mentionedUserIds: string[];
  }) => Promise<void> | void;
  onToggleReaction?: (
    reply: DiscussionReply,
    emoji: string,
  ) => Promise<void> | void;
  editingReplyId?: string;
  hideHeader?: boolean;
  className?: string;
  showBorderTop?: boolean;
  hasMoreReplies?: boolean;
  isLoadingMoreReplies?: boolean;
  onLoadMoreReplies?: () => Promise<void> | void;
};

type GalleryImage = {
  mediaType?: 'image' | 'video';
  attachmentId: string;
  storageKey?: string;
  fileName?: string;
  src: string;
  alt: string;
};

export default function TicketRepliesPanel({
  title = 'Replies',
  subtitle = '',
  headerAction,
  headerReply,
  replies,
  mentionMembers = [],
  emptyTitle = 'No replies yet.',
  emptyDescription = 'No responses have been added to this lead yet.',
  composerPlaceholder = 'Write a reply...',
  onSubmitReply,
  isSubmittingReply = false,
  canCompose = Boolean(onSubmitReply),
  readOnlyNotice,
  canAttachFile = true,
  requireMessage = true,
  currentUserId = '',
  showReplyMeta = false,
  onReplyClick,
  onDeleteAttachment,
  deletingAttachmentId,
  onDeleteReply,
  deletingReplyId,
  onEditReply,
  onToggleReaction,
  editingReplyId,
  hideHeader = false,
  className,
  showBorderTop,
  hasMoreReplies = false,
  isLoadingMoreReplies = false,
  onLoadMoreReplies,
}: DiscussionPanelProps) {
  const { setLoading } = useAppLoader();
  const [message, setMessage] = useState('');
  const [messagePlainText, setMessagePlainText] = useState('');
  const [, setMentionedUserIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineAttachments, setInlineAttachments] = useState<File[]>([]);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<DiscussionAttachment | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingMessage, setEditingMessage] = useState('');
  const [editingMessagePlainText, setEditingMessagePlainText] = useState('');
  const [editingInlineAttachments, setEditingInlineAttachments] = useState<
    File[]
  >([]);
  const [isEditComposerExpanded, setIsEditComposerExpanded] = useState(false);
  const [, setEditingMentionedUserIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousHeaderReplyIdRef = useRef<string | undefined>(undefined);
  const previousLastReplyIdRef = useRef<string | undefined>(undefined);
  const previousRepliesLengthRef = useRef(0);
  const pendingPrependRestoreRef = useRef<{
    previousScrollHeight: number;
  } | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const conversationImages = getGalleryImagesFromDiscussion(
    headerReply,
    replies,
  );

  const focusComposer = () => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    if (pendingPrependRestoreRef.current) {
      const { previousScrollHeight } = pendingPrependRestoreRef.current;
      const scrollDelta = container.scrollHeight - previousScrollHeight;

      container.scrollTop = Math.max(0, scrollDelta);
      pendingPrependRestoreRef.current = null;
      previousRepliesLengthRef.current = replies.length;
      previousHeaderReplyIdRef.current = headerReply?.id;
      previousLastReplyIdRef.current = replies.at(-1)?.id;
      return;
    }

    const previousHeaderReplyId = previousHeaderReplyIdRef.current;
    const previousLastReplyId = previousLastReplyIdRef.current;
    const nextLastReplyId = replies.at(-1)?.id;
    const isInitialLoad =
      previousHeaderReplyId === undefined &&
      previousLastReplyId === undefined &&
      previousRepliesLengthRef.current === 0;
    const shouldScrollToBottom =
      previousHeaderReplyId !== headerReply?.id ||
      previousLastReplyId !== nextLastReplyId ||
      (previousRepliesLengthRef.current === 0 && replies.length > 0);

    let cleanupInitialMediaTracking: (() => void) | undefined;

    if (shouldScrollToBottom) {
      const scrollToBottom = () => {
        container.scrollTop = container.scrollHeight;
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
          const endMarker = messagesEndRef.current;

          if (endMarker) {
            const containerBottom = container.getBoundingClientRect().bottom;
            const markerBottom = endMarker.getBoundingClientRect().bottom;
            container.scrollTop += markerBottom - containerBottom;
          }
        });
      };

      scrollToBottom();

      if (isInitialLoad) {
        const content = container.firstElementChild;
        const media = Array.from(
          container.querySelectorAll<HTMLImageElement | HTMLMediaElement>(
            'img, video, audio',
          ),
        );
        const resizeObserver = new ResizeObserver(scrollToBottom);
        const stopTracking = () => resizeObserver.disconnect();
        const timeoutId = window.setTimeout(stopTracking, 10000);

        resizeObserver.observe(container);
        if (content) resizeObserver.observe(content);

        media.forEach((element) => {
          element.addEventListener('load', scrollToBottom, { once: true });
          element.addEventListener('loadedmetadata', scrollToBottom, {
            once: true,
          });
          element.addEventListener('error', scrollToBottom, { once: true });
        });

        cleanupInitialMediaTracking = () => {
          window.clearTimeout(timeoutId);
          stopTracking();
          media.forEach((element) => {
            element.removeEventListener('load', scrollToBottom);
            element.removeEventListener('loadedmetadata', scrollToBottom);
            element.removeEventListener('error', scrollToBottom);
          });
        };
      }
    }

    previousRepliesLengthRef.current = replies.length;
    previousHeaderReplyIdRef.current = headerReply?.id;
    previousLastReplyIdRef.current = nextLastReplyId;

    return cleanupInitialMediaTracking;
  }, [headerReply?.id, replies]);

  useEffect(() => {
    if (!isLoadingMoreReplies) {
      loadMoreInFlightRef.current = false;
    }
  }, [isLoadingMoreReplies]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;

    if (
      !container ||
      !hasMoreReplies ||
      isLoadingMoreReplies ||
      !onLoadMoreReplies ||
      loadMoreInFlightRef.current ||
      container.scrollTop > 80
    ) {
      return;
    }

    pendingPrependRestoreRef.current = {
      previousScrollHeight: container.scrollHeight,
    };
    loadMoreInFlightRef.current = true;
    void Promise.resolve(onLoadMoreReplies()).catch(() => {
      pendingPrependRestoreRef.current = null;
      loadMoreInFlightRef.current = false;
    });
  };

  const handleSubmit = async () => {
    const trimmedMessage = messagePlainText.trim();
    const currentMessage = message;
    const currentPlainText = messagePlainText;
    const currentMentionedUserIds = Array.from(
      new Set([
        ...getMentionedUserIdsFromRichText(message),
        ...getMentionedUserIdsFromPlainText(messagePlainText, mentionMembers),
      ]),
    );
    const currentRegularAttachments = attachments;
    const currentInlineAttachments = inlineAttachments;

    if (
      trimmedMessage.length > MAX_DISCUSSION_MESSAGE_LENGTH ||
      (requireMessage
        ? !hasRichTextContent(currentMessage)
        : !hasRichTextContent(currentMessage) && !attachments.length) ||
      isSubmittingReply ||
      !onSubmitReply
    ) {
      return;
    }

    setMessage('');
    setMessagePlainText('');
    setMentionedUserIds([]);
    setAttachments([]);
    setInlineAttachments([]);
    setAttachmentError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    focusComposer();

    try {
      await onSubmitReply({
        message: currentMessage.trim(),
        attachments: currentRegularAttachments,
        inlineAttachments: currentInlineAttachments,
        mentionedUserIds: currentMentionedUserIds,
      });
    } catch (error) {
      setMessage(currentMessage);
      setMessagePlainText(currentPlainText);
      setMentionedUserIds(currentMentionedUserIds);
      setAttachments(currentRegularAttachments);
      setInlineAttachments(currentInlineAttachments);
      throw error;
    }
  };

  const handleAttachmentChange = (files: FileList | File[] | null) => {
    const selectedFiles = files ? Array.from(files) : [];

    if (!selectedFiles.length) {
      setAttachmentError('');
      focusComposer();
      return;
    }

    const nextAttachments = mergeAttachmentFiles(attachments, selectedFiles);
    const validationError = validateAttachments(nextAttachments);

    if (validationError) {
      setAttachmentError(validationError);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      focusComposer();
      return;
    }

    setAttachments(nextAttachments);
    setAttachmentError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    focusComposer();
  };

  const handleVoiceNoteRecorded = (file: File) => {
    const nextAttachments = mergeAttachmentFiles(attachments, [file]);
    const validationError = validateAttachments([
      ...nextAttachments,
      ...inlineAttachments,
    ]);

    if (validationError) {
      setAttachmentError(validationError);
      return;
    }

    setAttachments(nextAttachments);
    setAttachmentError('');
    focusComposer();
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((currentMessage) => appendToRichText(currentMessage, emoji));
    setMessagePlainText((currentText) =>
      clampDiscussionMessage(`${currentText}${emoji}`),
    );
  };

  const handleEditingEmojiSelect = (emoji: string) => {
    setEditingMessage((currentMessage) =>
      appendToRichText(currentMessage, emoji),
    );
    setEditingMessagePlainText((currentText) =>
      clampDiscussionMessage(`${currentText}${emoji}`),
    );
  };

  const startEditingReply = (reply: DiscussionReply) => {
    const hydratedEditingMessage = normalizeDescriptionImageUrls(reply.message);

    setEditingMessageId(reply.id);
    setEditingMessage(hydratedEditingMessage);
    setEditingMessagePlainText(getRichTextPlainText(hydratedEditingMessage));
    setEditingInlineAttachments([]);
    setEditingMentionedUserIds(reply.mentionedUserIds ?? []);
  };

  const cancelEditingReply = () => {
    setIsEditComposerExpanded(false);
    setEditingMessageId('');
    setEditingMessage('');
    setEditingMessagePlainText('');
    setEditingInlineAttachments([]);
    setEditingMentionedUserIds([]);
  };

  const handleSaveEditedReply = async (reply: DiscussionReply) => {
    const trimmedMessage = editingMessagePlainText.trim();
    const nextMentionedUserIds = Array.from(
      new Set([
        ...getMentionedUserIdsFromRichText(editingMessage),
        ...getMentionedUserIdsFromPlainText(trimmedMessage, mentionMembers),
      ]),
    );

    if (
      !trimmedMessage ||
      trimmedMessage.length > MAX_DISCUSSION_MESSAGE_LENGTH ||
      !onEditReply ||
      editingReplyId === reply.id
    ) {
      return;
    }

    const nextMessage = serializeDescriptionImagesForStorage(
      editingMessage.trim(),
    );

    cancelEditingReply();

    try {
      await onEditReply({
        reply,
        message: nextMessage,
        inlineAttachments: editingInlineAttachments,
        mentionedUserIds: nextMentionedUserIds,
      });
    } catch (error) {
      setEditingMessageId(reply.id);
      setEditingMessage(nextMessage);
      setEditingMessagePlainText(nextMessage);
      setEditingMentionedUserIds(reply.mentionedUserIds ?? []);
      throw error;
    }
  };
  const handleInlineAttachmentPaste = (pastedFiles: File[]) => {
    if (!canAttachFile || isSubmittingReply) {
      return false;
    }

    const nextInlineAttachments = mergeAttachmentFiles(
      inlineAttachments,
      pastedFiles,
    );
    const validationError = validateAttachments([
      ...attachments,
      ...nextInlineAttachments,
    ]);

    if (validationError) {
      setAttachmentError(validationError);
      return false;
    }

    setInlineAttachments(nextInlineAttachments);
    setAttachmentError('');
    return true;
  };

  const handleEditMessageChange = (nextMessage: string) => {
    const nextPlainText = getRichTextPlainText(nextMessage);
    const inlineKeys = getInlineAttachmentKeys(nextMessage);

    setEditingMessage(nextMessage);
    setEditingMessagePlainText(clampDiscussionMessage(nextPlainText));
    setEditingInlineAttachments((currentFiles) =>
      currentFiles.filter((file) => inlineKeys.has(getAttachmentFileKey(file))),
    );
  };

  const handleEditInlineAttachments = (files: File[]) => {
    const nextFiles = mergeAttachmentFiles(editingInlineAttachments, files);
    const validationError = validateAttachments(nextFiles);

    if (validationError) {
      setAttachmentError(validationError);
      return false;
    }

    setEditingInlineAttachments(nextFiles);
    setAttachmentError('');
    return true;
  };

  const handleComposerChange = (nextMessage: string) => {
    const nextPlainText = getRichTextPlainText(nextMessage);
    const inlineKeys = getInlineAttachmentKeys(nextMessage);

    setMessage(nextMessage);
    setMessagePlainText(clampDiscussionMessage(nextPlainText));
    setMentionedUserIds(
      getMentionedUserIdsFromPlainText(nextPlainText, mentionMembers),
    );
    setInlineAttachments((currentFiles) =>
      currentFiles.filter((file) => inlineKeys.has(getAttachmentFileKey(file))),
    );
  };

  const removeRegularAttachment = (attachment: File) => {
    const nextAttachments = attachments.filter((file) => file !== attachment);
    setAttachments(nextAttachments);
    if (!nextAttachments.length && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const closeExpandedComposer = () => {
    if (inlineAttachments.length) {
      handleComposerChange(
        refreshInlineAttachmentPreviewUrls(message, inlineAttachments),
      );
    }
    setIsComposerExpanded(false);
  };
  const handleConfirmDeleteAttachment = async () => {
    if (!attachmentToDelete || !onDeleteAttachment) {
      return;
    }

    await onDeleteAttachment(attachmentToDelete);
    setAttachmentToDelete(null);
  };

  const openGallery = (images: GalleryImage[], index: number) => {
    if (!images.length || index < 0) {
      return;
    }

    setGalleryImages(images);
    setActiveGalleryIndex(index);
  };

  const closeGallery = () => {
    setActiveGalleryIndex(null);
    setGalleryImages([]);
  };

  const showPreviousGalleryImage = () => {
    setActiveGalleryIndex((current) =>
      current === null || !galleryImages.length
        ? null
        : (current - 1 + galleryImages.length) % galleryImages.length,
    );
  };

  const showNextGalleryImage = () => {
    setActiveGalleryIndex((current) =>
      current === null || !galleryImages.length
        ? null
        : (current + 1) % galleryImages.length,
    );
  };

  const selectGalleryImage = (index: number) => {
    setActiveGalleryIndex(index);
  };
  return (
    <>
      {/* <section
        className={`flex h-[calc(100dvh-132px)] min-h-0 flex-none flex-col overflow-hidden rounded-xl ${
          showBorderTop
            ? 'border border-gray-200'
            : 'border-t-0 border border-gray-200'
        } bg-white xl:h-full xl:flex-1 ${className}`}
      > */}
      <section
        className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl ${
          showBorderTop
            ? 'border border-gray-200'
            : 'border-t-0 border border-gray-200'
        } bg-white ${className}`}
      >
        <TopLoadingBar visible={isSubmittingReply} />
        {!hideHeader && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 sm:py-3 md:px-5">
            <div className="flex items-center gap-3">
              <h3 className="text-sm md:text-base font-semibold text-gray-900">
                {title}
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {subtitle ? (
                <p className="text-sm text-gray-900">{subtitle}</p>
              ) : null}
              {headerAction}
            </div>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          // className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-3 py-5 md:px-5"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-5 [overflow-anchor:none] scrollbar-hide md:px-5"
        >
          <div
            className={`flex min-h-full flex-col ${replies.length > 0 ? 'justify-end' : 'justify-center'}`}
          >
            {hasMoreReplies || isLoadingMoreReplies ? (
              <div className="mb-4 flex justify-center">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                  {isLoadingMoreReplies
                    ? 'Loading older replies...'
                    : 'Scroll up to load older replies'}
                </span>
              </div>
            ) : null}
            {headerReply ? (
              <div className="mb-4 border-b border-gray-200 pb-4">
                <article className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-bold text-purple-700">
                    {headerReply.author.initials}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {headerReply.author.name}
                      </span>
                      <span className="text-xs text-gray-700">
                        {headerReply.createdAt}
                      </span>
                    </div>
                    {headerReply.message ? (
                      <ExpandableMessageText
                        message={headerReply.message}
                        mentionedUserIds={headerReply.mentionedUserIds ?? []}
                        mentionMembers={mentionMembers}
                        onOpenMedia={(mediaIndex) =>
                          openGallery(
                            conversationImages,
                            conversationImages.findIndex(
                              (item) =>
                                item.attachmentId ===
                                `${headerReply.id}:inline:${mediaIndex}`,
                            ),
                          )
                        }
                      />
                    ) : null}
                    {headerReply.attachments?.length ? (
                      <div className="mt-2 grid gap-2">
                        {headerReply.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex min-w-0 relative group w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-2.5 transition hover:bg-gray-50"
                          >
                            <a
                              href={getAttachmentUrl(attachment.storageKey)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-w-0 flex-1 items-start gap-3"
                              onClick={(event) => {
                                if (
                                  !isImageAttachment(attachment.extension) &&
                                  getAttachmentMediaType(
                                    attachment.extension,
                                  ) !== 'video'
                                ) {
                                  return;
                                }

                                event.preventDefault();
                                const index = conversationImages.findIndex(
                                  (image) =>
                                    image.attachmentId === attachment.id,
                                );
                                openGallery(conversationImages, index);
                              }}
                            >
                              {isImageAttachment(attachment.extension) ? (
                                <img
                                  className="rounded-sm h-10 border border-gray-200 w-10"
                                  src={getFileUrl(attachment.storageKey)}
                                />
                              ) : (
                                <AttachmentFileIcon
                                  extension={attachment.extension}
                                  storageKey={attachment.storageKey}
                                  name={attachment.name}
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-700">
                                  {attachment.name}
                                </p>
                                {attachment.sizeLabel ? (
                                  <p className="text-sm text-gray-500">
                                    {attachment.sizeLabel}
                                  </p>
                                ) : null}
                              </div>
                            </a>
                            <AttachmentDownloadButton attachment={attachment} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {typeof headerReply.replyCount === 'number' &&
                    headerReply.replyCount > 0 ? (
                      <p className="mt-2 text-xs font-medium text-gray-500">
                        {headerReply.replyCount}
                        {headerReply.replyCount === 1 ? 'Reply' : 'Replies'}
                      </p>
                    ) : null}
                  </div>
                </article>
              </div>
            ) : null}

            {replies.length ? (
              <div className="space-y-5">
                {replies.map((reply) => {
                  const isCurrentUserReply = Boolean(
                    currentUserId && reply.authorId === currentUserId,
                  );

                  return (
                    <article
                      key={reply.id}
                      className={`flex items-start gap-3 ${
                        isCurrentUserReply ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!isCurrentUserReply ? (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-bold text-purple-700">
                          {reply.author.initials}
                        </span>
                      ) : null}
                      <div
                        className={`flex flex-col ${editingMessageId !== reply.id ? ' max-w-[80%] w-fit' : 'w-full'} ${
                          isCurrentUserReply ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`mb-1 flex flex-wrap items-center gap-2 ${
                            isCurrentUserReply ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span className="text-sm font-bold text-gray-900">
                            {reply.author.name}
                          </span>
                          <span className="text-xs text-gray-700">
                            {reply.createdAt}
                          </span>
                          {isCurrentUserReply && reply.status ? (
                            <ChatStatusIcon status={reply.status} />
                          ) : null}
                        </div>

                        {reply.message || reply.attachments?.length ? (
                          <div
                            tabIndex={0}
                            className={`group/reply relative w-full rounded-xl bg-white ${
                              isCurrentUserReply
                                ? 'rounded-tr-none'
                                : 'rounded-tl-none'
                            } ${
                              reply.message && editingMessageId !== reply.id
                                ? ` ${reply.attachments?.length ? 'space-y-2' : ''} border border-gray-200 p-3 shadow-xs`
                                : 'border border-gray-200'
                            }`}
                          >
                            {!editingMessageId && (
                              <MessageReactionBar
                                reactions={reply.reactions ?? []}
                                onToggleReaction={(emoji) =>
                                  void onToggleReaction?.(reply, emoji)
                                }
                                currentUserId={currentUserId}
                                align={isCurrentUserReply ? 'end' : 'start'}
                                className={
                                  isCurrentUserReply
                                    ? 'left-auto right-3'
                                    : undefined
                                }
                              />
                            )}
                            <div
                              className={
                                (onDeleteReply || onEditReply) &&
                                isCurrentUserReply &&
                                editingMessageId !== reply.id &&
                                !getCollageType(reply.attachments ?? [])
                                  ? 'pr-7'
                                  : ''
                              }
                            >
                              {editingMessageId === reply.id ? (
                                <div className="rounded-2xl w-full  ">
                                  <div className="border-hide p-1">
                                    <RichTextEditor
                                      value={editingMessage}
                                      onChange={handleEditMessageChange}
                                      mentionMembers={
                                        isEditComposerExpanded
                                          ? []
                                          : mentionMembers
                                      }
                                      disabled={editingReplyId === reply.id}
                                      maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
                                      editorHeight="h-36"
                                      showCharacterCount={false}
                                      onAttachmentFilesAdded={
                                        handleEditInlineAttachments
                                      }
                                      onPastedAttachmentFilesAdded={
                                        handleEditInlineAttachments
                                      }
                                      toolbarEndAction={
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setIsEditComposerExpanded(true)
                                          }
                                          disabled={editingReplyId === reply.id}
                                          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
                                          aria-label="Expand edit message"
                                        >
                                          <ExpandComposerIcon />
                                        </button>
                                      }
                                    />
                                  </div>
                                  <div className="mt-2 text-right text-xs text-gray-500 px-3">
                                    {editingMessagePlainText.length}/
                                    {MAX_DISCUSSION_MESSAGE_LENGTH}
                                  </div>
                                  <div className=" flex items-center justify-end gap-1.5 pb-3 mt-1 px-3">
                                    <EmojiPickerButton
                                      disabled={editingReplyId === reply.id}
                                      onSelectEmoji={handleEditingEmojiSelect}
                                    />

                                    <div className="flex  gap-1.5">
                                      <ThemeButton
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={cancelEditingReply}
                                        disabled={editingReplyId === reply.id}
                                        className=" disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Cancel
                                      </ThemeButton>

                                      <ThemeButton
                                        type="button"
                                        variant="primaryGradient"
                                        size="sm"
                                        onClick={() =>
                                          void handleSaveEditedReply(reply)
                                        }
                                        disabled={
                                          !editingMessagePlainText.trim() ||
                                          editingMessagePlainText.trim()
                                            .length >
                                            MAX_DISCUSSION_MESSAGE_LENGTH ||
                                          editingReplyId === reply.id
                                        }
                                        className="disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        {editingReplyId === reply.id
                                          ? 'Saving...'
                                          : 'Save'}
                                      </ThemeButton>
                                      {/* <button
                                      type="button"
                                      onClick={cancelEditingReply}
                                      disabled={editingReplyId === reply.id}
                                      className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSaveEditedReply(reply)
                                      }
                                      disabled={
                                        !editingMessage.trim() ||
                                        editingReplyId === reply.id
                                      }
                                      className="rounded-full bg-[#10175A] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {editingReplyId === reply.id
                                        ? 'Saving...'
                                        : 'Save'}
                                    </button> */}
                                    </div>
                                  </div>
                                </div>
                              ) : reply.message ? (
                                <div
                                  className={
                                    getCollageType(reply.attachments ?? []) &&
                                    (onDeleteReply || onEditReply) &&
                                    isCurrentUserReply
                                      ? 'pr-7'
                                      : undefined
                                  }
                                >
                                  <ExpandableMessageText
                                    message={reply.message}
                                    mentionedUserIds={
                                      reply.mentionedUserIds ?? []
                                    }
                                    mentionMembers={mentionMembers}
                                    isEdited={reply.isEdited}
                                    onOpenMedia={(mediaIndex) =>
                                      openGallery(
                                        conversationImages,
                                        conversationImages.findIndex(
                                          (item) =>
                                            item.attachmentId ===
                                            `${reply.id}:inline:${mediaIndex}`,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                              ) : null}

                              {editingMessageId !== reply.id &&
                              reply.attachments?.length &&
                              getCollageType(reply.attachments) ? (
                                <AttachmentCollage
                                  attachments={reply.attachments}
                                  onOpen={(attachment) =>
                                    openGallery(
                                      conversationImages,
                                      conversationImages.findIndex(
                                        (item) =>
                                          item.attachmentId === attachment.id,
                                      ),
                                    )
                                  }
                                  renderAction={
                                    onDeleteAttachment
                                      ? (attachment) => (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setAttachmentToDelete(attachment)
                                            }
                                            disabled={
                                              deletingAttachmentId ===
                                              attachment.id
                                            }
                                            aria-label={`Delete ${attachment.name}`}
                                            className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                                          >
                                            <AttachmentTrashIcon />
                                          </button>
                                        )
                                      : undefined
                                  }
                                />
                              ) : editingMessageId !== reply.id &&
                                reply.attachments?.length ? (
                                <div
                                  className={`grid gap-2 ${
                                    reply.attachments.length > 1 &&
                                    !hasOnlyAudioAttachments(reply.attachments)
                                      ? 'md:grid-cols-3'
                                      : ''
                                  } ${
                                    !reply.message &&
                                    reply.attachments.length > 1 &&
                                    !hasOnlyAudioAttachments(reply.attachments)
                                      ? 'rounded-xl  p-2'
                                      : 'p-2'
                                  } ${
                                    isCurrentUserReply
                                      ? 'rounded-tr-none'
                                      : 'rounded-tl-none'
                                  }`}
                                >
                                  {reply.attachments.map((attachment) => (
                                    <div
                                      key={attachment.id}
                                      className={`flex min-w-0 relative group w-full items-start gap-3 ${
                                        hasOnlyAudioAttachments(
                                          reply.attachments,
                                        )
                                          ? ''
                                          : 'rounded-xl bg-white p-2.5 transition hover:bg-gray-50'
                                      }`}
                                    >
                                      {(reply.attachments?.length === 1 ||
                                        hasOnlyAudioAttachments(
                                          reply.attachments,
                                        )) &&
                                      getAttachmentMediaType(
                                        attachment.extension,
                                      ) ? (
                                        <MediaAttachmentPreview
                                          attachment={attachment}
                                          onOpenVideo={() =>
                                            openGallery(
                                              conversationImages,
                                              conversationImages.findIndex(
                                                (item) =>
                                                  item.attachmentId ===
                                                  attachment.id,
                                              ),
                                            )
                                          }
                                        />
                                      ) : (
                                        <a
                                          href={getAttachmentUrl(
                                            attachment.storageKey,
                                          )}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex min-w-0 flex-1 items-start gap-3"
                                          onClick={(event) => {
                                            if (
                                              !isImageAttachment(
                                                attachment.extension,
                                              ) &&
                                              getAttachmentMediaType(
                                                attachment.extension,
                                              ) !== 'video'
                                            ) {
                                              return;
                                            }

                                            event.preventDefault();

                                            const index =
                                              conversationImages.findIndex(
                                                (image) =>
                                                  image.attachmentId ===
                                                  attachment.id,
                                              );

                                            openGallery(
                                              conversationImages,
                                              index,
                                            );
                                          }}
                                        >
                                          {isImageAttachment(
                                            attachment.extension,
                                          ) ? (
                                            <img
                                              alt={attachment.name}
                                              className={
                                                reply.attachments?.length === 1
                                                  ? 'h-64 w-87.5 max-w-full rounded-sm border border-gray-200 object-contain'
                                                  : 'h-10 w-10 rounded-sm border border-gray-200 object-cover'
                                              }
                                              src={getFileUrl(
                                                attachment.storageKey,
                                              )}
                                            />
                                          ) : (
                                            <AttachmentFileIcon
                                              extension={attachment.extension}
                                              storageKey={attachment.storageKey}
                                              name={attachment.name}
                                            />
                                          )}

                                          {(!isImageAttachment(
                                            attachment.extension,
                                          ) ||
                                            (reply.attachments?.length ?? 0) >
                                              1) && (
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-medium text-gray-700">
                                                {attachment.name}
                                              </p>

                                              {attachment.sizeLabel ? (
                                                <p className="text-sm text-gray-500">
                                                  {attachment.sizeLabel}
                                                </p>
                                              ) : null}
                                            </div>
                                          )}
                                        </a>
                                      )}
                                      <AttachmentDownloadButton
                                        attachment={attachment}
                                      />
                                      {onDeleteAttachment ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAttachmentToDelete(attachment)
                                          }
                                          disabled={
                                            deletingAttachmentId ===
                                            attachment.id
                                          }
                                          className="shrink-0 text-gray-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                          aria-label={`Delete ${attachment.name}`}
                                        >
                                          <AttachmentTrashIcon />
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            {(onDeleteReply || onEditReply) &&
                            isCurrentUserReply &&
                            editingMessageId !== reply.id ? (
                              <Menu
                                as="div"
                                className="absolute right-1.5 top-1.5 z-10"
                              >
                                <MenuButton
                                  type="button"
                                  disabled={
                                    deletingReplyId === reply.id ||
                                    editingReplyId === reply.id
                                  }
                                  aria-label="Message actions"
                                  className="
            flex h-6 w-6 items-center justify-center
            rounded-md text-gray-500 outline-none
            transition hover:bg-gray-100
            hover:text-gray-700
            disabled:cursor-not-allowed
            disabled:opacity-50
            opacity-100
            sm:opacity-0
            sm:group-hover/reply:opacity-100
            sm:data-open:opacity-100
            sm:focus:opacity-100
          "
                                >
                                  <ThreedotIcon />
                                </MenuButton>

                                <MenuItems
                                  anchor="bottom end"
                                  transition
                                  className="
            z-100 mt-1 w-32 origin-top-right
            rounded-lg border border-gray-200
            bg-white p-1
            shadow-[0_10px_30px_rgb(0_0_0/0.12)]
            outline-none transition duration-150
            data-closed:-translate-y-1
            data-closed:scale-95
            data-closed:opacity-0
          "
                                >
                                  {onEditReply &&
                                  reply.message.trim() &&
                                  reply.message.trim() !== 'Message deleted' ? (
                                    <MenuItem>
                                      <button
                                        type="button"
                                        disabled={editingReplyId === reply.id}
                                        onClick={() => startEditingReply(reply)}
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-gray-700 outline-none transition data-focus:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <EditPencilIcon />
                                        Edit
                                      </button>
                                    </MenuItem>
                                  ) : null}
                                  {onDeleteReply ? (
                                    <MenuItem>
                                      <button
                                        type="button"
                                        disabled={deletingReplyId === reply.id}
                                        onClick={() => {
                                          onDeleteReply(reply);
                                        }}
                                        className="
                flex w-full items-center gap-2
                rounded-md px-2.5 py-2
                text-left text-xs font-medium
                text-red-500 outline-none transition
                data-focus:bg-red-50
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
                                      >
                                        <TrashIcon width="16" height="16" />

                                        {deletingReplyId === reply.id
                                          ? 'Deleting...'
                                          : 'Delete'}
                                      </button>
                                    </MenuItem>
                                  ) : null}
                                </MenuItems>
                              </Menu>
                            ) : null}
                          </div>
                        ) : null}

                        {showReplyMeta ||
                        ((onDeleteReply || onEditReply) &&
                          isCurrentUserReply) ? (
                          <div className="mt-2 flex items-center gap-3">
                            {showReplyMeta ? (
                              <button
                                type="button"
                                onClick={() => onReplyClick?.(reply)}
                                disabled={!onReplyClick}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-gray-700"
                              >
                                <ReplyArrowIcon />
                                {reply.replyCount && reply.replyCount > 0
                                  ? `${reply.replyCount} ${reply.replyCount === 1 ? 'Reply' : 'Replies'}`
                                  : 'Reply'}
                              </button>
                            ) : null}
                            {/* {onDeleteReply && isCurrentUserReply ? (
                            <button
                              type="button"
                              onClick={() => onDeleteReply(reply)}
                              disabled={deletingReplyId === reply.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <AttachmentTrashIcon />
                              Delete
                            </button>
                          ) : null} */}
                          </div>
                        ) : null}
                      </div>
                      {isCurrentUserReply ? (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-100 text-xs font-bold text-purple-700">
                          {reply.author.initials}
                        </span>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
                <EmptyRepliesIcon />
                <p className="mt-2 sm:mt-4 text-base md:text-lg font-semibold text-gray-600">
                  {emptyTitle}
                </p>
                <p className="mt-1 sm:mt-2 text-xs text-gray-500">
                  {emptyDescription}
                </p>
              </div>
            )}
            <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
          </div>
        </div>

        {!canCompose && readOnlyNotice ? (
          <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            {readOnlyNotice}
          </div>
        ) : null}

        {canCompose ? (
          <div className="shrink-0 border-t border-gray-200  md:py-0 md:px-0">
            <div className="  bg-white p-2 border-hide">
              <RichTextEditor
                value={message}
                onChange={handleComposerChange}
                onEnter={() => {
                  if (!isRecordingVoice) {
                    void handleSubmit();
                  }
                }}
                placeholder={composerPlaceholder}
                disabled={isSubmittingReply}
                maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
                autoGrow
                autoGrowMaxHeight={320}
                showCharacterCount={false}
                mentionMembers={isComposerExpanded ? [] : mentionMembers}
                onAttachmentFilesAdded={handleInlineAttachmentPaste}
                onPastedAttachmentFilesAdded={handleInlineAttachmentPaste}
                toolbarEndAction={
                  <button
                    type="button"
                    onClick={() => setIsComposerExpanded(true)}
                    disabled={isSubmittingReply}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
                    aria-label="Expand message composer"
                  >
                    <ExpandComposerIcon />
                  </button>
                }
              />

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_ATTACHMENT_ACCEPT}
                multiple
                onChange={(event) =>
                  handleAttachmentChange(event.target.files ?? null)
                }
              />

              {/* {attachments.length ? (
                <div className="mt-3 flex items-center max-h-32 flex-wrap min-h-0 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 scrollbar-thin sm:grid-cols-2 lg:grid-cols-3">
                  {attachments.map((attachment) => (
                    <div
                      key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                      className="flex min-w-0 items-center gap-3 max-w-48 rounded-lg border border-gray-200 bg-gray-50 py-0.5 pr-2 pl-0.5"
                    >
                      {isVoiceNoteFile(attachment) ? (
                        <VoiceNotePreview file={attachment} />
                      ) : (
                        <>
                          <LocalAttachmentPreview file={attachment} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-700">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatAttachmentSize(attachment.size)}
                            </p>
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nextAttachments = attachments.filter(
                            (file) => file !== attachment,
                          );
                          setAttachments(nextAttachments);
                          if (!nextAttachments.length && fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        disabled={isSubmittingReply}
                        className="text-xs font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <TrashIcon width="16" height="16" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null} */}

              {attachmentError ? (
                <p className="mt-2 text-xs text-red-600">{attachmentError}</p>
              ) : null}
              {attachments.length ? (
                <div className="mt-3 mb-3 flex min-w-0 max-h-32 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-contain pr-1 scrollbar-thin md:hidden">
                  {attachments.map((attachment) => (
                    <div
                      key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                      className="flex min-w-0  w-65 shrink-0 items-center gap-3 max-w-48 rounded-lg border border-gray-200 bg-gray-50 py-0.5 pr-2 pl-0.5"
                    >
                      {isVoiceNoteFile(attachment) ? (
                        <VoiceNotePreview file={attachment} />
                      ) : (
                        <>
                          <LocalAttachmentPreview file={attachment} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-700">
                              {attachment.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatAttachmentSize(attachment.size)}
                            </p>
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const nextAttachments = attachments.filter(
                            (file) => file !== attachment,
                          );
                          setAttachments(nextAttachments);
                          if (!nextAttachments.length && fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                          focusComposer();
                        }}
                        disabled={isSubmittingReply}
                        className="text-xs font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <TrashIcon width="16" height="16" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div
                className={`flex items-end ${attachments.length === 0 ? 'justify-end' : 'justify-end md:justify-between'} gap-3`}
              >
                {attachments.length ? (
                  <div className="mt-3 hidden md:flex items-center max-h-32 flex-wrap min-h-0 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 scrollbar-thin sm:grid-cols-2 lg:grid-cols-3">
                    {attachments.map((attachment) => (
                      <div
                        key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                        className="flex min-w-0 items-center gap-3 max-w-48 rounded-lg border border-gray-200 bg-gray-50 py-0.5 pr-2 pl-0.5"
                      >
                        {isVoiceNoteFile(attachment) ? (
                          <VoiceNotePreview file={attachment} />
                        ) : (
                          <>
                            <LocalAttachmentPreview file={attachment} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-700">
                                {attachment.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatAttachmentSize(attachment.size)}
                              </p>
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const nextAttachments = attachments.filter(
                              (file) => file !== attachment,
                            );
                            setAttachments(nextAttachments);
                            if (
                              !nextAttachments.length &&
                              fileInputRef.current
                            ) {
                              fileInputRef.current.value = '';
                            }
                            focusComposer();
                          }}
                          disabled={isSubmittingReply}
                          className="text-xs font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <TrashIcon width="16" height="16" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {/* <div className="text-xs text-gray-500">
                  {canAttachFile ? ALLOWED_ATTACHMENT_HELPER_TEXT : null}
                </div> */}
                <div className="flex flex-col gap-1">
                  <div className="mt-1 text-right text-xs text-gray-500 md:block hidden">
                    {messagePlainText.length}/{MAX_DISCUSSION_MESSAGE_LENGTH}
                  </div>
                  <div className="flex items-center gap-2">
                    <EmojiPickerButton
                      disabled={isSubmittingReply}
                      onSelectEmoji={handleEmojiSelect}
                    />
                    {canAttachFile ? (
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmittingReply}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <PaperclipIcon width="20" height="20" />
                      </button>
                    ) : null}
                    {canAttachFile ? (
                      <VoiceRecorderButton
                        disabled={isSubmittingReply}
                        onRecorded={handleVoiceNoteRecorded}
                        onRecordingChange={setIsRecordingVoice}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={
                        (requireMessage
                          ? !hasRichTextContent(message)
                          : !hasRichTextContent(message) &&
                            !attachments.length) ||
                        messagePlainText.trim().length >
                          MAX_DISCUSSION_MESSAGE_LENGTH ||
                        isSubmittingReply ||
                        isRecordingVoice
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10175A] text-white disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={
                        isSubmittingReply ? 'Sending reply' : 'Send reply'
                      }
                    >
                      {isSubmittingReply ? <ButtonSpinner /> : <TelegramIcon />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <ExpandedDiscussionComposer
        isOpen={isComposerExpanded}
        onClose={closeExpandedComposer}
        value={message}
        onChange={handleComposerChange}
        placeholder={composerPlaceholder}
        mentionMembers={mentionMembers}
        attachments={attachments}
        onRemoveAttachment={removeRegularAttachment}
        onPasteAttachments={handleInlineAttachmentPaste}
        onSelectEmoji={handleEmojiSelect}
        onOpenAttachmentPicker={() => fileInputRef.current?.click()}
        onVoiceRecorded={handleVoiceNoteRecorded}
        onRecordingChange={setIsRecordingVoice}
        onSend={async () => {
          setLoading(true);
          try {
            await handleSubmit();
            setIsComposerExpanded(false);
          } finally {
            setLoading(false);
          }
        }}
        canAttachFile={canAttachFile}
        disabled={isSubmittingReply}
        sendDisabled={
          (requireMessage
            ? !hasRichTextContent(message)
            : !hasRichTextContent(message) && !attachments.length) ||
          messagePlainText.trim().length > MAX_DISCUSSION_MESSAGE_LENGTH ||
          isSubmittingReply ||
          isRecordingVoice
        }
        characterCount={messagePlainText.length}
        maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
      />

      <ExpandedMessageEditModal
        isOpen={isEditComposerExpanded && Boolean(editingMessageId)}
        onClose={() => setIsEditComposerExpanded(false)}
        value={editingMessage}
        onChange={handleEditMessageChange}
        onSelectEmoji={handleEditingEmojiSelect}
        onSave={async () => {
          const reply = replies.find((item) => item.id === editingMessageId);
          if (!reply) return;
          setLoading(true);
          try {
            await handleSaveEditedReply(reply);
            setIsEditComposerExpanded(false);
          } finally {
            setLoading(false);
          }
        }}
        onAddInlineAttachments={handleEditInlineAttachments}
        mentionMembers={mentionMembers}
        characterCount={editingMessagePlainText.length}
        maxLength={MAX_DISCUSSION_MESSAGE_LENGTH}
        disabled={editingReplyId === editingMessageId}
        saveDisabled={
          !editingMessagePlainText.trim() ||
          editingMessagePlainText.length > MAX_DISCUSSION_MESSAGE_LENGTH ||
          editingReplyId === editingMessageId
        }
      />

      <ConfirmActionModal
        isOpen={Boolean(attachmentToDelete)}
        onClose={() => setAttachmentToDelete(null)}
        title="Delete Attachment?"
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold">
              “{attachmentToDelete?.name ?? 'this attachment'}”
            </span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        isSubmitting={
          Boolean(attachmentToDelete) &&
          deletingAttachmentId === attachmentToDelete?.id
        }
        onConfirm={handleConfirmDeleteAttachment}
      />
      <ImageGalleryLightbox
        images={galleryImages}
        activeIndex={activeGalleryIndex}
        title={title}
        onClose={closeGallery}
        onSelect={selectGalleryImage}
        onPrevious={showPreviousGalleryImage}
        onNext={showNextGalleryImage}
      />
    </>
  );
}

function getAttachmentUrl(storageKey?: string) {
  if (typeof storageKey === 'string' && /^https?:\/\//i.test(storageKey)) {
    return storageKey;
  }

  if (!storageKey) {
    return '#';
  }

  const cloudfrontUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL?.trim() ?? '';
  const normalizedBaseUrl = cloudfrontUrl.replace(/\/+$/, '');
  const normalizedStorageKey = storageKey.replace(/^\/+/, '');

  return normalizedBaseUrl
    ? `${normalizedBaseUrl}/${normalizedStorageKey}`
    : '#';
}

function ExpandableMessageText({
  message,
  mentionedUserIds = [],
  mentionMembers = [],
  isEdited = false,
  onOpenMedia,
}: {
  message: string;
  mentionedUserIds?: string[];
  mentionMembers?: ProjectMember[];
  isEdited?: boolean;
  onOpenMedia?: (mediaIndex: number) => void;
}) {
  const richMessage = getSanitizedRichMessage(message);
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldShowToggle, setShouldShowToggle] = useState(false);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const overflowMeasureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = measureRef.current;
    const overflowElement = overflowMeasureRef.current;

    if (!element || !overflowElement) {
      return;
    }

    const updateOverflowState = () => {
      setShouldShowToggle(overflowElement.scrollHeight > 100 + 1);
    };

    updateOverflowState();

    const resizeObserver = new ResizeObserver(() => {
      updateOverflowState();
    });

    resizeObserver.observe(element);
    resizeObserver.observe(overflowElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [message]);

  return (
    <div className="relative">
      <div
        ref={measureRef}
        style={EMOJI_TEXT_STYLE}
        className={`text-sm font-normal break-words text-gray-900 ${
          isExpanded ? '' : 'max-h-[100px] overflow-hidden'
        }`}
      >
        {richMessage ? (
          <div
            className="rich-text-content"
            dangerouslySetInnerHTML={{ __html: richMessage }}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              const media = target.closest(
                'img, div[data-attachment-node][data-kind="video"]',
              );

              if (!media || !event.currentTarget.contains(media)) return;

              const mediaItems = Array.from(
                event.currentTarget.querySelectorAll(
                  'img, div[data-attachment-node][data-kind="video"]',
                ),
              );
              const mediaIndex = mediaItems.indexOf(media);

              if (mediaIndex >= 0) {
                event.preventDefault();
                onOpenMedia?.(mediaIndex);
              }
            }}
          />
        ) : (
          <p className="whitespace-pre-wrap">
            {renderHighlightedMentions(
              message,
              mentionedUserIds,
              mentionMembers,
            )}
          </p>
        )}
      </div>
      <div
        ref={overflowMeasureRef}
        aria-hidden="true"
        style={EMOJI_TEXT_STYLE}
        className="pointer-events-none invisible absolute inset-x-0 top-0 -z-10 w-full break-words text-sm font-normal text-gray-900"
      >
        {richMessage ? (
          <div
            className="rich-text-content"
            dangerouslySetInnerHTML={{ __html: richMessage }}
          />
        ) : (
          <p className="whitespace-pre-wrap">
            {renderHighlightedMentions(
              message,
              mentionedUserIds,
              mentionMembers,
            )}
          </p>
        )}
      </div>
      {isEdited ? (
        <p className="mt-1 text-[11px] font-medium text-gray-400">edited</p>
      ) : null}
      {shouldShowToggle ? (
        <button
          type="button"
          className="mt-1 text-sm font-medium text-[#8A38F5]"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'read less' : 'read more'}
        </button>
      ) : null}
    </div>
  );
}

function renderHighlightedMentions(
  message: string,
  mentionedUserIds: string[],
  mentionMembers: ProjectMember[],
) {
  if (!message || !mentionMembers.length) {
    return renderTextWithLinks(message);
  }

  const resolvedMentionedUserIds = Array.from(
    new Set([
      ...mentionedUserIds,
      ...getMentionedUserIdsFromPlainText(message, mentionMembers),
    ]),
  );

  if (!resolvedMentionedUserIds.length) {
    return renderTextWithLinks(message);
  }

  const mentionNames = Array.from(
    new Set(
      resolvedMentionedUserIds.flatMap((mentionedUserId) => {
        const member = mentionMembers.find(
          (entry) => entry.id === mentionedUserId,
        );

        if (!member?.fullName?.trim()) {
          return [];
        }

        const fullName = member.fullName.trim();
        const [firstWord] = fullName.split(/\s+/);

        return [fullName, firstWord].filter(Boolean);
      }),
    ),
  ).sort((left, right) => right.length - left.length);

  if (!mentionNames.length) {
    return message;
  }

  const escapedNames = mentionNames.map((name) =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const mentionRegex = new RegExp(
    `@(?:${escapedNames.join('|')})(?=\\b|$)`,
    'g',
  );

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of message.matchAll(mentionRegex)) {
    const matchIndex = match.index ?? 0;
    const matchedValue = match[0];

    if (matchIndex > lastIndex) {
      nodes.push(
        ...renderTextWithLinks(
          message.slice(lastIndex, matchIndex),
          `text-${lastIndex}`,
        ),
      );
    }

    nodes.push(
      <span
        key={`mention-${matchIndex}`}
        className="rounded-md bg-transparent px-1 py-0.5 font-medium text-[#3165F6]"
      >
        {matchedValue}
      </span>,
    );

    lastIndex = matchIndex + matchedValue.length;
  }

  if (lastIndex < message.length) {
    nodes.push(
      ...renderTextWithLinks(message.slice(lastIndex), `text-${lastIndex}`),
    );
  }

  return nodes.length ? nodes : message;
}

function renderTextWithLinks(text: string, keyPrefix = 'text') {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const matchIndex = match.index ?? 0;
    const matchedValue = match[0];

    if (matchIndex > lastIndex) {
      nodes.push(
        <span key={`${keyPrefix}-${lastIndex}`}>
          {text.slice(lastIndex, matchIndex)}
        </span>,
      );
    }

    nodes.push(
      <a
        key={`${keyPrefix}-link-${matchIndex}`}
        href={matchedValue}
        target="_blank"
        rel="noreferrer"
        className="text-[#3165F6] underline underline-offset-2"
      >
        {matchedValue}
      </a>,
    );

    lastIndex = matchIndex + matchedValue.length;
  }

  if (!nodes.length) {
    return [<span key={`${keyPrefix}-0`}>{text}</span>];
  }

  if (lastIndex < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-${lastIndex}`}>{text.slice(lastIndex)}</span>,
    );
  }

  return nodes;
}

export function EditPencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2.66667 11.9999L5.25074 11.6307C5.62957 11.5766 5.98162 11.4029 6.256 11.1333L12.3905 5.10753C13.2032 4.30916 13.2032 3.01472 12.3905 2.21635C11.5778 1.41798 10.2601 1.41798 9.44741 2.21635L3.31294 8.24213C3.03857 8.51176 2.86179 8.85792 2.80674 9.23016L2.66667 11.9999Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.66675 3L11.6667 5.94444"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getGalleryImagesFromAttachments(
  attachments: DiscussionAttachment[],
  authorName: string,
) {
  return attachments
    .filter(
      (attachment) =>
        isImageAttachment(attachment.extension) ||
        getAttachmentMediaType(attachment.extension) === 'video',
    )
    .map((attachment, index) => ({
      attachmentId: attachment.id,
      mediaType:
        getAttachmentMediaType(attachment.extension) === 'video'
          ? ('video' as const)
          : ('image' as const),
      storageKey: attachment.storageKey,
      fileName: attachment.name,
      src: getFileUrl(attachment.storageKey),
      alt: `${authorName} attachment ${index + 1}`,
    }));
}

function getGalleryImagesFromDiscussion(
  headerReply: DiscussionReply | null | undefined,
  replies: DiscussionReply[],
) {
  const images: GalleryImage[] = [];

  if (headerReply?.attachments?.length) {
    images.push(
      ...getGalleryImagesFromAttachments(
        headerReply.attachments,
        headerReply.author.name,
      ),
    );
  }

  if (headerReply?.message) {
    images.push(
      ...getGalleryImagesFromRichMessage(
        headerReply.message,
        headerReply.author.name,
        headerReply.id,
      ),
    );
  }

  replies.forEach((reply) => {
    if (reply.attachments?.length) {
      images.push(
        ...getGalleryImagesFromAttachments(
          reply.attachments,
          reply.author.name,
        ),
      );
    }

    if (reply.message) {
      images.push(
        ...getGalleryImagesFromRichMessage(
          reply.message,
          reply.author.name,
          reply.id,
        ),
      );
    }
  });

  return images;
}

function getGalleryImagesFromRichMessage(
  message: string,
  authorName: string,
  messageId: string,
): GalleryImage[] {
  if (typeof window === 'undefined' || !/<[a-z][\s\S]*>/i.test(message)) {
    return [];
  }

  const document = new DOMParser().parseFromString(
    normalizeDescriptionImageUrls(message),
    'text/html',
  );
  const media = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      'img, div[data-attachment-node][data-kind="video"]',
    ),
  );

  return media.flatMap((element, index) => {
    const isVideo = element.matches('div[data-kind="video"]');
    const source = isVideo
      ? element.dataset.src ||
        element.querySelector('video')?.getAttribute('src')
      : element.getAttribute('src');

    if (!source) return [];

    return [
      {
        attachmentId: `${messageId}:inline:${index}`,
        mediaType: isVideo ? ('video' as const) : ('image' as const),
        storageKey: element.dataset.storageKey,
        fileName:
          element.dataset.fileName || element.getAttribute('alt') || undefined,
        src: source,
        alt: `${authorName} content attachment ${index + 1}`,
      },
    ];
  });
}

function AttachmentFileIcon({
  extension,
  storageKey,
  name,
}: {
  extension?: string;
  storageKey?: string;
  name?: string;
}) {
  if (storageKey && getAttachmentMediaType(extension) === 'video') {
    return (
      <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-gray-200">
        <VideoThumbnail src={getFileUrl(storageKey)} label={name || 'Video'} />
      </span>
    );
  }
  const label = normalizeAttachmentExtension(extension);
  const badgeClassName = getAttachmentBadgeClassName(label);

  return (
    <span className="relative">
      <span
        className={`rounded-xs absolute top-4 px-0.75 pt-0.75 pb-0.5 text-[7.5px] font-bold uppercase leading-none! text-white ${badgeClassName}`}
      >
        {label}
      </span>
      <FileTypePlaceholder />
    </span>
  );
}

function normalizeAttachmentExtension(extension?: string) {
  const normalizedExtension = (extension ?? 'file')
    .replace(/^svg\+xml$/i, 'svg')
    .replace(/^application\//i, '')
    .replace(/^image\//i, '')
    .trim()
    .toUpperCase();

  if (normalizedExtension === 'JPEG') {
    return 'JPG';
  }

  return normalizedExtension.slice(0, 4) || 'FILE';
}

function isImageAttachment(extension?: string) {
  const normalizedExtension = extension?.trim().toLowerCase();

  return (
    normalizedExtension === 'png' ||
    normalizedExtension === 'svg' ||
    normalizedExtension === 'jpg' ||
    normalizedExtension === 'jpeg'
  );
}

function getAttachmentBadgeClassName(extension: string) {
  if (extension === 'PDF') return 'bg-red-500';
  if (extension === 'DOC' || extension === 'DOCX') return 'bg-blue-600';
  if (extension === 'XLS' || extension === 'XLSX') return 'bg-green-600';
  if (['PNG', 'JPG', 'JPEG', 'SVG'].includes(extension)) return 'bg-violet-500';
  if (extension === 'ZIP') return 'bg-gray-600';
  return 'bg-[#10175A]';
}

function mergeAttachmentFiles(currentFiles: File[], newFiles: File[]) {
  const fileMap = new Map<string, File>();

  [...currentFiles, ...newFiles].forEach((file) => {
    fileMap.set(getAttachmentFileKey(file), file);
  });

  return Array.from(fileMap.values());
}

function getAttachmentFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function getInlineAttachmentKeys(message: string) {
  const parsedMessage = new DOMParser().parseFromString(message, 'text/html');

  return new Set(
    Array.from(
      parsedMessage.querySelectorAll<HTMLElement>('[data-attachment-key]'),
    )
      .map((attachment) => attachment.dataset.attachmentKey ?? '')
      .filter(Boolean),
  );
}

function getRichTextPlainText(message: string) {
  if (!message) return '';

  return (
    new DOMParser().parseFromString(message, 'text/html').body.textContent ?? ''
  ).replace(/\u00a0/g, ' ');
}

function getSanitizedRichMessage(message: string) {
  if (!/<[a-z][\s\S]*>/i.test(message)) return '';

  return DOMPurify.sanitize(normalizeDescriptionImageUrls(message), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'div',
      'span',
      'video',
      'audio',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'src',
      'alt',
      'class',
      'data-storage-key',
      'data-attachment-node',
      'data-src',
      'data-file-name',
      'data-mime-type',
      'data-kind',
      'controls',
      'preload',
      'data-mention-id',
      'data-mention-label',
    ],
  });
}

function appendToRichText(message: string, text: string) {
  if (!message) return `<p>${text}</p>`;

  const parsedMessage = new DOMParser().parseFromString(message, 'text/html');
  const lastParagraph = parsedMessage.body.lastElementChild;

  if (lastParagraph?.tagName === 'P') {
    lastParagraph.append(document.createTextNode(text));
  } else {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    parsedMessage.body.append(paragraph);
  }

  return parsedMessage.body.innerHTML;
}

function getMentionedUserIdsFromRichText(message: string) {
  const parsedMessage = new DOMParser().parseFromString(message, 'text/html');

  return Array.from(
    new Set(
      Array.from(
        parsedMessage.querySelectorAll<HTMLElement>('[data-mention-id]'),
      )
        .map((mention) => mention.dataset.mentionId?.trim() ?? '')
        .filter(Boolean),
    ),
  );
}

function ChatStatusIcon({ status }: { status: 'sent' | 'read' }) {
  const strokeColor = status === 'read' ? '#304FFD' : '#98A2B3';

  return (
    <span
      className="inline-flex items-center"
      aria-label={status === 'read' ? 'Read' : 'Sent'}
      title={status === 'read' ? 'Read' : 'Sent'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.75 8.5L5.25 11L9.75 5.5"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.25 8.5L8.75 11L13.25 5.5"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function getFileExtension(fileName: string, mimeType?: string) {
  const extension = fileName.split('.').pop();

  if (extension && extension !== fileName) {
    return extension;
  }

  return mimeType?.split('/').pop() ?? 'file';
}

function formatAttachmentSize(sizeInBytes: number) {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
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

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
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

  return (
    <AttachmentFileIcon extension={getFileExtension(file.name, file.type)} />
  );
}

function AttachmentTrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.6667 3.99992V3.46659C10.6667 2.71985 10.6667 2.34648 10.5213 2.06126C10.3935 1.81038 10.1895 1.60641 9.93865 1.47858C9.65344 1.33325 9.28007 1.33325 8.53333 1.33325H7.46667C6.71993 1.33325 6.34656 1.33325 6.06135 1.47858C5.81046 1.60641 5.60649 1.81038 5.47866 2.06126C5.33333 2.34648 5.33333 2.71985 5.33333 3.46659V3.99992M6.66667 7.66658V10.9999M9.33333 7.66658V10.9999M2 3.99992H14M12.6667 3.99992V11.4666C12.6667 12.5867 12.6667 13.1467 12.4487 13.5746C12.2569 13.9509 11.951 14.2569 11.5746 14.4486C11.1468 14.6666 10.5868 14.6666 9.46667 14.6666H6.53333C5.41323 14.6666 4.85318 14.6666 4.42535 14.4486C4.04903 14.2569 3.74307 13.9509 3.55132 13.5746C3.33333 13.1467 3.33333 12.5867 3.33333 11.4666V3.99992"
        stroke="#A4A7AE"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon({ width = '24', height = '24' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.5 3.75C7.15279 3.75 5.25 5.65279 5.25 8V13.5001C5.25 17.228 8.27208 20.2501 12 20.2501C15.7279 20.2501 18.75 17.228 18.75 13.5001V12.0001C18.75 11.5859 19.0858 11.2501 19.5 11.2501C19.9142 11.2501 20.25 11.5859 20.25 12.0001V13.5001C20.25 18.0564 16.5563 21.7501 12 21.7501C7.44365 21.7501 3.75 18.0564 3.75 13.5001V8C3.75 4.82436 6.32436 2.25 9.5 2.25C12.6756 2.25 15.25 4.82436 15.25 8V13.5C15.25 15.2949 13.7949 16.75 12 16.75C10.2051 16.75 8.75 15.2949 8.75 13.5V9.5C8.75 9.08579 9.08579 8.75 9.5 8.75C9.91421 8.75 10.25 9.08579 10.25 9.5V13.5C10.25 14.4665 11.0335 15.25 12 15.25C12.9665 15.25 13.75 14.4665 13.75 13.5V8C13.75 5.65279 11.8472 3.75 9.5 3.75Z"
        fill="#020F52"
      />
    </svg>
  );
}

function refreshInlineAttachmentPreviewUrls(message: string, files: File[]) {
  const parsedMessage = new DOMParser().parseFromString(message, 'text/html');
  const filesByKey = new Map(
    files.map((file) => [getAttachmentFileKey(file), file]),
  );

  parsedMessage
    .querySelectorAll<HTMLElement>('[data-attachment-key]')
    .forEach((attachment) => {
      const file = filesByKey.get(attachment.dataset.attachmentKey ?? '');
      if (!file) return;
      const url = URL.createObjectURL(file);

      if (attachment instanceof HTMLImageElement) {
        attachment.src = url;
      } else {
        attachment.dataset.src = url;
        attachment.querySelector('video, audio')?.setAttribute('src', url);
        attachment.querySelector('a')?.setAttribute('href', url);
      }
    });

  return parsedMessage.body.innerHTML;
}

function ExpandComposerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.25413 9.37412C8.4063 9.36288 8.51811 9.36897 8.64224 9.47719C8.73151 9.55364 8.78667 9.66436 8.79497 9.78373C8.81352 10.0685 8.5523 10.2672 8.37216 10.4502L7.88774 10.9485L6.22259 12.6667C5.97309 12.9244 5.5949 13.2938 5.37112 13.5558C5.39121 13.5543 5.41132 13.5533 5.43143 13.5524C5.52006 13.5488 5.61541 13.5483 5.70529 13.5498C6.32238 13.5598 6.94653 13.5268 7.5616 13.567C7.62139 13.5709 7.70968 13.6295 7.75371 13.6727C7.84094 13.7582 7.89147 13.876 7.89408 14.0001C7.89599 14.1244 7.8411 14.2472 7.75641 14.3342C7.69683 14.3958 7.62022 14.437 7.53707 14.4519C7.4165 14.4731 7.21735 14.4683 7.09043 14.468L6.50608 14.4672L4.36005 14.4673C4.00141 14.4587 3.84925 14.2671 3.84913 13.9037C3.8489 13.2099 3.84816 12.5162 3.84824 11.8224L3.84862 11.155C3.84891 10.9334 3.81595 10.6004 3.9738 10.4357C4.0587 10.3469 4.17424 10.2965 4.29512 10.2954C4.41515 10.295 4.53021 10.3449 4.61383 10.4337C4.66898 10.4919 4.7164 10.5739 4.72507 10.654C4.75092 10.8927 4.74034 11.1741 4.74039 11.4155C4.74213 11.9086 4.74061 12.4017 4.73579 12.8948C4.81728 12.8257 4.95474 12.6758 5.03382 12.5941L5.57292 12.0374L7.32494 10.2309L7.77342 9.76659C7.91621 9.61879 8.05854 9.43788 8.25413 9.37412Z"
        fill="black"
      />
      <path
        d="M11.0702 3.31666C12.0664 3.29016 13.08 3.33202 14.0778 3.31522C14.6895 3.30491 14.661 3.67546 14.657 4.16897L14.6549 4.89519L14.6556 6.24334C14.6561 6.47443 14.6622 6.71102 14.6573 6.9412C14.6536 7.11163 14.634 7.25291 14.5076 7.37067C14.4202 7.45148 14.3051 7.49315 14.1879 7.4865C14.0712 7.48015 13.9617 7.42649 13.8832 7.33721C13.7611 7.19664 13.7645 7.03315 13.7705 6.85307C13.7919 6.20624 13.7436 5.52664 13.7742 4.88334C13.5523 5.09331 13.2906 5.37671 13.0747 5.59959L11.8331 6.87923L10.8791 7.86441C10.7337 8.01423 10.5696 8.19172 10.414 8.32967C10.3412 8.38443 10.2557 8.41286 10.1676 8.41749C9.8112 8.43658 9.57714 7.99274 9.79548 7.69976C9.90072 7.55854 10.0489 7.41983 10.1723 7.29259L10.8176 6.62795C11.5875 5.83531 12.3785 5.03251 13.1379 4.2304C13.0118 4.24012 12.8363 4.23591 12.707 4.23638L11.9375 4.23749L11.385 4.23753C11.2505 4.23745 11.1366 4.24006 10.9977 4.22485C10.65 4.19076 10.5009 3.7583 10.7109 3.48564C10.8001 3.36992 10.9342 3.32917 11.0702 3.31666Z"
        fill="black"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.8029 13.0897L9.80288 13.0896L8.02961 11.0735C7.15174 10.0754 7.04779 9.63681 7.10554 9.54226L7.77109 9.00624L10.4686 6.89628C10.6861 6.72615 10.7245 6.41191 10.5544 6.1944C10.3843 5.97689 10.07 5.93848 9.85253 6.10861L7.15216 8.22073L6.34009 8.88355C6.15052 9.08701 6.02962 9.43495 6.16147 9.92972C6.28453 10.3915 6.62968 11.0017 7.36459 11.8396L7.09316 12.3748C6.91786 12.6185 6.7551 12.8447 6.6053 12.9998C6.45646 13.1539 6.18601 13.3804 5.80932 13.3054C5.43759 13.2315 5.27077 12.9241 5.18818 12.7269C5.1043 12.5266 5.03326 12.255 4.95618 11.9602L4.62184 10.6826C4.43614 9.97294 4.37201 9.76896 4.25117 9.61882C4.23592 9.59987 4.22003 9.58156 4.20355 9.56391C4.07597 9.42731 3.8958 9.34325 3.23583 9.0787L3.19968 9.06421C2.54928 8.80352 2.01354 8.58879 1.63882 8.37781C1.27579 8.17341 0.883764 7.87625 0.838665 7.37487C0.831655 7.29695 0.831776 7.21852 0.839024 7.14062C0.885665 6.63934 1.27866 6.34344 1.64233 6.14025C2.01771 5.93051 2.55412 5.71755 3.20531 5.45903L3.20532 5.45903L11.1947 2.28701C12.0119 1.96253 12.6802 1.6972 13.2052 1.57623C13.7406 1.4529 14.2936 1.43984 14.7269 1.84067C15.1517 2.23359 15.2025 2.78712 15.1496 3.34498C15.0971 3.89847 14.9244 4.61828 14.7114 5.5062L13.0983 12.2309C12.9626 12.7969 12.848 13.2747 12.7105 13.6214C12.5717 13.9716 12.349 14.3478 11.8991 14.4667C11.4437 14.5871 11.0674 14.3627 10.7814 14.1206C10.5005 13.8829 10.1801 13.5186 9.8029 13.0897Z"
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

function ReplyArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.24935 4.0835L2.33398 7.00016L5.24935 9.91683"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.666 7H2.625"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// function EmptyRepliesIcon() {
//   return (
//     <svg
//       width="48"
//       height="48"
//       viewBox="0 0 48 48"
//       fill="none"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <path
//         opacity="0.4"
//         d="M20.1308 41.9077C21.4065 42.1474 22.7014 42.2675 24 42.2659C28.9628 42.2659 33.5038 40.5351 37 37.6698L9.43778 10C6.06626 13.4269 4 18.0436 4 23.1218C4 28.2014 6.06667 32.8168 9.43778 36.2419C10.18 36.996 10.6756 38.0263 10.4756 39.0868C10.1455 40.8206 9.39748 42.4379 8.30222 43.7858C11.1839 44.3221 14.1803 43.8392 16.75 42.4719C17.6584 41.9886 18.1125 41.7469 18.4331 41.6979C18.7536 41.6489 19.2127 41.7352 20.1308 41.9077Z"
//         fill="#6B7280"
//       />
//       <path
//         d="M24 5.5C20.9919 5.5 18.157 6.18357 15.6523 7.39323C14.9063 7.75351 14.0095 7.44083 13.6493 6.69485C13.289 5.94887 13.6017 5.05207 14.3476 4.69179C17.2535 3.28835 20.5339 2.5 24 2.5C35.8095 2.5 45.5 11.6768 45.5 23.1334C45.5 26.5935 44.6112 29.8567 43.0427 32.7205C42.6447 33.4471 41.7331 33.7136 41.0065 33.3156C40.2799 32.9177 40.0135 32.006 40.4115 31.2795C41.7464 28.8421 42.5 26.0726 42.5 23.1334C42.5 13.4575 34.2793 5.5 24 5.5Z"
//         fill="#6B7280"
//       />
//       <path
//         fillRule="evenodd"
//         clipRule="evenodd"
//         d="M2.93934 2.93934C3.52513 2.35355 4.47487 2.35355 5.06066 2.93934L45.0607 42.9393C45.6464 43.5251 45.6464 44.4749 45.0607 45.0607C44.4749 45.6464 43.5251 45.6464 42.9393 45.0607L37.2516 39.373C33.481 42.2005 28.8028 43.7555 23.9831 43.7555H23.943C22.5616 43.7555 21.1801 43.6357 19.8186 43.3759C19.6629 43.3491 19.5116 43.3223 19.3711 43.2974C18.9876 43.2295 18.6852 43.176 18.5973 43.176C18.5753 43.187 18.5202 43.216 18.4402 43.2581C18.2286 43.3695 17.8429 43.5725 17.436 43.7755C15.3138 44.8946 12.9512 45.4742 10.5887 45.4742L10.6488 45.4941C9.76781 45.4941 8.90688 45.4142 8.04595 45.2543C7.52539 45.1544 7.08492 44.7947 6.90473 44.2951C6.72453 43.7955 6.82465 43.236 7.14499 42.8363C8.086 41.6772 8.72669 40.2984 9.00699 38.7996C9.08708 38.3399 8.84681 37.7804 8.36629 37.2808C4.58223 33.4439 2.5 28.408 2.5 23.1123C2.5 18.1751 4.30987 13.481 7.62135 9.74267L2.93934 5.06066C2.35355 4.47487 2.35355 3.52513 2.93934 2.93934ZM9.74433 11.8657C6.99197 15.0237 5.4832 18.9765 5.4832 23.1323C5.4832 27.6486 7.26511 31.9052 10.4886 35.1825C11.6698 36.3815 12.2104 37.9003 11.9301 39.3591C11.7299 40.4582 11.3695 41.4974 10.869 42.4966C12.6509 42.4566 14.4328 41.997 16.0145 41.1577C17.1157 40.5781 17.6162 40.3183 18.1768 40.2184C18.7374 40.1385 19.278 40.2184 20.3191 40.4183C21.5404 40.6581 22.7618 40.758 23.9631 40.758C27.9855 40.758 31.8922 39.5028 35.0964 37.2177L9.74433 11.8657Z"
//         fill="#6B7280"
//       />
//     </svg>
//   );
// }
