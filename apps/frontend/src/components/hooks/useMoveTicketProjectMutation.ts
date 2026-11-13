'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { moveTicketToProject } from '../../lib/tickets';

export type MoveTicketProjectVariables = {
  ticketId: string;
  sourceProjectId: string;
  targetProjectId: string;
};

export function useMoveTicketProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, targetProjectId }: MoveTicketProjectVariables) =>
      moveTicketToProject(ticketId, targetProjectId),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard-project-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-tickets'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-kanban-board'] }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard-kanban-ticket-counts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard-kanban-board-page'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-kanban-board', variables.sourceProjectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-kanban-board', variables.targetProjectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-kanban-board-page'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['project-kanban-counts'],
        }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['project-names'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-reporters'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-assignees'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-timeline'] }),
      ]);
    },
  });
}
