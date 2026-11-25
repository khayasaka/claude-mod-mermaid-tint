// The values mermaid-tint keeps in $.state.
// They keep the session's scratchpad folder when a reload (a saved file, /reload-plugins) clears the module's variables.
// claude plugin validate wants the keys written directly inside PluginState

// The $.state keys. hooks/register.tsx imports this file for them
export type MermaidTintStateKey = 'scratchpadDir'

declare module 'claude-code' {
  interface PluginState {
    'mermaid-tint': {
      // The session's scratchpad folder from the SessionStart hook's input. Diagrams are cached there
      scratchpadDir: string
    }
  }
}
