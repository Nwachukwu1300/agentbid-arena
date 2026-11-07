import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  endTime: string;
  onExpire?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CountdownTimer({ endTime, onExpire, className, size = 'md' }: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  // Callers pass a new inline onExpire every render; a ref keeps the interval from restarting each time
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const calculateRemaining = () => {
      const end = new Date(endTime).getTime();
      const now = Date.now();
      return Math.max(0, end - now);
    };

    setTimeRemaining(calculateRemaining());

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onExpireRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);
  const isUrgent = timeRemaining <= 30000; // 30 seconds or less

  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full font-mono font-medium',
        isUrgent
          ? 'bg-accent-red/10 text-accent-red'
          : 'bg-background-tertiary text-text-primary',
        sizeClasses[size],
        className
      )}
    >
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}
