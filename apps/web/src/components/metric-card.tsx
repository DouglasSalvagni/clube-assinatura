import { ReactNode } from 'react';

interface MetricCardProps {
  value: string;
  label: string;
  trend?: { value: string; positive: boolean };
  stripColor: string;
  children?: ReactNode;
}

export default function MetricCard({ value, label, trend, stripColor, children }: MetricCardProps) {
  return (
    <div className="relative flex items-start gap-4 rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
      <span
        className="mt-0.5 h-10 w-1 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
        style={{ backgroundColor: stripColor }}
      />
      <div className="flex-1">
        <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
        <p className="mt-0.5 text-sm text-ink-tertiary">{label}</p>
        {trend && (
          <span
            className={`mt-2 inline-flex items-center gap-0.5 text-xs font-medium ${
              trend.positive ? 'text-success' : 'text-danger'
            }`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={trend.positive ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'}
              />
            </svg>
            {trend.value}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
