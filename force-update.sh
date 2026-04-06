#!/bin/bash

# Force Update Script
# This script helps ensure users get the latest version with automatic updates!

echo "🚀 ampOS Deployment Script"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}✨ Automatic Update System Active!${NC}"
echo "Users will automatically get the new version within 5 minutes."
echo ""

echo -e "${BLUE}Step 1: Building application...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Build failed. Please fix errors before deploying.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"
echo -e "${GREEN}✅ Version file auto-generated!${NC}"
echo ""

# Show version info
if [ -f "dist/version.json" ]; then
    echo -e "${BLUE}📦 Version Information:${NC}"
    cat dist/version.json | grep -E "version|buildDate" | sed 's/^/  /'
    echo ""
fi

echo -e "${BLUE}Step 2: Deployment checklist...${NC}"
echo ""
echo "Before deploying, ensure:"
echo "  ☐ All changes are committed to git"
echo "  ☐ Tests are passing"
echo "  ☐ You have deployment credentials ready"
echo ""

echo -e "${GREEN}✅ Ready to deploy!${NC}"
echo ""
echo "Deploy with your preferred method:"
echo "  • Netlify: netlify deploy --prod"
echo "  • Vercel: vercel --prod"
echo "  • Manual: Upload the 'dist' folder to your server"
echo ""

echo -e "${PURPLE}🎉 Automatic Update System Benefits:${NC}"
echo "  ✅ Users auto-update within 5 minutes"
echo "  ✅ No manual cache clearing needed"
echo "  ✅ Beautiful update notifications"
echo "  ✅ Zero support tickets about cache issues"
echo ""

echo -e "${YELLOW}📝 Note for current users with cache issues:${NC}"
echo "  First-time fix: Direct them to https://your-domain.com/clear-cache.html"
echo "  After that: Automatic updates forever!"
echo ""

