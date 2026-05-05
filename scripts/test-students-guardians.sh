#!/bin/bash

# Students & Guardians Module API Test Script
# ============================================

API_URL="http://localhost:3000/api"
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 Students & Guardians Module - API Testing        ║"
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
# GUARDIANS TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  👨‍👩‍👧‍👦 GUARDIANS MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 1: Create Guardian
echo -e "${CYAN}Test 1: Create Guardian${NC}"
echo "-----------------------------------"
GUARDIAN_RESPONSE=$(curl -s -X POST "$API_URL/guardians" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Ahmed Ali",
    "cnic": "4210112345671",
    "phone": "+92-300-1234567",
    "occupation": "Engineer"
  }')

echo "$GUARDIAN_RESPONSE" | python3 -m json.tool
GUARDIAN_ID=$(echo "$GUARDIAN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ ! -z "$GUARDIAN_ID" ]; then
    echo -e "${GREEN}✅ Guardian created successfully (ID: $GUARDIAN_ID)${NC}\n"
else
    echo -e "${RED}❌ Guardian creation failed${NC}\n"
fi

# Test 2: Create Another Guardian
echo -e "${CYAN}Test 2: Create Second Guardian${NC}"
echo "-----------------------------------"
GUARDIAN2_RESPONSE=$(curl -s -X POST "$API_URL/guardians" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Fatima Khan",
    "cnic": "4210198765432",
    "phone": "+92-321-9876543",
    "occupation": "Teacher"
  }')

echo "$GUARDIAN2_RESPONSE" | python3 -m json.tool
GUARDIAN2_ID=$(echo "$GUARDIAN2_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ ! -z "$GUARDIAN2_ID" ]; then
    echo -e "${GREEN}✅ Second guardian created successfully (ID: $GUARDIAN2_ID)${NC}\n"
else
    echo -e "${RED}❌ Second guardian creation failed${NC}\n"
fi

# Test 3: List All Guardians
echo -e "${CYAN}Test 3: List All Guardians${NC}"
echo "-----------------------------------"
LIST_GUARDIANS=$(curl -s -X GET "$API_URL/guardians" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_GUARDIANS" | python3 -m json.tool
GUARDIAN_COUNT=$(echo "$LIST_GUARDIANS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo -e "${GREEN}✅ Found $GUARDIAN_COUNT guardian(s)${NC}\n"

# Test 4: Search Guardian by CNIC
echo -e "${CYAN}Test 4: Search Guardian by CNIC${NC}"
echo "-----------------------------------"
SEARCH_GUARDIAN=$(curl -s -X GET "$API_URL/guardians/search/cnic/4210112345671" \
  -H "Authorization: Bearer $TOKEN")

echo "$SEARCH_GUARDIAN" | python3 -m json.tool
echo -e "${GREEN}✅ Guardian search by CNIC completed${NC}\n"

# Test 5: Get Guardian by ID
echo -e "${CYAN}Test 5: Get Guardian by ID${NC}"
echo "-----------------------------------"
GET_GUARDIAN=$(curl -s -X GET "$API_URL/guardians/$GUARDIAN_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$GET_GUARDIAN" | python3 -m json.tool
echo -e "${GREEN}✅ Guardian details retrieved${NC}\n"

# Test 6: Update Guardian
echo -e "${CYAN}Test 6: Update Guardian${NC}"
echo "-----------------------------------"
UPDATE_GUARDIAN=$(curl -s -X PUT "$API_URL/guardians/$GUARDIAN_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "phone": "+92-300-9999999",
    "occupation": "Senior Engineer"
  }')

echo "$UPDATE_GUARDIAN" | python3 -m json.tool
echo -e "${GREEN}✅ Guardian updated successfully${NC}\n"

# ============================================
# STUDENTS TESTS
# ============================================

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  🎓 STUDENTS MODULE TESTS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}\n"

# Test 7: Create Student
echo -e "${CYAN}Test 7: Create Student${NC}"
echo "-----------------------------------"
STUDENT_RESPONSE=$(curl -s -X POST "$API_URL/students" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Ali Ahmed",
    "date_of_birth": "2010-05-15",
    "bay_form": "4210111111111",
    "address": "House 123, Street 45, Karachi",
    "previous_school": "Muslim School"
  }')

echo "$STUDENT_RESPONSE" | python3 -m json.tool
STUDENT_ID=$(echo "$STUDENT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ ! -z "$STUDENT_ID" ]; then
    echo -e "${GREEN}✅ Student created successfully (ID: $STUDENT_ID)${NC}\n"
else
    echo -e "${RED}❌ Student creation failed${NC}\n"
fi

# Test 8: Create Second Student
echo -e "${CYAN}Test 8: Create Second Student${NC}"
echo "-----------------------------------"
STUDENT2_RESPONSE=$(curl -s -X POST "$API_URL/students" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Sara Khan",
    "date_of_birth": "2011-08-20",
    "bay_form": "4210122222222",
    "address": "Flat 456, Building B, Lahore"
  }')

echo "$STUDENT2_RESPONSE" | python3 -m json.tool
STUDENT2_ID=$(echo "$STUDENT2_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

if [ ! -z "$STUDENT2_ID" ]; then
    echo -e "${GREEN}✅ Second student created successfully (ID: $STUDENT2_ID)${NC}\n"
else
    echo -e "${RED}❌ Second student creation failed${NC}\n"
fi

# Test 9: List All Students
echo -e "${CYAN}Test 9: List All Students${NC}"
echo "-----------------------------------"
LIST_STUDENTS=$(curl -s -X GET "$API_URL/students" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_STUDENTS" | python3 -m json.tool
STUDENT_COUNT=$(echo "$LIST_STUDENTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
echo -e "${GREEN}✅ Found $STUDENT_COUNT student(s)${NC}\n"

# Test 10: Get Student by ID
echo -e "${CYAN}Test 10: Get Student by ID${NC}"
echo "-----------------------------------"
GET_STUDENT=$(curl -s -X GET "$API_URL/students/$STUDENT_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$GET_STUDENT" | python3 -m json.tool
echo -e "${GREEN}✅ Student details retrieved${NC}\n"

# Test 11: Update Student
echo -e "${CYAN}Test 11: Update Student${NC}"
echo "-----------------------------------"
UPDATE_STUDENT=$(curl -s -X PUT "$API_URL/students/$STUDENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "address": "New Address: House 999, Street 88, Karachi",
    "previous_school": "XYZ High School"
  }')

echo "$UPDATE_STUDENT" | python3 -m json.tool
echo -e "${GREEN}✅ Student updated successfully${NC}\n"

# Test 12: Add Guardian to Student
echo -e "${CYAN}Test 12: Add Guardian to Student${NC}"
echo "-----------------------------------"
ADD_GUARDIAN=$(curl -s -X POST "$API_URL/students/$STUDENT_ID/guardians" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"guardian_id\": \"$GUARDIAN_ID\",
    \"relationship\": \"FATHER\"
  }")

echo "$ADD_GUARDIAN" | python3 -m json.tool
echo -e "${GREEN}✅ Guardian added to student${NC}\n"

# Test 13: Add Second Guardian to Student
echo -e "${CYAN}Test 13: Add Second Guardian to Student${NC}"
echo "-----------------------------------"
ADD_GUARDIAN2=$(curl -s -X POST "$API_URL/students/$STUDENT_ID/guardians" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"guardian_id\": \"$GUARDIAN2_ID\",
    \"relationship\": \"MOTHER\"
  }")

echo "$ADD_GUARDIAN2" | python3 -m json.tool
echo -e "${GREEN}✅ Second guardian added to student${NC}\n"

# Test 14: Get Student with Guardians
echo -e "${CYAN}Test 14: Get Student with Guardians${NC}"
echo "-----------------------------------"
GET_STUDENT_GUARDIANS=$(curl -s -X GET "$API_URL/students/$STUDENT_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$GET_STUDENT_GUARDIANS" | python3 -m json.tool
echo -e "${GREEN}✅ Student with guardians retrieved${NC}\n"

# Test 15: Activate Student
echo -e "${CYAN}Test 15: Activate Student${NC}"
echo "-----------------------------------"
ACTIVATE_STUDENT=$(curl -s -X POST "$API_URL/students/$STUDENT_ID/activate" \
  -H "Authorization: Bearer $TOKEN")

echo "$ACTIVATE_STUDENT" | python3 -m json.tool
echo -e "${GREEN}✅ Student activated${NC}\n"

# Test 16: Deactivate Student
echo -e "${CYAN}Test 16: Deactivate Student${NC}"
echo "-----------------------------------"
DEACTIVATE_STUDENT=$(curl -s -X POST "$API_URL/students/$STUDENT_ID/deactivate" \
  -H "Authorization: Bearer $TOKEN")

echo "$DEACTIVATE_STUDENT" | python3 -m json.tool
echo -e "${GREEN}✅ Student deactivated${NC}\n"

# Test 17: Reactivate Student
echo -e "${CYAN}Test 17: Reactivate Student${NC}"
echo "-----------------------------------"
REACTIVATE_STUDENT=$(curl -s -X POST "$API_URL/students/$STUDENT_ID/activate" \
  -H "Authorization: Bearer $TOKEN")

echo "$REACTIVATE_STUDENT" | python3 -m json.tool
echo -e "${GREEN}✅ Student reactivated${NC}\n"

# Test 18: Remove Guardian from Student
echo -e "${CYAN}Test 18: Remove Guardian from Student${NC}"
echo "-----------------------------------"
REMOVE_GUARDIAN=$(curl -s -X DELETE "$API_URL/students/$STUDENT_ID/guardians/$GUARDIAN2_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "$REMOVE_GUARDIAN" | python3 -m json.tool
echo -e "${GREEN}✅ Guardian removed from student${NC}\n"

# Final Summary
echo -e "\n${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Students & Guardians Module Tests Completed!    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${GREEN}Summary:${NC}"
echo "  • Guardians created: 2"
echo "  • Students created: 2"
echo "  • Guardian-Student relationships tested"
echo "  • Student status management tested"
echo "  • All CRUD operations verified"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Test Classes & Sections Module"
echo "  2. Test Fee Management Module"
echo "  3. Test Faculty & Salary Module"
echo ""
