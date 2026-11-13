/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import clsx from 'clsx';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import DOMPurify from 'dompurify';
import {
  hasRichTextContent,
  normalizeDescriptionImageUrls,
  replaceInlineAttachmentUrls,
  serializeDescriptionImagesForStorage,
} from '../../../../lib/tickets';
import TicketRepliesPanel from '../../../../components/discussion/TicketRepliesPanel';
import AppModal, {
  ModalPosition,
} from '../../../../components/modals/AppModal';
import ConfirmActionModal from '../../../../components/modals/ConfirmActionModal';
import {
  useTicketChat,
  type ChatChannel,
  type ChatMessage,
} from '../../../../components/hooks/useTicketChat';
import { useTicketReplies } from '../../../../components/hooks/useTicketReplies';
import { getSocket } from '../../../../lib/socket';
import Dropdown from '../../../../components/ui/ThemeDropDown';
import { appToast } from '../../../../components/toast/AppToast';
import { getTicketById, type TicketPerson } from '../tickets.data';
import {
  projectsQueryKey,
  useDeleteProjectFileMutation,
  useProjectNamesQuery,
} from '../../projects/projects.queries';
import MoveTicketModal from '../../../../components/modals/MoveTicketModal';
import { useMoveTicketProjectMutation } from '../../../../components/hooks/useMoveTicketProjectMutation';
import { usePermissions } from '../../../providers/PermissionProvider';
import { useAppLoader } from '../../../providers/AppLoaderProvider';
import { useAppSelector } from '../../../Redux/store';
import {
  BugIcon,
  AttachmentFileIcon,
  CalendarTabIcon,
  ChatIcon,
  DownloadIcon,
  EditIcon,
  EyeOpenedIcon,
  FeatureIcon,
  FilesTabIcon,
  FileTypePlaceholder,
  NotesTabIcon,
  PeopleIcon,
  ProjectsIcon,
  RepliesArrowIcon,
  ThreedotIcon,
  TimelineClockIcon,
  TrashIcon,
} from '../../../../../public/icons';
import { getFileUrl } from '../../../../components/projects/ProjectFilesPanel';
import Tooltip from '../../../../components/tooltip';
import Image from 'next/image';
import EmptyState from '../../../../components/EmptyState';
import PhoneActions from '../../../../components/ui/PhoneActions';
import ImageGalleryLightbox from '../../../../components/ui/ImageGalleryLightbox';
import type {
  DiscussionReaction,
  DiscussionReply,
} from '../../../../components/discussion/types';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { NotificationItem } from '@epc-crm/interfaces';
import { NotificationEntityType } from '@epc-crm/types';
import { eventEmitter } from '../../../../lib/event-emitter';
import {
  getAttachmentFileKey,
  uploadFilesDirectly,
  validateAttachments,
  type UploadedFileDto,
} from '../../../../lib/attachments';
import { isVoiceNoteFile } from '../../../../lib/voice-notes';
import { formatDateTime } from '../../../../lib/format';
// eslint-disable-next-line @nx/enforce-module-boundaries
import RichTextEditor from 'apps/frontend/src/components/RichTextEditor';
// eslint-disable-next-line @nx/enforce-module-boundaries
import TicketDescriptionModal from 'apps/frontend/src/components/modals/TicketDescriptionModal';
import { useDashboardHeaderAction } from '../../../../components/dashboard/dashboard-shell';
import { useIsMobile } from '../../../../components/hooks/useIsMobile';
const MAX_DESCRIPTION_LENGTH = 4000;
const TICKET_REPLIES_PAGE_SIZE = 30;

type GalleryImage = {
  attachmentId: string;
  storageKey?: string;
  fileName?: string;
  src: string;
  alt: string;
};

type TicketAttachmentToDelete = {
  attachmentId: string;
  projectFileId: string;
  name: string;
  storageKey?: string;
  fromDescription: boolean;
};

type TicketSidebarTabKey = 'quick-links' | 'timeline';

type TicketTimelineItem = {
  id: string;
  description: string;
  status: string;
  showStatusBadge: boolean;
  statusClassName: string;
  statusStyle?: React.CSSProperties;
  occurredAt: string;
};

