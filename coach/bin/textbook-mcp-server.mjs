import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadTextbookKnowledge } from '@riichi-coach/desktop/textbook-knowledge';
import { createTextbookMcpServer } from '@riichi-coach/desktop/textbook-mcp';

try {
  if(process.argv.length!==3)throw Error('expected library directory');
  const knowledge=await loadTextbookKnowledge(process.argv[2]);
  const server=createTextbookMcpServer(knowledge);
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write('textbook_mcp_start_failed\n');
  process.exitCode=1;
}
