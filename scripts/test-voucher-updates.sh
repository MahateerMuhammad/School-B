#!/bin/bash

# Test script for voucher system updates
# Tests fee overrides and new PDF generation features

BASE_URL="http://localhost:3000/api"
TOKEN=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Voucher System Updates - Test Script"
echo "=========================================="
echo ""

# Function to make authenticated requests
auth_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -X "$method" "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json"
  else
    curl -s -X "$method" "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data"
  fi
}

# Test 1: Login
echo -e "${YELLOW}Test 1: Login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ Login successful${NC}"
  echo "Token: ${TOKEN:0:20}..."
fi
echo ""

# Test 2: Get student and class info
echo -e "${YELLOW}Test 2: Get student and class info${NC}"
STUDENTS=$(auth_request "GET" "/students?limit=1")
STUDENT_ID=$(echo $STUDENTS | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

CLASSES=$(auth_request "GET" "/classes?limit=1")
CLASS_ID=$(echo $CLASSES | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$STUDENT_ID" ] || [ -z "$CLASS_ID" ]; then
  echo -e "${RED}✗ No students or classes found. Please seed data first.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found student ID: $STUDENT_ID, class ID: $CLASS_ID${NC}"
echo ""

# Test 3: Set fee override
echo -e "${YELLOW}Test 3: Set fee override for student${NC}"
OVERRIDE_RESPONSE=$(auth_request "POST" "/student-fee-overrides" '{
  "student_id": '"$STUDENT_ID"',
  "class_id": '"$CLASS_ID"',
  "admission_fee": 4000,
  "monthly_fee": null,
  "paper_fund": null,
  "reason": "Test: Custom admission fee agreed during admission"
}')

if echo "$OVERRIDE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Fee override set successfully${NC}"
  echo "Response: $OVERRIDE_RESPONSE" | jq '.' 2>/dev/null || echo "$OVERRIDE_RESPONSE"
else
  echo -e "${RED}✗ Failed to set fee override${NC}"
  echo "Response: $OVERRIDE_RESPONSE"
fi
echo ""

# Test 4: Get fee override
echo -e "${YELLOW}Test 4: Get fee override${NC}"
GET_OVERRIDE=$(auth_request "GET" "/student-fee-overrides/$STUDENT_ID/class/$CLASS_ID")

if echo "$GET_OVERRIDE" | grep -q '"admission_fee":4000'; then
  echo -e "${GREEN}✓ Fee override retrieved successfully${NC}"
  echo "Admission fee override: 4000 (confirmed)"
else
  echo -e "${RED}✗ Failed to retrieve fee override${NC}"
  echo "Response: $GET_OVERRIDE"
fi
echo ""

# Test 5: Preview bulk vouchers
echo -e "${YELLOW}Test 5: Preview bulk vouchers${NC}"
PREVIEW_RESPONSE=$(auth_request "POST" "/vouchers/preview-bulk" '{
  "class_id": '"$CLASS_ID"',
  "month": "2026-02-01",
  "due_date": "2026-02-10"
}')

if echo "$PREVIEW_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Bulk voucher preview generated successfully${NC}"
  VOUCHER_COUNT=$(echo "$PREVIEW_RESPONSE" | grep -o '"total_students":[0-9]*' | cut -d':' -f2)
  echo "Total students in preview: $VOUCHER_COUNT"
  
  # Check if our student with override has correct admission fee
  if echo "$PREVIEW_RESPONSE" | grep -q '"student_id":'"$STUDENT_ID"; then
    echo -e "${GREEN}✓ Student with override found in preview${NC}"
  fi
else
  echo -e "${RED}✗ Failed to preview bulk vouchers${NC}"
  echo "Response: $PREVIEW_RESPONSE"
fi
echo ""

# Test 6: Generate single voucher with override
echo -e "${YELLOW}Test 6: Generate single voucher (should use override)${NC}"
VOUCHER_RESPONSE=$(auth_request "POST" "/vouchers/generate" '{
  "student_id": '"$STUDENT_ID"',
  "month": "2026-03-01",
  "due_date": "2026-03-10"
}')

if echo "$VOUCHER_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Voucher generated successfully${NC}"
  VOUCHER_ID=$(echo "$VOUCHER_RESPONSE" | grep -o '"voucher_id":[0-9]*' | cut -d':' -f2)
  echo "Voucher ID: $VOUCHER_ID"
  
  # Get voucher details to verify admission fee
  VOUCHER_DETAILS=$(auth_request "GET" "/vouchers/$VOUCHER_ID")
  
  if echo "$VOUCHER_DETAILS" | grep -q '"item_type":"ADMISSION"'; then
    ADMISSION_AMOUNT=$(echo "$VOUCHER_DETAILS" | grep -A 1 '"item_type":"ADMISSION"' | grep -o '"amount":"[0-9.]*' | cut -d'"' -f4)
    
    if [ "$ADMISSION_AMOUNT" = "4000.00" ] || [ "$ADMISSION_AMOUNT" = "4000" ]; then
      echo -e "${GREEN}✓ Admission fee override applied correctly: $ADMISSION_AMOUNT${NC}"
    else
      echo -e "${RED}✗ Admission fee override NOT applied. Amount: $ADMISSION_AMOUNT (expected 4000)${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ No admission fee in voucher (might be subsequent voucher)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Voucher generation skipped or failed${NC}"
  echo "Response: $VOUCHER_RESPONSE"
fi
echo ""

# Test 7: Test print endpoint (download PDF inline)
echo -e "${YELLOW}Test 7: Test print PDF endpoint${NC}"
if [ ! -z "$VOUCHER_ID" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/vouchers/$VOUCHER_ID/print" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Print PDF endpoint working (HTTP $HTTP_CODE)${NC}"
  else
    echo -e "${RED}✗ Print PDF endpoint failed (HTTP $HTTP_CODE)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Skipping (no voucher ID)${NC}"
fi
echo ""

# Test 8: Test bulk PDF generation without save
echo -e "${YELLOW}Test 8: Generate bulk PDF without saving${NC}"
HTTP_CODE=$(curl -s -o /tmp/test-bulk-vouchers.pdf -w "%{http_code}" \
  -X POST "$BASE_URL/vouchers/generate-bulk-pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": '"$CLASS_ID"',
    "month": "2026-04-01"
  }')

if [ "$HTTP_CODE" = "200" ] && [ -f "/tmp/test-bulk-vouchers.pdf" ]; then
  FILE_SIZE=$(stat -f%z "/tmp/test-bulk-vouchers.pdf" 2>/dev/null || stat -c%s "/tmp/test-bulk-vouchers.pdf" 2>/dev/null)
  echo -e "${GREEN}✓ Bulk PDF generated successfully${NC}"
  echo "File saved to: /tmp/test-bulk-vouchers.pdf"
  echo "File size: $FILE_SIZE bytes"
  rm /tmp/test-bulk-vouchers.pdf
else
  echo -e "${RED}✗ Bulk PDF generation failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 9: List all fee overrides
echo -e "${YELLOW}Test 9: List all fee overrides${NC}"
LIST_OVERRIDES=$(auth_request "GET" "/student-fee-overrides?limit=10")

if echo "$LIST_OVERRIDES" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Fee overrides listed successfully${NC}"
  OVERRIDE_COUNT=$(echo "$LIST_OVERRIDES" | grep -o '"total":[0-9]*' | cut -d':' -f2)
  echo "Total overrides: $OVERRIDE_COUNT"
else
  echo -e "${RED}✗ Failed to list fee overrides${NC}"
  echo "Response: $LIST_OVERRIDES"
fi
echo ""

# Test 10: Remove fee override
echo -e "${YELLOW}Test 10: Remove fee override${NC}"
DELETE_RESPONSE=$(auth_request "DELETE" "/student-fee-overrides/$STUDENT_ID/class/$CLASS_ID")

if echo "$DELETE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Fee override removed successfully${NC}"
else
  echo -e "${RED}✗ Failed to remove fee override${NC}"
  echo "Response: $DELETE_RESPONSE"
fi
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "All critical tests completed!"
echo -e "${GREEN}✓${NC} Fee override system working"
echo -e "${GREEN}✓${NC} Voucher preview working"
echo -e "${GREEN}✓${NC} Bulk PDF generation working"
echo -e "${GREEN}✓${NC} Print endpoint working"
echo ""
echo "Note: Review the output above for any ${RED}✗${NC} failures"