export default function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const ticketId = String(params?.ticketId ?? '');
  const projectId = searchParams.get('projectId') ?? '';

  const currentUserId = useAppSelector((state) => state.auth.user?.id ?? '');
  const currentUser = useAppSelector((state) => state.auth.user);

  const currentUserName = currentUser?.fullName?.trim() || 'User';

  const currentUserInitials =
    currentUserName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'U';
  const userType = useAppSelector((state) => state.auth.user?.userType);
  const isExternalUser = userType === 'EXTERNAL';
  const { hasPermission } = usePermissions();
  const { setLoading } = useAppLoader();
  const canViewTicketDetail = hasPermission('tickets.view_detail');
  const canViewReplies = hasPermission('ticket_replies.view');
  const hasPostReplyClaim = hasPermission('ticket_replies.post');
  const canEditReplies = hasPermission('ticket_replies.edit');
  const canDeleteReplies = hasPermission('ticket_replies.delete');
  const canEditAssignee = hasPermission('tickets.edit_assignee');
  const canAttachReplyFiles = hasPermission('ticket_replies.attach_file');
  const canEditStatus = hasPermission('tickets.edit_status');
  const canChangeTicketProject = hasPermission('tickets.change_project');
  const canViewInternalChatBtn = hasPermission('tickets.internal_chat');
  const canViewProjectDetail = hasPermission('projects.view_detail');
  const canViewProjectThread = hasPermission('thread.view');
  const canViewProjectFiles = hasPermission('files.view');
  const canViewProjectCalendar = hasPermission('calendar.view_grid');
  const canViewProjectNotes = hasPermission('projects_notes.view_list');
  const canEditTitleDescription = hasPermission(
    'tickets.edit_title_description',
  );

  const fallbackTicket = useMemo(() => getTicketById(ticketId), [ticketId]);

  const ticketDetailQuery = useQuery({
    queryKey: ['ticket-detail', projectId, ticketId],
    queryFn: () => fetchTicketDetail(projectId, ticketId),
    enabled: Boolean(projectId && ticketId && canViewTicketDetail),
  });
  const projectNamesQuery = useProjectNamesQuery(canChangeTicketProject);
  const moveTicketProjectMutation = useMoveTicketProjectMutation();
  const [isMoveProjectOpen, setIsMoveProjectOpen] = useState(false);

  // Posting needs the role claim AND a relationship to this lead (assignee,
  // creator, mentioned, or the "reply on any lead" claim). The server decides
  // the second part and returns it as `canPost` on the lead detail.
  const canPostOnThisLead = ticketDetailQuery.data?.canPost !== false;
  const canPostReplies = hasPostReplyClaim && canPostOnThisLead;
  const postNotice =
    hasPostReplyClaim && !canPostOnThisLead
      ? 'You can view this lead, but only the assignee, its creator or a mentioned user can reply.'
      : undefined;

  const membersQuery = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => fetchProjectMembers(projectId),
    enabled: Boolean(projectId),
  });

  const ticketRepliesQuery = useInfiniteQuery({
    queryKey: ['ticket-replies', ticketId, currentUserId],
    initialPageParam: null as TicketRepliesCursor | null,
    queryFn: ({ pageParam }) =>
      fetchTicketReplies(
        ticketId,
        currentUserId,
        pageParam as TicketRepliesCursor | null,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.cursor ? lastPage.cursor : undefined,
    enabled: Boolean(ticketId && canViewReplies),
  });
  const ticketTimelineQuery = useQuery({
    queryKey: ['ticket-timeline', projectId, ticketId],
    queryFn: () => fetchTicketTimeline(projectId, ticketId),
    enabled: Boolean(projectId && ticketId && canViewTicketDetail),
  });
  const [replySocketToken, setReplySocketToken] =
    useState<SocketTokenResponse | null>(null);
  const [liveReplies, setLiveReplies] = useState<DiscussionReply[]>([]);

  const statusListQuery = useQuery({
    queryKey: ['ticket-statuses'],
    queryFn: fetchTicketStatuses,
    enabled: !isExternalUser,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async (payload: UpdateTicketRequest) => {
      const response = await fetch(
        `/api/projects/${projectId}/tickets/${ticketId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          Array.isArray(data?.message) && data.message.length
            ? data.message.join(', ')
            : data?.message || 'Failed to update lead.';
        throw new Error(message);
      }

      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ticket-detail', projectId, ticketId],
        }),
        invalidateTicketTimeline(),
        queryClient.invalidateQueries({
          queryKey: ['dashboard-project-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'recent-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'upcoming'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'critical-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'ticket-summary'],
          refetchType: 'all',
        }),
      ]);
      appToast.success('Lead updated successfully.');
    },
    onError: (error) => {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to update lead.',
      );
    },
  });
  const deleteProjectFileMutation = useDeleteProjectFileMutation();
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<TicketAttachmentToDelete | null>(null);
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false);
  const createReplyMutation = useMutation({
    mutationFn: async ({
      message,
      attachments,
      inlineAttachments,
      mentionedUserIds,
    }: {
      message: string;
      attachments: File[];
      inlineAttachments: File[];
      mentionedUserIds: string[];
    }) => {
      const filesToUpload = [...attachments, ...inlineAttachments];
      const uploadedFiles = filesToUpload.length
        ? await uploadFilesDirectly(filesToUpload, 'tickets/replies')
        : [];
      const uploadedAttachments = uploadedFiles.slice(0, attachments.length);
      const uploadedInlineAttachments = uploadedFiles.slice(attachments.length);
      const storedMessage = replaceInlineAttachmentUrls(
        message.trim(),
        inlineAttachments,
        uploadedInlineAttachments,
      );

      const response = await fetch(
        `/api/tickets/${ticketId}/replies?projectId=${encodeURIComponent(projectId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: storedMessage,
            mentionedUserIds,
            attachments: uploadedAttachments,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          Array.isArray(data?.message) && data.message.length
            ? data.message.join(', ')
            : data?.message || 'Failed to create reply.';
        throw new Error(errorMessage);
      }

      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ticket-replies', ticketId],
        }),
        invalidateTicketTimeline(),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'ticket-summary'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey,
          refetchType: 'all',
        }),
      ]);
      appToast.success('Reply posted successfully.');
    },
    onError: (error) => {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to create reply.',
      );
    },
  });
  const updateReplyMutation = useMutation({
    mutationFn: async ({
      replyId,
      message,
      mentionedUserIds,
    }: {
      replyId: string;
      message: string;
      mentionedUserIds: string[];
    }) => {
      const response = await fetch(
        `/api/tickets/${ticketId}/projects/${projectId}/reply/${replyId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            message: message.trim(),
            mentionedUserIds: mentionedUserIds
              .map((mentionedUserId) => mentionedUserId.trim())
              .filter((mentionedUserId) => mentionedUserId.length > 0),
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          Array.isArray(data?.message) && data.message.length
            ? data.message.join(', ')
            : data?.message || 'Failed to update reply.';
        throw new Error(errorMessage);
      }

      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ticket-replies', ticketId],
        }),
        invalidateTicketTimeline(),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'ticket-summary'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey,
          refetchType: 'all',
        }),
      ]);
      appToast.success('Reply updated successfully.');
    },
    onError: (error) => {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to update reply.',
      );
    },
  });
  const deleteReplyMutation = useMutation({
    mutationFn: async ({ replyId }: { replyId: string }) => {
      const response = await fetch(
        `/api/tickets/${ticketId}/projects/${projectId}/reply/${replyId}`,
        {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          Array.isArray(data?.message) && data.message.length
            ? data.message.join(', ')
            : data?.message || 'Failed to delete reply.';
        throw new Error(errorMessage);
      }

      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ticket-replies', ticketId],
        }),
        invalidateTicketTimeline(),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'ticket-summary'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey,
          refetchType: 'all',
        }),
      ]);
      appToast.success('Reply deleted successfully.');
    },
    onError: (error) => {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to delete reply.',
      );
    },
  });
  const toggleReplyReactionMutation = useMutation({
    mutationFn: async ({
      replyId,
      emoji,
      remove,
    }: {
      replyId: string;
      emoji: string;
      remove: boolean;
    }) => {
      const response = await fetch(
        `/api/tickets/${ticketId}/projects/${projectId}/reply/${replyId}/reactions`,
        {
          method: remove ? 'DELETE' : 'POST',
          headers: {
            Accept: 'application/json',
            ...(remove ? {} : { 'Content-Type': 'application/json' }),
          },
          body: remove ? undefined : JSON.stringify({ emoji }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          Array.isArray(data?.message) && data.message.length
            ? data.message.join(', ')
            : data?.message || 'Failed to update reply reaction.';
        throw new Error(errorMessage);
      }

      return { replyId, emoji, remove };
    },
    onError: (error) => {
      appToast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update reply reaction.',
      );
    },
  });

  const ticket = ticketDetailQuery.data ?? fallbackTicket;
  const isMobileDetailLayout = useIsMobile(1024);
  const isMobileContentLayout = useIsMobile(1280);
  const [mobileSection, setMobileSection] = useState<
    'replies' | 'timeline' | 'attachments' | 'people' | 'actions' | null
  >(null);
  const showMobileSection = isMobileDetailLayout && mobileSection !== null;
  const mobileSectionClass = (
    section: NonNullable<typeof mobileSection>,
    desktopClass: string,
  ) => {
    if (!showMobileSection) return desktopClass;

    return mobileSection === section
      ? 'flex h-full min-h-0 min-w-0 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white'
      : 'hidden';
  };
  const { setMobileTicketHeader } = useDashboardHeaderAction();
  const mobileHeaderTitle = canViewTicketDetail
    ? (ticket?.title ?? 'Lead details')
    : 'Lead details';
  const mobileHeaderId = canViewTicketDetail
    ? String(ticket?.ticketRefNo ?? ticket?.id ?? '')
    : '';

  useEffect(() => {
    setMobileTicketHeader({
      pathname,
      title: mobileHeaderTitle,
      id: mobileHeaderId,
      onBack: showMobileSection ? () => setMobileSection(null) : undefined,
    });

    return () => {
      setMobileTicketHeader(null);
    };
  }, [
    mobileHeaderId,
    mobileHeaderTitle,
    pathname,
    setMobileTicketHeader,
    showMobileSection,
  ]);

  const ticketTimelineItems = useMemo(
    () =>
      mapApiTicketTimelineToItems(
        ticketTimelineQuery.data ?? [],
        statusListQuery.data ?? [],
      ),
    [statusListQuery.data, ticketTimelineQuery.data],
  );
  const [chatDrawerChannel, setChatDrawerChannel] =
    useState<ChatChannel | null>(null);
  const [hasUnreadInternalChat, setHasUnreadInternalChat] = useState(false);
  const isChatDrawerOpen = Boolean(chatDrawerChannel);
  const internalChatParam = searchParams.get('internal');
  const shouldDefaultToInternalChat = false;
  const isInternalChatActive =
    canViewInternalChatBtn &&
    (internalChatParam === 'true' ||
      (internalChatParam !== 'false' && shouldDefaultToInternalChat));
  const updateInternalChatParam = (isActive: boolean) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (isActive === shouldDefaultToInternalChat) {
      nextSearchParams.delete('internal');
    } else {
      nextSearchParams.set('internal', isActive ? 'true' : 'false');
    }

    const nextQuery = nextSearchParams.toString();

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };
  const {
    messages: internalChatMessages,
    loading: internalChatLoading,
    loadingMore: internalChatLoadingMore,
    hasMore: internalChatHasMore,
    sendMessage: sendInternalChatMessage,
    markRead: markInternalChatRead,
    deleteMessage: deleteInternalChatMessage,
    updateMessage: updateInternalChatMessage,
    toggleReaction: toggleInternalChatReaction,
    loadOlderMessages: loadOlderInternalChatMessages,
  } = useTicketChat({
    projectId: isInternalChatActive ? projectId : '',
    ticketId: isInternalChatActive ? ticketId : '',
    channel: 'internal',
    enabled: isInternalChatActive && canViewInternalChatBtn,
  });
  const {
    messages: externalChatMessages,
    loading: externalChatLoading,
    sendMessage: sendExternalChatMessage,
    markRead: markExternalChatRead,
    deleteMessage: deleteExternalChatMessage,
    updateMessage: updateExternalChatMessage,
    toggleReaction: toggleExternalChatReaction,
  } = useTicketChat({
    projectId:
      isChatDrawerOpen && chatDrawerChannel === 'external' ? projectId : '',
    ticketId:
      isChatDrawerOpen && chatDrawerChannel === 'external' ? ticketId : '',
    channel: 'external',
    enabled: isChatDrawerOpen && chatDrawerChannel === 'external',
  });
  const isTicketLoading =
    Boolean(projectId && ticketId && canViewTicketDetail) &&
    ticketDetailQuery.isLoading &&
    !ticket;
  const [selectedStatus, setSelectedStatus] = useState('Open');
  const [selectedTicketType, setSelectedTicketType] = useState('Open');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [ticketSidebarTab, setTicketSidebarTab] =
    useState<TicketSidebarTabKey>('quick-links');
  const [isEditContentModalOpen, setIsEditContentModalOpen] = useState(false);

  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);

  const [shouldShowDescriptionToggle, setShouldShowDescriptionToggle] =
    useState(false);
  const descriptionContentRef = useRef<HTMLDivElement | null>(null);

  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [deletingChatMessageId, setDeletingChatMessageId] = useState('');
  const [deletingTicketReplyId, setDeletingTicketReplyId] = useState('');
  const [editingChatMessageId, setEditingChatMessageId] = useState('');
  const [editingTicketReplyId, setEditingTicketReplyId] = useState('');
  const [chatMessagePendingDelete, setChatMessagePendingDelete] = useState<{
    id: string;
    message: string;
    channel: ChatChannel;
  } | null>(null);
  const [ticketReplyPendingDelete, setTicketReplyPendingDelete] =
    useState<DiscussionReply | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(
    null,
  );
  const unreadListenerSocketRef = useRef<ReturnType<typeof getSocket> | null>(
    null,
  );

  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [descriptionAttachments, setDescriptionAttachments] = useState<File[]>(
    [],
  );
  const [isUploadingDescriptionImages, setIsUploadingDescriptionImages] =
    useState(false);
  const [contentModalMode, setContentModalMode] = useState<'view' | 'edit'>(
    'view',
  );
  const isContentViewMode =
    isMobileContentLayout && contentModalMode === 'view';
  const isSavingContent =
    updateTicketMutation.isPending || isUploadingDescriptionImages;

  useEffect(() => {
    if (!canViewReplies || !projectId || !ticketId) {
      setReplySocketToken(null);
      return;
    }

    let isDisposed = false;

    void fetchSocketToken()
      .then((token) => {
        if (!isDisposed) {
          setReplySocketToken(token);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setReplySocketToken(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [canViewReplies, projectId, ticketId]);

  useEffect(() => {
    if (!canViewReplies) {
      setLiveReplies([]);
      return;
    }

    const pagedReplies = flattenTicketRepliesPages(
      ticketRepliesQuery.data?.pages,
    );

    setLiveReplies(
      ticketRepliesQuery.data ? pagedReplies : (ticket?.replies ?? []),
    );
  }, [canViewReplies, ticket?.replies, ticketRepliesQuery.data?.pages]);

  useTicketReplies({
    projectId,
    ticketId,
    token: replySocketToken,
    enabled: canViewReplies,
    onCreated: () => {
      void queryClient.invalidateQueries({
        queryKey: ['ticket-replies', ticketId],
      });
    },
    onUpdated: () => {
      void queryClient.invalidateQueries({
        queryKey: ['ticket-replies', ticketId],
      });
    },
    onReacted: () => {
      void queryClient.invalidateQueries({
        queryKey: ['ticket-replies', ticketId],
      });
    },
    onDeleted: () => {
      void queryClient.invalidateQueries({
        queryKey: ['ticket-replies', ticketId],
      });
    },
  });

  const statusOptions = useMemo(
    () =>
      (statusListQuery.data ?? []).map((status) => ({
        label: status.label,
        value: status.key,
        icon: (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: status.color }}
          />
        ),
      })),
    [statusListQuery.data],
  );

  const assigneeOptions = useMemo(
    () =>
      (membersQuery.data ?? []).map((member) => ({
        label: member.fullName,
        value: member.id,
      })),
    [membersQuery.data],
  );

  const selectedAssigneeId = useMemo(() => {
    if (!ticket) {
      return '';
    }

    return (
      assigneeOptions.find((option) => option.label === selectedAssignee)
        ?.value ??
      ticket.assigneeId ??
      ''
    );
  }, [assigneeOptions, selectedAssignee, ticket]);

  const ticketAttachmentGalleryImages = useMemo(
    () => buildTicketAttachmentGalleryImages(ticket?.attachments ?? []),
    [ticket?.attachments],
  );

  const invalidateTicketTimeline = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['ticket-timeline', projectId, ticketId],
    });
  };

  const invalidateTicketRelated = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['ticket-detail', projectId, ticketId],
      }),
      invalidateTicketTimeline(),
      queryClient.invalidateQueries({
        queryKey: ['dashboard-project-tickets'],
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: ['project-tickets'],
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'recent-tickets'],
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'upcoming'],
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'critical-tickets'],
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'ticket-summary'],
        refetchType: 'all',
      }),
    ]);
  };
  const normalizedDescription = useMemo(() => {
    const description = normalizeDescriptionImageUrls(
      ticket?.description?.trim() ?? '',
    );
    const activeAttachmentStorageKeys = new Set(
      (ticket?.attachments ?? [])
        .map((attachment) => attachment.storageKey)
        .filter((storageKey): storageKey is string => Boolean(storageKey)),
    );

    return removeMissingDescriptionAttachments(
      description,
      activeAttachmentStorageKeys,
    );
  }, [ticket?.description, ticket?.attachments]);
  const sanitizedDescription = useMemo(() => {
    const description = normalizedDescription;

    if (!description) {
      return '';
    }

    return DOMPurify.sanitize(description, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'h1',
        'h2',
        'h3',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'strike',
        'code',
        'pre',
        'blockquote',
        'ul',
        'ol',
        'li',
        'hr',
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
        'title',
        'class',
        'data-storage-key',
        'data-attachment-node',
        'data-src',
        'data-file-name',
        'data-mime-type',
        'data-kind',
        'controls',
        'preload',
      ],
    });
  }, [normalizedDescription]);
  const hasDescriptionContent = useMemo(() => {
    if (!sanitizedDescription) {
      return false;
    }

    return hasRichTextContent(sanitizedDescription);
  }, [sanitizedDescription]);

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setSelectedStatus(ticket.status);
    setSelectedTicketType(ticket.ticketType ?? '');
    setSelectedAssignee(ticket.assigneeDetail?.name ?? '');
    setTitleDraft(ticket.title);
    setDescriptionDraft(normalizedDescription);
  }, [normalizedDescription, ticket]);

  useEffect(() => {
    /* empty */
  }, [sanitizedDescription]);

  useEffect(() => {
    const descriptionElement = descriptionContentRef.current;

    if (!descriptionElement || !hasDescriptionContent) {
      setShouldShowDescriptionToggle(false);
      return;
    }

    const measureOverflow = () => {
      setShouldShowDescriptionToggle(
        descriptionElement.scrollHeight > descriptionElement.clientHeight + 1,
      );
    };

    const animationFrameId = window.requestAnimationFrame(measureOverflow);

    const resizeObserver = new ResizeObserver(() => {
      measureOverflow();
    });

    resizeObserver.observe(descriptionElement);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [sanitizedDescription, hasDescriptionContent]);

  useEffect(() => {
    if (!projectId || !ticketId || !currentUserId) {
      setHasUnreadInternalChat(false);
      return;
    }

    let isDisposed = false;

    const syncUnreadState = async () => {
      const [internalUnread] = await Promise.all([
        canViewInternalChatBtn
          ? fetchUnreadIndicator(projectId, ticketId, 'internal')
          : Promise.resolve(false),
      ]);

      if (isDisposed) {
        return;
      }

      setHasUnreadInternalChat(internalUnread);
    };

    void syncUnreadState().catch(() => {
      // Keep the ticket detail page usable if unread bootstrap fails.
    });

    return () => {
      isDisposed = true;
    };
  }, [canViewInternalChatBtn, currentUserId, projectId, ticketId]);

  useEffect(() => {
    if (!projectId || !ticketId || !currentUserId) {
      return;
    }

    let isDisposed = false;
    let cleanup: (() => void) | undefined;

    const connectUnreadListener = async () => {
      const socketToken = await fetchSocketToken();

      if (isDisposed) {
        return;
      }

      const socket = getSocket('chat', socketToken);
      unreadListenerSocketRef.current = socket;

      const joinUnreadRooms = () => {
        if (canViewInternalChatBtn) {
          socket.emit('join', { projectId, ticketId, channel: 'internal' });
        }
      };

      const handleNewMessage = (payload: {
        channel: ChatChannel;
        message: ChatMessage;
      }) => {
        if (payload.message.senderId === currentUserId) {
          return;
        }

        if (payload.channel === 'internal') {
          setHasUnreadInternalChat(true);
        }
      };

      socket.on('connect', joinUnreadRooms);
      socket.on('new_message', handleNewMessage);

      if (socket.connected) {
        joinUnreadRooms();
      }

      cleanup = () => {
        if (canViewInternalChatBtn) {
          socket.emit('leave', { projectId, ticketId, channel: 'internal' });
        }

        socket.off('connect', joinUnreadRooms);
        socket.off('new_message', handleNewMessage);
        unreadListenerSocketRef.current = null;
      };
    };

    void connectUnreadListener().catch(() => {
      // Keep the ticket detail page usable if background socket sync fails.
    });

    return () => {
      isDisposed = true;

      if (cleanup) {
        cleanup();
      }
    };
  }, [
    canViewInternalChatBtn,
    currentUserId,
    isInternalChatActive,
    projectId,
    ticketId,
  ]);

  useEffect(() => {
    if (
      isChatDrawerOpen ||
      isInternalChatActive ||
      !unreadListenerSocketRef.current
    ) {
      return;
    }

    if (canViewInternalChatBtn) {
      unreadListenerSocketRef.current.emit('join', {
        projectId,
        ticketId,
        channel: 'internal',
      });
    }
  }, [
    canViewInternalChatBtn,
    isChatDrawerOpen,
    isInternalChatActive,
    projectId,
    ticketId,
  ]);

  useEffect(() => {
    if (
      !isInternalChatActive ||
      !currentUserId ||
      !internalChatMessages.length
    ) {
      return;
    }

    const unreadMessageIds = internalChatMessages
      .filter(
        (message) => !message.isRead && message.senderId !== currentUserId,
      )
      .map((message) => message.id);

    if (!unreadMessageIds.length) {
      return;
    }

    setHasUnreadInternalChat(false);

    void markInternalChatRead(unreadMessageIds).catch(() => {
      // Keep the UI responsive if read-receipt sync fails.
    });
  }, [
    currentUserId,
    internalChatMessages,
    isInternalChatActive,
    markInternalChatRead,
  ]);

  useEffect(() => {
    if (
      !isChatDrawerOpen ||
      chatDrawerChannel !== 'external' ||
      !currentUserId ||
      !externalChatMessages.length
    ) {
      return;
    }

    const unreadMessageIds = externalChatMessages
      .filter(
        (message) => !message.isRead && message.senderId !== currentUserId,
      )
      .map((message) => message.id);

    if (!unreadMessageIds.length) {
      return;
    }

    void markExternalChatRead(unreadMessageIds).catch(() => {
      // Keep the UI responsive if read-receipt sync fails.
    });
  }, [
    chatDrawerChannel,
    currentUserId,
    externalChatMessages,
    isChatDrawerOpen,
    markExternalChatRead,
  ]);

  // Event listener
  useEffect(() => {
    const handleNotificationNew = (payload: NotificationItem) => {
      if (
        payload.entityType === NotificationEntityType.PROJECT ||
        payload.entityType === NotificationEntityType.TICKET
      ) {
        void invalidateTicketRelated();
      }
    };

    eventEmitter.on('notification:new', handleNotificationNew);

    return () => {
      eventEmitter.off('notification:new', handleNotificationNew);
    };
  }, []);

  // If access to this very lead was revoked (mention removed, remark deleted,
  // reassigned), leave the page instead of showing stale cached data.
  const refetchTicketDetail = ticketDetailQuery.refetch;
  useEffect(() => {
    const handleLeadAccessChanged = async (payload: { ticketId?: string }) => {
      if (payload?.ticketId !== ticketId) return;

      const result = await refetchTicketDetail();
      if (result.isError) {
        appToast.info('You no longer have access to this lead.');
        router.replace('/tickets');
      }
    };

    eventEmitter.on('lead:access-changed', handleLeadAccessChanged);

    return () => {
      eventEmitter.off('lead:access-changed', handleLeadAccessChanged);
    };
  }, [ticketId, refetchTicketDetail, router]);

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

  const selectGalleryImage = (index: number) => {
    setActiveGalleryIndex(index);
  };

  const showPreviousGalleryImage = () => {
    setActiveGalleryIndex((current) =>
      current === null || !galleryImages.length
        ? current
        : (current - 1 + galleryImages.length) % galleryImages.length,
    );
  };

  const showNextGalleryImage = () => {
    setActiveGalleryIndex((current) =>
      current === null || !galleryImages.length
        ? current
        : (current + 1) % galleryImages.length,
    );
  };

  if (!canViewTicketDetail) {
    return (
      <div className="space-y-4 h-full py-8 pe-4">
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-10 shadow-[0_0_35px_0_rgb(0_0_0/0.04)]">
          <EmptyState
            imageUrl="/images/RecentTicketEmpty.svg"
            imageAlt="Leads detail not found"
            title="You do not have permission to view lead details."
            // description="Recent tickets will appear here once they are created."
            buttonLabel="Go Back"
            onButtonClick={() => router.back()}
          />
        </div>
      </div>
    );
  }

  if (isTicketLoading) {
    return <TicketDetailSkeleton />;
  }

  if (!ticket) {
    return (
      <div className="space-y-4 h-full py-8 pe-4">
        <div className="rounded-3xl h-full border border-gray-200 bg-white px-6 py-10 shadow-[0_0_35px_0_rgb(0_0_0/0.04)]">
          <EmptyState
            imageUrl="/images/RecentTicketEmpty.svg"
            imageAlt="Leads detail not found "
            title="Leads detail not found"
            buttonLabel="Go Back"
            onButtonClick={() => router.back()}
          />
        </div>
      </div>
    );
  }

  const handleStatusChange = async (value: string) => {
    if (!canEditStatus) {
      return;
    }

    setSelectedStatus(value);

    await updateTicketMutation.mutateAsync(
      buildUpdateTicketPayload({
        title: ticket.title,
        description: ticket.description,
        statusKey: value,
        ticketType: selectedTicketType,
        assigneeId: selectedAssigneeId,
      }),
    );
  };

  const handleAssigneeChange = async (value: string) => {
    if (!canEditAssignee) {
      return;
    }

    const selectedOption = assigneeOptions.find(
      (option) => option.value === value,
    );
    setSelectedAssignee(selectedOption?.label ?? '');

    await updateTicketMutation.mutateAsync(
      buildUpdateTicketPayload({
        title: ticket.title,
        description: ticket.description,
        statusKey: selectedStatus,
        ticketType: selectedTicketType,
        assigneeId: value,
      }),
    );
  };

  const handleSubmitReply = async ({
    message,
    attachments,
    inlineAttachments,
    mentionedUserIds,
  }: {
    message: string;
    attachments: File[];
    inlineAttachments: File[];
    mentionedUserIds: string[];
  }) => {
    if (!canPostReplies) {
      return;
    }

    await createReplyMutation.mutateAsync({
      message,
      attachments,
      inlineAttachments,
      mentionedUserIds,
    });
  };

  const handleOpenProjectQuickLink = (
    tab?: 'thread' | 'files' | 'calendar' | 'notes',
  ) => {
    if (!projectId || !canViewProjectDetail) {
      return;
    }

    const nextSearchParams = new URLSearchParams();

    if (tab === 'thread') {
      nextSearchParams.set('t', '1');
    } else if (tab === 'files') {
      nextSearchParams.set('t', '2');
    } else if (tab === 'calendar') {
      nextSearchParams.set('t', '3');
    } else if (tab === 'notes') {
      nextSearchParams.set('t', '4');
    }

    const queryString = nextSearchParams.toString();

    router.push(
      queryString
        ? `/projects/${projectId}?${queryString}`
        : `/projects/${projectId}`,
    );
  };

  const handleEditTicketReply = async ({
    reply,
    message,
    inlineAttachments,
    mentionedUserIds,
  }: {
    reply: DiscussionReply;
    message: string;
    inlineAttachments: File[];
    mentionedUserIds: string[];
  }) => {
    try {
      setEditingTicketReplyId(reply.id);
      const uploadedInlineAttachments = inlineAttachments.length
        ? await uploadFilesDirectly(inlineAttachments, 'tickets/replies')
        : [];
      const storedMessage = replaceInlineAttachmentUrls(
        message.trim(),
        inlineAttachments,
        uploadedInlineAttachments,
      );

      setLiveReplies((current) =>
        current.map((currentReply) =>
          currentReply.id === reply.id
            ? {
                ...currentReply,
                message: storedMessage,
                mentionedUserIds,
                isEdited: true,
                updatedAt: new Date().toISOString(),
              }
            : currentReply,
        ),
      );

      await updateReplyMutation.mutateAsync({
        replyId: reply.id,
        message: storedMessage,
        mentionedUserIds,
      });
    } finally {
      setEditingTicketReplyId('');
    }
  };

  const handleSubmitChatMessage = async ({
    message,
    attachments,
    inlineAttachments,
    mentionedUserIds,
    channel,
    sendMessage,
  }: {
    message: string;
    attachments: File[];
    inlineAttachments: File[];
    mentionedUserIds: string[];
    channel: ChatChannel;
    sendMessage: (payload: {
      message: string;
      messageType?: 'text' | 'attachment';
      attachmentUrl?: string;
      attachmentUrls?: string[];
      attachmentName?: string;
      attachmentSize?: number;
      mentionedUserIds?: string[];
    }) => Promise<ChatMessage>;
  }) => {
    try {
      setIsSendingChatMessage(true);

      const trimmedMessage = message.trim();

      if (attachments.length || inlineAttachments.length) {
        const filesToUpload = [...attachments, ...inlineAttachments];
        const uploadedFiles = await uploadChatAttachments(
          filesToUpload,
          ticketId,
          channel,
        );
        const uploadedAttachments = uploadedFiles.slice(0, attachments.length);
        const uploadedInlineAttachments = uploadedFiles.slice(
          attachments.length,
        );
        const storedMessage = replaceInlineAttachmentUrls(
          trimmedMessage,
          inlineAttachments,
          uploadedInlineAttachments,
        );
        const attachmentUrls = uploadedAttachments
          .map((file) => buildAttachmentUrl(file.storageKey))
          .filter((url) => Boolean(url));

        await sendMessage({
          message:
            storedMessage ||
            (attachments.every(isVoiceNoteFile)
              ? attachmentUrls.length === 1
                ? 'Sent a voice note'
                : `Sent ${attachmentUrls.length} voice notes`
              : `Sent ${attachmentUrls.length} attachment${
                  attachmentUrls.length === 1 ? '' : 's'
                }`),
          messageType: attachmentUrls.length ? 'attachment' : 'text',
          attachmentUrls: attachmentUrls.length ? attachmentUrls : undefined,
          mentionedUserIds,
        });
      } else if (trimmedMessage) {
        await sendMessage({
          message: trimmedMessage,
          messageType: 'text',
          mentionedUserIds,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['dashboard', 'ticket-summary'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: projectsQueryKey,
          refetchType: 'all',
        }),
      ]);
    } catch (error) {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to send message.',
      );
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const handleStartEditingContent = () => {
    if (!isMobileContentLayout && !canEditTitleDescription) return;

    setTitleDraft(ticket.title);
    setDescriptionDraft(normalizedDescription);
    setDescriptionAttachments([]);
    setContentModalMode(isMobileContentLayout ? 'view' : 'edit');
    setIsEditContentModalOpen(true);
  };

  const handleCancelEditingContent = () => {
    if (isSavingContent) return;

    setTitleDraft(ticket.title);
    setDescriptionDraft(normalizedDescription);
    setDescriptionAttachments([]);
    setContentModalMode('view');
    setIsEditContentModalOpen(false);
  };

  const handleDescriptionAttachmentFilesAdded = (files: File[]) => {
    const nextAttachments = mergeAttachmentFiles(descriptionAttachments, files);
    const validationError = validateAttachments(nextAttachments);

    if (validationError) {
      appToast.error(validationError);
      return false;
    }

    const addedFilesCount =
      nextAttachments.length - descriptionAttachments.length;
    setDescriptionAttachments(nextAttachments);

    if (addedFilesCount === 1) {
      appToast.success(
        `${nextAttachments[nextAttachments.length - 1].name} added successfully.`,
      );
    } else if (addedFilesCount > 1) {
      appToast.success(`${addedFilesCount} files added successfully.`);
    } else {
      appToast.info('This file has already been added.');
    }

    return true;
  };

  const handleDescriptionDraftChange = (value: string) => {
    const inlineAttachmentKeys = getInlineAttachmentKeys(value);

    setDescriptionDraft(value);
    setDescriptionAttachments((currentAttachments) =>
      currentAttachments.filter((file) =>
        inlineAttachmentKeys.has(getAttachmentFileKey(file)),
      ),
    );
  };

  const handleSaveTicketContent = async () => {
    if (!canEditTitleDescription) {
      return;
    }

    const nextTitle = titleDraft.trim();
    const draftDescription = descriptionDraft.trim();
    const currentDescription = normalizedDescription.trim();
    const currentDescriptionStorageKeys =
      getDescriptionAttachmentStorageKeys(currentDescription);
    const draftDescriptionStorageKeys =
      getDescriptionAttachmentStorageKeys(draftDescription);
    const descriptionAttachmentsChanged =
      descriptionAttachments.length > 0 ||
      !setsAreEqual(currentDescriptionStorageKeys, draftDescriptionStorageKeys);

    if (!nextTitle) {
      appToast.error('Title is required.');
      return;
    }

    if (
      nextTitle === ticket.title &&
      draftDescription === currentDescription &&
      !descriptionAttachments.length
    ) {
      setIsEditContentModalOpen(false);
      return;
    }

    setIsUploadingDescriptionImages(true);
    setLoading(true);
    let uploadedAttachments: UploadedFileDto[];

    try {
      uploadedAttachments = descriptionAttachments.length
        ? await uploadFilesDirectly(
            descriptionAttachments,
            `projects/${projectId}/tickets/${ticketId}`,
          )
        : [];
    } catch (error) {
      appToast.error(
        error instanceof Error
          ? error.message
          : 'Failed to upload description image.',
      );
      setIsUploadingDescriptionImages(false);
      setLoading(false);
      return;
    }

    try {
      const nextDescription = replaceInlineAttachmentUrls(
        draftDescription,
        descriptionAttachments,
        uploadedAttachments,
      );
      const updatePayload = buildUpdateTicketPayload({
        title: nextTitle,
        description: nextDescription,
        statusKey: selectedStatus,
        ticketType: selectedTicketType,
        assigneeId: selectedAssigneeId,
      });

      if (descriptionAttachmentsChanged) {
        const nextDescriptionStorageKeys =
          getDescriptionAttachmentStorageKeys(nextDescription);
        const retainedAttachments = ticket.attachments
          .filter(
            (attachment) =>
              attachment.storageKey &&
              nextDescriptionStorageKeys.has(attachment.storageKey),
          )
          .map((attachment) => ({
            storageKey: attachment.storageKey as string,
            originalName: attachment.name,
            mimeType: attachment.mimeType || 'application/octet-stream',
            sizeBytes: Number(attachment.sizeBytes),
            fromDescription: true,
          }))
          .filter(
            (attachment) =>
              Number.isFinite(attachment.sizeBytes) && attachment.sizeBytes > 0,
          );
        const newDescriptionAttachments = uploadedAttachments.map(
          (attachment) => ({
            ...attachment,
            fromDescription: true,
          }),
        );

        updatePayload.attachments = deduplicateUploadedFilesByStorageKey([
          ...retainedAttachments,
          ...newDescriptionAttachments,
        ]);
      }

      await updateTicketMutation.mutateAsync(updatePayload);

      setDescriptionAttachments([]);
      setIsEditContentModalOpen(false);
    } catch {
      // The mutation reports its own error toast.
    } finally {
      setIsUploadingDescriptionImages(false);
      setLoading(false);
    }
  };

  const handleDeleteChatMessage = (reply: { id: string; message: string }) => {
    setChatMessagePendingDelete({
      ...reply,
      channel: isInternalChatActive ? 'internal' : 'external',
    });
  };

  const handleDeleteTicketReply = (reply: DiscussionReply) => {
    setTicketReplyPendingDelete(reply);
  };

  const handleConfirmDeleteChatMessage = async () => {
    if (!chatMessagePendingDelete) {
      return;
    }

    try {
      setDeletingChatMessageId(chatMessagePendingDelete.id);
      if (chatMessagePendingDelete.channel === 'internal') {
        await deleteInternalChatMessage(chatMessagePendingDelete.id);
      } else {
        await deleteExternalChatMessage(chatMessagePendingDelete.id);
      }
      appToast.success('Message deleted successfully.');
    } catch (error) {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to delete message.',
      );
    } finally {
      setDeletingChatMessageId('');
      setChatMessagePendingDelete(null);
    }
  };

  const handleConfirmDeleteTicketReply = async () => {
    if (!ticketReplyPendingDelete) {
      return;
    }

    const replyId = ticketReplyPendingDelete.id;

    try {
      setDeletingTicketReplyId(replyId);
      setLiveReplies((current) =>
        current.filter((reply) => reply.id !== replyId),
      );
      await deleteReplyMutation.mutateAsync({ replyId });
      setTicketReplyPendingDelete(null);
    } catch (error) {
      await queryClient.invalidateQueries({
        queryKey: ['ticket-replies', ticketId],
      });
      throw error;
    } finally {
      setDeletingTicketReplyId('');
    }
  };

  const handleEditChatMessage = async ({
    reply,
    message,
    mentionedUserIds,
    updateMessage,
  }: {
    reply: DiscussionReply;
    message: string;
    mentionedUserIds: string[];
    updateMessage: (
      messageId: string,
      payload: {
        message: string;
        messageType?: 'text' | 'attachment';
        attachmentUrls?: string[];
        attachmentName?: string;
        attachmentSize?: number;
        mentionedUserIds?: string[];
      },
    ) => Promise<ChatMessage>;
  }) => {
    try {
      setEditingChatMessageId(reply.id);
      await updateMessage(reply.id, {
        message: message.trim(),
        mentionedUserIds,
      });
      appToast.success('Message updated successfully.');
    } catch (error) {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to update message.',
      );
      throw error;
    } finally {
      setEditingChatMessageId('');
    }
  };
  const handleViewAttachment = (
    attachment: (typeof ticket.attachments)[number],
  ) => {
    if (isImageAttachmentExtension(attachment.extension)) {
      const index = ticketAttachmentGalleryImages.findIndex(
        (image) => image.attachmentId === attachment.id,
      );

      openGallery(ticketAttachmentGalleryImages, index);
      return;
    }

    const attachmentUrl = getAttachmentUrl(attachment.storageKey);

    if (attachmentUrl) {
      window.open(attachmentUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownloadAttachment = (
    attachment: (typeof ticket.attachments)[number],
  ) => {
    if (!attachment.storageKey) {
      return;
    }

    const searchParams = new URLSearchParams({
      storageKey: attachment.storageKey,
      fileName: attachment.name,
    });

    const link = document.createElement('a');

    link.href = `/api/projects/files/download?${searchParams.toString()}`;
    link.download = attachment.name;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleRequestDeleteAttachment = (
    attachment: (typeof ticket.attachments)[number],
  ) => {
    setAttachmentToDelete({
      attachmentId: attachment.id,
      projectFileId: attachment.id,
      name: attachment.name,
      storageKey: attachment.storageKey,
      fromDescription: attachment.fromDescription === true,
    });
  };
  const handleConfirmDeleteAttachment = async () => {
    if (!attachmentToDelete) {
      return;
    }

    setIsDeletingAttachment(true);

    try {
      await deleteProjectFileMutation.mutateAsync({
        projectId,
        fileId: attachmentToDelete.projectFileId,
      });

      let descriptionCleanupFailed = false;

      if (attachmentToDelete.fromDescription && attachmentToDelete.storageKey) {
        const nextDescription = removeDescriptionAttachment(
          normalizedDescription,
          attachmentToDelete.storageKey,
        );

        try {
          await updateTicketDescription(projectId, ticketId, nextDescription);
        } catch {
          descriptionCleanupFailed = true;
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ['ticket-detail', projectId, ticketId],
      });

      setAttachmentToDelete(null);

      if (descriptionCleanupFailed) {
        appToast.error(
          'The attachment was deleted, but its description content could not be saved. It will remain hidden.',
        );
      } else {
        appToast.success('Attachment deleted successfully.');
      }
    } catch (error) {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to delete attachment.',
      );
    } finally {
      setIsDeletingAttachment(false);
    }
  };
  const applyReplyReactionOptimisticUpdate = (
    replies: DiscussionReply[],
    replyId: string,
    emoji: string,
    remove: boolean,
  ) =>
    replies.map((reply) => {
      if (reply.id !== replyId) {
        return reply;
      }

      const currentReactions = reply.reactions ?? [];
      const currentUserReaction = currentReactions.find(
        (reaction) => reaction.reactedByCurrentUser,
      );
      let nextReactions = currentReactions.map((reaction) => ({ ...reaction }));

      if (
        currentUserReaction &&
        (!remove || currentUserReaction.emoji !== emoji)
      ) {
        nextReactions = decrementDiscussionReaction(
          nextReactions,
          currentUserReaction.emoji,
          currentUserId,
        );
      }

      if (!remove) {
        nextReactions = incrementDiscussionReaction(
          nextReactions,
          emoji,
          currentUserId,
        );
      }

      return {
        ...reply,
        reactions: nextReactions,
      };
    });

  const handleToggleTicketReplyReaction = async (
    reply: DiscussionReply,
    emoji: string,
  ) => {
    const remove = Boolean(
      reply.reactions?.some(
        (reaction) => reaction.emoji === emoji && reaction.reactedByCurrentUser,
      ),
    );
    const previousReplies = liveReplies;

    setLiveReplies((current) =>
      applyReplyReactionOptimisticUpdate(current, reply.id, emoji, remove),
    );

    try {
      await toggleReplyReactionMutation.mutateAsync({
        replyId: reply.id,
        emoji,
        remove,
      });
    } catch (error) {
      setLiveReplies(previousReplies);
      throw error;
    }
  };

  const handleToggleChatMessageReaction = async (
    reply: DiscussionReply,
    emoji: string,
    channel: ChatChannel,
  ) => {
    const remove = Boolean(
      reply.reactions?.some(
        (reaction) => reaction.emoji === emoji && reaction.reactedByCurrentUser,
      ),
    );

    if (channel === 'internal') {
      await toggleInternalChatReaction({
        messageId: reply.id,
        emoji,
        remove,
      });
      return;
    }

    await toggleExternalChatReaction({
      messageId: reply.id,
      emoji,
      remove,
    });
  };

  const handleMoveTicketProject = async (targetProjectId: string) => {
    if (!projectId || !canChangeTicketProject) return;

    try {
      setLoading(true);
      await moveTicketProjectMutation.mutateAsync({
        ticketId,
        sourceProjectId: projectId,
        targetProjectId,
      });
      const targetProject = projectNamesQuery.data?.find(
        (project) => project.id === targetProjectId,
      );
      appToast.success(
        targetProject
          ? `Lead moved to ${targetProject.name} successfully.`
          : 'Lead moved successfully.',
      );
      setIsMoveProjectOpen(false);

      const nextSearchParams = new URLSearchParams(searchParams.toString());
      nextSearchParams.set('projectId', targetProjectId);
      router.replace(`${pathname}?${nextSearchParams.toString()}`, {
        scroll: false,
      });
    } catch (error) {
      appToast.error(
        error instanceof Error ? error.message : 'Failed to move lead.',
      );
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-100 h-full overflow-hidden pb-0 xl:h-dvh xl:px-0 xl:py-5 xl:pr-5">
      <div
        className={
          showMobileSection
            ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 pt-3'
            : 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain scrollbar-hide xl:overflow-hidden xl:rounded-2xl xl:border xl:border-white xl:bg-white/40 xl:p-3'
        }
      >
        <div
          className={
            showMobileSection
              ? 'hidden'
              : "relative flex w-full shrink-0 flex-col gap-2 overflow-hidden rounded-none bg-[url('/images/DashboardComponentBgImage.jpg')] bg-cover bg-center bg-no-repeat px-4 pt-4 pb-2 xl:flex-row xl:items-center xl:gap-4 xl:rounded-xl xl:px-7.5 xl:py-6"
          }
        >
          {/* Background overlay */}
          <div
            className="absolute inset-0 bg-black/30 z-10"
            aria-hidden="true"
          />
          <div className="relative flex xl:flex-row xl:items-center items-start flex-col min-w-0  gap-3  z-20  w-full">
            <button
              className="mr-3 hidden lg:block"
              onClick={() => router.back()}
            >
              <Image
                alt={''}
                src="/images/bannerBackBtn.svg"
                width={48}
                height={48}
                className="h-10 w-10 shrink-0 backdrop-blur-3xl drop-shadow xl:h-12 xl:w-12"
              />
            </button>

            <div className="hidden  gap-4 w-full xl:grid sm:grid-cols-6">
              <MetaItem
                label="Lead ID"
                value={`${ticket.ticketRefNo ?? ticket.id}`}
              />

              <MetaItem label="Created on" value={ticket.date} />
              <MetaItem
                label="Created By"
                value={(ticket as any).createdByDetail?.name ?? 'Unknown'}
              />

              <MetaItem
                label="Project"
                hideTooltip={false}
                value={ticket.project.name}
              />

              <MetaItem
                label="Contact"
                hideTooltip={false}
                value={
                  ticket.contact
                    ? ticket.contact.fullName
                      ? `${ticket.contact.fullName} (${ticket.contact.phone})`
                      : ticket.contact.phone
                    : '—'
                }
                actions={
                  ticket.contact ? (
                    <PhoneActions phone={ticket.contact.phone} variant="dark" />
                  ) : undefined
                }
              />
            </div>
            <div className="xl:hidden  flex flex-col gap-4 w-full">
              <div className="grid grid-cols-3 gap-4">
                <MetaItem
                  label="Lead ID"
                  value={`${ticket.ticketRefNo ?? ticket.id}`}
                />

                <MetaItem label="Created on" value={ticket.date} />
                <MetaItem
                  label="Created By"
                  value={(ticket as any).createdByDetail?.name ?? 'Unknown'}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MetaItem
                  label="Project"
                  hideTooltip={false}
                  value={ticket.project.name}
                />

                <MetaItem
                  label="Contact"
                  hideTooltip={false}
                  value={
                    ticket.contact
                      ? ticket.contact.fullName
                        ? `${ticket.contact.fullName} (${ticket.contact.phone})`
                        : ticket.contact.phone
                      : '—'
                  }
                  actions={
                    ticket.contact ? (
                      <PhoneActions
                        phone={ticket.contact.phone}
                        variant="dark"
                      />
                    ) : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className={
            showMobileSection
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'min-h-0 min-w-0 flex-none hidden overflow-visible lg:block xl:flex-1 xl:overflow-hidden'
          }
        >
          <div
            className={
              showMobileSection
                ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                : 'grid h-auto min-h-0 min-w-0 grid-cols-1 gap-4 overflow-visible xl:h-full xl:grid-cols-12 xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden'
            }
          >
            <div
              className={
                showMobileSection
                  ? mobileSection === 'replies'
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                    : 'hidden'
                  : 'flex h-auto min-w-0 flex-col space-y-4 overflow-visible xl:col-span-9 xl:h-full xl:min-h-0 xl:overflow-hidden'
              }
            >
              <section
                className={
                  showMobileSection
                    ? 'hidden'
                    : 'rounded-xl border border-gray-200 bg-white p-3 md:p-5'
                }
              >
                <div className=" relative">
                  <div className="mb-2 flex absolute top-0 inset-e-0 items-start justify-end">
                    {canEditTitleDescription ? (
                      <button
                        type="button"
                        onClick={handleStartEditingContent}
                        className="inline-flex h-9 w-9 items-center justify-center  rounded-full bg-white text-gray-700 transition hover:bg-gray-50"
                        aria-label="Edit lead content"
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                  </div>

                  <div className="block w-full text-left">
                    <h2 className="pr-10 text-base font-semibold leading-8 text-gray-900 md:text-xl ">
                      {ticket.title}
                    </h2>
                  </div>

                  <div className="mt-2 max-h-52 w-full overflow-y-auto text-left tiny-scrollbar">
                    {hasDescriptionContent ? (
                      <>
                        <div
                          ref={descriptionContentRef}
                          className="rich-text-content line-clamp-2 text-sm text-gray-700"
                          dangerouslySetInnerHTML={{
                            __html: sanitizedDescription,
                          }}
                        />

                        {shouldShowDescriptionToggle ? (
                          <button
                            type="button"
                            onClick={() => setIsDescriptionModalOpen(true)}
                            className="mt-1 inline-flex cursor-pointer text-sm font-medium text-[#8A38F5]"
                          >
                            ... read more
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-gray-700">Add description</p>
                    )}
                  </div>
                </div>
              </section>
              <div
                className={
                  showMobileSection
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                    : 'h-auto min-h-0 flex-none overflow-visible xl:h-full xl:flex-1 xl:overflow-hidden'
                }
              >
                {canViewReplies || canViewInternalChatBtn ? (
                  <TicketRepliesPanel
                    title={
                      isInternalChatActive && canViewInternalChatBtn
                        ? 'Internal Chat'
                        : 'Replies'
                    }
                    mentionMembers={membersQuery.data ?? []}
                    headerAction={
                      canViewInternalChatBtn ? (
                        <label className="inline-flex items-center gap-2 sborder border-gray-200">
                          {hasUnreadInternalChat && !isInternalChatActive ? (
                            <span className=" h-2.5 w-2.5 rounded-full border border-white bg-green-500 animate-pulse" />
                          ) : null}
                          <span className="text-xs font-medium text-gray-600">
                            Internal Chat
                          </span>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={isInternalChatActive}
                            aria-label="Toggle internal chat"
                            onClick={() => {
                              const nextIsInternalChat = !isInternalChatActive;

                              updateInternalChatParam(nextIsInternalChat);

                              if (nextIsInternalChat) {
                                setHasUnreadInternalChat(false);
                              }
                            }}
                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition ${
                              isInternalChatActive
                                ? 'bg-[#3B82F6]'
                                : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                isInternalChatActive
                                  ? 'translate-x-5'
                                  : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </label>
                      ) : null
                    }
                    replies={
                      isInternalChatActive && canViewInternalChatBtn
                        ? internalChatMessages.map((message) =>
                            mapChatMessageToDiscussionReply(
                              message,
                              currentUserId,
                            ),
                          )
                        : canViewReplies
                          ? liveReplies
                          : []
                    }
                    hasMoreReplies={
                      isInternalChatActive && canViewInternalChatBtn
                        ? internalChatHasMore
                        : canViewReplies
                          ? Boolean(ticketRepliesQuery.hasNextPage)
                          : false
                    }
                    isLoadingMoreReplies={
                      isInternalChatActive && canViewInternalChatBtn
                        ? internalChatLoadingMore
                        : canViewReplies
                          ? ticketRepliesQuery.isFetchingNextPage
                          : false
                    }
                    onLoadMoreReplies={
                      isInternalChatActive && canViewInternalChatBtn
                        ? loadOlderInternalChatMessages
                        : canViewReplies && ticketRepliesQuery.hasNextPage
                          ? async () => {
                              await ticketRepliesQuery.fetchNextPage();
                            }
                          : undefined
                    }
                    emptyTitle={
                      isInternalChatActive && canViewInternalChatBtn
                        ? internalChatLoading
                          ? 'Loading internal chat...'
                          : 'No messages yet.'
                        : ticketRepliesQuery.isLoading
                          ? 'Loading replies...'
                          : 'No replies yet.'
                    }
                    emptyDescription={
                      isInternalChatActive && canViewInternalChatBtn
                        ? internalChatLoading
                          ? 'Fetching internal chat history.'
                          : 'Start the internal conversation on this lead.'
                        : ticketRepliesQuery.isLoading
                          ? 'Fetching lead replies.'
                          : 'No responses have been added to this lead yet.'
                    }
                    canCompose={
                      isInternalChatActive && canViewInternalChatBtn
                        ? canPostReplies
                        : canPostReplies
                    }
                    canAttachFile={canAttachReplyFiles}
                    readOnlyNotice={postNotice}
                    isSubmittingReply={
                      isInternalChatActive && canViewInternalChatBtn
                        ? isSendingChatMessage
                        : createReplyMutation.isPending
                    }
                    onSubmitReply={
                      isInternalChatActive && canViewInternalChatBtn
                        ? canPostReplies
                          ? (payload) =>
                              handleSubmitChatMessage({
                                ...payload,
                                channel: 'internal',
                                sendMessage: sendInternalChatMessage,
                              })
                          : undefined
                        : canPostReplies
                          ? handleSubmitReply
                          : undefined
                    }
                    requireMessage={false}
                    currentUserId={currentUserId}
                    onDeleteReply={
                      isInternalChatActive && canViewInternalChatBtn
                        ? canDeleteReplies
                          ? handleDeleteChatMessage
                          : undefined
                        : canDeleteReplies
                          ? handleDeleteTicketReply
                          : undefined
                    }
                    onEditReply={
                      isInternalChatActive && canViewInternalChatBtn
                        ? canEditReplies
                          ? ({ reply, message, mentionedUserIds }) =>
                              handleEditChatMessage({
                                reply,
                                message,
                                mentionedUserIds,
                                updateMessage: updateInternalChatMessage,
                              })
                          : undefined
                        : canEditReplies
                          ? handleEditTicketReply
                          : undefined
                    }
                    onToggleReaction={
                      isInternalChatActive && canViewInternalChatBtn
                        ? (reply, emoji) =>
                            handleToggleChatMessageReaction(
                              reply,
                              emoji,
                              'internal',
                            )
                        : !isInternalChatActive && canViewReplies
                          ? handleToggleTicketReplyReaction
                          : undefined
                    }
                    deletingReplyId={
                      isInternalChatActive && canViewInternalChatBtn
                        ? deletingChatMessageId
                        : deletingTicketReplyId
                    }
                    editingReplyId={
                      isInternalChatActive && canViewInternalChatBtn
                        ? editingChatMessageId
                        : editingTicketReplyId
                    }
                    composerPlaceholder={
                      isInternalChatActive && canViewInternalChatBtn
                        ? 'Write a message, press @ to mention'
                        : ticket.createdByDetail?.name
                          ? `Write to ${ticket.createdByDetail.name}, press @ to mention`
                          : 'Write a reply, press @ to mention'
                    }
                  />
                ) : null}
              </div>
            </div>
            <aside
              className={
                showMobileSection
                  ? mobileSection === 'replies'
                    ? 'hidden'
                    : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                  : 'h-auto min-h-0 min-w-0 space-y-4 overflow-visible scrollbar-hide xl:col-span-3 xl:h-full xl:overflow-y-auto'
              }
            >
              <section
                className={mobileSectionClass(
                  'actions',
                  'rounded-xl border border-gray-200 bg-white',
                )}
              >
                <h3 className="border-b border-gray-200 px-3 py-3 text-sm font-semibold text-gray-900 md:text-base">
                  Actions
                </h3>

                <div className="space-y-2 p-3 sm:p-4">
                  {canChangeTicketProject ? (
                    <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2 2xl:grid-cols-2 2xl:gap-4">
                      <span className="text-sm font-normal text-black">
                        Change Project
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsMoveProjectOpen(true)}
                        disabled={moveTicketProjectMutation.isPending}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate">{ticket.project.name}</span>
                        <span className="shrink-0 text-gray-900">
                          <ChevronRightSmallIcon />
                        </span>
                      </button>
                    </div>
                  ) : null}
                  <div className="grid items-center grid-cols-[60px_minmax(0,1fr)] 2xl:grid-cols-2 gap-2 2xl:gap-4">
                    <span className="text-sm text-black font-normal">
                      Status
                    </span>
                    <Dropdown
                      options={statusOptions}
                      value={selectedStatus}
                      disabled={
                        updateTicketMutation.isPending || !canEditStatus
                      }
                      onChange={handleStatusChange}
                      applyHeight={false}
                    />
                  </div>
                  <div className="grid items-center grid-cols-[60px_minmax(0,1fr)] 2xl:grid-cols-2 gap-2 2xl:gap-4">
                    <span className="text-sm text-black font-normal">
                      Agent
                    </span>

                    <Dropdown
                      options={assigneeOptions}
                      value={selectedAssigneeId}
                      disabled={
                        updateTicketMutation.isPending || !canEditAssignee
                      }
                      onChange={handleAssigneeChange}
                    />
                  </div>
                </div>
              </section>
              {isMobileDetailLayout ? (
                <section className={mobileSectionClass('timeline', 'hidden')}>
                  <h3 className="shrink-0 border-b border-gray-200 px-4 py-3 text-base font-medium text-gray-900">
                    Lead Timeline
                  </h3>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <TicketTimeline items={ticketTimelineItems} />
                  </div>
                </section>
              ) : projectId && canViewProjectDetail ? (
                <section className="rounded-xl border border-gray-200 bg-white">
                  <div className=" px-3 py-3">
                    <div className="relative grid w-full grid-cols-2 gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)]">
                      <div
                        className="absolute top-1 bottom-1 left-0 rounded-full bg-white shadow-[0_0_25px_0_rgb(27_28_29/0.12)] transition-all duration-300 ease-out"
                        style={{
                          width: 'calc(50% - 0.375rem)',
                          left:
                            ticketSidebarTab === 'quick-links'
                              ? '0.25rem'
                              : 'calc(50% + 0.125rem)',
                          opacity: 1,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setTicketSidebarTab('quick-links')}
                        className={`relative z-10 w-full rounded-full px-4 py-1.25 text-sm font-medium transition-colors duration-300 ${
                          ticketSidebarTab === 'quick-links'
                            ? 'text-gray-950'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Quick Links
                      </button>
                      <button
                        type="button"
                        onClick={() => setTicketSidebarTab('timeline')}
                        className={`relative z-10 w-full rounded-full px-4 py-1.25 text-sm font-medium transition-colors duration-300 ${
                          ticketSidebarTab === 'timeline'
                            ? 'text-gray-950'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        Lead Timeline
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    {ticketSidebarTab === 'quick-links' ? (
                      <div>
                        <QuickLinkButton
                          label="Go to Project"
                          iconBg="bg-blue-500"
                          icon={
                            <ProjectsIcon
                              opacity="0"
                              fill="white"
                              width="22"
                              height="18"
                            />
                          }
                          onClick={() => handleOpenProjectQuickLink()}
                        />
                        {canViewProjectThread ? (
                          <QuickLinkButton
                            label="Thread"
                            iconBg="bg-purple-500"
                            icon={
                              <ChatIcon fill="white" width="16" height="16" />
                            }
                            onClick={() => handleOpenProjectQuickLink('thread')}
                          />
                        ) : null}
                        {canViewProjectFiles ? (
                          <QuickLinkButton
                            label="Files"
                            iconBg="bg-warning-500"
                            icon={
                              <FilesTabIcon
                                fill="white"
                                width="16"
                                height="16"
                              />
                            }
                            onClick={() => handleOpenProjectQuickLink('files')}
                          />
                        ) : null}
                        {canViewProjectCalendar ? (
                          <QuickLinkButton
                            label="Calendar"
                            iconBg="bg-green-500"
                            icon={
                              <CalendarTabIcon
                                fill="white"
                                width="16"
                                height="16"
                              />
                            }
                            onClick={() =>
                              handleOpenProjectQuickLink('calendar')
                            }
                          />
                        ) : null}
                        {canViewProjectNotes ? (
                          <QuickLinkButton
                            label="Notes"
                            iconBg="bg-rose-500"
                            icon={
                              <NotesTabIcon
                                fill="white"
                                width="16"
                                height="16"
                              />
                            }
                            onClick={() => handleOpenProjectQuickLink('notes')}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <div className="px-4 py-4">
                        <TicketTimeline items={ticketTimelineItems} />
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 px-3 py-3">
                    <div className="flex items-center rounded-full border border-gray-200 bg-gray-50 p-1 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)]">
                      <span className="w-full rounded-full bg-white px-4 py-1.5 text-center text-sm font-medium text-gray-950 shadow-[0_0_20px_rgba(15,23,42,0.08)]">
                        Lead Timeline
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-4">
                    <TicketTimeline items={ticketTimelineItems} />
                  </div>
                </section>
              )}

              <section
                className={mobileSectionClass(
                  'attachments',
                  'rounded-xl border border-gray-200 bg-white',
                )}
              >
                <h3 className="border-b border-gray-200 px-3 py-3 text-sm font-semibold text-gray-900 sm:px-4 md:text-base">
                  Attachments
                </h3>

                <div className="">
                  {ticket.attachments.length ? (
                    ticket.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleViewAttachment(attachment)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }

                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleViewAttachment(attachment);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-200 px-4 py-3 transition last:border-b-0 hover:bg-gray-50"
                      >
                        {isImageAttachmentExtension(attachment.extension) ? (
                          <img
                            alt={attachment.name}
                            className="h-10 w-10 shrink-0 rounded-sm border border-gray-200 object-cover"
                            src={getFileUrl(attachment.storageKey)}
                          />
                        ) : (
                          <div className="shrink-0">
                            <FileBadgeIcon extension={attachment.extension} />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {attachment.name}
                          </p>

                          <p className="text-sm text-gray-500">
                            {attachment.sizeLabel}
                          </p>
                        </div>

                        <Menu
                          as="div"
                          className="relative ml-auto shrink-0"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <MenuButton
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                            onMouseDown={(event) => {
                              event.stopPropagation();
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 outline-none transition hover:bg-gray-100 data-open:bg-gray-100"
                            aria-label={`Actions for ${attachment.name}`}
                          >
                            <ThreedotIcon />
                          </MenuButton>

                          <MenuItems
                            anchor="bottom end"
                            transition
                            onClick={(event) => event.stopPropagation()}
                            className="z-100 mt-2 w-40 origin-top-right rounded-xl border border-gray-200 bg-white p-1 shadow-[0_14px_44px_rgb(0_0_0/0.14)] outline-none transition duration-150 data-closed:-translate-y-2 data-closed:scale-95 data-closed:opacity-0"
                          >
                            <MenuItem>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleViewAttachment(attachment);
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 outline-none transition data-focus:bg-gray-50"
                              >
                                <EyeOpenedIcon fill="#374151" />
                                View
                              </button>
                            </MenuItem>

                            <MenuItem>
                              <button
                                type="button"
                                disabled={!attachment.storageKey}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDownloadAttachment(attachment);
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 outline-none transition data-focus:bg-gray-50 data-disabled:cursor-not-allowed data-disabled:opacity-50"
                              >
                                <DownloadIcon />
                                Download
                              </button>
                            </MenuItem>

                            <MenuItem>
                              <button
                                type="button"
                                disabled={isDeletingAttachment}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();

                                  handleRequestDeleteAttachment(attachment);
                                }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-500 outline-none transition data-focus:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <TrashIcon />
                                Delete
                              </button>
                            </MenuItem>
                          </MenuItems>
                        </Menu>
                      </div>
                    ))
                  ) : (
                    <div className="py-2">
                      <EmptyState
                        imageUrl="/images/EmptyProjectIcon.svg"
                        imageAlt="No attachments"
                        title="No Attachments"
                        description="No attachments have been added to this lead yet."
                      />
                    </div>
                  )}
                </div>
              </section>

              {!isExternalUser ? (
                <section
                  className={mobileSectionClass(
                    'people',
                    'rounded-xl border border-gray-200 overflow-hidden bg-white',
                  )}
                >
                  <h3 className="border-b border-gray-200 px-3 py-2 md:py-3 text-sm font-semibold text-gray-900 sm:px-4 md:text-base">
                    People
                  </h3>

                  <div>
                    <PersonCard person={ticket.reporter} />

                    {ticket.assigneeDetail ? (
                      <PersonCard person={ticket.assigneeDetail} />
                    ) : null}
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
        <div
          className={
            showMobileSection
              ? 'hidden'
              : 'flex min-h-0 min-w-0 flex-col px-3 lg:hidden'
          }
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <section className="flex items-center gap-3 rounded-xl border border-gray-200 xl:border-none bg-white p-3">
                <div
                  onClick={() => handleStartEditingContent()}
                  className="min-w-0 flex-1"
                >
                  <h2 className="wrap-break-word text-base font-semibold text-gray-900">
                    {ticket.title}
                  </h2>
                </div>

                {canViewTicketDetail || canEditTitleDescription ? (
                  <button
                    type="button"
                    aria-label="View lead details"
                    className="shrink-0 text-gray-900"
                    onClick={handleStartEditingContent}
                  >
                    <ChevronRightSmallIcon />
                  </button>
                ) : null}
              </section>

              <div className="overflow-hidden rounded-xl border border-gray-200 xl:border-none bg-white">
                {canViewReplies || canViewInternalChatBtn ? (
                  <button
                    type="button"
                    onClick={() => setMobileSection('replies')}
                    className="flex w-full items-center gap-3 border-b border-gray-200 px-3 py-2 text-left"
                  >
                    <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gray-200">
                      <RepliesArrowIcon />
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-900">
                      Replies
                    </span>
                    <ChevronRightSmallIcon />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setTicketSidebarTab('timeline');
                    setMobileSection('timeline');
                  }}
                  className="flex w-full items-center gap-3 border-b border-gray-200 px-3 py-2 text-left"
                >
                  <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gray-200">
                    <TimelineClockIcon />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-gray-900">
                    Lead Timeline
                  </span>
                  <ChevronRightSmallIcon />
                </button>

                <button
                  type="button"
                  onClick={() => setMobileSection('attachments')}
                  className="flex w-full items-center gap-3 border-b border-gray-200 px-3 py-2 text-left"
                >
                  <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gray-200">
                    <AttachmentFileIcon />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-gray-900">
                    Attachments
                  </span>
                  <ChevronRightSmallIcon />
                </button>

                {!isExternalUser ? (
                  <button
                    type="button"
                    onClick={() => setMobileSection('people')}
                    className="flex w-full items-center gap-3  px-3 py-2 text-left"
                  >
                    <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gray-200">
                      <PeopleIcon />
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-900">
                      People
                    </span>
                    <ChevronRightSmallIcon />
                  </button>
                ) : null}

                {/* <button
                  type="button"
                  onClick={() => setMobileSection('actions')}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                >
                  <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-gray-200">
                    <PeopleIcon />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-gray-900">
                    Actions
                  </span>
                  <ChevronRightSmallIcon />
                </button> */}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm ps-2 text-gray-700">Actions</p>
              <section
                className={mobileSectionClass(
                  'actions',
                  'rounded-xl border border-gray-200 bg-white',
                )}
              >
                {/* <h3 className="border-b border-gray-200 px-3 py-3 text-sm font-semibold text-gray-900 md:text-base">
                Actions
              </h3> */}

                <div className="space-y-2 p-3 sm:p-4">
                  {canChangeTicketProject ? (
                    <div className="grid grid-cols-[108px_minmax(0,1fr)] items-center gap-2 2xl:grid-cols-2 2xl:gap-4">
                      <span className="text-sm font-normal text-black">
                        Change Project
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsMoveProjectOpen(true)}
                        disabled={moveTicketProjectMutation.isPending}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate">{ticket.project.name}</span>
                        <span className="shrink-0 text-gray-900">
                          <ChevronRightSmallIcon />
                        </span>
                      </button>
                    </div>
                  ) : null}
                  <div className="grid items-center grid-cols-[60px_minmax(0,1fr)] 2xl:grid-cols-2 gap-2 2xl:gap-4">
                    <span className="text-sm text-black font-normal">
                      Status
                    </span>
                    <Dropdown
                      options={statusOptions}
                      value={selectedStatus}
                      disabled={
                        updateTicketMutation.isPending || !canEditStatus
                      }
                      onChange={handleStatusChange}
                      applyHeight={false}
                    />
                  </div>
                  <div className="grid items-center grid-cols-[60px_minmax(0,1fr)] 2xl:grid-cols-2 gap-2 2xl:gap-4">
                    <span className="text-sm text-black font-normal">
                      Agent
                    </span>

                    <Dropdown
                      options={assigneeOptions}
                      value={selectedAssigneeId}
                      disabled={
                        updateTicketMutation.isPending || !canEditAssignee
                      }
                      onChange={handleAssigneeChange}
                    />
                  </div>
                </div>
              </section>
            </div>

            {projectId && canViewProjectDetail ? (
              <div className="flex flex-col border border-gray-200 xl:border-none p-3 xl:p-0 rounded-xl xl:rounded-none gap-1">
                <p className="text-sm text-gray-700 ps-2">Quick Links</p>

                <div className="overflow-hidden rounded-xl bg-white">
                  <QuickLinkButton
                    label="Go to Project"
                    iconBg="bg-blue-500"
                    icon={
                      <ProjectsIcon
                        opacity="0"
                        fill="white"
                        width="16"
                        height="16"
                      />
                    }
                    onClick={() => handleOpenProjectQuickLink()}
                  />

                  {canViewProjectThread ? (
                    <QuickLinkButton
                      label="Thread"
                      iconBg="bg-purple-500"
                      icon={<ChatIcon fill="white" width="16" height="16" />}
                      onClick={() => handleOpenProjectQuickLink('thread')}
                    />
                  ) : null}

                  {canViewProjectFiles ? (
                    <QuickLinkButton
                      label="Files"
                      iconBg="bg-warning-500"
                      icon={
                        <FilesTabIcon fill="white" width="16" height="16" />
                      }
                      onClick={() => handleOpenProjectQuickLink('files')}
                    />
                  ) : null}

                  {canViewProjectCalendar ? (
                    <QuickLinkButton
                      label="Calendar"
                      iconBg="bg-green-500"
                      icon={
                        <CalendarTabIcon fill="white" width="16" height="16" />
                      }
                      onClick={() => handleOpenProjectQuickLink('calendar')}
                    />
                  ) : null}

                  {canViewProjectNotes ? (
                    <QuickLinkButton
                      label="Notes"
                      iconBg="bg-rose-500"
                      icon={
                        <NotesTabIcon fill="white" width="16" height="16" />
                      }
                      onClick={() => handleOpenProjectQuickLink('notes')}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AppModal
        isOpen={isChatDrawerOpen && chatDrawerChannel === 'external'}
        onClose={() => setChatDrawerChannel(null)}
        title="External Chat"
        position={ModalPosition.RIGHT}
        size="extraLarge"
        showFooter={false}
        bodyPaddingClasses="p-0!"
        outSideClickClose={false}
      >
        <div className="relative flex h-full min-h-0 flex-col bg-[#F8FAFC]">
          {isSendingChatMessage ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 backdrop-blur">
              <div className="flex min-w-65 flex-col items-center gap-4 rounded-2xl px-8 py-7 text-center">
                <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#BFDBFE] border-t-[#1D4ED8]" />
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1  relative">
            <TicketRepliesPanel
              hideHeader={true}
              className="rounded-none!"
              title="Client Chat"
              subtitle=""
              replies={externalChatMessages.map((message) =>
                mapChatMessageToDiscussionReply(message, currentUserId),
              )}
              emptyTitle={
                externalChatLoading ? 'Loading chat...' : 'No messages yet.'
              }
              emptyDescription={
                externalChatLoading
                  ? 'Fetching message history.'
                  : 'Start the conversation on this lead.'
              }
              canCompose={canPostReplies}
              canAttachFile={canAttachReplyFiles}
              readOnlyNotice={postNotice}
              isSubmittingReply={isSendingChatMessage}
              onSubmitReply={
                canPostReplies
                  ? (payload) =>
                      handleSubmitChatMessage({
                        ...payload,
                        channel: 'external',
                        sendMessage: sendExternalChatMessage,
                      })
                  : undefined
              }
              mentionMembers={membersQuery.data ?? []}
              requireMessage={false}
              currentUserId={currentUserId}
              onDeleteReply={handleDeleteChatMessage}
              onEditReply={({ reply, message, mentionedUserIds }) =>
                handleEditChatMessage({
                  reply,
                  message,
                  mentionedUserIds,
                  updateMessage: updateExternalChatMessage,
                })
              }
              deletingReplyId={deletingChatMessageId}
              editingReplyId={editingChatMessageId}
            />
          </div>
        </div>
      </AppModal>

      <MoveTicketModal
        isOpen={isMoveProjectOpen && canChangeTicketProject}
        ticketRefNo={ticket.ticketRefNo}
        ticketTitle={ticket.title}
        currentProject={{ id: projectId, name: ticket.project.name }}
        projects={projectNamesQuery.data ?? []}
        isSubmitting={moveTicketProjectMutation.isPending}
        onClose={() => setIsMoveProjectOpen(false)}
        onConfirm={handleMoveTicketProject}
      />

      <AppModal
        isOpen={isEditContentModalOpen}
        onClose={handleCancelEditingContent}
        onCancel={handleCancelEditingContent}
        onConfirm={() => {
          if (isContentViewMode) {
            if (canEditTitleDescription) {
              setContentModalMode('edit');
            }
            return;
          }

          void handleSaveTicketContent();
        }}
        title={isMobileContentLayout ? ticket.title : 'Edit Lead'}
        subtitle={
          isMobileContentLayout
            ? String(ticket.ticketRefNo ?? ticket.id)
            : undefined
        }
        size="large"
        showFooter
        confirmLabel={
          isContentViewMode
            ? 'Edit Lead'
            : isSavingContent
              ? 'Updating...'
              : 'Update'
        }
        cancelLabel={
          isContentViewMode
            ? 'Close'
            : isMobileContentLayout
              ? 'Cancel'
              : 'Discard'
        }
        hideConfirmButton={isContentViewMode && !canEditTitleDescription}
        confimBtnDisable={
          isSavingContent || (!isContentViewMode && !titleDraft.trim())
        }
        disableCloseButton={isSavingContent}
        outSideClickClose={!isSavingContent}
        scrollNeeded={false}
        bodyPaddingClasses="flex min-h-0 flex-1 overflow-hidden p-0!"
      >
        {isContentViewMode ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white p-4">
            <h3 className="break-words text-base font-medium text-gray-900">
              {ticket.title}
            </h3>

            {hasDescriptionContent ? (
              <div
                className="rich-text-content mt-3 break-words text-sm leading-6 text-gray-700"
                dangerouslySetInnerHTML={{
                  __html: sanitizedDescription,
                }}
              />
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                No description added.
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4 md:p-5">
              <div className="shrink-0">
                <label
                  htmlFor="edit-ticket-title"
                  className="mb-1.5 block text-sm font-normal text-gray-800 md:text-base"
                >
                  Title <span className="text-red-500">*</span>
                </label>

                <input
                  id="edit-ticket-title"
                  type="text"
                  value={titleDraft}
                  autoFocus
                  required
                  disabled={isSavingContent}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      handleCancelEditingContent();
                    }
                  }}
                  placeholder="Enter lead title"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-300 focus:border-gray-400 md:text-base"
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <label className="mb-1.5 block shrink-0 text-sm font-normal text-gray-800 md:text-base">
                  Description
                </label>

                <RichTextEditor
                  value={descriptionDraft}
                  onChange={handleDescriptionDraftChange}
                  onAttachmentFilesAdded={handleDescriptionAttachmentFilesAdded}
                  placeholder="Describe the issue in detail..."
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  disabled={isSavingContent}
                  showCharacterCount
                  editorClassName="text-sm font-normal text-gray-700"
                  className="
            flex min-h-0 flex-1 flex-col
            [&_.rich-text-editor]:min-h-0
            [&_.rich-text-editor]:flex-1
            [&_.rich-text-scroll-area]:min-h-0
            [&_.rich-text-scroll-area]:flex-1
            [&_.rich-text-scroll-area]:shrink
            [&_.rich-text-scroll-area]:overflow-y-auto
          "
                />
              </div>
            </div>
          </div>
        )}
      </AppModal>
      <ConfirmActionModal
        isOpen={Boolean(chatMessagePendingDelete)}
        onClose={() => {
          if (deletingChatMessageId) {
            return;
          }

          setChatMessagePendingDelete(null);
        }}
        title="Delete Message?"
        message={
          chatMessagePendingDelete?.message.trim()
            ? 'Are you sure you want to delete this message? This action cannot be undone.'
            : 'Are you sure you want to delete this attachment message? This action cannot be undone.'
        }
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        isSubmitting={Boolean(deletingChatMessageId)}
        onConfirm={handleConfirmDeleteChatMessage}
      />
      <TicketDescriptionModal
        isOpen={isDescriptionModalOpen}
        onClose={() => setIsDescriptionModalOpen(false)}
        Username={currentUser?.fullName ?? 'User'}
        title={ticket.title}
        descriptionHtml={sanitizedDescription}
        headerUser={
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6719FC] text-sm font-medium text-white">
            {currentUserInitials}
          </span>
        }
        headerAction={
          canViewInternalChatBtn ? (
            <label className="inline-flex items-center gap-2 border-gray-200">
              {hasUnreadInternalChat && !isInternalChatActive ? (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full border border-white bg-green-500" />
              ) : null}

              <span className="text-xs font-medium text-gray-600">
                Internal Chat
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={isInternalChatActive}
                aria-label="Toggle internal chat"
                onClick={() => {
                  const nextIsInternalChat = !isInternalChatActive;

                  updateInternalChatParam(nextIsInternalChat);

                  if (nextIsInternalChat) {
                    setHasUnreadInternalChat(false);
                  }
                }}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition ${
                  isInternalChatActive ? 'bg-[#3B82F6]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    isInternalChatActive ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          ) : null
        }
        repliesPanel={
          canViewReplies || canViewInternalChatBtn ? (
            <TicketRepliesPanel
              className="rounded-none!"
              hideHeader
              mentionMembers={membersQuery.data ?? []}
              showBorderTop={false}
              replies={
                isInternalChatActive && canViewInternalChatBtn
                  ? internalChatMessages.map((message) =>
                      mapChatMessageToDiscussionReply(message, currentUserId),
                    )
                  : canViewReplies
                    ? liveReplies
                    : []
              }
              hasMoreReplies={
                isInternalChatActive && canViewInternalChatBtn
                  ? internalChatHasMore
                  : canViewReplies
                    ? Boolean(ticketRepliesQuery.hasNextPage)
                    : false
              }
              isLoadingMoreReplies={
                isInternalChatActive && canViewInternalChatBtn
                  ? internalChatLoadingMore
                  : canViewReplies
                    ? ticketRepliesQuery.isFetchingNextPage
                    : false
              }
              onLoadMoreReplies={
                isInternalChatActive && canViewInternalChatBtn
                  ? loadOlderInternalChatMessages
                  : canViewReplies && ticketRepliesQuery.hasNextPage
                    ? async () => {
                        await ticketRepliesQuery.fetchNextPage();
                      }
                    : undefined
              }
              emptyTitle={
                isInternalChatActive && canViewInternalChatBtn
                  ? internalChatLoading
                    ? 'Loading internal chat...'
                    : 'No messages yet.'
                  : ticketRepliesQuery.isLoading
                    ? 'Loading replies...'
                    : 'No replies yet.'
              }
              emptyDescription={
                isInternalChatActive && canViewInternalChatBtn
                  ? internalChatLoading
                    ? 'Fetching internal chat history.'
                    : 'Start the internal conversation on this lead.'
                  : ticketRepliesQuery.isLoading
                    ? 'Fetching lead replies.'
                    : 'No responses have been added to this lead yet.'
              }
              canCompose={canPostReplies}
              canAttachFile={canAttachReplyFiles}
              readOnlyNotice={postNotice}
              isSubmittingReply={
                isInternalChatActive && canViewInternalChatBtn
                  ? isSendingChatMessage
                  : createReplyMutation.isPending
              }
              onSubmitReply={
                isInternalChatActive && canViewInternalChatBtn
                  ? canPostReplies
                    ? (payload) =>
                        handleSubmitChatMessage({
                          ...payload,
                          channel: 'internal',
                          sendMessage: sendInternalChatMessage,
                        })
                    : undefined
                  : canPostReplies
                    ? handleSubmitReply
                    : undefined
              }
              requireMessage={false}
              currentUserId={currentUserId}
              onDeleteReply={
                isInternalChatActive && canViewInternalChatBtn
                  ? canDeleteReplies
                    ? handleDeleteChatMessage
                    : undefined
                  : canDeleteReplies
                    ? handleDeleteTicketReply
                    : undefined
              }
              onEditReply={
                isInternalChatActive && canViewInternalChatBtn
                  ? canEditReplies
                    ? ({ reply, message, mentionedUserIds }) =>
                        handleEditChatMessage({
                          reply,
                          message,
                          mentionedUserIds,
                          updateMessage: updateInternalChatMessage,
                        })
                    : undefined
                  : canEditReplies
                    ? handleEditTicketReply
                    : undefined
              }
              onToggleReaction={
                isInternalChatActive && canViewInternalChatBtn
                  ? (reply, emoji) =>
                      handleToggleChatMessageReaction(reply, emoji, 'internal')
                  : !isInternalChatActive && canViewReplies
                    ? handleToggleTicketReplyReaction
                    : undefined
              }
              deletingReplyId={
                isInternalChatActive && canViewInternalChatBtn
                  ? deletingChatMessageId
                  : deletingTicketReplyId
              }
              editingReplyId={
                isInternalChatActive && canViewInternalChatBtn
                  ? editingChatMessageId
                  : editingTicketReplyId
              }
              composerPlaceholder={
                isInternalChatActive && canViewInternalChatBtn
                  ? 'Write a message, press @ to mention'
                  : ticket.createdByDetail?.name
                    ? `Write to ${ticket.createdByDetail.name}, press @ to mention`
                    : 'Write a reply, press @ to mention'
              }
            />
          ) : null
        }
      />
      <ConfirmActionModal
        isOpen={Boolean(attachmentToDelete)}
        onClose={() => {
          if (isDeletingAttachment) {
            return;
          }

          setAttachmentToDelete(null);
        }}
        title={
          attachmentToDelete?.fromDescription
            ? 'Delete Description Attachment?'
            : 'Delete Attachment?'
        }
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold">
              “{attachmentToDelete?.name ?? 'this attachment'}”
            </span>
            ?{' '}
            {attachmentToDelete?.fromDescription
              ? 'This attachment is embedded in the lead description and will also be removed from it. This action cannot be undone.'
              : 'This action cannot be undone.'}
          </>
        }
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        isSubmitting={isDeletingAttachment}
        onConfirm={handleConfirmDeleteAttachment}
      />
      <ConfirmActionModal
        isOpen={Boolean(ticketReplyPendingDelete)}
        onClose={() => {
          if (deletingTicketReplyId) {
            return;
          }

          setTicketReplyPendingDelete(null);
        }}
        title="Delete Reply?"
        message={
          ticketReplyPendingDelete?.message.trim()
            ? 'Are you sure you want to delete this reply? This action cannot be undone.'
            : 'Are you sure you want to delete this attachment reply? This action cannot be undone.'
        }
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        isSubmitting={Boolean(deletingTicketReplyId)}
        onConfirm={handleConfirmDeleteTicketReply}
      />

      <ImageGalleryLightbox
        images={galleryImages}
        activeIndex={activeGalleryIndex}
        title="Lead attachments"
        onClose={closeGallery}
        onSelect={selectGalleryImage}
        onPrevious={showPreviousGalleryImage}
        onNext={showNextGalleryImage}
      />
    </div>
  );
}

async function fetchTicketDetail(projectId: string, ticketId: string) {
  const response = await fetch(
    `/api/projects/${projectId}/tickets/${ticketId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ApiTicketDetail
    | { message?: string }
    | null;

  if (!response.ok || !isApiTicketDetail(payload)) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? payload.message || 'Failed to fetch lead details.'
        : 'Failed to fetch lead details.';
    throw new Error(message);
  }

  return mapApiTicketDetailToRecord(payload);
}

async function updateTicketDescription(
  projectId: string,
  ticketId: string,
  description: string,
) {
  const response = await fetch(
    `/api/projects/${projectId}/tickets/${ticketId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        description: serializeDescriptionImagesForStorage(description),
      }),
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      Array.isArray(payload?.message) && payload.message.length
        ? payload.message.join(', ')
        : payload?.message || 'Failed to update the lead description.';

    throw new Error(message);
  }

  return payload;
}

async function fetchProjectMembers(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}/members`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiProjectMember[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch members.'
        : 'Failed to fetch members.',
    );
  }

  return payload;
}

async function fetchTicketStatuses() {
  const response = await fetch('/api/ticket-statuses', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiTicketStatus[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead statuses.'
        : 'Failed to fetch lead statuses.',
    );
  }

  return payload;
}

async function fetchTicketReplies(
  ticketId: string,
  currentUserId: string,
  cursor: TicketRepliesCursor | null,
) {
  const searchParams = new URLSearchParams({
    limit: String(TICKET_REPLIES_PAGE_SIZE),
  });

  if (cursor?.createdAt) {
    searchParams.set('cursorCreatedAt', cursor.createdAt);
  }

  if (cursor?.id) {
    searchParams.set('cursorId', cursor.id);
  }

  const response = await fetch(
    `/api/tickets/${ticketId}/replies?${searchParams.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ApiTicketRepliesResponse
    | ApiTicketReply[]
    | { message?: string }
    | null;

  const normalizedPayload = normalizeTicketRepliesResponse(
    payload,
    currentUserId,
  );

  if (!response.ok || !normalizedPayload) {
    throw new Error(
      normalizedPayload?.message || 'Failed to fetch lead replies.',
    );
  }

  return normalizedPayload;
}

function normalizeTicketRepliesResponse(
  payload:
    | ApiTicketRepliesResponse
    | ApiTicketReply[]
    | { message?: string }
    | null,
  currentUserId: string,
): TicketRepliesPage | null {
  if (Array.isArray(payload)) {
    return {
      messages: payload.map((reply) =>
        mapApiTicketReplyToDiscussionReply(reply, currentUserId),
      ),
      cursor: null,
      hasMore: false,
    };
  }

  if (!isApiTicketRepliesResponse(payload)) {
    return payload && 'message' in payload
      ? {
          message: payload.message || 'Failed to fetch lead replies.',
          messages: [],
          cursor: null,
          hasMore: false,
        }
      : null;
  }

  return {
    messages: payload.replies.map((reply: ApiTicketReply) =>
      mapApiTicketReplyToDiscussionReply(reply, currentUserId),
    ),
    cursor:
      payload.cursor?.id && payload.cursor?.createdAt
        ? {
            id: payload.cursor.id,
            createdAt: payload.cursor.createdAt,
          }
        : null,
    hasMore: Boolean(payload.hasMore),
  };
}

function isApiTicketRepliesResponse(
  payload:
    | ApiTicketRepliesResponse
    | ApiTicketReply[]
    | { message?: string }
    | null,
): payload is ApiTicketRepliesResponse & { replies: ApiTicketReply[] } {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      Array.isArray((payload as ApiTicketRepliesResponse).replies),
  );
}

function flattenTicketRepliesPages(
  pages: TicketRepliesPage[] | undefined,
): DiscussionReply[] {
  if (!pages?.length) {
    return [];
  }

  const repliesById = new Map<string, DiscussionReply>();

  pages
    .slice()
    .reverse()
    .forEach((page) => {
      page.messages
        .slice()
        .reverse()
        .forEach((reply) => {
          repliesById.set(reply.id, reply);
        });
    });

  return Array.from(repliesById.values());
}

async function fetchTicketTimeline(projectId: string, ticketId: string) {
  const response = await fetch(
    `/api/activity/project/${projectId}/tickets/${ticketId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ApiTicketTimelineActivity[]
    | { message?: string }
    | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(
      !Array.isArray(payload)
        ? payload?.message || 'Failed to fetch lead timeline.'
        : 'Failed to fetch lead timeline.',
    );
  }

  return payload;
}

type ApiProjectMember = {
  id: string;
  fullName: string;
};

type TicketRepliesCursor = {
  createdAt: string;
  id: string;
};

type TicketRepliesPage = {
  messages: DiscussionReply[];
  cursor: TicketRepliesCursor | null;
  hasMore: boolean;
  message?: string;
};

type ApiTicketRepliesResponse = {
  replies?: ApiTicketReply[];
  cursor?: {
    createdAt?: string | null;
    id?: string | null;
  } | null;
  hasMore?: boolean | null;
  message?: string;
};

type ApiTicketStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
};

type ApiTicketReply = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  authorId?: string | null;
  createdBy?: string | null;
  message?: string | null;
  mentionedUserIds?: string[] | null;
  author?: ApiTicketPerson | null;
  attachments?: ApiTicketReplyAttachment[];
  reactions?: ApiTicketReplyReaction[] | null;
  replyCount?: number | string | null;
};

type ApiTicketTimelineActivity = {
  id: string;
  createdAt?: string | null;
  actorId?: string | null;
  type?: string | null;
  title?: string | null;
};

type ApiTicketReplyReaction = {
  emoji?: string | null;
  count?: number | string | null;
  actors?: Array<{
    id?: string | null;
    fullName?: string | null;
  }> | null;
  reactedByCurrentUser?: boolean | null;
  isCurrentUser?: boolean | null;
  userReacted?: boolean | null;
};

type ApiTicketReplyAttachment = {
  id?: string;
  originalName?: string;
  name?: string;
  storageKey?: string | null;
  sizeBytes?: string | number | null;
  extension?: string | null;
  mimeType?: string | null;
};

type ApiTicketAttachment = {
  id: string;
  originalName: string;
  storageKey: string;
  sizeBytes?: string | number | null;
  extension?: string | null;
  mimeType?: string | null;
  fromDescription?: boolean;
};

type ApiTicketPerson = {
  id: string;
  fullName?: string | null;
  name?: string | null;
};

type ApiTicketDetail = {
  id: string;
  ticketRefNo?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  isActive?: boolean;
  createdBy?: { id: string; fullName?: string | null } | null;
  updatedBy?: string | null;
  projectId: string;
  title: string;
  description: string;
  statusKey: string | null;
  ticketType: string;
  priorityKey: string | null;
  reporterId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  project?: {
    id: string;
    name: string;
    brandColor?: string | null;
  } | null;
  assignee?: ApiTicketPerson | null;
  reporter?: ApiTicketPerson | null;
  contact?: {
    id: string;
    fullName: string | null;
    phone: string;
  } | null;
  attachments: ApiTicketAttachment[];
  // Whether the current user may write on this lead (assignee, creator,
  // mentioned, or a role with ticket_replies.post_any_lead).
  canPost?: boolean;
};

type UpdateTicketRequest = Partial<{
  title: string;
  description: string;
  statusKey: string;
  priorityKey: string;
  ticketType: string;
  assigneeId: string;
  attachments: UploadedFileDto[];
}>;

type UpdateTicketPayloadInput = {
  title?: string | null;
  description?: string | null;
  statusKey?: string | null;
  priorityKey?: string | null;
  assigneeId?: string | null;
  ticketType: string;
  reporterId?: string | null;
};

function buildUpdateTicketPayload(
  input: UpdateTicketPayloadInput,
): UpdateTicketRequest {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) =>
        typeof value === 'string' ? value.trim().length > 0 : false,
      )
      .map(([key, value]) => [
        key,
        key === 'description'
          ? serializeDescriptionImagesForStorage(value as string)
          : value,
      ]),
  );
}

function isApiTicketDetail(value: unknown): value is ApiTicketDetail {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      'title' in value &&
      'description' in value,
  );
}

