# Bitespeed Identity Reconciliation Service

A robust Node.js web service that intelligently links customer contact information across multiple purchases, helping e-commerce platforms provide personalized experiences while maintaining customer privacy.

## Live Service

**Base URL** – https://backend-task-ilz9.onrender.com

| Method | Path | Purpose |
|--------|-------------|----------------------------------|
| **GET** | /health | Liveness + DB connectivity |
| **POST** | /identify | Reconcile email / phone records |

---

### 🔬 Quick-test in Postman

1. **Create a new POST request**
   *URL*: https://backend-task-ilz9.onrender.com/identify

2. **Headers**
   | Key | Value |
   |---------------|---------------------|
   | Content-Type | application/json |

3. **Body → raw → JSON**
   ```json
   {
     "email": "lorraine@hillvalley.edu",
     "phoneNumber": "123456"
   }
   ```

4. Click **Send** → you should receive a 200 response like:
   ```json
   {
     "contact": {
       "primaryContactId": 1,
       "emails": ["lorraine@hillvalley.edu"],
       "phoneNumbers": ["123456"],
       "secondaryContactIds": []
     }
   }
   ```

5. **Health-check**
   Create a `GET` request to `https://backend-task-ilz9.onrender.com/health` and verify it returns JSON `{ "status": "ok", ... }`.

*(No extra auth, params, or headers are required.)*

**Note:** Hitting the base URL `/` or a `GET /identify` will show "Cannot GET" — only the endpoints listed above are exposed.

## Problem Statement

Meet Dr. Emmett Brown (Doc), who uses different email addresses and phone numbers for each purchase on FluxKart.com to avoid drawing attention to his time machine project. FluxKart needs to identify that all these different contact details belong to the same customer for personalized experiences.

## Solution Overview

This service provides an `/identify` endpoint that:

- Links contacts with shared email addresses or phone numbers
- Maintains a primary-secondary relationship hierarchy
- Handles complex scenarios like merging separate contact clusters
- Ensures data consistency under concurrent requests

## Features

| Feature | Description |
|---------|-------------|
| Identity Reconciliation | Links contacts by email or phone number |
| Primary/Secondary Management | Maintains relationships between contacts |
| Robust Error Handling | Validation, normalization, and database error handling |
| Comprehensive Testing | End-to-end tests covering all edge cases |
| Production-Ready | Rate limiting, security headers, and graceful shutdown |
| Concurrency-safe | Handles race conditions and concurrent requests |
| Data Normalization | Consistent email and phone number formatting |

## Project Structure

```
backend-task/
├── src/
│   ├── controllers/
│   │   └── identify.controller.ts      # Request handling & validation
│   ├── services/
│   │   └── identify.service.ts         # Core business logic
│   ├── utils/
│   │   ├── errors.ts                   # Custom error classes
│   │   ├── normalization.ts            # Email/phone normalization
│   │   └── validation.ts               # Input validation
│   └── index.ts                        # Express server setup
├── test/
│   └── identify.e2e.test.ts           # End-to-end tests
├── prisma/
│   ├── migrations/                     # Database migrations
│   └── schema.prisma                   # Database schema
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example                       # Environment variables template
└── README.md
```

## Database Schema

```prisma
model Contact {
  id             Int            @id @default(autoincrement())
  phoneNumber    String?
  email          String?
  linkedId       Int?           // Points to primary contact
  linkPrecedence LinkPrecedence @default(primary)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  deletedAt      DateTime?

  @@index([email])
  @@index([phoneNumber])
  @@index([linkedId])
  @@unique([email, phoneNumber])
}

enum LinkPrecedence {
  primary
  secondary
}
```

## Local Setup

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | v18 LTS or higher |
| PostgreSQL | Latest stable |
| npm | Latest |

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/akanksha509/backend-task.git
   cd backend-task
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Copy `.env.example` and fill in your credentials:
   ```bash
   cp .env.example .env
   # then edit .env to set YOUR_PASSWORD and other values
   ```

   Example `.env` configuration:
   ```env
   NODE_ENV=development
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/bitespeed?schema=public"
   PORT=3000
   RATE_LIMIT_MAX=100
   ```

4. **Initialize the database**
   ```bash
   createdb bitespeed
   npx prisma migrate dev  # runs migrations and generates client
   ```

5. **Run in development mode**
   ```bash
   npm run dev
   ```

6. **Verify**
   ```bash
   curl http://localhost:3000/health
   ```

## API Documentation

### POST /identify

Identifies and links customer contacts based on email and/or phone number.

**Request Body:**
```json
{
  "email": "string (optional)",
  "phoneNumber": "string|number (optional)"
}
```

**Response:**
```json
{
  "contact": {
    "primaryContactId": "number",
    "emails": ["string[]"],
    "phoneNumbers": ["string[]"],
    "secondaryContactIds": ["number[]"]
  }
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lorraine@hillvalley.edu",
    "phoneNumber": "123456"
  }'
```

