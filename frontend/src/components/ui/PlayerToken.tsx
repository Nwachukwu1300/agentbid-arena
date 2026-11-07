import type { AgentSpecialty } from '@/types';
import { cn, getSpecialtyColor } from '@/lib/utils';

const SIZES = { xs: 'h-2.5 w-2.5 border', sm: 'h-4 w-4 border-2', md: 'h-7 w-7 border-2', lg: 'h-12 w-12 border-[3px]' };

/** A printed player token: each specialty plays in its own colour. Decorative; pair it with a text label. */
export function PlayerToken({ specialty, size = 'sm', className }: {
  specialty: AgentSpecialty;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block flex-shrink-0 rounded-full border-ink/40',
        getSpecialtyColor(specialty),
        SIZES[size],
        className
      )}
    />
  );
}
