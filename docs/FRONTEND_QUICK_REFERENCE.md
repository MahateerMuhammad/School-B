# Frontend Quick Reference - Voucher System Updates

## 🚀 What Changed?

Two new features added to solve voucher issues:

1. **Student Fee Overrides** - Custom fees per student (e.g., admission fee 4000 instead of 5000)
2. **Voucher Preview & Print Options** - Preview before creating, print without saving

---

## 📋 New API Endpoints Summary

### Fee Overrides

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| `POST` | `/api/student-fee-overrides` | Set custom fees | `{student_id, class_id, admission_fee, monthly_fee, paper_fund, reason}` |
| `GET` | `/api/student-fee-overrides/:student_id/class/:class_id` | Get student's override | None |
| `GET` | `/api/student-fee-overrides` | List all overrides | Query: `?student_id=X&class_id=Y&page=1&limit=50` |
| `DELETE` | `/api/student-fee-overrides/:student_id/class/:class_id` | Remove override | None |

### Voucher Preview & PDF

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| `POST` | `/api/vouchers/preview-bulk` | Preview without creating | `{class_id, section_id?, month, due_date?}` |
| `POST` | `/api/vouchers/generate-bulk-pdf` | PDF without saving to DB | `{class_id, section_id?, month, due_date?}` |
| `GET` | `/api/vouchers/:id/print` | Print inline (not download) | None |

---

## 💡 Quick Implementation Examples

### 1. Set Custom Admission Fee During Student Admission

```javascript
// After creating student, set custom fee
const response = await fetch('/api/student-fee-overrides', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    student_id: 1,
    class_id: 2,
    admission_fee: 4000,        // Custom (instead of 5000)
    monthly_fee: null,          // null = use class default
    paper_fund: null,           // null = use class default
    reason: "Custom fee agreed during admission"
  })
});
```

### 2. Preview Vouchers Before Creating

```javascript
// Preview what will be created
const response = await fetch('/api/vouchers/preview-bulk', {
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

const data = await response.json();
console.log(`Will create ${data.data.summary.total_students} vouchers`);
```

### 3. Print Without Saving

```javascript
// Generate PDF without database records
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
window.open(url, '_blank'); // Opens for printing
```

### 4. Print vs Download Single Voucher

```javascript
// Option 1: Print (opens inline)
const printVoucher = (id) => {
  window.open(`/api/vouchers/${id}/print`, '_blank');
};

// Option 2: Download (saves file)
const downloadVoucher = (id) => {
  window.location.href = `/api/vouchers/${id}/pdf`;
};
```

---

## 🎨 UI Components to Add/Update

### 1. Student Admission Form - Add Fee Section

```jsx
<div className="fee-structure-section">
  <h3>Fee Structure</h3>
  
  {/* Show class defaults */}
  <div className="class-defaults">
    <p>Class Default Fees:</p>
    <ul>
      <li>Admission: Rs. {classDefaults.admission_fee}</li>
      <li>Monthly: Rs. {classDefaults.monthly_fee}</li>
      <li>Paper Fund: Rs. {classDefaults.paper_fund}</li>
    </ul>
  </div>
  
  {/* Checkbox to enable custom fees */}
  <Checkbox
    label="Set Custom Fees for this Student"
    checked={customFeesEnabled}
    onChange={handleCustomFeesToggle}
  />
  
  {/* Custom fee inputs (show only if enabled) */}
  {customFeesEnabled && (
    <>
      <Input
        label="Custom Admission Fee"
        type="number"
        placeholder="Leave empty for default"
      />
      <Input
        label="Custom Monthly Fee"
        type="number"
        placeholder="Leave empty for default"
      />
      <TextArea
        label="Reason for Custom Fees"
        required
      />
    </>
  )}
</div>
```

### 2. Bulk Voucher Generation - Add Preview

```jsx
<div className="bulk-voucher-generation">
  {/* Existing selects */}
  <Select label="Class" />
  <Select label="Month" />
  
  {/* New preview button */}
  <Button onClick={handlePreview}>
    Preview Vouchers
  </Button>
  
  {/* Preview section (show after preview) */}
  {preview && (
    <div className="preview-section">
      <h3>{preview.summary.total_students} vouchers will be created</h3>
      
      <Table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Fees</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {preview.vouchers.map(v => (
            <tr>
              <td>{v.student_name}</td>
              <td>
                {v.items.map(item => (
                  <div>{item.item_type}: {item.amount}</div>
                ))}
              </td>
              <td>Rs. {v.total_amount}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      
      {/* Action buttons */}
      <Button onClick={handleGenerateAndSave}>
        Generate & Save
      </Button>
      <Button onClick={handlePrintWithoutSaving}>
        Print Without Saving
      </Button>
      <Button onClick={handleCancel}>
        Cancel
      </Button>
    </div>
  )}
</div>
```

### 3. Voucher Details - Add Print Button

```jsx
<div className="voucher-actions">
  <Button onClick={() => downloadVoucher(id)}>
    <DownloadIcon /> Download PDF
  </Button>
  
  {/* NEW: Print button */}
  <Button onClick={() => printVoucher(id)}>
    <PrintIcon /> Print
  </Button>
</div>
```

---

## 🔑 Key Concepts

### Fee Override Rules

| Value | Meaning | Example |
|-------|---------|---------|
| `null` | Use class default | `admission_fee: null` → Uses class's 5000 |
| `number` | Use custom value | `admission_fee: 4000` → Uses 4000 |
| `0` | Actually charge zero | `admission_fee: 0` → Free admission |

