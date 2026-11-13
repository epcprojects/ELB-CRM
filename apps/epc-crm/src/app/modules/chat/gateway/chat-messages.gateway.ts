import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatMessagesService, ChatChannel } from '../chat.service';
import { WsJwtGuard } from '../../../../common/guards/ws-jwt.guard';
import { UserType } from '@epc-crm/types';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';

interface JoinPayload {
  projectId: string;
  ticketId: string;
  channel: ChatChannel;
}

interface TypingPayload {
  ticketId: string;
  channel: ChatChannel;
  isTyping: boolean;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: [process.env.FRONTEND_APP_URL, 'http://localhost:3000'],
    credentials: true,
  },
})
export class ChatMessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatMessagesGateway.name);

  constructor(
    private readonly chatService: ChatMessagesService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly usersService: UsersService,
    notificationsService: NotificationsService,
  ) {
    notificationsService.registerLeadAccessRevoker((ticketId, projectId, ids) =>
      this.revokeUsers(projectId, ticketId, ids),
    );
  }

  // Removes users who lost access to a lead from both of its chat rooms.
  async revokeUsers(projectId: string, ticketId: string, userIds: string[]) {
    for (const channel of ['internal', 'external'] as ChatChannel[]) {
      const room = this.roomKey(projectId, ticketId, channel);
      const sockets = await this.server.in(room).fetchSockets();
      for (const socket of sockets) {
        if (userIds.includes(socket.data?.user?.sub)) {
          socket.leave(room);
        }
      }
    }
  }

  handleConnection(client: Socket) {
    const valid = this.wsJwtGuard.validateClient(client);
    if (!valid) return;

    this.logger.log(
      `Connected: ${client.id} | user: ${client.data.user?.id} | role: ${client.data.user?.role}`,
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Disconnected: ${client.id}`);
  }

  // - Join room
  // Room name format: chat:{projectId}:{ticketId}:{channel}
  // This ensures strict isolation between internal and external channels

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const user = client.data.user;
    const { projectId, ticketId, channel } = payload;

    // The socket only carries the raw JWT payload, so load the real user and
    // check project membership plus lead visibility ("view all leads" /
    // "view only assigned to me") before letting it into the room.
    try {
      const fullUser = await this.usersService.findById(user?.sub);
      await this.chatService.assertLeadAccess(projectId, ticketId, fullUser, channel);
    } catch {
      client.emit('error', {
        event: 'join',
        message: 'Forbidden: lead access denied',
      });
      return;
    }

    // Role-based channel access check
    // if (!this.chatService.canAccessChannel(user.role, channel)) {
    //   client.emit('error', {
    //     event: 'join',
    //     message: 'Forbidden: cannot access this channel',
    //   });
    //   return;
    // }

    // External users: must own the ticket
    if (user.userType === UserType.EXTERNAL) {
      try {
        await this.chatService.assertExternalTicketAccess(user.id, ticketId);
      } catch {
        client.emit('error', {
          event: 'join',
          message: 'Forbidden: ticket access denied',
        });
        return;
      }
    }

    const room = this.roomKey(projectId, ticketId, channel);
    await client.join(room);

    client.emit('joined', { room, projectId, ticketId, channel });
    this.logger.log(`User ${user.id} (${user.role}) joined room ${room}`);
  }

  // - Leave room

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const room = this.roomKey(
      payload.projectId,
      payload.ticketId,
      payload.channel,
    );
    await client.leave(room);
    client.emit('left', { room });
  }

  // - Typing indicator

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload & { projectId: string },
  ) {
    const user = client.data.user;
    const room = this.roomKey(
      payload.projectId,
      payload.ticketId,
      payload.channel,
    );

    // Only sockets that were allowed to join the room may signal into it.
    if (!client.rooms.has(room)) return;

    // Broadcast to room except sender
    client.to(room).emit('typing', {
      userId: user.sub,
      name: user.name,
      isTyping: payload.isTyping,
      channel: payload.channel,
    });
  }

  // Broadcast helpers (called by controller after DB save)

  broadcastMessage(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
    message: any,
  ) {
    const room = this.roomKey(projectId, ticketId, channel);
    this.server.to(room).emit('new_message', { channel, message });
  }

  broadcastReadReceipt(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
    messageIds: string[],
    readByUserId: string,
  ) {
    const room = this.roomKey(projectId, ticketId, channel);
    this.server
      .to(room)
      .emit('messages_read', { channel, messageIds, readByUserId });
  }

  broadcastMessageDeleted(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
    message: any,
  ) {
    const room = this.roomKey(projectId, ticketId, channel);
    this.server.to(room).emit('message_deleted', { channel, message });
  }

  broadcastMessageUpdated(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
    message: any,
  ) {
    const room = this.roomKey(projectId, ticketId, channel);
    this.server.to(room).emit('message_updated', { channel, message });
  }

  broadcastMessageReacted(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
    message: any,
  ) {
    const room = this.roomKey(projectId, ticketId, channel);
    this.server.to(room).emit('message_reacted', { channel, message });
  }


  // - Utilities

  private roomKey(
    projectId: string,
    ticketId: string,
    channel: ChatChannel,
  ): string {
    return `chat:${projectId}:${ticketId}:${channel}`;
  }
}
