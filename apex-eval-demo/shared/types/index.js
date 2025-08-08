// Complex type definitions showing service interdependencies

export const UserRole = {
  ADMIN: 'admin',
  USER: 'user',
  MODERATOR: 'moderator',
  SERVICE: 'service'
};

export const OrderStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAYMENT_REQUIRED: 'payment_required',
  PAYMENT_PROCESSING: 'payment_processing',
  PAYMENT_FAILED: 'payment_failed',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

export const NotificationType = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app',
  WEBHOOK: 'webhook'
};

export const EventType = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_VERIFIED: 'user.verified',
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed'
};

export const ErrorCode = {
  // Auth errors
  INVALID_TOKEN: 'AUTH001',
  TOKEN_EXPIRED: 'AUTH002',
  INSUFFICIENT_PERMISSIONS: 'AUTH003',
  USER_NOT_FOUND: 'AUTH004',
  INVALID_CREDENTIALS: 'AUTH005',
  
  // Validation errors
  VALIDATION_FAILED: 'VAL001',
  MISSING_REQUIRED_FIELD: 'VAL002',
  INVALID_FORMAT: 'VAL003',
  
  // Database errors
  DB_CONNECTION_FAILED: 'DB001',
  DB_QUERY_FAILED: 'DB002',
  DB_TRANSACTION_FAILED: 'DB003',
  DUPLICATE_ENTRY: 'DB004',
  
  // Service errors
  SERVICE_UNAVAILABLE: 'SVC001',
  EXTERNAL_API_ERROR: 'SVC002',
  RATE_LIMIT_EXCEEDED: 'SVC003',
  CIRCUIT_BREAKER_OPEN: 'SVC004',
  
  // Business logic errors
  INSUFFICIENT_INVENTORY: 'BUS001',
  PAYMENT_REQUIRED: 'BUS002',
  ORDER_CANNOT_BE_CANCELLED: 'BUS003',
  USER_ALREADY_EXISTS: 'BUS004'
};

export class ServiceContext {
  constructor(userId, role, requestId, correlationId) {
    this.userId = userId;
    this.role = role;
    this.requestId = requestId;
    this.correlationId = correlationId;
    this.timestamp = new Date();
  }
  
  hasPermission(requiredRole) {
    const roleHierarchy = {
      [UserRole.ADMIN]: 3,
      [UserRole.MODERATOR]: 2,
      [UserRole.USER]: 1,
      [UserRole.SERVICE]: 4
    };
    return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
  }
}

export class ServiceResponse {
  constructor(success, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = {
      timestamp: new Date(),
      ...metadata
    };
  }
  
  static success(data, metadata = {}) {
    return new ServiceResponse(true, data, null, metadata);
  }
  
  static error(errorCode, message, details = {}) {
    return new ServiceResponse(false, null, {
      code: errorCode,
      message,
      details
    });
  }
}