function mapApiTicketDetailToRecord(ticket: ApiTicketDetail) {
  const projectName = ticket.project?.name ?? 'Project';
  const assigneeName =
    ticket.assignee?.fullName ?? ticket.assignee?.name ?? 'Unassigned';
  const reporterName =
    ticket.reporter?.fullName ?? ticket.reporter?.name ?? 'Reporter';

  const createdByName = ticket.createdBy?.fullName ?? 'Unknown';

  return {
    id: ticket.id,
    ticketRefNo: ticket.ticketRefNo,
    title: ticket.title,
    project: {
      id: ticket.project?.id ?? ticket.projectId,
      initials: getInitials(projectName),
      name: projectName,
    },
    status: ticket.statusKey ?? '',
    ticketType: ticket.ticketType,
    contact: ticket.contact ?? null,
    priority: ticket.priorityKey ?? null,
    assignee: {
      name: assigneeName,
      initials: getInitials(assigneeName),
    },
    date: formatDateTime(ticket.createdAt),
    description: ticket.description,
    assigneeId: ticket.assigneeId ?? '',
    reporterId: ticket.reporterId ?? '',
    priorityKey: ticket.priorityKey,
    canPost: ticket.canPost,
    attachments: ticket.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.originalName,
      sizeLabel: formatBytes(attachment.sizeBytes ?? 0),
      sizeBytes: attachment.sizeBytes,
      extension: attachment.extension ?? undefined,
      storageKey: attachment.storageKey,
      mimeType: attachment.mimeType,
      fromDescription: attachment.fromDescription,
    })),
    reporter: {
      role: 'Reporter',
      name: reporterName,
      initials: getInitials(reporterName),
    },
    assigneeDetail: ticket.assignee
      ? {
          role: 'Agent',
          name: assigneeName,
          initials: getInitials(assigneeName),
        }
      : null,
    createdByDetail: ticket.createdBy
      ? {
          name: createdByName,
          initials: getInitials(createdByName),
        }
      : null,
    replies: [],
  };
}

