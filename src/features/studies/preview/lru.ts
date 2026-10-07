/** Keys with a byte size, oldest first (Map keeps insertion order). Holds no values: the provider owns them. */
export class ByteLru {
  private readonly sizes = new Map<string, number>()
  private total = 0

  get bytes(): number {
    return this.total
  }

  keys(): IterableIterator<string> {
    return this.sizes.keys()
  }

  has(key: string): boolean {
    return this.sizes.has(key)
  }

  /** Insert or replace; the key becomes the newest. */
  set(key: string, bytes: number): void {
    this.delete(key)
    this.sizes.set(key, bytes)
    this.total += bytes
  }

  touch(key: string): void {
    const bytes = this.sizes.get(key)
    if (bytes !== undefined) this.set(key, bytes)
  }

  delete(key: string): boolean {
    const bytes = this.sizes.get(key)
    if (bytes === undefined) return false
    this.sizes.delete(key)
    this.total -= bytes
    return true
  }

  /** Remove oldest keys until total ≤ cap; returns them, oldest first, for the caller to release. */
  evictOver(cap: number): string[] {
    const out: string[] = []
    for (const [key, bytes] of this.sizes) {
      if (this.total <= cap) break
      this.sizes.delete(key)
      this.total -= bytes
      out.push(key)
    }
    return out
  }

  clear(): string[] {
    const out = [...this.sizes.keys()]
    this.sizes.clear()
    this.total = 0
    return out
  }
}
