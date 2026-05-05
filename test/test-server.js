const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Simple bulk endpoint for testing
app.post('/api/students/bulk', (req, res) => {
  console.log('🧪 Simple bulk endpoint hit!', {
    body: req.body,
    hasStudents: req.body?.students,
    studentsCount: req.body?.students?.length
  });
  
  res.json({ 
    success: true, 
    message: 'Test bulk endpoint working',
    receivedStudents: req.body?.students?.length || 0
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Test server working!' });
});

const port = 5001;
app.listen(port, () => {
  console.log(`🧪 Test server running on http://localhost:${port}`);
});