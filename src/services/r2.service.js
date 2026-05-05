const { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2Client = require('../config/r2');
const config = require('../config/env');
const crypto = require('crypto');
const path = require('path');

/**
 * R2 Service
 * Handles file upload, download, and deletion with Cloudflare R2
 */
class R2Service {
  /**
   * Generate unique file key
   */
  generateFileKey(originalName, folder = 'documents') {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9]/g, '_');
    
    return `${folder}/${timestamp}-${randomString}-${baseName}${extension}`;
  }

  /**
   * Upload file to R2
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - File MIME type
   * @param {String} folder - Folder path in bucket
   * @returns {Object} - { key, url, size }
   */
  async uploadFile(fileBuffer, originalName, mimeType, folder = 'documents') {
    try {
      const key = this.generateFileKey(originalName, folder);
      
      const command = new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        ContentLength: fileBuffer.length
      });

      await r2Client.send(command);

      return {
        key,
        url: `${config.r2.publicUrl}/${key}`,
        size: fileBuffer.length,
        originalName,
        mimeType
      };
    } catch (error) {
      throw new Error(`R2 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload multiple files
   * @param {Array} files - Array of file objects with buffer, originalName, mimeType
   * @param {String} folder - Folder path in bucket
   * @returns {Array} - Array of upload results
   */
  async uploadMultipleFiles(files, folder = 'documents') {
    try {
      const uploadPromises = files.map(file => 
        this.uploadFile(file.buffer, file.originalname, file.mimetype, folder)
      );
      
      return await Promise.all(uploadPromises);
    } catch (error) {
      throw new Error(`Multiple file upload failed: ${error.message}`);
    }
  }

  /**
   * Get signed URL for private file access
   * @param {String} key - File key in R2
   * @param {Number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {String} - Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      return await getSignedUrl(r2Client, command, { expiresIn });
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Download file from R2
   * @param {String} key - File key in R2
   * @returns {Object} - { body, contentType, contentLength }
   */
  async downloadFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      const response = await r2Client.send(command);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      return {
        body: buffer,
        contentType: response.ContentType,
        contentLength: response.ContentLength
      };
    } catch (error) {
      throw new Error(`R2 download failed: ${error.message}`);
    }
  }

  /**
   * Check if file exists in R2
   * @param {String} key - File key in R2
   * @returns {Boolean} - True if file exists
   */
  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      await r2Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw new Error(`R2 file check failed: ${error.message}`);
    }
  }

  /**
   * Delete file from R2
   * @param {String} key - File key in R2
   * @returns {Boolean} - True if deleted successfully
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      await r2Client.send(command);
      return true;
    } catch (error) {
      throw new Error(`R2 delete failed: ${error.message}`);
    }
  }

  /**
   * Delete multiple files
   * @param {Array} keys - Array of file keys
   * @returns {Array} - Array of deletion results
   */
  async deleteMultipleFiles(keys) {
    try {
      const deletePromises = keys.map(key => 
        this.deleteFile(key).catch(err => ({ key, error: err.message }))
      );
      
      return await Promise.all(deletePromises);
    } catch (error) {
      throw new Error(`Multiple file deletion failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   * @param {String} key - File key in R2
   * @returns {Object} - File metadata
   */
  async getFileMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      const response = await r2Client.send(command);

      return {
        key,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag
      };
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Validate file type
   * @param {String} mimeType - File MIME type
   * @param {Array} allowedTypes - Array of allowed MIME types
   * @returns {Boolean} - True if valid
   */
  validateFileType(mimeType, allowedTypes = []) {
    if (allowedTypes.length === 0) {
      // Default allowed types for school documents
      allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
    }

    return allowedTypes.includes(mimeType);
  }

  /**
   * Validate file size
   * @param {Number} size - File size in bytes
   * @param {Number} maxSize - Maximum allowed size in bytes (default: 5MB)
   * @returns {Boolean} - True if valid
   */
  validateFileSize(size, maxSize = 5 * 1024 * 1024) {
    return size <= maxSize;
  }

  /**
   * Get public URL for file
   * @param {String} key - File key in R2
   * @returns {String} - Public URL
   */
  getPublicUrl(key) {
    return `${config.r2.publicUrl}/${key}`;
  }
}

module.exports = new R2Service();
