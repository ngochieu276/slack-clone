import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { groupBy } from '../src/utils/index';

import {
  populateUser,
  populateMesssage,
  populateThread,
} from '../src/utils/convex.utils';
import { Id } from './_generated/dataModel';

export const get = query({
  args: {
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    isUnRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!member) {
      throw Error('Unauthorized');
    }

    const notifications = await ctx.db
      .query('notifications')
      .filter((q) => {
        if (args.isUnRead === true) {
          return q.eq(q.field('status'), 'unread');
        }
        return true;
      })
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), userId),
          q.or(
            q.eq(q.field('channelId'), args.channelId),
            q.eq(q.field('conversationId'), args.conversationId)
          )
        )
      )
      .order('desc')
      .collect();

    const notificationWithPopulate = await Promise.all(
      notifications.map(async (notification) => {
        let channelData = null;
        if (notification.channelId) {
          channelData = await ctx.db.get(notification.channelId);
        }
        const senderData = await populateUser(ctx, notification.senderId, {
          memberId: notification.senderMemberId,
        });
        return {
          ...notification,
          channel: channelData,
          sender: senderData,
        };
      })
    );

    return notificationWithPopulate;
  },
});

export const markAsRead = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    messageId: v.optional(v.id('messages')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!member) {
      throw Error('Unauthorized');
    }

    const notifications = await ctx.db
      .query('notifications')
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), userId),
          q.eq(q.field('status'), 'unread'),
          q.or(
            q.and(
              q.neq(q.field('channelId'), undefined),
              q.eq(q.field('channelId'), args.channelId)
            ),
            q.and(
              q.neq(q.field('conversationId'), undefined),
              q.eq(q.field('conversationId'), args.conversationId)
            ),
            q.and(
              q.neq(q.field('messageId'), undefined),
              q.eq(q.field('messageId'), args.messageId)
            )
          )
        )
      )
      .collect();

    await Promise.all(
      notifications.map(async (noti) => {
        await ctx.db.patch(noti._id, {
          status: 'read',
        });
      })
    );

    return notifications;
  },
});

export const activities = query({
  args: {
    workspaceId: v.id('workspaces'),
    isUnRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!member) {
      throw Error('Unauthorized');
    }

    const notifications = await ctx.db
      .query('notifications')
      .filter((q) => {
        if (args.isUnRead === true) {
          return q.eq(q.field('status'), 'unread');
        }
        return true;
      })
      .filter((q) => q.eq(q.field('userId'), userId))
      .order('desc')
      .collect();

    const notificationWithPopulate = await Promise.all(
      notifications.map(async (notification) => {
        let channelData = null;
        let parentMessageData = null;
        let message = null;
        if (notification.channelId) {
          channelData = await ctx.db.get(notification.channelId);
        }
        if (notification.parentMessageId) {
          parentMessageData = await populateMesssage(
            ctx,
            notification.parentMessageId
          );
        }
        const senderData = await populateUser(ctx, notification.senderId, {
          memberId: notification.senderMemberId,
        });
        const thread = await populateThread(
          ctx,
          notification.parentMessageId as Id<'messages'>
        );

        if (notification.messageId) {
          message = await ctx.db.get(notification.messageId);
        }

        return {
          ...notification,
          channel: channelData,
          sender: senderData,
          parentMessage: parentMessageData,
          thread,
          message,
        };
      })
    );

    // for replies
    const groupByParentMessage = groupBy(
      notificationWithPopulate.filter((noti) => noti.type === 'reply') || [],
      'parentMessageId'
    );

    if (groupByParentMessage['undefined']) {
      for (const noti of groupByParentMessage['undefined']) {
        if (noti.messageId) {
          if (groupByParentMessage[noti.messageId]) {
            groupByParentMessage[noti.messageId].push(noti);
            groupByParentMessage['undefined'] = groupByParentMessage[
              'undefined'
            ].filter((n) => n._id !== noti._id);
          } else {
            groupByParentMessage[noti.messageId] = [noti];
            groupByParentMessage['undefined'] = groupByParentMessage[
              'undefined'
            ].filter((n) => n._id !== noti._id);
          }
        }
      }
    }

    const replies = Object.values(groupByParentMessage)
      .filter((gr) => gr.length)
      .map((group) => {
        const notiType = group[0].type;
        let channelName;
        const channel = group[0].channel;
        let newestNoti = group[0];
        let threadMsgCount = 0;
        const senders = [group[0].sender];
        let thread = group[0].thread;
        let unreadCount = 0;
        let closetTime;
        const notifications = [group[0]];

        group.forEach((noti, idx) => {
          channelName = noti.channel?.name;
          if (noti._creationTime > newestNoti._creationTime) {
            newestNoti = noti;
            thread = noti.thread;
            threadMsgCount = noti.thread.count;
            closetTime = noti._creationTime;
          }
          if (noti.sender) {
            senders.push(noti.sender);
          }
          if (noti.status === 'unread') {
            unreadCount = unreadCount + 1;
          }
          if (idx > 0) notifications.push(noti);
        });
        return {
          channel,
          channelName,
          newestNoti,
          threadMsgCount,
          senders: [
            ...new Map(senders.map((sender) => [sender?._id, sender])).values(),
          ],
          thread,
          unreadCount,
          closetTime,
          notiType,
          notifications,
          _id: String(group[0]._creationTime),
        };
      });

    // for mentions

    const mentions = notificationWithPopulate
      .filter((noti) => noti.type === 'mention')
      .map((noti) => {
        const notiType = noti.type;
        const channel = noti.channel;
        const channelName = noti.channel?.name;
        const newestNoti = noti;
        const unreadCount = noti.status === 'unread' ? 1 : 0;
        const senders = [noti.sender];
        const thread = noti.thread;
        const notifications = [noti];

        return {
          channel,
          channelName,
          newestNoti,
          senders,
          thread,
          notiType,
          notifications,
          unreadCount,
          _id: String(noti._creationTime),
        };
      });

    // for react
    const groupByMessage = groupBy(
      notificationWithPopulate.filter((noti) => noti.type === 'reaction') || [],
      'messageId'
    );
    const reactions = Object.values(groupByMessage)
      .filter((gr) => gr.length)
      .map((group) => {
        const notiType = group[0].type;
        const channel = group[0].channel;
        let channelName;
        let newestNoti = group[0];
        let threadMsgCount = 0;
        const senders = [group[0].sender];
        let thread = group[0].thread;
        let unreadCount = 0;
        const notifications = [group[0]];

        group.forEach((noti, idx) => {
          channelName = noti.channel?.name;
          if (noti._creationTime > newestNoti._creationTime) {
            newestNoti = noti;
            thread = noti.thread;
            threadMsgCount = noti.thread.count;
          }
          if (noti.sender) {
            senders.push(noti.sender);
          }
          if (noti.status === 'unread') {
            unreadCount = unreadCount + 1;
          }
          if (idx > 0) notifications.push(noti);
        });
        return {
          channel,
          channelName,
          newestNoti,
          threadMsgCount,
          senders: [
            ...new Map(senders.map((sender) => [sender?._id, sender])).values(),
          ],
          thread,
          unreadCount,
          notiType,
          notifications,
          _id: String(group[0].messageId),
        };
      });

    return [...replies, ...reactions, ...mentions].sort(
      (a, b) => b.newestNoti._creationTime - a.newestNoti._creationTime
    );
  },
});

