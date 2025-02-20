import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface ConversationHeroProps {
  name?: string;
  image?: string;
}

const ConversationHero = ({
  name = 'Member',
  image,
}: ConversationHeroProps) => {
  const avatarFallback = name.charAt(0).toUpperCase();
  return (
    <div className="mt-[88px] mx-5 mb-4">
      <div className="flex items-center gap-x-1 mb-2">
        <Avatar className="size-14 mr-2">
          <AvatarImage src={image} />
          <AvatarFallback className=" aspect-square rounded-md bg-sky-500 text-white">
            {avatarFallback}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="text-2xl font-bold "># {name}</div>
      <p className="font-normal text-slate-800 mb-4">
        This conversation is just between you and <strong>{name}</strong>
      </p>
    </div>
  );
};

export default ConversationHero;
