import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query, QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { Doc, Id } from './_generated/dataModel';
import { paginationOptsValidator } from 'convex/server';
import { getSetByKey } from '../src/app/utils/index';
import {
  populateMember,
  populateReactions,
  populateThread,
  populateUser,
} from '../src/utils/convex.utils';

const getMember = async (
  ctx: QueryCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>
) => {
  return await ctx.db
    .query('members')
    .withIndex('by_workspace_id_user_id', (q) =>
      q.eq('workspaceId', workspaceId).eq('userId', userId)
    )
    .unique();
};

export const get = query({
  args: {
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    parentMessageId: v.optional(v.id('messages')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw Error('Unauthorized');
    }

    let _conversationId = args.conversationId;

    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);
      if (!parentMessage) throw new Error('Parent message not found');
      _conversationId = parentMessage.conversationId;
    }

    const results = await ctx.db
      .query('messages')
      .withIndex('by_channel_id_parent_message_id_conversation_id', (q) =>
        q
          .eq('channelId', args.channelId)
          .eq('parentMessageId', args.parentMessageId)
          .eq('conversationId', _conversationId)
      )
      .order('desc')
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: (
        await Promise.all(
          results.page.map(async (message) => {
            const member = await populateMember(ctx, message.memberId);
            const user = member ? await populateUser(ctx, member.userId) : null;

            if (!member || !user) {
              return null;
            }

            const reactions = await populateReactions(ctx, message._id);
            const thread = await populateThread(ctx, message._id);
            const image = message.image
              ? await ctx.storage.getUrl(message.image)
              : undefined;

            const reactionsWithCounts = reactions.map((reaction) => {
              return {
                ...reaction,
                count: reactions.filter((r) => r.value === reaction.value)
                  .length,
              };
            });

            const dedupedReactions = reactionsWithCounts.reduce(
              (acc, reaction) => {
                const existingReaction = acc.find(
                  (r) => r.value === reaction.value
                );

                if (existingReaction) {
                  existingReaction.memberIds = Array.from(
                    new Set([...existingReaction.memberIds, reaction.memberId])
                  );
                } else {
                  acc.push({
                    ...reaction,
                    memberIds: [reaction.memberId],
                  });
                }

                return acc;
              },
              [] as (Doc<'reactions'> & {
                count: number;
                memberIds: Id<'members'>[];
              })[]
            );

            const reactionWithoutMemberIdProperty = dedupedReactions.map(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ({ memberId, ...rest }) => rest
            );

            return {
              ...message,
              image,
              member,
              user,
              reactions: reactionWithoutMemberIdProperty,
              threadCount: thread.count,
              threadImage: thread.image,
              threadName: thread.name,
              threadTimestamp: thread.timeStamp,
            };
          })
        )
      ).filter(
        (message): message is NonNullable<typeof message> => message !== null
      ),
    };
  },
});

export const getById = query({
  args: {
    id: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw Error('Unauthorized');
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      throw new Error('Message not found');
    }
    const currentMember = await getMember(ctx, message.workspaceId, userId);

    if (!currentMember) {
      return null;
    }

    const member = await populateMember(ctx, message.memberId);

    if (!member) {
      return null;
    }

    const user = await populateUser(ctx, member.userId);

    if (!member) {
      return null;
    }

    const reactions = await populateReactions(ctx, message._id);

    const reactionsWithCounts = reactions.map((reaction) => {
      return {
        ...reaction,
        count: reactions.filter((r) => r.value === reaction.value).length,
      };
    });

    const dedupedReactions = reactionsWithCounts.reduce(
      (acc, reaction) => {
        const existingReaction = acc.find((r) => r.value === reaction.value);

        if (existingReaction) {
          existingReaction.memberIds = Array.from(
            new Set([...existingReaction.memberIds, reaction.memberId])
          );
        } else {
          acc.push({
            ...reaction,
            memberIds: [reaction.memberId],
          });
        }

        return acc;
      },
      [] as (Doc<'reactions'> & {
        count: number;
        memberIds: Id<'members'>[];
      })[]
    );

    const reactionWithoutMemberIdProperty = dedupedReactions.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ memberId, ...rest }) => rest
    );

    return {
      ...message,
      image: message.image
        ? await ctx.storage.getUrl(message.image)
        : undefined,
      user,
      member,
      reactions: reactionWithoutMemberIdProperty,
    };
  },
});

