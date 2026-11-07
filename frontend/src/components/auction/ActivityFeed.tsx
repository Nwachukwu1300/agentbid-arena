import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, formatTimeAgo, formatCredits, getSpecialtyColor } from '@/lib/utils';
import { LiveIndicator, SpecialtyBadge } from '@/components/ui';
import { useSSE } from '@/lib/sse';
import type { ActivityItem, AgentSpecialty } from '@/types';

interface ActivityFeedProps {
  maxItems?: number;
  className?: string;
}

export function ActivityFeed({ maxItems = 10, className }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const { events, isConnected } = useSSE('all');

  // Convert SSE events to activity items
  useEffect(() => {
    if (events.length === 0) return;

    // Individual negotiation messages arrive every few seconds; the auction page shows those
    const newActivities: ActivityItem[] = events.filter((event) => event.type !== 'negotiation_message').map((event) => {
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case 'bid_placed':
          return {
            id: `bid-${data.bid_id || Date.now()}`,
            type: event.type,
            title: `${data.agent_name} submitted a sealed bid`,
            description: 'Revealed when the auction closes',
            agent_name: data.agent_name as string,
            agent_specialty: data.agent_specialty as AgentSpecialty,
            auction_id: data.auction_id as string,
            timestamp: event.timestamp,
          };

        case 'auction_created':
          return {
            id: `auction-${data.auction_id || Date.now()}`,
            type: event.type,
            title: `New job: "${data.job_title}"`,
            description: `${formatCredits(data.job_base_price as number)} budget`,
            agent_specialty: data.job_specialty as AgentSpecialty,
            auction_id: data.auction_id as string,
            timestamp: event.timestamp,
          };

        case 'auction_closed':
          return {
            id: `closed-${data.auction_id || Date.now()}`,
            type: event.type,
            title: data.winner_agent_name
              ? `${data.winner_agent_name} won "${data.job_title}"`
              : `Auction closed: "${data.job_title}"`,
            description: data.winning_bid
              ? data.price_paid && data.price_paid !== data.winning_bid
                ? `Bid ${formatCredits(data.winning_bid as number)}, paid ${formatCredits(data.price_paid as number)} (runner-up's bid)`
                : `Won at ${formatCredits(data.winning_bid as number)}`
              : 'No winner',
            agent_name: data.winner_agent_name as string,
            amount: data.winning_bid as number,
            auction_id: data.auction_id as string,
            timestamp: event.timestamp,
          };

        case 'season_ended':
          return {
            id: `season-${data.season_number}`,
            type: event.type,
            title: data.winner_agent_name
              ? `Season ${data.season_number} won by ${data.winner_agent_name}`
              : `Season ${data.season_number} ended`,
            description: data.winner_credits != null
              ? `Finished with ${formatCredits(data.winner_credits as number)}. Credits reset for the new season.`
              : 'Credits reset for the new season.',
            agent_name: data.winner_agent_name as string,
            timestamp: event.timestamp,
          };

        case 'negotiation_started':
          return {
            id: `negotiation-${data.negotiation_id}`,
            type: event.type,
            title: `${data.agent_name} is negotiating "${data.job_title}"`,
            description: `The client wants to talk price. Opening at ${formatCredits(data.opening_price as number)}`,
            agent_name: data.agent_name as string,
            auction_id: data.auction_id as string,
            timestamp: event.timestamp,
          };

        case 'negotiation_ended':
          return {
            id: `negotiation-end-${data.negotiation_id}`,
            type: event.type,
            title: data.status === 'deal'
              ? `Deal at ${formatCredits(data.final_price as number)}`
              : 'Negotiation ended with no deal',
            description: data.status === 'deal' ? 'Work starts now.' : 'The job goes unfilled.',
            auction_id: data.auction_id as string,
            timestamp: event.timestamp,
          };

        case 'agent_decision':
          return {
            id: `decision-${Date.now()}`,
            type: event.type,
            title: `${data.agent_name} ${data.decision_type}`,
            description: data.reasoning as string,
            agent_name: data.agent_name as string,
            agent_specialty: data.agent_specialty as AgentSpecialty,
            timestamp: event.timestamp,
          };

        default:
          return {
            id: `event-${Date.now()}`,
            type: event.type,
            title: 'Activity',
            description: JSON.stringify(data),
            timestamp: event.timestamp,
          };
      }
    });

    setActivities(newActivities.slice(0, maxItems));
  }, [events, maxItems]);

  return (
    <div className={cn('card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text-primary">Live Activity</h2>
        <LiveIndicator label={isConnected ? 'Live' : 'Connecting...'} />
      </div>

      {/* Activity List */}
      <div className="space-y-3">
        {activities.length === 0 && (
          <p className="text-sm text-text-muted text-center py-6">
            {isConnected ? 'Waiting for the next bid...' : 'Connecting to the live feed...'}
          </p>
        )}
        {activities.map((activity, index) => (
          <FeedItem
            key={activity.id}
            auctionId={activity.auction_id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg bg-background-tertiary/50 animate-fade-in',
              activity.auction_id && 'hover:bg-background-tertiary transition-colors',
              index === 0 && 'bg-background-tertiary'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Specialty indicator */}
            <div
              className={cn(
                'mt-0.5 h-2 w-2 rounded-full flex-shrink-0',
                activity.agent_specialty
                  ? getSpecialtyColor(activity.agent_specialty)
                  : 'bg-text-muted'
              )}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-text-primary font-medium truncate">
                  {activity.title}
                </p>
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {formatTimeAgo(activity.timestamp)}
                </span>
              </div>
              <p className="text-xs text-text-secondary truncate">
                {activity.description}
              </p>
              {activity.agent_specialty && (
                <SpecialtyBadge specialty={activity.agent_specialty} size="sm" className="mt-1" />
              )}
            </div>
          </FeedItem>
        ))}
      </div>

      {/* View All Link */}
      {activities.length > 5 && (
        <button className="mt-4 w-full text-center text-sm text-text-muted hover:text-text-primary transition-colors">
          View all activity
        </button>
      )}
    </div>
  );
}

// Auction events link to the auction page; others (e.g. season results) are plain
function FeedItem({ auctionId, className, style, children }: {
  auctionId?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return auctionId ? (
    <Link to={`/auctions/${auctionId}`} className={className} style={style}>{children}</Link>
  ) : (
    <div className={className} style={style}>{children}</div>
  );
}
