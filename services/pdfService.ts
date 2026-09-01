
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber, formatDateTime } from '../constants';
import { InventoryAdjustment, Company, Contact } from '../types';

// Helper for PDF currency formatting (no currency symbol as requested)
const formatCurrencyPDF = (amount: number) => {
  return formatNumber(amount);
};

export interface PDFTableColumn {
  header: string;
  dataKey: string;
  align?: 'left' | 'center' | 'right';
  visible?: boolean;
}

export interface PDFReportOptions {
  title: string;
  subtitle?: string;
  companyName: string;
  dateRange?: string;
  filename: string;
  orientation?: 'portrait' | 'landscape';
  printedBy?: string;
}

export const generatePDFReport = (
  options: PDFReportOptions,
  columns: PDFTableColumn[],
  data: any[]
) => {
  const { title, subtitle, companyName, dateRange, filename, orientation = 'portrait', printedBy } = options;
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'mm',
    format: 'a4',
  });

  // Filter visible columns
  const visibleColumns = columns.filter(col => col.visible !== false);

  // Modern Color Palette
  const slate900: [number, number, number] = [15, 23, 42];
  const slate600: [number, number, number] = [71, 85, 105];
  const slate400: [number, number, number] = [148, 163, 184];
  const slate100: [number, number, number] = [241, 245, 249];
  const slate50: [number, number, number] = [248, 250, 252];
  const blue900: [number, number, number] = [30, 58, 138]; // Deep trust blue

  // Helper to draw header
  const drawHeader = (isCompact: boolean = false, pageNum: number = 1) => {
    if (!isCompact) {
      // Company Name & Title on one line
      doc.setTextColor(slate900[0], slate900[1], slate900[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${companyName.toUpperCase()} - ${title.toUpperCase()}`, 15, 20);

      // Subtitle / Date Range
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      if (subtitle) doc.text(subtitle, 15, 27);
      
      let endY = 30;

      if (dateRange) {
        doc.setFillColor(slate50[0], slate50[1], slate50[2]);
        doc.setDrawColor(226, 232, 240);
        const dateRangeWidth = doc.getTextWidth(dateRange) + 20;
        doc.roundedRect(doc.internal.pageSize.width - dateRangeWidth - 15, 13, dateRangeWidth, 10, 1, 1, 'FD');
        doc.setFontSize(8);
        doc.setTextColor(slate900[0], slate900[1], slate900[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('PERIOD', doc.internal.pageSize.width - dateRangeWidth - 10, 19.5);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(slate600[0], slate600[1], slate600[2]);
        doc.text(dateRange, doc.internal.pageSize.width - 18, 19.5, { align: 'right' });
      }

      // Decorative line
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(15, 35, doc.internal.pageSize.width - 15, 35);
    } else {
      // Compact Header for pages 2+
      doc.setTextColor(slate900[0], slate900[1], slate900[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${companyName.toUpperCase()} - ${title.toUpperCase()}`, 15, 12);
      
      if (dateRange) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(slate600[0], slate600[1], slate600[2]);
        doc.text(`Period: ${dateRange}`, doc.internal.pageSize.width - 15, 12, { align: 'right' });
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(15, 16, doc.internal.pageSize.width - 15, 16);
    }
  };

  // Initial Full Header
  drawHeader(false, 1);

  // Sanitize data for PDF
  const sanitizedData = data.map(row => {
    const newRow = { ...row };
    Object.keys(newRow).forEach(key => {
      if (typeof newRow[key] === 'number') {
        newRow[key] = newRow[key].toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } else if (typeof newRow[key] === 'string') {
        newRow[key] = newRow[key].replace(/[৳]|Tk\.|Tk\s*=/g, '').trim();
      }
    });
    return newRow;
  });

  const totalPagesExp = '{total_pages_count_string}';

  // Table
  autoTable(doc, {
    startY: 40,
    columns: visibleColumns,
    body: sanitizedData,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      overflow: 'linebreak',
      cellWidth: 'wrap',
    },
    headStyles: {
      fillColor: slate50,
      textColor: slate600,
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'right', // Overridden for specific columns later
      cellPadding: 4,
      lineColor: [226, 232, 240],
      lineWidth: { bottom: 1, top: 0, left: 0, right: 0 },
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: slate900,
      lineColor: [241, 245, 249],
      lineWidth: { bottom: 0.1, top: 0, left: 0, right: 0 },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: visibleColumns.reduce((acc: any, col, idx) => {
      if (col.align) {
        acc[idx] = { halign: col.align, cellWidth: 'auto' };
      } else {
        const isNumeric = data.some(row => {
          const val = row[col.dataKey];
          if (typeof val === 'number') return true;
          if (typeof val === 'string') {
            // Check for currency or plain numeric strings
            return /^[৳]|\d+/.test(val.trim()) && !/[a-zA-Z]/.test(val);
          }
          return false;
        });
        acc[idx] = { halign: isNumeric ? 'right' : 'left', cellWidth: 'auto' };
      }
      return acc;
    }, {}),
    margin: { top: 20, left: 15, right: 15, bottom: 20 },
    didParseCell: (data) => {
      // Force header alignments
      if (data.row.section === 'head') {
        const colDef = visibleColumns[data.column.index];
        data.cell.styles.halign = colDef.align || data.cell.styles.halign || 'left';
      }

      const rowData = data.row.raw as any;
      const visibleCount = visibleColumns.length;

      // Dynamic Column Merging for Header Rows
      if (rowData.isHeader || rowData.isSubHeader) {
        const keys = visibleColumns.map(c => c.dataKey);
        const hasOtherData = keys.slice(1).some(key => {
          const val = rowData[key];
          return val !== undefined && val !== null && val !== '' && val !== '0.00' && val !== '-';
        });

        if (data.column.index === 0 && !hasOtherData) {
          data.cell.colSpan = visibleCount;
          data.cell.styles.halign = 'left';
        }
        
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = rowData.isHeader ? slate100 : slate50;
        data.cell.styles.textColor = slate900;
        data.cell.styles.fontSize = rowData.isHeader ? 9 : 8.5;
        data.cell.styles.overflow = 'visible';
      }

      // Dynamic Column Merging for Total/Summary Rows
      if (rowData.isTotal) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = slate50;
        data.cell.styles.textColor = blue900;
        data.cell.styles.fontSize = 8.5;

        // Merge label columns if they are empty
        if (data.column.index === 0) {
          let span = 1;
          const keys = visibleColumns.map(c => c.dataKey);
          for (let i = 1; i < keys.length; i++) {
            const val = rowData[keys[i]];
            if (!val || val === '' || val === '-') {
              span++;
            } else {
              break;
            }
          }
          if (span > 1) {
            data.cell.colSpan = span;
          }
        }

        const isGrandTotal = (rowData.name && rowData.name.includes('GRAND TOTAL')) || 
                           (rowData.product === 'TOTAL') || 
                           (rowData.date === 'GRAND TOTAL');
                           
        if (isGrandTotal) {
          data.cell.styles.lineWidth = { top: 0.5, bottom: 0.5, left: 0, right: 0 };
          data.cell.styles.fillColor = slate100;
          data.cell.styles.textColor = slate900;
        }
      }
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        drawHeader(true, data.pageNumber);
      }

      // Footer
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      doc.setFontSize(7);
      doc.setTextColor(slate400[0], slate400[1], slate400[2]);
      
      doc.text(
        `Generated by Sub ERP - ${formatDateTime(new Date())}`,
        15,
        pageHeight - 10
      );

      doc.text(
        `Page ${data.pageNumber} of ${totalPagesExp}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      if (printedBy) {
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Printed By: ${printedBy}`,
          pageWidth - 15,
          pageHeight - 10,
          { align: 'right' }
        );
      }
    },
  });

  if (typeof doc.putTotalPages === 'function') {
    doc.putTotalPages(totalPagesExp);
  }

  doc.save(`${filename}.pdf`);
};

