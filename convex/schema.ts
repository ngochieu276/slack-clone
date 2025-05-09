import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

const schema = defineSchema({
  ...authTables,
  workspaces: defineTable({
    name: v.string(),
    userId: v.id('users'),
    joinCode: v.string(),
  }),
  members: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    role: v.union(v.literal('admin'), v.literal('members')),
    onlineAt: v.optional(v.number()),
  })
    .index('by_user_id', ['userId'])
    .index('by_workspace_id', ['workspaceId'])
    .index('by_workspace_id_user_id', ['workspaceId', 'userId']),
  memberPreferences: defineTable({
    userId: v.id('users'),
    memberId: v.id('members'),
    workspaceId: v.id('workspaces'),
    fullName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    title: v.optional(v.string()),
    pronunciation: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    image: v.optional(v.id('_storage')),
    navigation: v.optional(v.array(v.string())),
  })
    .index('by_member_id_user_id', ['memberId', 'userId'])
    .index('by_user_id_workspace_id', ['userId', 'workspaceId']),
  channels: defineTable({
    name: v.string(),
    workspaceId: v.id('workspaces'),
    isPrivate: v.optional(v.boolean()),
    createdBy: v.optional(v.id('members')),
  }).index('by_workspace_id', ['workspaceId']),
  channelMembers: defineTable({
    channelId: v.id('channels'),
    memberId: v.id('members'),
  })
    .index('by_channel_id', ['channelId'])
    .index('by_member_id', ['memberId'])
    .index('by_channel_member', ['channelId', 'memberId']),
  conversations: defineTable({
    workspaceId: v.id('workspaces'),
    memberOneId: v.id('members'),
    memberTwoId: v.id('members'),
    userOneId: v.id('users'),
    userTwoId: v.id('users'),
  }).index('by_workspace_id', ['workspaceId']),
  messages: defineTable({
    body: v.string(),
    files: v.optional(v.array(v.id('_storage'))),
    memberId: v.id('members'),
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    parentMessageId: v.optional(v.id('messages')),
    conversationId: v.optional(v.id('conversations')),
    updatedAt: v.optional(v.number()),
    forwardMessageId: v.optional(v.id('messages')),
  })
    .index('by_workspace_id', ['workspaceId'])
    .index('by_member_id', ['memberId'])
    .index('by_channel_id', ['channelId'])
    .index('by_conversation_id', ['conversationId'])
    .index('by_parent_message_id', ['parentMessageId'])
    .index('by_channel_id_parent_message_id_conversation_id', [
      'channelId',
      'parentMessageId',
      'conversationId',
    ]),
  reactions: defineTable({
    workspaceId: v.id('workspaces'),
    messageId: v.id('messages'),
    memberId: v.id('members'),
    value: v.string(),
  })
    .index('by_workspace_id', ['workspaceId'])
    .index('by_message_id', ['messageId'])
    .index('by_member_id', ['memberId']),
  notifications: defineTable({
    userId: v.id('users'),
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    parentMessageId: v.optional(v.id('messages')),
    messageId: v.optional(v.id('messages')),
    reactionId: v.optional(v.id('reactions')),
    type: v.union(
      v.literal('mention'),
      v.literal('keyword'),
      v.literal('direct'),
      v.literal('reply'),
      v.literal('reaction')
    ),
    status: v.union(v.literal('read'), v.literal('unread')),
    senderId: v.id('users'),
    senderMemberId: v.optional(v.id('members')),
    content: v.string(),
  })
    .index('by_user_status', ['userId', 'status'])
    .index('by_channel', ['channelId']),
  notificationPreferences: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    channelId: v.optional(v.id('channels')),
    muteUntil: v.optional(v.number()),
    enableSound: v.boolean(),
    desktopNotifications: v.union(
      v.literal('all'),
      v.literal('mentions'),
      v.literal('none')
    ),
    mobileNotifications: v.union(
      v.literal('all'),
      v.literal('mentions'),
      v.literal('none')
    ),
    emailNotifications: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_user_workspace', ['userId', 'workspaceId'])
    .index('by_user_channel', ['userId', 'channelId']),
  files: defineTable({
    storageId: v.id('_storage'),
    name: v.string(),
  }).index('by_storageId', ['storageId']),
  savedLaters: defineTable({
    memberId: v.id('members'),
    messageId: v.id('messages'),
    fileId: v.optional(v.id('files')),
    channelId: v.optional(v.id('channels')),
    conversationId: v.optional(v.id('conversations')),
    parentMessageId: v.optional(v.id('messages')),
    status: v.union(
      v.literal('inprogress'),
      v.literal('archived'),
      v.literal('completed')
    ),
  })
    .index('by_member_id', ['memberId'])
    .index('by_message_id', ['messageId'])
    .index('by_member_message_id', ['memberId', 'messageId']),
});

export default schema;
