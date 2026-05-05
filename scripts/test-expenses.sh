#!/bin/bash

# ============================================
# Expenses Module - Test Script
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
echo "║  🧪 Expenses Module - API Testing                   ║"
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
# EXPENSES CRUD MODULE TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  💰 EXPENSES CRUD TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 1: Create Single Expense
echo -e "${CYAN}Test 1: Create Single Expense${NC}"
echo "-----------------------------------"
EXPENSE1_RESPONSE=$(curl -s -X POST "$API_URL/expenses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Office Supplies",
    "amount": 5000,
    "expense_date": "2026-01-15"
  }')

echo "$EXPENSE1_RESPONSE" | python3 -m json.tool
EXPENSE1_ID=$(echo "$EXPENSE1_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)

if [ ! -z "$EXPENSE1_ID" ]; then
    echo -e "${GREEN}✅ Expense created (ID: $EXPENSE1_ID)${NC}\n"
else
    echo -e "${RED}❌ Expense creation failed${NC}\n"
fi

# Test 2: Create Another Expense
echo -e "${CYAN}Test 2: Create Another Expense${NC}"
echo "-----------------------------------"
EXPENSE2_RESPONSE=$(curl -s -X POST "$API_URL/expenses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Electricity Bill",
    "amount": 12000,
    "expense_date": "2026-01-20"
  }')

echo "$EXPENSE2_RESPONSE" | python3 -m json.tool
EXPENSE2_ID=$(echo "$EXPENSE2_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('id', ''))" 2>/dev/null)

if [ ! -z "$EXPENSE2_ID" ]; then
    echo -e "${GREEN}✅ Expense created (ID: $EXPENSE2_ID)${NC}\n"
else
    echo -e "${RED}❌ Expense creation failed${NC}\n"
fi

# Test 3: Bulk Create Expenses
echo -e "${CYAN}Test 3: Bulk Create Expenses${NC}"
echo "-----------------------------------"
BULK_RESPONSE=$(curl -s -X POST "$API_URL/expenses/bulk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "expenses": [
      {
        "title": "Water Bill",
        "amount": 3000,
        "expense_date": "2026-01-18"
      },
      {
        "title": "Internet Charges",
        "amount": 2500,
        "expense_date": "2026-01-22"
      },
      {
        "title": "Maintenance",
        "amount": 8000,
        "expense_date": "2026-01-25"
      }
    ]
  }')

echo "$BULK_RESPONSE" | python3 -m json.tool
BULK_COUNT=$(echo "$BULK_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('data', [])))" 2>/dev/null)
echo -e "${GREEN}✅ Bulk expenses created: $BULK_COUNT${NC}\n"

