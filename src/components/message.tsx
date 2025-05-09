/* eslint-disable @typescript-eslint/no-explicit-any */
import dynamic from 'next/dynamic';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { format } from 'date-fns';
import Hint from './hint';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import Toolbar from './toolbar';
import { useUpdateMessage } from '@/features/messages/api/use-update-message';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRemoveMessage } from '@/features/messages/api/use-remove-message';
import useConfirm from '@/hooks/use-confirm';
import { useToggleReaction } from '@/features/reactions/api/use-toggle-reaction';
import Reactions from './reactions';
import { usePanel } from '@/hooks/use-panel';
import ThreadBar from './thread-bar';
import { formatFulltime } from '@/utils/date-time';
import { useChannelId } from '@/hooks/use-channel-id';
import CustomRenderer from './custom-renderer';
import UserDetailCard from './user-detail-card';
import { FileStorage } from '@/models';
import MessageMedia from './message-media';
import { convertJsonToString } from '@/utils/label';
import ForwardMessage from './forward-message';
import { useUpdateAsLater } from '@/features/later/api/use-update-later';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { useRemoveSavelater } from '@/features/later/api/use-remove-later';
import { Bookmark } from 'lucide-react';

const Editor = dynamic(() => import('@/components/editor'), { ssr: false });

interface MessageProps {
  className?: string;
  id: Id<'messages'>;
  memberId: Id<'members'>;
  authorImage?: string;
  authorName?: string;
  isAuthor: boolean;
  reactions: Array<
    Omit<Doc<'reactions'>, 'memberId'> & {
      count: number;
      memberIds: Id<'members'>[];
      users?: Doc<'users'>[];
    }
  >;
  body: Doc<'messages'>['body'];
  files: FileStorage[];
  createdAt: Doc<'messages'>['_creationTime'];
  updatedAt: Doc<'messages'>['updatedAt'];
  isEditing: boolean;
  isCompact?: boolean;
  setEditingId: (id: Id<'messages'> | null) => void;
  hideThreadButton?: boolean;
  threadCount?: number;
  threadImage?: string;
  threadName?: string;
  threadTimestamp?: number;
  formatFullDate?: boolean;
  threadUsers?: (
    | (Doc<'users'> & { memberPreference: Doc<'memberPreferences'> | any })
    | null
    | undefined
  )[];
  isSmallContainer?: boolean;
  isForward?: boolean;
  forwardMessageId?: Id<'messages'>;
  saveLater?: Doc<'savedLaters'> | null;
  conversationId?: Id<'conversations'>;
}

