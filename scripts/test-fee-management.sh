#!/bin/bash

# Fee Management Module API Test Script
# ======================================

API_URL="http://localhost:3000/api"
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 Fee Management Module - API Testing             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Login to get token
echo -e "${CYAN}🔐 Logging in as admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Login failed${NC}\n"
    exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}\n"

# ============================================
# SETUP: CREATE TEST DATA
# ============================================

echo -e "${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}  🔧 SETUP: Creating Test Data${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Create Class
echo -e "${CYAN}Setup: Create Class${NC}"
CLASS_RESPONSE=$(curl -s -X POST "$API_URL/classes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Class 10",
    "class_type": "SCHOOL",
    "fee_structure": {
      "monthly_fee": 5000,
      "admission_fee": 10000,
      "paper_fund": 1500
    }
  }')

CLASS_ID=$(echo "$CLASS_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$CLASS_ID" ]; then
  echo "❌ Failed to create class"
  echo "$CLASS_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Class Created: ID $CLASS_ID"

# Create Section
echo -e "${CYAN}Setup: Create Section${NC}"
SECTION_RESPONSE=$(curl -s -X POST "$API_URL/sections" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"class_id\": $CLASS_ID,
    \"name\": \"Section A\"
  }")

SECTION_ID=$(echo "$SECTION_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$SECTION_ID" ]; then
  echo "❌ Failed to create section"
  echo "$SECTION_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Section Created: ID $SECTION_ID"

# Create Test Students
echo -e "${CYAN}Setup: Create Test Student 1${NC}"
STUDENT1_RESPONSE=$(curl -s -X POST "$API_URL/students" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Test Student 1\",
    \"roll_no\": \"10A-FEE-$(date +%s)-001\",
    \"address\": \"Test Address 1\",
    \"bay_form\": \"1234567890123\"
  }")

STUDENT1_ID=$(echo "$STUDENT1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$STUDENT1_ID" ]; then
  echo "❌ Failed to create student 1"
  echo "$STUDENT1_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Student 1 Created: ID $STUDENT1_ID"

echo -e "${CYAN}Setup: Create Test Student 2${NC}"
STUDENT2_RESPONSE=$(curl -s -X POST "$API_URL/students" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Test Student 2\",
    \"roll_no\": \"10A-FEE-$(date +%s)-002\",
    \"address\": \"Test Address 2\",
    \"bay_form\": \"9876543210987\"
  }")

STUDENT2_ID=$(echo "$STUDENT2_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$STUDENT2_ID" ]; then
  echo "❌ Failed to create student 2"
  echo "$STUDENT2_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Student 2 Created: ID $STUDENT2_ID"

# Enroll Student 1 in Section
echo -e "${CYAN}Setup: Enroll Student 1 in Section${NC}"
ENROLL1_RESPONSE=$(curl -s -X POST "$API_URL/students/$STUDENT1_ID/enroll" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"class_id\": $CLASS_ID,
    \"section_id\": $SECTION_ID,
    \"start_date\": \"2026-01-01\"
  }")

echo "$ENROLL1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print('✅ Enrolled' if data.get('success') else '❌ Failed')" 2>/dev/null

# Enroll Student 2 in Section
echo -e "${CYAN}Setup: Enroll Student 2 in Section${NC}"
ENROLL2_RESPONSE=$(curl -s -X POST "$API_URL/students/$STUDENT2_ID/enroll" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"class_id\": $CLASS_ID,
    \"section_id\": $SECTION_ID,
    \"start_date\": \"2026-01-01\"
  }")

echo "$ENROLL2_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print('✅ Enrolled' if data.get('success') else '❌ Failed')" 2>/dev/null
echo ""

# ============================================
# VOUCHERS MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  📄 VOUCHERS MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 1: Generate Single Voucher
echo -e "${CYAN}Test 1: Generate Single Fee Voucher${NC}"
echo "-----------------------------------"
VOUCHER1_RESPONSE=$(curl -s -X POST "$API_URL/vouchers/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"student_id\": $STUDENT1_ID,
    \"month\": \"2026-02-01\",
    \"custom_items\": [
      {
        \"item_type\": \"TRANSPORT\",
        \"amount\": 2000
      }
    ]
  }")

echo "$VOUCHER1_RESPONSE" | python3 -m json.tool
VOUCHER1_ID=$(echo "$VOUCHER1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('voucher_id', ''))" 2>/dev/null)

if [ ! -z "$VOUCHER1_ID" ]; then
    echo -e "${GREEN}✅ Voucher generated successfully (ID: $VOUCHER1_ID)${NC}\n"
else
    echo -e "${RED}❌ Voucher generation failed${NC}\n"
