export class MCPClient {
    apiEndpoint;
    isHealthy = false;
    constructor(apiEndpoint = '/api/mcp') {
        this.apiEndpoint = apiEndpoint;
        this.checkHealth();
    }
    async checkHealth() {
        try {
            const healthEndpoint = this.apiEndpoint.replace('/mcp', '/health');
            const response = await fetch(healthEndpoint);
            this.isHealthy = response.ok;
            return this.isHealthy;
        }
        catch {
            this.isHealthy = false;
            return false;
        }
    }
    async testConnection() {
        try {
            const result = await this.listTools();
            return !!(result.result && result.result.tools);
        }
        catch {
            return false;
        }
    }
    async sendRequest(request) {
        const maxRetries = 3;
        const retryDelay = 1000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(request),
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }
                const data = await response.json();
                return data;
            }
            catch (error) {
                const isLastAttempt = attempt === maxRetries;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                // Don't retry on abort errors (timeout)
                if (errorMessage.includes('abort')) {
                    throw new Error(`MCP request timed out after 5 minutes`);
                }
                if (isLastAttempt) {
                    throw new Error(`MCP request failed after ${maxRetries} attempts: ${errorMessage}`);
                }
                console.warn(`MCP request attempt ${attempt} failed: ${errorMessage}. Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        throw new Error('Unexpected error in sendRequest');
    }
    async listTools() {
        const request = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {}
        };
        return this.sendRequest(request);
    }
    async convertDocument(input, options) {
        const request = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "convert_document",
                arguments: {
                    input,
                    ...options
                }
            }
        };
        return this.sendRequest(request);
    }
    async convertFile(inputPath, outputPath, options) {
        const request = {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
                name: "convert_file",
                arguments: {
                    inputPath,
                    outputPath,
                    ...options
                }
            }
        };
        return this.sendRequest(request);
    }
    async convertFolder(inputDir, outputDir, options) {
        const request = {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
                name: "convert_folder",
                arguments: {
                    inputDir,
                    outputDir,
                    ...options
                }
            }
        };
        return this.sendRequest(request);
    }
    async analyzeFolder(inputDir) {
        const request = {
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: {
                name: "analyze_folder",
                arguments: {
                    inputDir
                }
            }
        };
        return this.sendRequest(request);
    }
    async getSupportedFormats() {
        const request = {
            jsonrpc: "2.0",
            id: 6,
            method: "tools/call",
            params: {
                name: "get_supported_formats",
                arguments: {}
            }
        };
        return this.sendRequest(request);
    }
    async discoverTOCs(projectPath) {
        const request = {
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: {
                name: "discover_tocs",
                arguments: {
                    projectPath
                }
            }
        };
        return this.sendRequest(request);
    }
    async convertWithTOCStructure(projectPath, outputDir, options) {
        const request = {
            jsonrpc: "2.0",
            id: 8,
            method: "tools/call",
            params: {
                name: "convert_with_toc_structure",
                arguments: {
                    projectPath,
                    outputDir,
                    ...options
                }
            }
        };
        return this.sendRequest(request);
    }
    async convertToWritersideProject(inputDir, outputDir, options) {
        const request = {
            jsonrpc: "2.0",
            id: 9,
            method: "tools/call",
            params: {
                name: "convert_to_writerside_project",
                arguments: {
                    inputDir,
                    outputDir,
                    ...options
                }
            }
        };
        return this.sendRequest(request);
    }
}
