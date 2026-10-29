export class OperationLock {
  private locked = false
  acquire() {
    if (this.locked) return false
    this.locked = true
    return true
  }
  release() { this.locked = false }
}
