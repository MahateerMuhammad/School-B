const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

module.exports = r2Client;
