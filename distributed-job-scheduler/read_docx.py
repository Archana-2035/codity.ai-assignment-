import zipfile
import xml.etree.ElementTree as ET
import sys

def extract_text_from_docx(docx_path):
    try:
        with zipfile.ZipFile(docx_path, 'r') as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            
            # The namespace for Word XML
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            text_blocks = []
            for paragraph in tree.findall('.//w:p', namespaces):
                texts = [node.text for node in paragraph.findall('.//w:t', namespaces) if node.text]
                if texts:
                    text_blocks.append(''.join(texts))
            
            return '\n'.join(text_blocks)
    except Exception as e:
        return str(e)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        print(extract_text_from_docx(sys.argv[1]))