function mapApiTicketTimelineToItems(
  activities: ApiTicketTimelineActivity[],
  ticketStatuses: ApiTicketStatus[],
): TicketTimelineItem[] {
  return activities.map((activity) => {
    const timelineMeta = getTicketTimelineMeta(activity, ticketStatuses);

    return {
      id: activity.id,
      description:
        activity.title?.replace(/^"+|"+$/g, '').trim() ||
        timelineMeta.description,
      status: timelineMeta.status,
      showStatusBadge: timelineMeta.showStatusBadge,
      statusClassName: timelineMeta.statusClassName,
      statusStyle: timelineMeta.statusStyle,
      occurredAt: activity.createdAt ?? '',
    };
  });
}

function getTicketTimelineMeta(
  activity: ApiTicketTimelineActivity,
  ticketStatuses: ApiTicketStatus[],
) {
  const type = activity.type?.trim() ?? '';
  const normalizedTitle = activity.title?.replace(/"/g, '').trim() ?? '';

  if (type === 'ticket_assignee_changed') {
    return {
      status:
        extractValueAfterKeyword(normalizedTitle, 'assigned to') ?? 'Assigned',
      showStatusBadge: false,
      statusClassName: 'bg-blue-500 text-white',
      description: normalizedTitle || 'Assignment updated.',
    };
  }

  if (type === 'ticket_priority_changed') {
    return {
      status:
        extractValueAfterKeyword(normalizedTitle, 'priority changed to') ??
        'Updated',
      showStatusBadge: true,
      statusClassName: 'bg-yellow-500 text-white',
      description: normalizedTitle || 'Priority changed.',
    };
  }

  if (type === 'ticket_status_changed') {
    const status =
      extractValueAfterKeyword(normalizedTitle, 'status changed to') ??
      'Updated';
    const statusColor = getTicketStatusColorFromSettings(
      status,
      ticketStatuses,
    );

    return {
      status,
      showStatusBadge: true,
      statusClassName: 'text-white',
      statusStyle: statusColor ? { backgroundColor: statusColor } : undefined,
      description: normalizedTitle || 'Status changed.',
    };
  }

  if (type === 'ticket_created') {
    const status = 'Open';
    const statusColor = getTicketStatusColorFromSettings(
      status,
      ticketStatuses,
    );

    return {
      status,
      showStatusBadge: false,
      statusClassName: 'text-white',
      statusStyle: statusColor ? { backgroundColor: statusColor } : undefined,
      description: normalizedTitle || 'Lead created.',
    };
  }

  return {
    status: 'Updated',
    showStatusBadge: false,
    statusClassName: 'bg-gray-500 text-white',
    description: normalizedTitle || 'Lead updated.',
  };
}

function extractValueAfterKeyword(value: string, keyword: string) {
  const normalizedValue = value.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  const keywordIndex = normalizedValue.indexOf(normalizedKeyword);

  if (keywordIndex < 0) {
    return null;
  }

  const rawMatch = value
    .slice(keywordIndex + keyword.length)
    .split(' by ')[0]
    ?.trim();

  return rawMatch || null;
}

function getTicketStatusColorFromSettings(
  statusValue: string,
  ticketStatuses: ApiTicketStatus[],
) {
  const normalizedStatusValue = normalizeTicketSettingValue(statusValue);
  const matchedStatus = ticketStatuses.find(
    (status) =>
      normalizeTicketSettingValue(status.key) === normalizedStatusValue ||
      normalizeTicketSettingValue(status.label) === normalizedStatusValue,
  );

  return matchedStatus?.color?.trim() || null;
}

function normalizeTicketSettingValue(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function mapChatMessageToDiscussionReply(
  message: ChatMessage,
  currentUserId: string,
) {
  const authorName =
    message.sender?.fullName ??
    message.sender?.name ??
    (message.senderId ? `User ${message.senderId.slice(-4)}` : 'User');
  const isDeleted =
    message.message.trim() === '[Message deleted]' ||
    message.message.trim() === 'Message deleted';
  const resolvedAttachmentUrls = Array.isArray(message.attachmentUrls)
    ? message.attachmentUrls.filter(
        (url): url is string =>
          typeof url === 'string' && url.trim().length > 0,
      )
    : message.attachmentUrl
      ? [message.attachmentUrl]
      : [];

  return {
    id: message.id,
    authorId: message.senderId,
    mentionedUserIds: Array.isArray(message.mentionedUserIds)
      ? message.mentionedUserIds.filter(
          (mentionedUserId): mentionedUserId is string =>
            typeof mentionedUserId === 'string' &&
            mentionedUserId.trim().length > 0,
        )
      : [],
    updatedAt: message.updatedAt,
    isEdited: Boolean(
      message.updatedAt &&
        Math.floor(new Date(message.updatedAt).getTime() / 1000) >
          Math.floor(new Date(message.createdAt).getTime() / 1000),
    ),
    author: {
      name: authorName,
      initials: getInitials(authorName),
    },
    createdAt: formatReplyDate(message.createdAt),
    status: message.isRead ? ('read' as const) : ('sent' as const),
    message:
      message.messageType === 'attachment'
        ? isDeleted
          ? 'Message deleted'
          : message.message.trim() &&
              message.message.trim() !== message.attachmentName?.trim() &&
              !/^sent \d+ attachments?$/i.test(message.message.trim())
            ? message.message.trim()
            : ''
        : isDeleted
          ? 'Message deleted'
          : message.message.trim(),
    attachments:
      message.messageType === 'attachment' && resolvedAttachmentUrls.length
        ? resolvedAttachmentUrls.map((attachmentUrl, index) => ({
            id: `${message.id}-attachment-${index}`,
            name:
              index === 0 && message.attachmentName?.trim()
                ? message.attachmentName.trim()
                : extractFileNameFromUrl(attachmentUrl) ||
                  `Attachment ${index + 1}`,
            extension: getAttachmentExtension(attachmentUrl),
            storageKey: attachmentUrl,
            url: attachmentUrl,
          }))
        : [],
    reactions: mapChatMessageReactions(message.reactions, currentUserId),
  };
}

function mapChatMessageReactions(
  reactions: ChatMessage['reactions'] | null | undefined,
  currentUserId: string,
): DiscussionReaction[] {
  if (!Array.isArray(reactions)) {
    return [];
  }

  return reactions.flatMap((reaction) => {
    const emoji = reaction.emoji?.trim();

    if (!emoji) {
      return [];
    }

    const countValue = Number(reaction.count ?? 0);
    const reactedByCurrentUserFromActors = Array.isArray(reaction.actors)
      ? reaction.actors.some((actor) => actor.id?.trim() === currentUserId)
      : false;
    const reactedByCurrentUserFlag =
      reaction.reactedByCurrentUser ??
      reaction.isCurrentUser ??
      reaction.userReacted;

    return [
      {
        emoji,
        count: Number.isFinite(countValue) && countValue > 0 ? countValue : 1,
        reactedByCurrentUser: Boolean(
          reactedByCurrentUserFromActors || reactedByCurrentUserFlag,
        ),
        actors: Array.isArray(reaction.actors)
          ? reaction.actors.map((actor) => ({
              id: actor.id?.trim() || undefined,
              name: actor.fullName?.trim() || undefined,
              isCurrentUser: actor.id?.trim() === currentUserId,
            }))
          : undefined,
      },
    ];
  });
}

function mapApiTicketReplyToDiscussionReply(
  reply: ApiTicketReply,
  currentUserId: string,
) {
  const authorId = reply.authorId ?? reply.createdBy ?? '';
  const authorName =
    reply.author?.fullName ??
    reply.author?.name ??
    (authorId ? `User ${authorId.slice(-4)}` : 'User');

  return {
    id: reply.id,
    authorId,
    mentionedUserIds: Array.isArray(reply.mentionedUserIds)
      ? reply.mentionedUserIds.filter(
          (mentionedUserId): mentionedUserId is string =>
            typeof mentionedUserId === 'string' &&
            mentionedUserId.trim().length > 0,
        )
      : [],
    updatedAt: reply.updatedAt,
    isEdited: Boolean(
      reply.updatedAt &&
        Math.floor(new Date(reply.updatedAt).getTime() / 1000) >
          Math.floor(
            new Date(reply.createdAt ?? reply.updatedAt).getTime() / 1000,
          ),
    ),
    author: {
      name: authorName,
      initials: getInitials(authorName),
    },
    createdAt: formatReplyDate(reply.createdAt ?? reply.updatedAt ?? ''),
    message: reply.message?.trim() || '',
    replyCount: toNumber(reply.replyCount),
    reactions: mapApiTicketReplyReactions(reply.reactions, currentUserId),
    attachments: Array.isArray(reply.attachments)
      ? reply.attachments.map(mapApiTicketReplyAttachment)
      : [],
  };
}

function mapApiTicketReplyAttachment(attachment: ApiTicketReplyAttachment) {
  const name = attachment.originalName ?? attachment.name ?? 'Untitled file';

  return {
    id: attachment.id ?? `${name}-${attachment.storageKey ?? ''}`,
    name,
    sizeLabel: formatBytes(attachment.sizeBytes ?? 0),
    extension: attachment.extension ?? attachment.mimeType ?? undefined,
    storageKey: attachment.storageKey ?? undefined,
  };
}

function mapApiTicketReplyReactions(
  reactions: ApiTicketReplyReaction[] | null | undefined,
  currentUserId: string,
): DiscussionReaction[] {
  if (!Array.isArray(reactions)) {
    return [];
  }

  return reactions.flatMap((reaction) => {
    const emoji = reaction.emoji?.trim();

    if (!emoji) {
      return [];
    }

    const countValue = Number(reaction.count ?? 0);
    const reactedByCurrentUserFromActors = Array.isArray(reaction.actors)
      ? reaction.actors.some((actor) => actor.id?.trim() === currentUserId)
      : false;
    const reactedByCurrentUserFlag =
      reaction.reactedByCurrentUser ??
      reaction.isCurrentUser ??
      reaction.userReacted;

    return [
      {
        emoji,
        count: Number.isFinite(countValue) && countValue > 0 ? countValue : 1,
        reactedByCurrentUser: Boolean(
          reactedByCurrentUserFromActors || reactedByCurrentUserFlag,
        ),
        actors: Array.isArray(reaction.actors)
          ? reaction.actors.map((actor) => ({
              id: actor.id?.trim() || undefined,
              name: actor.fullName?.trim() || undefined,
              isCurrentUser: actor.id?.trim() === currentUserId,
            }))
          : undefined,
      },
    ];
  });
}

function incrementDiscussionReaction(
  reactions: DiscussionReaction[],
  emoji: string,
  currentUserId?: string,
) {
  const existingReaction = reactions.find(
    (reaction) => reaction.emoji === emoji,
  );

  if (!existingReaction) {
    return [
      ...reactions,
      {
        emoji,
        count: 1,
        reactedByCurrentUser: true,
        actors: currentUserId
          ? [{ id: currentUserId, name: 'You', isCurrentUser: true }]
          : [{ name: 'You', isCurrentUser: true }],
      },
    ];
  }

  return reactions.map((reaction) =>
    reaction.emoji === emoji
      ? {
          ...reaction,
          count: reaction.count + (reaction.reactedByCurrentUser ? 0 : 1),
          reactedByCurrentUser: true,
          actors: reaction.reactedByCurrentUser
            ? reaction.actors
            : [
                ...(reaction.actors ?? []),
                currentUserId
                  ? { id: currentUserId, name: 'You', isCurrentUser: true }
                  : { name: 'You', isCurrentUser: true },
              ],
        }
      : {
          ...reaction,
          reactedByCurrentUser: false,
          actors:
            reaction.actors?.map((actor) => ({
              ...actor,
              isCurrentUser: false,
            })) ?? reaction.actors,
        },
  );
}

function decrementDiscussionReaction(
  reactions: DiscussionReaction[],
  emoji: string,
  currentUserId?: string,
) {
  return reactions
    .flatMap((reaction) => {
      if (reaction.emoji !== emoji) {
        return [reaction];
      }

      if (reaction.count <= 1) {
        return [];
      }

      return [
        {
          ...reaction,
          count: reaction.count - 1,
          reactedByCurrentUser: false,
          actors:
            reaction.actors?.filter((actor) =>
              currentUserId ? actor.id !== currentUserId : !actor.isCurrentUser,
            ) ?? reaction.actors,
        },
      ];
    })
    .map((reaction) =>
      reaction.emoji === emoji
        ? reaction
        : {
            ...reaction,
            reactedByCurrentUser: false,
            actors:
              reaction.actors?.map((actor) => ({
                ...actor,
                isCurrentUser: false,
              })) ?? reaction.actors,
          },
    );
}

async function uploadChatAttachments(
  attachments: File[],
  ticketId: string,
  channel: ChatChannel,
) {
  const keyPrefix =
    channel === 'internal'
      ? `tickets/${ticketId}/internal-msg`
      : `tickets/${ticketId}/external-msg`;

  return uploadFilesDirectly(attachments, keyPrefix);
}

function extractFileNameFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean);
    return pathnameParts.at(-1) ?? '';
  } catch {
    return url.split('/').filter(Boolean).at(-1) ?? '';
  }
}

