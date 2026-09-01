import sys

with open("components/BillManager.tsx", "r") as f:
    content = f.read()

# Simple replacements
content = content.replace("BillManager", "InvoiceManager")
content = content.replace("BillManagerProps", "InvoiceManagerProps")
content = content.replace("bill", "invoice")
content = content.replace("Bill", "Invoice")
content = content.replace("BILL", "INVOICE")
content = content.replace("vendor", "customer")
content = content.replace("Vendor", "Customer")
content = content.replace("VENDOR", "CUSTOMER")
content = content.replace("docs_bills", "docs_invoices")

# Specific replacements for Invoice
content = content.replace("store.payInvoice", "store.payInvoice")

with open("components/InvoiceManager.tsx", "w") as f:
    f.write(content)
