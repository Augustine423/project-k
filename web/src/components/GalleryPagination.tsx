interface GalleryPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalParticipants?: number;
  offPageCount?: number;
}

export function GalleryPagination({
  page,
  totalPages,
  onPageChange,
  totalParticipants,
  offPageCount = 0,
}: GalleryPaginationProps) {
  if (totalPages <= 1 && offPageCount === 0) return null;

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
        {totalPages > 1 ? (
          <>
            <strong>
              {page}/{totalPages}
            </strong>
            {totalParticipants != null && totalParticipants > 1 ? (
              <> · {totalParticipants} participants</>
            ) : null}
          </>
        ) : (
          <>
            {totalParticipants != null ? `${totalParticipants} participants` : "Gallery"}
          </>
        )}
        {offPageCount > 0 ? <> · {offPageCount} off-page (audio when active)</> : null}
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
