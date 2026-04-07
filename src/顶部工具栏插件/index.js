const {
  eventSource,
  event_types,
  getCurrentChatId,
  renameChat,
  getRequestHeaders,
  openGroupChat,
  openCharacterChat,
  executeSlashCommandsWithOptions,
  Popup,
} = SillyTavern.getContext();
import { debounce_timeout } from '../../../constants.js';
import { t } from '../../../i18n.js';
import { debounce } from '../../../utils.js';
import { addJQueryHighlight } from './jquery-highlight.js';

const movingDivs = /** @type {HTMLDivElement} */ (document.getElementById('movingDivs'));
const sheld = /** @type {HTMLDivElement} */ (document.getElementById('sheld'));
const chat = /** @type {HTMLDivElement} */ (document.getElementById('chat'));
const draggableTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('generic_draggable_template'));
const apiBlock = /** @type {HTMLDivElement} */ (document.getElementById('rm_api_block'));

const topBar = document.createElement('div');
const chatName = document.createElement('select');
const searchInput = document.createElement('input');
const connectionProfiles = document.createElement('div');
const connectionProfilesStatus = document.createElement('div');
const connectionProfilesSelect = document.createElement('select');
const connectionProfilesIcon = document.createElement('img');

let currentMessageIndex = -1;

const icons = [
  {
    id: 'extensionTopBarNavUp',
    icon: 'fa-fw fa-solid fa-arrow-up',
    position: 'right',
    title: t`Scroll to previous reply`,
    onClick: () => navigateReplies(-1),
  },
  {
    id: 'extensionTopBarNavDown',
    icon: 'fa-fw fa-solid fa-arrow-down',
    position: 'right',
    title: t`Scroll to next reply`,
    onClick: () => navigateReplies(1),
  },
  {
    id: 'extensionTopBarEditLastReply',
    icon: 'fa-fw fa-solid fa-pen-to-square',
    position: 'right',
    title: t`Edit last reply`,
    onClick: onEditLastReplyClick,
  },
  {
    id: 'extensionTopBarDeleteLastReply',
    icon: 'fa-fw fa-solid fa-trash-can',
    position: 'right',
    title: t`Delete last reply`,
    onClick: onDeleteLastReplyClick,
  },
  {
    id: 'extensionTopBarConfirmEdit',
    icon: 'fa-fw fa-solid fa-check',
    position: 'right',
    title: t`Confirm edit`,
    onClick: onConfirmEditClick,
    isHidden: true,
  },
  {
    id: 'extensionTopBarCancelEdit',
    icon: 'fa-fw fa-solid fa-xmark',
    position: 'right',
    title: t`Cancel edit`,
    onClick: onCancelEditClick,
    isHidden: true,
  },
  {
    id: 'extensionTopBarDeleteEdited',
    icon: 'fa-fw fa-solid fa-trash-can',
    position: 'right',
    title: t`Delete this message`,
    onClick: onDeleteEditedClick,
    isHidden: true,
  },
];

let currentlyEditingMessage = null;
let editStateObserver = null;

function toggleEditButtons(isEditing) {
  const normalButtons = [
    'extensionTopBarNavUp',
    'extensionTopBarNavDown',
    'extensionTopBarEditLastReply',
    'extensionTopBarDeleteLastReply',
  ];
  const editButtons = ['extensionTopBarConfirmEdit', 'extensionTopBarCancelEdit', 'extensionTopBarDeleteEdited'];

  if (isEditing) {
    normalButtons.forEach(id => document.getElementById(id)?.classList.add('displayNone'));
    editButtons.forEach(id => document.getElementById(id)?.classList.remove('displayNone'));
  } else {
    normalButtons.forEach(id => document.getElementById(id)?.classList.remove('displayNone'));
    editButtons.forEach(id => document.getElementById(id)?.classList.add('displayNone'));
  }
}

function cleanupEditState() {
  if (editStateObserver) {
    editStateObserver.disconnect();
    editStateObserver = null;
  }
  currentlyEditingMessage = null;
  toggleEditButtons(false);
}

function onConfirmEditClick() {
  if (!currentlyEditingMessage) return;
  const confirmButton = currentlyEditingMessage.querySelector('.mes_edit_buttons .fa-check');
  if (confirmButton) {
    confirmButton.click();
  }
  cleanupEditState();
}

function onCancelEditClick() {
  if (!currentlyEditingMessage) return;
  const cancelButton = currentlyEditingMessage.querySelector('.mes_edit_buttons .fa-xmark');
  if (cancelButton) {
    cancelButton.click();
  }
  cleanupEditState();
}

function onDeleteEditedClick() {
  if (!currentlyEditingMessage) return;
  const deleteButton = currentlyEditingMessage.querySelector('.mes_edit_buttons .fa-trash-can');
  if (deleteButton) {
    deleteButton.click();
  }
  cleanupEditState();
}

async function onDeleteLastReplyClick() {
  const chatContainer = document.getElementById('chat');
  const messages = chatContainer.querySelectorAll('.mes:not([is_user="true"]):not([is_system="true"])');
  if (messages.length === 0) {
    executeSlashCommandsWithOptions(`/echo ${t`No AI reply found to delete.`}`);
    return;
  }
  const lastMessage = messages[messages.length - 1];

  const confirm = await Popup.show.confirm(t`Are you sure you want to delete the last reply?`);
  if (confirm) {
    const mesId = lastMessage.getAttribute('mesid');
    if (mesId) {
      await executeSlashCommandsWithOptions(`/del ${mesId}`);
    }
  }
}

