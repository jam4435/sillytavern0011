import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { useGameStore } from './stores/game';

function mount(): void {
  const pinia = createPinia();
  const app = createApp(App);
  app.use(pinia);
  app.mount('#app');
  const store = useGameStore(pinia);
  const listeners: EventOnReturn[] = [];

  if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
    listeners.push(eventOn(tavern_events.CHAT_CHANGED, () => store.reloadFromHost(false)));
    for (const eventName of [tavern_events.MESSAGE_SWIPED, tavern_events.MESSAGE_DELETED, tavern_events.MESSAGE_EDITED, tavern_events.MESSAGE_UPDATED]) {
      listeners.push(eventOn(eventName, () => store.reloadFromHost(true)));
    }
    listeners.push(eventOn('ck:host_state_changed', (historyChanged: boolean) => store.reloadFromHost(historyChanged)));
  }

  window.addEventListener('pagehide', () => {
    listeners.forEach(listener => listener.stop());
    app.unmount();
  }, { once: true });
}

if (typeof $ === 'function') $(() => mount());
else mount();
