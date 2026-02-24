import pypdf
import sys
import re
import io

def extract_to_file(pdf_path, start_page, end_page, output_path):
    try:
        reader = pypdf.PdfReader(pdf_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            for i in range(start_page - 1, min(end_page, len(reader.pages))):
                f.write(f"--- Page {i+1} ---\n")
                try:
                    text = reader.pages[i].extract_text()
                    f.write(text + "\n")
                except Exception as e:
                    f.write(f"[Extraction Error on Page {i+1}: {e}]\n")
        print(f"Successfully extracted pages {start_page}-{end_page} to {output_path}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python extract_pdf.py <pdf_path> <start_page> <end_page> <output_path>")
    else:
        extract_to_file(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
