import { cn } from '../../lib/cn';

interface AvatarProps {
  name: string;
  className?: string;
}

// Initial-in-a-circle avatar (no uploaded photos in the contract).
export function Avatar({ name, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-azure/30 bg-azure/20 text-sm font-bold text-azure',
        className,
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
