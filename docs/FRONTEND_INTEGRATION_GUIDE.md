# Frontend Integration Guide - Voucher System Updates

## Overview

This guide explains all frontend changes needed to integrate the new voucher system features. Two major issues have been resolved:

1. **Issue #3**: Display vouchers with options to save as PDF or print without save
2. **Issue #4**: Support for per-student fee overrides (custom admission fees)

---

## Table of Contents

1. [New API Endpoints](#new-api-endpoints)
2. [Database Schema Changes](#database-schema-changes)
3. [Frontend UI Changes Needed](#frontend-ui-changes-needed)
4. [Implementation Examples](#implementation-examples)
5. [User Workflows](#user-workflows)
6. [Testing Checklist](#testing-checklist)

---

## New API Endpoints

### 1. Student Fee Overrides Management

#### 1.1 Set/Update Fee Override
**Endpoint**: `POST /api/student-fee-overrides`

**Purpose**: Set custom fees for a student in a specific class (solves Issue #4)

**Request**:
```json
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,      // null = use class default, 0 = free
  "monthly_fee": null,        // null = use class default
  "paper_fund": null,         // null = use class default
  "reason": "Custom fee agreed during admission"
}
```

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
    "reason": "Custom fee agreed during admission",
    "student_name": "Ahmad Ali",
    "class_name": "Class 1",
    "applied_by": 1,
    "created_at": "2026-02-18T10:30:00.000Z"
  },
  "message": "Fee override created successfully"
}
```

**When to Call**:
- During student admission (if custom fee agreed)
- When granting scholarships
- When setting sibling discounts
- When updating fee structure for specific student

---

#### 1.2 Get Fee Override for Student
**Endpoint**: `GET /api/student-fee-overrides/:student_id/class/:class_id`

**Example**: `GET /api/student-fee-overrides/1/class/2`

**Purpose**: Retrieve custom fees for a student in a specific class

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
    "reason": "Custom fee agreed during admission",
    "student_name": "Ahmad Ali",
    "class_name": "Class 1",
    "applied_by_email": "admin@school.com",
    "created_at": "2026-02-18T10:30:00.000Z"
  }
}
```

**When to Call**:
- When displaying student details
- Before generating voucher (to show what fees will be used)
- In student edit form

---

#### 1.3 List All Fee Overrides
**Endpoint**: `GET /api/student-fee-overrides?student_id=1&class_id=2&page=1&limit=50`

**Query Parameters**:
- `student_id` (optional): Filter by specific student
- `class_id` (optional): Filter by specific class
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "student_id": 1,
      "class_id": 2,
      "admission_fee": 4000,
      "monthly_fee": null,
      "paper_fund": null,
      "reason": "Custom fee agreed",
      "student_name": "Ahmad Ali",
      "roll_no": "001",
      "class_name": "Class 1",
      "applied_by_email": "admin@school.com",
      "created_at": "2026-02-18T10:30:00.000Z"
    }
    // ... more overrides
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 15,
    "totalPages": 1
  }
}
```

**When to Call**:
- In fee management dashboard
- When viewing all custom fees
- For reporting purposes

---

#### 1.4 Remove Fee Override
**Endpoint**: `DELETE /api/student-fee-overrides/:student_id/class/:class_id`

**Example**: `DELETE /api/student-fee-overrides/1/class/2`

**Purpose**: Remove custom fees, student will use class defaults

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
    "paper_fund": null
  },
  "message": "Fee override removed successfully"
}
```

**When to Call**:
- When reverting to class default fees
- When removing scholarship/discount

---

### 2. Voucher Preview and PDF Generation

#### 2.1 Preview Bulk Vouchers (NEW - Issue #3)
**Endpoint**: `POST /api/vouchers/preview-bulk`

**Purpose**: Preview what vouchers will be generated WITHOUT creating them in database

**Request**:
```json
{
  "class_id": 2,
  "section_id": 1,           // optional
  "month": "2026-02-01",
  "due_date": "2026-02-10",  // optional
  "fee_types": ["MONTHLY", "PAPER_FUND"]  // optional
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
          {
            "item_type": "ADMISSION",
            "amount": 4000    // Note: Uses override, not class default
          },
          {
            "item_type": "MONTHLY",
            "amount": 5000
          },
          {
            "item_type": "PAPER_FUND",
            "amount": 500
          },
          {
            "item_type": "DISCOUNT",
            "amount": -500
          }
        ],
        "total_amount": 9000
      },
      {
        "student_id": 2,
        "student_name": "Fatima Ahmed",
        "roll_no": "002",
        "items": [
          {
            "item_type": "MONTHLY",
            "amount": 5000
          },
          {
            "item_type": "PAPER_FUND",
            "amount": 500
          },
          {
            "item_type": "ARREARS",
            "amount": 2000
          }
        ],
        "total_amount": 7500
      }
      // ... more students
    ]
  },
  "message": "Bulk voucher preview generated successfully"
}
```

**When to Call**:
- Before generating bulk vouchers (show user what will be created)
- To verify fee overrides are applied correctly
- For management approval before month-end

---

#### 2.2 Generate Bulk PDF Without Saving (NEW - Issue #3)
**Endpoint**: `POST /api/vouchers/generate-bulk-pdf`

**Purpose**: Generate a single PDF containing all vouchers WITHOUT saving to database

**Request**: Same as preview-bulk
```json
{
  "class_id": 2,
  "section_id": 1,
  "month": "2026-02-01",
  "due_date": "2026-02-10"
}
```

**Response**: PDF file (Content-Type: application/pdf)
- Opens inline in browser (for printing)
- Contains all vouchers in one PDF
- No database records created

**When to Call**:
- For printing trial vouchers
- For management preview/approval
- For external distribution without committing to database
- When you want to print without saving

**Frontend Implementation**:
```javascript
// Open in new tab for printing
const response = await fetch('/api/vouchers/generate-bulk-pdf', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    class_id: 2,
    month: '2026-02-01'
  })
});

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
window.open(url, '_blank');  // Opens for printing
```

---

#### 2.3 Print Single Voucher Inline (NEW - Issue #3)
**Endpoint**: `GET /api/vouchers/:id/print`

**Example**: `GET /api/vouchers/123/print`

**Purpose**: Display voucher PDF inline for printing (vs downloading)

**Response**: PDF file (Content-Disposition: inline)

**Difference from existing `/api/vouchers/:id/pdf`**:
- `/print` → Opens in browser for immediate printing
- `/pdf` → Downloads as file

**Frontend Implementation**:
```javascript
// Option 1: Print directly
const printVoucher = (voucherId) => {
  const url = `/api/vouchers/${voucherId}/print`;
  window.open(url, '_blank');
};

// Option 2: Download
const downloadVoucher = (voucherId) => {
  const url = `/api/vouchers/${voucherId}/pdf`;
  window.location.href = url;
};
```

---

### 3. Existing Endpoints (No Changes)

These endpoints work exactly as before but NOW respect fee overrides:

#### 3.1 Generate Single Voucher
**Endpoint**: `POST /api/vouchers/generate`

**Now Includes**: Fee override checking
- Checks for student fee override first
- Falls back to class default if no override
- Transparent to frontend (no changes needed)

#### 3.2 Generate Bulk Vouchers
**Endpoint**: `POST /api/vouchers/generate-bulk`

**Now Includes**: Fee override checking for each student
- Each student's fees calculated individually
- Overrides applied automatically
- Transparent to frontend (no changes needed)

---

## Database Schema Changes

### New Table: `student_fee_overrides`

```sql
CREATE TABLE student_fee_overrides (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  class_id BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
  admission_fee NUMERIC(12,2),    -- NULL = use class default
  monthly_fee NUMERIC(12,2),      -- NULL = use class default
  paper_fund NUMERIC(12,2),       -- NULL = use class default
  reason TEXT,
  applied_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (student_id, class_id)   -- One override per student per class
);
```

**Key Points**:
- One override record per student per class
- `null` values mean "use class default"
- `0` means "actually charge zero (free)"
- When student is promoted, override doesn't transfer automatically

---

## Frontend UI Changes Needed

### 1. Student Admission Form

#### Current Flow:
```
1. Enter student details
2. Select class & section
3. Submit
```

#### New Flow (Add Fee Override Option):
```
1. Enter student details
2. Select class & section
3. [NEW] Fee Structure Section:
   ┌─────────────────────────────────────────┐
   │ Fee Structure                           │
   │                                         │
   │ Class Default Fees:                     │
   │ • Admission Fee: Rs. 5000              │
   │ • Monthly Fee: Rs. 3000                │
   │ • Paper Fund: Rs. 500                  │
   │                                         │
   │ ☐ Set Custom Fees for this Student     │
   │                                         │
   │ [If checked, show:]                     │
   │ Admission Fee: [4000] (or leave empty) │
   │ Monthly Fee: [____] (optional)         │
   │ Paper Fund: [____] (optional)          │
   │ Reason: [Custom fee agreed...]         │
   └─────────────────────────────────────────┘
4. Submit
```

**Implementation**:
```javascript
// Step 1: Create student
const createStudent = async (studentData) => {
  const response = await fetch('/api/students', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(studentData)
  });
  const result = await response.json();
  return result.data; // Returns student with ID
};

// Step 2: Set fee override (if custom fees)
const setFeeOverride = async (studentId, classId, customFees) => {
  if (!customFees.hasCustomFees) return;
  
  await fetch('/api/student-fee-overrides', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      student_id: studentId,
      class_id: classId,
      admission_fee: customFees.admission_fee,
      monthly_fee: customFees.monthly_fee,
      paper_fund: customFees.paper_fund,
      reason: customFees.reason
    })
  });
};

// Complete flow
const handleStudentAdmission = async (formData) => {
  try {
    // Create student
    const student = await createStudent({
      name: formData.name,
      roll_no: formData.roll_no,
      enrollment: {
        class_id: formData.class_id,
        section_id: formData.section_id
      }
      // ... other fields
    });
    
    // Set custom fees if applicable
    if (formData.customFees) {
      await setFeeOverride(
        student.id, 
        formData.class_id, 
        formData.customFees
      );
    }
    
    showSuccess('Student admitted successfully');
  } catch (error) {
    showError(error.message);
  }
};
```

---

### 2. Student Details/Edit Page

#### Add Fee Override Section:

```
┌─────────────────────────────────────────┐
│ Student: Ahmad Ali                      │
│ Class: Class 1, Section A              │
│                                         │
│ Fee Structure                           │
│ ┌─────────────────────────────────────┐ │
│ │ Using Custom Fees                   │ │
│ │ • Admission Fee: Rs. 4000           │ │
│ │   (Class default: Rs. 5000)         │ │
│ │ • Monthly Fee: Class Default        │ │
│ │ • Paper Fund: Class Default         │ │
│ │                                     │ │
│ │ Reason: Custom fee agreed during    │ │
│ │ admission                           │ │
│ │                                     │ │
│ │ [Edit Fees] [Remove Override]      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Implementation**:
```javascript
const StudentFeesSection = ({ studentId, classId }) => {
  const [feeOverride, setFeeOverride] = useState(null);
  const [classDefaults, setClassDefaults] = useState(null);
  
  useEffect(() => {
    // Fetch fee override
    fetch(`/api/student-fee-overrides/${studentId}/class/${classId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setFeeOverride(data.data);
        }
      })
      .catch(() => setFeeOverride(null));
    
    // Fetch class defaults
    fetch(`/api/classes/${classId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setClassDefaults(data.data.fee_structure));
  }, [studentId, classId]);
  
  return (
    <div className="fee-structure-section">
      <h3>Fee Structure</h3>
      
      {feeOverride ? (
        <div className="custom-fees">
          <Badge>Using Custom Fees</Badge>
          <FeeItem 
            label="Admission Fee"
            custom={feeOverride.admission_fee}
            default={classDefaults?.admission_fee}
          />
          <FeeItem 
            label="Monthly Fee"
            custom={feeOverride.monthly_fee}
            default={classDefaults?.monthly_fee}
          />
          <FeeItem 
            label="Paper Fund"
            custom={feeOverride.paper_fund}
            default={classDefaults?.paper_fund}
          />
          <p>Reason: {feeOverride.reason}</p>
          
          <Button onClick={handleEditFees}>Edit Fees</Button>
          <Button onClick={handleRemoveOverride} variant="danger">
            Remove Override
          </Button>
        </div>
      ) : (
        <div className="default-fees">
          <p>Using class default fees</p>
          <Button onClick={handleSetCustomFees}>
            Set Custom Fees
          </Button>
        </div>
      )}
    </div>
  );
};

// Helper component
const FeeItem = ({ label, custom, default: defaultValue }) => (
  <div className="fee-item">
    <span>{label}:</span>
    {custom !== null ? (
      <>
        <strong>Rs. {custom}</strong>
        <small>(Class default: Rs. {defaultValue})</small>
      </>
    ) : (
      <span>Class Default (Rs. {defaultValue})</span>
    )}
  </div>
);
```

---

### 3. Bulk Voucher Generation Page

#### Current Flow:
```
1. Select class/section
2. Select month
3. Click "Generate Vouchers"
4. Vouchers created in database
5. Can download PDFs
```

#### New Flow (Add Preview Option):
```
1. Select class/section
2. Select month
3. [NEW] Click "Preview Vouchers"
   → Shows list of all vouchers that will be created
   → Shows effective fees for each student
   → Highlights students with custom fees
   
4. Options:
   a) "Generate & Save" → Creates in database
   b) "Print Without Saving" → PDF only
   c) "Cancel" → Go back
