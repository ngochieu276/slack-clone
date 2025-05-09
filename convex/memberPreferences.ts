import { v } from 'convex/values';
import { query, mutation, QueryCtx } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { Id } from './_generated/dataModel';

const defaultImageId = 'kg224fbanjb2xn9nzkdt5566257b3hpd';

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
  args: { memberId: v.id('members') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const memberPreference = await ctx.db
      .query('memberPreferences')
      .withIndex('by_member_id_user_id', (q) =>
        q.eq('memberId', args.memberId).eq('userId', userId)
      )
      .unique();

    const image = memberPreference?.image
      ? await ctx.storage.getUrl(memberPreference.image)
      : undefined;

    if (!memberPreference) {
      return null;
    }

    return {
      ...memberPreference,
      image,
    };
  },
});

export const update = mutation({
  args: {
    memberId: v.id('members'),
    fullName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    title: v.optional(v.string()),
    pronunciation: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error('Unauthorized');
    }

    const memberPreference = await ctx.db
      .query('memberPreferences')
      .withIndex('by_member_id_user_id', (q) =>
        q.eq('memberId', args.memberId).eq('userId', userId)
      )
      .unique();

    if (!memberPreference) {
      throw new Error('Member preferences not found');
    }

    await ctx.db.patch(memberPreference._id, {
      fullName: args.fullName,
      displayName: args.displayName,
      title: args.title,
      pronunciation: args.pronunciation,
      timeZone: args.timeZone,
    });

    return memberPreference._id;
  },
});

export const updateAvatar = mutation({
  args: {
    memberId: v.id('members'),
    image: v.optional(v.id('_storage')),
    isRemove: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error('Unauthorized');
    }

    const memberPreference = await ctx.db
      .query('memberPreferences')
      .withIndex('by_member_id_user_id', (q) =>
        q.eq('memberId', args.memberId).eq('userId', userId)
      )
      .unique();

    if (!memberPreference) {
      throw new Error('Member preferences not found');
    }

    if (args.isRemove) {
      await ctx.db.patch(memberPreference._id, {
        image: defaultImageId as Id<'_storage'>,
      });
    } else {
      await ctx.db.patch(memberPreference._id, {
        image: args.image,
      });
    }

    return memberPreference._id;
  },
});

export const updateNavigation = mutation({
  args: {
    navigation: v.array(v.string()),
    workspaceId: v.id('workspaces'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      throw new Error('Unauthorized');
    }

    const currentMemmber = await getMember(ctx, args.workspaceId, userId);

    if (!currentMemmber) {
      throw Error('Unauthorized');
    }

    const memberPreference = await ctx.db
      .query('memberPreferences')
      .withIndex('by_member_id_user_id', (q) =>
        q.eq('memberId', currentMemmber._id).eq('userId', userId)
      )
      .unique();

    if (!memberPreference) {
      throw new Error('Member preferences not found');
    }

    await ctx.db.patch(memberPreference._id, {
      navigation: args.navigation,
    });

    return memberPreference._id;
  },
});
