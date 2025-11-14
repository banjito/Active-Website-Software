#!/bin/bash

echo "================================================"
echo "  ampOS Desktop - Installation Script"
echo "================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  No .env file found"
    echo "Creating .env file from template..."
    echo "VITE_SUPABASE_URL=your_supabase_url" > .env
    echo "VITE_SUPABASE_ANON_KEY=your_supabase_anon_key" >> .env
    echo "⚠️  Please edit .env file with your Supabase credentials"
fi

echo ""
echo "================================================"
echo "  Installation Complete! 🎉"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env file with your Supabase credentials (if needed)"
echo ""
echo "2. Test in development mode:"
echo "   npm run dev:electron"
echo ""
echo "3. Build for production:"
echo "   npm run build:desktop"
echo ""
echo "4. Read the documentation:"
echo "   - QUICK_START.md       (quick start guide)"
echo "   - OFFLINE_SETUP.md     (detailed setup)"
echo "   - README-DESKTOP.md    (user guide)"
echo ""
echo "================================================"