```

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────┐
│ Generate Bulk Vouchers                                  │
│                                                         │
│ Class: [Class 1 ▼]  Section: [Section A ▼]           │
│ Month: [February 2026]  Due Date: [2026-02-10]       │
│                                                         │
│ [Preview Vouchers]                                     │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Preview: 25 vouchers will be created               │ │
│ │                                                     │ │
│ │ Student              Fees                Total     │ │
│ │ ─────────────────────────────────────────────────  │ │
│ │ Ahmad Ali (001)      Admission: 4000*   Rs. 9000  │ │
│ │                      Monthly: 5000                 │ │
│ │                      Paper Fund: 500               │ │
│ │                      Discount: -500                │ │
│ │                                                     │ │
│ │ Fatima Ahmed (002)   Monthly: 5000      Rs. 7500  │ │
│ │                      Paper Fund: 500               │ │
│ │                      Arrears: 2000                 │ │
│ │                                                     │ │
│ │ ... (23 more students)                             │ │
│ │                                                     │ │
│ │ * Custom fee applied                               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Generate & Save to Database]                          │
│ [Print Without Saving]                                 │
│ [Cancel]                                               │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
const BulkVoucherGeneration = () => {
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [month, setMonth] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Preview vouchers
  const handlePreview = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/vouchers/preview-bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: classId,
          section_id: sectionId,
          month: month
        })
      });
      
      const result = await response.json();
      setPreview(result.data);
    } catch (error) {
      showError('Failed to preview vouchers');
    } finally {
      setLoading(false);
    }
  };
  
  // Generate and save to database
  const handleGenerateAndSave = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/vouchers/generate-bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: classId,
          section_id: sectionId,
          month: month
        })
      });
      
      const result = await response.json();
      showSuccess(`${result.data.summary.generated} vouchers created`);
      setPreview(null);
    } catch (error) {
      showError('Failed to generate vouchers');
    } finally {
      setLoading(false);
    }
  };
  
  // Print without saving
  const handlePrintWithoutSaving = async () => {
    try {
      const response = await fetch('/api/vouchers/generate-bulk-pdf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: classId,
          section_id: sectionId,
          month: month
        })
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Open in new tab for printing
      const printWindow = window.open(url, '_blank');
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    } catch (error) {
      showError('Failed to generate PDF');
    }
  };
  
  return (
    <div className="bulk-voucher-generation">
      <h2>Generate Bulk Vouchers</h2>
      
      <FormGroup>
        <Label>Class</Label>
        <Select value={classId} onChange={e => setClassId(e.target.value)}>
          {/* Class options */}
        </Select>
      </FormGroup>
      
      <FormGroup>
        <Label>Section</Label>
        <Select value={sectionId} onChange={e => setSectionId(e.target.value)}>
          {/* Section options */}
        </Select>
      </FormGroup>
      
      <FormGroup>
        <Label>Month</Label>
        <Input 
          type="month" 
          value={month} 
          onChange={e => setMonth(e.target.value)} 
        />
      </FormGroup>
      
      <Button onClick={handlePreview} disabled={loading}>
        Preview Vouchers
      </Button>
      
      {preview && (
        <PreviewSection 
          preview={preview}
          onGenerateAndSave={handleGenerateAndSave}
          onPrintWithoutSaving={handlePrintWithoutSaving}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  );
};

const PreviewSection = ({ preview, onGenerateAndSave, onPrintWithoutSaving, onCancel }) => (
  <div className="preview-section">
    <h3>Preview: {preview.summary.total_students} vouchers will be created</h3>
    
    <Table>
      <thead>
        <tr>
          <th>Student</th>
          <th>Fee Items</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {preview.vouchers.map(voucher => (
          <tr key={voucher.student_id}>
            <td>
              {voucher.student_name} ({voucher.roll_no})
            </td>
            <td>
              {voucher.items.map(item => (
                <div key={item.item_type}>
                  {item.item_type}: Rs. {item.amount}
                  {/* Highlight custom fees */}
                  {item.is_override && <Badge>Custom</Badge>}
                </div>
              ))}
            </td>
            <td>Rs. {voucher.total_amount}</td>
          </tr>
        ))}
      </tbody>
    </Table>
    
    <ButtonGroup>
      <Button onClick={onGenerateAndSave} variant="primary">
        Generate & Save to Database
      </Button>
      <Button onClick={onPrintWithoutSaving} variant="secondary">
        Print Without Saving
      </Button>
      <Button onClick={onCancel} variant="outline">
        Cancel
      </Button>
    </ButtonGroup>
  </div>
);
```