export const create = mutation({
  args: {
    body: v.string(),
    image: v.optional(v.id('_storage')),
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    parentMessageId: v.optional(v.id('messages')),
    conversationId: v.optional(v.id('conversations')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw Error('Unauthorized');
    }

    const currentMemmber = await getMember(ctx, args.workspaceId, userId);
    const currentUser = await populateUser(ctx, userId);

    if (!currentMemmber) {
      throw Error('Unauthorized');
    }

    let _conversationId = args.conversationId;

    // only possible if we are replying in a thread in 1:1 conversation
    if (!args.conversationId && !args.channelId && args.parentMessageId) {
      const parentMessage = await ctx.db.get(args.parentMessageId);
      if (!parentMessage) throw new Error('Parent message not found');
      _conversationId = parentMessage.conversationId;
    }

    const messageId = await ctx.db.insert('messages', {
      memberId: currentMemmber._id,
      body: args.body,
      image: args.image,
      channelId: args.channelId,
      workspaceId: args.workspaceId,
      parentMessageId: args.parentMessageId,
      conversationId: _conversationId,
    });

    const checkIsMention = true;

    let notiType = 'direct';
    if (checkIsMention) {
      notiType = 'reply';
    } else if (args.parentMessageId) {
      notiType = 'mention';
    }

    if (notiType === 'reply') {
      // tìm những member trong thread
      const messagesByParentMessage = await ctx.db
        .query('messages')
        .filter((q) =>
          q.and(
            q.or(
              q.eq(q.field('_id'), args.parentMessageId),
              q.eq(q.field('parentMessageId'), args.parentMessageId)
            ),
            q.neq(q.field('memberId'), currentMemmber._id)
          )
        )
        .collect();

      const membersIdInThreads = Array.from(
        getSetByKey(messagesByParentMessage, 'memberId')
      );
      const membersInTheadWithPopulate = await Promise.all(
        membersIdInThreads.map(async (id) => {
          const data = await ctx.db.get(id);
          return data;
        })
      );

      // gửi noti tơi các member trong thread
      await Promise.all(
        membersInTheadWithPopulate.map(async (member) => {
          if (member) {
            await ctx.db.insert('notifications', {
              channelId: args.channelId,
              conversationId: _conversationId,
              userId: member.userId,
              messageId: messageId,
              type: notiType,
              status: 'unread',
              content: `New message in thread from ${currentUser?.name}`,
              senderId: userId,
              parentMessageId: args.parentMessageId,
            });
          }
        })
      );
    }

    if (notiType === 'mention') {
    }

    if (notiType === 'direct') {
      const conversation = await ctx.db
        .query('conversations')
        .filter((q) => q.eq(q.field('_id'), args.conversationId))
        .unique();

      let memberInConversation: Id<'members'>;
      if (currentMemmber._id === conversation?.memberOneId) {
        memberInConversation = conversation?.memberTwoId;
      }
      if (currentMemmber._id === conversation?.memberTwoId) {
        memberInConversation = conversation?.memberOneId;
      }

      const members = await ctx.db
        .query('members')
        .filter((q) =>
          q.and(
            q.eq(q.field('workspaceId'), args.workspaceId),
            q.neq(q.field('userId'), userId)
          )
        )
        .filter((q) => {
          if (args.conversationId) {
            return q.eq(q.field('_id'), memberInConversation);
          } else return true;
        })
        .collect();

      await Promise.all(
        members.map(async (member) => {
          await ctx.db.insert('notifications', {
            channelId: args.channelId,
            conversationId: _conversationId,
            userId: member.userId,
            messageId: messageId,
            type: notiType,
            status: 'unread',
            content: `New message from ${currentUser?.name}`,
            senderId: userId,
          });
        })
      );
    }

    return messageId;
  },
});

export const update = mutation({
  args: {
    id: v.id('messages'),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw Error('Unauthorized');
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      throw new Error('Message not found');
    }

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) {
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(args.id, {
      body: args.body,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id('messages'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw Error('Unauthorized');
    }

    const message = await ctx.db.get(args.id);

    if (!message) {
      throw new Error('Message not found');
    }

    const member = await getMember(ctx, message.workspaceId, userId);

    if (!member || member._id !== message.memberId) {
      throw new Error('Unauthorized');
    }

    await ctx.db.delete(args.id);

    return args.id;
  },
});