function onEditLastReplyClick() {
  if (currentlyEditingMessage) {
    onCancelEditClick();
    return;
  }

  const chatContainer = document.getElementById('chat');
  const messages = chatContainer.querySelectorAll('.mes:not([is_user="true"]):not([is_system="true"])');
  if (messages.length === 0) {
    executeSlashCommandsWithOptions(`/echo ${t`No AI reply found to edit.`}`);
    return;
  }

  const lastMessage = messages[messages.length - 1];
  const editButton = lastMessage.querySelector('.mes_button.mes_edit');

  if (editButton) {
    let enteredEditMode = false;

    const startEditObserver = new MutationObserver((mutationsList, observer) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const editButtons = lastMessage.querySelector('.mes_edit_buttons');
          if (editButtons) {
            enteredEditMode = true;
            observer.disconnect();

            currentlyEditingMessage = lastMessage;
            toggleEditButtons(true);

            editStateObserver = new MutationObserver(() => {
              if (!lastMessage.querySelector('.mes_edit_buttons')) {
                cleanupEditState();
              }
            });
            editStateObserver.observe(lastMessage, { childList: true, subtree: true });

            return;
          }
        }
      }
    });

    startEditObserver.observe(lastMessage, { childList: true, subtree: true });

    editButton.click();

    setTimeout(() => {
      startEditObserver.disconnect();
      if (!enteredEditMode) {
        executeSlashCommandsWithOptions(`/echo ${t`Could not enter edit mode.`}`);
      }
    }, 2000);
  } else {
    executeSlashCommandsWithOptions(`/echo ${t`Could not find an edit button on the last message.`}`);
  }
}

function navigateReplies(direction) {
  const chatContainer = document.getElementById('chat');
  const messages = Array.from(chatContainer.querySelectorAll('.mes:not([is_user="true"]):not([is_system="true"])'));
  if (messages.length === 0) return;

  if (currentMessageIndex === -1) {
    currentMessageIndex = messages.length - 1;
    messages[currentMessageIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (direction === -1 && currentMessageIndex === 0) {
    const firstMessageInChat = chatContainer.querySelector('.mes[mesid="0"]');
    if (firstMessageInChat) {
      firstMessageInChat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      chatContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  if (direction === 1 && currentMessageIndex === messages.length - 1) {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    return;
  }

  currentMessageIndex += direction;
  currentMessageIndex = Math.max(0, Math.min(messages.length - 1, currentMessageIndex));

  const targetMessage = messages[currentMessageIndex];
  if (targetMessage) {
    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setChatName(name) {
  currentMessageIndex = -1; // Reset navigation index on chat change
  const isNotInChat = !name;
  chatName.innerHTML = '';
  const selectedOption = document.createElement('option');
  selectedOption.innerText = name || t`No chat selected`;
  selectedOption.selected = true;
  chatName.appendChild(selectedOption);
  chatName.disabled = true;
}

function addTopBar() {
  chatName.id = 'extensionTopBarChatName';
  topBar.id = 'extensionTopBar';
  searchInput.id = 'extensionTopBarSearchInput';
  searchInput.placeholder = 'Search...';
  searchInput.classList.add('text_pole');
  searchInput.type = 'search';
  searchInput.addEventListener('input', () => searchDebounced(searchInput.value.trim()));
  topBar.append(chatName, searchInput);
  sheld.insertBefore(topBar, chat);
}

function addIcons() {
  icons.forEach(icon => {
    const iconElement = document.createElement('i');
    iconElement.id = icon.id;
    iconElement.className = icon.icon;
    iconElement.title = icon.title;
    iconElement.tabIndex = 0;
    iconElement.classList.add('right_menu_button');
    if (icon.isHidden) {
      iconElement.classList.add('displayNone');
    }
    iconElement.addEventListener('click', () => {
      if (iconElement.classList.contains('not-in-chat')) return;
      icon.onClick();
    });
    if (icon.position === 'left') {
      topBar.insertBefore(iconElement, chatName);
      return;
    }
    if (icon.position === 'right') {
      topBar.appendChild(iconElement);
      return;
    }
    if (icon.position === 'middle') {
      topBar.insertBefore(iconElement, searchInput);
      return;
    }
  });
}

// Init extension on load
(async function () {
  // Inject styles for sticky top bar
  const style = document.createElement('style');
  style.textContent = `
    #extensionTopBar {
      position: sticky;
      top: 0;
      z-index: 100; /* Ensure it's above the chat content */
      background-color: var(--main-bg-color); /* Match SillyTavern's background */
    }
  `;
  document.head.appendChild(style);

  addJQueryHighlight();
  addTopBar();
  addIcons();
  setChatName(getCurrentChatId());
  chatName.addEventListener('change', () => {
    const context = SillyTavern.getContext();
    if (context.groupId) {
      openGroupChat(context.groupId, chatName.value);
    } else {
      openCharacterChat(chatName.value);
    }
  });
  const setChatNameDebounced = debounce(() => setChatName(getCurrentChatId()), debounce_timeout.short);
  for (const eventName of [event_types.CHAT_CHANGED, event_types.CHAT_DELETED, event_types.GROUP_CHAT_DELETED]) {
    eventSource.on(eventName, setChatNameDebounced);
  }
})();
