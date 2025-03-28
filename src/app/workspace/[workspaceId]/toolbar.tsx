import { Button } from '@/components/ui/button';
import { useGetWorkspace } from '@/features/workspaces/api/use-get-workspace';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { Info, Search } from 'lucide-react';

import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useState } from 'react';
import { useGetChannels } from '@/features/channels/api/use-get-channels';
import { useGetMembers } from '@/features/members/api/use-get-members';
import { useRouter } from 'next/navigation';
import { renderDisplayName } from '@/utils/label';

const Toolbar = () => {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { data } = useGetWorkspace({ id: workspaceId });
  const { data: channels } = useGetChannels({ workspaceId });
  const { data: members } = useGetMembers({ workspaceId });

  const [open, setOpen] = useState(false);

  const onChanelClick = (channelId: string) => {
    setOpen(false);

    router.push(`/workspace/${workspaceId}/channel/${channelId}`);
  };

  const onMemberClick = (memberId: string) => {
    setOpen(false);

    router.push(`/workspace/${workspaceId}/member/${memberId}`);
  };

  return (
    <nav className="bg-[#481349] flex items-center justify-between h-10 p-1.5">
      <div className="flex-1" />
      <div className="min-w-[280px] max-[642px] grow-[2] shrink">
        <Button
          onClick={() => setOpen(true)}
          size={'sm'}
          className="bg-accent/25 hover:bg-accent-25 w-full justify-start h-7 px-2"
        >
          <Search className="size-4 text-white mr-2" />
          <span className="text-white text-xs">Search {data?.name}</span>
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandGroup heading="Channels">
              {channels?.map((channel) => (
                <CommandItem
                  key={channel._id}
                  onClick={() => onChanelClick(channel._id)}
                  asChild
                >
                  {channel.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Members">
              {members?.map((member) => (
                <CommandItem
                  onClick={() => onMemberClick(member._id)}
                  key={member._id}
                  asChild
                >
                  {renderDisplayName(
                    member.user.name,
                    member.user.memberPreference
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
      <div className="ml-auto flex-1 flex items-center justify-end">
        <Button variant={'transparent'} size={'iconSm'}>
          <Info className="size-5 text-white" />
        </Button>
      </div>
    </nav>
  );
};

export default Toolbar;