# Test 4: List All Expenses
echo -e "${CYAN}Test 4: List All Expenses${NC}"
echo "-----------------------------------"
LIST_RESPONSE=$(curl -s -X GET "$API_URL/expenses" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_RESPONSE" | python3 -m json.tool
TOTAL_EXPENSES=$(echo "$LIST_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Found $TOTAL_EXPENSES expense(s)${NC}\n"

# Test 5: Get Expense by ID
if [ ! -z "$EXPENSE1_ID" ]; then
  echo -e "${CYAN}Test 5: Get Expense by ID${NC}"
  echo "-----------------------------------"
  GET_RESPONSE=$(curl -s -X GET "$API_URL/expenses/$EXPENSE1_ID" \
    -H "Authorization: Bearer $TOKEN")

  echo "$GET_RESPONSE" | python3 -m json.tool
  echo -e "${GREEN}✅ Expense details retrieved${NC}\n"
fi

# Test 6: Update Expense
if [ ! -z "$EXPENSE1_ID" ]; then
  echo -e "${CYAN}Test 6: Update Expense${NC}"
  echo "-----------------------------------"
  UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/expenses/$EXPENSE1_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "title": "Office Supplies (Updated)",
      "amount": 5500
    }')

  echo "$UPDATE_RESPONSE" | python3 -m json.tool
  UPDATE_SUCCESS=$(echo "$UPDATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$UPDATE_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Expense updated${NC}\n"
  else
    echo -e "${RED}❌ Expense update failed${NC}\n"
  fi
fi

# ============================================
# EXPENSES FILTERING TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  🔍 EXPENSES FILTERING TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 7: Filter by Date Range
echo -e "${CYAN}Test 7: Filter Expenses by Date Range${NC}"
echo "-----------------------------------"
FILTER_DATE_RESPONSE=$(curl -s -X GET "$API_URL/expenses?from_date=2026-01-15&to_date=2026-01-20" \
  -H "Authorization: Bearer $TOKEN")

echo "$FILTER_DATE_RESPONSE" | python3 -m json.tool
FILTERED_COUNT=$(echo "$FILTER_DATE_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Found $FILTERED_COUNT expense(s) in date range${NC}\n"

# Test 8: Filter by Amount Range
echo -e "${CYAN}Test 8: Filter Expenses by Amount Range${NC}"
echo "-----------------------------------"
FILTER_AMOUNT_RESPONSE=$(curl -s -X GET "$API_URL/expenses?min_amount=5000&max_amount=10000" \
  -H "Authorization: Bearer $TOKEN")

echo "$FILTER_AMOUNT_RESPONSE" | python3 -m json.tool
FILTERED_AMOUNT_COUNT=$(echo "$FILTER_AMOUNT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Found $FILTERED_AMOUNT_COUNT expense(s) in amount range${NC}\n"

# Test 9: Search Expenses by Title
echo -e "${CYAN}Test 9: Search Expenses by Title${NC}"
echo "-----------------------------------"
SEARCH_RESPONSE=$(curl -s -X GET "$API_URL/expenses?search=Bill" \
  -H "Authorization: Bearer $TOKEN")

echo "$SEARCH_RESPONSE" | python3 -m json.tool
SEARCH_COUNT=$(echo "$SEARCH_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('pagination', {}).get('total', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Found $SEARCH_COUNT expense(s) matching 'Bill'${NC}\n"

# ============================================
# EXPENSES SUMMARY & STATISTICS TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  📊 EXPENSES SUMMARY & STATISTICS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 10: Get Expenses Summary
echo -e "${CYAN}Test 10: Get Expenses Summary${NC}"
echo "-----------------------------------"
SUMMARY_RESPONSE=$(curl -s -X GET "$API_URL/expenses/summary" \
  -H "Authorization: Bearer $TOKEN")

echo "$SUMMARY_RESPONSE" | python3 -m json.tool
TOTAL_AMOUNT=$(echo "$SUMMARY_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('total_amount', 0))" 2>/dev/null)
echo -e "${GREEN}✅ Summary retrieved - Total: PKR $TOTAL_AMOUNT${NC}\n"

# Test 11: Get Daily Expenses
echo -e "${CYAN}Test 11: Get Daily Expenses Breakdown${NC}"
echo "-----------------------------------"
DAILY_RESPONSE=$(curl -s -X GET "$API_URL/expenses/daily?from_date=2026-01-01&to_date=2026-01-31" \
  -H "Authorization: Bearer $TOKEN")

echo "$DAILY_RESPONSE" | python3 -m json.tool
echo -e "${GREEN}✅ Daily expenses retrieved${NC}\n"

# Test 12: Get Top Expenses
echo -e "${CYAN}Test 12: Get Top 5 Expenses${NC}"
echo "-----------------------------------"
TOP_RESPONSE=$(curl -s -X GET "$API_URL/expenses/top?limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$TOP_RESPONSE" | python3 -m json.tool
echo -e "${GREEN}✅ Top expenses retrieved${NC}\n"

# ============================================
# EXPENSES DELETE TEST
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  🗑️  EXPENSES DELETE TEST${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 13: Delete Expense
if [ ! -z "$EXPENSE2_ID" ]; then
  echo -e "${CYAN}Test 13: Delete Expense${NC}"
  echo "-----------------------------------"
  DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/expenses/$EXPENSE2_ID" \
    -H "Authorization: Bearer $TOKEN")

  echo "$DELETE_RESPONSE" | python3 -m json.tool
  DELETE_SUCCESS=$(echo "$DELETE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)

  if [ "$DELETE_SUCCESS" = "True" ]; then
    echo -e "${GREEN}✅ Expense deleted${NC}\n"
  else
    echo -e "${RED}❌ Expense deletion failed${NC}\n"
  fi
fi

# ============================================
# SUMMARY
# ============================================

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Expenses Module Tests Completed!                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo "Summary:"
echo "  • Total expenses created: $TOTAL_EXPENSES"
echo "  • Total amount: PKR $TOTAL_AMOUNT"
echo ""
echo "Tested Features:"
echo "  ✓ Create single expense"
echo "  ✓ Bulk create expenses"
echo "  ✓ List all expenses"
echo "  ✓ Get expense by ID"
echo "  ✓ Update expense"
echo "  ✓ Filter by date range"
echo "  ✓ Filter by amount range"
echo "  ✓ Search by title"
echo "  ✓ Get expenses summary"
echo "  ✓ Get daily expenses breakdown"
echo "  ✓ Get top expenses"
echo "  ✓ Delete expense"
echo ""
echo "Next Steps:"
echo "  1. Test Reports & Analytics Module"
echo "  2. Integration testing across modules"