export const directMessages = query({
  args: {
    workspaceId: v.id('workspaces'),
    isUnRead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);

    if (currentUserId === null) {
      return null;
    }

    const currentMember = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', currentUserId)
      )
      .unique();

    if (!currentMember) {
      throw Error('Unauthorized');
    }

    const notifications = await ctx.db
      .query('notifications')
      .filter((q) => {
        if (args.isUnRead === true) {
          return q.eq(q.field('status'), 'unread');
        }
        return true;
      })
      .filter((q) =>
        q.or(
          q.neq(q.field('conversationId'), null),
          q.neq(q.field('conversationId'), undefined)
        )
      )
      .filter((q) =>
        q.or(
          q.eq(q.field('userId'), currentUserId),
          q.eq(q.field('senderId'), currentUserId)
        )
      )
      .collect();

    const notificationWithPopulate = await Promise.all(
      notifications.map(async (notification) => {
        let conversationWith;
        let conversationWithMember;
        if (notification.conversationId) {
          const conversation = await ctx.db.get(notification.conversationId);

          if (currentMember._id === conversation?.memberOneId) {
            conversationWith = await populateUser(
              ctx,
              conversation?.userTwoId,
              {
                memberId: conversation.memberTwoId,
              }
            );
            conversationWithMember = conversation.memberTwoId;
          }

          if (currentMember._id === conversation?.memberTwoId) {
            conversationWith = await populateUser(
              ctx,
              conversation?.userOneId,
              {
                memberId: conversation.memberOneId,
              }
            );
            conversationWithMember = conversation.memberOneId;
          }
        }
        const senderData = await populateUser(ctx, notification.senderId, {
          memberId: notification.senderMemberId,
        });

        return {
          ...notification,
          conversationWith,
          sender: senderData,
          conversationWithMember,
        };
      })
    );

    const groupByConversationId = groupBy(
      notificationWithPopulate.filter(
        (noti) => noti.conversationId && noti.conversationWith
      ) || [],
      'conversationId'
    );

    const directMessages = Object.values(groupByConversationId).map(
      (conversation) => {
        let unreadCount = 0;
        let newestNoti = conversation[0];
        const conversationWith = conversation[0].conversationWith;
        const conversationWithMember = conversation[0].conversationWithMember;
        const conversationId = conversation[0].conversationId;

        conversation.forEach((noti) => {
          if (noti._creationTime > newestNoti._creationTime) {
            newestNoti = noti;
          }
          if (noti.status === 'unread' && noti.userId === currentUserId) {
            unreadCount = unreadCount + 1;
          }
        });
        return {
          unreadCount,
          newestNoti,
          conversationWith,
          conversationWithMember,
          conversationId,
        };
      }
    );

    return directMessages;
  },
});
