
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { Product } from '../types';

interface LabelData {
  name: string;
  sku: string;
  price: number;
  barcodeValue: string;
  serialNumber?: string;
}

export const generateBarcodePDF = (products: Product[], options?: { includeSerials?: boolean }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const labels: LabelData[] = [];

  products.forEach(product => {
    if (options?.includeSerials && product.trackingType === 'SERIAL' && product.serialNumbers && product.serialNumbers.length > 0) {
      product.serialNumbers.forEach(sn => {
        labels.push({
          name: product.name,
          sku: product.sku,
          price: product.price,
          barcodeValue: sn,
          serialNumber: sn
        });
      });
    } else {
      labels.push({
        name: product.name,
        sku: product.sku,
        price: product.price,
        barcodeValue: product.barcode || product.sku || product.id
      });
    }
  });

  let x = 10;
  let y = 10;
  const labelWidth = 60;
  const labelHeight = 40;
  const margin = 5;

  labels.forEach((label, index) => {
    if (index > 0 && index % 15 === 0) {
      doc.addPage();
      x = 10;
      y = 10;
    }

    // Draw label border
    doc.setDrawColor(200);
    doc.rect(x, y, labelWidth, labelHeight);

    // Product Name
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(label.name.substring(0, 25), x + 2, y + 5);

    // SKU
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.text(`SKU: ${label.sku || 'N/A'}`, x + 2, y + 8);

    // Serial if present
    if (label.serialNumber) {
      doc.setFontSize(6);
      doc.setTextColor(100);
      doc.text(`SN: ${label.serialNumber}`, x + 2, y + 11);
    }

    // Price
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Price: ${label.price.toFixed(2)}`, x + 2, y + 15);

    // Barcode
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, label.barcodeValue, {
        format: 'CODE128',
        width: 1,
        height: 40,
        displayValue: false,
        margin: 0
      });
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', x + 2, y + 18, labelWidth - 4, 18);
      
      // Print the value below barcode manually for better control
      doc.setFontSize(7);
      doc.text(label.barcodeValue, x + labelWidth / 2, y + 38, { align: 'center' });
    } catch (err) {
      console.error('Barcode generation failed for', label.barcodeValue, err);
      doc.text('Barcode Error', x + 2, y + 25);
    }

    // Move to next position
    x += labelWidth + margin;
    if (x + labelWidth > 200) {
      x = 10;
      y += labelHeight + margin;
    }
  });

  doc.save(`barcodes_${new Date().getTime()}.pdf`);
};

export const generateSingleBarcodePDF = (product: Product, quantity: number = 1) => {
  const products = Array.from({ length: quantity }, () => product);
  generateBarcodePDF(products);
};
