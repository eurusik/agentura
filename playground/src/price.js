/**
 * Format an amount in kopecks as a price string.
 * @param {number} kopecks integer amount, e.g. 129900
 * @returns {string} e.g. "1 299,00 ₴"
 */
export function formatPrice(kopecks) {
  if (!Number.isInteger(kopecks)) throw new TypeError("kopecks must be an integer");
  const sign = kopecks < 0 ? "-" : "";
  const abs = Math.abs(kopecks);
  const uah = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const kop = String(abs % 100).padStart(2, "0");
  return `${sign}${uah},${kop} ₴`;
}
