// Záznam poslechové kontroly hlasu (ukládá lokální server do user_data/audio-review.json).

export async function fetchReviews(fetchFn = fetch) {
  const res = await fetchFn('/api/reviews', { cache: 'no-store' });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
  const doc = await res.json();
  if (doc?.schema !== 1 || typeof doc.items !== 'object') throw new Error('Záznam poslechové kontroly má neznámý tvar.');
  return doc;
}

export async function saveReviews(doc, fetchFn = fetch) {
  const res = await fetchFn('/api/reviews', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
}