export const renderInvoicePage = (doc: any, { invoice, customer, company, employees, items, totals, printedBy, outstandingBalance = 0 }: any) => {
    const blue900: [number, number, number] = [30, 58, 138];
    const slate900: [number, number, number] = [15, 23, 42];
    const slate600: [number, number, number] = [71, 85, 105];
    const slate400: [number, number, number] = [148, 163, 184];
    const slate50: [number, number, number] = [248, 250, 252];
    const slate200: [number, number, number] = [226, 232, 240];

    // Company Info (Top Left)
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(String(company?.name || 'SUBORNO ELECTRIC').toUpperCase(), 8, 14);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text(String(company?.address || 'Dhaka, Bangladesh'), 8, 19);

    console.log('PDF Generation - Invoice Object:', JSON.parse(JSON.stringify(invoice)));
    // Invoice Label (Top Right Badge)
    const isDraft = invoice.status === 'DRAFT' || !invoice.number;
    const invoiceLabel = isDraft ? 'DRAFT INVOICE' : 'INVOICE';
    
    doc.setTextColor(blue900[0], blue900[1], blue900[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(invoiceLabel, doc.internal.pageSize.width - 8, 14, { align: 'right' });
    
    if (!isDraft) {
      doc.setFontSize(10);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(`#${invoice.number}`, doc.internal.pageSize.width - 8, 19, { align: 'right' });
      
      if (invoice.date || invoice.createdAt || invoice.created_at || invoice.updatedAt || invoice.updated_at) {
        doc.text(`${formatDateTime(invoice.createdAt || invoice.created_at || invoice.updatedAt || invoice.updated_at || new Date().toISOString())}`, doc.internal.pageSize.width - 8, 24, { align: 'right' });
      }
    }

    // Divider
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.setLineWidth(0.3);
    doc.line(8, 28, doc.internal.pageSize.width - 8, 28);

    // Bill To
    doc.setFontSize(8);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('BILLED TO', 8, 34);
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(String(customer?.name || 'Cash Customer'), 8, 39);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    
    let customerInfoY = 43;
    if (customer?.address) {
      const addressLines = doc.splitTextToSize(String(customer.address), 65);
      doc.text(addressLines, 8, customerInfoY);
      customerInfoY += (addressLines.length * 4.0);
    }
    if (customer?.phone) {
      doc.text(String(customer.phone), 8, customerInfoY);
      customerInfoY += 4.2;
    }

    // Right Side Info (Outstanding)
    const rightInfoX = doc.internal.pageSize.width - 8;
    let rightInfoY = 34;

    const boxWidth = 50;
    const boxHeight = 14;
    const boxX = doc.internal.pageSize.width - boxWidth - 8;
    const boxY = rightInfoY;

    if (!isDraft && customer?.id && String(customer.id).startsWith('contact-cash-sale')) {
      doc.setFillColor(240, 253, 244); // emerald-50
      doc.setDrawColor(167, 243, 208); // emerald-200
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1, 1, 'FD');

      doc.setFontSize(8);
      doc.setTextColor(4, 120, 87); // emerald-700
      doc.setFont('helvetica', 'bold');
      doc.text('STATUS', boxX + 4, boxY + 5);
      
      doc.setFontSize(12);
      doc.text((customer?.name?.toLowerCase().includes('cash sale')) || invoice.type === 'CASH_SALE' ? 'CASH SALE / PAID' : 'PAID', rightInfoX - 4, boxY + 10.5, { align: 'right' });
    } else {
      doc.setFillColor(slate50[0], slate50[1], slate50[2]);
      doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1, 1, 'FD');

      doc.setFontSize(8);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('OUTSTANDING DUE', boxX + 4, boxY + 5);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(slate900[0], slate900[1], slate900[2]);
      doc.text(formatCurrencyPDF(outstandingBalance), rightInfoX - 4, boxY + 10.5, { align: 'right' });
    }
    
    rightInfoY = boxY + boxHeight + 4;

    customerInfoY = Math.max(customerInfoY, rightInfoY);

    if (isDraft) {
      try {
        doc.saveGraphicsState();
        const GState = (doc as any).GState || (jsPDF as any).GState;
        if (GState) {
          doc.setGState(new GState({ opacity: 0.04 }));
        }
        doc.setFontSize(70);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text('DRAFT', doc.internal.pageSize.width / 2, doc.internal.pageSize.height / 2, {
          align: 'center',
          angle: 45
        });
        doc.restoreGraphicsState();
      } catch (e) {
        console.warn('GState not supported or failed:', e);
      }
    } else if (invoice.status === 'PAID' || invoice.type === 'CASH_SALE' || (customer?.name?.toLowerCase().includes('cash sale')) || (outstandingBalance <= 0 && invoice.status !== 'DRAFT')) {
      // PAID Watermark
      try {
        doc.saveGraphicsState();
        const GState = (doc as any).GState || (jsPDF as any).GState;
        if (GState) {
          doc.setGState(new GState({ opacity: 0.08 }));
        }
        doc.setFontSize(60);
        doc.setTextColor(16, 185, 129); // emerald-500
        doc.setFont('helvetica', 'bold');
        doc.text('PAID', doc.internal.pageSize.width / 2, doc.internal.pageSize.height / 2, {
          align: 'center',
          angle: 30
        });
        doc.restoreGraphicsState();
      } catch (e) {
        console.warn('GState not supported or failed:', e);
      }
    }

    const hasLineDiscounts = (items || []).some((item: any) => {
      if (item.type !== 'PRODUCT') return false;
      const gross = (item.unitPrice || 0) * (item.quantity || 0);
      const net = item.lineValue !== undefined ? item.lineValue : gross;
      const discAmt = gross - net;
      return (item.discountRate && item.discountRate > 0) || (item.discountAmount && item.discountAmount > 0) || discAmt > 0.01;
    });
    
    const tableHeaders = hasLineDiscounts ? ['Description', 'Qty', 'Rate', 'Discount', 'Net Amount'] : ['Description', 'Qty', 'Rate', 'Amount'];
    
    let productSeq = 0;
    const tableData = (items || []).filter((item: any) => {
      if (item.type === 'PRODUCT') {
        return !!(item.productId || item.description || (item.unitPrice && item.quantity));
      }
      if (item.type === 'DISCOUNT') {
        return Math.abs(item.lineValue || 0) > 0.001;
      }
      return true;
    }).map((item: any) => {
      let desc = item.displayDescription || item.description || '';

      if (item.type === 'PRODUCT') {
        productSeq++;
        if (!/^\d+[\.\)\-]\s*/.test(desc)) {
          desc = `${productSeq}) ${desc}`;
        }

        const rawSerials = item.serialNumbers || item.serial_numbers || item.serials;
        let serialsArr: string[] = [];
        if (Array.isArray(rawSerials)) {
          serialsArr = rawSerials.map(s => String(s).trim()).filter(Boolean);
        } else if (typeof rawSerials === 'string' && rawSerials.trim()) {
          serialsArr = rawSerials.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (serialsArr.length > 0) {
          const formattedSerials = serialsArr.join(', ');
          if (!desc.includes(formattedSerials)) {
            desc += `\nS/N: ${formattedSerials}`;
          }
        }
      }

      const itemNote = item.note || item.notes;
      if (item.type === "PRODUCT" && itemNote && itemNote.trim()) {
        const cleanNote = itemNote.trim();
        if (!desc.includes(cleanNote)) {
          desc += `\nNote: ${cleanNote}`;
        }
      }
      if (item.type === 'DISCOUNT') {
        const rateStr = item.discountMode === 'PERCENT'
          ? `${item.discountRate}% Percentage Discount`
          : `${formatNumber(item.discountRate)} Flat Discount`;
        if (!desc.includes(rateStr)) {
          desc = `${desc} (${rateStr})`;
        }
      }

      const row = [
        desc,
        item.type === 'PRODUCT' ? `${item.quantity} ${item.uom || 'Pcs'}` : '',
        item.type === 'PRODUCT' ? formatNumber(item.unitPrice) : 
          (item.type === 'DISCOUNT' ? (item.discountMode === 'PERCENT' ? `${item.discountRate}%` : `-${formatNumber(item.discountRate)}`) : '')
      ];

      if (hasLineDiscounts) {
         if (item.type === 'PRODUCT') {
            const gross = (item.unitPrice || 0) * (item.quantity || 0);
            const net = item.lineValue !== undefined ? item.lineValue : gross;
            const discAmt = gross - net;
            if (discAmt > 0.01) {
              const pct = (item.discountRate && item.discountRate > 0) 
                ? item.discountRate 
                : (gross > 0 ? (discAmt / gross) * 100 : 0);
              const pctFormatted = parseFloat(pct.toFixed(2));
              row.push(`-${formatNumber(discAmt)} (${pctFormatted}%)`);
            } else {
              row.push('-');
            }
         } else {
            row.push('');
         }
      }

      row.push(item.type === 'SECTION' || item.type === 'NOTE' ? '' : formatNumber(item.lineValue));
      (row as any)._type = item.type;
      return row;
    });

    const columnStylesConfig: any = {
      0: { cellWidth: "auto", halign: "left" },
      1: { halign: "center", cellWidth: 12 },
      2: { halign: "right", cellWidth: 18 },
    };

    if (hasLineDiscounts) {
      columnStylesConfig[3] = { halign: "right", cellWidth: 22 };
      columnStylesConfig[4] = { halign: "right", cellWidth: 22 };
    } else {
      columnStylesConfig[3] = { halign: "right", cellWidth: 22 };
    }

    autoTable(doc, {
      startY: customerInfoY + 4,
      head: [tableHeaders],
      body: tableData,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: slate400, 
        fontStyle: 'bold', 
        fontSize: 7.5, 
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        halign: 'right',
      },
      bodyStyles: { 
        fontSize: 8, 
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, 
        textColor: slate900,
      },
      columnStyles: columnStylesConfig,
      styles: { overflow: 'linebreak', font: 'helvetica' },
      margin: { left: 8, right: 8 },
      didParseCell: (data) => {
        const rowData = data.row.raw as any;
        const type = rowData._type;
        const totalCols = hasLineDiscounts ? 5 : 4;
        
        if (data.section === 'head' && data.column.index === 0) {
          data.cell.styles.halign = 'center';
        }
        if (type === 'SUBTOTAL' || type === 'DISCOUNT') {
          data.cell.styles.fontStyle = 'bold';
          if (data.column.index === 0) data.cell.styles.halign = 'right';
          data.cell.styles.lineWidth = 0;
          data.cell.styles.fillColor = [255, 255, 255];
        } else if (type === 'SECTION') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = blue900;
          data.cell.styles.fillColor = slate50;
          if (data.column.index === 0) {
            data.cell.colSpan = totalCols;
            data.cell.styles.halign = 'left';
          }
          data.cell.styles.overflow = 'visible';
        } else if (type === 'NOTE') {
          data.cell.styles.fontStyle = 'italic';
          data.cell.styles.textColor = slate600;
          if (data.column.index === 0) {
            data.cell.colSpan = totalCols;
            data.cell.styles.halign = 'left';
          }
        }
      },
      didDrawCell: (data) => {
        const rowData = data.row.raw as any;
        const type = rowData?._type;
        if (type !== 'SUBTOTAL' && type !== 'DISCOUNT' && type !== 'SECTION') {
          doc.setDrawColor(226, 232, 240); // slate200
          doc.setLineWidth(0.1);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    
    let currentY = finalY;
    if (currentY + 20 > doc.internal.pageSize.height) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(9);
    const rightAlignX = doc.internal.pageSize.width - 12;
    const labelX = doc.internal.pageSize.width - 60;

    const finalCustomerNote = invoice.customerNote || invoice.customer_note || invoice.note || invoice.notes;
    if (finalCustomerNote && finalCustomerNote.trim()) {
      doc.setFontSize(8.5);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.setFont('helvetica', 'italic');
      doc.text("Customer Note:", 12, currentY);
      currentY += 4;
      doc.setTextColor(50, 50, 50);
      const noteLines = doc.splitTextToSize(finalCustomerNote, 120);
      doc.text(noteLines, 12, currentY);
      currentY += (noteLines.length * 4) + 2;
    }

    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.line(12, currentY - 4, rightAlignX, currentY - 4);

    // Calculate Summary Details explicitly
    let calculatedGross = 0;
    let calculatedTotalDiscount = 0;
    items.forEach((item: any) => {
      if (item.type === 'PRODUCT') {
        const gross = (item.unitPrice || 0) * (item.quantity || 0);
        calculatedGross += gross;
        calculatedTotalDiscount += (gross - (item.lineValue || 0));
      } else if (item.type === 'DISCOUNT') {
        calculatedTotalDiscount += Math.abs(item.lineValue || 0);
      }
    });

    const paymentApplied = totals.total - totals.amountDue;
    const hasDiscount = calculatedTotalDiscount > 0.01;
    const hasPayment = paymentApplied > 0.01;
    
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 25;

    let linesNeeded = 1; // Net Amount
    if (hasDiscount) linesNeeded += 2; // Gross + Discount
    if (hasPayment) linesNeeded += 2; // Payment + Final Due
    
    const heightNeeded = linesNeeded * 6;
    
    // Auto-optimize space
    const willOverflow = (currentY + heightNeeded) > (pageHeight - bottomMargin);
    
    if (willOverflow) {
       doc.addPage();
       currentY = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);

    {
        // Normal Multi-line layout
        if (hasDiscount) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Gross Amount:', rightAlignX - 35, currentY, { align: 'right' });
            doc.setTextColor(slate900[0], slate900[1], slate900[2]);
            doc.text(formatCurrencyPDF(calculatedGross), rightAlignX, currentY, { align: 'right' });
            currentY += 6;
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text('Total Discount:', rightAlignX - 35, currentY, { align: 'right' });
            doc.setTextColor(slate900[0], slate900[1], slate900[2]);
            doc.text(`-${formatCurrencyPDF(calculatedTotalDiscount)}`, rightAlignX, currentY, { align: 'right' });
            currentY += 6;
        }
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(slate900[0], slate900[1], slate900[2]);
        doc.text('Net Amount:', rightAlignX - 35, currentY, { align: 'right' });
        doc.text(formatCurrencyPDF(totals.total), rightAlignX, currentY, { align: 'right' });
        
        if (hasPayment) {
            currentY += 6;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Payment Applied:', rightAlignX - 35, currentY, { align: 'right' });
            doc.setTextColor(slate900[0], slate900[1], slate900[2]);
            doc.text(`-${formatCurrencyPDF(paymentApplied)}`, rightAlignX, currentY, { align: 'right' });
            currentY += 6;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(43, 61, 98);
            doc.text('Final Due:', rightAlignX - 35, currentY, { align: 'right' });
            doc.text(formatCurrencyPDF(totals.amountDue), rightAlignX, currentY, { align: 'right' });
        }
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    
    let footerParts = [];
    footerParts.push(`Created by: ${printedBy || 'System'}`);
    const deliveryPerson = (employees || []).find((e: any) => e.id === invoice.deliveryPerson)?.name || invoice.deliveryPerson;
    if (deliveryPerson) footerParts.push(`Delivered by: ${deliveryPerson}`);
    const sr = (employees || []).find((e: any) => e.id === invoice.srId)?.name || invoice.srId;
    if (sr) footerParts.push(`SR: ${sr}`);
    
    const footerText = footerParts.join(', ');
    doc.text(footerText, 10, pageHeight - 8);
};

export const generateInvoicePDF = (params: any) => {
  console.log('generateInvoicePDF: starting', { invoiceNumber: params.invoice?.number, itemsCount: params.items?.length });
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5',
    });

    renderInvoicePage(doc, params);

    const sanitize = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const filename = `Invoice_${params.invoice.number || 'Draft'}_${sanitize(params.company?.name || 'Local')}`;
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    alert('Failed to generate PDF. Please check the console for details.');
  }
};

