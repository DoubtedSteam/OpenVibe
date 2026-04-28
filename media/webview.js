// Webview-side UI script (loaded via <script src=...>).
// Keep this file dependency-free; VS Code webviews often run with strict CSP.
// Do not break string literals across physical lines — invalid JS will prevent this entire file from loading.
(function () {
  function qs(sel) { return document.querySelector(sel); }
  function byId(id) { return document.getElementById(id); }

  // Acquire VS Code API early.
  var vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    // If this fails, nothing else can work.
    return;
  }

  function safePost(msg) {
    try { vscode.postMessage(msg); } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    var msg = (event && event.message) ? String(event.message) : 'Unknown error';
    safePost({ type: 'webviewError', message: msg });
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = (event && event.reason && (event.reason.message || event.reason)) ? String(event.reason.message || event.reason) : 'Unhandled promise rejection';
    safePost({ type: 'webviewError', message: reason });
  });

   var messagesDiv = byId('messages');
   var input = byId('input');
   var sendBtn = byId('send');
   var stopBtn = byId('stop');
   var clearBtn = byId('clear');
   var snapshotsBtn = byId('snapshots');
   var editToggleBtn = byId('edit-toggle');
   var confirmBar = byId('replace-confirm');
   var confirmMeta = byId('confirm-meta');
   var confirmApplyBtn = byId('confirm-apply');
   var confirmCancelBtn = byId('confirm-cancel');
   var confirmTitleEl = qs('#replace-confirm .confirm-title');
   var humanAssistBar = byId('human-assistance-confirm');
   var humanAssistQuestion = byId('human-assistance-question');
    var humanAssistDoneBtn = byId('human-assistance-done');
    var humanAssistCancelBtn = byId('human-assistance-cancel');
    var humanAssistInput = byId('human-assistance-input');
    var humanAssistSendBtn = byId('human-assistance-send');
   var TOOL_ICONS = {
    read_file: '📄',
    find_in_file: '🔍',
    edit: '✏️',
    create_directory: '📁',
    get_workspace_info: '📂',
  };

   var pendingToolCard = null;
   var pendingConfirm = null; // { requestId, ... }
   
   
   // Edit permission state
   var editPermissionEnabled = true;
    var _lastUserMessage = '';
  function scrollBottom() {
    if (!messagesDiv) return;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  function escHtml(str) {
    if (str === null || str === undefined) { return ''; }
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
   }
   
   // Edit permission toggle function
   function toggleEditPermission() {
     if (!editToggleBtn) return;
     
     editPermissionEnabled = !editPermissionEnabled;
     
     // Update UI
     if (editPermissionEnabled) {
       editToggleBtn.classList.remove('off');
       editToggleBtn.classList.add('on');
       editToggleBtn.title = 'Toggle edit permission - ON: LLM can use edit tools, OFF: read-only mode';
       var iconSpan = editToggleBtn.querySelector('.toggle-icon');
       var textSpan = editToggleBtn.querySelector('.toggle-text');
       if (iconSpan) iconSpan.textContent = '🔓';
       if (textSpan) textSpan.textContent = 'Edit ON';
     } else {
       editToggleBtn.classList.remove('on');
       editToggleBtn.classList.add('off');
       editToggleBtn.title = 'Toggle edit permission - ON: LLM can use edit tools, OFF: read-only mode';
       var iconSpan = editToggleBtn.querySelector('.toggle-icon');
       var textSpan = editToggleBtn.querySelector('.toggle-text');
       if (iconSpan) iconSpan.textContent = '🔒';
       if (textSpan) textSpan.textContent = 'Edit OFF';
     }
     
     // Notify backend
     safePost({ 
       type: 'setEditPermission', 
       enabled: editPermissionEnabled 
     });
   }

   // Simple markdown parser for basic formatting
  // Simple markdown parser for basic formatting
  function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Escape HTML first to prevent XSS
    var escaped = escHtml(text);
    
    // Process markdown tags (order matters)
    // Headers (h1-h3)
    var result = escaped
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    result = result
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code and code blocks
    result = result
      .replace(/```([\s\S]*?)```/g, function(match, code) {
        // Skip empty/whitespace-only blocks to prevent black-background empty <pre> boxes
        if (!code.trim()) return '';
        return '<pre><code>' + code + '</code></pre>';
      })
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Lists
    result = result
      .replace(/^-\s+(.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    
    // Wrap list items in ul/ol
    var lines = result.split('\n');
    var inList = false;
    var isOrderedList = false;
    var output = [];
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var isListItem = line.startsWith('<li>');
      
      if (isListItem && !inList) {
        // Determine if ordered list based on original line
        var origLine = escaped.split('\n')[i];
        isOrderedList = /^\d+\.\s/.test(origLine);
        output.push(isOrderedList ? '<ol>' : '<ul>');
        inList = true;
      } else if (!isListItem && inList) {
        output.push(isOrderedList ? '</ol>' : '</ul>');
        inList = false;
        isOrderedList = false;
      }
      
      output.push(line);
    }
    
    // Close any open list
    if (inList) {
      output.push(isOrderedList ? '</ol>' : '</ul>');
    }
    
    result = output.join(String.fromCharCode(10));
    
    // Tables - pipe-delimited markdown tables
    result = result.replace(/^(\|.+\x0a\|[-:| ]+\|(?:\x0a\|.+)*)$/gm, function(tableBlock) {
      var NL = String.fromCharCode(10);
      var tLines = tableBlock.split(NL);
      var html = '<table>' + NL + '<thead>' + NL + '<tr>';
      var headerCells = tLines[0].split('|');
      for (var hi = 0; hi < headerCells.length; hi++) {
        var hc = headerCells[hi].trim();
        if (hc) html += '<th>' + hc + '</th>';
      }
      html += '</tr>' + NL + '</thead>' + NL + '<tbody>' + NL;
      for (var ri = 2; ri < tLines.length; ri++) {
        var rowCells = tLines[ri].split('|');
        var hasContent = false;
        for (var ci = 0; ci < rowCells.length; ci++) {
          if (rowCells[ci].trim() !== '') { hasContent = true; break; }
        }
        if (!hasContent) continue;
        html += '<tr>';
        for (var ci = 0; ci < rowCells.length; ci++) {
          var rc = rowCells[ci].trim();
          if (rc) html += '<td>' + rc + '</td>';
        }
        html += '</tr>' + NL;
      }
      html += '</tbody>' + NL + '</table>';
      return html;
    });
    
    var paragraphs = result.split(/\n\n+/);
    result = paragraphs.map(function(p) {
      p = p.trim();
      if (!p) return '';
      // Don't wrap if it's already a block element
      if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<ul') || p.startsWith('<ol') || 
          p.startsWith('<li') || p.startsWith('<pre') || p.startsWith('<code')) {
        return p;
      }
      return '<p>' + p + '</p>';
    }).join('\n\n');
    
    // Links (simple pattern) with security validation
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
      // Sanitize URL to prevent javascript: and other dangerous protocols
      var cleanUrl = url.trim();
      // Only allow http, https, mailto, and relative URLs
      if (/^(https?:\/\/|mailto:|#|\/|\.)/.test(cleanUrl)) {
        return '<a href="' + cleanUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
      }
      // For other URLs, render as plain text
      return text;
    });
    // Horizontal rule
    result = result.replace(/^---$/gm, '<hr>');
    
    // Blockquotes
    result = result.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    
    return result;
  }
  function addMessage(role, content) {
    if (!messagesDiv) return;
    var row = document.createElement('div');
    row.className = 'message-row ' + role;
    if (role !== 'system' && role !== 'event') {
      var label = document.createElement('div');
      label.className = 'message-role';
      label.textContent = role === 'user' ? 'You' : 'Assistant';
      row.appendChild(label);
    }
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    // Parse markdown while maintaining CSP safety
    if (content === null || content === undefined) {
      bubble.innerHTML = '';
    } else {
      var htmlContent = parseMarkdown(String(content));
      bubble.innerHTML = htmlContent;
    }
    row.appendChild(bubble);
    messagesDiv.appendChild(row);
    scrollBottom();
  }

  // ── @ 引用自动补全 ─────────────────────────────────────────────────────────


  // ── @ 引用自动补全 ─────────────────────────────────────────────────────────
  var REF_ITEMS = [
    { label: 'file', icon: '📄', desc: '引用文件内容', hint: 'file:path' },
    { label: 'problem', icon: '🔴', desc: '当前诊断错误', hint: '' },
    { label: 'selection', icon: '✂️', desc: '当前选中代码', hint: '' },
  ];
  var _refOpen = false;
  var _refSelectedIdx = 0;
  var _refFilter = '';

  function getAutocompleteEl() {
    return byId('ref-autocomplete');
  }

  function closeRefAutocomplete() {
    _refOpen = false;
    var el = getAutocompleteEl();
    if (el) el.classList.remove('show');
  }

  function openRefAutocomplete(filter) {
    _refFilter = filter || '';
    _refSelectedIdx = 0;
    renderAutocomplete();
    var el = getAutocompleteEl();
    if (el) el.classList.add('show');
    _refOpen = true;
  }

  function renderAutocomplete() {
    var el = getAutocompleteEl();
    if (!el) return;
    var filtered = REF_ITEMS;
    if (_refFilter) {
      var f = _refFilter.toLowerCase();
      filtered = REF_ITEMS.filter(function (item) {
        return item.label.indexOf(f) !== -1 || item.desc.indexOf(f) !== -1;
      });
    }
    if (filtered.length === 0) { el.innerHTML = ''; el.classList.remove('show'); _refOpen = false; return; }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var item = filtered[i];
      var selClass = i === _refSelectedIdx ? ' selected' : '';
      var hintHtml = item.hint ? '<span class="ref-hint">@' + item.hint + '</span>' : '';
      html += '<div class="ref-autocomplete-item' + selClass + '" data-index="' + i + '">' +
        '<span class="ref-icon">' + item.icon + '</span>' +
        '<span class="ref-label">@' + item.label + '</span>' +
        '<span class="ref-desc">' + item.desc + '</span>' + hintHtml +
        '</div>';
    }
    el.innerHTML = html;
    // Scroll selected into view
    var sel = el.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  function applyRefSelection() {
    var el = getAutocompleteEl();
    if (!el || !_refOpen) return;
    var items = el.querySelectorAll('.ref-autocomplete-item');
    if (_refSelectedIdx < 0 || _refSelectedIdx >= items.length) return;
    var label = REF_ITEMS[_refSelectedIdx].label;
    insertRefTag(label);
    closeRefAutocomplete();
  }

  function insertRefTag(label) {
    if (!input) return;
    var val = input.value;
    var pos = input.selectionStart;
    // Find the start of the @word by searching backwards
    var start = pos;
    while (start > 0 && val[start - 1] !== '@') {
      start--;
    }
    // If there's no @ before, insert @ at cursor
    if (start === pos || val[start] !== '@') {
      // Check if there's an @ nearby (user might be typing at cursor)
      start = pos;
      var before = val.slice(0, pos);
      var atIdx = before.lastIndexOf('@');
      if (atIdx >= 0) {
        start = atIdx;
      } else {
        // No @ found, just insert @label at cursor
        var newVal = val.slice(0, pos) + '@' + label + (label === 'file' ? ':' : '') + ' ' + val.slice(pos);
        input.value = newVal;
        var newPos = pos + 1 + label.length + (label === 'file' ? 1 : 0) + 1;
        input.setSelectionRange(newPos, newPos);
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        return;
      }
    }
    // Replace @word with @label
    var end = start + 1;
    while (end < val.length && val[end] !== ' ' && val[end] !== '\n') { end++; }
    var replacement = '@' + label + (label === 'file' ? ':' : '') + ' ';
    var newVal = val.slice(0, start) + replacement + val.slice(end);
    input.value = newVal;
    var newPos = start + replacement.length;
    input.setSelectionRange(newPos, newPos);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function getRefFilter() {
    if (!input) return '';
    var val = input.value;
    var pos = input.selectionStart;
    var before = val.slice(0, pos);
    var atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return '';
    var after = before.slice(atIdx + 1);
    // If there's a space or newline after @, it's just an @ symbol
    if (after.length === 0) return '';
    if (after.indexOf(' ') !== -1 || after.indexOf('\n') !== -1) return '';
    // If it's @file:path, don't show autocomplete
    if (after.indexOf(':') !== -1) return '';
    return after;
  }


  function addCheckCard(data) {
    if (!messagesDiv) return;
    var verdict = data.verdict || '';
    var card = document.createElement('div');
    card.className = 'check-card ' + String(verdict).toLowerCase();
    var icon = verdict === 'CONFIRMED' ? '✅' : '❌';
    var timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    var header = document.createElement('div');
    header.className = 'check-header';
    var roundLabel = '';
    if (data.reviewRound != null && data.reviewRound !== undefined) {
      roundLabel = ' · round ' + escHtml(String(data.reviewRound));
    }
    header.innerHTML =
      '<span class="check-icon">' + icon + '</span>' +
      '<span class="check-title">Edit review' + roundLabel + '</span>' +
      '<span class="check-status">' + escHtml(verdict) + '</span>';
    header.addEventListener('click', function () { card.classList.toggle('expanded'); });

    var meta = document.createElement('div');
    meta.className = 'check-meta';
    meta.innerHTML =
      '<span class="file-path">' + escHtml(data.filePath) + '</span>' +
      '<span class="line-range">lines ' + data.startLine + '–' + data.endLine + '</span>' +
      '<span class="check-time">' + escHtml(timeStr) + '</span>';

    var body = document.createElement('div');
    body.className = 'check-body';

    var hasUnified = typeof data.unifiedDiff === 'string' && data.unifiedDiff.length > 0;
    if (hasUnified) {
      if (data.contextTruncated) {
        var hint = document.createElement('div');
        hint.className = 'check-diff-trunc';
        hint.textContent = 'Long diff trimmed for chat view.';
        body.appendChild(hint);
      }
      var pre = document.createElement('pre');
      pre.className = 'check-diff-unified';
      pre.textContent = data.unifiedDiff || '';
      body.appendChild(pre);
    }

    var reasonDiv = document.createElement('div');
    reasonDiv.className = 'reason-section';
    reasonDiv.innerHTML = '<strong>LLM Reason:</strong> ' + escHtml(data.reason);
    body.appendChild(reasonDiv);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(body);
    messagesDiv.appendChild(card);
    if (hasUnified) card.classList.add('expanded');
    scrollBottom();
  }

  function addToolCall(name, args) {
    if (!messagesDiv) return null;
    var card = document.createElement('div');
    card.className = 'tool-card';
    var displayName = name === 'replace_lines' ? 'edit' : name;
    var icon = TOOL_ICONS[name] || '🔧';
    var argsStr = JSON.stringify(args, null, 2);
    var command = (name === 'run_shell_command' && args && args.command) ? String(args.command) : '';
    card.dataset.toolName = name;
    if (command) card.dataset.command = command;
    card.innerHTML =
      '<div class="tool-header">' +
        '<span class="tool-icon">' + icon + '</span>' +
        '<span class="tool-name">' + escHtml(displayName) + '</span>' +
        '<span class="tool-status">running…</span>' +
      '</div>' +
      '<div class="tool-body">' + escHtml(command ? ('Command:\n' + command + '\n\nArgs:\n' + argsStr) : argsStr) + '</div>';
    var header = card.querySelector('.tool-header');
    if (header) header.addEventListener('click', function () { card.classList.toggle('expanded'); });
    messagesDiv.appendChild(card);
    scrollBottom();
    pendingToolCard = card;
    return card;
  }

  /** When tool JSON includes unifiedDiff (persisted edit results), show the same style of diff as Replace check cards. */
  function fillEditDiffBody(card, body, parsed) {
    var ud = parsed && typeof parsed.unifiedDiff === 'string' ? parsed.unifiedDiff : '';
    if (!ud) {
      return false;
    }
    card.classList.add('tool-card-edit-diff');
    body.innerHTML = '';
    var meta = document.createElement('div');
    meta.className = 'check-meta';
    var fp = parsed.filePath != null ? String(parsed.filePath) : '';
    var sl = parsed.startLine != null ? String(parsed.startLine) : '';
    var el = parsed.endLine != null ? String(parsed.endLine) : '';
    var fpSpan = document.createElement('span');
    fpSpan.className = 'file-path';
    fpSpan.textContent = fp;
    var lrSpan = document.createElement('span');
    lrSpan.className = 'line-range';
    lrSpan.textContent = 'lines ' + sl + '–' + el;
    meta.appendChild(fpSpan);
    meta.appendChild(lrSpan);
    var pre = document.createElement('pre');
    pre.className = 'check-diff-unified';
    pre.textContent = ud;
    body.appendChild(meta);
    body.appendChild(pre);
    return true;
  }

  function resolveToolCard(result, fromReplay) {
    var card = pendingToolCard;
    if (!card) {
      var allCards = document.querySelectorAll('.tool-card');
      for (var i = allCards.length - 1; i >= 0; i--) {
        var c = allCards[i];
        if (!c.classList.contains('done') && !c.classList.contains('error')) { card = c; break; }
      }
    }
    pendingToolCard = null;
    if (!card) return;
    var parsed;
    try { parsed = JSON.parse(result); } catch (_) { parsed = { raw: result }; }
    var isError = parsed && (parsed.error || parsed.success === false);
    var toolName = card.dataset.toolName || '';
    var hasUnifiedDiff = !!(parsed && typeof parsed.unifiedDiff === 'string' && parsed.unifiedDiff.length > 0);
    card.classList.add(isError ? 'error' : 'done');
    var statusEl = card.querySelector('.tool-status');
    if (statusEl) statusEl.textContent = isError ? ('error: ' + (parsed.error || parsed.message || '?')) : (parsed.message || 'done');
    var body = card.querySelector('.tool-body');
    var filledDiff = false;
    if (body) {
      if (fromReplay && (toolName === 'edit' || toolName === 'replace_lines') && hasUnifiedDiff) {
        filledDiff = fillEditDiffBody(card, body, parsed);
      }
      if (!filledDiff) {
        var cmd = card.dataset.command || '';
        var forDisplay = parsed;
        if (!fromReplay && hasUnifiedDiff && (toolName === 'edit' || toolName === 'replace_lines')) {
          try {
            forDisplay = JSON.parse(JSON.stringify(parsed));
            if (forDisplay && typeof forDisplay === 'object') {
              delete forDisplay.unifiedDiff;
            }
          } catch (_) {
            forDisplay = parsed;
          }
        }
        var resultStr = JSON.stringify(forDisplay, null, 2);
        body.textContent = (toolName === 'run_shell_command' && cmd) ? ('Command:\n' + cmd + '\n\nResult:\n' + resultStr) : resultStr;
      }
    }
    var expandEdit = (toolName === 'edit' || toolName === 'replace_lines') && (!isError || (fromReplay && hasUnifiedDiff));
    if (expandEdit) {
      card.classList.add('expanded');
    } else {
      card.classList.remove('expanded');
    }
    scrollBottom();
  }

  function showLoading(show) {
    if (!messagesDiv) return;
    var el = byId('loading');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'loading';
        el.className = 'loading';
        el.textContent = 'Thinking…';
        messagesDiv.appendChild(el);
      }
      scrollBottom();
      if (sendBtn) sendBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
    } else {
      if (el) el.remove();
      if (sendBtn) sendBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
    }
  }

  function setRunningState(running) {
    if (sendBtn) sendBtn.disabled = !!running;
    if (stopBtn) stopBtn.disabled = !running;
  }

  function showInfo(msg) { if (!messagesDiv) return; var el = document.createElement('div'); el.className = 'info-msg'; el.textContent = msg; messagesDiv.appendChild(el); scrollBottom(); }
  function showError(msg) { if (!messagesDiv) return; var el = document.createElement('div'); el.className = 'error-msg'; var isTimeout = /timed out|超时/i.test(msg); if (isTimeout && typeof _lastUserMessage !== 'undefined' && _lastUserMessage) { el.innerHTML = escHtml(msg) + ' <button class="retry-btn" title="重试">重试</button>'; var btn = el.querySelector('.retry-btn'); if (btn) btn.addEventListener('click', function(e) { e.stopPropagation(); safePost({ type: 'sendMessage', text: _lastUserMessage }); }); } else { el.textContent = msg; } messagesDiv.appendChild(el); scrollBottom(); }

  function showTokenUsage(msg) {
    if (!messagesDiv) return;
    var usage = msg.usage;
    var accumulated = msg.accumulated;
    // Per-call inline indicator
    var el = document.createElement('div');
    el.className = 'token-usage';
    el.textContent = '↑ ' + usage.prompt_tokens + '  ↓ ' + usage.completion_tokens + '  Σ ' + usage.total_tokens + ' tokens';
    messagesDiv.appendChild(el);
    scrollBottom();
    // Sticky footer with accumulated usage
    var footer = byId('usage-footer');
    if (!footer) return;
    if (accumulated) {
      footer.innerHTML =
        '<span class="usage-item"><span class="usage-label">prompt </span><span class="usage-value">' + accumulated.prompt_tokens + '</span></span>' +
        '<span class="usage-item"><span class="usage-label">completion </span><span class="usage-value">' + accumulated.completion_tokens + '</span></span>' +
        '<span class="usage-item"><span class="usage-label">total </span><span class="usage-value">' + accumulated.total_tokens + '</span></span>';
    }
  }

  function formatTime(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;
    if (diff < 24 * 60 * 60 * 1000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 7 * 24 * 60 * 60 * 1000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function updateSessionsList(sessions) {
    var sessionsList = byId('sessions-list');
    if (!sessionsList) return;
    sessionsList.innerHTML = '';
    sessions.forEach(function (session) {
      var item = document.createElement('div');
      item.className = 'session-item' + (session.isActive ? ' active' : '');
      item.dataset.id = session.id;
      item.innerHTML =
        '<div class="session-item-content">' +
          '<div class="session-title">' + escHtml(session.title) + '</div>' +
          '<div class="session-meta">' +
            '<span>' + (session.messageCount || 0) + ' messages</span>' +
            '<span>' + formatTime(session.updated) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="session-actions">' +
          '<button class="session-btn edit-btn" title="Rename">✏️</button>' +
          '<button class="session-btn delete-btn" title="Delete">🗑</button>' +
        '</div>';
      item.addEventListener('click', function (e) {
        if (!e.target.closest('.session-actions')) {
          safePost({ type: 'switchSession', sessionId: session.id });
        }
      });
      var editBtn = item.querySelector('.edit-btn');
      if (editBtn) editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        safePost({ type: 'renameSession', sessionId: session.id, currentTitle: session.title });
      });
      var delBtn = item.querySelector('.delete-btn');
      if (delBtn) delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        safePost({ type: 'deleteSession', sessionId: session.id });
      });
      sessionsList.appendChild(item);
    });
  }

  function showSnapshotsList(snapshots) {
    if (!messagesDiv) return;
    var old = messagesDiv.querySelector('.snapshot-panel');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.className = 'snapshot-panel';
    var header = document.createElement('div');
    header.className = 'snapshot-panel-header';
    header.innerHTML = '<span>⏮️ Git Snapshots (' + snapshots.length + ')</span><button class="snapshot-panel-close" title="Close">×</button>';
    var close = header.querySelector('.snapshot-panel-close');
    if (close) close.addEventListener('click', function () { panel.remove(); });
    panel.appendChild(header);
    if (snapshots.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'snapshot-empty';
      empty.textContent = 'No snapshots yet.';
      panel.appendChild(empty);
    } else {
      var sorted = snapshots.slice().sort(function (a, b) { return b.timestamp - a.timestamp; });
      sorted.forEach(function (snapshot) {
        var item = document.createElement('div');
        item.className = 'snapshot-item';
        var date = new Date(snapshot.timestamp);
        var timeStr = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        var instruction = snapshot.userInstruction || snapshot.subject || snapshot.snapshotId;
        var truncated = instruction.length > 80 ? instruction.slice(0, 80) + '…' : instruction;
        item.innerHTML =
          '<div class="snapshot-meta">' +
            '<div class="snapshot-time">' + escHtml(timeStr) + ' · ' + escHtml((snapshot.commitHash || '').slice(0, 7)) + '</div>' +
            '<div class="snapshot-instruction" title="' + escHtml(instruction) + '">' + escHtml(truncated) + '</div>' +
          '</div>' +
          '<button class="snapshot-rollback-btn">↩ Rollback</button>';
        var rb = item.querySelector('.snapshot-rollback-btn');
        if (rb) rb.addEventListener('click', function () {
          safePost({ type: 'rollbackToSnapshot', snapshot: { tag: snapshot.tag, snapshotId: snapshot.snapshotId, userInstruction: instruction } });
          panel.remove();
        });
        panel.appendChild(item);
      });
    }
    messagesDiv.appendChild(panel);
    scrollBottom();
  }

  function respondConfirm(approved, userMessage) {
    if (!pendingConfirm || !pendingConfirm.requestId) {
      if (confirmBar) confirmBar.classList.remove('show');
      if (humanAssistBar) humanAssistBar.classList.remove('show');
      return;
    }
    var kind = pendingConfirm.kind || 'replace';
    if (kind === 'shell') {
      safePost({ type: 'shellConfirmResponse', requestId: pendingConfirm.requestId, approved: approved });
    } else if (kind === 'humanAssistance') {
      safePost({ type: 'humanAssistanceConfirmResponse', requestId: pendingConfirm.requestId, approved: approved, userMessage: userMessage || '' });
    } else {
      safePost({ type: 'replaceConfirmResponse', requestId: pendingConfirm.requestId, approved: approved });
    }
    pendingConfirm = null;
    if (confirmBar) confirmBar.classList.remove('show');
    if (humanAssistBar) humanAssistBar.classList.remove('show');
    if (humanAssistInput) humanAssistInput.value = '';
  }

  // Sidebar bindings
  var sidebar = byId('session-sidebar');
  var toggleBtn = byId('toggle-sidebar');
  var closeBtn = qs('.sidebar-close');
  var addSessionBtn = byId('add-session');

  if (toggleBtn && sidebar) toggleBtn.addEventListener('click', function () { sidebar.classList.add('open'); });
  if (closeBtn && sidebar) closeBtn.addEventListener('click', function () { sidebar.classList.remove('open'); });
  if (addSessionBtn) addSessionBtn.addEventListener('click', function () { safePost({ type: 'newSession' }); });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !sidebar) return;
    var openBtn = t.closest && t.closest('#toggle-sidebar');
    if (openBtn) { sidebar.classList.add('open'); return; }
    var close = t.closest && t.closest('.sidebar-close');
    if (close) sidebar.classList.remove('open');
  });

  if (confirmApplyBtn) confirmApplyBtn.addEventListener('click', function () { respondConfirm(true); });
  if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', function () { respondConfirm(false); });
  if (humanAssistDoneBtn) humanAssistDoneBtn.addEventListener('click', function () { respondConfirm(true); });
  if (humanAssistCancelBtn) humanAssistCancelBtn.addEventListener('click', function () { respondConfirm(false); });
  if (humanAssistSendBtn) humanAssistSendBtn.addEventListener('click', function () {
    var msg = humanAssistInput ? humanAssistInput.value.trim() : '';
    respondConfirm(true, msg);
  });
  if (sendBtn) sendBtn.addEventListener('click', function () {
    if (!input) return;
    closeRefAutocomplete();
    var text = input.value.trim();
    _lastUserMessage = text;
    input.value = '';
    input.style.height = 'auto';
    safePost({ type: 'sendMessage', text: text });
  });
  if (stopBtn) stopBtn.addEventListener('click', function () { safePost({ type: 'stopOperation' }); });
  if (clearBtn) clearBtn.addEventListener('click', function () { safePost({ type: 'clearHistory' }); });
   if (snapshotsBtn) snapshotsBtn.addEventListener('click', function () { safePost({ type: 'showSnapshots' }); });
   if (editToggleBtn) editToggleBtn.addEventListener('click', toggleEditPermission);
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (_refOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          _refSelectedIdx = Math.min(_refSelectedIdx + 1, REF_ITEMS.length - 1);
          renderAutocomplete();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          _refSelectedIdx = Math.max(_refSelectedIdx - 1, 0);
          renderAutocomplete();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applyRefSelection();
          return;
        }
        if (e.key === 'Escape') {
          closeRefAutocomplete();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sendBtn) sendBtn.click(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      // @ autocomplete
      var filter = getRefFilter();
      if (filter !== null && filter !== undefined && filter !== '') {
        openRefAutocomplete(filter);
      } else {
        closeRefAutocomplete();
      }
    });
    // Click outside to close
    input.addEventListener('blur', function () {
      setTimeout(closeRefAutocomplete, 200);
    });
  }
  // Click on dropdown items
  document.addEventListener('click', function (e) {
    var item = e.target && e.target.closest && e.target.closest('.ref-autocomplete-item');
    if (item) {
      var idx = parseInt(item.getAttribute('data-index'), 10);
      if (!isNaN(idx)) {
        _refSelectedIdx = idx;
        applyRefSelection();
      }
      return;
    }
  });

  window.addEventListener('message', function (event) {
    var msg = event.data;
    switch (msg.type) {
      case 'snapshotsList':  showSnapshotsList(msg.snapshots); break;
      case 'addMessage':     addMessage(msg.message.role, msg.message.content); break;
      case 'addCheckCard':   addCheckCard(msg.data); break;
      case 'toolCall':       addToolCall(msg.name, msg.args); break;
      case 'toolResult':     resolveToolCard(msg.result, msg.fromReplay === true); break;
      case 'loading':        showLoading(msg.loading); break;
      case 'error':          showError(msg.message); break;
      case 'tokenUsage':     showTokenUsage(msg); break;
      case 'setRunning':     setRunningState(msg.running); break;
      case 'info':           showInfo(msg.message); break;

      case 'requestReplaceConfirm': {
        pendingConfirm = msg.data || null;
        pendingConfirm.kind = 'replace';
        var fp = pendingConfirm && pendingConfirm.filePath ? pendingConfirm.filePath : '';
        var rng = pendingConfirm ? (pendingConfirm.startLine + '–' + pendingConfirm.endLine) : '';
        if (confirmMeta) confirmMeta.textContent = fp ? (fp + (rng ? (' · lines ' + rng) : '')) : '';
        if (confirmTitleEl) confirmTitleEl.textContent = 'Apply this edit?';
        if (confirmBar) confirmBar.classList.add('show');
        scrollBottom();
        break;
      }
      case 'requestShellConfirm': {
        pendingConfirm = msg.data || null;
        if (pendingConfirm) pendingConfirm.kind = 'shell';
        var cmd = pendingConfirm && pendingConfirm.command ? String(pendingConfirm.command) : '';
        if (confirmMeta) confirmMeta.textContent = cmd ? cmd : '';
        if (confirmTitleEl) confirmTitleEl.textContent = 'Run this command?';
        if (confirmBar) confirmBar.classList.add('show');
        scrollBottom();
        scrollBottom();
        break;
      }
      case 'requestHumanAssistanceConfirm': {
        pendingConfirm = msg.data || null;
        if (pendingConfirm) pendingConfirm.kind = 'humanAssistance';
        var qText = pendingConfirm && pendingConfirm.question ? String(pendingConfirm.question) : '';
        if (humanAssistQuestion) humanAssistQuestion.textContent = qText;
        if (humanAssistBar) humanAssistBar.classList.add('show');
        scrollBottom();
        break;
      }
      case 'clearMessages':
        if (messagesDiv) messagesDiv.innerHTML = '';
        pendingToolCard = null;
        pendingConfirm = null;
        if (confirmBar) confirmBar.classList.remove('show');
        if (humanAssistBar) humanAssistBar.classList.remove('show');
        break;
      case 'sessionsList':
        updateSessionsList(msg.sessions);
        break;
    }
  });

  // Notify extension that the webview is ready.
  safePost({ type: 'ready' });
})();

