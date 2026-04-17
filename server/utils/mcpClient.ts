// @ts-ignore — markit-mcp is a file: dependency pointing to ../mcp
import { allTools, callTool } from 'markit-mcp'

export async function getMcpClient(): Promise<null> {
  return null
}

export async function listMcpTools(_client?: any) {
  return allTools.map((t: any) => ({
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema,
  }))
}

export async function callMcpTool(
  _client: any,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return callTool(name, args)
}
