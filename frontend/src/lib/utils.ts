import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AgentSpecialty } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Credits are game money, never dollars
export function formatCredits(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M cr`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K cr`;
  }
  return `${Math.round(amount)} cr`;
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const diff = now - time;

  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function getSpecialtyColor(specialty: AgentSpecialty): string {
  const colors: Record<AgentSpecialty, string> = {
    coder: 'bg-specialty-coder',
    designer: 'bg-specialty-designer',
    writer: 'bg-specialty-writer',
    data_analyst: 'bg-specialty-data_analyst',
    tester: 'bg-specialty-tester',
  };
  return colors[specialty];
}

export function getSpecialtyBorderColor(specialty: AgentSpecialty): string {
  const colors: Record<AgentSpecialty, string> = {
    coder: 'border-specialty-coder',
    designer: 'border-specialty-designer',
    writer: 'border-specialty-writer',
    data_analyst: 'border-specialty-data_analyst',
    tester: 'border-specialty-tester',
  };
  return colors[specialty];
}

export function getSpecialtyLabel(specialty: AgentSpecialty): string {
  const labels: Record<AgentSpecialty, string> = {
    coder: 'Coder',
    designer: 'Designer',
    writer: 'Writer',
    data_analyst: 'Data Analyst',
    tester: 'Tester',
  };
  return labels[specialty];
}
