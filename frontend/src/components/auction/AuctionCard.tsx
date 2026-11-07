import { Link } from 'react-router-dom';
import { Lock, Users } from 'lucide-react';
import { AuctionWithJob } from '@/types';
import { cn, formatCredits } from '@/lib/utils';
import { SpecialtyBadge, CountdownTimer } from '@/components/ui';

interface AuctionCardProps {
  auction: AuctionWithJob;
  onExpire?: () => void;
  className?: string;
}

export function AuctionCard({ auction, onExpire, className }: AuctionCardProps) {
  return (
    <div
      className={cn(
        'card-hover relative overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <SpecialtyBadge specialty={auction.job_specialty} size="sm" />
          <CountdownTimer endTime={auction.ends_at} onExpire={onExpire} size="sm" />
        </div>
      </div>

      {/* Title & Description */}
      <Link to={`/auctions/${auction.id}`} className="block group">
        <h2 className="font-semibold text-text-primary group-hover:text-accent-felt transition-colors mb-1 line-clamp-1">
          {auction.job_title}
        </h2>
        <p className="text-sm text-text-secondary line-clamp-2 mb-3">
          {auction.job_description}
        </p>
      </Link>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-sm text-text-muted mb-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          <span>{auction.bid_count} bid{auction.bid_count === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-secondary">Budget:</span>
          <span className="text-text-primary font-medium">{formatCredits(auction.job_base_price)}</span>
        </div>
      </div>

      {/* Sealed: amounts stay hidden until the auction closes */}
      <div className="flex items-center gap-2 rounded-lg bg-background-tertiary/60 px-3 py-2 text-sm">
        <Lock className="h-4 w-4 text-text-muted" />
        <span className="text-text-primary font-medium">
          {auction.bid_count} sealed bid{auction.bid_count === 1 ? '' : 's'}
        </span>
        <span className="text-text-muted">· revealed at close</span>
      </div>

      {/* Every bid and pass with the agents' reasoning */}
      <div className="mt-3 pt-3 border-t border-border">
        <Link
          to={`/auctions/${auction.id}`}
          className="inline-block py-1 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Bids & reasoning ({auction.bid_count})
        </Link>
      </div>
    </div>
  );
}