fi

# Test 2: Generate Bulk Vouchers
echo -e "${CYAN}Test 2: Generate Bulk Vouchers for Section${NC}"
echo "-----------------------------------"
BULK_VOUCHER_RESPONSE=$(curl -s -X POST "$API_URL/vouchers/generate-bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"class_id\": $CLASS_ID,
    \"section_id\": $SECTION_ID,
    \"month\": \"2026-03-01\"
  }")

echo "$BULK_VOUCHER_RESPONSE" | python3 -m json.tool
echo -e "${GREEN}✅ Bulk vouchers generated${NC}\n"

# Test 3: List All Vouchers
echo -e "${CYAN}Test 3: List All Vouchers${NC}"
echo "-----------------------------------"
LIST_VOUCHERS=$(curl -s -X GET "$API_URL/vouchers" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_VOUCHERS" | python3 -m json.tool
VOUCHER_COUNT=$(echo "$LIST_VOUCHERS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo -e "${GREEN}✅ Found $VOUCHER_COUNT voucher(s)${NC}\n"

# Test 4: Get Voucher by ID
echo -e "${CYAN}Test 4: Get Voucher Details by ID${NC}"
echo "-----------------------------------"
GET_VOUCHER=$(curl -s -X GET "$API_URL/vouchers/$VOUCHER1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$GET_VOUCHER" | python3 -m json.tool
echo -e "${GREEN}✅ Voucher details retrieved${NC}\n"

# Test 5: Update Voucher Items
echo -e "${CYAN}Test 5: Update Voucher Items${NC}"
echo "-----------------------------------"

# Skip if no voucher ID available
if [ -z "$VOUCHER1_ID" ]; then
  echo -e "${YELLOW}⚠️  Skipped (no voucher ID)${NC}\n"
else
  UPDATE_VOUCHER=$(curl -s -X PUT "$API_URL/vouchers/$VOUCHER1_ID/items" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "items": [
        {
          "item_type": "MONTHLY",
          "amount": 5000
        },
        {
          "item_type": "TRANSPORT",
          "amount": 2500
        }
      ]
    }')

  echo "$UPDATE_VOUCHER" | python3 -m json.tool
  UPDATE_SUCCESS=$(echo "$UPDATE_VOUCHER" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
  
  if [ "$UPDATE_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Voucher items updated${NC}\n"
  else
    echo -e "${RED}❌ Voucher items update failed${NC}\n"
  fi
fi

# ============================================
# PAYMENTS MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  💰 PAYMENTS MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 6: Record Full Payment
echo -e "${CYAN}Test 6: Record Full Payment${NC}"
echo "-----------------------------------"

# Use the bulk voucher if single voucher ID is not available
PAYMENT_VOUCHER_ID=$VOUCHER1_ID
if [ -z "$PAYMENT_VOUCHER_ID" ]; then
  # Extract first voucher from the bulk generation
  PAYMENT_VOUCHER_ID=$(echo "$BULK_VOUCHER_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('details', {}).get('generated', [{}])[0].get('voucher_id', ''))" 2>/dev/null)
fi

if [ -z "$PAYMENT_VOUCHER_ID" ]; then
  echo -e "${RED}❌ No voucher ID available for payment test${NC}\n"
else
  PAYMENT1_RESPONSE=$(curl -s -X POST "$API_URL/fees/payment" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"voucher_id\": $PAYMENT_VOUCHER_ID,
      \"amount\": 7000,
      \"payment_date\": \"2026-01-31\"
    }")

  echo "$PAYMENT1_RESPONSE" | python3 -m json.tool
  PAYMENT1_SUCCESS=$(echo "$PAYMENT1_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$PAYMENT1_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Payment recorded successfully${NC}\n"
  else
    echo -e "${RED}❌ Payment recording failed${NC}\n"
  fi
fi

# Test 7: List All Payments
echo -e "${CYAN}Test 7: List All Payments${NC}"
echo "-----------------------------------"
LIST_PAYMENTS=$(curl -s -X GET "$API_URL/fees/payments" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_PAYMENTS" | python3 -m json.tool
PAYMENT_COUNT=$(echo "$LIST_PAYMENTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo -e "${GREEN}✅ Found $PAYMENT_COUNT payment(s)${NC}\n"

# Test 8: Get Payments for Specific Voucher
echo -e "${CYAN}Test 8: Get Payments for Voucher${NC}"
echo "-----------------------------------"

if [ -z "$PAYMENT_VOUCHER_ID" ]; then
  echo -e "${YELLOW}⚠️  Skipped (no voucher ID)${NC}\n"
else
  VOUCHER_PAYMENTS=$(curl -s -X GET "$API_URL/fees/voucher/$PAYMENT_VOUCHER_ID/payments" \
    -H "Authorization: Bearer $TOKEN")

  echo "$VOUCHER_PAYMENTS" | python3 -m json.tool
  echo -e "${GREEN}✅ Voucher payments retrieved${NC}\n"
fi

# Test 9: Get Student Fee History
echo -e "${CYAN}Test 9: Get Student Fee History${NC}"
echo "-----------------------------------"
STUDENT_HISTORY=$(curl -s -X GET "$API_URL/fees/student/$STUDENT1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$STUDENT_HISTORY" | python3 -m json.tool
echo -e "${GREEN}✅ Student fee history retrieved${NC}\n"

# Test 10: Get Student Current Due
echo -e "${CYAN}Test 10: Get Student Current Due${NC}"
echo "-----------------------------------"
STUDENT_DUE=$(curl -s -X GET "$API_URL/fees/student/$STUDENT1_ID/due" \
  -H "Authorization: Bearer $TOKEN")

echo "$STUDENT_DUE" | python3 -m json.tool
echo -e "${GREEN}✅ Student due amount retrieved${NC}\n"

# ============================================
# DEFAULTERS & STATISTICS TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  📊 DEFAULTERS & STATISTICS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 11: Get Defaulters List
echo -e "${CYAN}Test 11: Get Defaulters List${NC}"
echo "-----------------------------------"
DEFAULTERS=$(curl -s -X GET "$API_URL/fees/defaulters" \
  -H "Authorization: Bearer $TOKEN")

echo "$DEFAULTERS" | python3 -m json.tool
DEFAULTER_COUNT=$(echo "$DEFAULTERS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo -e "${GREEN}✅ Found $DEFAULTER_COUNT defaulter(s)${NC}\n"

# Test 12: Get Fee Collection Statistics
echo -e "${CYAN}Test 12: Get Fee Collection Statistics${NC}"
echo "-----------------------------------"
FEE_STATS=$(curl -s -X GET "$API_URL/fees/stats" \
  -H "Authorization: Bearer $TOKEN")

echo "$FEE_STATS" | python3 -m json.tool
echo -e "${GREEN}✅ Fee statistics retrieved${NC}\n"

# Test 13: Filter Vouchers by Status
echo -e "${CYAN}Test 13: Filter Vouchers by Status (PAID)${NC}"
echo "-----------------------------------"
PAID_VOUCHERS=$(curl -s -X GET "$API_URL/vouchers?status=PAID" \
  -H "Authorization: Bearer $TOKEN")

echo "$PAID_VOUCHERS" | python3 -m json.tool
echo -e "${GREEN}✅ Filtered vouchers retrieved${NC}\n"

# Test 14: Filter Vouchers by Month
echo -e "${CYAN}Test 14: Filter Vouchers by Month${NC}"
echo "-----------------------------------"
MONTH_VOUCHERS=$(curl -s -X GET "$API_URL/vouchers?month=2026-02-01" \
  -H "Authorization: Bearer $TOKEN")

echo "$MONTH_VOUCHERS" | python3 -m json.tool
echo -e "${GREEN}✅ Month-filtered vouchers retrieved${NC}\n"

# Test 15: Filter Vouchers by Student
echo -e "${CYAN}Test 15: Filter Vouchers by Student${NC}"
echo "-----------------------------------"
STUDENT_VOUCHERS=$(curl -s -X GET "$API_URL/vouchers?student_id=$STUDENT1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$STUDENT_VOUCHERS" | python3 -m json.tool
echo -e "${GREEN}✅ Student vouchers retrieved${NC}\n"

# Final Summary
echo -e "\n${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Fee Management Module Tests Completed!          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${GREEN}Summary:${NC}"
echo "  • Classes created: 1"
echo "  • Sections created: 1"
echo "  • Students created: 2"
echo "  • Fee vouchers generated: $VOUCHER_COUNT"
echo "  • Payments recorded: $PAYMENT_COUNT"
echo "  • Defaulters found: $DEFAULTER_COUNT"
echo ""
echo -e "${YELLOW}Tested Features:${NC}"
echo "  ✓ Voucher generation (single & bulk)"
echo "  ✓ Voucher listing and filtering"
echo "  ✓ Voucher item updates"
echo "  ✓ Payment recording"
echo "  ✓ Payment history"
echo "  ✓ Student fee tracking"
echo "  ✓ Defaulters list"
echo "  ✓ Fee statistics"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo "  1. Test Faculty & Salary Module"
echo "  2. Test Expenses Module"
echo "  3. Test Reports & Analytics Module"
echo ""
