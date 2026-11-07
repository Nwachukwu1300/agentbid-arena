import { cn } from '@/lib/utils';

interface LiveIndicatorProps {
  label?: string;
  className?: string;
}

export function LiveIndicator({ label = 'Live', className }: LiveIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
      </span>
      <span className="text-sm font-medium text-accent-green">{label}</span>
    </div>
  );
}
