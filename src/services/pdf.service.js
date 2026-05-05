const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

/**
 * PDF Service
 * Generates professional PDFs for vouchers, receipts, and reports
 */
class PDFService {
  constructor() {
    this.schoolName = 'Muslim Public Higher Secondary School';
    this.schoolAddress = 'Bahawalpur Road, Adda Laar';
    this.schoolPhone = '0300-6246297';
    this.schoolEmail = 'muslimpublichighersecondarysch@gmail.com';

    // Resolve logo path from known repository locations.
    const logoCandidates = [
      // Primary: backend-bundled asset for production environments (Render).
      path.resolve(__dirname, '../assets/logo.png'),
      // Fallbacks for local multi-folder workspace setups.
      path.resolve(__dirname, '../../../frontend/src/assets/logo.png'),
      path.resolve(__dirname, '../../../frontend/public/logo.png')
    ];
    this.logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  /**
   * Draw a very light centered logo in voucher background.
   */
  addVoucherBackgroundLogo(doc, x, y, width, height) {
    if (!this.logoPath) return;

    const size = Math.min(width, height) * 0.58;
    const logoX = x + (width - size) / 2;
    const logoY = y + (height - size) / 2;

    try {
      doc.save();
      doc.opacity(0.08);
      doc.image(this.logoPath, logoX, logoY, {
        fit: [size, size],
        align: 'center',
        valign: 'center'
      });
      doc.opacity(1);
      doc.restore();
    } catch (error) {
      // If image rendering fails, continue voucher generation without watermark.
    }
  }

  /**
   * Helper: Add header to PDF
   */
  addHeader(doc, title) {
    // School Name
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text(this.schoolName, { align: 'center' });
    
    // School Details
    doc.fontSize(10)
       .font('Helvetica')
       .text(this.schoolAddress, { align: 'center' })
       .text(`Phone: ${this.schoolPhone} | Email: ${this.schoolEmail}`, { align: 'center' });
    
    doc.moveDown(0.5);
    
    // Horizontal line
    doc.moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke();
    
    doc.moveDown(0.5);
    
    // Document Title
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(title, { align: 'center' });
    
    doc.moveDown(1);
  }

  /**
   * Helper: Add footer to PDF
   */
  addFooter(doc, pageNumber = 1) {
    const bottomY = 750;
    
    doc.fontSize(8)
       .font('Helvetica')
       .text(
         `Generated on: ${new Date().toLocaleDateString('en-PK', {
           weekday: 'long',
           year: 'numeric',
           month: 'long', 
           day: 'numeric'
         })} at ${new Date().toLocaleTimeString('en-PK', {
           hour: '2-digit',
           minute: '2-digit',
           hour12: true
         })} | Page ${pageNumber}`,
         50,
         bottomY,
         { align: 'center', width: 500 }
       );
    
    doc.moveTo(50, bottomY - 10)
       .lineTo(550, bottomY - 10)
       .stroke();
    
    doc.fontSize(8)
       .text('This is a computer-generated document. No signature required.', 50, bottomY + 10, {
         align: 'center',
         width: 500,
         italic: true
       });
  }

  /**
   * Helper: Draw compact voucher (for 4-per-page layout)
   */
  drawCompactVoucher(doc, voucherData, x, y, width, height) {
    const padding = 6;
    const contentX = x + padding;
    const contentY = y + padding;
    const contentWidth = width - (padding * 2);

    const items = Array.isArray(voucherData.items) ? voucherData.items : [];
    const payments = Array.isArray(voucherData.payments) ? voucherData.payments : [];

    // Auto-fit content inside fixed voucher boundaries.
    const infoRows = 8 + (voucherData.voucher_no ? 1 : 0) + (voucherData.father_name ? 1 : 0);
    const estimatedRows = infoRows + items.length + Math.max(payments.length, 0) + 8;
    const estimatedHeight = 60 + (estimatedRows * 10);
    const availableHeight = height - 12;
    const fitScale = Math.max(0.35, Math.min(1, availableHeight / Math.max(estimatedHeight, 1)));
    const fs = (n) => Number((n * fitScale).toFixed(2));

    const titleFont = fs(12);
    const schoolFont = fs(8);
    const bodyFont = fs(8);
    const tableHeadFont = fs(7.5);
    const tableBodyFont = fs(7.2);
    const strongFont = fs(8);
    const historyHeadFont = fs(6.5);
    const historyFont = fs(7);
    const noteFont = Math.max(6.8, fs(7.1));
    const lineHeight = fs(11);
    const rowHeight = fs(10);
    const smallGap = fs(2);
    const midGap = fs(3);
    const topSchoolOffset = fs(14);
    const topStartOffset = fs(27);
    
    // Draw border
    doc.rect(x, y, width, height).stroke();

    // Draw centered, light logo watermark behind voucher contents.
    this.addVoucherBackgroundLogo(doc, x, y, width, height);
    
    // Header
     doc.fontSize(titleFont)
       .font('Helvetica-Bold')
       .text('FEE VOUCHER', contentX, contentY, { width: contentWidth, align: 'center' });
    
     doc.fontSize(schoolFont)
       .font('Helvetica')
       .text(this.schoolName, contentX, contentY + topSchoolOffset, { width: contentWidth, align: 'center' });
    
     let currentY = contentY + topStartOffset;
    
    // Horizontal line
    doc.moveTo(contentX, currentY)
       .lineTo(contentX + contentWidth, currentY)
       .stroke();
    
    currentY += midGap;
    
    // Voucher details in compact format
    doc.fontSize(bodyFont).font('Helvetica');
    
    const labelWidth = Math.max(44, fs(56));
    const valueX = contentX + labelWidth;
    
    // Voucher number if available
    if (voucherData.voucher_no) {
      doc.font('Helvetica-Bold').text('Voucher#:', contentX, currentY);
      doc.font('Helvetica').text(voucherData.voucher_no, valueX, currentY);
      currentY += lineHeight;
    }
    
    // Student Name
    doc.font('Helvetica-Bold').text('Student:', contentX, currentY);
    doc.font('Helvetica').text(voucherData.student_name, valueX, currentY);
    currentY += lineHeight;
    
    // Father Name
    if (voucherData.father_name) {
      doc.font('Helvetica-Bold').text('Father:', contentX, currentY);
      doc.font('Helvetica').text(voucherData.father_name, valueX, currentY);
      currentY += lineHeight;
    }
    
    // Father Phone
    doc.font('Helvetica-Bold').text('F.Contact:', contentX, currentY);
    doc.font('Helvetica').text(voucherData.father_phone || 'Not Submitted', valueX, currentY);
    currentY += lineHeight;
    
    // Student serial number
    doc.font('Helvetica-Bold').text('Serial No:', contentX, currentY);
    doc.font('Helvetica').text(String(voucherData.serial_number || 'N/A'), valueX, currentY);
    currentY += lineHeight;
    
    // Class
    doc.font('Helvetica-Bold').text('Class:', contentX, currentY);
    doc.font('Helvetica').text(voucherData.class_name, valueX, currentY);
    currentY += lineHeight;

    // Section
    doc.font('Helvetica-Bold').text('Section:', contentX, currentY);
    doc.font('Helvetica').text(voucherData.section_name || 'N/A', valueX, currentY);
    currentY += lineHeight;
    
    // Month with enhanced formatting
    const monthStr = new Date(voucherData.month).toLocaleDateString('en-PK', { 
      month: 'long', 
      year: 'numeric' 
    });
    doc.font('Helvetica-Bold').text('Month/Year:', contentX, currentY);
    doc.font('Helvetica').text(monthStr, valueX, currentY);
    currentY += lineHeight;

    // Due date
    const dueDateStr = voucherData.due_date
      ? new Date(voucherData.due_date).toLocaleDateString('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      : 'N/A';
    doc.font('Helvetica-Bold').text('Due Date:', contentX, currentY);
    doc.font('Helvetica').text(dueDateStr, valueX, currentY);
    currentY += lineHeight + smallGap;
    
    // Fee items
    doc.moveTo(contentX, currentY)
       .lineTo(contentX + contentWidth, currentY)
       .stroke();
    currentY += smallGap;
    
    doc.fontSize(tableHeadFont).font('Helvetica-Bold');
    doc.text('Fee Description', contentX, currentY);
    doc.text('Amount', contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
    currentY += rowHeight;
    
    doc.moveTo(contentX, currentY)
       .lineTo(contentX + contentWidth, currentY)
       .stroke();
    currentY += smallGap;
    
    const defaultItemFontSize = tableBodyFont;
    const totalRowFontSize = Math.min(defaultItemFontSize * 3, fs(14));

    doc.fontSize(defaultItemFontSize).font('Helvetica');
    let totalAmount = 0;
    let billableAmount = 0;
    const voucherBottomY = y + height - padding;
    
    items.forEach(item => {
      const amount = parseFloat(item.amount);
      totalAmount += amount;
      billableAmount += amount;
      const feeLabel = (() => {
        if (item.item_type === 'CUSTOM' && item.description) return item.description;
        if (item.item_type === 'ARREARS') return item.description || 'Dues';
        return item.item_type.replace('_', ' ');
      })();
      doc.fontSize(defaultItemFontSize).font('Helvetica');
      doc.text(feeLabel, contentX, currentY, { width: contentWidth - 60 });
      doc.text(`Rs. ${amount.toFixed(0)}`, contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
      currentY += rowHeight;
    });
    
    // Total
    doc.moveTo(contentX, currentY)
       .lineTo(contentX + contentWidth, currentY)
       .stroke();
    currentY += smallGap;
    
    doc.fillColor('#000000').fontSize(totalRowFontSize).font('Helvetica-Bold');
    doc.text('Total Amount:', contentX, currentY);
    doc.text(`Rs. ${totalAmount.toFixed(0)}`, contentX + contentWidth - 120, currentY, { width: 120, align: 'right' });
    currentY += lineHeight + fs(6);

    // Show paid/pending totals
    const paidAmt = parseFloat(voucherData.paid_amount) || 0;
    const explicitBalance = parseFloat(voucherData.balance);
    const pendingAmt = Number.isFinite(explicitBalance)
      ? Math.max(explicitBalance, 0)
      : Math.max(billableAmount - paidAmt, 0);
    const isFullyPaid = pendingAmt <= 0.009;
    if (paidAmt > 0) {
      doc.moveTo(contentX, currentY).lineTo(contentX + contentWidth, currentY).stroke();
      currentY += midGap;

      if (!isFullyPaid) {
        doc.fontSize(tableBodyFont).font('Helvetica-Bold');
        doc.fillColor('#059669').text('Paid:', contentX, currentY);
        doc.text(`Rs. ${paidAmt.toFixed(0)}`, contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
        currentY += rowHeight;
        doc.fillColor('#dc2626').text('Pending:', contentX, currentY);
        doc.text(`Rs. ${pendingAmt.toFixed(0)}`, contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
        currentY += rowHeight;
        doc.fillColor('#000000');
      }

      // Payment History with dates — one row per payment
      if (payments.length > 0) {
        currentY += smallGap;
        doc.fontSize(tableBodyFont).font('Helvetica-Bold').fillColor('#000000');
        doc.text('Payment History:', contentX, currentY);
        currentY += rowHeight;

        // Header row
        doc.fontSize(historyHeadFont).font('Helvetica-Bold').fillColor('#555555');
        doc.text('#', contentX, currentY);
        doc.text('Date', contentX + 12, currentY);
        doc.text('Amount', contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
        currentY += fs(9);
        doc.moveTo(contentX, currentY).lineTo(contentX + contentWidth, currentY).stroke();
        currentY += smallGap;

        // One row per payment
        doc.fontSize(historyFont).font('Helvetica');
        payments.forEach((payment, idx) => {
          const amt = parseFloat(payment.amount);
          const dateStr = payment.payment_date
            ? new Date(payment.payment_date).toLocaleDateString('en-PK', {
                day: '2-digit', month: 'short', year: 'numeric'
              })
            : 'N/A';
          doc.fillColor('#333333').text(`${idx + 1}.`, contentX, currentY);
          doc.fillColor('#1e293b').text(dateStr, contentX + 12, currentY);
          doc.fillColor('#059669').font('Helvetica-Bold').text(`Rs. ${amt.toFixed(0)}`, contentX + contentWidth - 55, currentY, { width: 55, align: 'right' });
          doc.font('Helvetica');
          currentY += rowHeight;
        });
        doc.fillColor('#000000');
        currentY += fs(1);
      }
    } else {
      currentY += fs(0.5);
    }

    // Compact summary block to avoid large empty areas in low-item vouchers.
    const statusText = isFullyPaid ? 'PAID' : paidAmt > 0 ? 'PARTIAL' : 'UNPAID';
    const statusColor = isFullyPaid ? '#059669' : paidAmt > 0 ? '#d97706' : '#dc2626';
    if (currentY < voucherBottomY - fs(40) && payments.length === 0) {
      doc.moveTo(contentX, currentY).lineTo(contentX + contentWidth, currentY).stroke();
      currentY += midGap;

      doc.fontSize(historyFont).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Status:', contentX, currentY);
      doc.fillColor(statusColor).text(statusText, valueX, currentY);
      currentY += rowHeight;

      doc.fillColor('#000000').text('Paid So Far:', contentX, currentY);
      doc.text(`Rs. ${paidAmt.toFixed(0)}`, valueX, currentY);
      currentY += rowHeight;

      doc.text('Pending:', contentX, currentY);
      doc.fillColor('#dc2626').text(`Rs. ${pendingAmt.toFixed(0)}`, valueX, currentY);
      doc.fillColor('#000000');
      currentY += rowHeight;
    }
    
    // Voucher footer text (always pinned at bottom inside voucher boundary)
    const footerLineGap = Math.max(8, fs(9));
    const instructionY = voucherBottomY - (footerLineGap * 2) - 2;
    doc.fontSize(noteFont).font('Helvetica').fillColor('#000000');
    doc.text('Pay at school office during working hours.', contentX, instructionY, {
      width: contentWidth,
      align: 'center'
    });
    doc.text(`Contact: ${this.schoolPhone}`, contentX, instructionY + footerLineGap, {
      width: contentWidth,
      align: 'center'
    });
    
    // Add "PAID" watermark if voucher is fully paid
    if (billableAmount > 0 && isFullyPaid) {
      doc.save();
      
      // Calculate center position for the watermark
      const centerX = x + (width / 2);
      const centerY = y + (height / 2);
      
      // Rotate and add PAID text
      doc.translate(centerX, centerY)
         .rotate(-35, { origin: [0, 0] });
      
      // Draw background rectangle for PAID stamp
      doc.fontSize(28)
         .font('Helvetica-Bold');
      
      const textWidth = doc.widthOfString('PAID');
      const textHeight = 35;
      const rectPadding = 8;
      
      // Semi-transparent green background
      doc.rect(
        -textWidth / 2 - rectPadding,
        -textHeight / 2 - rectPadding / 2,
        textWidth + rectPadding * 2,
        textHeight + rectPadding
      )
      .lineWidth(2)
      .fillOpacity(0.15)
      .fill('#10b981')
      .strokeOpacity(0.6)
      .stroke('#059669');
      
      // PAID text in green
      doc.fillOpacity(0.5)
         .fillColor('#059669')
         .text('PAID', -textWidth / 2, -textHeight / 2 + 5, {
           width: textWidth,
           align: 'center'
         });
      
      doc.restore();
    }
  }

  /**
   * Helper: Add two-column layout
   */
  addTwoColumns(doc, leftContent, rightContent, y) {
    const leftX = 50;
    const rightX = 320;
    
    doc.fontSize(10).font('Helvetica');
    
    Object.keys(leftContent).forEach((key, index) => {
      const yPos = y + (index * 20);
      doc.font('Helvetica-Bold').text(`${key}:`, leftX, yPos);
      doc.font('Helvetica').text(leftContent[key], leftX + 100, yPos);
    });
    
    Object.keys(rightContent).forEach((key, index) => {
      const yPos = y + (index * 20);
      doc.font('Helvetica-Bold').text(`${key}:`, rightX, yPos);
      doc.font('Helvetica').text(rightContent[key], rightX + 100, yPos);
    });
  }

  /**
   * Helper: Create table
   */
  createTable(doc, headers, rows, startY, columnWidths) {
    let y = startY;
    const tableTop = y;
    const tableLeft = 50;
    
    // Draw header
    doc.font('Helvetica-Bold').fontSize(10);
    let x = tableLeft;
    
    headers.forEach((header, i) => {
      doc.text(header, x, y, { width: columnWidths[i], align: 'left' });
      x += columnWidths[i];
    });
    
    y += 20;
    
    // Draw header border
    doc.moveTo(tableLeft, y)
       .lineTo(tableLeft + columnWidths.reduce((a, b) => a + b, 0), y)
       .stroke();
    
    y += 5;
    
    // Draw rows
    doc.font('Helvetica').fontSize(9);
    
    rows.forEach((row) => {
      x = tableLeft;
      
      row.forEach((cell, i) => {
        doc.text(String(cell), x, y, { width: columnWidths[i], align: i === 0 ? 'left' : 'right' });
        x += columnWidths[i];
      });
      
      y += 20;
    });
    
    // Draw table border
    doc.rect(
      tableLeft,
      tableTop,
      columnWidths.reduce((a, b) => a + b, 0),
      y - tableTop
    ).stroke();
    
    return y;
  }

  /**
   * Generate Fee Voucher PDF
   * POST /api/vouchers/:id/pdf
   */
  async generateFeeVoucher(voucherId) {
    const client = await pool.connect();
    
    try {
      // Fetch voucher data
      const voucherResult = await client.query(
        `SELECT 
          v.id, v.month, v.due_date, v.created_at,
          s.name as student_name, sch.serial_number, NULLIF(TRIM(s.phone), '') as father_phone, s.father_name,
          c.name as class_name, c.class_type,
          sec.name as section_name,
          sch.id as class_history_id
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN students s ON sch.student_id = s.id
         JOIN classes c ON sch.class_id = c.id
         JOIN sections sec ON sch.section_id = sec.id
         WHERE v.id = $1`,
        [voucherId]
      );

      if (voucherResult.rows.length === 0) {
        const error = new Error('Voucher not found');
        error.statusCode = 404;
        throw error;
      }

      const voucher = voucherResult.rows[0];

      // Fetch voucher items
      const itemsResult = await client.query(
        'SELECT item_type, amount, description FROM fee_voucher_items WHERE voucher_id = $1 ORDER BY id',
        [voucherId]
      );

      // Fetch payments with more details
      const paymentsResult = await client.query(
        'SELECT amount, payment_date, created_at FROM fee_payments WHERE voucher_id = $1 ORDER BY payment_date, created_at',
        [voucherId]
      );

      // Calculate totals
      const totalAmount = itemsResult.rows.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      const billableAmount = itemsResult.rows.reduce(
        (sum, item) => sum + parseFloat(item.amount),
        0
      );
      const totalPaid = paymentsResult.rows.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      const balance = Math.max(billableAmount - totalPaid, 0);

      // Create PDF - single voucher centered on page
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `fee-voucher-${voucherId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Draw single voucher centered on page
      const voucherData = {
        voucher_no: `V-${String(voucherId).padStart(3, '0')}`,
        student_name: voucher.student_name,
        father_name: voucher.father_name,
        father_phone: voucher.father_phone,
        serial_number: voucher.serial_number,
        class_name: voucher.class_name,
        section_name: voucher.section_name,
        month: voucher.month,
        due_date: voucher.due_date,
        items: itemsResult.rows.map(item => ({
          item_type: item.item_type,
          description: item.description || '',
          amount: parseFloat(item.amount)
        })),
        total_amount: totalAmount,
        billable_amount: billableAmount,
        paid_amount: totalPaid,
        balance: balance
      };

      // Header
      // Draw centered, light logo watermark behind full-page voucher contents.
      this.addVoucherBackgroundLogo(doc, 50, 50, 500, 700);

      doc.fontSize(20).font('Helvetica-Bold')
         .text(this.schoolName, { align: 'center' });
      
      doc.fontSize(10).font('Helvetica')
         .text(this.schoolAddress, { align: 'center' })
         .text(`Phone: ${this.schoolPhone} | Email: ${this.schoolEmail}`, { align: 'center' });
      
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(16).font('Helvetica-Bold')
         .text('FEE VOUCHER', { align: 'center' });
      doc.moveDown(1);
      
      // Voucher details with enhanced date formatting
      const monthStr = new Date(voucherData.month).toLocaleDateString('en-PK', { 
        month: 'long', 
        year: 'numeric'
      });
      const dueDateStr = voucherData.due_date
        ? new Date(voucherData.due_date).toLocaleDateString('en-PK', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          })
        : 'N/A';
      
      doc.fontSize(12).font('Helvetica');
      let y = doc.y;
      
      // Left column
      doc.font('Helvetica-Bold').text('Student:', 50, y);
      doc.font('Helvetica').text(voucherData.student_name, 150, y);
      y += 18;
      
      doc.font('Helvetica-Bold').text('Father:', 50, y);
      doc.font('Helvetica').text(voucherData.father_name || 'N/A', 150, y);
      y += 18;
      
      doc.font('Helvetica-Bold').text('F.Contact:', 50, y);
      doc.font('Helvetica').text(voucherData.father_phone || 'Not Submitted', 150, y);
      y += 18;
      
      doc.font('Helvetica-Bold').text('Serial No:', 50, y);
      doc.font('Helvetica').text(String(voucherData.serial_number || 'N/A'), 150, y);
      y += 18;
      
      // Right column  
      doc.font('Helvetica-Bold').text('Voucher No:', 320, y - 60);
      doc.font('Helvetica').text(voucherData.voucher_no, 420, y - 60);
      
      doc.font('Helvetica-Bold').text('Class:', 320, y - 40);
      doc.font('Helvetica').text(voucherData.class_name, 420, y - 40);

      doc.font('Helvetica-Bold').text('Section:', 320, y - 20);
      doc.font('Helvetica').text(voucherData.section_name || 'N/A', 420, y - 20);
      
      doc.font('Helvetica-Bold').text('Month:', 320, y);
      doc.font('Helvetica').text(monthStr, 420, y);

      doc.font('Helvetica-Bold').text('Due Date:', 320, y + 20);
      doc.font('Helvetica').text(dueDateStr, 420, y + 20);
      
      doc.moveDown(1);
      y = doc.y;
      
      // Fee items table
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Fee Description', 50, y);
      doc.text('Amount', 450, y, { width: 100, align: 'right' });
      y += 20;
      
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      
      const defaultItemFontSize = 11;
      const totalRowFontSize = defaultItemFontSize * 3;

      doc.fontSize(defaultItemFontSize).font('Helvetica');
      voucherData.items.forEach(item => {
        const feeLabel = (() => {
          if (item.item_type === 'CUSTOM' && item.description) return item.description;
          if (item.item_type === 'ARREARS') return item.description || 'Dues';
          return item.item_type.replace('_', ' ');
        })();

        doc.fontSize(defaultItemFontSize).font('Helvetica');
        doc.text(feeLabel, 50, y);
        doc.text(`Rs. ${item.amount.toFixed(0)}`, 450, y, { width: 100, align: 'right' });
        y += 20;
      });
      
      // Total
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      
      doc.fillColor('#000000').fontSize(totalRowFontSize).font('Helvetica-Bold');
      doc.text('Total Amount:', 50, y);
      doc.text(`Rs. ${voucherData.total_amount.toFixed(0)}`, 350, y, { width: 200, align: 'right' });
      y += 46;

      // Show paid/pending for partial payments
      const isFullyPaid = (voucherData.balance || 0) <= 0.009;
      if (voucherData.paid_amount > 0 && !isFullyPaid) {
        const pendingAmount = Math.max(voucherData.balance || 0, 0);
        doc.fontSize(11).font('Helvetica-Bold');
        doc.fillColor('#059669').text('Paid Amount:', 50, y);
        doc.text(`Rs. ${voucherData.paid_amount.toFixed(0)}`, 450, y, { width: 100, align: 'right' });
        y += 20;
        doc.fillColor('#dc2626').text('Pending Amount:', 50, y);
        doc.text(`Rs. ${pendingAmount.toFixed(0)}`, 450, y, { width: 100, align: 'right' });
        y += 20;
        doc.fillColor('#000000');
      }

      // Show payment history with dates for ALL vouchers that have any payments
      if (paymentsResult.rows.length > 0) {
        y += 10;
        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 12;

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
        doc.text('Payment History:', 50, y);
        y += 18;

        // Header row background
        doc.rect(50, y, 500, 18).fill('#e8f4fd');
        doc.fillColor('#000000');

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b');
        doc.text('#', 58, y + 4);
        doc.text('Date of Payment', 78, y + 4);
        doc.text('Amount Paid', 300, y + 4);
        doc.text('Balance Remaining', 400, y + 4, { width: 148, align: 'right' });
        y += 18;

        doc.moveTo(50, y).lineTo(550, y).lineWidth(1).stroke();
        y += 5;

        // Individual payment rows
        doc.fontSize(10).font('Helvetica');
        let runningBalance = voucherData.billable_amount;

        paymentsResult.rows.forEach((payment, index) => {
          const paymentAmount = parseFloat(payment.amount);
          runningBalance = Math.max(runningBalance - paymentAmount, 0);

          const dateStr = new Date(payment.payment_date).toLocaleDateString('en-PK', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });

          // Alternating row shade
          if (index % 2 === 1) {
            doc.rect(50, y - 2, 500, 18).fill('#f9fafb');
          }

          doc.fillColor('#64748b').font('Helvetica').text(`${index + 1}`, 58, y + 2);
          doc.fillColor('#1e293b').text(dateStr, 78, y + 2);
          doc.fillColor('#059669').font('Helvetica-Bold').text(`Rs. ${paymentAmount.toFixed(0)}`, 300, y + 2);
          doc.fillColor(runningBalance > 0 ? '#dc2626' : '#059669')
             .text(`Rs. ${runningBalance.toFixed(0)}`, 400, y + 2, { width: 148, align: 'right' });

          doc.fillColor('#000000').font('Helvetica');
          y += 18;
        });

        y += 4;
        doc.moveTo(50, y).lineTo(550, y).lineWidth(0.5).stroke();
        y += 12;
      }

      // Footer
      doc.fontSize(8).font('Helvetica')
         .text(`Pay at school office during working hours. Contact: ${this.schoolPhone}`, 50, 735, {
           align: 'center'
         })
         .text(`Generated on: ${new Date().toLocaleDateString('en-PK', {
           weekday: 'short',
           year: 'numeric',
           month: 'short',
           day: '2-digit'
         })} at ${new Date().toLocaleTimeString('en-PK', {
           hour: '2-digit',
           minute: '2-digit',
           hour12: true
         })}`, 50, 750, { align: 'center' })
         .text('This is a computer-generated document.', 50, 765, { align: 'center', italic: true });

      // Add "PAID" watermark if voucher is fully paid
      if (voucherData.billable_amount > 0 && (voucherData.balance || 0) <= 0.009) {
        doc.save();
        
        // Position watermark in center of page
        const pageWidth = 595.28; // A4 width in points
        const pageHeight = 841.89; // A4 height in points
        const centerX = pageWidth / 2;
        const centerY = pageHeight / 2;
        
        // Rotate and add PAID text
        doc.translate(centerX, centerY)
           .rotate(-45, { origin: [0, 0] });
        
        // Draw PAID stamp with border
        doc.fontSize(80)
           .font('Helvetica-Bold');
        
        const textWidth = doc.widthOfString('PAID');
        const textHeight = 90;
        const rectPadding = 20;
        
        // Semi-transparent green background rectangle
        doc.rect(
          -textWidth / 2 - rectPadding,
          -textHeight / 2 - rectPadding / 2,
          textWidth + rectPadding * 2,
          textHeight + rectPadding
        )
        .lineWidth(4)
        .fillOpacity(0.1)
        .fill('#10b981')
        .strokeOpacity(0.4)
        .stroke('#059669');
        
        // PAID text in green
        doc.fillOpacity(0.3)
           .fillColor('#059669')
           .text('PAID', -textWidth / 2, -textHeight / 2 + 10, {
             width: textWidth,
             align: 'center'
           });
        
        doc.restore();
      }

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Generate Salary Slip PDF
   * GET /api/salaries/voucher/:id/pdf
   */
  async generateSalarySlip(voucherId) {
    const client = await pool.connect();
    
    try {
      // Fetch salary voucher data
      const voucherResult = await client.query(
        `SELECT 
          v.id, v.month, v.created_at,
          f.name as faculty_name, f.cnic, f.role, f.subject,
          ss.base_salary
         FROM salary_vouchers v
         JOIN faculty f ON v.faculty_id = f.id
         LEFT JOIN LATERAL (
           SELECT base_salary 
           FROM salary_structure 
           WHERE faculty_id::int = f.id::int 
             AND DATE_TRUNC('month', effective_from) <= DATE_TRUNC('month', v.month::date)
           ORDER BY effective_from DESC 
           LIMIT 1
         ) ss ON true
         WHERE v.id = $1::int`,
        [voucherId]
      );

      if (voucherResult.rows.length === 0) {
        const error = new Error('Salary voucher not found');
        error.statusCode = 404;
        throw error;
      }

      const voucher = voucherResult.rows[0];

      // Fetch adjustments
      const adjustmentsResult = await client.query(
        'SELECT type, amount, calc_type FROM salary_adjustments WHERE voucher_id = $1',
        [voucherId]
      );

      // Fetch payments
      const paymentsResult = await client.query(
        'SELECT amount, payment_date FROM salary_payments WHERE voucher_id = $1 ORDER BY payment_date',
        [voucherId]
      );

      // Calculate amounts
      let baseSalary = parseFloat(voucher.base_salary) || 0;
      let bonusTotal = 0;
      let advanceTotal = 0;

      adjustmentsResult.rows.forEach(adj => {
        const amount = parseFloat(adj.amount);
        let calculatedAmount = amount;

        if (adj.calc_type === 'PERCENTAGE') {
          calculatedAmount = (baseSalary * amount) / 100;
        }

        if (adj.type === 'BONUS') {
          bonusTotal += calculatedAmount;
        } else if (adj.type === 'ADVANCE') {
          advanceTotal += calculatedAmount;
        }
      });

      const grossSalary = baseSalary + bonusTotal;
      const netSalary = grossSalary - advanceTotal;
      const totalPaid = paymentsResult.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balance = netSalary - totalPaid;

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `salary-slip-${voucherId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Add header
      this.addHeader(doc, 'SALARY SLIP');

      // Employee details
      const monthStr = new Date(voucher.month).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });

      this.addTwoColumns(
        doc,
        {
          'Slip No': `SS-${String(voucherId).padStart(6, '0')}`,
          'Employee Name': voucher.faculty_name,
          'CNIC': voucher.cnic || 'N/A'
        },
        {
          'Issue Date': new Date(voucher.created_at).toLocaleDateString(),
          'Designation': voucher.role || 'N/A',
          'Subject': voucher.subject || 'N/A'
        },
        doc.y
      );

      doc.moveDown(2);

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Salary Month: ${monthStr}`, { align: 'center' });

      doc.moveDown(1);

      // Salary breakdown
      const rows = [
        ['Basic Salary', baseSalary.toFixed(2)]
      ];

      adjustmentsResult.rows.forEach(adj => {
        const amount = parseFloat(adj.amount);
        let calculatedAmount = amount;
        let label = adj.type;

        if (adj.calc_type === 'PERCENTAGE') {
          calculatedAmount = (baseSalary * amount) / 100;
          label += ` (${amount}%)`;
        }

        rows.push([label, calculatedAmount.toFixed(2)]);
      });

      const tableY = this.createTable(
        doc,
        ['Description', 'Amount (Rs.)'],
        rows,
        doc.y,
        [350, 150]
      );

      doc.moveDown(1);

      // Totals
      const totalsY = tableY + 20;
      doc.font('Helvetica-Bold').fontSize(11);
      
      doc.text('Gross Salary:', 350, totalsY);
      doc.text(`Rs. ${grossSalary.toFixed(2)}`, 450, totalsY, { align: 'right', width: 100 });
      
      if (advanceTotal > 0) {
        doc.fillColor('red');
        doc.text('Less: Advance:', 350, totalsY + 20);
        doc.text(`Rs. ${advanceTotal.toFixed(2)}`, 450, totalsY + 20, { align: 'right', width: 100 });
        doc.fillColor('black');
      }
      
      doc.fontSize(12);
      doc.text('Net Salary:', 350, totalsY + 40);
      doc.text(`Rs. ${netSalary.toFixed(2)}`, 450, totalsY + 40, { align: 'right', width: 100 });

      if (totalPaid > 0) {
        doc.fontSize(11);
        doc.text('Amount Paid:', 350, totalsY + 65);
        doc.text(`Rs. ${totalPaid.toFixed(2)}`, 450, totalsY + 65, { align: 'right', width: 100 });
        
        doc.fillColor(balance > 0 ? 'red' : 'green');
        doc.text('Balance:', 350, totalsY + 85);
        doc.text(`Rs. ${balance.toFixed(2)}`, 450, totalsY + 85, { align: 'right', width: 100 });
        doc.fillColor('black');
      }

      doc.moveDown(3);

      // Payment status
      if (balance === 0) {
        doc.fontSize(14)
           .fillColor('green')
           .font('Helvetica-Bold')
           .text('✓ PAID', { align: 'center' })
           .fillColor('black');
      } else {
        doc.fontSize(12)
           .fillColor('red')
           .font('Helvetica-Bold')
           .text('PAYMENT PENDING', { align: 'center' })
           .fillColor('black');
      }

      doc.moveDown(2);

      // Signature section
      doc.fontSize(10).font('Helvetica');
      doc.text('_____________________', 80, doc.y + 40);
      doc.text('Employee Signature', 80, doc.y + 5);
      
      doc.text('_____________________', 380, doc.y - 25);
      doc.text('Authorized Signature', 380, doc.y + 5);

      // Add footer
      this.addFooter(doc);

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Generate Payment Receipt PDF
   * GET /api/fees/payment/:id/receipt
   */
  async generatePaymentReceipt(paymentId, type = 'fee') {
    const client = await pool.connect();
    
    try {
      let paymentData;

      if (type === 'fee') {
        // Fetch fee payment
        const result = await client.query(
          `SELECT 
            fp.id, fp.amount, fp.payment_date,
            v.id as voucher_id, v.month,
            s.name as payer_name, s.roll_no,
            c.name as class_name, sec.name as section_name
           FROM fee_payments fp
           JOIN fee_vouchers v ON fp.voucher_id = v.id
           JOIN student_class_history sch ON v.student_class_history_id = sch.id
           JOIN students s ON sch.student_id = s.id
           JOIN classes c ON sch.class_id = c.id
           JOIN sections sec ON sch.section_id = sec.id
           WHERE fp.id = $1`,
          [paymentId]
        );

        if (result.rows.length === 0) {
          const error = new Error('Payment not found');
          error.statusCode = 404;
          throw error;
        }

        paymentData = result.rows[0];
        paymentData.payment_for = 'School Fee';
        paymentData.reference = `FV-${String(paymentData.voucher_id).padStart(6, '0')}`;
      } else if (type === 'salary') {
        // Fetch salary payment
        const result = await client.query(
          `SELECT 
            sp.id, sp.amount, sp.payment_date,
            v.id as voucher_id, v.month,
            f.name as payer_name, f.role
           FROM salary_payments sp
           JOIN salary_vouchers v ON sp.voucher_id = v.id
           JOIN faculty f ON v.faculty_id = f.id
           WHERE sp.id = $1`,
          [paymentId]
        );

        if (result.rows.length === 0) {
          const error = new Error('Payment not found');
          error.statusCode = 404;
          throw error;
        }

        paymentData = result.rows[0];
        paymentData.payment_for = 'Salary Payment';
        paymentData.reference = `SS-${String(paymentData.voucher_id).padStart(6, '0')}`;
      }

      // Create PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filename = `receipt-${paymentId}-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // Add header
      this.addHeader(doc, 'PAYMENT RECEIPT');

      // Receipt details
      this.addTwoColumns(
        doc,
        {
          'Receipt No': `R-${String(paymentId).padStart(6, '0')}`,
          'Payment Date': new Date(paymentData.payment_date).toLocaleDateString(),
          'Paid By': paymentData.payer_name
        },
        {
          'Reference': paymentData.reference,
          'Payment For': paymentData.payment_for,
          'Month': new Date(paymentData.month).toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
          })
        },
        doc.y
      );

      doc.moveDown(2);

      // Amount box
      doc.roundedRect(150, doc.y, 300, 80, 5).stroke();
      
      doc.fontSize(12)
         .font('Helvetica')
         .text('Amount Received:', 170, doc.y + 15);
      
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text(`Rs. ${parseFloat(paymentData.amount).toFixed(2)}`, 170, doc.y + 25);

      doc.moveDown(6);

      // Amount in words
      const amountInWords = this.numberToWords(parseFloat(paymentData.amount));
      doc.fontSize(11)
         .font('Helvetica')
         .text(`Amount in words: ${amountInWords}`, { align: 'center', italic: true });

      doc.moveDown(3);

      // Thank you message
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Thank You!', { align: 'center' });

      doc.fontSize(10)
         .font('Helvetica')
         .text('Please keep this receipt for your records.', { align: 'center' });

      doc.moveDown(3);

      // Signature
      doc.text('_____________________', 380, doc.y + 20);
      doc.text('Received By', 400, doc.y + 5);

      // Add footer
      this.addFooter(doc);

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Convert number to words
   */
  numberToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero Rupees Only';

    const numStr = Math.floor(num).toString();
    const paisa = Math.round((num - Math.floor(num)) * 100);

    let words = '';

    if (numStr.length > 6) {
      const lakhs = parseInt(numStr.slice(0, -5));
      words += this.convertHundreds(lakhs) + ' Lakh ';
    }

    if (numStr.length > 3) {
      const thousands = parseInt(numStr.slice(-5, -3));
      if (thousands > 0) {
        words += this.convertHundreds(thousands) + ' Thousand ';
      }
    }

    const hundreds = parseInt(numStr.slice(-3));
    if (hundreds > 0) {
      words += this.convertHundreds(hundreds) + ' ';
    }

    words += 'Rupees';

    if (paisa > 0) {
      words += ` and ${this.convertHundreds(paisa)} Paisa`;
    }

    return words + ' Only';
  }

  /**
   * Helper: Convert hundreds
   */
  convertHundreds(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    let words = '';

    if (num >= 100) {
      words += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }

    if (num >= 20) {
      words += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    } else if (num >= 10) {
      words += teens[num - 10] + ' ';
      return words.trim();
    }

    if (num > 0) {
      words += ones[num] + ' ';
    }

    return words.trim();
  }

  /**
   * Generate Bulk Fee Vouchers PDF
   * Generates a single PDF containing multiple fee vouchers (4 per page in 2x2 grid)
   */
  async generateBulkFeeVouchers(vouchersData) {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 15 });
      const filename = `bulk-fee-vouchers-${Date.now()}.pdf`;
      const filepath = path.join('/tmp', filename);
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // A4 dimensions: 595.28 x 841.89 points
      // With 15pt margin: usable area is 565.28 x 811.89
      // Each voucher: 282.64 x 405.945 (width x height) for 2x2 grid
      const voucherWidth = 282.64;
      const voucherHeight = 405.945;
      const startX = 15;
      const startY = 15;
      
      // Grid positions (top-left, top-right, bottom-left, bottom-right)
      const positions = [
        { x: startX, y: startY },                                    // Top-left
        { x: startX + voucherWidth, y: startY },                     // Top-right
        { x: startX, y: startY + voucherHeight },                    // Bottom-left
        { x: startX + voucherWidth, y: startY + voucherHeight }      // Bottom-right
      ];

      let voucherIndex = 0;
      
      for (const voucherData of vouchersData) {
        // Add new page after every 4 vouchers (except at the start)
        if (voucherIndex > 0 && voucherIndex % 4 === 0) {
          doc.addPage();
        }
        
        const positionIndex = voucherIndex % 4;
        const pos = positions[positionIndex];
        
        this.drawCompactVoucher(doc, voucherData, pos.x, pos.y, voucherWidth, voucherHeight);
        
        voucherIndex++;
      }

      doc.end();

      return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ filepath, filename }));
        stream.on('error', reject);
      });
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new PDFService();
