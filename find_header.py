import pypdf
import sys
import re

def find_header(pdf_path, header_pattern):
    try:
        reader = pypdf.PdfReader(pdf_path)
        for i in range(len(reader.pages)):
            page_text = reader.pages[i].extract_text()
            if re.search(header_pattern, page_text, re.IGNORECASE):
                print(f"Found '{header_pattern}' at page {i + 1}")
                # Print a snippet of the page
                print(f"Snippet: {page_text[:500]}...")
                return i + 1
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python find_header.py <pdf_path> <header_pattern>")
    else:
        find_header(sys.argv[1], sys.argv[2])
