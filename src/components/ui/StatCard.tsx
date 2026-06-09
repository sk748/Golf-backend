import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

interface StatCardProps {
  icon?: LucideIcon;
  value: ReactNode;
  label: string;
  className?: string;
  testId?: string;
}

export function StatCard({ icon: Icon, value, label, className, testId }: StatCardProps) {
  return (
    <div
      className={cn('glass-light rounded-2xl p-4 sm:p-5', className)}
      data-testid={testId}
    >
      {Icon && <Icon size={20} className="mb-2 text-azure" />}
      <p className="text-xl font-black text-silver sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-slate">{label}</p>
    </div>
  );
}
