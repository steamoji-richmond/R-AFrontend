export default function Pagination({ page, totalPages, total, onPrev, onNext }) {
  if (totalPages <= 1) return null
  return (
    <div
      className="row"
      style={{
        marginTop: 12,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        display: 'flex',
      }}
    >
      <button
        className="primary"
        style={{ padding: '8px 16px', fontSize: 14 }}
        disabled={page === 1}
        onClick={onPrev}
      >
        Previous
      </button>
      <span className="caption" style={{ minWidth: 120, textAlign: 'center' }}>
        Page {page} of {totalPages} ({total} total)
      </span>
      <button
        className="primary"
        style={{ padding: '8px 16px', fontSize: 14 }}
        disabled={page === totalPages}
        onClick={onNext}
      >
        Next
      </button>
    </div>
  )
}
