const fs = require('fs');

const filePath = './src/app/portal/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Define all portal names that need wrapping
const portals = [
  { name: 'Georgia Division', comment: 'Georgia Division' },
  { name: 'International Division', comment: 'International Portal' },
  { name: 'Field Technician Portal', comment: 'Field Technician Portal (Aggregated)' },
  { name: 'Calibration Lab', comment: 'Calibration Division' },
  { name: 'Armadillo Lab', comment: 'Armadillo Division' },
  { name: 'Scavenger Portal', comment: 'Scavenger Portal' },
  { name: 'HR Portal', comment: 'HR Portal' },
  { name: 'Office Admins Portal', comment: 'Office Admins Portal' },
  { name: 'Sales Portal', comment: 'Sales Portal' },
  { name: 'Engineering Portal', comment: 'Engineering Portal' },
  { name: 'Admin Portal', comment: 'Admin Portal' },
  { name: 'Runway Meeting Portal', comment: 'Runway Meeting Portal' }
];

// For each portal, wrap it with PortalCardWrapper
portals.forEach(({ name, comment }) => {
  // Pattern to match: {/* Comment */}\n              <Card
  const commentPattern = new RegExp(`(\\{/\\* ${comment} \\*/\\}\\s*\\n)(\\s*)<Card className="border`, 'g');
  
  content = content.replace(commentPattern, (match, commentPart, spaces) => {
    return `${commentPart}${spaces}<PortalCardWrapper portalName="${name}">\n${spaces}<Card className="border`;
  });
  
  // Now find the closing </Card> for each portal and add </PortalCardWrapper>
  // We'll do this by finding each Card and adding the wrapper close after its </Card>
});

// More targeted approach: find each portal card block and wrap it
portals.forEach(({ name, comment }) => {
  // Find the pattern for this specific portal's closing tag
  // This is tricky because we need to match the right </Card>
  
  // Let's use a different approach: find the comment, then find the next </Card> after CardFooter
  const regex = new RegExp(
    `(\\{/\\* ${comment.replace(/[()]/g, '\\$&')} \\*/\\}[\\s\\S]*?</CardFooter>\\s*\\n)(\\s*)(</Card>)`,
    'g'
  );
  
  content = content.replace(regex, (match, beforeCard, spaces, cardClose) => {
    return `${beforeCard}${spaces}${cardClose}\n${spaces}</PortalCardWrapper>`;
  });
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Portal cards wrapped successfully!');

