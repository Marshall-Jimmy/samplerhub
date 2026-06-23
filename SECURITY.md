# Security Policy

## Security Boundaries

SamplerHub implements the following security measures to protect users and their data:

### Electron Process Isolation

- **Context Isolation**: Enabled (`contextIsolation: true`) — preload scripts run in an isolated context, preventing direct access to Node.js APIs from the renderer
- **Node Integration**: Disabled (`nodeIntegration: false`) — renderer process cannot use Node.js APIs directly
- **Sandbox**: Enabled (`sandbox: true`) — renderer processes run in Chromium's sandbox

### Custom Protocol Security

- **`local-audio://`**: Only serves audio files from user-configured library directories. Path traversal attempts (containing `..` or absolute paths outside whitelist) are rejected
- **`online-preview://`**: Only serves cached preview audio from in-memory cache. No filesystem access

### IPC Communication

All renderer-to-main communication goes through a typed IPC bridge (`shared/types/ipc.types.ts`). No arbitrary code execution or file system access is exposed to the renderer.

### File System Access

- Audio file scanning is limited to user-specified directories
- Drag-and-drop operations only expose file paths, not file contents
- Database (SQLite) is stored in the user's application data directory

## Reporting Vulnerabilities

If you discover a security vulnerability, please email [security@samplerhub.dev](mailto:security@samplerhub.dev) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment

We will respond within 48 hours and work on a fix.
