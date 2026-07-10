/**
 * Status mapping helpers for backfill. Mirrors the mapping functions in
 * `src/lib/compliance.ts` so the migration produces the same statuses the
 * read-path fallback would have derived.
 */

function staffDocStatusToCompliance(status) {
  switch (status) {
    case 'active':
      return 'verified';
    case 'expired':
      return 'expired';
    case 'pending_renewal':
      return 'pending';
    default:
      return 'pending';
  }
}

function applicationDocStatusToCompliance(status) {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    case 'pending':
    default:
      return 'pending';
  }
}

/** Past expiry always reads as expired, regardless of stored status. */
function applyExpiryOverride(status, expiryDate, now) {
  if (expiryDate && new Date(expiryDate).getTime() <= now.getTime()) {
    return 'expired';
  }
  return status;
}

module.exports = {
  staffDocStatusToCompliance,
  applicationDocStatusToCompliance,
  applyExpiryOverride,
};
