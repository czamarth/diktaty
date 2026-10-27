// Minimální pomocník pro tvorbu DOM. Data se vkládají výhradně jako text (žádné innerHTML).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Vyprázdní prvek a vrátí objekt s append(), který (na rozdíl od nativního Element.append)
// přeskočí null/false a rozbalí pole – jinak by se do stránky vypsalo „null“ nebo „[object …]“.
export function clear(el) {
  el.replaceChildren();
  return { append: (...children) => { append(el, children); return el; } };
}

// Oznámení pro čtečky obrazovky (aria-live) – krátké a bez opakování.
export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = message; }, 30);
}
