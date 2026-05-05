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
TEMP_DIR="/tmp/school_test_files"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 File Upload (R2) Module - API Testing           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Create temporary directory for test files
mkdir -p $TEMP_DIR

# Create test files
echo -e "${BLUE}📁 Creating test files...${NC}"
echo "This is a test PDF document" > "$TEMP_DIR/test_document.pdf"
echo "Test image content" > "$TEMP_DIR/test_image.jpg"
echo "Student report card content" > "$TEMP_DIR/report_card.pdf"
echo "Medical certificate content" > "$TEMP_DIR/medical_cert.pdf"
echo -e "${GREEN}✅ Test files created${NC}\n"

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

# Get a student ID for testing (create one if needed)
echo -e "${BLUE}📝 Getting/Creating test student...${NC}"
STUDENTS_RESPONSE=$(curl -s -X GET "$BASE_URL/students?limit=1" \
  -H "Authorization: Bearer $TOKEN")

STUDENT_ID=$(echo $STUDENTS_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data'][0]['id'] if data.get('data') and len(data['data']) > 0 else '')" 2>/dev/null)

if [ -z "$STUDENT_ID" ]; then
  echo -e "${YELLOW}No students found, creating test student...${NC}"
  CREATE_STUDENT=$(curl -s -X POST "$BASE_URL/students" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Student for Documents",
      "date_of_birth": "2010-01-15",
      "phone": "03001234567",
      "address": "Test Address",
      "class_id": 1,
      "section_id": 1
    }')
  STUDENT_ID=$(echo $CREATE_STUDENT | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['student']['id'])" 2>/dev/null)
fi

echo -e "${GREEN}✅ Using student ID: $STUDENT_ID${NC}\n"

#############################################
# DOCUMENT UPLOAD TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📤 DOCUMENT UPLOAD TESTS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 1: Upload single document
echo -e "${YELLOW}Test 1: Upload Single Document (Report Card)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/students/$STUDENT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "document=@$TEMP_DIR/report_card.pdf" \
  -F "document_type=REPORT_CARD" \
  -F "description=Q1 2026 Report Card")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  DOCUMENT_ID_1=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['document']['id'])" 2>/dev/null)
  echo -e "${GREEN}✅ Document uploaded (ID: $DOCUMENT_ID_1)${NC}\n"
else
  echo -e "${RED}❌ Document upload failed${NC}\n"
fi

# Test 2: Upload another document
echo -e "${YELLOW}Test 2: Upload Another Document (Medical Certificate)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/students/$STUDENT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "document=@$TEMP_DIR/medical_cert.pdf" \
  -F "document_type=MEDICAL" \
  -F "description=Medical Checkup Jan 2026")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  DOCUMENT_ID_2=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['document']['id'])" 2>/dev/null)
  echo -e "${GREEN}✅ Document uploaded (ID: $DOCUMENT_ID_2)${NC}\n"
else
  echo -e "${RED}❌ Document upload failed${NC}\n"
fi

# Test 3: Upload document without file (should fail)
echo -e "${YELLOW}Test 3: Upload Without File (Should Fail)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/students/$STUDENT_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "document_type=OTHER" \
  -F "description=Test")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":false'; then
  echo -e "${GREEN}✅ Correctly rejected upload without file${NC}\n"
else
  echo -e "${RED}❌ Should have failed${NC}\n"
fi

# Test 4: Upload to non-existent student (should fail)
echo -e "${YELLOW}Test 4: Upload to Non-existent Student (Should Fail)${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/students/99999/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "document=@$TEMP_DIR/test_document.pdf" \
  -F "document_type=OTHER")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":false'; then
  echo -e "${GREEN}✅ Correctly rejected upload to non-existent student${NC}\n"
else
  echo -e "${RED}❌ Should have failed${NC}\n"
fi

#############################################
# DOCUMENT RETRIEVAL TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📥 DOCUMENT RETRIEVAL TESTS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 5: Get all documents for student
echo -e "${YELLOW}Test 5: Get All Documents for Student${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/students/$STUDENT_ID/documents" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  DOC_COUNT=$(echo $RESPONSE | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('data', [])))" 2>/dev/null)
  echo -e "${GREEN}✅ Retrieved $DOC_COUNT document(s)${NC}\n"
else
  echo -e "${RED}❌ Failed to retrieve documents${NC}\n"
fi

# Test 6: Get document by ID
echo -e "${YELLOW}Test 6: Get Document by ID${NC}"
echo "-----------------------------------"
if [ ! -z "$DOCUMENT_ID_1" ]; then
  RESPONSE=$(curl -s -X GET "$BASE_URL/documents/$DOCUMENT_ID_1" \
    -H "Authorization: Bearer $TOKEN")
  echo $RESPONSE | python3 -m json.tool
  if echo $RESPONSE | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Document details retrieved${NC}\n"
  else
    echo -e "${RED}❌ Failed to retrieve document${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no document ID from previous tests)${NC}\n"