---

### 4. Voucher Details Page

#### Add Print Button:

```
┌─────────────────────────────────────────┐
│ Fee Voucher #123                        │
│                                         │
│ Student: Ahmad Ali                      │
│ Month: February 2026                    │
│ Total: Rs. 9000                        │
│                                         │
│ [Download PDF] [Print] [Delete]        │
│      ↓            ↓                     │
│   /pdf       /print (NEW)              │
└─────────────────────────────────────────┘
```

**Implementation**:
```javascript
const VoucherDetails = ({ voucherId }) => {
  const handleDownload = () => {
    window.location.href = `/api/vouchers/${voucherId}/pdf`;
  };
  
  const handlePrint = () => {
    window.open(`/api/vouchers/${voucherId}/print`, '_blank');
  };
  
  return (
    <div className="voucher-details">
      {/* Voucher details */}
      
      <ButtonGroup>
        <Button onClick={handleDownload}>
          <DownloadIcon /> Download PDF
        </Button>
        <Button onClick={handlePrint}>
          <PrintIcon /> Print
        </Button>
      </ButtonGroup>
    </div>
  );
};
```

---

### 5. Fee Management Dashboard

#### Add Fee Overrides Section:

```
┌─────────────────────────────────────────────────────────┐
│ Fee Management Dashboard                                │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Students with Custom Fees                          │ │
│ │                                                     │ │
│ │ Student      Class    Custom Fees        Reason    │ │
│ │ ──────────────────────────────────────────────────  │ │
│ │ Ahmad Ali    Class 1  Admission: 4000   Agreed     │ │
│ │ Fatima       Class 2  Monthly: 2500     Sibling    │ │
│ │ Zainab       Class 3  All: 50% off      Scholar    │ │
│ │                                                     │ │
│ │ [View All] [Add Custom Fee]                        │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
const FeeOverridesList = () => {
  const [overrides, setOverrides] = useState([]);
  const [pagination, setPagination] = useState({});
  
  useEffect(() => {
    fetch('/api/student-fee-overrides?page=1&limit=50', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setOverrides(data.data);
        setPagination(data.pagination);
      });
  }, []);
  
  return (
    <div className="fee-overrides-list">
      <h3>Students with Custom Fees ({pagination.total})</h3>
      
      <Table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Class</th>
            <th>Custom Fees</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {overrides.map(override => (
            <tr key={override.id}>
              <td>{override.student_name} ({override.roll_no})</td>
              <td>{override.class_name}</td>
              <td>
                {override.admission_fee !== null && 
                  <div>Admission: Rs. {override.admission_fee}</div>
                }
                {override.monthly_fee !== null && 
                  <div>Monthly: Rs. {override.monthly_fee}</div>
                }
                {override.paper_fund !== null && 
                  <div>Paper Fund: Rs. {override.paper_fund}</div>
                }
              </td>
              <td>{override.reason}</td>
              <td>
                <Button onClick={() => handleEdit(override)}>Edit</Button>
                <Button onClick={() => handleRemove(override)}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
```

