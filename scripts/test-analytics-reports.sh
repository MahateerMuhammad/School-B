#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# API Base URL
BASE_URL="http://localhost:3000/api"

# Test data file
TOKEN_FILE="/tmp/school_api_token.txt"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 Analytics & Reports Module - API Testing        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Login and get token
echo -e "${BLUE}🔐 Logging in as admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  echo $LOGIN_RESPONSE | python3 -m json.tool
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}\n"

# Store token for reuse
echo $TOKEN > $TOKEN_FILE

#############################################
# ANALYTICS MODULE TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📊 ANALYTICS MODULE TESTS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 1: Dashboard Overview
echo -e "${YELLOW}Test 1: Dashboard Overview${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/dashboard" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Dashboard overview retrieved${NC}\n"
else
  echo -e "${RED}❌ Dashboard overview failed${NC}\n"
fi

# Test 2: Revenue Trends (Last 6 Months)
echo -e "${YELLOW}Test 2: Revenue Trends (Last 6 Months)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/revenue-trends?months=6" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Revenue trends retrieved${NC}\n"
else
  echo -e "${RED}❌ Revenue trends failed${NC}\n"
fi

# Test 3: Revenue Trends (Last 12 Months)
echo -e "${YELLOW}Test 3: Revenue Trends (Last 12 Months)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/revenue-trends?months=12" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Revenue trends (12 months) retrieved${NC}\n"
else
  echo -e "${RED}❌ Revenue trends (12 months) failed${NC}\n"
fi

# Test 4: Enrollment Trends
echo -e "${YELLOW}Test 4: Enrollment Trends${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/enrollment-trends" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Enrollment trends retrieved${NC}\n"
else
  echo -e "${RED}❌ Enrollment trends failed${NC}\n"
fi

# Test 5: Class-wise Collection Analysis
echo -e "${YELLOW}Test 5: Class-wise Collection Analysis${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/class-collection" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Class-wise collection retrieved${NC}\n"
else
  echo -e "${RED}❌ Class-wise collection failed${NC}\n"
fi

# Test 6: Faculty Statistics
echo -e "${YELLOW}Test 6: Faculty Statistics${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/faculty-stats" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Faculty statistics retrieved${NC}\n"
else
  echo -e "${RED}❌ Faculty statistics failed${NC}\n"
fi

# Test 7: Expense Analysis
echo -e "${YELLOW}Test 7: Expense Analysis${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/expense-analysis" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Expense analysis retrieved${NC}\n"
else
  echo -e "${RED}❌ Expense analysis failed${NC}\n"
fi

# Test 8: Performance Metrics
echo -e "${YELLOW}Test 8: Performance Metrics${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/analytics/performance" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Performance metrics retrieved${NC}\n"
else
  echo -e "${RED}❌ Performance metrics failed${NC}\n"
fi

#############################################
# REPORTS MODULE TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📑 REPORTS MODULE TESTS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 9: Daily Closing Report (Today)
echo -e "${YELLOW}Test 9: Daily Closing Report (Today)${NC}"
echo "-----------------------------------"
TODAY=$(date +%Y-%m-%d)
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/daily-closing?date=$TODAY" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Daily closing report retrieved${NC}\n"
else
  echo -e "${RED}❌ Daily closing report failed${NC}\n"
fi

# Test 10: Daily Closing Report (Specific Date)
echo -e "${YELLOW}Test 10: Daily Closing Report (January 20, 2026)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/daily-closing?date=2026-01-20" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Daily closing report (Jan 20) retrieved${NC}\n"
else
  echo -e "${RED}❌ Daily closing report (Jan 20) failed${NC}\n"
fi

# Test 11: Monthly Profit/Loss Report (Current Month)
echo -e "${YELLOW}Test 11: Monthly Profit/Loss Report (Current Month)${NC}"
echo "-----------------------------------"
CURRENT_MONTH=$(date +%Y-%m)
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/monthly-profit?month=$CURRENT_MONTH" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Monthly profit/loss report retrieved${NC}\n"
else
  echo -e "${RED}❌ Monthly profit/loss report failed${NC}\n"
fi

# Test 12: Monthly Profit/Loss Report (January 2026)
echo -e "${YELLOW}Test 12: Monthly Profit/Loss Report (January 2026)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/monthly-profit?month=2026-01" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Monthly profit/loss report (Jan 2026) retrieved${NC}\n"
else
  echo -e "${RED}❌ Monthly profit/loss report (Jan 2026) failed${NC}\n"
fi

# Test 13: Fee Collection Report (Date Range)
echo -e "${YELLOW}Test 13: Fee Collection Report (Jan 1-31, 2026)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/fee-collection?from_date=2026-01-01&to_date=2026-01-31" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Fee collection report retrieved${NC}\n"
else
  echo -e "${RED}❌ Fee collection report failed${NC}\n"
fi

# Test 14: Fee Collection Report with Class Filter
echo -e "${YELLOW}Test 14: Fee Collection Report (Class 1)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/fee-collection?from_date=2026-01-01&to_date=2026-01-31&class_id=1" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Fee collection report (Class 1) retrieved${NC}\n"
else
  echo -e "${RED}❌ Fee collection report (Class 1) failed${NC}\n"
fi

# Test 15: Defaulters Aging Report
echo -e "${YELLOW}Test 15: Defaulters Aging Report${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/defaulters-aging" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Defaulters aging report retrieved${NC}\n"
else
  echo -e "${RED}❌ Defaulters aging report failed${NC}\n"
fi

# Test 16: Salary Disbursement Report
echo -e "${YELLOW}Test 16: Salary Disbursement Report (Jan 2026)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/salary-disbursement?from_date=2026-01-01&to_date=2026-01-31" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Salary disbursement report retrieved${NC}\n"
else
  echo -e "${RED}❌ Salary disbursement report failed${NC}\n"
fi

# Test 17: Custom Comprehensive Report
echo -e "${YELLOW}Test 17: Custom Comprehensive Report (Jan 2026)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/reports/custom?from_date=2026-01-01&to_date=2026-01-31" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Custom comprehensive report retrieved${NC}\n"
else
  echo -e "${RED}❌ Custom comprehensive report failed${NC}\n"
fi

#############################################
# SUMMARY
#############################################

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Analytics & Reports Module Tests Completed!     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${GREEN}Tested Features:${NC}"
echo -e "  ${CYAN}Analytics Module:${NC}"
echo "    ✓ Dashboard overview"
echo "    ✓ Revenue trends (6 & 12 months)"
echo "    ✓ Enrollment trends"
echo "    ✓ Class-wise collection"
echo "    ✓ Faculty statistics"
echo "    ✓ Expense analysis"
echo "    ✓ Performance metrics"
echo ""
echo -e "  ${CYAN}Reports Module:${NC}"
echo "    ✓ Daily closing report"
echo "    ✓ Monthly profit/loss report"
echo "    ✓ Fee collection report (with/without class filter)"
echo "    ✓ Defaulters aging report"
echo "    ✓ Salary disbursement report"
echo "    ✓ Custom comprehensive report"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review all module test results"
echo "  2. Integration testing across modules"
echo "  3. Performance optimization if needed"
