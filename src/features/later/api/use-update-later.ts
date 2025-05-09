import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { useCallback, useMemo, useState } from 'react';
import { Id } from '../../../../convex/_generated/dataModel';

type RequestType = {
  workspaceId: Id<'workspaces'>;
  messageId: Id<'messages'>;
  fileId?: Id<'files'>;
  status: 'inprogress' | 'archived' | 'completed';
  channelId?: Id<'channels'>;
  conversationId?: Id<'conversations'>;
  parentMessageId?: Id<'messages'>;
};
type ResponseType = Id<'savedLaters'> | null;

type Options = {
  onSuccess?: (data: ResponseType) => void;
  onError?: (error: Error) => void;
  onSettle?: () => void;
  throwError?: boolean;
};

export const useUpdateAsLater = () => {
  const [data, setData] = useState<RequestType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    'success' | 'error' | 'settled' | 'pending' | null
  >(null);

  const isPending = useMemo(() => status === 'pending', [status]);
  const isSuccess = useMemo(() => status === 'success', [status]);
  const isError = useMemo(() => status === 'error', [status]);
  const isSettled = useMemo(() => status === 'settled', [status]);

  const mutation = useMutation(api.saveLaters.save);

  const mutate = useCallback(
    async (values: RequestType, options: Options) => {
      try {
        setData(null);
        setError(null);
        setStatus('pending');

        const response = await mutation(values);
        options?.onSuccess?.(response);
        return response;
      } catch (error) {
        setStatus('error');
        options?.onError?.(error as Error);
        if (options?.throwError) {
          throw error;
        }
        throw error;
      } finally {
        setStatus('settled');
        options?.onSettle?.();
      }
    },
    [mutation]
  );

  return { mutate, data, error, isPending, isSuccess, isError, isSettled };
};
