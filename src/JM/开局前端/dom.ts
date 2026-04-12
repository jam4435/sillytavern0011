export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) throw Error(`未找到元素: #${id}`);
  return element;
}

export function maybeById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function queryRequired<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector(selector) as T | null;
  if (!element) throw Error(`未找到元素: ${selector}`);
  return element;
}
