'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import {
  AcceptedEmailIcon,
  SentEmailIcon,
  TrashIcon,
} from '../../../public/icons';
import { useIsMobile } from '../hooks/useIsMobile';
import Tooltip from '../tooltip';
import ThemeButton from '../ui/ThemeButton';
import UserProjectsModal from '../modals/UserProjectsModal';

export type UserCardProject = {
  id: string;
  initials: string;
  name: string;
  colorHex: string;
};

export type UserCardRole = {
  label: string;
  tone: 'blue' | 'orange' | 'purple' | 'teal';
  id?: string;
  value?: string;
};

export type UserCardUser = {
  id: string;
  name: string;
  email: string;
  userType?: 'INTERNAL' | 'EXTERNAL' | string;
  isInvitationAccepted: boolean;
  isActive: boolean;
  initials: string;
  accentColor: string;
  avatarUrl?: string;
  roles: UserCardRole[];
  projects: UserCardProject[];
};

type UserCardProps = {
  user: UserCardUser;
  onEdit?: (user: UserCardUser) => void;
  onDelete?: (user: UserCardUser) => void;
  onResendInvite?: (user: UserCardUser) => void;
  onToggleStatus?: (user: UserCardUser) => void;
};

export default function UserCard({
  user,
  onEdit,
  onDelete,
  onResendInvite,
  onToggleStatus,
}: UserCardProps) {
  const isMobile = useIsMobile();

  return (
    <article className="min-w-0 border border-gray-200 bg-gray-50 rounded-2xl flex flex-col">
      <div className="p-2.5 flex flex-col flex-1 gap-4 rounded-t-2xl bg-gray-50">
        <div className="flex flex-row gap-4">
          <Avatar user={user} />
          <div className="flex flex-col flex-1 gap-2">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm text-gray-950">{user.name}</p>
              <p className="text-xs text-gray-600">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Pill key={role.label} label={role.label} tone={role.tone} />
              ))}
            </div>
          </div>
          <div className="xl:flex hidden flex-col items-end gap-1.5">
            {onResendInvite ? (
              <div className="text-warning-600 font-semibold text-xs flex items-center gap-1.5">
                <SentEmailIcon />
                Invite Sent
              </div>
            ) : (
              <>
                <div className="text-green-500 font-semibold text-xs flex items-center gap-1.5">
                  <AcceptedEmailIcon />
                  Invite Accepted
                </div>
                <StatusBadge isActive={user.isActive} />
              </>
            )}
          </div>
        </div>
        <div className="xl:hidden flex flex-col gap-1.5">
          {onResendInvite ? (
            <div className="text-warning-600 font-semibold text-xs flex items-center gap-1.5">
              <SentEmailIcon />
              Invite Sent
            </div>
          ) : (
            <>
              <div className="text-green-500 font-semibold text-xs flex items-center gap-1.5">
                <AcceptedEmailIcon />
                Invite Accepted
              </div>
              <StatusBadge isActive={user.isActive} />
            </>
          )}
        </div>
        <ProjectPillRow projects={user.projects} />
      </div>
      <div className="bg-white rounded-b-2xl p-2.5">
        {onResendInvite || onEdit || onDelete || onToggleStatus ? (
          <div className=" flex gap-2">
            {onResendInvite ? (
              <ThemeButton
                type="button"
                variant="secondary"
                onClick={() => onResendInvite(user)}
                className="w-full"
                size={isMobile ? 'md' : 'lg'}
              >
                Resend Invite
              </ThemeButton>
            ) : onEdit ? (
              <ThemeButton
                type="button"
                onClick={() => onEdit(user)}
                variant="secondary"
                className="w-full"
                iconBg="bg-transparent"
                size={isMobile ? 'md' : 'lg'}
                icon={
                  <EditUserIcon
                    height={isMobile ? '14' : '18'}
                    width={isMobile ? '14' : '18'}
                  />
                }
              >
                Edit User
              </ThemeButton>
            ) : null}

            {onToggleStatus ? (
              <Tooltip
                content=""
                heading={user.isActive ? 'Deactivate User' : 'Activate User'}
              >
                <button
                  type="button"
                  onClick={() => onToggleStatus(user)}
                  className={`py-2 px-2.5 flex items-center justify-center rounded-lg transition border ${
                    user.isActive
                      ? 'bg-warning-100 border-warning-200'
                      : 'bg-green-100 border-green-200'
                  }`}
                  aria-label={
                    user.isActive
                      ? `Deactivate ${user.name}`
                      : `Activate ${user.name}`
                  }
                >
                  {user.isActive ? (
                    <DeactivateIcon
                      height={isMobile ? '16' : '18'}
                      width={isMobile ? '16' : '18'}
                    />
                  ) : (
                    <ActivateIcon
                      height={isMobile ? '16' : '18'}
                      width={isMobile ? '16' : '18'}
                    />
                  )}
                </button>
              </Tooltip>
            ) : null}

            {onDelete ? (
              <Tooltip content="" heading="Delete User">
                <button
                  type="button"
                  onClick={() => onDelete(user)}
                  className="py-2 px-2.5  flex items-center justify-center rounded-lg transition bg-error-100 border border-error-200  "
                  aria-label={`Delete ${user.name}`}
                >
                  <TrashIcon
                    height={isMobile ? '16' : '18'}
                    width={isMobile ? '16' : '18'}
                  />
                </button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function UserCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={index}
          className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
        >
          {/* User information */}
          <div className="flex flex-1 flex-col gap-4 rounded-t-2xl bg-gray-50 p-2.5">
            <div className="flex gap-4">
              {/* Avatar */}
              <div className="h-10.5 w-10.5 shrink-0 rounded-full bg-white shadow-sm" />

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {/* Name and email */}
                <div className="space-y-1.5">
                  <div
                    className={`h-3.5 rounded bg-gray-200 ${
                      index % 2 === 0 ? 'w-24' : 'w-28'
                    }`}
                  />

                  <div className="h-3 w-36 max-w-full rounded bg-gray-200" />
                </div>

                {/* Roles */}
                <div className="flex flex-wrap gap-2">
                  <div className="h-7 w-16 rounded-full bg-gray-200" />
                  <div className="h-7 w-20 rounded-full bg-gray-200" />
                </div>
              </div>

              {/* Invitation status — XL desktop */}
              <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
                <div className="h-4 w-4 rounded bg-gray-200" />
                <div className="h-3 w-16 rounded bg-gray-200" />
              </div>
            </div>

            {/* Invitation status — Mobile/tablet */}
            <div className="flex items-center gap-1.5 xl:hidden">
              <div className="h-4 w-4 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-200" />
            </div>

            {/* Projects */}
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 2 }).map((_, projectIndex) => (
                <div
                  key={projectIndex}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-0.5 pr-2.5 pl-0.5"
                >
                  <div className="h-6 w-6 shrink-0 rounded-full bg-gray-200" />

                  <div
                    className={`h-3 rounded bg-gray-200 ${
                      projectIndex === 0 ? 'w-16' : 'w-20'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-b-2xl bg-white p-2.5">
            <div className="flex gap-2">
              <div className="h-10 min-w-0 flex-1 rounded-lg bg-gray-100 xl:h-11" />

              <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-100 xl:h-11 xl:w-11" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Avatar({ user }: { user: UserCardUser }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="h-10.5 w-10.5 shrink-0 rounded-full object-cover drop-shadow-sm"
      />
    );
  }

  return (
    <span
      className="flex h-10.5 w-10.5 shrink-0 items-center justify-center rounded-full bg-white text-sm md:text-base font-semibold drop-shadow-sm"
      style={{ color: user.accentColor }}
    >
      {user.initials}
    </span>
  );
}

function Pill({ label, tone }: { label: string; tone: UserCardRole['tone'] }) {
  const toneClasses: Record<UserCardRole['tone'], string> = {
    blue: 'border-[#B2DDFF] bg-[#F0F9FF] text-[#0BA5EC]',
    orange: 'border-[#FEC84B] bg-[#FFFAEB] text-[#F79009]',
    purple: 'border-[#E9D7FE] bg-[#F9F5FF] text-[#875BF7]',
    teal: 'border-[#99F6E4] bg-[#ECFDF3] text-[#14B8A6]',
  };

  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs md:text-xs font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function ProjectPillRow({ projects }: { projects: UserCardProject[] }) {
  const [projectsOpen, setProjectsOpen] = useState(false);
  const countButtonRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const countClass =
    'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white px-1.5 text-xs font-semibold text-gray-700';

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    const update = () => {
      const widths = Array.from(
        measure.querySelectorAll<HTMLElement>('[data-project-width]'),
        (item) => item.getBoundingClientRect().width,
      );
      const counters =
        measure.querySelectorAll<HTMLElement>('[data-count-width]');
      const available = row.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      let used = 0;
      let fit = 0;
      for (let count = 0; count <= widths.length; count++) {
        if (count > 0) used += widths[count - 1] + (count > 1 ? gap : 0);
        const remaining = widths.length - count;
        const required =
          used +
          (remaining
            ? (count ? gap : 0) +
              counters[remaining - 1].getBoundingClientRect().width
            : 0);
        if (required <= available) fit = count;
      }
      setVisibleCount(fit);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [projects]);

  const visible = Math.min(visibleCount, projects.length);
  const hidden = projects.slice(visible);
  return (
    <div className="relative min-w-0">
      <div ref={rowRef} className="flex min-w-0 items-center gap-2">
        {projects.slice(0, visible).map((project) => (
          <ProjectPill key={project.id} project={project} />
        ))}
        {hidden.length > 0 ? (
          <Tooltip
            content=""
            heading={hidden.map((project) => project.name).join(', ')}
          >
            <button
              type="button"
              ref={countButtonRef}
              onClick={() => setProjectsOpen(true)}
              aria-haspopup="dialog"
              className={countClass}
              aria-label={`${hidden.length} more projects: ${hidden.map((project) => project.name).join(', ')}`}
            >
              +{hidden.length}
            </button>
          </Tooltip>
        ) : null}
      </div>
      {projectsOpen ? (
        <UserProjectsModal
          projects={projects}
          onClose={() => {
            setProjectsOpen(false);
            countButtonRef.current?.focus();
          }}
        />
      ) : null}
      <div
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
        aria-hidden="true"
        inert
      >
        <div ref={measureRef} className="flex w-max items-center gap-2">
          {projects.map((project) => (
            <span key={project.id} data-project-width className="flex shrink-0">
              <ProjectPill project={project} />
            </span>
          ))}
          {projects.map((project, index) => (
            <span key={project.id} data-count-width className={countClass}>
              +{index + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectPill({ project }: { project: UserCardProject }) {
  return (
    <span
      className="inline-flex w-fit shrink-0 whitespace-nowrap items-center gap-2 rounded-full bg-white border border-gray-200 pe-2.5 ps-0.5 py-0.5  text-xs md:text-sm font-medium"
      style={{
        color: project.colorHex,
        // backgroundColor: `${project.colorHex}1A`,
      }}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs  shadow-sm"
        style={{
          backgroundColor: `${project.colorHex}1A`,
        }}
      >
        {project.initials}
      </span>
      <Tooltip content="" heading={project.name}>
        <div className="max-w-44 cursor-pointer truncate w-full">
          <span className="text-xs text-gray-800 truncate max-w-44">
            {project.name}
          </span>
        </div>
      </Tooltip>
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        isActive
          ? 'border-green-200 bg-green-50 text-green-600'
          : 'border-gray-200 bg-gray-100 text-gray-600'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function DeactivateIcon({ width = '18', height = '18' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="9" cy="9" r="7.5" stroke="#B54708" strokeWidth="1.5" />
      <path
        d="M4.5 4.5L13.5 13.5"
        stroke="#B54708"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ActivateIcon({ width = '18', height = '18' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 1.6875C9.31066 1.6875 9.5625 1.93934 9.5625 2.25V9.1875C9.5625 9.49816 9.31066 9.75 9 9.75C8.68934 9.75 8.4375 9.49816 8.4375 9.1875V2.25C8.4375 1.93934 8.68934 1.6875 9 1.6875Z"
        fill="#067647"
      />
      <path
        d="M4.98652 4.60547C5.18822 4.84631 5.15674 5.20572 4.9159 5.40742C3.68495 6.4391 2.90625 7.96761 2.90625 9.67497C2.90625 12.7636 5.4114 15.2687 8.5 15.2687C11.5886 15.2687 14.0938 12.7636 14.0938 9.67497C14.0938 7.96761 13.315 6.4391 12.0841 5.40742C11.8433 5.20572 11.8118 4.84631 12.0135 4.60547C12.2152 4.36463 12.5746 4.33315 12.8154 4.53485C14.3167 5.79437 15.2812 7.68355 15.2812 9.67497C15.2812 13.4197 12.2447 16.4562 8.5 16.4562C4.75532 16.4562 1.71875 13.4197 1.71875 9.67497C1.71875 7.68355 2.68331 5.79437 4.18455 4.53485C4.42539 4.33315 4.78481 4.36463 4.98652 4.60547Z"
        fill="#067647"
      />
    </svg>
  );
}

function EditUserIcon({ width = '18', height = '18' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.06238 4.875C5.06238 2.70038 6.82526 0.9375 8.99988 0.9375C11.1745 0.9375 12.9374 2.70038 12.9374 4.875C12.9374 7.04962 11.1745 8.8125 8.99988 8.8125C6.82526 8.8125 5.06238 7.04962 5.06238 4.875ZM8.99988 2.0625C7.44658 2.0625 6.18738 3.3217 6.18738 4.875C6.18738 6.4283 7.44658 7.6875 8.99988 7.6875C10.5532 7.6875 11.8124 6.4283 11.8124 4.875C11.8124 3.3217 10.5532 2.0625 8.99988 2.0625Z"
        fill="#020F52"
      />
      <path
        d="M10.3423 11.361C8.39264 10.7914 6.24622 11.0374 4.47097 12.0945C4.34511 12.1694 4.2072 12.2477 4.06274 12.3296C3.52828 12.6328 2.90405 12.987 2.46898 13.4128C2.19889 13.6772 2.08376 13.8953 2.06534 14.0638C2.05071 14.1976 2.08453 14.4182 2.42251 14.7401C3.19939 15.4803 3.98883 15.9375 4.94316 15.9375H7.87501C8.18567 15.9375 8.43751 16.1893 8.43751 16.5C8.43751 16.8106 8.18567 17.0625 7.87501 17.0625H4.94316C3.57943 17.0625 2.52509 16.3917 1.64651 15.5547C1.13724 15.0695 0.883394 14.5234 0.946999 13.9415C1.00681 13.3944 1.3358 12.9478 1.68205 12.6089C2.23567 12.067 3.04381 11.611 3.57842 11.3094C3.70039 11.2406 3.80819 11.1798 3.89541 11.1279C5.94588 9.90693 8.41596 9.6262 10.6577 10.2811C10.9559 10.3682 11.1271 10.6806 11.0399 10.9788C10.9528 11.277 10.6405 11.4481 10.3423 11.361Z"
        fill="#020F52"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.6558 9.39062C15.1529 9.11139 14.5424 9.12066 14.048 9.41468C13.8417 9.53736 13.662 9.73256 13.4578 9.95435L10.223 13.4592C9.86771 13.8436 9.60145 14.1317 9.44438 14.4933C9.28771 14.8539 9.25733 15.247 9.21659 15.774L9.19964 15.9919C9.19259 16.0813 9.18349 16.1969 9.18915 16.2984C9.19606 16.4225 9.22762 16.6121 9.37622 16.7808C9.5265 16.9513 9.71285 17.0058 9.83875 17.0268C9.9395 17.0436 10.0553 17.0465 10.1427 17.0487L10.353 17.0543C10.9531 17.0704 11.4098 17.0828 11.8337 16.9172C12.2563 16.7521 12.5868 16.4333 13.0233 16.0122L16.3159 12.841C16.5337 12.6316 16.7243 12.4486 16.8435 12.2394C17.1268 11.7423 17.1355 11.1319 16.8668 10.6269C16.7537 10.4143 16.5686 10.2257 16.3569 10.0099L16.3095 9.96157L16.2615 9.91248C16.0511 9.69697 15.8657 9.50713 15.6558 9.39062ZM14.6231 10.3816C14.7736 10.2921 14.9571 10.2894 15.1098 10.3742C15.1558 10.3998 15.2177 10.4545 15.5055 10.7485C15.7926 11.0418 15.8474 11.106 15.8736 11.1553C15.9612 11.3199 15.9582 11.5207 15.8661 11.6823C15.8385 11.7307 15.7821 11.7931 15.4867 12.0776L12.3129 15.1344C11.7738 15.6537 11.6111 15.7964 11.4244 15.8693C11.2428 15.9402 11.0361 15.9462 10.333 15.9283C10.3824 15.2959 10.4046 15.1063 10.4762 14.9415C10.5479 14.7765 10.6706 14.6329 11.1046 14.1628L14.238 10.7679C14.5172 10.4654 14.5776 10.4086 14.6231 10.3816Z"
        fill="#020F52"
      />
    </svg>
  );
}
