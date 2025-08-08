// Event bus for inter-service communication patterns
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    
    return () => this.off(event, handler); // Return unsubscribe function
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event, data) {
    // Record event in history
    this.eventHistory.push({
      event,
      data,
      timestamp: new Date()
    });
    
    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    
    const handlers = this.listeners.get(event) || [];
    const promises = handlers.map(handler => {
      try {
        return Promise.resolve(handler(data));
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
        return Promise.resolve();
      }
    });
    
    await Promise.all(promises);
  }

  getHistory(event = null, limit = 100) {
    let history = this.eventHistory;
    
    if (event) {
      history = history.filter(h => h.event === event);
    }
    
    return history.slice(-limit);
  }

  clear() {
    this.listeners.clear();
    this.eventHistory = [];
  }
}