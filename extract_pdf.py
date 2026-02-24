import pypdf
import sys
import re
import io

# Ensure stdout reflects utf-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def analyze_pdf(pdf_path):
    try:
        reader = pypdf.PdfReader(pdf_path)
        num_pages = len(reader.pages)
        print(f"Total Pages: {num_pages}")
        
        # Search for SE headers to find page ranges
        se_ranges = {}
        for i in range(num_pages):
            try:
                page_text = reader.pages[i].extract_text()
            except:
                continue
            # Match "X [A-Z]+ [A-Z ]+"
            matches = re.finditer(r'(SE|Service Element)\s*(\d+)', page_text, re.IGNORECASE)
            for match in matches:
                se_num = match.group(2)
                if se_num not in se_ranges:
                    se_ranges[se_num] = i + 1
                    print(f"Found SE {se_num} at page {i + 1}")
        
        return se_ranges
    except Exception as e:
        return f"Error: {e}"

def extract_pages(pdf_path, start_page, end_page):
    try:
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for i in range(start_page - 1, min(end_page, len(reader.pages))):
            text += f"--- Page {i+1} ---\n"
            try:
                text += reader.pages[i].extract_text() + "\n"
            except:
                text += "[Extraction Error]\n"
        return text
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf.py <pdf_path> [start_page] [end_page]")
    elif len(sys.argv) == 2:
        print(analyze_pdf(sys.argv[1]))
    else:
        start = int(sys.argv[2])
        end = int(sys.argv[3])
        print(extract_pages(sys.argv[1], start, end))
