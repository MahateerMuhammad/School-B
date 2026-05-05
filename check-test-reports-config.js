const fs = require('fs');
const path = require('path');

console.log('🔍 Checking test-reports upload configuration...\n');

// Check uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads', 'test-reports');
console.log('Upload directory:', uploadsDir);

try {
  if (fs.existsSync(uploadsDir)) {
    console.log('✅ Directory exists');
    
    // Check if writable
    const testFile = path.join(uploadsDir, '.test-write');
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log('✅ Directory is writable');
    } catch (err) {
      console.log('❌ Directory is NOT writable:', err.message);
    }
    
    // List files
    const files = fs.readdirSync(uploadsDir);
    console.log(`📁 Files in directory: ${files.length}`);
    if (files.length > 0) {
      console.log('Recent files:');
      files.slice(0, 5).forEach(file => {
        const stats = fs.statSync(path.join(uploadsDir, file));
        console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      });
    }
  } else {
    console.log('⚠️  Directory does not exist, creating...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Directory created');
  }
} catch (err) {
  console.log('❌ Error:', err.message);
}

console.log('\n📋 Summary:');
console.log('- Upload directory configured: uploads/test-reports/');
console.log('- Accepted file types: JPEG, PNG, PDF');
console.log('- File size limit: 10MB');
console.log('- Route: POST /api/test-reports (with auth)');
