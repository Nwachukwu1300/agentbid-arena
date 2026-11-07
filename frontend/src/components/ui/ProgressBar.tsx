import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'red';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  color = 'purple',
  size = 'md',
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colorClasses = {
    purple: 'bg-accent-felt',
    blue: 'bg-accent-blue',
    green: 'bg-accent-green',
    orange: 'bg-gold-hover', // warm "watch this" colour from the world's gold, not an off-palette orange
    red: 'bg-accent-red',
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-text-secondary">{label}</span>}
          {showPercentage && (
            <span className="text-xs font-medium text-text-primary">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div className={cn('w-full overflow-hidden rounded-full bg-background-tertiary', sizeClasses[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
