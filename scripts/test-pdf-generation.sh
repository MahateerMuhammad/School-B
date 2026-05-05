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
PDF_DIR="/tmp/school_test_pdfs"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🧪 PDF Generation Module - API Testing             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Create directory for downloaded PDFs
mkdir -p $PDF_DIR

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
# GET TEST DATA IDS
#############################################

echo -e "${BLUE}📋 Getting test data IDs...${NC}"

# Get a fee voucher ID
VOUCHER_RESPONSE=$(curl -s -X GET "$BASE_URL/vouchers?limit=1" \
  -H "Authorization: Bearer $TOKEN")
FEE_VOUCHER_ID=$(echo $VOUCHER_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data'][0]['voucher_id'] if data.get('data') and len(data['data']) > 0 else '')" 2>/dev/null)

# Get a fee payment ID
PAYMENT_RESPONSE=$(curl -s -X GET "$BASE_URL/fees/payments?limit=1" \
  -H "Authorization: Bearer $TOKEN")
FEE_PAYMENT_ID=$(echo $PAYMENT_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data'][0]['id'] if data.get('data') and len(data['data']) > 0 else '')" 2>/dev/null)

# Get a salary voucher ID
SALARY_RESPONSE=$(curl -s -X GET "$BASE_URL/salaries/vouchers?limit=1" \
  -H "Authorization: Bearer $TOKEN")
SALARY_VOUCHER_ID=$(echo $SALARY_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['data'][0]['id'] if data.get('data') and len(data['data']) > 0 else '')" 2>/dev/null)

echo -e "${GREEN}✅ Test data retrieved:${NC}"
echo -e "   Fee Voucher ID: ${FEE_VOUCHER_ID:-Not found}"
echo -e "   Fee Payment ID: ${FEE_PAYMENT_ID:-Not found}"
echo -e "   Salary Voucher ID: ${SALARY_VOUCHER_ID:-Not found}\n"

#############################################
# FEE VOUCHER PDF TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  📄 FEE VOUCHER PDF GENERATION"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 1: Generate Fee Voucher PDF
echo -e "${YELLOW}Test 1: Generate Fee Voucher PDF${NC}"
echo "-----------------------------------"
if [ ! -z "$FEE_VOUCHER_ID" ]; then
  HTTP_CODE=$(curl -s -o "$PDF_DIR/fee_voucher_$FEE_VOUCHER_ID.pdf" -w "%{http_code}" \
    -X GET "$BASE_URL/vouchers/$FEE_VOUCHER_ID/pdf" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$HTTP_CODE" = "200" ]; then
    FILE_SIZE=$(ls -lh "$PDF_DIR/fee_voucher_$FEE_VOUCHER_ID.pdf" | awk '{print $5}')
    echo -e "${GREEN}✅ Fee voucher PDF generated${NC}"
    echo -e "   HTTP Status: $HTTP_CODE"
    echo -e "   File: $PDF_DIR/fee_voucher_$FEE_VOUCHER_ID.pdf"
    echo -e "   Size: $FILE_SIZE"
    
    # Verify it's a valid PDF
    if file "$PDF_DIR/fee_voucher_$FEE_VOUCHER_ID.pdf" | grep -q "PDF"; then
      echo -e "${GREEN}   ✓ Valid PDF format${NC}\n"
    else
      echo -e "${RED}   ✗ Invalid PDF format${NC}\n"
    fi
  else
    echo -e "${RED}❌ Failed to generate fee voucher PDF${NC}"
    echo -e "   HTTP Status: $HTTP_CODE\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no fee voucher found)${NC}\n"
fi

# Test 2: Generate Fee Voucher PDF for non-existent voucher
echo -e "${YELLOW}Test 2: Generate PDF for Non-existent Voucher (Should Fail)${NC}"
echo "-----------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$BASE_URL/vouchers/99999/pdf" \
  -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✅ Correctly rejected non-existent voucher${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
else
  echo -e "${RED}❌ Should have failed${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
fi

#############################################
# PAYMENT RECEIPT PDF TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  🧾 PAYMENT RECEIPT PDF GENERATION"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 3: Generate Payment Receipt PDF
echo -e "${YELLOW}Test 3: Generate Payment Receipt PDF${NC}"
echo "-----------------------------------"
if [ ! -z "$FEE_PAYMENT_ID" ]; then
  HTTP_CODE=$(curl -s -o "$PDF_DIR/payment_receipt_$FEE_PAYMENT_ID.pdf" -w "%{http_code}" \
    -X GET "$BASE_URL/fees/payment/$FEE_PAYMENT_ID/receipt" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$HTTP_CODE" = "200" ]; then
    FILE_SIZE=$(ls -lh "$PDF_DIR/payment_receipt_$FEE_PAYMENT_ID.pdf" | awk '{print $5}')
    echo -e "${GREEN}✅ Payment receipt PDF generated${NC}"
    echo -e "   HTTP Status: $HTTP_CODE"
    echo -e "   File: $PDF_DIR/payment_receipt_$FEE_PAYMENT_ID.pdf"
    echo -e "   Size: $FILE_SIZE"
    
    # Verify it's a valid PDF
    if file "$PDF_DIR/payment_receipt_$FEE_PAYMENT_ID.pdf" | grep -q "PDF"; then
      echo -e "${GREEN}   ✓ Valid PDF format${NC}\n"
    else
      echo -e "${RED}   ✗ Invalid PDF format${NC}\n"
    fi
  else
    echo -e "${RED}❌ Failed to generate payment receipt PDF${NC}"
    echo -e "   HTTP Status: $HTTP_CODE\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no payment found)${NC}\n"
fi

# Test 4: Generate Receipt for non-existent payment
echo -e "${YELLOW}Test 4: Generate Receipt for Non-existent Payment (Should Fail)${NC}"
echo "-----------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$BASE_URL/fees/payment/99999/receipt" \
  -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✅ Correctly rejected non-existent payment${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
else
  echo -e "${RED}❌ Should have failed${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
fi

#############################################
# SALARY SLIP PDF TESTS
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  💰 SALARY SLIP PDF GENERATION"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 5: Generate Salary Slip PDF
echo -e "${YELLOW}Test 5: Generate Salary Slip PDF${NC}"
echo "-----------------------------------"
if [ ! -z "$SALARY_VOUCHER_ID" ]; then
  HTTP_CODE=$(curl -s -o "$PDF_DIR/salary_slip_$SALARY_VOUCHER_ID.pdf" -w "%{http_code}" \
    -X GET "$BASE_URL/salaries/voucher/$SALARY_VOUCHER_ID/pdf" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$HTTP_CODE" = "200" ]; then
    FILE_SIZE=$(ls -lh "$PDF_DIR/salary_slip_$SALARY_VOUCHER_ID.pdf" | awk '{print $5}')
    echo -e "${GREEN}✅ Salary slip PDF generated${NC}"
    echo -e "   HTTP Status: $HTTP_CODE"
    echo -e "   File: $PDF_DIR/salary_slip_$SALARY_VOUCHER_ID.pdf"
    echo -e "   Size: $FILE_SIZE"
    
    # Verify it's a valid PDF
    if file "$PDF_DIR/salary_slip_$SALARY_VOUCHER_ID.pdf" | grep -q "PDF"; then
      echo -e "${GREEN}   ✓ Valid PDF format${NC}\n"
    else
      echo -e "${RED}   ✗ Invalid PDF format${NC}\n"
    fi
  else
    echo -e "${RED}❌ Failed to generate salary slip PDF${NC}"
    echo -e "   HTTP Status: $HTTP_CODE\n"
  fi
else
  echo -e "${YELLOW}⚠️  Skipped (no salary voucher found)${NC}\n"
fi

# Test 6: Generate Salary Slip for non-existent voucher
echo -e "${YELLOW}Test 6: Generate Salary Slip for Non-existent Voucher (Should Fail)${NC}"
echo "-----------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$BASE_URL/salaries/voucher/99999/pdf" \
  -H "Authorization: Bearer $TOKEN")

if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✅ Correctly rejected non-existent salary voucher${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
else
  echo -e "${RED}❌ Should have failed${NC}"
  echo -e "   HTTP Status: $HTTP_CODE\n"
fi

#############################################
# PDF FILE VERIFICATION
#############################################

echo -e "${CYAN}═══════════════════════════════════════"
echo -e "  ✅ PDF FILE VERIFICATION"
echo -e "═══════════════════════════════════════${NC}\n"

# Test 7: List all generated PDFs
echo -e "${YELLOW}Test 7: Verify All Generated PDFs${NC}"
echo "-----------------------------------"
PDF_COUNT=$(ls -1 "$PDF_DIR"/*.pdf 2>/dev/null | wc -l)
echo -e "${GREEN}Generated PDFs: $PDF_COUNT${NC}"

if [ "$PDF_COUNT" -gt 0 ]; then
  echo -e "\n${BLUE}PDF Files:${NC}"
  ls -lh "$PDF_DIR"/*.pdf | awk '{print "   " $9 " - " $5}'
  
  echo -e "\n${BLUE}PDF Validation:${NC}"
  for pdf in "$PDF_DIR"/*.pdf; do
    if file "$pdf" | grep -q "PDF"; then
      echo -e "   ${GREEN}✓${NC} $(basename $pdf) - Valid PDF"
    else
      echo -e "   ${RED}✗${NC} $(basename $pdf) - Invalid"
    fi
  done
  echo ""
fi

#############################################
# SUMMARY
#############################################

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ PDF Generation Module Tests Completed!          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

echo -e "${GREEN}Tested Features:${NC}"
echo "  ${CYAN}Fee Voucher PDFs:${NC}"
echo "    ✓ Generate fee voucher PDF"
echo "    ✓ Validate non-existent voucher handling"
echo ""
echo "  ${CYAN}Payment Receipt PDFs:${NC}"
echo "    ✓ Generate payment receipt PDF"
echo "    ✓ Validate non-existent payment handling"
echo ""
echo "  ${CYAN}Salary Slip PDFs:${NC}"
echo "    ✓ Generate salary slip PDF"
echo "    ✓ Validate non-existent voucher handling"
echo ""
echo "  ${CYAN}PDF Validation:${NC}"
echo "    ✓ Verify PDF file format"
echo "    ✓ Check file sizes"
echo ""
echo -e "${BLUE}Generated PDFs saved to: $PDF_DIR${NC}"
echo -e "${YELLOW}You can open and review these PDFs manually${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Open generated PDFs to verify content and layout"
echo "  2. Check PDF formatting and school branding"
echo "  3. Verify all calculated amounts are correct"
echo "  4. Test PDF generation with different data scenarios"
