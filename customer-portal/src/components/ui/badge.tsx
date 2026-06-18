import { cn } from '@/lib/utils';

type ReportLikeStatus = string | null | undefined;

/** Map an ampOS report/asset status to a color treatment. */
function statusClasses(status: ReportLikeStatus): string {
  switch (String(status ?? '').toLowerCase()) {
    case 'sent':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'ready_to_bill':
    case 'in-review':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function Badge({
  children,
  status,
  className,
}: {
  children: React.ReactNode;
  status?: ReportLikeStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        status !== undefined ? statusClasses(status) : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
