# Voucher System Updates - Documentation

## Overview
This update addresses two critical issues in the fee voucher system:
1. **Issue #3**: Display vouchers with options to save as PDF or print without saving
2. **Issue #4**: Support for per-student fee overrides (when admission fee differs from class default)

---

## Issue #3: Voucher Display and PDF Options

### Problem
Previously, when creating vouchers (single or bulk), they were immediately saved to the database without preview. The only option was to download the PDF after creation.

### Solution
Added multiple new endpoints to provide flexibility:

#### 1. Preview Bulk Vouchers (Without Creating)
**Endpoint**: `POST /api/vouchers/preview-bulk`

**Purpose**: Preview what vouchers will be generated before committing to database

**Request Body**:
```json
{
  "class_id": 1,
  "section_id": 2,
  "month": "2026-02-01",
  "due_date": "2026-02-10",
  "fee_types": ["MONTHLY", "PAPER_FUND"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_students": 25,
      "month": "February 2026"
    },
    "vouchers": [
      {
        "student_id": 1,
        "student_name": "Ahmad Ali",
        "roll_no": "001",
        "items": [
          { "item_type": "MONTHLY", "amount": 5000 },
          { "item_type": "PAPER_FUND", "amount": 500 }
        ],
        "total_amount": 5500
      }
      // ... more students
    ]
  }
}
```

#### 2. Generate Bulk PDF Without Saving
**Endpoint**: `POST /api/vouchers/generate-bulk-pdf`

**Purpose**: Generate a single PDF containing all vouchers without saving them to the database

**Request Body**: Same as preview-bulk

**Response**: PDF file (inline for printing)

**Use Case**: Print vouchers for distribution without committing to database yet

#### 3. Print Single Voucher (Inline Display)
**Endpoint**: `GET /api/vouchers/:id/print`

**Purpose**: Display voucher PDF inline (for printing) instead of downloading

**Response**: PDF with `Content-Disposition: inline` header

**Difference from `/api/vouchers/:id/pdf`**:
- `/pdf` → Downloads the file
- `/print` → Opens in browser for printing

### Workflow Examples

#### Workflow 1: Preview → Confirm → Create
```
1. POST /api/vouchers/preview-bulk
   → Review the vouchers that will be created
   
2. POST /api/vouchers/generate-bulk
   → Create and save vouchers to database
   
3. GET /api/vouchers/:id/print
   → Print individual vouchers
```

#### Workflow 2: Generate PDF Only (No Database)
```
1. POST /api/vouchers/generate-bulk-pdf
   → Generate and print all vouchers
   → No database records created
   → Useful for temporary previews or one-time printing
```

---

## Issue #4: Per-Student Fee Overrides

### Problem
When a student is admitted with a custom fee (e.g., admission fee = 4000 instead of class default 5000), the voucher generation still used the class-level fee structure, resulting in incorrect amounts.

### Solution
Created a new `student_fee_overrides` table and system to allow per-student fee customization.

### Database Schema

```sql
CREATE TABLE student_fee_overrides (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id),
  class_id BIGINT REFERENCES classes(id),
  admission_fee NUMERIC(12,2),  -- NULL means use class default
  monthly_fee NUMERIC(12,2),    -- NULL means use class default
  paper_fund NUMERIC(12,2),     -- NULL means use class default
  reason TEXT,
  applied_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (student_id, class_id)
);
```

### API Endpoints

#### 1. Set/Update Fee Override
**Endpoint**: `POST /api/student-fee-overrides`

**Purpose**: Set custom fees for a student in a specific class

**Request Body**:
```json
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,
  "monthly_fee": null,
  "paper_fund": null,
  "reason": "Special agreement with parent"
}
```

**Notes**:
- `null` values mean "use class default"
- Only override the fees you need to customize
- Updates existing override if one exists

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "student_id": 1,
    "class_id": 2,
    "admission_fee": 4000,
    "monthly_fee": null,
    "paper_fund": null,
    "reason": "Special agreement with parent",
    "student_name": "Ahmad Ali",
    "class_name": "Class 1"
  },
  "message": "Fee override created successfully"
}
```

#### 2. Get Fee Override
**Endpoint**: `GET /api/student-fee-overrides/:student_id/class/:class_id`

**Example**: `GET /api/student-fee-overrides/1/class/2`

#### 3. List All Overrides
**Endpoint**: `GET /api/student-fee-overrides?student_id=1&class_id=2&page=1&limit=50`

**Query Parameters**:
- `student_id` (optional): Filter by student
- `class_id` (optional): Filter by class
- `page` (optional): Page number
- `limit` (optional): Items per page

#### 4. Remove Override
**Endpoint**: `DELETE /api/student-fee-overrides/:student_id/class/:class_id`

**Purpose**: Remove custom fees, student will use class defaults again

### How It Works

When generating a voucher:

1. **System checks for override**:
   ```sql
   SELECT admission_fee, monthly_fee, paper_fund 
   FROM student_fee_overrides
   WHERE student_id = X AND class_id = Y
   ```

2. **Effective fees are calculated**:
   ```javascript
   effectiveFees = {
     admission_fee: override.admission_fee ?? classDefault.admission_fee,
     monthly_fee: override.monthly_fee ?? classDefault.monthly_fee,
     paper_fund: override.paper_fund ?? classDefault.paper_fund
   }
   ```

3. **Voucher uses effective fees**

### Use Cases

#### Use Case 1: Custom Admission Fee
```
Student: Ahmad Ali
Class Default Admission Fee: 5000
Agreed Admission Fee: 4000