export const generateBulkInvoicePDF = (paramsList: any[]) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5',
    });

    paramsList.forEach((params, index) => {
      if (index > 0) {
        doc.addPage();
      }
      renderInvoicePage(doc, params);
    });

    doc.save(`Bulk_Invoices_${formatDateTime(new Date()).replace(/[^a-z0-9]/gi, '_')}.pdf`);
  } catch (error) {
    console.error('Error generating bulk invoice PDF:', error);
    alert('Failed to generate PDF. Please check the console for details.');
  }
};


/**
 * Generate a Smart PDF for a Vendor Bill
 */
export const generateBillPDF = ({ bill, vendor, company, items, totals, printedBy, outstandingBalance = 0 }: any) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageHeight = doc.internal.pageSize.height;

    const blue900: [number, number, number] = [30, 58, 138];
    const slate900: [number, number, number] = [15, 23, 42];
    const slate600: [number, number, number] = [71, 85, 105];
    const slate400: [number, number, number] = [148, 163, 184];
    const slate50: [number, number, number] = [248, 250, 252];
    const slate200: [number, number, number] = [226, 232, 240];

    // Company Info (Top Left)
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(String(company?.name || 'SUBORNO ELECTRIC').toUpperCase(), 8, 14);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text(String(company?.address || 'Dhaka, Bangladesh'), 8, 19);

    // Bill Label (Top Right Badge)
    const isDraft = (!bill.status || bill.status === 'DRAFT') && (!bill.number || String(bill.number).toLowerCase().includes('draft'));
    const billLabel = isDraft ? 'DRAFT BILL' : 'VENDOR BILL';
    
    doc.setTextColor(blue900[0], blue900[1], blue900[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(billLabel, doc.internal.pageSize.width - 8, 14, { align: 'right' });
    
    if (!isDraft) {
      doc.setFontSize(10);
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      doc.setFont('helvetica', 'normal');
      doc.text(`#${bill.number}`, doc.internal.pageSize.width - 8, 19, { align: 'right' });
      
      if (bill.date) {
        doc.text(`Date: ${bill.date}`, doc.internal.pageSize.width - 8, 24, { align: 'right' });
      }
    }

    // Divider
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.setLineWidth(0.3);
    doc.line(8, 28, doc.internal.pageSize.width - 8, 28);

    // Vendor Info
    doc.setFontSize(8);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('VENDOR', 8, 34);
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(String(vendor?.name || 'N/A'), 8, 39);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    
    let vendorInfoY = 43;
    if (vendor?.address) {
      const addressLines = doc.splitTextToSize(String(vendor.address), 65);
      doc.text(addressLines, 8, vendorInfoY);
      vendorInfoY += (addressLines.length * 4.0);
    }
    if (vendor?.phone) {
      doc.text(String(vendor.phone), 8, vendorInfoY);
      vendorInfoY += 4.2;
    }

    // Right Side Info (Outstanding)
    const rightInfoX = doc.internal.pageSize.width - 8;
    let rightInfoY = 34;

    const boxWidth = 50;
    const boxHeight = 14;
    const boxX = doc.internal.pageSize.width - boxWidth - 8;
    const boxY = rightInfoY;

    doc.setFillColor(slate50[0], slate50[1], slate50[2]);
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1, 1, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('OUTSTANDING DUE', boxX + 4, boxY + 5);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.text(formatCurrencyPDF(outstandingBalance), rightInfoX - 4, boxY + 10.5, { align: 'right' });
    
    rightInfoY = boxY + boxHeight + 4;
    vendorInfoY = Math.max(vendorInfoY, rightInfoY);

    // Items Table
    const tableHeaders = ['Description', 'Qty', 'Rate', 'Amount'];
    const tableData = (items || []).filter((item: any) => {
      if (item.type === 'PRODUCT') {
        return !!(item.productId || item.description || (item.unitPrice && item.quantity));
      }
      if (item.type === 'DISCOUNT') {
        return Math.abs(item.lineValue || 0) > 0.001;
      }
      return true;
    }).map((item: any) => {
      const row = [
        item.description,
        item.type === 'PRODUCT' ? `${item.quantity} ${item.uom || 'Pcs'}` : '',
        item.type === 'PRODUCT' ? formatNumber(item.unitPrice) : '',
        item.type === 'SECTION' || item.type === 'NOTE' ? '' : formatNumber(item.lineValue)
      ];
      (row as any)._type = item.type;
      return row;
    });

    autoTable(doc, {
      startY: vendorInfoY + 4,
      head: [tableHeaders],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: slate400, 
        fontStyle: 'bold', 
        fontSize: 8, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        halign: 'right', // General right align
        lineColor: slate200,
        lineWidth: 0.1
      },
      bodyStyles: { 
        fontSize: 8.5, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, 
        textColor: slate900,
        lineColor: slate200,
        lineWidth: 0.1
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { halign: 'center', cellWidth: 'wrap' },
        2: { halign: 'right', cellWidth: 'wrap' },
        3: { halign: 'right', cellWidth: 'wrap' },
      },
      styles: { overflow: 'linebreak', font: 'helvetica' },
      margin: { left: 8, right: 8 },
      didParseCell: (data) => {
        const rowData = data.row.raw as any;
        const type = rowData._type;
        if (data.section === 'head' && data.column.index === 0) {
          data.cell.styles.halign = 'center';
        }
        if (type === 'SECTION') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = blue900;
          data.cell.styles.fillColor = slate50;
          if (data.column.index === 0) {
            data.cell.colSpan = 4;
            data.cell.styles.halign = 'left';
          }
          data.cell.styles.overflow = 'visible';
        } else if (type === 'NOTE') {
          data.cell.styles.fontStyle = 'italic';
          data.cell.styles.textColor = slate600;
          if (data.column.index === 0) {
            data.cell.colSpan = 4;
            data.cell.styles.halign = 'left';
          }
        }
      }
    });

    // Summary Section
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    let currentY = finalY;
    if (currentY + 60 > doc.internal.pageSize.height) { doc.addPage(); currentY = 20; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    const rightAlignXSum = doc.internal.pageSize.width - 12;
    const labelXSum = doc.internal.pageSize.width - 60;

    // Divider
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.line(labelXSum - 4, currentY - 4, rightAlignXSum + 4, currentY - 4);

    doc.text('Total Bill', labelXSum, currentY);
    doc.text(formatCurrencyPDF(totals.total), rightAlignXSum, currentY, { align: 'right' });

    if (Math.abs(totals.total - totals.amountDue) > 0.01) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('Amount Due:', labelXSum, finalY + 6);
      doc.text(formatCurrencyPDF(totals.amountDue), rightAlignXSum, finalY + 6, { align: 'right' });
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Sub ERP | Bill Date: ${bill.date} | Printed: ${formatDateTime(new Date())}`, 10, pageHeight - 8);

    const sanitize = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    const filename = `Sub_ERP_Bill_${bill.number || 'Draft'}_${sanitize(vendor?.name || 'Vendor')}`;
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating bill PDF:', error);
    alert('Failed to generate PDF. Please check the console for details.');
  }
};

/**
 * Generate a Smart PDF for a Payment Receipt or Voucher
 */
export const generatePaymentPDF = (payment: any, company: any, partner: any, printedBy?: string, partnerBalance?: number) => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;

  const blue900: [number, number, number] = [30, 58, 138];
  const slate900: [number, number, number] = [15, 23, 42];
  const slate600: [number, number, number] = [71, 85, 105];
  const slate400: [number, number, number] = [148, 163, 184];
  const slate50: [number, number, number] = [248, 250, 252];
  const slate200: [number, number, number] = [226, 232, 240];

  // Company Info
  doc.setTextColor(slate900[0], slate900[1], slate900[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(String(company?.name || 'Company').toUpperCase(), margin, 18);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(String(company?.address || ''), margin, 23);
  if (company.registrationNumber) {
    doc.text(`Reg: ${company.registrationNumber}`, margin, 28);
  }

  // Header Title
  const title = payment.type === 'RECEIPT' ? 'MONEY RECEIPT' : 'PAYMENT VOUCHER';
  doc.setTextColor(blue900[0], blue900[1], blue900[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth - margin, 18, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${payment.number || 'DRAFT'}`, pageWidth - margin, 23, { align: 'right' });

  // Divider
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, 32, pageWidth - margin, 32);

  // Details Grid
  const detailsY = 38;
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(payment.type === 'RECEIPT' ? 'RECEIVED FROM' : 'PAID TO', margin, detailsY);
  
  doc.setTextColor(slate900[0], slate900[1], slate900[2]);
  doc.setFontSize(11);
  doc.text(String(partner?.name || 'N/A').toUpperCase(), margin, detailsY + 5);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(String(partner?.address || ''), margin, detailsY + 10, { maxWidth: 60 });

  // Right side details
  const rightColX = pageWidth / 2 + 10;
  doc.setFontSize(8);
  doc.setTextColor(slate400[0], slate400[1], slate400[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', rightColX, detailsY);
  doc.text('METHOD:', rightColX, detailsY + 6);
  doc.text('MEMO:', rightColX, detailsY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(slate900[0], slate900[1], slate900[2]);
  doc.setFontSize(9);
  doc.text(String(payment.date || ''), pageWidth - margin, detailsY, { align: 'right' });
  doc.text(String(payment.method || ''), pageWidth - margin, detailsY + 6, { align: 'right' });
  doc.text(String(payment.reference || 'N/A'), pageWidth - margin, detailsY + 12, { align: 'right' });

  // Amount Box
  const amountY = detailsY + 25;
  doc.setFillColor(slate50[0], slate50[1], slate50[2]);
  doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
  doc.roundedRect(margin, amountY, pageWidth - (margin * 2), 20, 1, 1, 'FD');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(slate600[0], slate600[1], slate600[2]);
  doc.text(`TOTAL AMOUNT ${payment.type === 'RECEIPT' ? 'RECEIVED' : 'PAID'}`, margin + 5, amountY + 12);
  
  doc.setFontSize(16);
  doc.setTextColor(slate900[0], slate900[1], slate900[2]);
  doc.text(formatCurrencyPDF(payment.amount), pageWidth - margin - 5, amountY + 13, { align: 'right' });

  let currentY = amountY + 28;

  // Applied Invoices Table
  if (payment.appliedInvoices && payment.appliedInvoices.length > 0) {
    const tableData = payment.appliedInvoices.map((a: any) => [
      a.invoiceNumber || a.invoiceId,
      formatCurrencyPDF(a.amount),
      formatCurrencyPDF(a.remaining || 0)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Invoice', 'Applied', 'Remaining']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: slate400, 
        fontStyle: 'bold', 
        fontSize: 8, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        lineColor: slate200,
        lineWidth: 0.1
      },
      bodyStyles: { 
        fontSize: 8.5, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, 
        textColor: slate900,
        lineColor: slate200,
        lineWidth: 0.1
      },
      margin: { left: margin, right: margin }
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Applied Bills Table
  if (payment.appliedBills && payment.appliedBills.length > 0) {
    const tableData = payment.appliedBills.map((a: any) => [
      a.billNumber || a.billId,
      formatCurrencyPDF(a.amount),
      formatCurrencyPDF(a.remaining || 0)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Bill', 'Applied', 'Remaining']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: slate400, 
        fontStyle: 'bold', 
        fontSize: 8, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        lineColor: slate200,
        lineWidth: 0.1
      },
      bodyStyles: { 
        fontSize: 8.5, 
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }, 
        textColor: slate900,
        lineColor: slate200,
        lineWidth: 0.1
      },
      margin: { left: margin, right: margin }
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Outstanding Balance
  if (partnerBalance !== undefined) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100);
    doc.text('OUTSTANDING BALANCE:', margin, currentY);
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(formatCurrencyPDF(partnerBalance), margin + 45, currentY);
    currentY += 15;
  }

  // Signature
  const sigY = Math.max(currentY + 20, 140);
  doc.setDrawColor(200);
  doc.line(pageWidth - margin - 40, sigY, pageWidth - margin, sigY);
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('AUTHORIZED SIGNATURE', pageWidth - margin - 20, sigY + 5, { align: 'center' });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(180);
  const footerText = `Generated by ${company.name} Smart ERP on ${formatDateTime(new Date())}`;
  doc.text(footerText, pageWidth / 2, pageHeight - 15, { align: 'center' });

  // Printed By
  if (printedBy) {
    doc.setFontSize(7);
    doc.text(`Printed By: ${printedBy}`, margin, pageHeight - 10);
  }

  doc.save(`${payment.type === 'RECEIPT' ? 'Receipt' : 'Payment'}_${payment.number || 'New'}.pdf`);
};

/**
 * Generate a PDF for an Inventory Adjustment
 */
export const generateInventoryAdjustmentPDF = (
  adjustment: InventoryAdjustment,
  company: Company,
  employee: Contact | undefined,
  printedBy?: string
) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageHeight = doc.internal.pageSize.height;

    // Colors
    const slate900: [number, number, number] = [15, 23, 42];
    const slate500: [number, number, number] = [100, 116, 139];
    const accentColor: [number, number, number] = [113, 75, 103]; // #714B67
    const secondaryColor: [number, number, number] = [0, 160, 157]; // #00A09D
    const lightGray: [number, number, number] = [241, 245, 249];

    // Header - Company Info
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(company?.name || 'Company').toUpperCase(), 10, 15);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate500[0], slate500[1], slate500[2]);
    if (company.address) {
      const addrLines = doc.splitTextToSize(String(company.address), 80);
      doc.text(addrLines, 10, 20);
    }

    // Document Title & Number
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('INVENTORY ADJUSTMENT', 10, 40);
    
    if (adjustment.status === 'DRAFT') {
      doc.setTextColor(220, 38, 38); // Red-600
      doc.setFontSize(12);
      doc.text('DRAFT', 10, 48);
      doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    }

    // Adjustment Info (Right Side)
    const rightAlignX = doc.internal.pageSize.width - 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Number: ${adjustment.number || 'Draft'}`, rightAlignX, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${adjustment.date}`, rightAlignX, 20, { align: 'right' });
    doc.text(`Status: ${adjustment.status}`, rightAlignX, 25, { align: 'right' });

    // Responsible Employee
    doc.setFont('helvetica', 'bold');
    doc.text('Responsible Employee:', 10, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(String(employee?.name || 'N/A'), 10, 65);
    if (employee?.email) doc.text(String(employee.email), 10, 70);

    // Table
    const tableData = (adjustment.items || []).map((item: any, index: number) => [
      index + 1,
      item.brand ? `${item.productName} [${item.brand}]` : item.productName,
      item.sku,
      item.currentQty,
      item.newQty,
      item.difference > 0 ? `+${item.difference}` : item.difference
    ]);

    autoTable(doc, {
      startY: 80,
      head: [['#', 'Product', 'SKU', 'Current Qty', 'New Qty', 'Difference']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: accentColor, 
        textColor: [255, 255, 255], 
        fontSize: 8.5,
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 8, 
        cellPadding: 2, 
        textColor: slate900,
        lineColor: [230, 230, 230],
        lineWidth: 0.1
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 25 },
      },
      styles: { overflow: 'linebreak', font: 'helvetica' },
      margin: { left: 10, right: 10 },
    });

    // Notes
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    if (adjustment.notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 10, finalY);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(adjustment.notes, 180);
      doc.text(noteLines, 10, finalY + 5);
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    
    let footerParts = ['Sub ERP'];
    if (printedBy) {
      footerParts.push(`Printed By: ${printedBy}`);
    }
    footerParts.push(`Adjustment Date: ${adjustment.date}`);
    footerParts.push(`Printed: ${formatDateTime(new Date())}`);
    
    const footerText = footerParts.join(' | ');
    doc.text(footerText, 10, pageHeight - 8);

    const sanitize = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    const filename = `Sub_ERP_${sanitize(company?.name || 'Adjustment')}_Adjustment_${adjustment.number || 'Draft'}`;
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating adjustment PDF:', error);
    alert('Failed to generate PDF. Please check the console for details.');
  }
};

