// tables.js: sortable tables. Click a column heading (any <th data-sort="key">) to sort by it,
// and click it again to reverse the order. The current column shows a ▲ or ▼.

const tableSorts = {};  // table id -> { key, dir }

// Make a table's headings sortable. `onSort` is called whenever the order changes, and should
// redraw the table (using sortRows below, or by asking the server for a new order).
function initSortableTable(tableId, defaultKey, defaultDir, onSort) {
    tableSorts[tableId] = { key: defaultKey, dir: defaultDir };
    document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(th => {
        th.classList.add('sortable');
        th.tabIndex = 0;
        // Number columns are right-aligned, so their arrow goes first to keep the heading in line
        th.insertAdjacentHTML(th.classList.contains('num') ? 'afterbegin' : 'beforeend',
            '<span class="sort-arrow" aria-hidden="true"></span>');

        const sortByThisColumn = () => {
            const state = tableSorts[tableId];
            if (state.key === th.dataset.sort) {
                state.dir = state.dir === 'asc' ? 'desc' : 'asc';
            } else {
                // New columns start in their natural order: newest dates first, fastest times first
                state.key = th.dataset.sort;
                state.dir = th.dataset.defaultDir || 'asc';
            }
            updateSortArrows(tableId);
            onSort();
        };
        th.addEventListener('click', sortByThisColumn);
        th.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sortByThisColumn();
        });
    });
    updateSortArrows(tableId);
}

function updateSortArrows(tableId) {
    const { key, dir } = tableSorts[tableId];
    document.querySelectorAll(`#${tableId} th[data-sort]`).forEach(th => {
        const active = th.dataset.sort === key;
        th.classList.toggle('sorted', active);
        th.setAttribute('aria-sort', active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
        th.querySelector('.sort-arrow').textContent = active ? (dir === 'asc' ? '▲' : '▼') : '';
    });
}

// A sorted copy of `rows` in the table's current order. `getters` maps each column key to a
// function giving the value to sort by. Empty values (no time yet, no date) always go last.
function sortRows(tableId, rows, getters) {
    const { key, dir } = tableSorts[tableId];
    const getValue = getters[key];
    const factor = dir === 'asc' ? 1 : -1;
    const isEmpty = value => value === null || value === undefined || value === '';

    return [...rows].sort((a, b) => {
        const valueA = getValue(a);
        const valueB = getValue(b);
        if (isEmpty(valueA) || isEmpty(valueB)) {
            return isEmpty(valueA) - isEmpty(valueB);
        }
        if (typeof valueA === 'string' || typeof valueB === 'string') {
            return factor * String(valueA).localeCompare(String(valueB), undefined, { numeric: true, sensitivity: 'base' });
        }
        return factor * (valueA - valueB);
    });
}
