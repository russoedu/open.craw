// The hooks the fixture shop's api recipe calls, as a module the cli (--hooks)
// and the MCP server (OPENCRAW_HOOKS) load.
export default {
  positive: value => Number(value) > 0,
}
