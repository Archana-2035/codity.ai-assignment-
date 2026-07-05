const fs = require('fs');
const xml = fs.readFileSync('docx_extract2/word/document.xml', 'utf8');

const textMatches = xml.match(/<w:t[^>]*>.*?<\/w:t>/g) || [];
const text = textMatches.map(t => t.replace(/<[^>]+>/g, '')).join('\n');
fs.writeFileSync('docx_extract2/extracted_text_utf8.txt', text, 'utf8');
