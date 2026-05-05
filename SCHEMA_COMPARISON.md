# Schema vs Form Comparison

## Database Schema (students table)
Based on migrations and current database state:

### From 001_init_schema.sql:
```sql
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  roll_no TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  bay_form TEXT,
  caste TEXT,
  previous_school TEXT,
  admission_date DATE DEFAULT CURRENT_DATE,
  is_expelled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);
```

### Additional Fields Added via Migrations:
- **010_add_email_to_students.sql**: `email` TEXT (already in schema)
- **011_add_bulk_import_flag.sql**: `is_bulk_imported` BOOLEAN DEFAULT false
- **013_add_parent_names.sql**: `father_name` TEXT, `mother_name` TEXT
- **015_add_individual_monthly_fee.sql**: `individual_monthly_fee` DECIMAL(10, 2)
- **017_add_is_fee_free.sql**: `is_fee_free` BOOLEAN DEFAULT false

### Current Database Schema (Complete):
```
students table columns:
- id
- name
- roll_no
- phone
- address
- date_of_birth
- bay_form
- caste
- previous_school
- is_expelled
- is_active
- created_at
- email
- is_bulk_imported
- father_name
- mother_name
- individual_monthly_fee
- is_fee_free
- admission_date
```

---

## Frontend Admission Form (AdmissionFormNew.jsx)

### Form Data State:
```javascript
const [formData, setFormData] = useState({
  name: '',
  roll_no: '',
  email: '',
  date_of_birth: '',
  phone: '',
  caste: '',
  address: '',
  bay_form: '',
  previous_school: '',
  father_name: '',
  father_cnic: '',         // NOT in students table (used for guardians table)
  father_phone: '',        // NOT in students table (used for guardians table)
  father_occupation: '',   // NOT in students table (used for guardians table)
  mother_name: '',
  admission_date: new Date().toISOString().split('T')[0],
  class: '',               // NOT in students table (stored in student_class_history)
  section: ''              // NOT in students table (stored in student_class_history)
})
```

### Data Sent to Backend API:
```javascript
const studentData = {
  name: formData.name,
  roll_no: formData.roll_no || null,
  email: formData.email || null,
  date_of_birth: formData.date_of_birth || null,
  phone: formData.phone || null,
  caste: formData.caste || null,
  address: formData.address || null,
  bay_form: formData.bay_form || null,
  previous_school: formData.previous_school || null,
  father_name: formData.father_name || null,
  mother_name: formData.mother_name || null,
  enrollment: {
    class_id: parseInt(selectedClassId),
    section_id: parseInt(selectedSectionId),
    start_date: formData.admission_date
  }
}
```

---

## Backend Controller (students.controller.js)

### Student Creation INSERT Query:
```javascript
INSERT INTO students 
(name, roll_no, phone, address, email, date_of_birth, bay_form, caste, 
 previous_school, father_name, mother_name, admission_date) 
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
```

### Enrollment INSERT Query:
```javascript
INSERT INTO student_class_history 
(student_id, class_id, section_id, start_date, serial_number) 
VALUES ($1, $2, $3, $4, $5)
```

---

## Comparison Analysis

### ✅ Fields PRESENT in Form and Schema:
- name ✓
- roll_no ✓
- email ✓
- date_of_birth ✓
- phone ✓
- caste ✓
- address ✓
- bay_form ✓
- previous_school ✓
- father_name ✓
- mother_name ✓
- admission_date ✓

### ❌ Fields in Schema but NOT in Form:
1. **is_bulk_imported** - Missing (should default to `false`)
2. **individual_monthly_fee** - Missing (can be set via fee overrides)
3. **is_fee_free** - Handled separately via form toggle `isFreeStudent`
4. **is_expelled** - Default false (not needed in admission form)
5. **is_active** - Default true (not needed in admission form)
6. **created_at** - Auto-generated (not needed)

