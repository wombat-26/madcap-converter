import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    formats: [
      {
        name: 'asciidoc',
        label: 'AsciiDoc',
        description: 'Clean, syntax-compliant AsciiDoc with minimal post-processing',
        extensions: ['.adoc', '.asciidoc'],
      },
      {
        name: 'writerside-markdown',
        label: 'Writerside Markdown',
        description: 'CommonMark-compliant converter optimized for JetBrains Writerside',
        extensions: ['.md'],
      },
      {
        name: 'zendesk',
        label: 'Zendesk HTML',
        description: 'Zendesk-optimized HTML with metadata and API integration',
        extensions: ['.html'],
      },
    ],
    inputTypes: [
      {
        name: 'html',
        label: 'HTML/HTM Files',
        extensions: ['.html', '.htm'],
        mimeTypes: ['text/html'],
      },
      {
        name: 'madcap',
        label: 'MadCap Flare Files',
        extensions: ['.htm', '.html', '.xml', '.flsnp'],
        mimeTypes: ['text/html', 'application/xml', 'text/xml'],
      },
      {
        name: 'word',
        label: 'Word Documents',
        extensions: ['.docx', '.doc'],
        mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
      },
    ],
  });
}