export const generateExpensePDF = ({ expense, category, paymentMethod, vendor, company, printedBy }: any) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const blue900: [number, number, number] = [30, 58, 138];
    const slate900: [number, number, number] = [15, 23, 42];
    const slate600: [number, number, number] = [71, 85, 105];
    const slate400: [number, number, number] = [148, 163, 184];
    const slate50: [number, number, number] = [248, 250, 252];
    const slate200: [number, number, number] = [226, 232, 240];

    // Company Info (Top Left)
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(String(company?.name || 'COMPANY NAME').toUpperCase(), 8, 14);
  
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text(String(company?.address || 'Dhaka, Bangladesh'), 8, 19);

    // Expense Label (Top Right Badge)
    const isDraft = expense.status === 'DRAFT' || !expense.reference;
    const expenseLabel = isDraft ? 'DRAFT EXPENSE' : 'EXPENSE INVOICE';
  
    doc.setTextColor(blue900[0], blue900[1], blue900[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(expenseLabel, doc.internal.pageSize.width - 8, 14, { align: 'right' });
  
    doc.setFontSize(8);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${expense.reference || 'DRAFT'}`, doc.internal.pageSize.width - 8, 19, { align: 'right' });
    
    doc.text(`Date: ${expense.date}`, doc.internal.pageSize.width - 8, 24, { align: 'right' });

    // Divider
    doc.setDrawColor(slate200[0], slate200[1], slate200[2]);
    doc.setLineWidth(0.3);
    doc.line(8, 28, doc.internal.pageSize.width - 8, 28);

    // Payee Info (Vendor / Contact)
    doc.setFontSize(8);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYEE / VENDOR', 8, 34);
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(String(vendor?.name || 'Miscellaneous Payee'), 8, 39);
    
    if (vendor?.phone || vendor?.email) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(slate600[0], slate600[1], slate600[2]);
      const extraContact = [vendor.phone, vendor.email].filter(Boolean).join(' | ');
      doc.text(String(extraContact), 8, 43);
    }

    // Voucher details table using autoTable or simple drawing
    const listData = [
      {
        desc: expense.description || 'Operational Expenditure',
        cat: category?.name || 'Operating Expenses',
        method: paymentMethod?.name || 'Cash',
        amt: formatNumber(expense.amount || 0)
      }
    ];

    autoTable(doc, {
      startY: 48,
      margin: { left: 8, right: 8 },
      head: [['Description', 'Category', 'Payment Source', 'Amount']],
      body: listData.map(item => [item.desc, item.cat, item.method, `BDT ${item.amt}`]),
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138],
        fontSize: 8,
        font: 'helvetica',
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 35 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25, halign: 'right' }
      },
      styles: {
        fontSize: 8,
        textColor: [15, 23, 42],
        cellPadding: 3
      }
    });

    // Totals/Signatures Section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    // Add amount in words or narrative notes if any
    doc.setFontSize(8);
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: This document acts as an official internal operational expenditure voucher.', 8, finalY);

    // Total section right aligned
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(slate900[0], slate900[1], slate900[2]);
    doc.text(`TOTAL AMOUNT:`, doc.internal.pageSize.width - 32, finalY, { align: 'right' });
    doc.text(`BDT ${formatNumber(expense.amount || 0)}`, doc.internal.pageSize.width - 8, finalY, { align: 'right' });

    // Decorative signature lines at bottom
    const sigY = doc.internal.pageSize.height - 20;
    doc.setDrawColor(slate400[0], slate400[1], slate400[2]);
    doc.setLineWidth(0.2);
    
    // Prepared By
    doc.line(8, sigY, 40, sigY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slate600[0], slate600[1], slate600[2]);
    doc.text('Prepared By', 24, sigY + 3, { align: 'center' });

    // Audited By
    doc.line(55, sigY, 87, sigY);
    doc.text('Checked By', 71, sigY + 3, { align: 'center' });

    // Approved By
    doc.line(102, sigY, 138, sigY);
    doc.text('Approved By', 120, sigY + 3, { align: 'center' });

    // Footer printed timestamp
    const printedTimestamp = `Printed by ${printedBy || 'System User'} | ${formatDateTime(new Date())}`;
    doc.setFontSize(6);
    doc.setTextColor(slate400[0], slate400[1], slate400[2]);
    doc.text(printedTimestamp, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 4, { align: 'center' });

    const sanitize = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    const filename = `Expense_Invoice_${sanitize(expense.reference || 'DRAFT')}`;
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating expense PDF:', error);
    alert('Failed to generate PDF.');
  }
};

export const generateLedgerPDF = ({ companyName, dataToExport, dateRange, printedBy, filename }: any) => {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const formatNumberPDF = (num: number) => {
      if (!num || isNaN(num) || num === 0) return '-';
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Compact Header: One Line
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headerTitle = `${companyName.toUpperCase()}  |  GENERAL LEDGER  |  ${dateRange}`;
    doc.text(headerTitle, 5, 8);

    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(5, 10, doc.internal.pageSize.width - 5, 10);

    const tableData: any[] = [];
    dataToExport.forEach((item: any) => {
      if (item.type === 'header') {
        tableData.push([{ content: `${item.account.name} (${item.account.code})`, colSpan: 8, styles: { fillColor: [240, 245, 250], fontStyle: 'bold', textColor: [30, 58, 138], halign: 'left' } }]);
      } else if (item.type === 'opening') {
        tableData.push([
          '', '', '', 'Opening Balance', '', '', '',
          { content: formatNumberPDF(item.balance), styles: { fontStyle: 'bold' } }
        ]);
      } else if (item.type === 'transaction') {
        tableData.push([
          item.tx.date,
          item.tx.reference || '',
          item.tx.description || '',
          item.tx.partner_name || '',
          item.tx.prepared_by?.split(' ')[0] || '',
          item.tx.debit > 0 ? formatNumberPDF(item.tx.debit) : '-',
          item.tx.credit > 0 ? formatNumberPDF(item.tx.credit) : '-',
          { content: formatNumberPDF(item.tx.running_balance), styles: { fontStyle: 'bold' } }
        ]);
      } else if (item.type === 'total') {
        tableData.push([
          { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatNumberPDF(item.groupDebit), styles: { fontStyle: 'bold' } },
          { content: formatNumberPDF(item.groupCredit), styles: { fontStyle: 'bold' } },
          { content: formatNumberPDF(item.runningBal), styles: { fontStyle: 'bold' } }
        ]);
      }
    });

    autoTable(doc, {
      startY: 12,
      head: [['Date', 'Ref', 'Narration', 'Partner', 'User', 'Debit', 'Credit', 'Balance']],
      body: tableData,
      theme: 'grid',
      margin: { top: 12, left: 5, right: 5, bottom: 5 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1,
        font: 'helvetica',
        textColor: [15, 23, 42],
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        valign: 'middle',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontStyle: 'bold',
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center' }, // Date
        1: { halign: 'left' },   // Ref
        2: { halign: 'left' },   // Narration
        3: { halign: 'left' },   // Partner
        4: { halign: 'center' }, // User
        5: { halign: 'right' },  // Debit
        6: { halign: 'right' },  // Credit
        7: { halign: 'right' }   // Balance
      },
      didDrawPage: (data) => {
        // Redraw compact header on subsequent pages if needed
        if (data.pageNumber > 1) {
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(headerTitle, 5, 8);
          
          doc.setFontSize(6);
          doc.setTextColor(71, 85, 105);
          doc.setFont('helvetica', 'normal');
          doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}  |  Page ${data.pageNumber}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.line(5, 10, doc.internal.pageSize.width - 5, 10);
        }
      }
    });

    const sanitize = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    doc.save(`${sanitize(filename)}.pdf`);
  } catch (error) {
    console.error('Error in generateLedgerPDF', error);
    alert('Failed to generate PDF.');
  }
};

export const generatePartnerLedgerPDF = ({ title, companyName, dataToExport, dateRange, printedBy, filename }: any) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const formatNumberPDF = (num: number) => {
      if (!num || isNaN(num) || num === 0) return '-';
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Compact Header: One Line
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headerTitle = `${companyName.toUpperCase()}  |  ${title.toUpperCase()}  |  ${dateRange}`;
    doc.text(headerTitle, 5, 8);

    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(5, 10, doc.internal.pageSize.width - 5, 10);

    const tableData: any[] = [];
    dataToExport.forEach((item: any) => {
      if (item.type === 'header') {
        tableData.push([
          { 
            content: String(item.partnerName || '').toUpperCase(), 
            colSpan: 8, 
            styles: { fillColor: [240, 245, 250], fontStyle: 'bold', textColor: [30, 58, 138], halign: 'left' } 
          }
        ]);
      } else if (item.type === 'opening') {
        tableData.push([
          '', 
          { content: 'Opening Balance', colSpan: 4, styles: { fontStyle: 'bold', halign: 'left' } }, 
          { content: item.debit > 0 ? formatNumberPDF(item.debit) : '-', styles: { halign: 'right' } },
          { content: item.credit > 0 ? formatNumberPDF(item.credit) : '-', styles: { halign: 'right' } },
          { content: formatNumberPDF(item.balance), styles: { fontStyle: 'bold', halign: 'right' } }
        ]);
      } else if (item.type === 'transaction') {
        tableData.push([
          { content: item.tx.date, styles: { cellWidth: 15 } },
          { content: (item.tx.account || '').substring(0, 30), styles: { cellWidth: 28, overflow: 'hidden' } },
          { content: item.tx.reference || '', styles: { cellWidth: 20 } },
          { content: (item.tx.narration || '').substring(0, 55), styles: { cellWidth: 'auto', overflow: 'hidden' } },
          { content: item.tx.preparedBy?.split(' ')[0] || '', styles: { cellWidth: 15, overflow: 'hidden' } },
          { content: item.tx.debit > 0 ? formatNumberPDF(item.tx.debit) : '-', styles: { cellWidth: 18 } },
          { content: item.tx.credit > 0 ? formatNumberPDF(item.tx.credit) : '-', styles: { cellWidth: 18 } },
          { content: formatNumberPDF(item.tx.balance), styles: { cellWidth: 22, fontStyle: 'bold' } }
        ]);
      } else if (item.type === 'total') {
        tableData.push([
          { content: `TOTAL FOR ${String(item.partnerName || '').toUpperCase()}`, colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatNumberPDF(item.groupDebit), styles: { fontStyle: 'bold' } },
          { content: formatNumberPDF(item.groupCredit), styles: { fontStyle: 'bold' } },
          { content: formatNumberPDF(item.runningBal), styles: { fontStyle: 'bold' } }
        ]);
      } else if (item.type === 'spacer') {
        tableData.push([
          { content: '', colSpan: 8, styles: { cellPadding: 1, fillColor: [255, 255, 255] } }
        ]);
      }
    });

    autoTable(doc, {
      startY: 12,
      head: [['Date', 'Account', 'Ref', 'Narration', 'User', 'Debit', 'Credit', 'Balance']],
      body: tableData,
      theme: 'grid',
      margin: { top: 12, left: 5, right: 5, bottom: 5 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1,
        font: 'helvetica',
        textColor: [15, 23, 42],
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontStyle: 'bold',
        fontSize: 6.5,
        cellPadding: 1.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center' }, // Date
        1: { halign: 'left' },   // Account
        2: { halign: 'left' },   // Ref
        3: { halign: 'left' },   // Narration
        4: { halign: 'center' }, // User
        5: { halign: 'right' },  // Debit
        6: { halign: 'right' },  // Credit
        7: { halign: 'right' }   // Balance
      },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) {
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(headerTitle, 5, 8);
          
          doc.setFontSize(6);
          doc.setTextColor(71, 85, 105);
          doc.setFont('helvetica', 'normal');
          doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}  |  Page ${data.pageNumber}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.line(5, 10, doc.internal.pageSize.width - 5, 10);
        }
      }
    });

    const sanitizeFilename = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    doc.save(`${sanitizeFilename(filename)}.pdf`);
  } catch (error) {
    console.error('Error in generatePartnerLedgerPDF', error);
    alert('Failed to generate PDF.');
  }
};

export const generateInventoryValuationPDF = (
  options: PDFReportOptions,
  columns: PDFTableColumn[],
  data: any[]
) => {
  const { title, companyName, dateRange, filename, orientation = 'portrait', printedBy } = options;
  try {
    const doc = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: 'a4',
    });

    const activeCols = columns.filter(col => col.visible !== false);

    // Compact Header: One Line
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headerTitle = `${companyName.toUpperCase()}  |  ${title.toUpperCase()}  |  ${dateRange}`;
    doc.text(headerTitle, 5, 8);

    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(5, 10, doc.internal.pageSize.width - 5, 10);

    // Sanitize data
    const sanitizedData = data.map(row => {
      const newRow = { ...row };
      Object.keys(newRow).forEach(key => {
        if (typeof newRow[key] === 'number') {
          newRow[key] = newRow[key].toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        } else if (typeof newRow[key] === 'string') {
          newRow[key] = newRow[key].replace(/[৳]|Tk\.|Tk\s*=/g, '').trim();
        }
      });
      return newRow;
    });

    autoTable(doc, {
      startY: 12,
      columns: activeCols.map(c => ({ header: c.header, dataKey: c.dataKey })),
      body: sanitizedData,
      theme: 'grid',
      margin: { top: 12, left: 5, right: 5, bottom: 5 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1,
        font: 'helvetica',
        textColor: [15, 23, 42],
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        fontStyle: 'bold',
        fontSize: 6.5,
        cellPadding: 1.5,
      },
      columnStyles: activeCols.reduce((acc: any, col, idx) => {
        if (col.align) {
          acc[idx] = { halign: col.align };
        } else {
          const isNumeric = data.some(row => {
            const val = row[col.dataKey];
            if (typeof val === 'number') return true;
            if (typeof val === 'string') {
              return /^[৳]|\d+/.test(val.trim()) && !/[a-zA-Z]/.test(val);
            }
            return false;
          });
          acc[idx] = { halign: isNumeric ? 'right' : 'left' };
        }
        return acc;
      }, {}),
      didParseCell: (cellData) => {
        // Force header alignments
        if (cellData.row.section === 'head') {
          const colDef = activeCols[cellData.column.index];
          cellData.cell.styles.halign = colDef.align || cellData.cell.styles.halign || 'left';
        }

        const rowRaw = cellData.row.raw as any;
        const colCount = activeCols.length;

        // Dynamic Column Merging for Header Rows
        if (rowRaw.isHeader || rowRaw.isSubHeader) {
          const keys = activeCols.map(c => c.dataKey);
          const hasOtherData = keys.slice(1).some(key => {
            const val = rowRaw[key];
            return val !== undefined && val !== null && val !== '' && val !== '0.00' && val !== '-';
          });

          if (cellData.column.index === 0 && !hasOtherData) {
            cellData.cell.colSpan = colCount;
            cellData.cell.styles.halign = 'left';
          }
          
          cellData.cell.styles.fontStyle = 'bold';
          cellData.cell.styles.fillColor = rowRaw.isHeader ? [240, 245, 250] : [248, 250, 252];
          cellData.cell.styles.textColor = [15, 23, 42];
          cellData.cell.styles.fontSize = rowRaw.isHeader ? 7.5 : 7;
          cellData.cell.styles.overflow = 'visible';
        }

        // Dynamic Column Merging for Total/Summary Rows
        if (rowRaw.isTotal || rowRaw.isSubTotal || rowRaw.isGrandTotal) {
          cellData.cell.styles.fontStyle = 'bold';
          cellData.cell.styles.fillColor = [248, 250, 252];
          cellData.cell.styles.textColor = [30, 58, 138];
          cellData.cell.styles.fontSize = 7;

          // Merge label columns if they are empty
          if (cellData.column.index === 0) {
            let span = 1;
            const keys = activeCols.map(c => c.dataKey);
            for (let i = 1; i < keys.length; i++) {
              const val = rowRaw[keys[i]];
              if (!val || val === '' || val === '-') {
                span++;
              } else {
                break;
              }
            }
            if (span > 1) {
              cellData.cell.colSpan = span;
            }
          }

          const isGrandTotal = rowRaw.isGrandTotal || 
                             (rowRaw.name && rowRaw.name.includes('GRAND TOTAL')) || 
                             (rowRaw.product === 'TOTAL') || 
                             (rowRaw.date === 'GRAND TOTAL');
                             
          if (isGrandTotal) {
            cellData.cell.styles.lineWidth = { top: 0.3, bottom: 0.3, left: 0, right: 0 };
            cellData.cell.styles.fillColor = [241, 245, 249];
            cellData.cell.styles.textColor = [15, 23, 42];
          }
        }
      },
      didDrawPage: (pageData) => {
        if (pageData.pageNumber > 1) {
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(headerTitle, 5, 8);
          
          doc.setFontSize(6);
          doc.setTextColor(71, 85, 105);
          doc.setFont('helvetica', 'normal');
          doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}  |  Page ${pageData.pageNumber}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.line(5, 10, doc.internal.pageSize.width - 5, 10);
        }
      }
    });

    const sanitizeFilename = (str: any) => (str || '').toString().replace(/[^a-z0-9]/gi, '_');
    doc.save(`${sanitizeFilename(filename)}.pdf`);
  } catch (error) {
    console.error('Error in generateInventoryValuationPDF', error);
    alert('Failed to generate PDF.');
  }
};



export const generateCashLedgerPDF = ({ companyName, transactions, openingBalance, dateRange, printedBy, filename }: any) => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const formatNumberPDF = (num: number) => {
      if (!num || isNaN(num) || num === 0) return '-';
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Compact Header: One Line
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headerTitle = `${companyName.toUpperCase()}  |  CASH LEDGER  |  ${dateRange}`;
    doc.text(headerTitle, 5, 8);

    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text(`Printed by: ${printedBy || 'System'} at ${new Date().toLocaleString()}`, doc.internal.pageSize.width - 5, 8, { align: 'right' });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(5, 10, doc.internal.pageSize.width - 5, 10);

    const tableData: any[] = [];
    
    // Add opening balance row
    tableData.push([
      '', '', 'Opening Balance', '', '',
      { content: formatNumberPDF(openingBalance), styles: { fontStyle: 'bold' } }
    ]);
    
    let runningBalance = openingBalance;
    
    // Add transactions
    transactions.forEach((tx: any) => {
      runningBalance += tx.impact;
      tableData.push([
        { content: tx.date || '', styles: { cellWidth: 20 } },
        { content: tx.reference_number || '', styles: { cellWidth: 25 } },
        { content: (tx.description || '').substring(0, 50), styles: { cellWidth: 'auto', overflow: 'hidden' } }, // Narration
        { content: tx.debit > 0 ? formatNumberPDF(tx.debit) : '-', styles: { cellWidth: 20 } },
        { content: tx.credit > 0 ? formatNumberPDF(tx.credit) : '-', styles: { cellWidth: 20 } },
        { content: formatNumberPDF(runningBalance), styles: { cellWidth: 25, fontStyle: 'bold' } }
      ]);
    });
    
    // Add closing balance row
    tableData.push([
      { content: 'Closing Balance', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatNumberPDF(runningBalance), styles: { fontStyle: 'bold' } }
    ]);

    autoTable(doc, {
      startY: 12,
      head: [['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 2,
        halign: 'center'
      },
      styles: {
        fontSize: 6,
        cellPadding: 2,
        textColor: [15, 23, 42],
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'left' },
        2: { halign: 'left' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      margin: { left: 5, right: 5, bottom: 10 }
    });

    doc.save(filename + '.pdf');
  } catch (error) {
    console.error('Error generating cash ledger PDF:', error);
  }
};
