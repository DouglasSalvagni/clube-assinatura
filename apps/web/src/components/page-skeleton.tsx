import type { CSSProperties } from 'react';

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className = '', style }: SkeletonProps) {
  return <span aria-hidden="true" className={`skeleton block rounded-md ${className}`} style={style} />;
}

function LoadingStatus({ label = 'Carregando conteúdo' }: { label?: string }) {
  return <span className="sr-only">{label}</span>;
}

export function TableSkeleton({
  rows = 6,
  columns = 4,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`overflow-hidden rounded-xl border border-edge bg-surface-elevated shadow-sm ${className}`}
    >
      <LoadingStatus label="Carregando tabela" />
      <div
        className="grid gap-4 border-b border-edge bg-surface-canvas/60 px-5 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-20 max-w-full" />
        ))}
      </div>
      <div className="divide-y divide-edge">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-4 px-5 py-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={`h-4 max-w-full ${
                  columnIndex === 0 ? 'w-36' : columnIndex === columns - 1 ? 'w-16' : 'w-24'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  cards = 6,
  className = '',
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      <LoadingStatus label="Carregando cartões" />
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-5 h-5 w-2/3" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({
  items = 4,
  className = '',
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={`space-y-4 ${className}`}>
      <LoadingStatus label="Carregando lista" />
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="mt-3 h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton({ className = '' }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" className={`space-y-6 p-8 ${className}`}>
      <LoadingStatus label="Carregando detalhes" />
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-6 w-36" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <Skeleton className="h-5 w-44" />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KanbanSkeleton({ className = '' }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" className={`flex min-h-0 flex-1 gap-4 overflow-hidden ${className}`}>
      <LoadingStatus label="Carregando quadro Kanban" />
      {Array.from({ length: 4 }).map((_, columnIndex) => (
        <div
          key={columnIndex}
          className="flex w-[320px] shrink-0 flex-col rounded-2xl border border-edge bg-surface/70 p-3"
        >
          <div className="flex items-center justify-between px-1 py-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-8 rounded-full" />
          </div>
          <div className="mt-2 space-y-3">
            {Array.from({ length: columnIndex % 2 === 0 ? 4 : 3 }).map((_, cardIndex) => (
              <div key={cardIndex} className="rounded-xl border border-edge bg-surface-elevated p-4 shadow-sm">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-3 h-3 w-1/2" />
                <div className="mt-5 flex items-center justify-between">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-7 w-7 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PublicPageSkeleton({ className = '' }: { className?: string }) {
  return (
    <main
      role="status"
      aria-busy="true"
      className={`mx-auto min-h-screen w-full max-w-4xl px-6 py-10 sm:px-8 ${className}`}
    >
      <LoadingStatus />
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-center">
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
        <Skeleton className="mx-auto mt-6 h-8 w-64 max-w-full" />
        <Skeleton className="mx-auto mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8 rounded-2xl border border-edge bg-surface-elevated p-6 shadow-sm sm:p-8">
          <Skeleton className="h-5 w-40" />
          <div className="mt-6 space-y-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-11 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-7 h-11 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}

export function PageSkeleton({
  variant = 'table',
  className = '',
}: {
  variant?: 'dashboard' | 'table' | 'cards' | 'detail' | 'kanban';
  className?: string;
}) {
  if (variant === 'detail') return <DetailSkeleton className={className} />;

  return (
    <div
      role="status"
      aria-busy="true"
      className={`flex min-h-full flex-col gap-6 p-6 sm:p-8 ${className}`}
    >
      <LoadingStatus />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {variant === 'dashboard' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-4 h-8 w-32" />
                <Skeleton className="mt-3 h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="grid flex-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="min-h-64 rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
                <Skeleton className="h-5 w-40" />
                <div className="mt-8 flex h-40 items-end gap-3">
                  {[45, 75, 55, 88, 68, 92, 62].map((height, barIndex) => (
                    <Skeleton key={barIndex} className="flex-1" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {variant === 'table' && <TableSkeleton className="flex-1" />}
      {variant === 'cards' && <CardGridSkeleton className="flex-1" />}
      {variant === 'kanban' && <KanbanSkeleton className="flex-1" />}
    </div>
  );
}