---

## Implementation Examples

### Complete Example: Student Admission with Custom Fee

```javascript
import React, { useState, useEffect } from 'react';

const StudentAdmissionForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    roll_no: '',
    class_id: '',
    section_id: '',
    guardians: []
  });
  
  const [customFees, setCustomFees] = useState({
    enabled: false,
    admission_fee: null,
    monthly_fee: null,
    paper_fund: null,
    reason: ''
  });
  
  const [classFeeStructure, setClassFeeStructure] = useState(null);
  
  // Fetch class fee structure when class is selected
  useEffect(() => {
    if (formData.class_id) {
      fetch(`/api/classes/${formData.class_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setClassFeeStructure(data.data.fee_structure));
    }
  }, [formData.class_id]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Step 1: Create student
      const studentResponse = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          roll_no: formData.roll_no,
          guardians: formData.guardians,
          enrollment: {
            class_id: formData.class_id,
            section_id: formData.section_id
          }
        })
      });
      
      const studentResult = await studentResponse.json();
      
      if (!studentResult.success) {
        throw new Error(studentResult.message);
      }
      
      const studentId = studentResult.data.id;
      
      // Step 2: Set fee override if enabled
      if (customFees.enabled) {
        const overrideResponse = await fetch('/api/student-fee-overrides', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            student_id: studentId,
            class_id: formData.class_id,
            admission_fee: customFees.admission_fee,
            monthly_fee: customFees.monthly_fee,
            paper_fund: customFees.paper_fund,
            reason: customFees.reason
          })
        });
        
        const overrideResult = await overrideResponse.json();
        
        if (!overrideResult.success) {
          console.error('Fee override failed:', overrideResult.message);
          // Note: Student is created, just override failed
          // Show warning but don't fail completely
        }
      }
      
      // Success
      showSuccess('Student admitted successfully!');
      resetForm();
      
    } catch (error) {
      showError(error.message);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Student basic info fields */}
      <Input
        label="Name"
        value={formData.name}
        onChange={e => setFormData({...formData, name: e.target.value})}
        required
      />
      
      <Input
        label="Roll No"
        value={formData.roll_no}
        onChange={e => setFormData({...formData, roll_no: e.target.value})}
      />
      
      <Select
        label="Class"
        value={formData.class_id}
        onChange={e => setFormData({...formData, class_id: e.target.value})}
        required
      >
        {/* Class options */}
      </Select>
      
      <Select
        label="Section"
        value={formData.section_id}
        onChange={e => setFormData({...formData, section_id: e.target.value})}
        required
      >
        {/* Section options */}
      </Select>
      
      {/* Fee Structure Section */}
      {classFeeStructure && (
        <div className="fee-structure-section">
          <h3>Fee Structure</h3>
          
          <div className="class-defaults">
            <p>Class Default Fees:</p>
            <ul>
              <li>Admission Fee: Rs. {classFeeStructure.admission_fee}</li>
              <li>Monthly Fee: Rs. {classFeeStructure.monthly_fee}</li>
              <li>Paper Fund: Rs. {classFeeStructure.paper_fund}</li>
            </ul>
          </div>
          
          <Checkbox
            label="Set Custom Fees for this Student"
            checked={customFees.enabled}
            onChange={e => setCustomFees({...customFees, enabled: e.target.checked})}
          />
          
          {customFees.enabled && (
            <div className="custom-fees-inputs">
              <Input
                label="Custom Admission Fee (leave empty for default)"
                type="number"
                value={customFees.admission_fee || ''}
                onChange={e => setCustomFees({
                  ...customFees, 
                  admission_fee: e.target.value ? parseFloat(e.target.value) : null
                })}
                placeholder={`Default: ${classFeeStructure.admission_fee}`}
              />
              
              <Input
                label="Custom Monthly Fee (leave empty for default)"
                type="number"
                value={customFees.monthly_fee || ''}
                onChange={e => setCustomFees({
                  ...customFees, 
                  monthly_fee: e.target.value ? parseFloat(e.target.value) : null
                })}
                placeholder={`Default: ${classFeeStructure.monthly_fee}`}
              />
              
              <Input
                label="Custom Paper Fund (leave empty for default)"
                type="number"
                value={customFees.paper_fund || ''}
                onChange={e => setCustomFees({
                  ...customFees, 
                  paper_fund: e.target.value ? parseFloat(e.target.value) : null
                })}
                placeholder={`Default: ${classFeeStructure.paper_fund}`}
              />
              
              <TextArea
                label="Reason for Custom Fees"
                value={customFees.reason}
                onChange={e => setCustomFees({...customFees, reason: e.target.value})}
                required
                placeholder="e.g., Custom fee agreed during admission"
              />
            </div>
          )}
        </div>
      )}
      
      <Button type="submit">Admit Student</Button>
    </form>
  );
};
```

---

## User Workflows

### Workflow 1: Admit Student with Custom Fee

1. **User Action**: Fill admission form
2. **Frontend**: Show class default fees
3. **User Action**: Check "Set Custom Fees"
4. **Frontend**: Show custom fee inputs
5. **User Action**: Enter admission_fee = 4000, reason = "Agreed during admission"
6. **Frontend**: Submit form
   - Call `POST /api/students` → Get student_id
   - Call `POST /api/student-fee-overrides` with custom fees
7. **Result**: Student created with custom admission fee

---

### Workflow 2: Preview and Generate Vouchers

1. **User Action**: Go to "Generate Bulk Vouchers"
2. **Frontend**: Show class/section/month selection
3. **User Action**: Select Class 1, Section A, February 2026
4. **User Action**: Click "Preview Vouchers"
5. **Frontend**: Call `POST /api/vouchers/preview-bulk`
6. **Frontend**: Display preview table showing:
   - All students
   - Fee items for each
   - Highlight students with custom fees (*)
   - Total amounts
7. **User Action**: Review and choose:
   - Option A: "Generate & Save" → Calls `POST /api/vouchers/generate-bulk`
   - Option B: "Print Without Saving" → Calls `POST /api/vouchers/generate-bulk-pdf`
8. **Result**: Vouchers created or PDF generated

---

### Workflow 3: Print Single Voucher

1. **User Action**: View voucher details
2. **Frontend**: Show voucher with two buttons:
   - "Download PDF" → `GET /api/vouchers/:id/pdf`
   - "Print" → `GET /api/vouchers/:id/print`
3. **User Action**: Click "Print"
4. **Frontend**: Open PDF in new tab (inline)
5. **Browser**: Show print dialog
6. **User**: Print directly

---

## Testing Checklist

### Fee Override Tests

- [ ] Create student with custom admission fee
- [ ] Verify override is saved in database
- [ ] Generate voucher and verify custom fee is used
- [ ] Update fee override
- [ ] Remove fee override
- [ ] Verify voucher uses class default after override removed
- [ ] Test null vs 0 (null = default, 0 = free)
- [ ] Test partial override (only admission_fee custom)

### Preview Tests

- [ ] Preview bulk vouchers for class
- [ ] Verify correct student count
- [ ] Verify fees are calculated correctly
- [ ] Verify students with custom fees are shown correctly
- [ ] Verify arrears are included
- [ ] Verify discounts are applied
- [ ] Preview with section filter
- [ ] Preview with different months

### PDF Generation Tests

- [ ] Generate bulk PDF without saving
- [ ] Verify PDF contains all students
- [ ] Verify no database records created
- [ ] Print single voucher inline
- [ ] Download single voucher
- [ ] Verify print opens in new tab
- [ ] Verify download saves file

### Integration Tests

- [ ] Complete admission flow with custom fee
- [ ] Generate voucher and verify custom fee applied
- [ ] Preview before bulk generation
- [ ] Generate bulk vouchers with mix of custom/default fees
- [ ] Print without saving, then save later
- [ ] Update student fee override and regenerate voucher

---

## Common Scenarios

### Scenario 1: Scholarship Student (50% Discount)

```javascript
// Set 50% discount on all fees
POST /api/student-fee-overrides
{
  "student_id": 5,
  "class_id": 2,
  "admission_fee": 2500,  // 50% of 5000
  "monthly_fee": 1500,    // 50% of 3000
  "paper_fund": 250,      // 50% of 500
  "reason": "Merit scholarship - 50% discount on all fees"
}
```

### Scenario 2: Sibling Discount (Monthly Fee Only)

```javascript
// Set discount on monthly fee only
POST /api/student-fee-overrides
{
  "student_id": 8,
  "class_id": 3,
  "admission_fee": null,  // Use class default
  "monthly_fee": 2500,    // Discounted from 3000
  "paper_fund": null,     // Use class default
  "reason": "Sibling discount - Rs. 500 off monthly fee"
}
```

### Scenario 3: Free Admission

```javascript
// Waive admission fee
POST /api/student-fee-overrides
{
  "student_id": 10,
  "class_id": 1,
  "admission_fee": 0,     // Free!
  "monthly_fee": null,    // Pay regular monthly fee
  "paper_fund": null,     // Pay regular paper fund
  "reason": "Admission fee waived - special case approval"
}
```

### Scenario 4: Preview Before Month-End

```javascript
// Preview all vouchers for next month
const preview = await fetch('/api/vouchers/preview-bulk', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    class_id: 2,
    month: '2026-03-01'
  })
});

