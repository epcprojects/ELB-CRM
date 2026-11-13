import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WsJwtGuard } from '../../../../common/guards/ws-jwt.guard';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { Project } from '../../projects/entities/project.entity';
import { Ticket } from '../entities/ticket.entity';
import { canViewLead } from '../ticket-visibility.util';

interface JoinPayload {
  projectId: string;
  ticketId: string;
}

interface TypingPayload {
  projectId: string;
  ticketId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  namespace: '/ticket-replies',
  cors: {
    origin: [process.env.FRONTEND_APP_URL, 'http://localhost:3000'],
    credentials: true,
  },
})
export class TicketRepliesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketRepliesGateway.name);

  constructor(
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly usersService: UsersService,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    notificationsService: NotificationsService,
  ) {
    notificationsService.registerLeadAccessRevoker((ticketId, projectId, ids) =>
      this.revokeUsers(projectId, ticketId, ids),
    );
  }

  // Removes users who lost access to a lead from its live reply room.
  async revokeUsers(projectId: string, ticketId: string, userIds: string[]) {
    const room = this.room(projectId, ticketId);
    const sockets = await this.server.in(room).fetchSockets();
    for (const socket of sockets) {
      if (userIds.includes(socket.data?.user?.sub)) {
        socket.leave(room);
      }
    }
  }

  handleConnection(client: Socket) {
    const valid = this.wsJwtGuard.validateClient(client);
    if (!valid) return;

    this.logger.log(`Connected: ${client.id} | ${client.data.user?.sub}`);
  }

  // The socket only carries the raw JWT payload, so load the real user (with
  // permissions) and check project membership plus lead visibility
  // ("view all leads" / "view only assigned to me").
  private async canAccessTicket(
    client: Socket,
    projectId: string,
    ticketId: string,
  ): Promise<boolean> {
    try {
      const userId = client.data.user?.sub;
      if (!userId || !projectId || !ticketId) return false;

      const user = await this.usersService.findById(userId);
      const ticket = await this.ticketRepo.findOne({
        where: { id: ticketId, projectId },
        select: { id: true, assigneeId: true },
      });
      if (
        !user ||
        !ticket ||
        !(await canViewLead(this.ticketRepo.manager, user, ticket.id))
      ) {
        return false;
      }

      return await this.ticketRepo.manager
        .getRepository(Project)
        .createQueryBuilder('p')
        .innerJoin('p.members', 'm', 'm.id = :userId', { userId })
        .where('p.id = :projectId', { projectId })
        .getExists();
    } catch {
      return false;
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const room = this.room(payload.projectId, payload.ticketId);

    if (
      !(await this.canAccessTicket(client, payload.projectId, payload.ticketId))
    ) {
      client.emit('error', {
        event: 'join',
        message: 'Forbidden: lead access denied',
      });
      return;
    }

    await client.join(room);

    client.emit('joined', {
      room,
      projectId: payload.projectId,
      ticketId: payload.ticketId,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const room = this.room(payload.projectId, payload.ticketId);

    await client.leave(room);

    client.emit('left', { room });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const room = this.room(payload.projectId, payload.ticketId);
    // Only sockets that were allowed to join the room may signal into it.
    if (!client.rooms.has(room)) return;

    client.to(room).emit('typing', {
      userId: client.data.user.sub,
      name: client.data.user.fullName,
      isTyping: payload.isTyping,
    });
  }

  broadcastReply(projectId: string, ticketId: string, reply: any) {
    this.server.to(this.room(projectId, ticketId)).emit('reply_created', reply);
  }

  broadcastUpdated(projectId: string, ticketId: string, reply: any) {
    this.server.to(this.room(projectId, ticketId)).emit('reply_updated', reply);
  }

  broadcastReacted(projectId: string, ticketId: string, reply: any) {
    this.server.to(this.room(projectId, ticketId)).emit('reply_reacted', reply);
  }

  broadcastDeleted(projectId: string, ticketId: string, replyId: string) {
    this.server.to(this.room(projectId, ticketId)).emit('reply_deleted', {
      id: replyId,
    });
  }

  private room(projectId: string, ticketId: string) {
    return `ticket-replies:${projectId}:${ticketId}`;
  }
}
