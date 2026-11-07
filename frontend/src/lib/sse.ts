import type { SSEEvent, SSEEventType } from '@/types';

type SSECallback = (event: SSEEvent) => void;

class SSEClient {
  private eventSource: EventSource | null = null;
  private callbacks: Map<SSEEventType | 'all', Set<SSECallback>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url = '/api/events/stream';
  private listening = false;
  private lastHeard = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  connect(url: string = '/api/events/stream') {
    this.url = url;
    if (this.eventSource) {
      this.disconnect();
    }
    this.listenForWakeUp();

    this.eventSource = new EventSource(url);
    this.lastHeard = Date.now();
    this.startWatchdog();
    // The server pings every 15s; any message proves the connection is alive
    this.eventSource.addEventListener('ping', () => { this.lastHeard = Date.now(); });
    this.eventSource.addEventListener('connected', () => { this.lastHeard = Date.now(); });

    this.eventSource.onopen = () => {
      if (this.reconnectAttempts > 0) console.info('Live feed reconnected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onmessage = (event) => {
      this.lastHeard = Date.now();
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        this.emit(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = () => {
      // Expected when the server restarts or the network drops: warn once per outage, keep retrying
      if (this.reconnectAttempts === 0) console.warn('Live feed disconnected, reconnecting...');
      this.eventSource?.close();
      this.scheduleReconnect();
    };

    // Handle specific event types
    const eventTypes: SSEEventType[] = [
      'auction_created',
      'bid_placed',
      'auction_closed',
      'season_ended',
      'agent_decision',
      'negotiation_started',
      'negotiation_message',
      'negotiation_ended',
    ];

    eventTypes.forEach((type) => {
      this.eventSource?.addEventListener(type, (event) => {
        this.lastHeard = Date.now();
        try {
          const messageEvent = event as MessageEvent;
          const data: SSEEvent = {
            type,
            data: JSON.parse(messageEvent.data),
            timestamp: new Date().toISOString(),
          };
          this.emit(data);
        } catch (error) {
          console.error(`Failed to parse ${type} event:`, error);
        }
      });
    });
  }

  // Retry forever (1s, 2s, 4s ... capped at 30s). Before, it gave up after 5 tries and the feed stayed dead.
  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.url);
    }, delay);
  }

  // A connection can look open but be dead (e.g. a proxy that never noticed the server went away).
  // No message, not even a ping, for 45s means it is dead: reconnect.
  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      if (this.eventSource && !this.reconnectTimer && Date.now() - this.lastHeard > 45000) {
        if (this.reconnectAttempts === 0) console.warn('Live feed went quiet, reconnecting...');
        this.eventSource.close();
        this.eventSource = null;
        this.scheduleReconnect();
      }
    }, 10000);
  }

  // Reconnect right away when the network returns or the tab is shown again (e.g. after sleep)
  private listenForWakeUp() {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const reconnectNow = () => {
      if (this.isConnected) return;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.connect(this.url);
    };
    window.addEventListener('online', reconnectNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconnectNow();
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  subscribe(eventType: SSEEventType | 'all', callback: SSECallback): () => void {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, new Set());
    }
    this.callbacks.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.get(eventType)?.delete(callback);
    };
  }

  private emit(event: SSEEvent) {
    // Emit to specific event type subscribers
    this.callbacks.get(event.type)?.forEach((callback) => callback(event));
    // Emit to 'all' subscribers
    this.callbacks.get('all')?.forEach((callback) => callback(event));
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Singleton instance
export const sseClient = new SSEClient();

// React hook for SSE
import { useEffect, useState, useCallback } from 'react';

export function useSSE<T = unknown>(eventType: SSEEventType | 'all' = 'all') {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect if not already connected
    if (!sseClient.isConnected) {
      sseClient.connect();
    }
    setIsConnected(sseClient.isConnected);

    const unsubscribe = sseClient.subscribe(eventType, (event) => {
      setLastEvent(event);
      setEvents((prev) => [event, ...prev].slice(0, 100)); // Keep last 100 events
    });

    // Check connection status periodically
    const interval = setInterval(() => {
      setIsConnected(sseClient.isConnected);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [eventType]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  return {
    lastEvent: lastEvent as (SSEEvent & { data: T }) | null,
    events: events as (SSEEvent & { data: T })[],
    isConnected,
    clearEvents,
  };
}
