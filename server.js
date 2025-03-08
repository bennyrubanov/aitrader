
const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// For all GET requests, send back index.html
// so that pathnames can be handled by client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