const Message = ({
  className,
  id,
  memberId,
  authorImage,
  authorName = 'Member',
  isAuthor,
  reactions,
  body,
  files,
  createdAt,
  updatedAt,
  isEditing,
  isCompact,
  setEditingId,
  hideThreadButton,
  threadCount,
  threadImage,
  threadTimestamp,
  threadName,
  formatFullDate,
  threadUsers,
  isSmallContainer,
  isForward,
  forwardMessageId,
  saveLater,
  conversationId,
}: MessageProps) => {
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();

  const { parentMessageId, onOpenMessage, onClose, onOpenProfileMember } =
    usePanel();
  const [ConfirmDialog, confirm] = useConfirm(
    'Delete message',
    'Are you sure want to delete this message'
  );

  const { mutate: updateMessage, isPending: isUpdatingMessage } =
    useUpdateMessage();
  const { mutate: removeMessage, isPending: isRemovingMessage } =
    useRemoveMessage();
  const { mutate: toggleReaction, isPending: isTogglingReaction } =
    useToggleReaction();
  const { mutate: updateSaveLater, isPending: isUpdateSaveLater } =
    useUpdateAsLater();
  const { mutate: removeSaveLater, isPending: isRemoveSaveLater } =
    useRemoveSavelater();

  const isPending =
    isUpdatingMessage ||
    isTogglingReaction ||
    isUpdateSaveLater ||
    isRemoveSaveLater;

  const handleUpdate = ({ body }: { body: string }) => {
    updateMessage(
      { id, body },
      {
        onSuccess: () => {
          toast.success('Message updated');
          setEditingId(null);
        },
        onError: () => {
          toast.success('Failed to update message');
        },
      }
    );
  };

  const handleRemove = async () => {
    const ok = await confirm();

    if (!ok) return;

    removeMessage(
      { id },
      {
        onSuccess: () => {
          toast.success('Message deleted');

          if (parentMessageId === id) {
            onClose();
          }
        },
        onError: () => {
          toast.error('Failed to delete message');
        },
      }
    );
  };

  const handleReaction = (value: string) => {
    toggleReaction(
      { messageId: id, value, channelId },
      {
        onError: () => {
          toast.error('Failed to toggle reaction');
        },
      }
    );
  };

  const handleSaveForLater = () => {
    if (!saveLater) {
      updateSaveLater(
        {
          messageId: id,
          workspaceId: workspaceId,
          status: 'inprogress',
          channelId,
          parentMessageId: (parentMessageId as Id<'messages'>) || undefined,
          conversationId: (conversationId as Id<'conversations'>) || undefined,
        },
        {
          onError: () => {
            toast.error('Failed to toggle save later');
          },
        }
      );
    } else {
      removeSaveLater(
        { saveId: saveLater._id, workspaceId },
        {
          onError: () => {
            toast.error('Failed to toggle reaction');
          },
        }
      );
    }
  };

  if (isCompact) {
    return (
      <>
        <ConfirmDialog />
        <div
          className={cn(
            'flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60 group relative',
            isEditing && 'bg-[#f2c74433] hover:bg-[#f2c74433]',
            isRemovingMessage &&
              'bg-rose-500/50 transform transition-all scale-y-0 origin-bottom duration-200',
            className
          )}
        >
          {saveLater && <SaveLaterSign />}
          <div className="flex items-start gap-2">
            <Hint label={formatFulltime(new Date(createdAt))}>
              <button className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 w-[40px] leading-[22px] text-center hover:underline">
                {format(new Date(createdAt), 'hh:mm')}
              </button>
            </Hint>
            {isEditing ? (
              <div className="w-full h-full">
                <Editor
                  onSubmit={handleUpdate}
                  disabled={isPending}
                  defaultValue={JSON.parse(body)}
                  onCancel={() => setEditingId(null)}
                  variant="update"
                />
              </div>
            ) : (
              <div className="flex flex-col w-full">
                <div className={cn(isForward && 'relative -left-5')}>
                  <div
                    className={cn(
                      (!convertJsonToString(body) ||
                        convertJsonToString(body) === '\n') &&
                        'hidden'
                    )}
                  >
                    <CustomRenderer value={body} />
                  </div>
                  {forwardMessageId && (
                    <ForwardMessage messageId={forwardMessageId} />
                  )}
                  {files.length > 0 && (
                    <MessageMedia
                      files={files}
                      messageId={id}
                      isSmallContainer={isSmallContainer}
                    />
                  )}
                  {updatedAt ? (
                    <span className="text-xs text-muted-foreground">
                      (edited)
                    </span>
                  ) : null}
                </div>
                <Reactions
                  data={reactions}
                  onChange={handleReaction}
                  className={cn(isForward && 'hidden')}
                />
                <ThreadBar
                  count={threadCount}
                  image={threadImage}
                  timstamp={threadTimestamp}
                  onClick={() => onOpenMessage(id)}
                  name={threadName}
                  threadUsers={threadUsers}
                />
              </div>
            )}
          </div>
          {!isEditing && (
            <div className={cn(isForward && 'hidden')}>
              <Toolbar
                isAuthor={isAuthor}
                isPending={isPending}
                handleEdit={() => setEditingId(id)}
                handleThread={() => onOpenMessage(id)}
                handleDelete={handleRemove}
                handleReaction={handleReaction}
                handleSaveForLater={handleSaveForLater}
                hideThreadButton={hideThreadButton}
                messageId={id}
                isSaveLater={saveLater}
              />{' '}
            </div>
          )}
        </div>
      </>
    );
  }
  const avatarFallback = authorName.charAt(0).toUpperCase();
  return (
    <>
      <ConfirmDialog />
      <div
        className={cn(
          'flex flex-col gap-2 p-1.5 px-5 hover:bg-gray-100/60 group relative',
          isEditing && 'bg-[#f2c74433] hover:bg-[#f2c74433]',
          saveLater && 'bg-sky-50 hover:bg-bg-sky-50',
          isRemovingMessage &&
            'bg-rose-500/50 transform transition-all scale-y-0 origin-bottom duration-200',
          isForward &&
            ' after:absolute after:top-0 after:left-0 after:h-full after:w-1 after:bg-slate-300',
          className
        )}
      >
        {saveLater && <SaveLaterSign />}
        <div className="flex items-start gap-2">
          <button onClick={() => onOpenProfileMember(memberId)}>
            <UserDetailCard
              memberId={memberId}
              trigger={
                <Avatar
                  className={cn(
                    'size-10 hover:opacity-75 transition',
                    isForward && 'size-4'
                  )}
                >
                  <AvatarImage src={authorImage} alt={authorName} />
                  <AvatarFallback className="aspect-square rounded-md bg-sky-500 text-white">
                    {avatarFallback}
                  </AvatarFallback>
                </Avatar>
              }
            />
          </button>
          {isEditing ? (
            <div className="w-full h-full">
              <Editor
                onSubmit={handleUpdate}
                disabled={isPending}
                defaultValue={JSON.parse(body)}
                onCancel={() => setEditingId(null)}
                variant="update"
              />
            </div>
          ) : (
            <div className="flex flex-col w-full ">
              <div className="text-sm">
                <UserDetailCard
                  memberId={memberId}
                  trigger={
                    <button
                      onClick={() => onOpenProfileMember(memberId)}
                      className="font-bold text-primary hover:underline"
                    >
                      {authorName}
                    </button>
                  }
                />
                <span>&nbsp;&nbsp;</span>
                <Hint label={formatFulltime(new Date(createdAt))}>
                  <button
                    className={cn(
                      'text-xs text-muted-foreground hover:underline',
                      isForward && 'hidden'
                    )}
                  >
                    {formatFullDate ? (
                      <>{formatFulltime(new Date(createdAt))}</>
                    ) : (
                      <>{format(new Date(createdAt), 'h:mm a')}</>
                    )}
                  </button>
                </Hint>
              </div>
              <div className={cn(isForward && 'relative -left-5')}>
                <div
                  className={cn(
                    (!convertJsonToString(body) ||
                      convertJsonToString(body) === '\n') &&
                      'hidden'
                  )}
                >
                  <CustomRenderer value={body} />
                </div>
                {forwardMessageId && (
                  <ForwardMessage messageId={forwardMessageId} />
                )}
                {files.length > 0 && (
                  <MessageMedia
                    files={files}
                    messageId={id}
                    isSmallContainer={isSmallContainer}
                  />
                )}
                {updatedAt ? (
                  <span className="text-xs text-muted-foreground">
                    (edited)
                  </span>
                ) : null}
              </div>
              <Reactions
                data={reactions}
                onChange={handleReaction}
                className={cn(isForward && 'hidden')}
              />
              <ThreadBar
                count={threadCount}
                image={threadImage}
                timstamp={threadTimestamp}
                onClick={() => onOpenMessage(id)}
                name={threadName}
                threadUsers={threadUsers}
              />
            </div>
          )}
        </div>
        {!isEditing && (
          <div className={cn(isForward && 'hidden')}>
            <Toolbar
              isAuthor={isAuthor}
              isPending={isPending}
              handleEdit={() => setEditingId(id)}
              handleThread={() => onOpenMessage(id)}
              handleDelete={handleRemove}
              handleReaction={handleReaction}
              handleSaveForLater={handleSaveForLater}
              hideThreadButton={hideThreadButton}
              messageId={id}
              isSaveLater={saveLater}
            />
          </div>
        )}
      </div>
    </>
  );
};

const SaveLaterSign = () => {
  return (
    <div className="flex items-center gap-2 font-semibold text-sm text-sky-700">
      <Bookmark className=" fill-sky-700 size-4  stroke-sky-700" />
      Save later
    </div>
  );
};

export default Message;
