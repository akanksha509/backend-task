// marks input errors for 400 responses
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';  
  }
}

// marks DB failures for 503 responses
export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';  
  }
}

