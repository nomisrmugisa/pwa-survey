import pypdf
import sys
import re

def find_se_starts(pdf_path):
    reader = pypdf.PdfReader(pdf_path)
    se_starts = {}
    
    # We expect headers like "1 MANAGEMENT AND LEADERSHIP", "2 HUMAN RESOURCE MANAGEMENT", etc.
    # We'll start searching from page 20 to avoid TOC.
    for i in range(19, len(reader.pages)):
        text = reader.pages[i].extract_text()
        # Look for "X [A-Z]+ [A-Z ]+" at the beginning of the text or after a newline
        # Example: "\n1 MANAGEMENT AND LEADERSHIP"
        match = re.search(r'^\s*(\d+)\s+([A-Z][A-Z\s]+)', text, re.MULTILINE)
        if match:
            se_num = match.group(1)
            se_name = match.group(2).strip()
            if se_num not in se_starts and int(se_num) <= 10:
                se_starts[se_num] = {"page": i + 1, "name": se_name}
                print(f"Found SE {se_num}: {se_name} at page {i + 1}")
    
    return se_starts

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python find_se_starts.py <pdf_path>")
    else:
        results = find_se_starts(sys.argv[1])
        import json
        print(json.dumps(results, indent=2))
