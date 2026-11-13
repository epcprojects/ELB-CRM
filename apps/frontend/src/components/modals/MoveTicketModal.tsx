'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckedBoxIcon,
  MoveProjectModalIcon,
  UncheckedBoxIcon,
} from '../../../public/icons';
import Dropdown from '../ui/ThemeDropDown';
import AppModal from './AppModal';

export type MoveTicketProjectOption = { id: string; name: string };

type MoveTicketModalProps = {
  isOpen: boolean;
  ticketRefNo?: string;
  ticketTitle: string;
  currentProject: MoveTicketProjectOption;
  projects: MoveTicketProjectOption[];
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (targetProjectId: string) => void | Promise<void>;
};

export default function MoveTicketModal({
  isOpen,
  ticketRefNo,
  ticketTitle,
  currentProject,
  projects,
  isSubmitting = false,
  onClose,
  onConfirm,
}: MoveTicketModalProps) {
  const [targetProjectId, setTargetProjectId] = useState('');
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const targetProjects = useMemo(
    () =>
      projects
        .filter((project) => project.id !== currentProject.id)
        .map((project) => ({ label: project.name, value: project.id })),
    [currentProject.id, projects],
  );
  const selectedProject = targetProjects.find(
    (project) => project.value === targetProjectId,
  );

  useEffect(() => {
    if (!isOpen) {
      setTargetProjectId('');
      setIsAcknowledged(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (
      targetProjectId &&
      !targetProjects.some((project) => project.value === targetProjectId)
    ) {
      setTargetProjectId('');
      setIsAcknowledged(false);
    }
  }, [targetProjectId, targetProjects]);

  const handleClose = () => {
    if (isSubmitting) return;
    setTargetProjectId('');
    setIsAcknowledged(false);
    onClose();
  };

  const handleConfirm = async () => {
    if (!targetProjectId || !isAcknowledged || isSubmitting) return;
    try {
      await onConfirm(targetProjectId);
    } catch {
      // The parent reports the error and leaves this modal open for retry.
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Ticket Project"
      subtitle="Select a new project for this ticket."
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-b from-[#40C3FF] to-[#304FFD] text-white">
          <MoveProjectModalIcon />
        </span>
      }
      size="small"
      outSideClickClose={false}
      scrollNeeded={false}
      showFooter
      cancelLabel="Cancel"
      confirmLabel={isSubmitting ? 'Moving...' : 'Confirm Move'}
      confimBtnDisable={!targetProjectId || !isAcknowledged || isSubmitting}
      disableCloseButton={isSubmitting}
      onCancel={handleClose}
      onConfirm={() => void handleConfirm()}
    >
      <div className="space-y-4 p-4 md:p-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-3">
            <p className="min-w-22 text-xs font-medium text-gray-700">
              Reference No:
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {ticketRefNo || 'No reference number'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="min-w-22 text-xs font-medium text-gray-700">
              Current Project:
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {currentProject.name}
            </p>
          </div>
          <p className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-700">
            {ticketTitle}
          </p>
        </div>

        <Dropdown
          label="Move To Project"
          options={targetProjects}
          value={targetProjectId}
          onChange={(value) => {
            setTargetProjectId(value);
            setIsAcknowledged(false);
          }}
          placeholder="Select project"
          showSearch
          searchPlaceholder="Search projects..."
          emptyText="No other projects available"
          disabled={isSubmitting || targetProjects.length === 0}
        />

        {selectedProject ? (
          <div className="rounded-lg border border-warning-200 bg-[#FFFAEB] p-3 text-[#B54708]">
            <p className="text-sm font-semibold">
              This ticket will be moved from “{currentProject.name}” to “
              {selectedProject.label}”.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={isAcknowledged}
                disabled={isSubmitting}
                onChange={(event) => setIsAcknowledged(event.target.checked)}
                className="sr-only"
              />
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {isAcknowledged ? (
                  <CheckedBoxIcon width="18" height="18" />
                ) : (
                  <UncheckedBoxIcon
                    width="18"
                    height="18"
                    fill="#B54708"
                    bgFill="white"
                  />
                )}
              </span>
              <span>
                I understand that the ticket and its internal data will now
                belong to the selected project.
              </span>
            </label>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
