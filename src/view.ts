import { mount } from 'svelte';
import {
  ExtensionContext,
  registerIconElement,
} from 'asyar-sdk/view';
import type {
  IActionService,
  IClipboardHistoryService,
  IInteropService,
} from 'asyar-sdk/contracts';
import TestView    from './views/TestView.svelte';
import HistoryView from './views/HistoryView.svelte';

const extensionId = resolveExtensionId();

const context = new ExtensionContext();
context.setExtensionId(extensionId);
registerIconElement();

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault();
    window.parent.postMessage({
      type: 'asyar:extension:keydown',
      payload: {
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      },
    }, '*');
  }
});

window.parent.postMessage(
  { type: 'asyar:extension:loaded', extensionId, role: 'view' },
  '*',
);

const actions    = context.getService<IActionService>('actions');
const clipboard  = context.getService<IClipboardHistoryService>('clipboard');
const interop    = context.getService<IInteropService>('interop');

const viewName = new URLSearchParams(window.location.search).get('view') || 'TestView';
const target = document.getElementById('app')!;

if (viewName === 'TestView') {
  mount(TestView, {
    target,
    props: { context, actions, clipboard, interop, extensionId },
  });
} else if (viewName === 'HistoryView') {
  mount(HistoryView, {
    target,
    props: { context, actions, clipboard, interop, extensionId },
  });
}

function resolveExtensionId(): string {
  const fallback = 'org.asyar.speedtest';
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === 'asyar-extension.localhost') {
    return window.location.pathname.split('/').filter(Boolean)[0] || fallback;
  }
  return window.location.hostname || fallback;
}
