import React, { useRef, useState } from 'react';
import { Doc, Id } from '../../../../../convex/_generated/dataModel';
import { useGetMessage } from '@/features/messages/api/use-get-message';
import Message from '@/components/message';
import { AlertTriangle } from 'lucide-react';
import { useCurrentMember } from '@/features/members/api/use-current-member';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { useGetMessages } from '@/features/messages/api/use-get-messages';
import Editor from '@/components/editor';
import Quill from 'quill';
import { toast } from 'sonner';
import { useCreateMessage } from '@/features/messages/api/use-create-message';
import { useGenerateUploadUrl } from '@/features/upload/api/use-generate-upload-url';
import { renderDisplayName } from '@/utils/label';
import { CreateMessageValues } from '@/models';
import { useCreateFile } from '@/features/upload/api/use-create-file';

interface ThreadComponentProps {
  messageId: Id<'messages'>;
  userInThreads: (Doc<'users'> | null | undefined)[];
}

const initMessLoad = 2;

const ThreadComponent = ({
  messageId,
  userInThreads,
}: ThreadComponentProps) => {
  const workspaceId = useWorkspaceId();
  const { data: currentMember } = useCurrentMember({ workspaceId });
  const [isFetchAll, setIsFetchAll] = useState(false);

  const { data: message, isLoading: loadingMessage } = useGetMessage({
    id: messageId,
  });

  const { results, status, totalItems } = useGetMessages({
    channelId: message?.channelId,
    parentMessageId: messageId,
    initialNumItems: initMessLoad,
    fetchAll: isFetchAll,
  });

  const { mutate: createMessage } = useCreateMessage();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();
  const { mutate: createFile } = useCreateFile();

  const [editingId, setEditingId] = useState<Id<'messages'> | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<Quill | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async ({
    body,
    files,
  }: {
    body: string;
    files: File[];
  }) => {
    try {
      if (!message?.channelId) return;

      setIsPending(true);
      editorRef?.current?.enable(false);

      const values: CreateMessageValues = {
        channelId: message?.channelId,
        workspaceId,
        body,
        files: [],
        parentMessageId: messageId,
      };

      await Promise.all(
        files.map(async (file) => {
          if (file) {
            const url = await generateUploadUrl({}, { throwError: true });

            const result = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': file.type },
              body: file,
            });

            if (!result) {
              throw new Error('Failed to upload image');
            }

            const { storageId } = await result.json();
            await createFile({ storageId, name: file.name }, {});

            values.files = [...values.files, storageId];
          }
        })
      );

      await createMessage(values, { throwError: true });
      setEditorKey((prevKey) => prevKey + 1);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setIsPending(false);
      editorRef?.current?.enable(true);
    }
  };

  if (loadingMessage || status === 'LoadingFirstPage') {
    return null;
  }

  if (!message) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex flex-col gap-y-2 h-full items-center justify-center">
          <AlertTriangle className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Message not found</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-medium text-slate-800">
          # {message.channel?.name}
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          {userInThreads.map(
            (user, idx) =>
              `${user?.name}${idx !== userInThreads.length - 1 ? ',' : ''}`
          )}{' '}
          and you
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <Message
          hideThreadButton
          memberId={message.memberId}
          authorImage={
            message.user.memberPreference.image || message?.user?.image
          }
          authorName={renderDisplayName(
            message.user?.name,
            message.user?.memberPreference
          )}
          isAuthor={message.memberId === currentMember?._id}
          body={message.body}
          files={message.files}
          createdAt={message._creationTime}
          updatedAt={message.updatedAt}
          id={message._id}
          reactions={message.reactions}
          isEditing={editingId === message._id}
          setEditingId={setEditingId}
          saveLater={message.saveLater}
        />
        <div className="flex flex-col-reverse">
          {results.map((message) => {
            return (
              <Message
                key={message._id}
                id={message._id}
                memberId={message.memberId}
                authorImage={
                  message.user.memberPreference.image || message.user.image
                }
                authorName={renderDisplayName(
                  message.user.name,
                  message.user.memberPreference
                )}
                isAuthor={message.memberId === currentMember?._id}
                reactions={message.reactions}
                body={message.body}
                files={message.files}
                updatedAt={message.updatedAt}
                createdAt={message._creationTime}
                isEditing={editingId === message._id}
                setEditingId={setEditingId}
                isCompact={false}
                hideThreadButton={true}
                threadCount={message.threadCount}
                threadImage={message.threadImage}
                threadTimestamp={message.threadTimestamp}
                threadName={message.threadName}
                threadUsers={message.usersInThread}
                saveLater={message.saveLater}
              />
            );
          })}
          {totalItems > initMessLoad && !isFetchAll && (
            <span
              className="px-4 text-sky-500 hover:underline cursor-pointer"
              onClick={() => setIsFetchAll(true)}
            >
              Show {totalItems - initMessLoad} more replies
            </span>
          )}
        </div>
        <div className="px-4">
          <Editor
            key={editorKey}
            onSubmit={handleSubmit}
            innerRef={editorRef}
            disabled={isPending}
            placeholder="Reply..."
          />
        </div>
      </div>
    </>
  );
};

export default ThreadComponent;
