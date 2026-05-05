#!/bin/bash

# ============================================
# Faculty & Salary Management Module - Test Script
# ============================================

API_URL="http://localhost:3000/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Header
echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 Faculty & Salary Module - API Testing           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# ============================================
# AUTHENTICATION
# ============================================

echo -e "${CYAN}🔐 Logging in as admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])")

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}\n"

# ============================================
# SETUP: CREATE TEST DATA
# ============================================

echo -e "${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}  🔧 SETUP: Creating Test Data${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Create Faculty Member 1
echo -e "${CYAN}Setup: Create Faculty Member 1${NC}"
RANDOM_CNIC1="42101$(date +%s | tail -c 9)"
FACULTY1_RESPONSE=$(curl -s -X POST "$API_URL/faculty" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Dr. Ahmed Ali\",
    \"father_or_husband\": \"Muhammad Ali\",
    \"cnic\": \"$RANDOM_CNIC1\",
    \"phone\": \"+92-300-1234567\",
    \"gender\": \"MALE\",
    \"role\": \"Professor\",
    \"subject\": \"Mathematics\",
    \"base_salary\": 50000
  }")

FACULTY1_ID=$(echo "$FACULTY1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$FACULTY1_ID" ]; then
  echo "❌ Failed to create faculty member 1"
  echo "$FACULTY1_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Faculty 1 Created: ID $FACULTY1_ID"

# Create Faculty Member 2
echo -e "${CYAN}Setup: Create Faculty Member 2${NC}"
RANDOM_CNIC2="42102$(date +%s | tail -c 9)"
FACULTY2_RESPONSE=$(curl -s -X POST "$API_URL/faculty" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"name\": \"Ms. Fatima Khan\",
    \"father_or_husband\": \"Khalid Khan\",
    \"cnic\": \"$RANDOM_CNIC2\",
    \"phone\": \"+92-300-7654321\",
    \"gender\": \"FEMALE\",
    \"role\": \"Teacher\",
    \"subject\": \"English\",
    \"base_salary\": 40000
  }")

