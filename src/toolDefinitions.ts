import { SYSTEM_PROMPT } from './systemPrompt';
import { ToolDefinition } from './types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_workspace_info',
      description:
        'Returns the absolute path of the current VS Code workspace root and a list of top-level ' +
        'files/folders. Call this FIRST if you are unsure what the workspace contains, or if a ' +
        'previous tool call returned a "No workspace folder" or "File not found" error.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read lines from a file, or list directory contents if the path points to a folder. ' +
        'For files: returns numbered lines and the total line count. ' +
        'For directories: returns isDirectory=true, path, entries (with name/type/size), and totalEntries. ' +
        'Entries are sorted with directories first, then files, both alphabetically. ' +
        'Use this to understand code structure before making edits.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path relative to the workspace root (e.g. "src/index.ts")',
          },
          startLine: {
            type: 'number',
            description: 'First line to read, 1-based. Defaults to 1.',
          },
          endLine: {
            type: 'number',
            description: 'Last line to read, 1-based. Defaults to end of file.',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_in_file',
      description:
        'Search for an exact string in a file and return its current line number plus surrounding context. ' +
        'Useful when you need to locate code before editing.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path relative to the workspace root',
          },
          searchString: {
            type: 'string',
            description: 'Exact string to search for (case-sensitive)',
          },
          contextBefore: {
            type: 'number',
            description: 'Lines of context to show before the match (default 2)',
          },
          contextAfter: {
            type: 'number',
            description: 'Lines of context to show after the match (default 2)',
          },
          occurrence: {
            type: 'number',
            description:
              'Which occurrence to return when the string appears multiple times (default 1 = first)',
          },
        },
        required: ['filePath', 'searchString'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description:
         'Edit a range of lines in a file with new content. ' +
        'A secondary LLM check will automatically verify the change before it is applied — ' +
        'the LLM focuses on comparing before/after code sections for semantic consistency and logical correctness. ' +
        'HOST ENFORCEMENT (hard rule): If the file already exists in the workspace, you MUST call read_file or find_in_file (with a match) on that exact path after the latest user message and before this edit — the tool will reject edit otherwise. ' +
        'Exception: creating a brand-new file (path not yet present) does not require a prior read. ' +
        'After every successful edit on a file, line-query permission is cleared — you must read_file or find_in_file again before another edit on the same file. ' +
        'To insert without removing any lines, set endLine = startLine - 1. ' +
        'To delete lines, set newContent to an empty string \"\". ' +
        'After an edit, call read_file to verify the result.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path relative to the workspace root',
          },
          startLine: {
            type: 'number',
            description: 'First line of the range to edit (1-based, inclusive)',
          },
          endLine: {
            type: 'number',
            description:
              'Last line of the range to edit (1-based, inclusive). ' +
              'Set to startLine - 1 to perform a pure insert.',
          },
           newContent: {
            type: 'string',
            description:
                'Edit text. Empty string to delete the range. ' +
                'For multi-line content, leave newContent empty and put the text inside <edit-content> tags in your visible response (avoids JSON escaping).',
          },

        },
        required: ['filePath', 'startLine', 'endLine', 'newContent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description:
        'Create a directory (folder) in the workspace. Can create nested directories if recursive is true.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Directory path relative to the workspace root',
          },
          recursive: {
            type: 'boolean',
            description: 'Create parent directories if they do not exist (default: true)',
          },
        },
        required: ['dirPath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description:
        'Signal that the current user request is fully completed and the agent should stop. ' +
        'Call this exactly once when you are done. Optionally include a brief final summary.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Optional brief final summary to show to the user.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_todo_list',
      description:
        'MUST be called at the start of any multi-step task. ' +
        'Creates a structured todo list that tracks progress through the task. ' +
        'When todo list is empty: creates a new list with the given goal and items. ' +
        'When todo list exists: use expandIndex to expand the specified item into a new parallel todo list (replacing that item). ' +
        'For example, if list is [a,b,c] and expandIndex=1 with new items [e,f], result should be [a,e,f,c]. ' +
        'When enabled in VS Code settings (vibe-coding.todolistReview.*), the extension runs a blocking independent review: ' +
        'new/replace lists are todolist.generate; expand is todolist.edit. On repeated review failure the tool returns an error JSON with reviewNotesAccumulated and does not apply changes.',
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            description:
              'A single sentence stating WHAT needs to be done and WHY ' +
              '(the problem being solved or feature being added).',
          },
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ordered list of steps to complete. Be specific and concrete.',
          },
          expandIndex: {
            type: 'number',
            description: 'Optional 0-based index of the item to expand into a new parallel todo list. Use only when todo list already exists.',
          },
        },
        required: ['goal', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo_item',
      description:
        'Mark a todo list item as done after finishing it. ' +
        'Call this immediately after each step is verified correct. ' +
        'Include a brief summary of what was actually done.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: '0-based index of the completed item.',
          },
          summary: {
            type: 'string',
            description: 'One-sentence description of what was done.',
          },
        },
        required: ['index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compact',
      description:
        'Compact the conversation history into a concise summary. Use this when the conversation is getting long and you want to reduce context window usage.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description:
        'Get diagnostics (problems, warnings, errors) from VS Code for a specific file or all files. ' +
        'Can be called with a filePath (relative path) or URI. If no parameter is provided, returns diagnostics for all files in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'URI of the file to get diagnostics for (e.g., file:///path/to/file.ts). Optional if filePath is provided.',
          },
          filePath: {
            type: 'string',
            description: 'File path relative to the workspace root (e.g., src/index.ts). Optional if uri is provided.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description:
        'Return metadata for a file or directory under the workspace: exists, size, modification time, isFile/isDirectory. ' +
        'Use to verify paths before reading or editing.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path relative to the workspace root',
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_notification',
      description:
        'Show a short VS Code notification (toast) to the user. Use sparingly for important status.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message text' },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'error'],
            description: 'Defaults to info',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell_command',
      description:
        'Run a shell command with the workspace folder as current working directory. ' +
        'Output is captured (stdout/stderr). The extension runs a dedicated shell editor agent on your proposed command, ' +
        'then an independent review for safety and for avoiding ANY shell-based file operations (reading/writing workspace files); ' +
        'if review passes, the user may confirm before execution. **DO NOT use shell commands to write or modify workspace files** — ' +
        'use the dedicated read_file, edit, and create_directory tools for file operations. Prefer read_file for reading code. ' +
        'Reading a single non-code artifact (e.g. .log/.txt/.md) via shell may be acceptable when explicitly requested. Use this tool only for builds, tests, or package managers (npm install, git status, etc.). ' +
        'Avoid destructive commands unless the user explicitly asked.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Single shell command line (e.g. npm test, git status)',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description:
         'List all available skill directories from both the workspace-local (.OpenVibe/skills/) and the global skills pool. ' +
        'Returns an array of skill names (directory names). Workspace-local skills take precedence over global ones with the same name. Use this to discover which skills are available to load or activate.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description:
        'Load a skill (SKILL.md file), parse its YAML frontmatter, and return the structured content. ' +
        'Searches workspace-local (.OpenVibe/skills/) first, then the global skills pool. ' +
        'Skills are instruction sets that describe a persona or behavior. The returned object includes the skill name, description, full instruction text, and any sub-skills referenced.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the skill directory (e.g. "paper-revision-router")',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'activate_skill',
      description:
        'Activate a skill for the current conversation. The activated skill instructions will be injected into the system prompt for all subsequent AI responses in this conversation. ' +
        'The skill must exist in either workspace-local (.OpenVibe/skills/) or the global skills pool. ' +
        'Use deactivate_skill to remove it, and list_activated_skills to see which skills are active. ' +
        'Skill activation is persisted per conversation so it survives window reloads.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the skill to activate (e.g. "paper-revision-router")',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deactivate_skill',
      description:
        'Deactivate a skill for the current conversation. The skill instructions will no longer be injected into the system prompt. ' +
        'Use list_activated_skills to see which skills are currently active.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the skill to deactivate',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_activated_skills',
      description:
        'List all skills currently activated in this conversation. Returns an array of skill names whose instructions are being injected into the system prompt.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_human',
      description:
        'Request human assistance for a task that cannot be performed by AI alone. ' +
        'Use this when you need the user to: manually test a feature, confirm a design decision, ' +
        'run an app/program to verify behavior, provide information not in the workspace, ' +
        'or perform any interactive action that requires human eyes and hands. ' +
        'Execution PAUSES until the user clicks "Done" (they performed the task) or "Cancel". ' +
        'The tool returns a success response when the user confirms completion, allowing your conversation to continue.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'A clear, specific instruction describing what the human needs to do. ' +
              'Be precise — explain exactly what action to take, what to look for, and what information (if any) to provide back.',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Fetch a web page and extract its plain-text content. ' +
        'Use this to read documentation, API references, or any URL the user provides. ' +
        'Supports optional cookie and custom headers for accessing authenticated pages. ' +
        'Only supports http:// and https:// URLs. ' +
        'Results are truncated per maxLength (default 16000 characters). ' +
        'If you do not know the exact URL for a page you need, use ask_human first to request the user to browse to it and provide the URL — do not guess URLs.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Full URL to fetch, including https:// prefix (e.g. "https://example.com/docs").',
          },
          maxLength: {
            type: 'number',
            description: 'Maximum characters to return from the extracted content (default 16000, max 50000).',
          },
          cookie: {
            type: 'string',
            description:
              'Optional cookie string to send with the request (e.g. "session=abc123; token=xyz"). ' +
              'Use this to access pages that require login. The user can copy cookies from their browser developer tools.',
          },
          headers: {
            type: 'string',
            description:
              'Optional JSON object of custom HTTP headers (e.g. \'{"Authorization":"Bearer xxx"}\'). ' +
              'If both cookie and headers provide Cookie/authorization, headers take precedence.',
          },
          timeoutMs: {
            type: 'number',
            description: 'Request timeout in milliseconds (default 15000, max 30000).',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description:
        'Search across all workspace files for a given pattern (case-sensitive by default). Returns matching file paths and line contents. ' +
        'The include/exclude patterns follow VS Code glob syntax (e.g. "**/*.ts", "**/*.{ts,js}"). ' +
        'Use this when you need to find where something is referenced across multiple files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Text pattern to search for (case-sensitive).',
          },
          includePattern: {
            type: 'string',
            description:
              'Glob pattern to include files (e.g. "**/*.ts"). Defaults to "**/*" if not set.',
          },
          excludePattern: {
            type: 'string',
            description:
              'Glob pattern to exclude files (e.g. "**/node_modules/**"). Default excludes node_modules and .git.',
          },
          maxResults: {
            type: 'number',
            description:
              'Maximum number of matches to return (default 50, max 200).',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether search is case-sensitive (default true).',
          },
        },
        required: ['pattern'],
      },
    },
  },



];