**Example Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

### GET /health

Health check endpoint to verify service and database connectivity.

## Testing

The service includes comprehensive test suites covering various scenarios:

### Run Tests
```bash
# Run all tests
npm test
```

### Test Scenarios Covered

| Category | Test Cases |
|----------|------------|
| Basic Operations | Creating new primary contacts, Creating secondary contacts, Handling duplicate requests, Null/empty value handling |
| Complex Linking | Primary-to-secondary conversion, Merging multiple contact clusters, Maintaining chronological primary precedence |
| Edge Cases | Concurrent request handling, International phone formats, Race condition prevention, Transaction rollbacks |
| Advanced Scenarios | Multi-cluster merging, Email-only duplicate handling, Maintaining oldest contact as primary |

## Edge Cases Handled

### 1. Primary Contact Demotion
When two existing primary contacts share a common identifier:

```javascript
// Existing: george@hillvalley.edu + 919191 (Primary)
// Existing: biffsucks@hillvalley.edu + 717171 (Primary)
// Request: george@hillvalley.edu + 717171
// Result: Older contact remains primary, newer becomes secondary
```

### 2. Concurrent Request Handling
Uses database transactions with serializable isolation to prevent race conditions:

- Retry mechanism for unique constraint violations
- Proper conflict resolution for simultaneous contact creation

### 3. Data Normalization

| Input Type | Normalization Rule | Example |
|------------|-------------------|---------|
| Emails | Trimmed, lowercased | George@HILLVALLEY.EDU → george@hillvalley.edu |
| Phone Numbers | All non-digit characters removed | +44 20 7123 4567 → 442071234567 |
| International Numbers | Country code preserved | +1-555-123-4567 → 15551234567 |

### 4. Multi-Cluster Merging
Handles scenarios where multiple separate contact clusters need to be merged:

```javascript
// Cluster 1: email1@test.com ↔ 111111
// Cluster 2: email1@test.com ↔ 222222  
// Cluster 3: email2@test.com ↔ 111111
// Final request links all three clusters together
```

### 5. Partial Information Handling

| Scenario | Handling Strategy |
|----------|------------------|
| Email-only requests | Creates appropriate secondary contacts |
| Phone-only requests | Handled separately from email chains |
| Mixed scenarios | Smart handling of existing partial data |

### 6. Duplicate Prevention
Prevents creation of unnecessary secondary contacts when:

- Exact same email+phone combination already exists
- Only one identifier is new while other matches existing
- Request contains no new information

### 7. International Phone Format Normalization
```javascript
// Input: "+44 20 7123 4567", "(987) 654-3210", "+1-555-123-4567"
// Output: "442071234567", "9876543210", "15551234567"
// All non-digit characters removed for consistent matching
```

### 8. Duplicate Prevention Logic
```javascript
// Prevents unnecessary secondary creation when:
// 1. Exact email+phone combination already exists
// 2. Only one identifier is new while other matches existing
// 3. Request contains no new information
```

## Technical Implementation Details

### Solution Approach

| Component | Implementation Details |
|-----------|----------------------|
| Data Normalization | Emails: Trimmed, lowercased, regex validated<br>Phone Numbers: Stripped to digits only |
| Transaction Processing | Serializable Isolation: Prevents phantom reads<br>Automatic Retry: Handles constraint violations<br>Cluster Merging: Smart primary demotion logic |
| Concurrency Handling | Database transactions with proper isolation<br>Retry mechanism for conflict resolution<br>Proper error handling for race conditions |

### Architecture Decisions

#### Database Design
- **Indexes**: Optimized for email, phone, and linkedId lookups
- **Unique Constraints**: Prevents exact duplicates while allowing NULLs
- **Soft Deletes**: Uses deletedAt for data retention

#### Error Handling Strategy

| Error Code | Description |
|------------|-------------|
| 400 | Client validation errors |
| 503 | Database/service unavailable |
| 500 | Unexpected server errors |

#### Performance Optimizations
- **Batch Operations**: Multiple record updates in single queries
- **Efficient Clustering**: Minimal database roundtrips
- **Connection Pooling**: Managed by Prisma

#### Security Measures
- **Rate Limiting**: Prevents API abuse
- **Helmet Middleware**: Security headers
- **Input Validation**: Comprehensive request validation

### Testing Strategy

#### Test Coverage Includes:

| Test Type | Coverage Areas |
|-----------|----------------|
| Unit-level Logic | Normalization functions, Validation logic, Error handling |
| Integration Tests | Database operations, Transaction handling, Constraint violations |
| End-to-End Scenarios | Complete user workflows, Complex multi-step scenarios, Real-world edge cases |
| Performance Tests | Concurrent request handling, Large dataset operations, Memory usage optimization |