function buildTicketAttachmentGalleryImages(
  attachments: {
    id: string;
    name: string;
    extension?: string;
    storageKey?: string;
  }[],
) {
  return attachments
    .filter((attachment) => isImageAttachmentExtension(attachment.extension))
    .map((attachment, index) => ({
      attachmentId: attachment.id,
      storageKey: attachment.storageKey,
      fileName: attachment.name,
      src: getFileUrl(attachment.storageKey),
      alt: `${attachment.name} preview ${index + 1}`,
    }));
}

function getAttachmentExtension(value?: string | null) {
  const name = value?.trim() ?? '';
  const lastSegment = name.split('.').pop()?.trim();

  if (!lastSegment || lastSegment === name) {
    return undefined;
  }

  return lastSegment.toLowerCase();
}

function buildAttachmentUrl(storageKey?: string | null) {
  if (!storageKey) {
    return '';
  }
  return storageKey;
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return 'NA';
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

type SocketTokenResponse = {
  accessToken: string;
  socketUrl: string;
};

async function fetchSocketToken(): Promise<SocketTokenResponse> {
  const response = await fetch('/api/auth/socket-token', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as
    | SocketTokenResponse
    | { message?: string }
    | null;

  if (!response.ok || !payload || !('accessToken' in payload)) {
    throw new Error(
      payload && 'message' in payload
        ? payload.message || 'Failed to authorize socket connection.'
        : 'Failed to authorize socket connection.',
    );
  }

  return payload;
}

async function fetchUnreadIndicator(
  projectId: string,
  ticketId: string,
  channel: ChatChannel,
) {
  const response = await fetch(
    `/api/projects/${projectId}/tickets/${ticketId}/chat/${channel}/unread`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | number
    | {
        count?: number;
        unreadCount?: number;
        total?: number;
        internal?: number;
        external?: number;
        message?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload
        ? payload.message || 'Failed to fetch unread chat status.'
        : 'Failed to fetch unread chat status.',
    );
  }

  if (typeof payload === 'number') {
    return payload > 0;
  }

  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (typeof payload.count === 'number') {
    return payload.count > 0;
  }

  if (typeof payload.unreadCount === 'number') {
    return payload.unreadCount > 0;
  }

  if (typeof payload.total === 'number') {
    return payload.total > 0;
  }

  if (channel === 'internal' && typeof payload.internal === 'number') {
    return payload.internal > 0;
  }

  if (channel === 'external' && typeof payload.external === 'number') {
    return payload.external > 0;
  }

  return false;
}

function formatReplyDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTimelineDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);

  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return formattedTime ? `${formattedDate} • ${formattedTime}` : formattedDate;
}

