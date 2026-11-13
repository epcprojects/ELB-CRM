'use client';

import type { ReactNode } from 'react';
import AppModal from './AppModal';
import { useIsMobile } from '../hooks/useIsMobile';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { CloseIcon } from 'apps/frontend/public/icons';

type TicketDescriptionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  descriptionHtml: string;
  repliesPanel?: ReactNode;
  headerAction?: ReactNode;
  headerUser?: ReactNode;
  Username?: string;
};

export default function TicketDescriptionModal({
  isOpen,
  onClose,
  title,
  descriptionHtml,
  repliesPanel,
  headerAction,
  headerUser,
  Username,
}: TicketDescriptionModalProps) {
  const isMobile = useIsMobile();
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={Username}
      icon={headerUser}
      size="extraLarge"
      showFooter={false}
      scrollNeeded={false}
      showHeader={false}
      headerAction={isMobile ? '' : headerAction}
      fullScreen={isMobile ? false : true}
      bodyPaddingClasses="min-h-0 flex flex-1 overflow-hidden p-0! "
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white">
        <div
          className={`grid shrink-0 grid-cols-1 border-b border-gray-200 ${
            repliesPanel ? 'xl:grid-cols-2' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="text-lg font-semibold text-black">Lead Details</h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close lead details"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 ${
                repliesPanel ? 'xl:hidden' : ''
              }`}
            >
              <CloseIcon />
            </button>
          </div>

          {repliesPanel ? (
            <div className="hidden items-center justify-between gap-3 border-l border-gray-200 px-4 py-3 xl:flex">
              <h2 className="text-lg font-semibold text-black">Replies</h2>

              <div className="flex items-center gap-4">
                {headerAction}

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close lead details"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div
          className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden ${
            repliesPanel ? 'xl:grid-cols-2' : ''
          }`}
        >
          <div className="min-h-0 min-w-0 overflow-y-auto p-4 scrollbar-thin xl:p-5">
            <div className="rounded-lg bg-gray-100 px-3 py-1.5">
              <h2 className="wrap-break-word text-sm font-medium text-gray-900">
                {title}
              </h2>
            </div>

            <div
              className="rich-text-content mt-2 wrap-break-word text-sm text-gray-700"
              dangerouslySetInnerHTML={{
                __html: descriptionHtml,
              }}
            />
          </div>

          {repliesPanel ? (
            <div className="hidden min-h-0 min-w-0 overflow-hidden xl:block">
              {repliesPanel}
            </div>
          ) : null}
        </div>
      </div>
    </AppModal>
  );
}
