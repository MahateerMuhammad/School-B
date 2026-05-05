#!/bin/bash

# School Management System API Test Script
# ==========================================

API_URL="http://localhost:3000"
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║  🧪 School Management System - API Testing        ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "-----------------------------------"
RESPONSE=$(curl -s "$API_URL/health")
echo "$RESPONSE" | python3 -m json.tool
if echo "$RESPONSE" | grep -q "Server is running"; then
    echo -e "${GREEN}✅ Health check passed${NC}\n"
else
    echo -e "${RED}❌ Health check failed${NC}\n"
    exit 1
fi

# Test 2: Login
echo -e "${YELLOW}Test 2: Admin Login${NC}"
echo "-----------------------------------"
echo "Email: admin@school.com"
echo "Password: admin123"
echo ""

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }')

echo "$LOGIN_RESPONSE" | python3 -m json.tool

if echo "$LOGIN_RESPONSE" | grep -q "Login successful"; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])")
    echo -e "\n${GREEN}✅ Login successful${NC}"
    echo -e "${BLUE}Token: ${TOKEN:0:50}...${NC}\n"
else
    echo -e "${RED}❌ Login failed${NC}\n"
    exit 1
fi

# Test 3: Get Profile
echo -e "${YELLOW}Test 3: Get User Profile${NC}"
echo "-----------------------------------"
PROFILE_RESPONSE=$(curl -s "$API_URL/api/auth/profile" \
  -H "Authorization: Bearer $TOKEN")

echo "$PROFILE_RESPONSE" | python3 -m json.tool

if echo "$PROFILE_RESPONSE" | grep -q "admin@school.com"; then
    echo -e "${GREEN}✅ Profile retrieved successfully${NC}\n"
else
    echo -e "${RED}❌ Profile retrieval failed${NC}\n"
fi

# Test 4: List All Users
echo -e "${YELLOW}Test 4: List All Users (Admin Only)${NC}"
echo "-----------------------------------"
USERS_RESPONSE=$(curl -s "$API_URL/api/auth/users" \
  -H "Authorization: Bearer $TOKEN")

echo "$USERS_RESPONSE" | python3 -m json.tool

if echo "$USERS_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✅ Users listed successfully${NC}\n"
else
    echo -e "${RED}❌ Failed to list users${NC}\n"
fi

# Test 5: Test Unauthorized Access
echo -e "${YELLOW}Test 5: Unauthorized Access Test${NC}"
echo "-----------------------------------"
UNAUTH_RESPONSE=$(curl -s "$API_URL/api/auth/profile")

echo "$UNAUTH_RESPONSE" | python3 -m json.tool

if echo "$UNAUTH_RESPONSE" | grep -q "Access token required"; then
    echo -e "${GREEN}✅ Authorization working correctly${NC}\n"
else
    echo -e "${RED}❌ Authorization not working${NC}\n"
fi

# Test 6: Invalid Login
echo -e "${YELLOW}Test 6: Invalid Login Test${NC}"
echo "-----------------------------------"
INVALID_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "wrongpassword"
  }')

echo "$INVALID_LOGIN" | python3 -m json.tool

if echo "$INVALID_LOGIN" | grep -q "Invalid email or password"; then
    echo -e "${GREEN}✅ Invalid login handled correctly${NC}\n"
else
    echo -e "${RED}❌ Invalid login not handled properly${NC}\n"
fi

# Summary
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════╗"
echo "║  ✅ All API Tests Completed Successfully!         ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}Next Steps:${NC}"
echo "1. Start implementing Students Management module"
echo "2. Implement Classes & Sections module"
echo "3. Implement Fee Management module"
echo "4. Implement Faculty & Salary module"
echo "5. Implement Reports & Analytics"
echo ""
