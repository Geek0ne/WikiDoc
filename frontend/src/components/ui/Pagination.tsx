import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  labelTotal?: string;
}

export function Pagination({ page, total, limit, onChange, labelTotal }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  if (pageCount <= 1) {
    return labelTotal ? <p className="py-2 text-2xs text-fg-muted">{labelTotal}</p> : null;
  }
  return (
    <nav aria-label="pagination" className="flex items-center justify-center gap-3 py-3">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={14} aria-hidden />
      </Button>
      <span className="text-2xs tabular-nums text-fg-secondary">
        {page} / {pageCount}
        {labelTotal ? <span className="ml-2 text-fg-muted">{labelTotal}</span> : null}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={14} aria-hidden />
      </Button>
    </nav>
  );
}