### When Fee Overrides Apply

- ✅ New vouchers generated after override is set
- ✅ Both single and bulk generation
- ✅ Automatic - no special handling needed
- ❌ Existing vouchers NOT affected
- ❌ Overrides DON'T transfer when student is promoted

### Preview vs Generate

| Action | Creates DB Records? | Use Case |
|--------|---------------------|----------|
| Preview | ❌ No | Review before committing |
| Generate & Save | ✅ Yes | Normal voucher creation |
| Print Without Saving | ❌ No | Quick print, no commitment |

---

## 📊 Data Flow Examples

### Flow 1: Admit Student with Custom Fee

```
1. User fills admission form
   ↓
2. User selects class (triggers class fee fetch)
   ↓
3. Frontend shows class default fees
   ↓
4. User checks "Set Custom Fees"
   ↓
5. User enters admission_fee = 4000, reason = "Agreed"
   ↓
6. User submits
   ↓
7. Frontend calls POST /api/students
   ↓
8. Backend returns student with ID
   ↓
9. Frontend calls POST /api/student-fee-overrides
   ↓
10. Fee override created
    ↓
11. Success! Future vouchers will use 4000
```

### Flow 2: Preview → Generate Vouchers

```
1. User selects Class 1, February 2026
   ↓
2. User clicks "Preview"
   ↓
3. Frontend calls POST /api/vouchers/preview-bulk
   ↓
4. Backend returns preview data (no DB changes)
   ↓
5. Frontend displays table of vouchers
   ↓
6. User reviews (sees Ahmad has custom admission fee 4000*)
   ↓
7. User chooses action:
   
   Option A: "Generate & Save"
   → POST /api/vouchers/generate-bulk
   → Creates vouchers in DB
   
   Option B: "Print Without Saving"
   → POST /api/vouchers/generate-bulk-pdf
   → Returns PDF, no DB changes
   
   Option C: "Cancel"
   → Go back
```

---

## ⚠️ Important Notes

### Do's

✅ **DO** set fee override AFTER creating student (need student ID)
✅ **DO** validate custom fees are >= 0
✅ **DO** require a reason when setting custom fees
✅ **DO** show class defaults alongside custom fees
✅ **DO** highlight students with custom fees in preview
✅ **DO** handle null properly (null = default, not zero)

### Don'ts

❌ **DON'T** assume override exists (check first)
❌ **DON'T** forget to fetch class fee structure
❌ **DON'T** set override before student is created
❌ **DON'T** treat null as zero (they're different!)
❌ **DON'T** forget to show reason field

---

## 🧪 Testing Checklist

### Fee Override Tests
- [ ] Create student with custom admission fee
- [ ] Verify override shows in student details
- [ ] Generate voucher, verify custom fee used
- [ ] Update override
- [ ] Remove override
- [ ] Generate voucher, verify default fee used

### Preview Tests
- [ ] Preview bulk vouchers
- [ ] Verify student count correct
- [ ] Verify custom fees shown
- [ ] Verify totals calculated correctly
- [ ] Preview then cancel (no DB changes)
- [ ] Preview then generate (DB changes)

### PDF Tests
- [ ] Print without saving (no DB records)
- [ ] Print single voucher inline
- [ ] Download single voucher
- [ ] Verify PDF opens in browser
- [ ] Verify download saves file

---

## 📞 Common Scenarios

### Scenario 1: Scholarship (50% Off)
```javascript
POST /api/student-fee-overrides
{
  "student_id": 5,
  "class_id": 2,
  "admission_fee": 2500,  // 50% of 5000
  "monthly_fee": 1500,    // 50% of 3000
  "paper_fund": 250,      // 50% of 500
  "reason": "Merit scholarship - 50%"
}
```

### Scenario 2: Sibling Discount (Monthly Only)
```javascript
POST /api/student-fee-overrides
{
  "student_id": 8,
  "class_id": 3,
  "admission_fee": null,  // Default
  "monthly_fee": 2500,    // Discounted
  "paper_fund": null,     // Default
  "reason": "Sibling discount"
}
```

### Scenario 3: Free Admission
```javascript
POST /api/student-fee-overrides
{
  "student_id": 10,
  "class_id": 1,
  "admission_fee": 0,     // Free!
  "monthly_fee": null,    // Pay normal
  "paper_fund": null,     // Pay normal
  "reason": "Admission waived"
}
```

---

## 🐛 Error Handling

```javascript
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
      // Handle errors
      if (response.status === 404) {
        showError('Student or class not found');
      } else if (response.status === 400) {
        showError(result.message);
      } else {
        showError('Failed to set fee override');
      }
      return;
    }
    
    showSuccess('Fee override set successfully');
  } catch (error) {
    showError('Network error');
  }
};
```

---

## 📚 Full Documentation

For complete details, see:
- **Frontend Integration Guide**: `/docs/FRONTEND_INTEGRATION_GUIDE.md`
- **Backend API Docs**: `/docs/VOUCHER_SYSTEM_UPDATES.md`
- **Quick Start**: `/docs/VOUCHER_QUICK_START.md`

---

## ✅ Summary

**What You Need to Do:**

1. Add fee override section to student admission form
2. Add preview button to bulk voucher generation
3. Add "Print Without Saving" option
4. Add print button to voucher details
5. Create fee management dashboard (optional but recommended)

**What Works Automatically:**

- Existing voucher generation respects overrides
- Fee calculation happens on backend
- No changes needed to existing endpoints
- 100% backward compatible