fi

# Test 7: Get signed URL for document
echo -e "${YELLOW}Test 7: Get Signed URL for Document${NC}"
echo "-----------------------------------"
if [ ! -z "$DOCUMENT_ID_1" ]; then
  RESPONSE=$(curl -s -X GET "$BASE_URL/documents/$DOCUMENT_ID_1/url" \
    -H "Authorization: Bearer $TOKEN")
  echo $RESPONSE | python3 -m json.tool
  if echo $RESPONSE | grep -q '"success":true'; then
    SIGNED_URL=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['url'])" 2>/dev/null)
    echo -e "${GREEN}✅ Signed URL generated${NC}"
    echo -e "${BLUE}URL length: ${#SIGNED_URL} chars${NC}\n"
  else
    echo -e "${RED}❌ Failed to generate signed URL${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no document ID from previous tests)${NC}\n"
fi

#############################################
# DOCUMENT UPDATE/DELETE TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  ✏️  DOCUMENT UPDATE & DELETE TESTS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 8: Update document details
echo -e "${YELLOW}Test 8: Update Document Details${NC}"
echo "-----------------------------------"
if [ ! -z "$DOCUMENT_ID_1" ]; then
  RESPONSE=$(curl -s -X PUT "$BASE_URL/documents/$DOCUMENT_ID_1" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "document_type": "REPORT_CARD",
      "description": "Q1 2026 Report Card (Updated)"
    }')
  echo $RESPONSE | python3 -m json.tool
  if echo $RESPONSE | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Document updated${NC}\n"
  else
    echo -e "${RED}❌ Failed to update document${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no document ID from previous tests)${NC}\n"
fi

# Test 9: Delete document
echo -e "${YELLOW}Test 9: Delete Document${NC}"
echo "-----------------------------------"
if [ ! -z "$DOCUMENT_ID_2" ]; then
  RESPONSE=$(curl -s -X DELETE "$BASE_URL/documents/$DOCUMENT_ID_2" \
    -H "Authorization: Bearer $TOKEN")
  echo $RESPONSE | python3 -m json.tool
  if echo $RESPONSE | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Document deleted${NC}\n"
  else
    echo -e "${RED}❌ Failed to delete document${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no document ID from previous tests)${NC}\n"
fi

# Test 10: Try to get deleted document (should fail)
echo -e "${YELLOW}Test 10: Get Deleted Document (Should Fail)${NC}"
echo "-----------------------------------"
if [ ! -z "$DOCUMENT_ID_2" ]; then
  RESPONSE=$(curl -s -X GET "$BASE_URL/documents/$DOCUMENT_ID_2" \
    -H "Authorization: Bearer $TOKEN")
  echo $RESPONSE | python3 -m json.tool
  if echo $RESPONSE | grep -q '"success":false'; then
    echo -e "${GREEN}✅ Correctly returned error for deleted document${NC}\n"
  else
    echo -e "${RED}❌ Should have failed${NC}\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no document ID from previous tests)${NC}\n"
fi

#############################################
# DOCUMENT STATISTICS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📊 DOCUMENT STATISTICS"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 11: Get document statistics
echo -e "${YELLOW}Test 11: Get Document Statistics${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s -X GET "$BASE_URL/stats" \
  -H "Authorization: Bearer $TOKEN")
echo $RESPONSE | python3 -m json.tool
if echo $RESPONSE | grep -q '"success":true'; then
  echo -e "${GREEN}✅ Statistics retrieved${NC}\n"
else
  echo -e "${RED}❌ Failed to retrieve statistics${NC}\n"
fi

#############################################
# CLEANUP
#############################################

echo -e "${BLUE}🧹 Cleaning up test files...${NC}"
rm -rf $TEMP_DIR
echo -e "${GREEN}✅ Cleanup complete${NC}\n"

#############################################
# SUMMARY
#############################################

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ File Upload (R2) Module Tests Completed!        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${GREEN}Tested Features:${NC}"
echo "  ${CYAN}Document Upload:${NC}"
echo "    ✓ Single document upload"
echo "    ✓ Multiple document upload"
echo "    ✓ Upload validation (missing file)"
echo "    ✓ Upload validation (non-existent student)"
echo ""
echo "  ${CYAN}Document Retrieval:${NC}"
echo "    ✓ List all documents for student"
echo "    ✓ Get document by ID"
echo "    ✓ Generate signed URL for download"
echo ""
echo "  ${CYAN}Document Management:${NC}"
echo "    ✓ Update document details"
echo "    ✓ Delete document"
echo "    ✓ Verify deleted document not accessible"
echo ""
echo "  ${CYAN}Statistics:${NC}"
echo "    ✓ Get document statistics"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review file storage in Cloudflare R2 bucket"
echo "  2. Test file download functionality manually"
echo "  3. Monitor storage usage and costs"
echo "  4. Consider implementing file size limits per student"
