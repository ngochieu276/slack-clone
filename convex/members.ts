import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { populateUser } from '../src/utils/convex.utils';
import { Id } from './_generated/dataModel';

export const get = query({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return [];
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', args.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!member) {
      return [];
    }

    const data = await ctx.db
      .query('members')
      .withIndex('by_workspace_id', (q) =>
        q.eq('workspaceId', args.workspaceId)
      )
      .collect();

    const members = [];

    for (const member of data) {
      const user = await populateUser(ctx, member.userId, {
        workspaceId: args.workspaceId,
      });

      if (user) {
        members.push({
          ...member,
          user,
        });
      }
    }

    return members;
  },
});

export const getById = query({
  args: { id: v.id('members') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const member = await ctx.db.get(args.id);

    if (!member) {
      return null;
    }

    const currentMember = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', member.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!currentMember) {
      return null;
    }

    const user = await populateUser(ctx, member.userId, {
      memberId: member._id,
    });

    if (!user) {
      return null;
    }

    return {
      ...member,
      user: user,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id('members'),
    role: v.union(v.literal('admin'), v.literal('members')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error('Unauthorized');
    }

    const member = await ctx.db.get(args.id);

    if (!member) {
      throw new Error('Member not found');
    }

    const currentMember = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', member.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!currentMember || currentMember.role !== 'admin') {
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(args.id, {
      role: args.role,
    });

    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id('members'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error('Unauthorized');
    }

    const member = await ctx.db.get(args.id);

    if (!member) {
      throw new Error('Member not found');
    }

    const currentMember = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q.eq('workspaceId', member.workspaceId).eq('userId', userId)
      )
      .unique();

    if (!currentMember) {
      throw new Error('Unauthorized');
    }

    if (member.role === 'admin') {
      throw new Error('Admin cannot be remove');
    }

    if (currentMember._id === args.id && currentMember.role !== 'admin') {
      throw new Error('Unauthorized');
    }

    const [messages, reactions, conversations] = await Promise.all([
      ctx.db
        .query('messages')
        .withIndex('by_member_id', (q) => q.eq('memberId', member._id))
        .collect(),
      ctx.db
        .query('reactions')
        .withIndex('by_member_id', (q) => q.eq('memberId', member._id))
        .collect(),
      ctx.db
        .query('conversations')
        .filter((q) =>
          q.or(
            q.eq(q.field('memberOneId'), member._id),
            q.eq(q.field('memberOneId'), member._id)
          )
        )
        .collect(),
    ]);

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id);
    }

    for (const conversation of conversations) {
      await ctx.db.delete(conversation._id);
    }

    await ctx.db.delete(args.id);

    return args.id;
  },
});

export const current = query({
  args: { workspaceId: v.optional(v.id('workspaces')) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_workspace_id_user_id', (q) =>
        q
          .eq('workspaceId', args.workspaceId as Id<'workspaces'>)
          .eq('userId', userId)
      )
      .unique();

    if (!member) {
      return null;
    }

    const user = await populateUser(ctx, member.userId, {
      memberId: member._id,
    });

    return { ...member, user };
  },
});

export const updateOnlineStatus = mutation({
  args: { memberId: v.id('members') },
  handler: async (ctx, { memberId }) => {
    await ctx.db.patch(memberId, { onlineAt: Date.now() });
  },
});