function formatBytes(sizeBytes: string | number | null | undefined) {
  const bytes = Number(sizeBytes);

  if (Number.isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentUrl(storageKey?: string) {
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

function isImageAttachmentExtension(extension?: string) {
  const normalizedExtension = extension?.trim().toLowerCase();

  return (
    normalizedExtension === 'png' ||
    normalizedExtension === 'svg' ||
    normalizedExtension === 'jpg' ||
    normalizedExtension === 'jpeg'
  );
}

function MetaItem({
  label,
  value,
  hideTooltip = true,
  actions,
}: {
  label: string;
  value: string;
  hideTooltip?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="w-fit">
      <span className="block text-xs sm:text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-1">
        <Tooltip
          heading={value}
          className="w-fit"
          side="bottom"
          content={''}
          hide={hideTooltip}
        >
          <p className="sm:mt-1 flex items-center gap-1  text-sm whitespace-break-spaces sm:text-base font-semibold  text-white">
            {value === 'bug' ? (
              <BugIcon />
            ) : value === 'feature_request' ? (
              <FeatureIcon />
            ) : (
              ''
            )}
            <span className="line-clamp-1!">
              {value === 'feature_request'
                ? 'Feature'
                : value === 'bug'
                  ? 'Bug'
                  : value}
            </span>
          </p>
        </Tooltip>
        {actions}
      </div>
    </div>
  );
}

function TicketDetailHeaderSkeleton() {
  return (
    <div className="relative flex w-full shrink-0 flex-col gap-2 overflow-hidden rounded-none bg-[linear-gradient(to_right,#335C94_0%,#665932_25%,#7B398E_50%,#003F89_75%,#070922_100%)] px-4 pt-4 pb-2 xl:flex-row xl:items-center xl:gap-4 xl:rounded-xl xl:px-7.5 xl:py-6">
      <div className="relative z-20 flex w-full min-w-0 flex-col items-start gap-3 xl:flex-row xl:items-center">
        <div className="hidden h-10 w-10 shrink-0 rounded-full bg-white/20 lg:block xl:h-12 xl:w-12" />

        <div className="hidden w-full grid-cols-5 gap-4 xl:grid">
          {Array.from({ length: 5 }).map((_, index) => (
            <TicketMetaItemSkeleton key={index} />
          ))}
        </div>

        <div className="flex w-full flex-col gap-4 xl:hidden">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <TicketMetaItemSkeleton key={index} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <TicketMetaItemSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketMetaItemSkeleton() {
  return (
    <div className="min-w-0 space-y-2">
      <div className="h-3 w-14 rounded bg-white/15" />
      <div className="h-4 w-24 max-w-full rounded bg-white/25" />
    </div>
  );
}
function TicketContentSkeleton() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 md:p-5">
      <div className="relative">
        {/* Edit icon */}
        <div className="absolute top-0 right-0 h-9 w-9 rounded-full bg-gray-100" />

        {/* Title */}
        <div className="h-6 w-2/3 max-w-xl rounded bg-gray-200 md:h-7" />

        {/* Description */}
        <div className="mt-3 space-y-2">
          <div className="h-3.5 w-full rounded bg-gray-100" />
          <div className="h-3.5 w-5/6 rounded bg-gray-100" />
        </div>
      </div>
    </section>
  );
}
function TicketRepliesSkeleton() {
  return (
    <section className="flex min-h-96 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white xl:h-full xl:min-h-0">
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="h-5 w-20 rounded bg-gray-200" />

        <div className="flex items-center gap-2">
          <div className="h-3 w-20 rounded bg-gray-100" />
          <div className="h-6 w-10 rounded-full bg-gray-200" />
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-5 overflow-hidden p-4">
        <TicketReplyBubbleSkeleton align="left" />
        <TicketReplyBubbleSkeleton align="right" />
        <TicketReplyBubbleSkeleton align="left" />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-gray-200 p-3 md:p-4">
        <div className="h-16 w-full rounded-xl bg-gray-100" />

        <div className="mt-2 flex items-center justify-end gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-100" />
          <div className="h-9 w-9 rounded-full bg-gray-100" />
          <div className="h-9 w-9 rounded-full bg-gray-200" />
        </div>
      </div>
    </section>
  );
}
function TicketActionsSkeleton() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3">
        <div className="h-5 w-16 rounded bg-gray-200" />
      </div>

      <div className="space-y-2 p-3 sm:p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-2 2xl:grid-cols-2 2xl:gap-4"
          >
            <div
              className={`h-3.5 rounded bg-gray-200 ${
                index === 1 ? 'w-12' : index === 2 ? 'w-14' : 'w-11'
              }`}
            />

            <div className="h-9 min-w-0 rounded-lg border border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
function TicketQuickLinksSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Quick Links / Timeline tabs */}
      <div className="px-3 py-3">
        <div className="grid w-full grid-cols-2 gap-1 rounded-full border border-gray-200 bg-gray-50 p-1">
          <div className="h-8 rounded-full bg-white shadow-sm" />
          <div className="h-8 rounded-full bg-gray-100" />
        </div>
      </div>

      {/* Quick-link rows */}
      <div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-t border-gray-200 px-4 py-3"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
            <div
              className={`h-4 rounded bg-gray-100 ${
                index % 2 === 0 ? 'w-24' : 'w-16'
              }`}
            />
            <div className="ml-auto h-4 w-4 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
function TicketAttachmentsSkeleton() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3 sm:px-4">
        <div className="h-5 w-24 rounded bg-gray-200" />
      </div>

      <div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0"
          >
            <div className="h-10 w-10 shrink-0 rounded bg-gray-200" />

            <div className="min-w-0 flex-1 space-y-2">
              <div
                className={`h-3.5 rounded bg-gray-200 ${
                  index === 0 ? 'w-32' : 'w-24'
                }`}
              />
              <div className="h-3 w-14 rounded bg-gray-100" />
            </div>

            <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
function TicketPeopleSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3 sm:px-4">
        <div className="h-5 w-16 rounded bg-gray-200" />
      </div>

      <div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 sm:h-12 sm:w-12" />

            <div className="min-w-0 space-y-2">
              <div className="h-3 w-16 rounded bg-gray-100" />
              <div
                className={`h-4 rounded bg-gray-200 ${
                  index === 0 ? 'w-28' : 'w-24'
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TicketReplyBubbleSkeleton({ align }: { align: 'left' | 'right' }) {
  const isRight = align === 'right';

  return (
    <div
      className={`flex items-start gap-3 ${isRight ? 'flex-row-reverse' : ''}`}
    >
      <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />

      <div
        className={`w-full max-w-[75%] space-y-2 ${
          isRight ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`flex items-center gap-2 ${isRight ? 'justify-end' : ''}`}
        >
          <div className="h-3.5 w-24 rounded bg-gray-200" />
          <div className="h-3 w-16 rounded bg-gray-100" />
        </div>

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="h-3.5 w-56 max-w-full rounded bg-gray-100" />
          <div className="mt-2 h-3.5 w-40 max-w-full rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function TicketDetailSkeleton() {
  return (
    <div
      className="relative z-100 h-full overflow-hidden pb-0 xl:h-dvh xl:px-0 xl:py-5 xl:pr-5"
      aria-hidden="true"
    >
      <div className="flex h-full min-h-0 min-w-0 animate-pulse flex-col gap-3 overflow-y-auto overscroll-contain scrollbar-hide xl:overflow-hidden xl:rounded-2xl xl:border xl:border-white xl:bg-white/40 xl:p-3">
        <TicketDetailHeaderSkeleton />

        <div className="min-h-0 min-w-0 flex-none overflow-visible px-3 xl:flex-1 xl:overflow-hidden xl:px-0">
          <div className="grid h-auto min-h-0 min-w-0 grid-cols-1 gap-4 overflow-visible xl:h-full xl:grid-cols-12 xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
            {/* Main content */}
            <div className="flex h-auto min-w-0 flex-col space-y-4 overflow-visible xl:col-span-9 xl:h-full xl:min-h-0 xl:overflow-hidden">
              <TicketContentSkeleton />

              <div className="h-auto min-h-0 flex-none overflow-visible xl:h-full xl:flex-1 xl:overflow-hidden">
                <TicketRepliesSkeleton />
              </div>
            </div>

            {/* Sidebar */}
            <aside className="h-auto min-h-0 min-w-0 space-y-4 overflow-visible scrollbar-hide xl:col-span-3 xl:h-full xl:overflow-y-auto">
              <TicketActionsSkeleton />
              <TicketQuickLinksSkeleton />
              <TicketAttachmentsSkeleton />
              <TicketPeopleSkeleton />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonCard({ person }: { person: TicketPerson }) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 py-3 px-4 ">
      <span className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-purple-100 text-sm md:text-base font-semibold text-purple-700">
        {person.initials}
      </span>
      <div>
        <p className="text-xs sm:text-sm text-gray-900">{person.role}</p>
        <p className="text-sm md:text-base font-semibold text-gray-900">
          {person.name}
        </p>
      </div>
    </div>
  );
}

function FileBadgeIcon({ extension }: { extension?: string }) {
  const label = normalizeAttachmentExtension(extension);
  const badgeClassName = getAttachmentBadgeClassName(label);

  return (
    <span className="relative shrink-0">
      <span
        className={`rounded-xs absolute top-4.5 px-0.75 pt-1 pb-0.75 text-[10px] font-bold uppercase leading-none! text-white ${badgeClassName}`}
      >
        {label}
      </span>
      <FileTypePlaceholder />
    </span>
  );
}

function QuickLinkButton({
  label,
  icon,
  iconBg,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-gray-200 px-3 py-2 text-left transition last:border-b-0 hover:bg-gray-50 md:px-4 md:py-3"
    >
      <span
        className={`inline-flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full md:h-8 md:w-8 ${iconBg}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-gray-900">
        {label}
      </span>
      <span className="text-gray-500">
        <ChevronRightSmallIcon />
      </span>
    </button>
  );
}

function TicketTimeline({ items }: { items: TicketTimelineItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        imageUrl="/images/NotificationEmptyState.svg"
        imageAlt="No timeline activity"
        title="No Activity"
        description="Timeline activity will appear here once updates happen on this lead."
      />
    );
  }

  return (
    <div className="space-y-0 mt03">
      {items.map((item, index) => {
        const isLastItem = index === items.length - 1;

        return (
          <div key={item.id} className="relative flex gap-2.5 pb-4 last:pb-0">
            {!isLastItem ? (
              <span
                aria-hidden="true"
                className="absolute left-3 top-6 h-[calc(100%-0.25rem)] border border-dashed border-gray-300"
              />
            ) : null}

            <span className="relative z-10 mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-gray-300 bg-white">
                <span className="h-1.5 min-w-1.5 rounded-full bg-gray-300" />
              </span>
            </span>

            <div className="min-w-0 mt-1.5 flex-1">
              <p className="text-xs text-gray-500">
                {formatTimelineDateTime(item.occurredAt)}
              </p>
              <p className="mt-1.5 text-sm text-gray-700">{item.description}</p>
              {item.showStatusBadge ? (
                <span
                  className={clsx(
                    'mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-none',
                    item.statusClassName,
                  )}
                  style={item.statusStyle}
                >
                  {item.status}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChevronRightSmallIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M7 4.5L11.5 9L7 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function normalizeAttachmentExtension(extension?: string) {
  return (extension ?? 'file').replace(/^\./, '').slice(0, 4).toUpperCase();
}

function mergeAttachmentFiles(currentFiles: File[], newFiles: File[]) {
  const filesByKey = new Map<string, File>();

  [...currentFiles, ...newFiles].forEach((file) => {
    filesByKey.set(getAttachmentFileKey(file), file);
  });

  return Array.from(filesByKey.values());
}

function getInlineAttachmentKeys(description: string) {
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

function getDescriptionAttachmentStorageKeys(description: string) {
  if (!description) {
    return new Set<string>();
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  return new Set(
    Array.from(
      parsedDescription.querySelectorAll<HTMLElement>('[data-storage-key]'),
    )
      .map((attachment) => attachment.dataset.storageKey ?? '')
      .filter(Boolean),
  );
}

function removeDescriptionAttachment(description: string, storageKey: string) {
  if (!description || !storageKey) {
    return description;
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  parsedDescription
    .querySelectorAll<HTMLElement>('[data-storage-key]')
    .forEach((attachment) => {
      if (attachment.dataset.storageKey === storageKey) {
        attachment.remove();
      }
    });

  return parsedDescription.body.innerHTML.trim();
}

function removeMissingDescriptionAttachments(
  description: string,
  activeStorageKeys: Set<string>,
) {
  if (!description) {
    return description;
  }

  const parsedDescription = new DOMParser().parseFromString(
    description,
    'text/html',
  );

  parsedDescription
    .querySelectorAll<HTMLElement>('[data-storage-key]')
    .forEach((attachment) => {
      const storageKey = attachment.dataset.storageKey ?? '';

      if (storageKey && !activeStorageKeys.has(storageKey)) {
        attachment.remove();
      }
    });

  return parsedDescription.body.innerHTML.trim();
}

function setsAreEqual(left: Set<string>, right: Set<string>) {
  return (
    left.size === right.size &&
    Array.from(left).every((value) => right.has(value))
  );
}

function deduplicateUploadedFilesByStorageKey(files: UploadedFileDto[]) {
  return Array.from(
    new Map(files.map((file) => [file.storageKey, file])).values(),
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
