#!/bin/bash

echo "=== Forcing commit and push of fireteam lead changes ==="

# Add all changes
git add .

# Create a commit with timestamp to ensure it's unique
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
git commit -m "feat: Add fireteam lead functionality - $TIMESTAMP

- Replace Budget card with Fireteam Lead card in job overview
- Add user selection dropdown with search functionality  
- Include admin_get_users RPC integration
- Add fireteam_lead database field support
- Complete UI implementation matching admin panel design"

# Push to master branch
git push origin master

echo "=== Push completed ==="
echo "Check your deployment to see if changes are live"
echo "If still not working, try:"
echo "1. Hard refresh browser (Ctrl+Shift+R)"
echo "2. Check deployment logs"
echo "3. Verify database has fireteam_lead column"