### ⚠️ Fields in Form but NOT Stored in Students Table:
1. **father_cnic** - Stored in `guardians` table
2. **father_phone** - Stored in `guardians` table
3. **father_occupation** - Stored in `guardians` table
4. **class** - Stored in `student_class_history` table
5. **section** - Stored in `student_class_history` table

---

## Issues Found

### 🔴 Critical Issues:
**NONE** - Schema and form are properly aligned!

### 🟡 Minor Observations:

1. **is_bulk_imported field**:
   - Schema: Has `is_bulk_imported` BOOLEAN DEFAULT false
   - Backend INSERT: Does NOT include this field
   - Result: Will default to `false` ✓ (CORRECT for manual admissions)

2. **individual_monthly_fee field**:
   - Schema: Has `individual_monthly_fee` DECIMAL(10, 2)
   - Form: Does NOT collect this directly
   - Backend INSERT: Does NOT include this field
   - Result: Will be `NULL`
   - Note: This is handled via fee_overrides table instead ✓

3. **is_fee_free field**:
   - Schema: Has `is_fee_free` BOOLEAN DEFAULT false
   - Form: Has `isFreeStudent` state
   - Backend INSERT: Does NOT include this field
   - Result: Will default to `false`
   - **Issue**: Free students are NOT being marked in the database!

---

## Recommendations

### 1. Add is_fee_free to Backend INSERT (IMPORTANT)
The form has the ability to mark students as fee-free, but this is not being saved to the database.

**Current Backend Code:**
```javascript
INSERT INTO students 
(name, roll_no, phone, address, email, date_of_birth, bay_form, caste, 
 previous_school, father_name, mother_name, admission_date) 
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
```

**Should Be:**
```javascript
INSERT INTO students 
(name, roll_no, phone, address, email, date_of_birth, bay_form, caste, 
 previous_school, father_name, mother_name, admission_date, is_fee_free) 
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
```

**Frontend should pass:**
```javascript
const studentData = {
  // ... existing fields ...
  is_fee_free: isFreeStudent  // ADD THIS
}
```

### 2. Add individual_monthly_fee Support (OPTIONAL)
If you want to support per-student monthly fees directly:

```javascript
const studentData = {
  // ... existing fields ...
  individual_monthly_fee: customMonthlyFee || null  // ADD THIS IF NEEDED
}
```

### 3. Ensure is_bulk_imported is Always False for Manual Admissions
This is already working correctly via database DEFAULT.

---

## Summary

The schema and form are now **fully aligned**!

### ✅ Fixed Issues:
1. **`is_fee_free` field now properly saved** 
   - Frontend: Passes `is_fee_free: isFreeStudent` in studentData ✓
   - Backend: Added to request validation and INSERT query ✓
   - Database: Will correctly mark fee-free students ✓

2. **`serial_number` field added to student_class_history**
   - Migration 019 successfully run ✓
   - Column exists in database ✓

### ✅ All Core Fields Working:
- ✓ name, roll_no, email, phone, address
- ✓ date_of_birth, bay_form, caste, previous_school  
- ✓ father_name, mother_name, admission_date
- ✓ is_fee_free (FIXED)
- ✓ Enrollment (class_id, section_id, start_date, serial_number)
- ✓ Guardian info (stored in guardians table)
- ✓ Fee overrides (stored in fee_overrides table)

### Summary of Changes Made:
1. **Frontend** ([AdmissionFormNew.jsx](../frontend/src/components/AdmissionFormNew.jsx)):
   - Added `is_fee_free: isFreeStudent` to studentData payload

2. **Backend** ([students.controller.js](../backend/src/controllers/students.controller.js)):
   - Added `is_fee_free` to request body destructuring
   - Added `is_fee_free: Joi.boolean().optional().default(false)` to validation
   - Added `is_fee_free` to INSERT query (13th parameter)

3. **Database**:
   - Ran migration 019 to add `serial_number` column
   - Verified all columns exist

### No Further Action Needed:
- ✅ Schema and form are synchronized
- ✅ All admission form fields properly mapped to database
- ✅ Free students will be correctly marked
- ✅ Enrollment tracking includes serial numbers
