export class InfoPanel {
  constructor(root) {
    this.root = root;
    this.sections = {};
  }

  section(id, title, open = true) {
    const d = document.createElement('details');
    d.open = open;
    const s = document.createElement('summary');
    s.textContent = title;
    const body = document.createElement('div');
    d.append(s, body);
    this.root.appendChild(d);
    this.sections[id] = body;
    return body;
  }

  set(id, html) {
    const body = this.sections[id];
    if (body && body.__html !== html) { body.innerHTML = html; body.__html = html; }
  }
}

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const pre = (s) => `<pre>${esc(s)}</pre>`;
export const fmtVec = (v, d = 2) => '[' + v.map((x) => x.toFixed(d)).join(', ') + ']';
