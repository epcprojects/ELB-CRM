'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Image from '@tiptap/extension-image';
import { Node, mergeAttributes } from '@tiptap/core';
import clsx from 'clsx';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  getAttachmentFileKey,
} from '../lib/attachments';

// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  BoldIcon,
  CommaEndIcon,
  CommaStartIcon,
  FileIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  StrokeIcon,
  UnderlineIcon,
  UnorderedListIcon,
} from 'apps/frontend/public/icons';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onEnter?: () => Promise<void> | void;

  name?: string;
  label?: string;
  placeholder?: string;
  errorText?: string;
  maxLength?: number;

  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;

  showToolbar?: boolean;
  showCharacterCount?: boolean;

  editorHeight?: string;
  className?: string;
  editorClassName?: string;
  autoGrow?: boolean;
  autoGrowMaxHeight?: number;
  onAttachmentFilesAdded?: (files: File[]) => boolean;
  onPastedAttachmentFilesAdded?: (files: File[]) => boolean;
  mentionMembers?: Array<{
    id: string;
    fullName: string;
    email?: string | null;
  }>;
  toolbarEndAction?: ReactNode;
};

type MentionRange = { from: number; to: number };
type MentionMenuPosition = {
  left: number;
  top: number;
  placement: 'above' | 'below';
};

const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      attachmentKey: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-attachment-key'),
        renderHTML: (attributes) =>
          attributes.attachmentKey
            ? { 'data-attachment-key': attributes.attachmentKey }
            : {},
      },
      storageKey: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-storage-key'),
        renderHTML: (attributes) =>
          attributes.storageKey
            ? { 'data-storage-key': attributes.storageKey }
            : {},
      },
    };
  },
});

const AttachmentFile = Node.create({
  name: 'attachmentFile',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      fileName: { default: 'Attachment' },
      mimeType: { default: 'application/octet-stream' },
      kind: { default: 'file' },
      attachmentKey: { default: null },
      storageKey: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-attachment-node]',
        getAttrs: (element) => {
          const node = element as HTMLElement;

          return {
            src: node.dataset.src ?? '',
            fileName: node.dataset.fileName ?? 'Attachment',
            mimeType: node.dataset.mimeType ?? 'application/octet-stream',
            kind: node.dataset.kind ?? 'file',
            attachmentKey: node.dataset.attachmentKey ?? null,
            storageKey: node.dataset.storageKey ?? null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, fileName, mimeType, kind, attachmentKey, storageKey } =
      HTMLAttributes;
    const wrapperAttributes = mergeAttributes({
      'data-attachment-node': '',
      'data-src': src,
      'data-file-name': fileName,
      'data-mime-type': mimeType,
      'data-kind': kind,
      ...(attachmentKey ? { 'data-attachment-key': attachmentKey } : {}),
      ...(storageKey ? { 'data-storage-key': storageKey } : {}),
      class: `rich-text-attachment rich-text-attachment-${kind}`,
    });

    if (kind === 'video') {
      return [
        'div',
        wrapperAttributes,
        ['video', { src, controls: 'true', preload: 'metadata' }],
        ['span', {}, fileName],
      ];
    }

    if (kind === 'audio') {
      return [
        'div',
        wrapperAttributes,
        ['span', {}, fileName],
        ['audio', { src, controls: 'true', preload: 'metadata' }],
      ];
    }

    return [
      'div',
      wrapperAttributes,
      [
        'a',
        { href: src, target: '_blank', rel: 'noopener noreferrer' },
        fileName,
      ],
    ];
  },
});

const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention-id]',
        getAttrs: (element) => ({
          id: (element as HTMLElement).dataset.mentionId ?? '',
          label: (element as HTMLElement).dataset.mentionLabel ?? '',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        'data-mention-id': node.attrs.id,
        'data-mention-label': node.attrs.label,
        class: 'rich-text-mention',
      },
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
});

