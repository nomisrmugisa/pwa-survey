import fitz
import re
import sys

pdf_path = "Matrix-NHQS-for-Emergency-Medical-Services-06.01.2026 (2).pdf"

try:
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text") # Get natural reading order text
        
        if "1.2.4.10" in text:
            print(f"--- FOUND ON PAGE {page_num + 1} ---")
            lines = text.split('\n')
            for i, line in enumerate(lines):
                if "1.2.4.10" in line:
                    start = max(0, i - 10)
                    end = min(len(lines), i + 10)
                    print("\nContext:")
                    for j in range(start, end):
                        prefix = ">> " if j == i else "   "
                        print(f"{prefix}{lines[j]}")
except Exception as e:
    print(f"Error: {e}")
