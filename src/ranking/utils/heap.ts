export class BoundedMaxHeap<T> {
  private heap: T[] = [];
  private size: number = 0;
  
  constructor(
    private maxSize: number,
    private compareKey: (item: T) => number
  ) {}
  
  pushIfTopK(item: T): boolean {
    const score = this.compareKey(item);
    
    if (this.size < this.maxSize) {
      // Heap not full, add item
      this.heap.push(item);
      this.size++;
      this.bubbleUp(this.size - 1);
      return true;
    }
    
    // Heap is full, check if item should replace minimum
    const minScore = this.compareKey(this.heap[0]);
    if (score > minScore) {
      this.heap[0] = item;
      this.bubbleDown(0);
      return true;
    }
    
    return false;
  }
  
  toSortedArrayDesc(): T[] {
    // Extract all items and sort descending
    const result: T[] = [];
    const heapCopy = [...this.heap];
    const sizeCopy = this.size;
    
    while (this.size > 0) {
      result.push(this.extractMin()!);
    }
    
    // Restore heap
    this.heap = heapCopy;
    this.size = sizeCopy;
    
    // Sort descending by score
    return result.sort((a, b) => 
      this.compareKey(b) - this.compareKey(a)
    );
  }
  
  private extractMin(): T | undefined {
    if (this.size === 0) return undefined;
    
    const min = this.heap[0];
    this.heap[0] = this.heap[this.size - 1];
    this.size--;
    this.heap.length = this.size;
    
    if (this.size > 0) {
      this.bubbleDown(0);
    }
    
    return min;
  }
  
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      
      if (this.compare(index, parentIndex) < 0) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        break;
      }
    }
  }
  
  private bubbleDown(index: number): void {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      
      if (leftChild < this.size && this.compare(leftChild, minIndex) < 0) {
        minIndex = leftChild;
      }
      
      if (rightChild < this.size && this.compare(rightChild, minIndex) < 0) {
        minIndex = rightChild;
      }
      
      if (minIndex !== index) {
        this.swap(index, minIndex);
        index = minIndex;
      } else {
        break;
      }
    }
  }
  
  private compare(i: number, j: number): number {
    return this.compareKey(this.heap[i]) - this.compareKey(this.heap[j]);
  }
  
  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}