type ToolbarButtonProps = {
  children: ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolbarButton({
  children,
  title,
  active = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();

        if (!disabled) {
          onClick();
        }
      }}
      className={clsx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm',
        'transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-35',
        active
          ? 'bg-gray-100 text-gray-900'
          : 'bg-white text-gray-900 hover:bg-gray-100',
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  disabled,
  onAttachFile,
  endAction,
}: {
  editor: Editor;
  disabled: boolean;
  onAttachFile?: () => void;
  endAction?: ReactNode;
}) {
  const toolbarState = useEditorState({
    editor,

    selector: ({ editor: currentEditor }) => ({
      isBold: currentEditor.isActive('bold'),
      isItalic: currentEditor.isActive('italic'),
      isUnderline: currentEditor.isActive('underline'),
      isStrike: currentEditor.isActive('strike'),
      isOrderedList: currentEditor.isActive('orderedList'),
      isBulletList: currentEditor.isActive('bulletList'),
      isLink: currentEditor.isActive('link'),
    }),
  });

  const handleLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;

    const url = window.prompt(
      toolbarState.isLink
        ? 'Edit URL. Leave empty to remove the link.'
        : 'Enter URL',
      previousUrl ?? 'https://',
    );

    if (url === null) {
      return;
    }

    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();

      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({
        href: normalizedUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
      })
      .run();
  };

  return (
    <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-0.5 border-b border-gray-200 bg-white p-1">
      <ToolbarButton
        title="Bold"
        active={toolbarState.isBold}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleBold().run();
        }}
      >
        <BoldIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Italic"
        active={toolbarState.isItalic}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleItalic().run();
        }}
      >
        <ItalicIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Underline"
        active={toolbarState.isUnderline}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleUnderline().run();
        }}
      >
        <UnderlineIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Strikethrough"
        active={toolbarState.isStrike}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleStrike().run();
        }}
      >
        <StrokeIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Insert opening quote"
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().insertContent('\u201C').run();
        }}
      >
        <CommaStartIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Insert closing quote"
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().insertContent('\u201D').run();
        }}
      >
        <CommaEndIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Ordered list"
        active={toolbarState.isOrderedList}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleOrderedList().run();
        }}
      >
        <OrderedListIcon />
      </ToolbarButton>

      <ToolbarButton
        title="Unordered list"
        active={toolbarState.isBulletList}
        disabled={disabled}
        onClick={() => {
          editor.chain().focus().toggleBulletList().run();
        }}
      >
        <UnorderedListIcon />
      </ToolbarButton>

      <ToolbarButton
        title={toolbarState.isLink ? 'Edit or remove link' : 'Add link'}
        active={toolbarState.isLink}
        disabled={disabled}
        onClick={handleLink}
      >
        <LinkIcon />
      </ToolbarButton>

      {onAttachFile ? (
        <ToolbarButton
          title="Attach files"
          disabled={disabled}
          onClick={onAttachFile}
        >
          <FileIcon height={12} width={12} />
        </ToolbarButton>
      ) : null}

      {endAction ? <div className="ml-auto">{endAction}</div> : null}
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  onEnter,
  name,
  label,
  placeholder = 'Start typing...',
  errorText,
  maxLength,
  required = false,
  disabled = false,
  readOnly = false,
  showToolbar = true,
  showCharacterCount = true,
  editorHeight = 'h-30',
  className,
  editorClassName,
  autoGrow = false,
  autoGrowMaxHeight = 320,
  onAttachmentFilesAdded,
  onPastedAttachmentFilesAdded,
  mentionMembers = [],
  toolbarEndAction,
}: RichTextEditorProps) {
  const [characterCount, setCharacterCount] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionMenuPosition, setMentionMenuPosition] =
    useState<MentionMenuPosition | null>(null);
  const [autoGrowHeight, setAutoGrowHeight] = useState(72);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const editorRef = useRef<Editor | null>(null);
  const onEnterRef = useRef(onEnter);
  const mentionRangeRef = useRef<MentionRange | null>(null);
  const activeMentionIndexRef = useRef(0);
  const mentionMembersRef = useRef(mentionMembers);
  const filteredMentionMembersRef = useRef(mentionMembers.slice(0, 6));
  onEnterRef.current = onEnter;
  mentionMembersRef.current = mentionMembers;

  const updateMentionSuggestions = (currentEditor: Editor) => {
    if (!mentionMembersRef.current.length || !currentEditor.isEditable) {
      setMentionRange(null);
      mentionRangeRef.current = null;
      setMentionMenuPosition(null);
      return;
    }

    const { $from } = currentEditor.state.selection;
    const textBeforeCursor = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      '\n',
    );
    const match = textBeforeCursor.match(/(?:^|\s)@([^@\s]*)$/);

    if (!match) {
      setMentionRange(null);
      mentionRangeRef.current = null;
      setMentionMenuPosition(null);
      return;
    }

    const query = match[1] ?? '';
    const caret = currentEditor.view.coordsAtPos($from.pos);
    const menuWidth = 208;
    const menuEstimatedHeight = 220;
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - caret.bottom;
    const placement =
      spaceBelow >= menuEstimatedHeight || caret.top < menuEstimatedHeight
        ? 'below'
        : 'above';

    setMentionMenuPosition({
      left: Math.min(
        Math.max(caret.left, viewportPadding),
        window.innerWidth - menuWidth - viewportPadding,
      ),
      top: placement === 'below' ? caret.bottom + 6 : caret.top - 6,
      placement,
    });
    setMentionQuery(query);
    const nextRange = {
      from: $from.pos - query.length - 1,
      to: $from.pos,
    };
    setMentionRange(nextRange);
    mentionRangeRef.current = nextRange;
    setActiveMentionIndex(0);
    activeMentionIndexRef.current = 0;
  };

  const insertMention = (
    currentEditor: Editor,
    member: { id: string; fullName: string },
    range = mentionRangeRef.current,
  ) => {
    if (!range) return;

    currentEditor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        {
          type: 'mention',
          attrs: { id: member.id, label: member.fullName.trim() },
        },
        { type: 'text', text: ' ' },
      ])
      .run();
    setMentionRange(null);
    mentionRangeRef.current = null;
    setMentionMenuPosition(null);
  };

  const filteredMentionMembers = mentionRange
    ? mentionMembers
        .filter((member) => {
          const query = mentionQuery.trim().toLowerCase();
          return (
            !query ||
            member.fullName.toLowerCase().includes(query) ||
            member.email?.toLowerCase().includes(query)
          );
        })
        .slice(0, 6)
    : [];
  filteredMentionMembersRef.current = filteredMentionMembers;

  useEffect(() => {
    if (mentionMembers.length) return;

    mentionRangeRef.current = null;
    filteredMentionMembersRef.current = [];
    setMentionRange(null);
    setMentionMenuPosition(null);
  }, [mentionMembers.length]);

  useEffect(() => {
    if (!autoGrow || !editorRef.current) return;

    const container = editorContainerRef.current;
    const scrollArea = editorScrollAreaRef.current;
    const editorElement = scrollArea?.querySelector<HTMLElement>('.tiptap');

    if (!container || !scrollArea || !editorElement) return;

    const updateHeight = () => {
      const fixedHeight = Array.from(container.children).reduce(
        (height, child) =>
          child === scrollArea
            ? height
            : height + (child as HTMLElement).offsetHeight,
        2,
      );
      const nextHeight = Math.min(
        autoGrowMaxHeight,
        Math.max(72, fixedHeight + editorElement.scrollHeight),
      );

      setAutoGrowHeight(nextHeight);
    };

    const frameId = window.requestAnimationFrame(updateHeight);
    const resizeObserver = new ResizeObserver(updateHeight);
    const mutationObserver = new MutationObserver(updateHeight);

    resizeObserver.observe(editorElement);
    mutationObserver.observe(editorElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    editorElement.querySelectorAll('img, video, audio').forEach((media) => {
      media.addEventListener('load', updateHeight);
      media.addEventListener('loadedmetadata', updateHeight);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      editorElement.querySelectorAll('img, video, audio').forEach((media) => {
        media.removeEventListener('load', updateHeight);
        media.removeEventListener('loadedmetadata', updateHeight);
      });
    };
  }, [autoGrow, autoGrowMaxHeight, characterCount, value]);

  const addAttachmentFiles = (
    currentEditor: Editor,
    files: File[],
    onFilesAdded = onAttachmentFilesAdded,
  ) => {
    const normalizedFiles = files.map((file, index) =>
      file.type.startsWith('image/')
        ? normalizePastedImageFile(file, index)
        : file,
    );

    if (!normalizedFiles.length || !onFilesAdded?.(normalizedFiles)) {
      return false;
    }

    const imageFiles = normalizedFiles.filter((file) =>
      file.type.startsWith('image/'),
    );
    const otherFiles = normalizedFiles.filter(
      (file) => !file.type.startsWith('image/'),
    );

    const images = imageFiles.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(objectUrl);

      return {
        type: 'image',
        attrs: {
          src: objectUrl,
          alt: file.name,
          attachmentKey: getAttachmentFileKey(file),
        },
      };
    });

    const attachments = otherFiles.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(objectUrl);

      return {
        type: 'attachmentFile',
        attrs: {
          src: objectUrl,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          kind: getAttachmentPreviewKind(file),
          attachmentKey: getAttachmentFileKey(file),
        },
      };
    });

    currentEditor
      .chain()
      .focus()
      .insertContent([...images, ...attachments])
      .run();

    return true;
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled && !readOnly,

    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,

        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,

          HTMLAttributes: {
            class: 'text-primary underline underline-offset-2 cursor-pointer',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      }),

      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),

      CharacterCount.configure({
        limit: maxLength ?? null,
        mode: 'textSize',
      }),

      AttachmentImage.configure({
        allowBase64: false,
        inline: true,
        HTMLAttributes: {
          class: 'rich-text-image',
        },
        resize: {
          enabled: true,
          directions: ['top', 'bottom', 'left', 'right'],
          minWidth: 50,
          minHeight: 50,
          alwaysPreserveAspectRatio: true,
        },
      }),
      AttachmentFile,
      MentionNode,
    ],

    content: value || '',

    editorProps: {
      attributes: {
        id: name ?? '',
        role: 'textbox',
        'aria-label': label ?? placeholder,
        'aria-invalid': errorText ? 'true' : 'false',

        class: clsx(
          'tiptap min-h-full w-full px-3.5 py-2',
          'text-sm font-medium text-gray-700 outline-none md:text-base',
          autoGrow && 'min-h-0!',
          disabled && 'cursor-not-allowed',
          editorClassName,
        ),
      },
      handlePaste: (_view, event): boolean => {
        const pastedFiles = Array.from(event.clipboardData?.files ?? []);

        const handlePastedFiles =
          onPastedAttachmentFilesAdded ?? onAttachmentFilesAdded;

        if (!pastedFiles.length || !handlePastedFiles) {
          return false;
        }

        const currentEditor = editorRef.current;

        return currentEditor
          ? addAttachmentFiles(currentEditor, pastedFiles, handlePastedFiles)
          : false;
      },
      handleKeyDown: (_view, event): boolean => {
        const members = filteredMentionMembersRef.current;

        if (mentionRangeRef.current && members.length) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex =
              (activeMentionIndexRef.current + direction + members.length) %
              members.length;
            activeMentionIndexRef.current = nextIndex;
            setActiveMentionIndex(nextIndex);
            return true;
          }

          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const member = members[activeMentionIndexRef.current];
            if (member && editorRef.current)
              insertMention(editorRef.current, member);
            return true;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            mentionRangeRef.current = null;
            setMentionRange(null);
            setMentionMenuPosition(null);
            return true;
          }
        }

        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          onEnterRef.current
        ) {
          event.preventDefault();
          void onEnterRef.current();
          return true;
        }

        return false;
      },
    },

    onCreate: ({ editor: currentEditor }) => {
      editorRef.current = currentEditor;
      setCharacterCount(currentEditor.storage.characterCount.characters());
    },

    onDestroy: () => {
      editorRef.current = null;
    },

    onUpdate: ({ editor: currentEditor }) => {
      setCharacterCount(currentEditor.storage.characterCount.characters());
      updateMentionSuggestions(currentEditor);

      onChange(currentEditor.isEmpty ? '' : currentEditor.getHTML());
    },

    onSelectionUpdate: ({ editor: currentEditor }) => {
      updateMentionSuggestions(currentEditor);
    },

    onBlur: () => {
      onBlur?.();
    },
  });

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextValue = value || '';

    const currentValue = editor.isEmpty ? '' : editor.getHTML();

    if (nextValue === currentValue) {
      return;
    }

    editor.commands.setContent(nextValue, {
      emitUpdate: false,
    });

    setCharacterCount(editor.storage.characterCount.characters());
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled && !readOnly);
  }, [editor, disabled, readOnly]);

  return (
    <div className={clsx('relative w-full', className)}>
      {label ? (
        <label
          htmlFor={name}
          className="mb-1.5 block text-sm font-normal text-gray-800 md:text-base"
        >
          {label}

          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label>
      ) : null}

      <div
        ref={editorContainerRef}
        className={clsx(
          'rich-text-editor flex min-h-0 flex-col overflow-hidden rounded-lg border bg-transparent',
          'transition-[height,border-color] duration-200 ease-out focus-within:border-gray-400',
          !autoGrow && editorHeight,
          errorText ? 'border-red-500' : 'border-gray-200',
          disabled && 'cursor-not-allowed bg-gray-100 opacity-70',
        )}
        style={autoGrow ? { height: autoGrowHeight } : undefined}
      >
        {editor && showToolbar && !readOnly ? (
          <>
            <EditorToolbar
              editor={editor}
              disabled={disabled}
              onAttachFile={
                onAttachmentFilesAdded
                  ? () => attachmentInputRef.current?.click()
                  : undefined
              }
              endAction={toolbarEndAction}
            />
            {onAttachmentFilesAdded ? (
              <input
                ref={attachmentInputRef}
                type="file"
                accept={ALLOWED_ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => {
                  addAttachmentFiles(
                    editor,
                    Array.from(event.target.files ?? []),
                  );
                  event.target.value = '';
                }}
              />
            ) : null}
          </>
        ) : null}

        {editor ? (
          <div
            ref={editorScrollAreaRef}
            className={clsx(
              'rich-text-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain',
            )}
          >
            <EditorContent className="h-full" editor={editor} />
          </div>
        ) : (
          <div className={clsx('w-full shrink-0 px-3.5 py-4', editorHeight)} />
        )}
      </div>

      {filteredMentionMembers.length && mentionMenuPosition
        ? createPortal(
            <div
              className="fixed z-9999 max-h-52 w-52 scrollbar-thin overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
              style={{
                left: mentionMenuPosition.left,
                top: mentionMenuPosition.top,
                transform:
                  mentionMenuPosition.placement === 'above'
                    ? 'translateY(-100%)'
                    : undefined,
              }}
              role="listbox"
              aria-label="Project members"
            >
              {filteredMentionMembers.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (editorRef.current)
                      insertMention(editorRef.current, member);
                  }}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-gray-100',
                    activeMentionIndex === index && 'bg-gray-100',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      getMentionAvatarColor(member.fullName),
                    )}
                  >
                    {getMentionInitials(member.fullName)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-[#10175A]">
                    {member.fullName}
                  </span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {errorText || (showCharacterCount && maxLength !== undefined) ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-xs text-red-600">{errorText || ''}</p>

          {showCharacterCount && maxLength !== undefined ? (
            <p
              className={clsx(
                'shrink-0 text-xs',
                characterCount >= maxLength ? 'text-red-600' : 'text-gray-500',
              )}
            >
              {characterCount}/{maxLength}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function normalizePastedImageFile(file: File, index: number) {
  if (/\.(?:jpe?g|png|svg|webp)$/i.test(file.name)) {
    return file;
  }

  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  };
  const extension = extensionByMimeType[file.type.toLowerCase()];

  if (!extension) {
    return file;
  }

  return new File(
    [file],
    `pasted-image-${file.lastModified || Date.now()}-${index + 1}.${extension}`,
    {
      type: file.type,
      lastModified: file.lastModified,
    },
  );
}

function getAttachmentPreviewKind(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (file.type.startsWith('video/') || ['mp4', 'mov'].includes(extension)) {
    return 'video';
  }

  if (file.type.startsWith('audio/') || ['mp3', 'wav'].includes(extension)) {
    return 'audio';
  }

  return 'file';
}

const mentionAvatarColors = [
  'bg-red-100 text-red-700',
  'bg-orange-100 text-orange-700',
  'bg-amber-100 text-amber-700',
  'bg-green-100 text-green-700',
  'bg-emerald-100 text-emerald-700',
  'bg-teal-100 text-teal-700',
  'bg-cyan-100 text-cyan-700',
  'bg-blue-100 text-blue-700',
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
] as const;

function getMentionInitials(fullName: string) {
  return (
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

function getMentionAvatarColor(fullName: string) {
  let hash = 0;

  for (const character of fullName.trim().toLowerCase()) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }

  return mentionAvatarColors[Math.abs(hash) % mentionAvatarColors.length];
}
