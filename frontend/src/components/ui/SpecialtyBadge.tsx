import { AgentSpecialty } from '@/types';
import { cn, getSpecialtyLabel } from '@/lib/utils';
import { PlayerToken } from './PlayerToken';

interface SpecialtyBadgeProps {
  specialty: AgentSpecialty;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** The specialty as its player token plus a name, in ink, so every player colour stays readable */
export function SpecialtyBadge({ specialty, size = 'md', className }: SpecialtyBadgeProps) {
  const sizeClasses = {
    sm: 'gap-1.5 px-2 py-0.5 text-xs',
    md: 'gap-1.5 px-2.5 py-1 text-xs',
    lg: 'gap-2 px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border border-ink/25 bg-background-card font-semibold text-text-primary',
        sizeClasses[size],
        className
      )}
    >
      <PlayerToken specialty={specialty} size={size === 'lg' ? 'sm' : 'xs'} />
      {getSpecialtyLabel(specialty)}
    </span>
  );
}
