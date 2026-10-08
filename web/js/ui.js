// ui.js: small messages (toasts) and an in-page "are you sure?" window, used instead of the
// browser's alert() and confirm(), which freeze the whole page until they're dismissed.

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

        const finish = (confirmed) => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('keyup', holdBack, true);
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            resolve(confirmed);
        };

        // These listen in the capture phase, ahead of everything else, and stop keys going any
        // further, so nothing behind the window (such as the timer's space bar or Esc) reacts
        // while it's open. Buttons still respond to Enter and Space, since that's built in.
        function holdBack(e) {
            e.stopPropagation();
        }

        function onKey(e) {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                (document.activeElement === confirmButton ? cancelButton : confirmButton).focus();
            }
        }

        overlay.addEventListener('click', (e) => {
            const choice = e.target.closest('[data-choice]');
            if (choice) finish(choice.dataset.choice === 'confirm');
            else if (e.target === overlay) finish(false);  // the dark area around the window
        });
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('keyup', holdBack, true);
        document.body.appendChild(overlay);
        confirmButton.focus();
    });
}
