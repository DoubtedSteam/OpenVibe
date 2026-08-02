"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/marked/lib/marked.esm.js
  function M() {
    return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
  }
  var T = M();
  function N(l3) {
    T = l3;
  }
  var _ = { exec: () => null };
  function E(l3) {
    let e = [];
    return (t) => {
      let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
      return s || (s = l3(n), e[n] = s), s;
    };
  }
  function d(l3, e = "") {
    let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
      let i = typeof r == "string" ? r : r.source;
      return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
    }, getRegex: () => new RegExp(t, e) };
    return n;
  }
  var Te = ((l3 = "") => {
    try {
      return !!new RegExp("(?<=1)(?<!1)" + l3);
    } catch {
      return false;
    }
  })();
  var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: E((l3) => new RegExp(`^ {0,${l3}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: E((l3) => new RegExp(`^ {0,${l3}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}(?:\`\`\`|~~~)`)), headingBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}#`)), htmlBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}>`)) };
  var Oe = /^(?:[ \t]*(?:\n|$))+/;
  var we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
  var ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
  var B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
  var Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
  var j = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
  var oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
  var ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
  var Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
  var F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
  var $e = /^[^\n]+/;
  var U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
  var Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
  var _e = d(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, j).getRegex();
  var H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  var K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
  var ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
  var le = d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
  var Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", le).getRegex();
  var W = { blockquote: Me, code: we, def: Le, fences: ye, heading: Pe, hr: B, html: ze, lheading: ae, list: _e, newline: Oe, paragraph: le, table: _, text: $e };
  var se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
  var Ee = { ...W, lheading: Se, table: se, paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex() };
  var Ie = { ...W, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
  var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
  var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
  var ue = /^( {2,}|\\)\n(?!\s*$)/;
  var Be = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
  var I = /[\p{P}\p{S}]/u;
  var Z = /[\s\p{P}\p{S}]/u;
  var X = /[^\s\p{P}\p{S}]/u;
  var De = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex();
  var pe = /(?!~)[\p{P}\p{S}]/u;
  var qe = /(?!~)[\s\p{P}\p{S}]/u;
  var ve = /(?:[^\s\p{P}\p{S}]|~)/u;
  var He = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
  var ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
  var Ze = d(ce, "u").replace(/punct/g, I).getRegex();
  var Ge = d(ce, "u").replace(/punct/g, pe).getRegex();
  var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
  var Ne = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
  var Qe = d(he, "gu").replace(/notPunctSpace/g, ve).replace(/punctSpace/g, qe).replace(/punct/g, pe).getRegex();
  var je = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
  var Fe = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex();
  var Ue = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
  var Ke = d(Ue, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
  var We = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex();
  var Xe = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
  var Je = d(K).replace("(?:-->|$)", "-->").getRegex();
  var Ve = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Je).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
  var v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
  var Ye = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
  var ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex();
  var de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex();
  var et = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex();
  var ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
  var J = { _backpedal: _, anyPunctuation: We, autolink: Xe, blockSkip: He, br: ue, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Ne, emStrongRDelimUnd: je, escape: Ae, link: Ye, nolink: de, punctuation: De, reflink: ke, reflinkSearch: et, tag: Ve, text: Be, url: _ };
  var tt = { ...J, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex() };
  var Q = { ...J, emStrongRDelimAst: Qe, emStrongLDelim: Ge, delLDelim: Fe, delRDelim: Ke, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() };
  var nt = { ...Q, br: d(ue).replace("{2,}", "*").getRegex(), text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
  var D = { normal: W, gfm: Ee, pedantic: Ie };
  var A = { normal: J, gfm: Q, breaks: nt, pedantic: tt };
  var rt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var ge = (l3) => rt[l3];
  function O(l3, e) {
    if (e) {
      if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
    } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
    return l3;
  }
  function V(l3) {
    try {
      l3 = encodeURI(l3).replace(m.percentDecode, "%");
    } catch {
      return null;
    }
    return l3;
  }
  function Y(l3, e) {
    let t = l3.replace(m.findPipe, (r, i, o) => {
      let u = false, a = i;
      for (; --a >= 0 && o[a] === "\\"; ) u = !u;
      return u ? "|" : " |";
    }), n = t.split(m.splitPipe), s = 0;
    if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
    else for (; n.length < e; ) n.push("");
    for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
    return n;
  }
  function $(l3, e, t) {
    let n = l3.length;
    if (n === 0) return "";
    let s = 0;
    for (; s < n; ) {
      let r = l3.charAt(n - s - 1);
      if (r === e && !t) s++;
      else if (r !== e && t) s++;
      else break;
    }
    return l3.slice(0, n - s);
  }
  function ee(l3) {
    let e = l3.split(`
`), t = e.length - 1;
    for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
    return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
  }
  function fe(l3, e) {
    if (l3.indexOf(e[1]) === -1) return -1;
    let t = 0;
    for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
    else if (l3[n] === e[0]) t++;
    else if (l3[n] === e[1] && (t--, t < 0)) return n;
    return t > 0 ? -2 : -1;
  }
  function me(l3, e = 0) {
    let t = e, n = "";
    for (let s of l3) if (s === "	") {
      let r = 4 - t % 4;
      n += " ".repeat(r), t += r;
    } else n += s, t++;
    return n;
  }
  function xe(l3, e, t, n, s) {
    let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1");
    n.state.inLink = true;
    let u = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) };
    return n.state.inLink = false, u;
  }
  function st(l3, e, t) {
    let n = l3.match(t.other.indentCodeCompensation);
    if (n === null) return e;
    let s = n[1];
    return e.split(`
`).map((r) => {
      let i = r.match(t.other.beginningSpace);
      if (i === null) return r;
      let [o] = i;
      return o.length >= s.length ? r.slice(s.length) : r;
    }).join(`
`);
  }
  var w = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "rules");
      __publicField(this, "lexer");
      this.options = e || T;
    }
    space(e) {
      let t = this.rules.block.newline.exec(e);
      if (t && t[0].length > 0) return { type: "space", raw: t[0] };
    }
    code(e) {
      let t = this.rules.block.code.exec(e);
      if (t) {
        let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
        return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
      }
    }
    fences(e) {
      let t = this.rules.block.fences.exec(e);
      if (t) {
        let n = t[0], s = st(n, t[3] || "", this.rules);
        return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
      }
    }
    heading(e) {
      let t = this.rules.block.heading.exec(e);
      if (t) {
        let n = t[2].trim();
        if (this.rules.other.endingHash.test(n)) {
          let s = $(n, "#");
          (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
        }
        return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
      }
    }
    hr(e) {
      let t = this.rules.block.hr.exec(e);
      if (t) return { type: "hr", raw: $(t[0], `
`) };
    }
    blockquote(e) {
      let t = this.rules.block.blockquote.exec(e);
      if (t) {
        let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
        for (; n.length > 0; ) {
          let o = false, u = [], a;
          for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = true;
          else if (!o) u.push(n[a]);
          else break;
          n = n.slice(a);
          let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
          s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
          let k = this.lexer.state.top;
          if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = k, n.length === 0) break;
          let h = i.at(-1);
          if (h?.type === "code") break;
          if (h?.type === "blockquote") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
            i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
            break;
          } else if (h?.type === "list") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
            i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
            continue;
          }
        }
        return { type: "blockquote", raw: s, tokens: i, text: r };
      }
    }
    list(e) {
      let t = this.rules.block.list.exec(e);
      if (t) {
        let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
        n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
        let i = this.rules.other.listItemRegex(n), o = false;
        for (; e; ) {
          let a = false, c = "", p = "";
          if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
          c = t[0], e = e.substring(c.length);
          let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
          if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
            let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
            for (; e; ) {
              let G = e.split(`
`, 1)[0], C;
              if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h)) break;
              if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) p += `
` + C.slice(f);
              else {
                if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k)) break;
                p += `
` + h;
              }
              R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
            }
          }
          r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
        }
        let u = r.items.at(-1);
        if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
        else return;
        r.raw = r.raw.trimEnd();
        for (let a of r.items) {
          this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
          let c = a.tokens[0];
          if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
            a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
            for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
              this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
              break;
            }
            let p = this.rules.other.listTaskCheckbox.exec(a.raw);
            if (p) {
              let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
              a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
            }
          } else a.task && (a.task = false);
          if (!r.loose) {
            let p = a.tokens.filter((h) => h.type === "space"), k = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
            r.loose = k;
          }
        }
        if (r.loose) for (let a of r.items) {
          a.loose = true;
          for (let c of a.tokens) c.type === "text" && (c.type = "paragraph");
        }
        return r;
      }
    }
    html(e) {
      let t = this.rules.block.html.exec(e);
      if (t) {
        let n = ee(t[0]);
        return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
      }
    }
    def(e) {
      let t = this.rules.block.def.exec(e);
      if (t) {
        let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
        return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
      }
    }
    table(e) {
      let t = this.rules.block.table.exec(e);
      if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
      let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
      if (n.length === s.length) {
        for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
        for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
        for (let o of r) i.rows.push(Y(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
        return i;
      }
    }
    lheading(e) {
      let t = this.rules.block.lheading.exec(e);
      if (t) {
        let n = t[1].trim();
        return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
      }
    }
    paragraph(e) {
      let t = this.rules.block.paragraph.exec(e);
      if (t) {
        let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
        return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
      }
    }
    text(e) {
      let t = this.rules.block.text.exec(e);
      if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
    }
    escape(e) {
      let t = this.rules.inline.escape.exec(e);
      if (t) return { type: "escape", raw: t[0], text: t[1] };
    }
    tag(e) {
      let t = this.rules.inline.tag.exec(e);
      if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
    }
    link(e) {
      let t = this.rules.inline.link.exec(e);
      if (t) {
        let n = t[2].trim();
        if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
          if (!this.rules.other.endAngleBracket.test(n)) return;
          let i = $(n.slice(0, -1), "\\");
          if ((n.length - i.length) % 2 === 0) return;
        } else {
          let i = fe(t[2], "()");
          if (i === -2) return;
          if (i > -1) {
            let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
            t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
          }
        }
        let s = t[2], r = "";
        if (this.options.pedantic) {
          let i = this.rules.other.pedanticHrefTitle.exec(s);
          i && (s = i[1], r = i[3]);
        } else r = t[3] ? t[3].slice(1, -1) : "";
        return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
      }
    }
    reflink(e, t) {
      let n;
      if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
        let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
        if (!r) {
          let i = n[0].charAt(0);
          return { type: "text", raw: i, text: i };
        }
        return xe(n, r, n[0], this.lexer, this.rules);
      }
    }
    emStrong(e, t, n = "") {
      let s = this.rules.inline.emStrongLDelim.exec(e);
      if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
      if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null; ) {
          if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
          if (u = [...o].length, s[3] || s[4]) {
            a += u;
            continue;
          } else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
            c += u;
            continue;
          }
          if (a -= u, a > 0) continue;
          u = Math.min(u, u + a + c);
          let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
          if (Math.min(i, u) % 2) {
            let f = h.slice(1, -1);
            return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
          }
          let R = h.slice(2, -2);
          return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
        }
      }
    }
    codespan(e) {
      let t = this.rules.inline.code.exec(e);
      if (t) {
        let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
        return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
      }
    }
    br(e) {
      let t = this.rules.inline.br.exec(e);
      if (t) return { type: "br", raw: t[0] };
    }
    del(e, t, n = "") {
      let s = this.rules.inline.delLDelim.exec(e);
      if (!s) return;
      if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
        for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null; ) {
          if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
          if (s[3] || s[4]) {
            a += u;
            continue;
          }
          if (a -= u, a > 0) continue;
          u = Math.min(u, u + a);
          let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
          return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
        }
      }
    }
    autolink(e) {
      let t = this.rules.inline.autolink.exec(e);
      if (t) {
        let n, s;
        return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    url(e) {
      let t;
      if (t = this.rules.inline.url.exec(e)) {
        let n, s;
        if (t[2] === "@") n = t[0], s = "mailto:" + n;
        else {
          let r;
          do
            r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
          while (r !== t[0]);
          n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
        }
        return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    inlineText(e) {
      let t = this.rules.inline.text.exec(e);
      if (t) {
        let n = this.lexer.state.inRawBlock;
        return { type: "text", raw: t[0], text: t[0], escaped: n };
      }
    }
  };
  var x = class l {
    constructor(e) {
      __publicField(this, "tokens");
      __publicField(this, "options");
      __publicField(this, "state");
      __publicField(this, "inlineQueue");
      __publicField(this, "tokenizer");
      this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
      let t = { other: m, block: D.normal, inline: A.normal };
      this.options.pedantic ? (t.block = D.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = D.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
    }
    static get rules() {
      return { block: D, inline: A };
    }
    static lex(e, t) {
      return new l(t).lex(e);
    }
    static lexInline(e, t) {
      return new l(t).inlineTokens(e);
    }
    lex(e) {
      e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
      for (let t = 0; t < this.inlineQueue.length; t++) {
        let n = this.inlineQueue[t];
        this.inlineTokens(n.src, n.tokens);
      }
      return this.inlineQueue = [], this.tokens;
    }
    blockTokens(e, t = [], n = false) {
      this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
      let s = 1 / 0;
      for (; e; ) {
        if (e.length < s) s = e.length;
        else {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
        let r;
        if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
        if (r = this.tokenizer.space(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
          continue;
        }
        if (r = this.tokenizer.code(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
          continue;
        }
        if (r = this.tokenizer.fences(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.heading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.hr(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.blockquote(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.list(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.html(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.def(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
          continue;
        }
        if (r = this.tokenizer.table(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.lheading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        let i = e;
        if (this.options.extensions?.startBlock) {
          let o = 1 / 0, u = e.slice(1), a;
          this.options.extensions.startBlock.forEach((c) => {
            a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
          }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
        }
        if (this.state.top && (r = this.tokenizer.paragraph(i))) {
          let o = t.at(-1);
          n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
          continue;
        }
        if (r = this.tokenizer.text(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
          continue;
        }
        if (e) {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
      }
      return this.state.top = true, t;
    }
    inline(e, t = []) {
      return this.inlineQueue.push({ src: e, tokens: t }), t;
    }
    inlineTokens(e, t = []) {
      this.tokenizer.lexer = this;
      let n = e, s = null;
      if (this.tokens.links) {
        let a = Object.keys(this.tokens.links);
        if (a.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; ) a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
      }
      for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; ) n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
      let r;
      for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; ) r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
      n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
      let i = false, o = "", u = 1 / 0;
      for (; e; ) {
        if (e.length < u) u = e.length;
        else {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
        i || (o = ""), i = false;
        let a;
        if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false)) continue;
        if (a = this.tokenizer.escape(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.tag(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.link(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.reflink(e, this.tokens.links)) {
          e = e.substring(a.raw.length);
          let p = t.at(-1);
          a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
          continue;
        }
        if (a = this.tokenizer.emStrong(e, n, o)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.codespan(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.br(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.del(e, n, o)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.autolink(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (!this.state.inLink && (a = this.tokenizer.url(e))) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        let c = e;
        if (this.options.extensions?.startInline) {
          let p = 1 / 0, k = e.slice(1), h;
          this.options.extensions.startInline.forEach((R) => {
            h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
          }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
        }
        if (a = this.tokenizer.inlineText(c)) {
          e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
          let p = t.at(-1);
          p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
          continue;
        }
        if (e) {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
      }
      return t;
    }
    infiniteLoopError(e) {
      let t = "Infinite loop on byte: " + e;
      if (this.options.silent) console.error(t);
      else throw new Error(t);
    }
  };
  var y = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "parser");
      this.options = e || T;
    }
    space(e) {
      return "";
    }
    code({ text: e, lang: t, escaped: n }) {
      let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
      return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
    }
    blockquote({ tokens: e }) {
      return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
    }
    html({ text: e }) {
      return e;
    }
    def(e) {
      return "";
    }
    heading({ tokens: e, depth: t }) {
      return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
    }
    hr(e) {
      return `<hr>
`;
    }
    list(e) {
      let t = e.ordered, n = e.start, s = "";
      for (let o = 0; o < e.items.length; o++) {
        let u = e.items[o];
        s += this.listitem(u);
      }
      let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
      return "<" + r + i + `>
` + s + "</" + r + `>
`;
    }
    listitem(e) {
      return `<li>${this.parser.parse(e.tokens)}</li>
`;
    }
    checkbox({ checked: e }) {
      return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
    }
    paragraph({ tokens: e }) {
      return `<p>${this.parser.parseInline(e)}</p>
`;
    }
    table(e) {
      let t = "", n = "";
      for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
      t += this.tablerow({ text: n });
      let s = "";
      for (let r = 0; r < e.rows.length; r++) {
        let i = e.rows[r];
        n = "";
        for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
        s += this.tablerow({ text: n });
      }
      return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
    }
    tablerow({ text: e }) {
      return `<tr>
${e}</tr>
`;
    }
    tablecell(e) {
      let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
      return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
    }
    strong({ tokens: e }) {
      return `<strong>${this.parser.parseInline(e)}</strong>`;
    }
    em({ tokens: e }) {
      return `<em>${this.parser.parseInline(e)}</em>`;
    }
    codespan({ text: e }) {
      return `<code>${O(e, true)}</code>`;
    }
    br(e) {
      return "<br>";
    }
    del({ tokens: e }) {
      return `<del>${this.parser.parseInline(e)}</del>`;
    }
    link({ href: e, title: t, tokens: n }) {
      let s = this.parser.parseInline(n), r = V(e);
      if (r === null) return s;
      e = r;
      let i = '<a href="' + e + '"';
      return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i;
    }
    image({ href: e, title: t, text: n, tokens: s }) {
      s && (n = this.parser.parseInline(s, this.parser.textRenderer));
      let r = V(e);
      if (r === null) return O(n);
      e = r;
      let i = `<img src="${e}" alt="${O(n)}"`;
      return t && (i += ` title="${O(t)}"`), i += ">", i;
    }
    text(e) {
      return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
    }
  };
  var L = class {
    strong({ text: e }) {
      return e;
    }
    em({ text: e }) {
      return e;
    }
    codespan({ text: e }) {
      return e;
    }
    del({ text: e }) {
      return e;
    }
    html({ text: e }) {
      return e;
    }
    text({ text: e }) {
      return e;
    }
    link({ text: e }) {
      return "" + e;
    }
    image({ text: e }) {
      return "" + e;
    }
    br() {
      return "";
    }
    checkbox({ raw: e }) {
      return e;
    }
  };
  var b = class l2 {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "renderer");
      __publicField(this, "textRenderer");
      this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
    }
    static parse(e, t) {
      return new l2(t).parse(e);
    }
    static parseInline(e, t) {
      return new l2(t).parseInline(e);
    }
    parse(e) {
      this.renderer.parser = this;
      let t = "";
      for (let n = 0; n < e.length; n++) {
        let s = e[n];
        if (this.options.extensions?.renderers?.[s.type]) {
          let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
          if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
            t += o || "";
            continue;
          }
        }
        let r = s;
        switch (r.type) {
          case "space": {
            t += this.renderer.space(r);
            break;
          }
          case "hr": {
            t += this.renderer.hr(r);
            break;
          }
          case "heading": {
            t += this.renderer.heading(r);
            break;
          }
          case "code": {
            t += this.renderer.code(r);
            break;
          }
          case "table": {
            t += this.renderer.table(r);
            break;
          }
          case "blockquote": {
            t += this.renderer.blockquote(r);
            break;
          }
          case "list": {
            t += this.renderer.list(r);
            break;
          }
          case "checkbox": {
            t += this.renderer.checkbox(r);
            break;
          }
          case "html": {
            t += this.renderer.html(r);
            break;
          }
          case "def": {
            t += this.renderer.def(r);
            break;
          }
          case "paragraph": {
            t += this.renderer.paragraph(r);
            break;
          }
          case "text": {
            t += this.renderer.text(r);
            break;
          }
          default: {
            let i = 'Token with "' + r.type + '" type was not found.';
            if (this.options.silent) return console.error(i), "";
            throw new Error(i);
          }
        }
      }
      return t;
    }
    parseInline(e, t = this.renderer) {
      this.renderer.parser = this;
      let n = "";
      for (let s = 0; s < e.length; s++) {
        let r = e[s];
        if (this.options.extensions?.renderers?.[r.type]) {
          let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
          if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
            n += o || "";
            continue;
          }
        }
        let i = r;
        switch (i.type) {
          case "escape": {
            n += t.text(i);
            break;
          }
          case "html": {
            n += t.html(i);
            break;
          }
          case "link": {
            n += t.link(i);
            break;
          }
          case "image": {
            n += t.image(i);
            break;
          }
          case "checkbox": {
            n += t.checkbox(i);
            break;
          }
          case "strong": {
            n += t.strong(i);
            break;
          }
          case "em": {
            n += t.em(i);
            break;
          }
          case "codespan": {
            n += t.codespan(i);
            break;
          }
          case "br": {
            n += t.br(i);
            break;
          }
          case "del": {
            n += t.del(i);
            break;
          }
          case "text": {
            n += t.text(i);
            break;
          }
          default: {
            let o = 'Token with "' + i.type + '" type was not found.';
            if (this.options.silent) return console.error(o), "";
            throw new Error(o);
          }
        }
      }
      return n;
    }
  };
  var _a;
  var P = (_a = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "block");
      this.options = e || T;
    }
    preprocess(e) {
      return e;
    }
    postprocess(e) {
      return e;
    }
    processAllTokens(e) {
      return e;
    }
    emStrongMask(e) {
      return e;
    }
    provideLexer(e = this.block) {
      return e ? x.lex : x.lexInline;
    }
    provideParser(e = this.block) {
      return e ? b.parse : b.parseInline;
    }
  }, __publicField(_a, "passThroughHooks", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"])), __publicField(_a, "passThroughHooksRespectAsync", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"])), _a);
  var q = class {
    constructor(...e) {
      __publicField(this, "defaults", M());
      __publicField(this, "options", this.setOptions);
      __publicField(this, "parse", this.parseMarkdown(true));
      __publicField(this, "parseInline", this.parseMarkdown(false));
      __publicField(this, "Parser", b);
      __publicField(this, "Renderer", y);
      __publicField(this, "TextRenderer", L);
      __publicField(this, "Lexer", x);
      __publicField(this, "Tokenizer", w);
      __publicField(this, "Hooks", P);
      this.use(...e);
    }
    walkTokens(e, t) {
      let n = [];
      for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
        case "table": {
          let r = s;
          for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
          for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
          break;
        }
        case "list": {
          let r = s;
          n = n.concat(this.walkTokens(r.items, t));
          break;
        }
        default: {
          let r = s;
          this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
            let o = r[i].flat(1 / 0);
            n = n.concat(this.walkTokens(o, t));
          }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
        }
      }
      return n;
    }
    use(...e) {
      let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
      return e.forEach((n) => {
        let s = { ...n };
        if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
          if (!r.name) throw new Error("extension name required");
          if ("renderer" in r) {
            let i = t.renderers[r.name];
            i ? t.renderers[r.name] = function(...o) {
              let u = r.renderer.apply(this, o);
              return u === false && (u = i.apply(this, o)), u;
            } : t.renderers[r.name] = r.renderer;
          }
          if ("tokenizer" in r) {
            if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
            let i = t[r.level];
            i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
          }
          "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
        }), s.extensions = t), n.renderer) {
          let r = this.defaults.renderer || new y(this.defaults);
          for (let i in n.renderer) {
            if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
            if (["options", "parser"].includes(i)) continue;
            let o = i, u = n.renderer[o], a = r[o];
            r[o] = (...c) => {
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p || "";
            };
          }
          s.renderer = r;
        }
        if (n.tokenizer) {
          let r = this.defaults.tokenizer || new w(this.defaults);
          for (let i in n.tokenizer) {
            if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
            if (["options", "rules", "lexer"].includes(i)) continue;
            let o = i, u = n.tokenizer[o], a = r[o];
            r[o] = (...c) => {
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p;
            };
          }
          s.tokenizer = r;
        }
        if (n.hooks) {
          let r = this.defaults.hooks || new P();
          for (let i in n.hooks) {
            if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
            if (["options", "block"].includes(i)) continue;
            let o = i, u = n.hooks[o], a = r[o];
            P.passThroughHooks.has(i) ? r[o] = (c) => {
              if (this.defaults.async && P.passThroughHooksRespectAsync.has(i)) return (async () => {
                let k = await u.call(r, c);
                return a.call(r, k);
              })();
              let p = u.call(r, c);
              return a.call(r, p);
            } : r[o] = (...c) => {
              if (this.defaults.async) return (async () => {
                let k = await u.apply(r, c);
                return k === false && (k = await a.apply(r, c)), k;
              })();
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p;
            };
          }
          s.hooks = r;
        }
        if (n.walkTokens) {
          let r = this.defaults.walkTokens, i = n.walkTokens;
          s.walkTokens = function(o) {
            let u = [];
            return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
          };
        }
        this.defaults = { ...this.defaults, ...s };
      }), this;
    }
    setOptions(e) {
      return this.defaults = { ...this.defaults, ...e }, this;
    }
    lexer(e, t) {
      return x.lex(e, t ?? this.defaults);
    }
    parser(e, t) {
      return b.parse(e, t ?? this.defaults);
    }
    parseMarkdown(e) {
      return (n, s) => {
        let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
        if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
        if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
        if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
        if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
          let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c;
          i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens));
          let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i);
          return i.hooks ? await i.hooks.postprocess(h) : h;
        })().catch(o);
        try {
          i.hooks && (n = i.hooks.preprocess(n));
          let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
          i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
          let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
          return i.hooks && (p = i.hooks.postprocess(p)), p;
        } catch (u) {
          return o(u);
        }
      };
    }
    onError(e, t) {
      return (n) => {
        if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
          let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
          return t ? Promise.resolve(s) : s;
        }
        if (t) return Promise.reject(n);
        throw n;
      };
    }
  };
  var z = new q();
  function g(l3, e) {
    return z.parse(l3, e);
  }
  g.options = g.setOptions = function(l3) {
    return z.setOptions(l3), g.defaults = z.defaults, N(g.defaults), g;
  };
  g.getDefaults = M;
  g.defaults = T;
  g.use = function(...l3) {
    return z.use(...l3), g.defaults = z.defaults, N(g.defaults), g;
  };
  g.walkTokens = function(l3, e) {
    return z.walkTokens(l3, e);
  };
  g.parseInline = z.parseInline;
  g.Parser = b;
  g.parser = b.parse;
  g.Renderer = y;
  g.TextRenderer = L;
  g.Lexer = x;
  g.lexer = x.lex;
  g.Tokenizer = w;
  g.Hooks = P;
  g.parse = g;
  var Ft = g.options;
  var Ut = g.setOptions;
  var Kt = g.use;
  var Wt = g.walkTokens;
  var Xt = g.parseInline;
  var Vt = b.parse;
  var Yt = x.lex;

  // src/webview/main.js
  g.setOptions({ gfm: true, breaks: false });
  function escHtmlGlobal(str) {
    if (str === null || str === void 0) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  var markedRenderer = new g.Renderer();
  markedRenderer.code = function(tok) {
    var text = tok.text, lang = tok.lang || "";
    var escaped = escHtmlGlobal(text);
    var langAttr = lang ? ' data-lang="' + lang + '"' : "";
    return '<pre class="code-block"' + langAttr + '><button class="copy-code-btn" title="\u590D\u5236\u4EE3\u7801">\u{1F4CB}</button><code>' + escaped + "</code></pre>";
  };
  markedRenderer.codespan = function(tok) {
    return "<code>" + escHtmlGlobal(tok.text) + "</code>";
  };
  markedRenderer.link = function(tok) {
    var href = tok.href || "", title = tok.title || "", text = tok.text || "";
    var cleanUrl = href.trim();
    if (/^(https?:\/\/|mailto:|#|\/|\.)/.test(cleanUrl)) {
      var safe = cleanUrl.replace(/"/g, "&quot;");
      var titleAttr = title ? ' title="' + title.replace(/"/g, "&quot;") + '"' : "";
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer"' + titleAttr + ">" + text + "</a>";
    }
    return text;
  };
  markedRenderer.image = function(tok) {
    var alt = tok.text || "image";
    return '<span class="img-placeholder">\u{1F5BC} ' + escHtmlGlobal(alt) + "</span>";
  };
  g.use({ renderer: markedRenderer });
  (function() {
    function qs(sel) {
      return document.querySelector(sel);
    }
    function byId(id) {
      return document.getElementById(id);
    }
    var vscode;
    try {
      vscode = acquireVsCodeApi();
    } catch (e) {
      return;
    }
    function safePost(msg) {
      try {
        vscode.postMessage(msg);
      } catch (_2) {
      }
    }
    window.addEventListener("error", function(event) {
      var msg = event && event.message ? String(event.message) : "Unknown error";
      safePost({ type: "webviewError", message: msg });
    });
    window.addEventListener("unhandledrejection", function(event) {
      var reason = event && event.reason && (event.reason.message || event.reason) ? String(event.reason.message || event.reason) : "Unhandled promise rejection";
      safePost({ type: "webviewError", message: reason });
    });
    var messagesDiv = byId("messages");
    var input = byId("input");
    var sendBtn = byId("send");
    var stopBtn = byId("stop");
    var clearBtn = byId("clear");
    var snapshotsBtn = byId("snapshots");
    var editToggleBtn = byId("edit-toggle");
    var fontSizeDown = byId("font-size-down");
    var fontSizeReset = byId("font-size-reset");
    var fontSizeUp = byId("font-size-up");
    var confirmBar = byId("replace-confirm");
    var confirmMeta = byId("confirm-meta");
    var confirmApplyBtn = byId("confirm-apply");
    var confirmCancelBtn = byId("confirm-cancel");
    var confirmTitleEl = qs("#replace-confirm .confirm-title");
    var humanAssistBar = byId("human-assistance-confirm");
    var humanAssistQuestion = byId("human-assistance-question");
    var humanAssistDoneBtn = byId("human-assistance-done");
    var humanAssistCancelBtn = byId("human-assistance-cancel");
    var humanAssistInput = byId("human-assistance-input");
    var humanAssistSendBtn = byId("human-assistance-send");
    var modelSelector = byId("model-selector");
    var modelSelectBtn = byId("model-select-btn");
    var modelSelectLabel = byId("model-select-label");
    var modelDropdown = byId("model-dropdown");
    var _modelList = [];
    var _selectedModelIndex = -1;
    var TOOL_ICONS = {
      read_file: "\u{1F4C4}",
      find_in_file: "\u{1F50D}",
      edit: "\u270F\uFE0F",
      create_directory: "\u{1F4C1}",
      get_workspace_info: "\u{1F4C2}"
    };
    var _compactThreshold = 1e6;
    var pendingToolCard = null;
    var pendingConfirm = null;
    var editPermissionEnabled = true;
    var _lastUserMessage = "";
    function scrollBottom() {
      if (!messagesDiv) return;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    function escHtml(str) {
      if (str === null || str === void 0) {
        return "";
      }
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function toggleEditPermission() {
      if (!editToggleBtn) return;
      editPermissionEnabled = !editPermissionEnabled;
      if (editPermissionEnabled) {
        editToggleBtn.classList.remove("off");
        editToggleBtn.classList.add("on");
        editToggleBtn.title = "Toggle edit permission - ON: LLM can use edit tools, OFF: read-only mode";
        var iconSpan = editToggleBtn.querySelector(".toggle-icon");
        var textSpan = editToggleBtn.querySelector(".toggle-text");
        if (iconSpan) iconSpan.textContent = "\u{1F513}";
        if (textSpan) textSpan.textContent = "Edit ON";
      } else {
        editToggleBtn.classList.remove("on");
        editToggleBtn.classList.add("off");
        editToggleBtn.title = "Toggle edit permission - ON: LLM can use edit tools, OFF: read-only mode";
        var iconSpan = editToggleBtn.querySelector(".toggle-icon");
        var textSpan = editToggleBtn.querySelector(".toggle-text");
        if (iconSpan) iconSpan.textContent = "\u{1F512}";
        if (textSpan) textSpan.textContent = "Edit OFF";
      }
      safePost({ type: "setEditPermission", enabled: editPermissionEnabled });
    }
    function updateModelSelector(models, selectedIndex, displayName) {
      _modelList = models || [];
      _selectedModelIndex = selectedIndex != null ? selectedIndex : -1;
      if (!modelSelector) return;
      if (_modelList.length > 0) {
        modelSelector.style.display = "inline-flex";
      } else {
        modelSelector.style.display = "none";
        return;
      }
      if (modelSelectLabel) {
        if (_selectedModelIndex >= 0 && _selectedModelIndex < _modelList.length) modelSelectLabel.textContent = "\u{1F916} " + _modelList[_selectedModelIndex].name;
        else modelSelectLabel.textContent = "\u{1F916} " + (displayName || "Model");
      }
      renderModelDropdown();
      closeModelDropdown();
    }
    function renderModelDropdown() {
      if (!modelDropdown) return;
      var html = "";
      for (var i = 0; i < _modelList.length; i++) {
        var item = _modelList[i], isActive = i === _selectedModelIndex;
        html += '<div class="model-dropdown-item' + (isActive ? " active" : "") + '" data-index="' + i + '"><span class="model-check">' + (isActive ? "\u25CF" : "\u25CB") + '</span><span class="model-item-name">' + escHtml(item.name) + '</span><span class="model-item-id">' + escHtml(item.model) + "</span></div>";
      }
      modelDropdown.innerHTML = html;
    }
    function closeModelDropdown() {
      if (modelDropdown) modelDropdown.style.display = "none";
    }
    function toggleModelDropdown() {
      if (!modelDropdown) return;
      if (modelDropdown.style.display === "block") {
        closeModelDropdown();
      } else {
        renderModelDropdown();
        modelDropdown.style.display = "block";
      }
    }
    function switchModel(index) {
      if (index === _selectedModelIndex) {
        closeModelDropdown();
        return;
      }
      _selectedModelIndex = index;
      if (modelSelectLabel && index >= 0 && index < _modelList.length) modelSelectLabel.textContent = "\u{1F916} " + _modelList[index].name;
      closeModelDropdown();
      safePost({ type: "switchModel", index });
    }
    function parseMarkdown(text) {
      if (!text || typeof text !== "string") return "";
      var mathBlocks = [];
      var working = text;
      working = working.replace(/\$\$([\s\S]*?)\$\$/g, function(match, math) {
        var id2 = mathBlocks.length;
        mathBlocks.push({ id: id2, code: math.trim(), display: true });
        return "\u202E\u202EMATHBLOCK" + id2 + "\u202E\u202E";
      });
      working = working.replace(/\$([^$\n]+?)\$/g, function(match, math) {
        var id2 = mathBlocks.length;
        mathBlocks.push({ id: id2, code: math.trim(), display: false });
        return "\u202E\u202EMATHBLOCK" + id2 + "\u202E\u202E";
      });
      var mathUnicodeRanges = "\\u2200-\\u22FF\\u2280-\\u228B\\u2260-\\u2265\\u2295\\u2297\\u2211\\u220F\\u221A\\u2202\\u2207\\u222B\\u226A\\u226B\\u227A\\u227B\\u2190-\\u21FF\\u00D7\\u00B7\\u2070-\\u209F";
      var hasMathUnicode = new RegExp("[" + mathUnicodeRanges + "]");
      var lines = working.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/\u202E\u202EMATHBLOCK\d+\u202E\u202E/.test(line)) continue;
        if (/^\s*(#|[*>\-]|\d+\.|```|&gt;|\||[│└├┌┐┘┤┬┴┼━┃║╔╗╚╝╠╣╦╩╬═╭╮╰╯▌▐█▄▀])/.test(line)) continue;
        if (!hasMathUnicode.test(line)) continue;
        var ucMatches = line.match(new RegExp("[" + mathUnicodeRanges + "]", "g"));
        var latexLike = /[_^]\{|\\[a-zA-Z]+/.test(line);
        if (/[_^]\{[\w-]+\}\.\w{2,4}\b/.test(line)) latexLike = false;
        if (ucMatches && ucMatches.length >= 1 && latexLike) {
          var id = mathBlocks.length;
          var isDisplay = line.length > 50 || /^\\[a-z]+/.test(line.trim());
          mathBlocks.push({ id, code: line.trim(), display: isDisplay });
          lines[i] = "\u202E\u202EMATHBLOCK" + id + "\u202E\u202E";
        }
      }
      working = lines.join("\n");
      var html;
      try {
        html = g.parse(working, { async: false });
      } catch (e) {
        html = working.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      html = html.replace(/\u202E\u202EMATHBLOCK(\d+)\u202E\u202E/g, function(match, idStr) {
        var entry = mathBlocks[parseInt(idStr)];
        if (!entry) return match;
        try {
          if (typeof katex !== "undefined" && katex.renderToString) {
            return katex.renderToString(entry.code, { displayMode: entry.display, throwOnError: false, output: "html" });
          }
        } catch (e) {
        }
        if (entry.display) return '<div class="katex-fallback">' + escHtml(entry.code) + "</div>";
        return '<span class="katex-fallback">' + escHtml(entry.code) + "</span>";
      });
      return html;
    }
    function addMessage(role, content) {
      if (!messagesDiv) return;
      var row = document.createElement("div");
      row.className = "message-row " + role;
      if (content != null) row.dataset.rawContent = String(content);
      if (role !== "system" && role !== "event") {
        var header = document.createElement("div");
        header.className = "message-header";
        var label = document.createElement("div");
        label.className = "message-role";
        label.textContent = role === "user" ? "You" : "Assistant";
        header.appendChild(label);
        var copyBtn = document.createElement("button");
        copyBtn.className = "msg-copy-btn";
        copyBtn.title = "\u590D\u5236\u672C\u6761\u6D88\u606F";
        copyBtn.textContent = "\u{1F4CB}";
        header.appendChild(copyBtn);
        row.appendChild(header);
      }
      var bubble = document.createElement("div");
      bubble.className = "bubble";
      if (content === null || content === void 0) {
        bubble.innerHTML = "";
      } else {
        bubble.innerHTML = parseMarkdown(String(content));
      }
      row.appendChild(bubble);
      messagesDiv.appendChild(row);
      scrollBottom();
    }
    var REF_ITEMS = [
      { label: "file", icon: "\u{1F4C4}", desc: "\u5F15\u7528\u6587\u4EF6\u5185\u5BB9", hint: "file:path" },
      { label: "problem", icon: "\u{1F534}", desc: "\u5F53\u524D\u8BCA\u65AD\u9519\u8BEF", hint: "" },
      { label: "selection", icon: "\u2702\uFE0F", desc: "\u5F53\u524D\u9009\u4E2D\u4EE3\u7801", hint: "" }
    ];
    var _refOpen = false, _refSelectedIdx = 0, _refFilter = "";
    function getAutocompleteEl() {
      return byId("ref-autocomplete");
    }
    function closeRefAutocomplete() {
      _refOpen = false;
      var el = getAutocompleteEl();
      if (el) el.classList.remove("show");
    }
    function openRefAutocomplete(filter) {
      _refFilter = filter || "";
      _refSelectedIdx = 0;
      renderAutocomplete();
      var el = getAutocompleteEl();
      if (el) el.classList.add("show");
      _refOpen = true;
    }
    function renderAutocomplete() {
      var el = getAutocompleteEl();
      if (!el) return;
      var filtered = REF_ITEMS;
      if (_refFilter) {
        var f = _refFilter.toLowerCase();
        filtered = REF_ITEMS.filter(function(item2) {
          return item2.label.indexOf(f) !== -1 || item2.desc.indexOf(f) !== -1;
        });
      }
      if (filtered.length === 0) {
        el.innerHTML = "";
        el.classList.remove("show");
        _refOpen = false;
        return;
      }
      var html = "";
      for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i], selClass = i === _refSelectedIdx ? " selected" : "";
        html += '<div class="ref-autocomplete-item' + selClass + '" data-index="' + i + '"><span class="ref-icon">' + item.icon + '</span><span class="ref-label">@' + item.label + '</span><span class="ref-desc">' + item.desc + "</span>" + (item.hint ? '<span class="ref-hint">@' + item.hint + "</span>" : "") + "</div>";
      }
      el.innerHTML = html;
      var sel = el.querySelector(".selected");
      if (sel) sel.scrollIntoView({ block: "nearest" });
    }
    function applyRefSelection() {
      var el = getAutocompleteEl();
      if (!el || !_refOpen) return;
      var items = el.querySelectorAll(".ref-autocomplete-item");
      if (_refSelectedIdx < 0 || _refSelectedIdx >= items.length) return;
      insertRefTag(REF_ITEMS[_refSelectedIdx].label);
      closeRefAutocomplete();
    }
    function insertRefTag(label) {
      if (!input) return;
      var val = input.value, pos = input.selectionStart, start = pos;
      while (start > 0 && val[start - 1] !== "@") {
        start--;
      }
      if (start === pos || val[start] !== "@") {
        start = pos;
        var before = val.slice(0, pos), atIdx = before.lastIndexOf("@");
        if (atIdx >= 0) {
          start = atIdx;
        } else {
          var newVal = val.slice(0, pos) + "@" + label + (label === "file" ? ":" : "") + " " + val.slice(pos);
          input.value = newVal;
          var newPos = pos + 1 + label.length + (label === "file" ? 1 : 0) + 1;
          input.setSelectionRange(newPos, newPos);
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 120) + "px";
          return;
        }
      }
      var end = start + 1;
      while (end < val.length && val[end] !== " " && val[end] !== "\n") {
        end++;
      }
      var replacement = "@" + label + (label === "file" ? ":" : "") + " ";
      input.value = val.slice(0, start) + replacement + val.slice(end);
      var newPos = start + replacement.length;
      input.setSelectionRange(newPos, newPos);
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    }
    function getRefFilter() {
      if (!input) return null;
      var val = input.value, pos = input.selectionStart, before = val.slice(0, pos), atIdx = before.lastIndexOf("@");
      if (atIdx === -1) return null;
      var after = before.slice(atIdx + 1);
      if (after.indexOf(" ") !== -1 || after.indexOf("\n") !== -1) return null;
      if (after.indexOf(":") !== -1) return null;
      return after;
    }
    function addCheckCard(data) {
      if (!messagesDiv) return;
      var verdict = data.verdict || "";
      var card = document.createElement("div");
      card.className = "check-card " + String(verdict).toLowerCase();
      var icon = verdict === "CONFIRMED" ? "\u2705" : "\u274C";
      var timeStr = new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      var header = document.createElement("div");
      header.className = "check-header";
      var roundLabel = data.reviewRound != null && data.reviewRound !== void 0 ? " \xB7 round " + escHtml(String(data.reviewRound)) : "";
      header.innerHTML = '<span class="check-icon">' + icon + '</span><span class="check-title">Edit review' + roundLabel + '</span><span class="check-status">' + escHtml(verdict) + "</span>";
      header.addEventListener("click", function() {
        card.classList.toggle("expanded");
      });
      var meta = document.createElement("div");
      meta.className = "check-meta";
      meta.innerHTML = '<span class="file-path">' + escHtml(data.filePath) + '</span><span class="line-range">lines ' + data.startLine + "\u2013" + data.endLine + '</span><span class="check-time">' + escHtml(timeStr) + "</span>";
      var body = document.createElement("div");
      body.className = "check-body";
      var hasUnified = typeof data.unifiedDiff === "string" && data.unifiedDiff.length > 0;
      if (hasUnified) {
        if (data.contextTruncated) {
          var hint = document.createElement("div");
          hint.className = "check-diff-trunc";
          hint.textContent = "Long diff trimmed for chat view.";
          body.appendChild(hint);
        }
        var pre = document.createElement("pre");
        pre.className = "check-diff-unified";
        var rawDiff = data.unifiedDiff || "", diffHtml = "", diffLines = rawDiff.split("\n");
        for (var i = 0; i < diffLines.length; i++) {
          var line = diffLines[i], cls = "";
          if (line.length > 2 && line.charAt(0) === "-") cls = "diff-del";
          else if (line.length > 2 && line.charAt(0) === "+") cls = "diff-add";
          if (cls) diffHtml += '<span class="' + cls + '">' + escHtml(line) + "</span>\n";
          else diffHtml += escHtml(line) + "\n";
        }
        pre.innerHTML = diffHtml;
        body.appendChild(pre);
      }
      var reasonDiv = document.createElement("div");
      reasonDiv.className = "reason-section";
      reasonDiv.innerHTML = "<strong>LLM Reason:</strong> " + escHtml(data.reason);
      body.appendChild(reasonDiv);
      card.appendChild(header);
      card.appendChild(meta);
      card.appendChild(body);
      messagesDiv.appendChild(card);
      if (hasUnified) card.classList.add("expanded");
      scrollBottom();
    }
    function addToolCall(name, args) {
      if (!messagesDiv) return null;
      var card = document.createElement("div");
      card.className = "tool-card";
      var displayName = name === "replace_lines" ? "edit" : name;
      var icon = TOOL_ICONS[name] || "\u{1F527}";
      var argsStr = JSON.stringify(args, null, 2);
      var command = name === "run_shell_command" && args && args.command ? String(args.command) : "";
      card.dataset.toolName = name;
      if (command) card.dataset.command = command;
      card.innerHTML = '<div class="tool-header"><span class="tool-icon">' + icon + '</span><span class="tool-name">' + escHtml(displayName) + '</span><span class="tool-status">running\u2026</span></div><div class="tool-body">' + escHtml(command ? "Command:\n" + command + "\n\nArgs:\n" + argsStr : argsStr) + "</div>";
      var headerEl = card.querySelector(".tool-header");
      if (headerEl) headerEl.addEventListener("click", function() {
        card.classList.toggle("expanded");
      });
      messagesDiv.appendChild(card);
      scrollBottom();
      pendingToolCard = card;
      return card;
    }
    function fillEditDiffBody(card, body, parsed) {
      var ud = parsed && typeof parsed.unifiedDiff === "string" ? parsed.unifiedDiff : "";
      if (!ud) return false;
      card.classList.add("tool-card-edit-diff");
      body.innerHTML = "";
      var meta = document.createElement("div");
      meta.className = "check-meta";
      var fp = parsed.filePath != null ? String(parsed.filePath) : "";
      var sl = parsed.startLine != null ? String(parsed.startLine) : "";
      var el = parsed.endLine != null ? String(parsed.endLine) : "";
      meta.innerHTML = '<span class="file-path">' + fp + '</span><span class="line-range">lines ' + sl + "\u2013" + el + "</span>";
      var pre = document.createElement("pre");
      pre.className = "check-diff-unified";
      pre.textContent = ud;
      body.appendChild(meta);
      body.appendChild(pre);
      return true;
    }
    function resolveToolCard(result, fromReplay) {
      var card = pendingToolCard;
      if (!card) {
        var allCards = document.querySelectorAll(".tool-card");
        for (var i = allCards.length - 1; i >= 0; i--) {
          var c = allCards[i];
          if (!c.classList.contains("done") && !c.classList.contains("error")) {
            card = c;
            break;
          }
        }
      }
      pendingToolCard = null;
      if (!card) return;
      var parsed;
      try {
        parsed = JSON.parse(result);
      } catch (_2) {
        parsed = { raw: result };
      }
      var isError = parsed && (parsed.error || parsed.success === false);
      var toolName = card.dataset.toolName || "";
      var hasUnifiedDiff = !!(parsed && typeof parsed.unifiedDiff === "string" && parsed.unifiedDiff.length > 0);
      card.classList.add(isError ? "error" : "done");
      var statusEl = card.querySelector(".tool-status");
      if (statusEl) statusEl.textContent = isError ? "error: " + (parsed.error || parsed.message || "?") : parsed.message || "done";
      var body = card.querySelector(".tool-body");
      if (body) {
        var filledDiff = false;
        if (fromReplay && (toolName === "edit" || toolName === "replace_lines") && hasUnifiedDiff) {
          filledDiff = fillEditDiffBody(card, body, parsed);
        }
        if (!filledDiff) {
          var cmd = card.dataset.command || "", forDisplay = parsed;
          if (!fromReplay && hasUnifiedDiff && (toolName === "edit" || toolName === "replace_lines")) {
            try {
              forDisplay = JSON.parse(JSON.stringify(parsed));
              if (forDisplay && typeof forDisplay === "object") delete forDisplay.unifiedDiff;
            } catch (_2) {
              forDisplay = parsed;
            }
          }
          var resultStr = JSON.stringify(forDisplay, null, 2);
          body.textContent = toolName === "run_shell_command" && cmd ? "Command:\n" + cmd + "\n\nResult:\n" + resultStr : resultStr;
        }
        if (hasUnifiedDiff && (toolName === "edit" || toolName === "replace_lines") && parsed.filePath) {
          var openBtn = document.createElement("button");
          openBtn.className = "diff-open-btn";
          openBtn.textContent = "Open in Diff Editor";
          openBtn.title = "Show this edit as a side-by-side diff in the VS Code editor";
          openBtn.addEventListener("click", function() {
            safePost({ type: "openDiff", filePath: parsed.filePath });
          });
          body.appendChild(openBtn);
        }
      }
      if ((toolName === "edit" || toolName === "replace_lines") && (!isError || fromReplay && hasUnifiedDiff)) card.classList.add("expanded");
      else card.classList.remove("expanded");
      scrollBottom();
    }
    function showLoading(show) {
      if (!messagesDiv) return;
      var el = byId("loading");
      if (show) {
        if (!el) {
          el = document.createElement("div");
          el.id = "loading";
          el.className = "loading";
          el.textContent = "Thinking\u2026";
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
    function showInfo(msg) {
      if (!messagesDiv) return;
      var el = document.createElement("div");
      el.className = "info-msg";
      el.textContent = msg;
      messagesDiv.appendChild(el);
      scrollBottom();
    }
    function showError(msg) {
      if (!messagesDiv) return;
      var el = document.createElement("div");
      el.className = "error-msg";
      var isTimeout = /timed out|\u8D85\u65F6/i.test(msg);
      if (isTimeout && typeof _lastUserMessage !== "undefined" && _lastUserMessage) {
        el.innerHTML = escHtml(msg) + ' <button class="retry-btn" title="\u91CD\u8BD5">\u91CD\u8BD5</button>';
        var btn = el.querySelector(".retry-btn");
        if (btn) btn.addEventListener("click", function(e) {
          e.stopPropagation();
          safePost({ type: "sendMessage", text: _lastUserMessage });
        });
      } else {
        el.textContent = msg;
      }
      messagesDiv.appendChild(el);
      scrollBottom();
    }
    function fmtTokens(n) {
      n = Number(n) || 0;
      if (n < 1e3) return String(n);
      return (n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
    }
    function fmtTokensFull(n) {
      n = Number(n) || 0;
      return n.toLocaleString("en-US");
    }
    function showTokenUsage(msg) {
      var footer = byId("usage-footer");
      if (!footer) return;
      if (msg.compactThreshold) _compactThreshold = msg.compactThreshold;
      var ctx = msg.contextTokens != null ? msg.contextTokens : msg.usage ? msg.usage.prompt_tokens : null;
      var ctxStr = ctx == null ? "\u2013" : fmtTokens(ctx);
      footer.innerHTML = '<span class="usage-item" title="context ' + (ctx == null ? "unknown" : fmtTokensFull(ctx)) + " tokens / compact threshold " + fmtTokensFull(_compactThreshold) + ' tokens"><span class="usage-value">' + ctxStr + '</span><span class="usage-label">/' + fmtTokens(_compactThreshold) + "</span></span>";
    }
    function formatTime(timestamp) {
      var date = new Date(timestamp), now = /* @__PURE__ */ new Date(), diff = now - date;
      if (diff < 864e5) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (diff < 6048e5) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    function updateSessionsList(sessions) {
      var sl = byId("sessions-list");
      if (!sl) return;
      sl.innerHTML = "";
      sessions.forEach(function(session) {
        var item = document.createElement("div");
        item.className = "session-item" + (session.isActive ? " active" : "");
        item.dataset.id = session.id;
        item.innerHTML = '<div class="session-item-content"><div class="session-title">' + escHtml(session.title) + '</div><div class="session-meta"><span>' + (session.messageCount || 0) + " messages</span><span>" + formatTime(session.updated) + '</span></div></div><div class="session-actions"><button class="session-btn edit-btn" title="Rename">\u270F\uFE0F</button><button class="session-btn copy-btn" title="Duplicate">\u{1F4CB}</button><button class="session-btn delete-btn" title="Delete">\u{1F5D1}</button></div>';
        item.addEventListener("click", function(e) {
          if (!e.target.closest(".session-actions")) safePost({ type: "switchSession", sessionId: session.id });
        });
        var eb = item.querySelector(".edit-btn");
        if (eb) eb.addEventListener("click", function(e) {
          e.stopPropagation();
          safePost({ type: "renameSession", sessionId: session.id, currentTitle: session.title });
        });
        var db = item.querySelector(".delete-btn");
        if (db) db.addEventListener("click", function(e) {
          e.stopPropagation();
          safePost({ type: "deleteSession", sessionId: session.id });
        });
        var cb = item.querySelector(".copy-btn");
        if (cb) cb.addEventListener("click", function(e) {
          e.stopPropagation();
          safePost({ type: "duplicateSession", sessionId: session.id });
        });
        sl.appendChild(item);
      });
    }
    function showSnapshotsList(snapshots) {
      if (!messagesDiv) return;
      var old = messagesDiv.querySelector(".snapshot-panel");
      if (old) old.remove();
      var panel = document.createElement("div");
      panel.className = "snapshot-panel";
      var hdr = document.createElement("div");
      hdr.className = "snapshot-panel-header";
      hdr.innerHTML = "<span>\u23EE\uFE0F Git Snapshots (" + snapshots.length + ')</span><button class="snapshot-panel-close" title="Close">\xD7</button>';
      var close = hdr.querySelector(".snapshot-panel-close");
      if (close) close.addEventListener("click", function() {
        panel.remove();
      });
      panel.appendChild(hdr);
      if (snapshots.length === 0) {
        var empty = document.createElement("div");
        empty.className = "snapshot-empty";
        empty.textContent = "No snapshots yet.";
        panel.appendChild(empty);
      } else {
        var sorted = snapshots.slice().sort(function(a, b2) {
          return b2.timestamp - a.timestamp;
        });
        sorted.forEach(function(snapshot) {
          var item = document.createElement("div");
          item.className = "snapshot-item";
          var date = new Date(snapshot.timestamp);
          var timeStr = date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          var instruction = snapshot.userInstruction || snapshot.subject || snapshot.snapshotId;
          var truncated = instruction.length > 80 ? instruction.slice(0, 80) + "\u2026" : instruction;
          item.innerHTML = '<div class="snapshot-meta"><div class="snapshot-time">' + escHtml(timeStr) + " \xB7 " + escHtml((snapshot.commitHash || "").slice(0, 7)) + '</div><div class="snapshot-instruction" title="' + escHtml(instruction) + '">' + escHtml(truncated) + '</div></div><button class="snapshot-rollback-btn">\u21A9 Rollback</button>';
          var rb = item.querySelector(".snapshot-rollback-btn");
          if (rb) rb.addEventListener("click", function() {
            safePost({ type: "rollbackToSnapshot", snapshot: { tag: snapshot.tag, snapshotId: snapshot.snapshotId, userInstruction: instruction } });
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
        if (confirmBar) confirmBar.classList.remove("show");
        if (humanAssistBar) humanAssistBar.classList.remove("show");
        return;
      }
      var kind = pendingConfirm.kind || "replace";
      if (kind === "shell") safePost({ type: "shellConfirmResponse", requestId: pendingConfirm.requestId, approved });
      else if (kind === "humanAssistance") safePost({ type: "humanAssistanceConfirmResponse", requestId: pendingConfirm.requestId, approved, userMessage: userMessage || "" });
      else safePost({ type: "replaceConfirmResponse", requestId: pendingConfirm.requestId, approved });
      pendingConfirm = null;
      if (confirmBar) confirmBar.classList.remove("show");
      if (humanAssistBar) humanAssistBar.classList.remove("show");
      if (humanAssistInput) humanAssistInput.value = "";
    }
    var sidebar = byId("session-sidebar"), toggleBtn = byId("toggle-sidebar"), closeBtn = qs(".sidebar-close"), addSessionBtn = byId("add-session");
    if (toggleBtn && sidebar) toggleBtn.addEventListener("click", function() {
      sidebar.classList.add("open");
    });
    if (closeBtn && sidebar) closeBtn.addEventListener("click", function() {
      sidebar.classList.remove("open");
    });
    if (addSessionBtn) addSessionBtn.addEventListener("click", function() {
      safePost({ type: "newSession" });
    });
    document.addEventListener("click", function(e) {
      var t = e.target;
      if (!t || !sidebar) return;
      var ob = t.closest && t.closest("#toggle-sidebar");
      if (ob) {
        sidebar.classList.add("open");
        return;
      }
      var cl = t.closest && t.closest(".sidebar-close");
      if (cl) sidebar.classList.remove("open");
    });
    if (confirmApplyBtn) confirmApplyBtn.addEventListener("click", function() {
      respondConfirm(true);
    });
    if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", function() {
      respondConfirm(false);
    });
    if (humanAssistDoneBtn) humanAssistDoneBtn.addEventListener("click", function() {
      respondConfirm(true);
    });
    if (humanAssistCancelBtn) humanAssistCancelBtn.addEventListener("click", function() {
      respondConfirm(false);
    });
    if (humanAssistSendBtn) humanAssistSendBtn.addEventListener("click", function() {
      var msg = humanAssistInput ? humanAssistInput.value.trim() : "";
      respondConfirm(true, msg);
    });
    if (humanAssistInput) {
      humanAssistInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          var msg = humanAssistInput.value.trim();
          respondConfirm(true, msg);
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          var start = humanAssistInput.selectionStart, end = humanAssistInput.selectionEnd;
          humanAssistInput.value = humanAssistInput.value.substring(0, start) + "\n" + humanAssistInput.value.substring(end);
          humanAssistInput.selectionStart = humanAssistInput.selectionEnd = start + 1;
          var evt = new Event("input", { bubbles: true });
          humanAssistInput.dispatchEvent(evt);
        }
      });
      humanAssistInput.addEventListener("input", function() {
        humanAssistInput.style.height = "auto";
        humanAssistInput.style.height = Math.min(humanAssistInput.scrollHeight, 120) + "px";
      });
    }
    if (sendBtn) sendBtn.addEventListener("click", function() {
      if (!input) return;
      closeRefAutocomplete();
      var text = input.value.trim();
      _lastUserMessage = text;
      input.value = "";
      input.style.height = "auto";
      safePost({ type: "sendMessage", text });
    });
    if (stopBtn) stopBtn.addEventListener("click", function() {
      safePost({ type: "stopOperation" });
    });
    if (clearBtn) clearBtn.addEventListener("click", function() {
      safePost({ type: "clearHistory" });
    });
    if (messagesDiv) messagesDiv.addEventListener("click", function(e) {
      var btn = e.target.closest(".msg-copy-btn");
      if (!btn) return;
      var row = btn.closest(".message-row");
      if (!row) return;
      var rawText = row.dataset.rawContent;
      if (!rawText) return;
      try {
        navigator.clipboard.writeText(rawText).then(function() {
          var orig = btn.textContent;
          btn.textContent = "\u2705";
          setTimeout(function() {
            btn.textContent = orig;
          }, 2e3);
        }, function() {
          var ta2 = document.createElement("textarea");
          ta2.value = rawText;
          ta2.style.position = "fixed";
          ta2.style.opacity = "0";
          document.body.appendChild(ta2);
          ta2.select();
          document.execCommand("copy");
          document.body.removeChild(ta2);
        });
      } catch (e2) {
        var ta = document.createElement("textarea");
        ta.value = rawText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
    if (messagesDiv) messagesDiv.addEventListener("click", function(e) {
      var btn = e.target.closest(".copy-code-btn");
      if (!btn) return;
      var pre = btn.closest("pre.code-block");
      if (!pre) return;
      var code = pre.querySelector("code");
      if (!code) return;
      var text = code.textContent;
      try {
        navigator.clipboard.writeText(text).then(function() {
          var orig = btn.textContent;
          btn.textContent = "\u2705";
          setTimeout(function() {
            btn.textContent = orig;
          }, 2e3);
        }, function() {
          var ta2 = document.createElement("textarea");
          ta2.value = text;
          ta2.style.position = "fixed";
          ta2.style.opacity = "0";
          document.body.appendChild(ta2);
          ta2.select();
          document.execCommand("copy");
          document.body.removeChild(ta2);
        });
      } catch (e2) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
    if (snapshotsBtn) snapshotsBtn.addEventListener("click", function() {
      safePost({ type: "showSnapshots" });
    });
    if (editToggleBtn) editToggleBtn.addEventListener("click", toggleEditPermission);
    var _chatFontSize = 14, FONT_SIZE_MIN = 10, FONT_SIZE_MAX = 28, FONT_SIZE_DEFAULT = 14, FONT_SIZE_STEP = 2;
    function initFontSize() {
      try {
        var saved = localStorage.getItem("chatFontSize");
        if (saved !== null) {
          var val = parseInt(saved, 10);
          if (!isNaN(val) && val >= FONT_SIZE_MIN && val <= FONT_SIZE_MAX) _chatFontSize = val;
        }
      } catch (e) {
      }
      document.documentElement.style.setProperty("--chat-font-size", _chatFontSize + "px");
    }
    function applyFontSize(size) {
      _chatFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      document.documentElement.style.setProperty("--chat-font-size", _chatFontSize + "px");
      try {
        localStorage.setItem("chatFontSize", String(_chatFontSize));
      } catch (e) {
      }
    }
    initFontSize();
    if (fontSizeDown) fontSizeDown.addEventListener("click", function() {
      applyFontSize(_chatFontSize - FONT_SIZE_STEP);
    });
    if (fontSizeReset) fontSizeReset.addEventListener("click", function() {
      applyFontSize(FONT_SIZE_DEFAULT);
    });
    if (fontSizeUp) fontSizeUp.addEventListener("click", function() {
      applyFontSize(_chatFontSize + FONT_SIZE_STEP);
    });
    if (modelSelectBtn) modelSelectBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleModelDropdown();
    });
    document.addEventListener("click", function(e) {
      if (modelDropdown && modelDropdown.style.display === "block") {
        var target = e.target;
        if (!target || target !== modelSelectBtn && !modelSelectBtn.contains(target) && !modelDropdown.contains(target)) closeModelDropdown();
      }
    });
    if (modelDropdown) modelDropdown.addEventListener("click", function(e) {
      var target = e.target, item = target.closest ? target.closest(".model-dropdown-item") : null;
      if (item) {
        var idx = parseInt(item.getAttribute("data-index"), 10);
        if (!isNaN(idx)) switchModel(idx);
      }
    });
    if (input) {
      input.addEventListener("keydown", function(e) {
        if (_refOpen) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            _refSelectedIdx = Math.min(_refSelectedIdx + 1, REF_ITEMS.length - 1);
            renderAutocomplete();
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            _refSelectedIdx = Math.max(_refSelectedIdx - 1, 0);
            renderAutocomplete();
            return;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            applyRefSelection();
            return;
          }
          if (e.key === "Escape") {
            closeRefAutocomplete();
            return;
          }
        }
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (sendBtn) sendBtn.click();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          var start = input.selectionStart, end = input.selectionEnd;
          input.value = input.value.substring(0, start) + "\n" + input.value.substring(end);
          input.selectionStart = input.selectionEnd = start + 1;
          var evt = new Event("input", { bubbles: true });
          input.dispatchEvent(evt);
        }
      });
      input.addEventListener("input", function() {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
        var filter = getRefFilter();
        if (filter !== null) openRefAutocomplete(filter);
        else closeRefAutocomplete();
      });
      input.addEventListener("blur", function() {
        setTimeout(closeRefAutocomplete, 200);
      });
    }
    document.addEventListener("click", function(e) {
      var item = e.target && e.target.closest && e.target.closest(".ref-autocomplete-item");
      if (item) {
        var idx = parseInt(item.getAttribute("data-index"), 10);
        if (!isNaN(idx)) {
          _refSelectedIdx = idx;
          applyRefSelection();
        }
        return;
      }
    });
    window.addEventListener("message", function(event) {
      var msg = event.data;
      switch (msg.type) {
        case "snapshotsList":
          showSnapshotsList(msg.snapshots);
          break;
        case "addMessage":
          addMessage(msg.message.role, msg.message.content);
          break;
        case "addCheckCard":
          addCheckCard(msg.data);
          break;
        case "toolCall":
          addToolCall(msg.name, msg.args);
          break;
        case "toolResult":
          resolveToolCard(msg.result, msg.fromReplay === true);
          break;
        case "loading":
          showLoading(msg.loading);
          break;
        case "error":
          showError(msg.message);
          break;
        case "tokenUsage":
          showTokenUsage(msg);
          break;
        case "setRunning":
          setRunningState(msg.running);
          break;
        case "info":
          showInfo(msg.message);
          break;
        case "requestReplaceConfirm": {
          pendingConfirm = msg.data || null;
          pendingConfirm.kind = "replace";
          var fp = pendingConfirm && pendingConfirm.filePath ? pendingConfirm.filePath : "";
          var rng = pendingConfirm ? pendingConfirm.startLine + "\u2013" + pendingConfirm.endLine : "";
          if (confirmMeta) confirmMeta.textContent = fp ? fp + (rng ? " \xB7 lines " + rng : "") : "";
          if (confirmTitleEl) confirmTitleEl.textContent = "Apply this edit?";
          if (confirmBar) confirmBar.classList.add("show");
          scrollBottom();
          break;
        }
        case "requestShellConfirm": {
          pendingConfirm = msg.data || null;
          if (pendingConfirm) pendingConfirm.kind = "shell";
          var cmd = pendingConfirm && pendingConfirm.command ? String(pendingConfirm.command) : "";
          if (confirmMeta) confirmMeta.textContent = cmd ? cmd : "";
          if (confirmTitleEl) confirmTitleEl.textContent = "Run this command?";
          if (confirmBar) confirmBar.classList.add("show");
          scrollBottom();
          break;
        }
        case "requestHumanAssistanceConfirm": {
          pendingConfirm = msg.data || null;
          if (pendingConfirm) pendingConfirm.kind = "humanAssistance";
          var qText = pendingConfirm && pendingConfirm.question ? String(pendingConfirm.question) : "";
          if (humanAssistQuestion) humanAssistQuestion.textContent = qText;
          if (humanAssistBar) humanAssistBar.classList.add("show");
          scrollBottom();
          break;
        }
        case "clearMessages":
          if (messagesDiv) messagesDiv.innerHTML = "";
          pendingToolCard = null;
          pendingConfirm = null;
          if (confirmBar) confirmBar.classList.remove("show");
          if (humanAssistBar) humanAssistBar.classList.remove("show");
          showTokenUsage({ usage: null, compactThreshold: _compactThreshold });
          break;
        case "sessionsList":
          updateSessionsList(msg.sessions);
          break;
        case "modelList":
          updateModelSelector(msg.models, msg.selectedIndex, msg.currentDisplayName);
          break;
      }
    });
    safePost({ type: "ready" });
  })();
})();
//# sourceMappingURL=webview.js.map
