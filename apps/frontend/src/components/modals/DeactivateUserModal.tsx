'use client';

import AppModal from './AppModal';
import ThemeButton from '../ui/ThemeButton';

type DeactivateUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  onConfirm?: () => void | Promise<void>;
};

export default function DeactivateUserModal({
  isOpen,
  onClose,
  userName,
  onConfirm,
}: DeactivateUserModalProps) {
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      showHeader={false}
      roundedCustom
      outSideClickClose={false}
      scrollNeeded={false}
      size="small"
    >
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <DeactivateUserIcon />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
            aria-label="Close deactivate modal"
          >
            <CloseCrossIcon />
          </button>
        </div>

        <div className="mt-3">
          <h2 className="text-xl md:text-2xl font-semibold text-gray-900">
            Deactivate User?
          </h2>
          <p className="mt-2 text-base leading-6 text-gray-900">
            Are you sure you want to deactivate{' '}
            <span className="font-semibold">“{userName ?? 'this user'}”</span>?
            They won&apos;t be able to log in or reset their password until
            reactivated.
          </p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ThemeButton
            variant="secondary"
            className="w-full border-gray-200"
            onClick={onClose}
          >
            Cancel
          </ThemeButton>
          <button
            type="button"
            onClick={() => void onConfirm?.()}
            className="w-full rounded-lg bg-[#B54708] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Yes, Deactivate
          </button>
        </div>
      </div>
    </AppModal>
  );
}

function DeactivateUserIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="22" cy="22" r="18" fill="#FFFAEB" />
      <circle cx="22" cy="22" r="11" stroke="#B54708" strokeWidth="2" />
      <path
        d="M15.5 15.5L28.5 28.5"
        stroke="#B54708"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseCrossIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 5L15 15M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