// Review data
const data = await preview.json();
console.log(`Will create ${data.data.summary.total_students} vouchers`);

// If approved, generate
await fetch('/api/vouchers/generate-bulk', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    class_id: 2,
    month: '2026-03-01'
  })
});
```

---

## Error Handling

### Fee Override Errors

```javascript
// Example error handling
const setFeeOverride = async (data) => {
  try {
    const response = await fetch('/api/student-fee-overrides', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (!result.success) {
      // Handle specific errors
      if (response.status === 404) {
        showError('Student or class not found');
      } else if (response.status === 400) {
        showError(`Validation error: ${result.message}`);
      } else {
        showError('Failed to set fee override');
      }
      return;
    }
    
    showSuccess('Fee override set successfully');
  } catch (error) {
    showError('Network error. Please try again.');
  }
};
```

---

## Summary of Frontend Changes

### Required UI Changes

1. ✅ **Student Admission Form**
   - Add fee structure display
   - Add "Set Custom Fees" checkbox
   - Add custom fee input fields
   - Handle fee override creation

2. ✅ **Student Details Page**
   - Display fee override info
   - Add edit/remove override buttons
   - Show class defaults vs custom fees

3. ✅ **Bulk Voucher Generation**
   - Add "Preview" button
   - Display preview table
   - Add "Print Without Saving" option
   - Keep existing "Generate & Save" option

4. ✅ **Voucher Details Page**
   - Add "Print" button (new)
   - Keep "Download PDF" button (existing)

5. ✅ **Fee Management Dashboard**
   - Add fee overrides list
   - Add filters for students with custom fees
   - Add bulk management options

### New API Endpoints Used

| Endpoint | Purpose | When to Call |
|----------|---------|--------------|
| `POST /api/student-fee-overrides` | Set custom fees | During admission, scholarship grant |
| `GET /api/student-fee-overrides/:student_id/class/:class_id` | Get custom fees | Student details page |
| `GET /api/student-fee-overrides` | List all overrides | Fee management dashboard |
| `DELETE /api/student-fee-overrides/:student_id/class/:class_id` | Remove override | When reverting to defaults |
| `POST /api/vouchers/preview-bulk` | Preview vouchers | Before bulk generation |
| `POST /api/vouchers/generate-bulk-pdf` | PDF without save | Print without committing |
| `GET /api/vouchers/:id/print` | Print single voucher | Voucher details page |

### Existing Endpoints (No Changes Needed)

- `POST /api/vouchers/generate` - Now respects overrides automatically
- `POST /api/vouchers/generate-bulk` - Now respects overrides automatically
- All other voucher endpoints work as before

---

## Next Steps for Frontend Team

1. **Database Migration** (Already Done)
   - ✅ `student_fee_overrides` table created

2. **Update Student Admission Form**
   - Add fee structure display
   - Add custom fee option
   - Integrate `POST /api/student-fee-overrides`

3. **Update Student Details Page**
   - Show fee override information
   - Add edit/remove functionality

4. **Update Bulk Voucher Generation**
   - Add preview functionality
   - Add print without save option

5. **Add Print Button to Voucher Details**
   - Use new `/print` endpoint

6. **Create Fee Management Dashboard**
   - List all overrides
   - Provide management tools

7. **Testing**
   - Test all scenarios
   - Verify fee calculations
   - Test PDF generation

---

## Support Resources

- **Backend API Documentation**: `/docs/VOUCHER_SYSTEM_UPDATES.md`
- **Quick Start Guide**: `/docs/VOUCHER_QUICK_START.md`
- **Test Script**: Run `./scripts/test-voucher-updates.sh` to verify backend
- **Migration File**: `migrations/008_add_student_fee_overrides.sql`

---

## Questions?

Common questions and answers:

**Q: What if a student is promoted to a new class?**
A: Fee overrides are per-class. When promoted, they'll use the new class's default fees unless you set a new override for the new class.

**Q: Can I override only one fee type?**
A: Yes! Set only the fees you want to override, leave others as `null` to use class defaults.

**Q: What's the difference between `null` and `0`?**
A: `null` = use class default, `0` = actually charge zero (free).

**Q: Can I preview a single voucher?**
A: Use the bulk preview endpoint with filters, or just look at the class fee structure and any overrides for that student.

**Q: Will old vouchers be affected?**
A: No, only new vouchers generated after setting the override will use custom fees.