Solution:
POST /api/student-fee-overrides
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,
  "monthly_fee": null,
  "paper_fund": null,
  "reason": "Discount agreed during admission"
}

Result: First voucher will have admission fee of 4000, not 5000
```

#### Use Case 2: Sibling Discount (Monthly Fee)
```
Student: Fatima Ahmed (has sibling in school)
Class Default Monthly Fee: 3000
Discounted Monthly Fee: 2500

Solution:
POST /api/student-fee-overrides
{
  "student_id": 5,
  "class_id": 3,
  "admission_fee": null,
  "monthly_fee": 2500,
  "paper_fund": null,
  "reason": "Sibling discount - 500 off monthly fee"
}

Result: All monthly vouchers will have 2500 instead of 3000
```

#### Use Case 3: Scholarship Student
```
Student: Zainab Khan (scholarship)
Class Fees: Admission 5000, Monthly 3000, Paper Fund 500
Scholarship: 50% off all fees

Solution:
POST /api/student-fee-overrides
{
  "student_id": 8,
  "class_id": 1,
  "admission_fee": 2500,
  "monthly_fee": 1500,
  "paper_fund": 250,
  "reason": "Merit scholarship - 50% discount"
}
```

---

## Complete Workflow Example

### Scenario: New Student Admission with Custom Fee

**Step 1: Create Student**
```
POST /api/students
{
  "name": "Ahmad Ali",
  "roll_no": "001",
  "guardians": [...],
  "enrollment": {
    "class_id": 2,
    "section_id": 1
  }
}
```

**Step 2: Set Fee Override (if needed)**
```
POST /api/student-fee-overrides
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,
  "reason": "Agreed during admission - parent requested discount"
}
```

**Step 3: Preview Voucher**
```
POST /api/vouchers/preview-bulk
{
  "class_id": 2,
  "section_id": 1,
  "month": "2026-02-01"
}
```

**Step 4: Generate Voucher**
```
POST /api/vouchers/generate
{
  "student_id": 1,
  "month": "2026-02-01"
}

Result: Voucher with admission_fee = 4000 (overridden), not 5000 (class default)
```

**Step 5: Print or Download**
```
Option A: GET /api/vouchers/1/print (for printing)
Option B: GET /api/vouchers/1/pdf (for downloading)
```

---

## Important Notes

### Fee Override Precedence
1. Student-specific override (if exists)
2. Class default fee structure
3. Zero (if neither exists)

### Override Scope
- Overrides are **per class**
- When student is promoted to new class, override doesn't transfer
- Admin must set new override for new class if needed

### Null vs Zero
- `null` → Use class default
- `0` → Actually charge zero (free)

Example:
```json
{
  "admission_fee": null,  // Use class default
  "monthly_fee": 0,       // Free monthly fee
  "paper_fund": null      // Use class default
}
```

### Bulk Operations
- Both single and bulk voucher generation respect overrides
- Preview endpoint shows effective fees for each student
- PDF generation (with/without save) uses overrides

---

## Testing

### Test Case 1: Fee Override
```bash
# 1. Set override
curl -X POST http://localhost:3000/api/student-fee-overrides \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 1,
    "class_id": 2,
    "admission_fee": 4000
  }'

# 2. Generate voucher
curl -X POST http://localhost:3000/api/vouchers/generate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 1,
    "month": "2026-02-01"
  }'

# 3. Verify voucher has admission_fee = 4000
curl -X GET http://localhost:3000/api/vouchers/1 \
  -H "Authorization: Bearer TOKEN"
```

### Test Case 2: Bulk Preview
```bash
# Preview without creating
curl -X POST http://localhost:3000/api/vouchers/preview-bulk \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": 2,
    "month": "2026-02-01"
  }'
```

### Test Case 3: Print Without Save
```bash
# Generate PDF without database record
curl -X POST http://localhost:3000/api/vouchers/generate-bulk-pdf \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": 2,
    "month": "2026-02-01"
  }' \
  --output vouchers.pdf
```

---

## Migration

The migration `008_add_student_fee_overrides.sql` creates:
- `student_fee_overrides` table
- Indexes for performance
- Proper foreign key constraints
- Helpful column comments

Run with:
```bash
node scripts/run-migration.js 008_add_student_fee_overrides.sql
```

---

## Summary of Changes

### New Files
1. `migrations/008_add_student_fee_overrides.sql`
2. `src/controllers/student-fee-overrides.controller.js`
3. `src/routes/student-fee-overrides.routes.js`

### Modified Files
1. `src/controllers/vouchers.controller.js`
   - Added fee override checking in `generate()`
   - Added fee override checking in `generateBulk()`
   - Added `previewBulk()` method
   - Added `generateBulkPDF()` method
   - Added `printPDF()` method

2. `src/routes/vouchers.routes.js`
   - Added `/preview-bulk` route
   - Added `/generate-bulk-pdf` route
   - Added `/:id/print` route

3. `src/services/pdf.service.js`
   - Added `generateBulkFeeVouchers()` method

4. `src/app.js`
   - Registered new routes

### New API Endpoints
1. `POST /api/vouchers/preview-bulk` - Preview vouchers before creating
2. `POST /api/vouchers/generate-bulk-pdf` - Generate PDF without saving
3. `GET /api/vouchers/:id/print` - Print single voucher inline
4. `POST /api/student-fee-overrides` - Set/update fee override
5. `GET /api/student-fee-overrides/:student_id/class/:class_id` - Get override
6. `GET /api/student-fee-overrides` - List all overrides
7. `DELETE /api/student-fee-overrides/:student_id/class/:class_id` - Remove override
