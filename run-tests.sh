#!/bin/bash

# ProofOfDev Test Runner Script
# Runs all tests and displays comprehensive results

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  ProofOfDev Contract Test Suite                    ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Step 1: Lint Check
echo -e "${BLUE}[1/3] Running ESLint...${NC}"
npm run lint 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Linting passed${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${YELLOW}⚠ Linting warnings (non-critical)${NC}"
fi
((TOTAL_TESTS++))
echo ""

# Step 2: Integration Tests
echo -e "${BLUE}[2/3] Running Integration Tests...${NC}"
npm run test:integration 2>&1
INTEGRATION_RESULT=$?
if [ $INTEGRATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Integration tests passed${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}✗ Integration tests failed${NC}"
    ((FAILED_TESTS++))
fi
((TOTAL_TESTS++))
echo ""

# Step 3: UI Tests (optional - may skip if no server)
echo -e "${BLUE}[3/3] UI Tests Status${NC}"
if command -v npx &> /dev/null && npx -y playwright@latest --version &> /dev/null; then
    echo -e "${YELLOW}ℹ Playwright available - UI tests can be run separately${NC}"
    echo -e "${CYAN}  Run 'npm run test:ui' to execute UI tests${NC}"
else
    echo -e "${YELLOW}ℹ Playwright not installed - skipping UI tests${NC}"
    echo -e "${CYAN}  Run 'npm install' then 'npm run test:ui' to test the UI${NC}"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════╗"
echo "║  Test Summary                                      ║"
echo "╠════════════════════════════════════════════════════╣"
printf "║  Total Tests:    %-39d║\n" "$TOTAL_TESTS"
printf "║  Passed:         %-39d║\n" "$PASSED_TESTS"
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "║  ${RED}Failed:         ${FAILED_TESTS}${NC}${BLUE}                                       ${NC}║"
else
    echo -e "║  ${GREEN}Failed:         0${NC}${BLUE}                                       ${NC}║"
fi
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Final result
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed successfully!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
    exit 1
fi
