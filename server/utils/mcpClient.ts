import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'

let _client: Client | null = null

export async function getMcpClient(): Promise<Client> {
  if (_client) return _client

  const mcpServerPath =
    process.env.MCP_SERVER_PATH ??
    path.resolve(process.cwd(), '../mcp/dist/index.js')

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined) as [string, string][]
      ),
      COMPANY_ID: '_bridge_', // overridden per-call via tool args
    },
  })

  _client = new Client({ name: 'markit-chatbox', version: '1.0.0' }, { capabilities: {} })

  try {
    await _client.connect(transport)
  } catch (err) {
    _client = null
    throw err
  }

  return _client
}

export async function listMcpTools(client: Client) {
  const result = await client.listTools()
  return result.tools
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args })
  // MCP returns content array — extract the text
  const content = (result.content as Array<{ type: string; text?: string }>)[0]
  if (content?.type === 'text' && content.text) {
    try {
      return JSON.parse(content.text)
    } catch {
      return content.text
    }
  }
  return result.content
}
