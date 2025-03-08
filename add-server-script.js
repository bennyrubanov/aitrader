
// This script is a helper to add the server start script to package.json
// Run it with: node add-server-script.js
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = require(packageJsonPath);

// Add the server start script if it doesn't exist
if (!packageJson.scripts.serve) {
  packageJson.scripts.serve = 'node server.js';
  
  // Write the updated package.json
  fs.writeFileSync(
    packageJsonPath, 
    JSON.stringify(packageJson, null, 2) + '\n'
  );
  
  console.log('Added "serve" script to package.json');
} else {
  console.log('"serve" script already exists in package.json');
}
