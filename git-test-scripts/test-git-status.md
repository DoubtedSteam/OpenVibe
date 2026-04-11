# Git Status Test File

This file is used to test whether Git properly detects uncommitted changes.

## How to use
1. This file should show as "untracked" in `git status`
2. Add this file: `git add git-test-scripts/test-git-status.md`
3. Modify this file (add content below)
4. Check `git status --porcelain` output
5. Do NOT commit the changes - leave them uncommitted for OpenVibe snapshot testing

## Test Section

**Current Time**: 2025-02-15T11:15:00.000Z

## Git Status Check Commands

Run these commands in terminal to check Git status:

```bash
# Check overall status
git status

# Check with porcelain format (used by OpenVibe)
git status --porcelain

# Count uncommitted changes
git status --porcelain | wc -l
```

## OpenVibe Git Snapshot Requirements

For Git snapshots to work, the following must be true:

1. ✅ Git repository initialized (`.git` directory exists)
2. ✅ At least one commit exists in the repository
3. ❓ **Must have uncommitted changes** (this is the key!)
4. ❓ Git commands must be executable

## Common Issues

### Issue 1: No uncommitted changes
**Solution**: 
- Modify a file (like `git-test-file.md`)
- Do NOT commit the changes
- Send a message in OpenVibe chat

### Issue 2: Git not detecting changes
**Solution**:
- Ensure you are in the correct directory
- Check `.gitignore` isn't ignoring your files
- Verify file permissions

### Issue 3: OpenVibe not calling gitSnapshotTool
**Solution**:
- Check OpenVibe output channel logs
- Look for `[GitSnapshot]` logs
- If no logs appear, the function might not be called