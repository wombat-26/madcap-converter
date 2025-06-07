# GitHub Setup Instructions

## Option 1: Create Repository via GitHub Web Interface

1. **Go to GitHub** (github.com)
2. **Click the "+" icon** in the top right, then "New repository"
3. **Configure the repository:**
   - Repository name: `document-converter`
   - Description: `MCP server for converting HTML, Word, and MadCap Flare documents to Markdown/AsciiDoc`
   - Visibility: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. **Click "Create repository"**

## Option 2: Create Repository via GitHub CLI (if installed)

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS)
# Or download from: https://cli.github.com/

# Login to GitHub
gh auth login

# Create new repository
gh repo create document-converter --public --description "MCP server for converting HTML, Word, and MadCap Flare documents to Markdown/AsciiDoc"
```

## Sync to GitHub

After creating the repository, run these commands:

```bash
# Add GitHub remote (replace with your actual GitHub URL)
git remote add origin https://github.com/YOUR_USERNAME/document-converter.git

# Or if using SSH
git remote add origin git@github.com:YOUR_USERNAME/document-converter.git

# Push to GitHub
git push -u origin main

# Verify the push was successful
git remote -v
```

## Quick GitHub Sync Commands

If you have the GitHub repository URL ready:

```bash
# Add the remote and push in one go
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## GitHub Repository Features to Enable

After pushing, consider:

1. **Issues** - For bug tracking and feature requests
2. **Wiki** - For extended documentation
3. **Actions** - For CI/CD automation
4. **Security** - Enable security advisories
5. **Insights** - Track repository analytics
6. **Pages** - Host documentation website

## Example GitHub Actions Workflow

Create `.github/workflows/ci.yml` for automated testing:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - run: npm ci
    - run: npm run build
    - run: npm test
```

## Repository Topics

Add these topics to your GitHub repository for better discoverability:
- `mcp`
- `model-context-protocol`
- `document-converter`
- `markdown`
- `asciidoc`
- `html-converter`
- `word-converter`
- `madcap-flare`
- `typescript`
- `claude-desktop`