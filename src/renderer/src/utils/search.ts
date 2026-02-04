/**
 * Simple search matching utility
 * Since we cannot easily install large pinyin libraries, this implements:
 * 1. Case-insensitive substring matching
 * 2. Keyword matching
 * 3. Simple character matching
 */

export const matchText = (text: string, query: string): boolean => {
  if (!text || !query) return false
  const t = text.toLowerCase()
  const q = query.toLowerCase()

  // Exact substring match
  if (t.includes(q)) return true

  // Simple fuzzy match (if query characters appear in order)
  // This is a very basic "initials-like" match for English,
  // but doesn't solve Chinese Initials without a dictionary.
  // Example: "tb" matches "TaskBar"
  let tIndex = 0
  let qIndex = 0
  while (tIndex < t.length && qIndex < q.length) {
    if (t[tIndex] === q[qIndex]) {
      qIndex++
    }
    tIndex++
  }
  // Only enable fuzzy match if query is short to avoid false positives
  if (qIndex === q.length && q.length > 1 && q.length < 5) return true

  return false
}

// Mock Pinyin matcher for specific common keywords if needed,
// but for now we rely on the keywords array in searchIndex.ts which can include pinyin.