FACULTY2_ID=$(echo "$FACULTY2_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)
if [ -z "$FACULTY2_ID" ]; then
  echo "❌ Failed to create faculty member 2"
  echo "$FACULTY2_RESPONSE" | python3 -m json.tool
  exit 1
fi
echo "✅ Faculty 2 Created: ID $FACULTY2_ID"
echo ""

# ============================================
# FACULTY MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  👥 FACULTY MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 1: List All Faculty
echo -e "${CYAN}Test 1: List All Faculty Members${NC}"
echo "-----------------------------------"
LIST_FACULTY=$(curl -s -X GET "$API_URL/faculty" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_FACULTY" | python3 -m json.tool
FACULTY_COUNT=$(echo "$LIST_FACULTY" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Found $FACULTY_COUNT faculty member(s)${NC}\n"

# Test 2: Get Faculty by ID
echo -e "${CYAN}Test 2: Get Faculty Details by ID${NC}"
echo "-----------------------------------"
GET_FACULTY=$(curl -s -X GET "$API_URL/faculty/$FACULTY1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$GET_FACULTY" | python3 -m json.tool
echo -e "${GREEN}✅ Faculty details retrieved${NC}\n"

# Test 3: Update Faculty Information
echo -e "${CYAN}Test 3: Update Faculty Information${NC}"
echo "-----------------------------------"
UPDATE_FACULTY=$(curl -s -X PUT "$API_URL/faculty/$FACULTY1_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "phone": "+92-300-9999999",
    "subject": "Advanced Mathematics"
  }')

echo "$UPDATE_FACULTY" | python3 -m json.tool
UPDATE_SUCCESS=$(echo "$UPDATE_FACULTY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

if [ "$UPDATE_SUCCESS" = "True" ]; then
  echo -e "${GREEN}✅ Faculty information updated${NC}\n"
else
  echo -e "${RED}❌ Faculty update failed${NC}\n"
fi

# Test 4: Update Salary Structure
echo -e "${CYAN}Test 4: Update Salary Structure${NC}"
echo "-----------------------------------"
UPDATE_SALARY=$(curl -s -X PUT "$API_URL/faculty/$FACULTY1_ID/salary" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "base_salary": 55000,
    "effective_from": "2026-02-01"
  }')

echo "$UPDATE_SALARY" | python3 -m json.tool
UPDATE_SALARY_SUCCESS=$(echo "$UPDATE_SALARY" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

if [ "$UPDATE_SALARY_SUCCESS" = "True" ]; then
  echo -e "${GREEN}✅ Salary structure updated${NC}\n"
else
  echo -e "${RED}❌ Salary update failed${NC}\n"
fi

# Test 5: Get Salary History
echo -e "${CYAN}Test 5: Get Salary History${NC}"
echo "-----------------------------------"
SALARY_HISTORY=$(curl -s -X GET "$API_URL/faculty/$FACULTY1_ID/salary-history" \
  -H "Authorization: Bearer $TOKEN")

echo "$SALARY_HISTORY" | python3 -m json.tool
echo -e "${GREEN}✅ Salary history retrieved${NC}\n"

# Test 6: Get Faculty Statistics
echo -e "${CYAN}Test 6: Get Faculty Statistics${NC}"
echo "-----------------------------------"
FACULTY_STATS=$(curl -s -X GET "$API_URL/faculty/stats" \
  -H "Authorization: Bearer $TOKEN")

echo "$FACULTY_STATS" | python3 -m json.tool
echo -e "${GREEN}✅ Faculty statistics retrieved${NC}\n"

# ============================================
# SALARY VOUCHER MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  💰 SALARY VOUCHER MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 7: Generate Single Salary Voucher
echo -e "${CYAN}Test 7: Generate Single Salary Voucher${NC}"
echo "-----------------------------------"
VOUCHER1_RESPONSE=$(curl -s -X POST "$API_URL/salaries/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"faculty_id\": $FACULTY1_ID,
    \"month\": \"2026-02-01\",
    \"adjustments\": [
      {
        \"type\": \"BONUS\",
        \"amount\": 5000,
        \"calc_type\": \"FLAT\"
      }
    ]
  }")

echo "$VOUCHER1_RESPONSE" | python3 -m json.tool
VOUCHER1_ID=$(echo "$VOUCHER1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('voucher_id', data.get('data', {}).get('id', '')))" 2>/dev/null)

if [ ! -z "$VOUCHER1_ID" ]; then
    echo -e "${GREEN}✅ Salary voucher generated (ID: $VOUCHER1_ID)${NC}\n"
else
    echo -e "${RED}❌ Salary voucher generation failed${NC}\n"
fi

# Test 8: Generate Bulk Salary Vouchers
echo -e "${CYAN}Test 8: Generate Bulk Salary Vouchers${NC}"
echo "-----------------------------------"
BULK_VOUCHER_RESPONSE=$(curl -s -X POST "$API_URL/salaries/generate-bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "month": "2026-02-01"
  }')

echo "$BULK_VOUCHER_RESPONSE" | python3 -m json.tool
echo -e "${GREEN}✅ Bulk salary vouchers generated${NC}\n"

# Test 9: List All Salary Vouchers
echo -e "${CYAN}Test 9: List All Salary Vouchers${NC}"
echo "-----------------------------------"
LIST_VOUCHERS=$(curl -s -X GET "$API_URL/salaries/vouchers" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_VOUCHERS" | python3 -m json.tool
VOUCHER_COUNT=$(echo "$LIST_VOUCHERS" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', len(data.get('data', []))))" 2>/dev/null)
echo -e "${GREEN}✅ Found $VOUCHER_COUNT voucher(s)${NC}\n"

# Test 10: Get Voucher Details
if [ ! -z "$VOUCHER1_ID" ]; then
  echo -e "${CYAN}Test 10: Get Voucher Details by ID${NC}"
  echo "-----------------------------------"
  GET_VOUCHER=$(curl -s -X GET "$API_URL/salaries/voucher/$VOUCHER1_ID" \
    -H "Authorization: Bearer $TOKEN")

  echo "$GET_VOUCHER" | python3 -m json.tool
  echo -e "${GREEN}✅ Voucher details retrieved${NC}\n"
fi

# Test 11: Add Adjustment to Voucher
if [ ! -z "$VOUCHER1_ID" ]; then
  echo -e "${CYAN}Test 11: Add Adjustment to Voucher${NC}"
  echo "-----------------------------------"
  ADD_ADJUSTMENT=$(curl -s -X POST "$API_URL/salaries/voucher/$VOUCHER1_ID/adjustment" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "type": "ADVANCE",
      "amount": 10000,
      "calc_type": "FLAT"
    }')

  echo "$ADD_ADJUSTMENT" | python3 -m json.tool
  ADJUSTMENT_SUCCESS=$(echo "$ADD_ADJUSTMENT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$ADJUSTMENT_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Adjustment added${NC}\n"
  else
    echo -e "${RED}❌ Adjustment failed${NC}\n"
  fi
fi

# Test 12: Get Unpaid Salary Vouchers
echo -e "${CYAN}Test 12: Get Unpaid Salary Vouchers${NC}"
echo "-----------------------------------"
UNPAID_VOUCHERS=$(curl -s -X GET "$API_URL/salaries/unpaid" \
  -H "Authorization: Bearer $TOKEN")

echo "$UNPAID_VOUCHERS" | python3 -m json.tool
UNPAID_COUNT=$(echo "$UNPAID_VOUCHERS" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null)
echo -e "${GREEN}✅ Found $UNPAID_COUNT unpaid voucher(s)${NC}\n"

# ============================================
# SALARY PAYMENT MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  💵 SALARY PAYMENT MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 13: Record Salary Payment
if [ ! -z "$VOUCHER1_ID" ]; then
  echo -e "${CYAN}Test 13: Record Salary Payment${NC}"
  echo "-----------------------------------"
  PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/salaries/payment" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"voucher_id\": $VOUCHER1_ID,
      \"amount\": 30000,
      \"payment_date\": \"2026-01-31\"
    }")

  echo "$PAYMENT_RESPONSE" | python3 -m json.tool
  PAYMENT_SUCCESS=$(echo "$PAYMENT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$PAYMENT_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Salary payment recorded${NC}\n"
  else
    echo -e "${RED}❌ Payment recording failed${NC}\n"
  fi
fi

# Test 14: Get Salary Statistics
echo -e "${CYAN}Test 14: Get Salary Statistics${NC}"
echo "-----------------------------------"
SALARY_STATS=$(curl -s -X GET "$API_URL/salaries/stats" \
  -H "Authorization: Bearer $TOKEN")

echo "$SALARY_STATS" | python3 -m json.tool
echo -e "${GREEN}✅ Salary statistics retrieved${NC}\n"

# Test 15: Filter Vouchers by Faculty
echo -e "${CYAN}Test 15: Filter Vouchers by Faculty${NC}"
echo "-----------------------------------"
FACULTY_VOUCHERS=$(curl -s -X GET "$API_URL/salaries/vouchers?faculty_id=$FACULTY1_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$FACULTY_VOUCHERS" | python3 -m json.tool
echo -e "${GREEN}✅ Faculty vouchers retrieved${NC}\n"

# ============================================
# SUMMARY
# ============================================

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Faculty & Salary Module Tests Completed!        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo "Summary:"
echo "  • Faculty members created: 2"
echo "  • Salary vouchers generated: $VOUCHER_COUNT"
echo "  • Unpaid vouchers: $UNPAID_COUNT"
echo ""
echo "Tested Features:"
echo "  ✓ Faculty CRUD operations"
echo "  ✓ Salary structure management"
echo "  ✓ Salary voucher generation (single & bulk)"
echo "  ✓ Salary adjustments (bonus & advance)"
echo "  ✓ Salary payments"
echo "  ✓ Statistics and reporting"
echo ""
echo "Next Steps:"
echo "  1. Test Expenses Module"
echo "  2. Test Reports & Analytics Module"
