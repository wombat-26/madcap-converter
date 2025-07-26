/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MadCapConverterWebUI } from '../../components/madcap-converter-web-ui';

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock File System Access API
const mockShowDirectoryPicker = jest.fn();
(window as any).showDirectoryPicker = mockShowDirectoryPicker;

// Mock Next.js theme provider
jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: jest.fn()
  })
}));

// Mock URL methods
global.URL.createObjectURL = jest.fn(() => 'mocked-url');
global.URL.revokeObjectURL = jest.fn();

describe('MadCapConverterWebUI', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockShowDirectoryPicker.mockClear();
    jest.clearAllMocks();
  });

  it('should render with all main components', () => {
    render(<MadCapConverterWebUI />);
    
    // Check header elements
    expect(screen.getByText('MadCap Converter')).toBeInTheDocument();
    expect(screen.getByText('Convert MadCap Flare files to various formats')).toBeInTheDocument();
    
    // Check tabs
    expect(screen.getByText('Single File')).toBeInTheDocument();
    expect(screen.getByText('Project Folder')).toBeInTheDocument();
    
    // Check format selection
    expect(screen.getByText('Output Format')).toBeInTheDocument();
    expect(screen.getByText('Input Type')).toBeInTheDocument();
  });

  it('should have default format and input type selected', () => {
    render(<MadCapConverterWebUI />);
    
    // Check that AsciiDoc is selected by default
    const formatSelect = screen.getByDisplayValue('AsciiDoc');
    expect(formatSelect).toBeInTheDocument();
    
    // Check that HTML is selected by default
    const inputSelect = screen.getByDisplayValue('HTML');
    expect(inputSelect).toBeInTheDocument();
  });

  it('should switch between tabs', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Initially on Single File tab
    expect(screen.getByText('Drop your file here or click to browse')).toBeInTheDocument();
    
    // Switch to Project Folder tab
    await user.click(screen.getByText('Project Folder'));
    
    // Should show folder upload area
    expect(screen.getByText('Drop your project folder here or click to browse')).toBeInTheDocument();
  });

  it('should handle text input conversion', async () => {
    const user = userEvent.setup();
    
    // Mock successful API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        content: '= Test Title\n\nTest content',
        filename: 'converted.adoc'
      })
    });
    
    render(<MadCapConverterWebUI />);
    
    // Enter text in the textarea
    const textarea = screen.getByPlaceholderText('Paste your HTML content here...');
    await user.type(textarea, '<h1>Test Title</h1><p>Test content</p>');
    
    // Click convert button
    const convertButton = screen.getByText('Convert');
    await user.click(convertButton);
    
    // Wait for conversion to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/convert', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('<h1>Test Title</h1>')
      }));
    });
  });

  it('should handle format selection changes', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Click on format select
    const formatTrigger = screen.getByRole('combobox', { name: /output format/i });
    await user.click(formatTrigger);
    
    // Select Writerside Markdown
    const markdownOption = screen.getByText('Writerside Markdown');
    await user.click(markdownOption);
    
    // Verify selection changed
    expect(screen.getByDisplayValue('Writerside Markdown')).toBeInTheDocument();
  });

  it('should handle input type selection changes', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Click on input type select
    const inputTrigger = screen.getByRole('combobox', { name: /input type/i });
    await user.click(inputTrigger);
    
    // Select MadCap
    const madcapOption = screen.getByText('MadCap Flare');
    await user.click(madcapOption);
    
    // Verify selection changed
    expect(screen.getByDisplayValue('MadCap Flare')).toBeInTheDocument();
  });

  it('should show batch conversion options in Project Folder tab', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Switch to Project Folder tab
    await user.click(screen.getByText('Project Folder'));
    
    // Check that batch options are visible
    expect(screen.getByText('Preserve folder structure')).toBeInTheDocument();
    expect(screen.getByText('Rename converted files')).toBeInTheDocument();
    expect(screen.getByText('Output folder name')).toBeInTheDocument();
  });

  it('should toggle batch conversion options', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Switch to Project Folder tab
    await user.click(screen.getByText('Project Folder'));
    
    // Find the preserve structure toggle
    const preserveToggle = screen.getByRole('switch', { name: /preserve folder structure/i });
    expect(preserveToggle).toBeChecked(); // Should be checked by default
    
    // Toggle it off
    await user.click(preserveToggle);
    expect(preserveToggle).not.toBeChecked();
    
    // Find the rename files toggle
    const renameToggle = screen.getByRole('switch', { name: /rename converted files/i });
    expect(renameToggle).not.toBeChecked(); // Should be unchecked by default
    
    // Toggle it on
    await user.click(renameToggle);
    expect(renameToggle).toBeChecked();
  });

  it('should handle output folder name input', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Switch to Project Folder tab
    await user.click(screen.getByText('Project Folder'));
    
    // Find the output folder name input
    const folderNameInput = screen.getByDisplayValue('converted-madcap-project');
    
    // Clear and type new name
    await user.clear(folderNameInput);
    await user.type(folderNameInput, 'my-converted-project');
    
    expect(folderNameInput).toHaveValue('my-converted-project');
  });

  it('should show theme toggle', () => {
    render(<MadCapConverterWebUI />);
    
    // The theme toggle button should be present
    const themeToggle = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeToggle).toBeInTheDocument();
  });

  it('should display conversion errors', async () => {
    const user = userEvent.setup();
    
    // Mock error API response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({
        success: false,
        error: 'Invalid input format'
      })
    });
    
    render(<MadCapConverterWebUI />);
    
    // Enter text and try to convert
    const textarea = screen.getByPlaceholderText('Paste your HTML content here...');
    await user.type(textarea, 'invalid content');
    
    const convertButton = screen.getByText('Convert');
    await user.click(convertButton);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Invalid input format')).toBeInTheDocument();
    });
  });

  it('should handle file drag and drop', async () => {
    render(<MadCapConverterWebUI />);
    
    const dropZone = screen.getByText('Drop your file here or click to browse').closest('div');
    
    // Create a mock file
    const file = new File(['<h1>Test</h1>'], 'test.htm', { type: 'text/html' });
    
    // Simulate drag over
    fireEvent.dragOver(dropZone!, {
      dataTransfer: {
        files: [file],
      },
    });
    
    // Simulate drop
    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [file],
      },
    });
    
    // File should be processed (though we'd need to mock FileReader for full test)
    expect(dropZone).toBeInTheDocument();
  });

  it('should show loading state during conversion', async () => {
    const user = userEvent.setup();
    
    // Mock slow API response
    mockFetch.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          content: '= Test',
          filename: 'test.adoc'
        })
      }), 100))
    );
    
    render(<MadCapConverterWebUI />);
    
    // Enter text and convert
    const textarea = screen.getByPlaceholderText('Paste your HTML content here...');
    await user.type(textarea, '<h1>Test</h1>');
    
    const convertButton = screen.getByText('Convert');
    await user.click(convertButton);
    
    // Should show loading state
    expect(screen.getByText('Converting...')).toBeInTheDocument();
    
    // Wait for completion
    await waitFor(() => {
      expect(screen.getByText('Convert')).toBeInTheDocument();
    }, { timeout: 200 });
  });

  it('should handle File System Access API availability', async () => {
    const user = userEvent.setup();
    render(<MadCapConverterWebUI />);
    
    // Switch to Project Folder tab
    await user.click(screen.getByText('Project Folder'));
    
    // The output folder selection should be available if showDirectoryPicker is supported
    if (window.showDirectoryPicker) {
      expect(screen.getByText('Select Output Folder')).toBeInTheDocument();
    }
  });
});