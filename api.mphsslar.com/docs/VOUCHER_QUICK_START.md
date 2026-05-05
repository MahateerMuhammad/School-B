# Quick Start Guide - Voucher System Updates

## Solving Issue #4: Custom Admission Fee

### Scenario
You admitted a student with:
- **Actual Monthly Fee**: 5000 (class default)
- **Custom Admission Fee**: 4000 (instead of class default 5000)

### Problem
Voucher was being generated with admission fee = 5000 (class default)

### Solution

**Step 1: Create the student normally**
```bash
POST /api/students
{
  "name": "Ahmad Ali",
  "enrollment": {
    "class_id": 2,
    "section_id": 1
  }
}
```

**Step 2: Set fee override for admission fee**
```bash
POST /api/student-fee-overrides
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,
  "monthly_fee": null,
  "paper_fund": null,
  "reason": "Custom admission fee agreed with parent"
}
```

**Step 3: Generate voucher**
```bash
POST /api/vouchers/generate
{
  "student_id": 1,
  "month": "2026-02-01"
}
```

**Result**: Voucher will now have:
- Admission Fee: **4000** (overridden) ✓
- Monthly Fee: **5000** (class default)
- Paper Fund: (class default)

---

## Solving Issue #3: Print Vouchers Without Saving

### Scenario 1: Preview Before Creating

**Step 1: Preview what will be generated**
```bash
POST /api/vouchers/preview-bulk
{
  "class_id": 2,
  "section_id": 1,
  "month": "2026-02-01"
}
```

**Response**: JSON showing all vouchers that would be created

**Step 2: If preview looks good, create them**
```bash
POST /api/vouchers/generate-bulk
{
  "class_id": 2,
  "section_id": 1,
  "month": "2026-02-01"
}
```

---

### Scenario 2: Print Without Saving to Database

**Generate PDF for printing only** (no database records):
```bash
POST /api/vouchers/generate-bulk-pdf
{
  "class_id": 2,
  "month": "2026-02-01"
}
```

**Result**: PDF file returned for printing, nothing saved to database

**Use Cases**:
- Quick preview for management
- Print trial vouchers
- Generate vouchers for external use

---

### Scenario 3: Print vs Download Single Voucher

After creating a voucher, you have two options:

**Option A: Download as file**
```bash
GET /api/vouchers/123/pdf
```
→ Downloads `fee-voucher-123.pdf`

**Option B: Print directly**
```bash
GET /api/vouchers/123/print
```
→ Opens in browser for immediate printing

---

## Common Use Cases

### Use Case 1: Sibling Discount
```bash
# Student has sibling, gets 500 off monthly fee
POST /api/student-fee-overrides
{
  "student_id": 5,
  "class_id": 2,
  "monthly_fee": 2500,  # Instead of 3000
  "reason": "Sibling discount"
}
```

### Use Case 2: Scholarship Student
```bash
# Student has 50% scholarship on all fees
POST /api/student-fee-overrides
{
  "student_id": 8,
  "class_id": 3,
  "admission_fee": 2500,  # 50% of 5000
  "monthly_fee": 1500,    # 50% of 3000
  "paper_fund": 250,      # 50% of 500
  "reason": "Merit scholarship - 50%"
}
```

### Use Case 3: Free Admission
```bash
# Student gets free admission but pays regular monthly fee
POST /api/student-fee-overrides
{
  "student_id": 10,
  "class_id": 1,
  "admission_fee": 0,  # Free
  "reason": "Admission fee waived - special case"
}
```

### Use Case 4: Preview Before Month-End
```bash
# Preview all vouchers for next month before generating
POST /api/vouchers/preview-bulk
{
  "class_id": 2,
  "month": "2026-03-01"
}

# Review the JSON response, then generate
POST /api/vouchers/generate-bulk
{
  "class_id": 2,
  "month": "2026-03-01"
}
```

---

## Important Notes

### Fee Override Rules
1. **Per Class**: Overrides apply to specific class only
2. **Null vs Zero**: 
   - `null` = use class default
   - `0` = actually charge zero (free)
3. **Promotion**: Overrides don't transfer when student is promoted

### When to Set Overrides
- During student admission (custom fees agreed)
- When granting scholarships
- For sibling discounts
- For special agreements with parents

### Workflow Best Practice
1. Create student
2. Set fee override (if needed)
3. Preview voucher
4. Generate voucher
5. Print/Download

---

## API Endpoints Summary

### Fee Overrides
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/student-fee-overrides` | Set/update override |
| GET | `/api/student-fee-overrides/:student_id/class/:class_id` | Get specific override |
| GET | `/api/student-fee-overrides` | List all overrides |
| DELETE | `/api/student-fee-overrides/:student_id/class/:class_id` | Remove override |

### Voucher Generation
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/vouchers/generate` | Create single voucher |
| POST | `/api/vouchers/generate-bulk` | Create bulk vouchers |
| POST | `/api/vouchers/preview-bulk` | Preview without creating |
| POST | `/api/vouchers/generate-bulk-pdf` | PDF without saving |
| GET | `/api/vouchers/:id/pdf` | Download PDF |
| GET | `/api/vouchers/:id/print` | Print PDF inline |

---

## Testing

Run the test script:
```bash
./scripts/test-voucher-updates.sh
```

This will test:
- ✓ Fee override creation
- ✓ Fee override retrieval
- ✓ Voucher generation with override
- ✓ Bulk preview
- ✓ Bulk PDF generation
- ✓ Print endpoint
- ✓ Override removal

---

## Troubleshooting

### Problem: Voucher still shows wrong fee
**Solution**: Check if override is set correctly
```bash
GET /api/student-fee-overrides/STUDENT_ID/class/CLASS_ID
```

### Problem: Preview shows no students
**Solution**: Check if students are enrolled and active
```bash
GET /api/students/STUDENT_ID
# Verify: is_active = true, has current enrollment
```

### Problem: PDF generation fails
**Solution**: Check server logs for PDF service errors
- Ensure PDFKit is installed
- Check /tmp directory permissions

---

## Migration

Already run automatically. To verify:
```sql
SELECT * FROM student_fee_overrides;
```

To manually run:
```bash
node scripts/run-migration.js 008_add_student_fee_overrides.sql
```
