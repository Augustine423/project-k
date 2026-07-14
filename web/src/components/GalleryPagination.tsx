interface GalleryPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function GalleryPagination({ page, totalPages, onPageChange }: GalleryPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="gallery-pagination" role="navigation" aria-label="Video gallery pages">
      <button
        type="button"
        className="gallery-page-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="gallery-page-meta">
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        className="gallery-page-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
