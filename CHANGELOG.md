# Changelog

## [Unreleased] - 2026-02-18

### Added

#### Fee Management System Enhancements

**Student Fee Overrides (Issue #4)**
- New `student_fee_overrides` table to store per-student custom fees
- API endpoints for managing fee overrides:
  - `POST /api/student-fee-overrides` - Set/update custom fees for a student
  - `GET /api/student-fee-overrides/:student_id/class/:class_id` - Get specific override
  - `GET /api/student-fee-overrides` - List all overrides with filters
  - `DELETE /api/student-fee-overrides/:student_id/class/:class_id` - Remove override
- Automatic override application during voucher generation
- Support for overriding admission_fee, monthly_fee, and paper_fund per student per class
- Null handling: `null` = use class default, `0` = actually charge zero

**Voucher Preview and PDF Options (Issue #3)**
- `POST /api/vouchers/preview-bulk` - Preview vouchers before creating them
- `POST /api/vouchers/generate-bulk-pdf` - Generate bulk PDF without saving to database
- `GET /api/vouchers/:id/print` - Display PDF inline for printing (vs downloading)
- Bulk PDF generation service method `generateBulkFeeVouchers()`

### Changed

**Voucher Generation Logic**
- `generate()` now checks for student fee overrides before applying class defaults
- `generateBulk()` now checks for student fee overrides for each student
- Effective fees calculation: override > class default > zero
- Both single and bulk generation respect per-student overrides

### Technical Details

**New Files**
- `migrations/008_add_student_fee_overrides.sql` - Database schema for fee overrides
- `src/controllers/student-fee-overrides.controller.js` - Fee override CRUD operations
- `src/routes/student-fee-overrides.routes.js` - API routes for fee overrides
- `docs/VOUCHER_SYSTEM_UPDATES.md` - Complete technical documentation
- `docs/VOUCHER_QUICK_START.md` - Quick start and troubleshooting guide
- `scripts/test-voucher-updates.sh` - Automated test suite
- `VOUCHER_UPDATES_SUMMARY.md` - High-level summary

**Modified Files**
- `src/controllers/vouchers.controller.js` - Added override checking and new methods
- `src/routes/vouchers.routes.js` - Added preview and print routes
- `src/services/pdf.service.js` - Added bulk PDF generation method
- `src/app.js` - Registered new routes

**Database Changes**
- New table: `student_fee_overrides`
- Indexes: `idx_student_fee_overrides_student`, `idx_student_fee_overrides_class`
- Foreign keys: student_id, class_id, applied_by (user)
- Unique constraint: (student_id, class_id)

### Fixed

- **Issue #4**: Vouchers now respect custom admission fees set during student admission
  - Previous: Always used class default fee (e.g., 5000)
  - Now: Uses student-specific override if set (e.g., 4000)
  
- **Issue #3**: Added multiple voucher display and PDF generation options
  - Previous: Only download after creation
  - Now: Preview, print inline, download, or generate PDF without saving

### Backward Compatibility

- ✅ All existing endpoints unchanged
- ✅ Existing vouchers unaffected
- ✅ Fee overrides are optional (graceful fallback to class defaults)
- ✅ No breaking changes
- ✅ 100% backward compatible

### Migration

```bash
node scripts/run-migration.js 008_add_student_fee_overrides.sql
```

### Testing

Run comprehensive test suite:
```bash
./scripts/test-voucher-updates.sh
```

### Use Cases

**Custom Admission Fee**
```bash
POST /api/student-fee-overrides
{
  "student_id": 1,
  "class_id": 2,
  "admission_fee": 4000,
  "reason": "Custom fee agreed during admission"
}
```

**Scholarship Discount**
```bash
POST /api/student-fee-overrides
{
  "student_id": 5,
  "class_id": 3,
  "admission_fee": 2500,
  "monthly_fee": 1500,
  "reason": "Merit scholarship - 50% discount"
}
```

**Preview Before Creating**
```bash
POST /api/vouchers/preview-bulk
{
  "class_id": 2,
  "month": "2026-02-01"
}
```

**Print Without Saving**
```bash
POST /api/vouchers/generate-bulk-pdf
{
  "class_id": 2,
  "month": "2026-02-01"
}
```

### Documentation

- 📚 Full technical docs: `docs/VOUCHER_SYSTEM_UPDATES.md`
- 🚀 Quick start guide: `docs/VOUCHER_QUICK_START.md`
- 📋 Summary: `VOUCHER_UPDATES_SUMMARY.md`

---

## Previous Versions

[Previous changelog entries would go here]
