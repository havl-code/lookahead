// ui.js: small messages (toasts), an in-page "are you sure?" window, and a window that asks for
// a note, used instead of the browser's alert(), confirm(), and prompt(), which freeze the whole
// page until they're dismissed.

// ---- Toasts ----
// A toast appears in the bottom corner and fades away by itself, so the page keeps working.
// Errors stay up longer and are announced to screen readers straight away (role="alert");
// other toasts are announced politely (role="status"). A toast can offer one action, such as
// Retry or Undo. Returns { dismiss } so the caller can take it down early.
function showToast(message, { type = 'info', actionLabel = null, onAction = null, duration = null } = {}) {
    let region = document.getElementById('toast-region');
    if (!region) {
        region = document.createElement('div');
        region.id = 'toast-region';
        region.className = 'toast-region';
        document.body.appendChild(region);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.appendChild(text);

    let timer = null;
    const dismiss = () => {
        clearTimeout(timer);
        toast.remove();
    };

    if (actionLabel && onAction) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'toast-action';
        action.textContent = actionLabel;
        action.addEventListener('click', () => {
            dismiss();
            onAction();
        });
        toast.appendChild(action);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', dismiss);
    toast.appendChild(close);

    region.appendChild(toast);
    timer = setTimeout(dismiss, duration ?? (type === 'error' ? 8000 : 4000));
    return { dismiss };
}

// ---- Windows ----
// While one of these windows is open, keys are caught in the capture phase, ahead of everything
// else, and stopped there, so nothing behind it (such as the timer's space bar, Esc, or its
// shortcuts) reacts. Typing, and the buttons' own Enter and Space, still work, since those are
// built in. Esc runs `onEscape`, `onEnter` can take Enter over (by returning true), and Tab
// moves between the window's own controls only. Returns a function that lets the keys go again.
function holdKeys(overlay, { onEscape, onEnter = () => false }) {
    function holdBack(e) {
        e.stopPropagation();
    }

    function onKey(e) {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
        } else if (e.key === 'Enter' && onEnter(e)) {
            e.preventDefault();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const stops = [...overlay.querySelectorAll('button, textarea')];
            const at = stops.indexOf(document.activeElement);
            stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
    }

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', holdBack, true);
    return () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('keyup', holdBack, true);
    };
}

// Whether one of these windows is open (the timer leaves its keys alone while one is)
function isDialogOpen() {
    return document.querySelector('.confirm-dialog, .prompt-dialog') !== null;
}

// ---- Confirm ----
// An in-page "are you sure?" for actions that can't be undone. Resolves to true if confirmed.
// Esc or Cancel resolves to false, Enter confirms (the confirm button starts focused, as in the
// browser's own confirm()), Tab stays inside the window, and focus goes back to where it was.
function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true } = {}) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'modal confirm-dialog';
        overlay.innerHTML = `
            <div class="modal-content modal-small" role="alertdialog" aria-modal="true"
                 aria-labelledby="confirm-title" aria-describedby="confirm-message">
                <div class="modal-header"><h3 id="confirm-title"></h3></div>
                <div class="modal-body">
                    <p class="confirm-message" id="confirm-message"></p>
                    <div class="form-actions align-end">
                        <button type="button" class="btn-secondary" data-choice="cancel"></button>
                        <button type="button" class="btn-primary${danger ? ' danger' : ''}" data-choice="confirm"></button>
                    </div>
                </div>
            </div>
        `;
        overlay.querySelector('#confirm-title').textContent = title;
        overlay.querySelector('#confirm-message').textContent = message;
        const cancelButton = overlay.querySelector('[data-choice="cancel"]');
        const confirmButton = overlay.querySelector('[data-choice="confirm"]');
        cancelButton.textContent = cancelLabel;
        confirmButton.textContent = confirmLabel;

        const letKeysGo = holdKeys(overlay, { onEscape: () => finish(false) });
        const finish = (confirmed) => {
            letKeysGo();
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            resolve(confirmed);
        };

        overlay.addEventListener('click', (e) => {
            const choice = e.target.closest('[data-choice]');
            if (choice) finish(choice.dataset.choice === 'confirm');
            else if (e.target === overlay) finish(false);  // the dark area around the window
        });
        document.body.appendChild(overlay);
        confirmButton.focus();
    });
}

// ---- Ask for a note ----
// An in-page window with one text box, such as for a solve's note. Resolves to the text, or
// null if cancelled. Enter saves (Shift+Enter starts a new line), Esc or Cancel cancels, Tab
// stays inside the window, and focus goes back to where it was.
function promptDialog(label, { title = 'Note', value = '', confirmLabel = 'Save', cancelLabel = 'Cancel', maxLength = 1000 } = {}) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'modal prompt-dialog';
        overlay.innerHTML = `
            <div class="modal-content modal-small" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
                <div class="modal-header"><h3 id="prompt-title"></h3></div>
                <div class="modal-body">
                    <label class="confirm-message" for="prompt-field" id="prompt-label"></label>
                    <textarea id="prompt-field" rows="3"></textarea>
                    <div class="form-actions align-end">
                        <button type="button" class="btn-secondary" data-choice="cancel"></button>
                        <button type="button" class="btn-primary" data-choice="confirm"></button>
                    </div>
                </div>
            </div>
        `;
        overlay.querySelector('#prompt-title').textContent = title;
        overlay.querySelector('#prompt-label').textContent = label;
        const field = overlay.querySelector('#prompt-field');
        field.value = value;
        field.maxLength = maxLength;
        overlay.querySelector('[data-choice="cancel"]').textContent = cancelLabel;
        overlay.querySelector('[data-choice="confirm"]').textContent = confirmLabel;

        const letKeysGo = holdKeys(overlay, {
            onEscape: () => finish(null),
            onEnter: (e) => {
                if (e.target !== field || e.shiftKey || e.isComposing) return false;
                finish(field.value);
                return true;
            }
        });
        const finish = (text) => {
            letKeysGo();
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            resolve(text);
        };

        overlay.addEventListener('click', (e) => {
            const choice = e.target.closest('[data-choice]');
            if (choice) finish(choice.dataset.choice === 'confirm' ? field.value : null);
            else if (e.target === overlay) finish(null);  // the dark area around the window
        });
        document.body.appendChild(overlay);
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
    });
}
