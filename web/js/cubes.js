// cubes.js: the Cubes tab (cube inventory)

// Column values for sorting the cubes table
const CUBE_SORT_GETTERS = {
    type: c => getEventName(c.cube_type),
    brand: c => c.brand,
    model: c => c.model,
    date: c => c.purchase_date,
    status: c => (c.is_active ? 0 : 1)  // active first
};

registerActions('click', {
    'show-add-cube': () => showAddCubeForm(),
    'hide-add-cube': () => hideAddCubeForm(),
    'edit-cube': button => showEditCubeForm(Number(button.dataset.cubeId)),
    'hide-edit-cube': () => hideEditCubeForm(),
    'deactivate-cube': button => deleteCube(Number(button.dataset.cubeId)),
    'reactivate-cube': button => reactivateCube(Number(button.dataset.cubeId))
});
registerActions('submit', {
    'add-cube': (form, event) => addCube(event),
    'update-cube': (form, event) => updateCube(event)
});

// Show the custom type field when "Other" is picked in the Add Cube form
document.getElementById('new-cube-type').addEventListener('change', function () {
    const isOther = this.value === 'other';
    document.getElementById('custom-type-group').style.display = isOther ? 'block' : 'none';
    document.getElementById('new-cube-custom-type').required = isOther;
});

async function loadCubesTab() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        const cubes = await response.json();

        if (cubes.error) {
            console.error('Error loading cubes:', cubes.error);
            return;
        }

        AppState.allCubes = cubes;
        renderCubesTable();
    } catch (error) {
        console.error('Failed to load cubes:', error);
    }
}

// Draw the cubes table in its current sort order
function renderCubesTable() {
    const tbody = document.getElementById('cubes-tbody');

    if (AppState.allCubes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No cubes in your inventory yet.</td></tr>';
        return;
    }

    tbody.innerHTML = sortRows('cubes-table', AppState.allCubes, CUBE_SORT_GETTERS).map(cube => `
        <tr>
            <td><strong>${escapeHtml(getEventName(cube.cube_type) || '-')}</strong></td>
            <td>${escapeHtml(cube.brand || '-')}</td>
            <td>${escapeHtml(cube.model || '-')}</td>
            <td>${escapeHtml(cube.purchase_date || '-')}</td>
            <td><span class="status ${cube.is_active ? 'active' : 'inactive'}">${cube.is_active ? 'Active' : 'Inactive'}</span></td>
            <td class="actions-col">
                <button class="action-btn" data-action="edit-cube" data-cube-id="${cube.id}">Edit</button>
                ${cube.is_active ?
                    `<button class="action-btn danger" data-action="deactivate-cube" data-cube-id="${cube.id}">Deactivate</button>` :
                    `<button class="action-btn" data-action="reactivate-cube" data-cube-id="${cube.id}">Reactivate</button>`
                }
            </td>
        </tr>
    `).join('');
}

initSortableTable('cubes-table', 'type', 'asc', renderCubesTable);

function showAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'block';
    const editForm = document.getElementById('edit-cube-form');
    if (editForm) editForm.style.display = 'none';
}

function hideAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'none';
}

async function addCube(event) {
    event.preventDefault();
    
    let cubeType = document.getElementById('new-cube-type').value;
    
    // If "Other" is selected, use custom type
    if (cubeType === 'other') {
        cubeType = document.getElementById('new-cube-custom-type').value;
    }
    
    const brand = document.getElementById('new-cube-brand').value;
    const model = document.getElementById('new-cube-model').value;
    const purchaseDate = document.getElementById('new-cube-date').value;
    const notes = document.getElementById('new-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cube_type: cubeType,
                brand: brand,
                model: model,
                purchase_date: purchaseDate,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube added successfully');
            hideAddCubeForm();
            loadCubesTab();
            // Clear form
            document.getElementById('new-cube-type').value = '';
            document.getElementById('new-cube-custom-type').value = '';
            document.getElementById('custom-type-group').style.display = 'none';
            document.getElementById('new-cube-brand').value = '';
            document.getElementById('new-cube-model').value = '';
            document.getElementById('new-cube-date').value = '';
            document.getElementById('new-cube-notes').value = '';
        }
    } catch (error) {
        showError(error.message);
    }
}

function showEditCubeForm(cubeId) {
    const cube = AppState.allCubes.find(c => c.id === cubeId);
    if (!cube) return;
    
    let editForm = document.getElementById('edit-cube-form');
    if (!editForm) {
        const cubeSection = document.querySelector('#tab-cubes .cubes-section');
        const addForm = document.getElementById('add-cube-form');
        
        const editFormHTML = `
            <div id="edit-cube-form" class="form-card" style="display: none;">
                <h3>Edit Cube</h3>
                <form data-submit="update-cube">
                    <input type="hidden" id="edit-cube-id">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-cube-type">Type <span class="required">*</span></label>
                            <select id="edit-cube-type" required>
                                <option value="">Select a type</option>
                                <option value="222">2x2x2</option>
                                <option value="333">3x3x3</option>
                                <option value="444">4x4x4</option>
                                <option value="555">5x5x5</option>
                                <option value="666">6x6x6</option>
                                <option value="777">7x7x7</option>
                                <option value="333oh">3x3x3 One-Handed</option>
                                <option value="333bf">3x3x3 Blindfolded</option>
                                <option value="clock">Clock</option>
                                <option value="minx">Megaminx</option>
                                <option value="pyram">Pyraminx</option>
                                <option value="skewb">Skewb</option>
                                <option value="sq1">Square-1</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-group" id="edit-custom-type-group" style="display: none;">
                            <label for="edit-cube-custom-type">Custom Type</label>
                            <input type="text" id="edit-cube-custom-type" placeholder="Enter a custom type">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-cube-brand">Brand</label>
                            <input type="text" id="edit-cube-brand" placeholder="e.g. GAN, MoYu">
                        </div>
                        <div class="form-group">
                            <label for="edit-cube-model">Model</label>
                            <input type="text" id="edit-cube-model" placeholder="e.g. 14 MagLev">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="edit-cube-date">Purchase Date or Started Using</label>
                        <input type="date" id="edit-cube-date">
                    </div>
                    <div class="form-group">
                        <label for="edit-cube-notes">Notes</label>
                        <textarea id="edit-cube-notes" rows="3" placeholder="Anything else worth remembering"></textarea>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Save Changes</button>
                        <button type="button" class="btn-secondary" data-action="hide-edit-cube">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        addForm.insertAdjacentHTML('afterend', editFormHTML);
        editForm = document.getElementById('edit-cube-form');
        
        // Add event listener for custom type toggle
        document.getElementById('edit-cube-type').addEventListener('change', function() {
            const customTypeGroup = document.getElementById('edit-custom-type-group');
            if (this.value === 'other') {
                customTypeGroup.style.display = 'block';
                document.getElementById('edit-cube-custom-type').required = true;
            } else {
                customTypeGroup.style.display = 'none';
                document.getElementById('edit-cube-custom-type').required = false;
            }
        });
    }
    
    // Populate form with cube data
    document.getElementById('edit-cube-id').value = cube.id;
    
    // Show the cube type in the dropdown, or under "Other" if it's a custom type
    const standardTypes = ['222', '333', '444', '555', '666', '777', '333oh', '333bf', 'clock', 'minx', 'pyram', 'skewb', 'sq1'];
    const typeSelect = document.getElementById('edit-cube-type');
    
    if (cube.cube_type && standardTypes.includes(cube.cube_type)) {
        typeSelect.value = cube.cube_type;
        document.getElementById('edit-custom-type-group').style.display = 'none';
    } else if (cube.cube_type) {
        typeSelect.value = 'other';
        document.getElementById('edit-custom-type-group').style.display = 'block';
        document.getElementById('edit-cube-custom-type').value = cube.cube_type;
    } else {
        typeSelect.value = '';
    }
    
    document.getElementById('edit-cube-brand').value = cube.brand || '';
    document.getElementById('edit-cube-model').value = cube.model || '';
    document.getElementById('edit-cube-date').value = cube.purchase_date || '';
    document.getElementById('edit-cube-notes').value = cube.notes || '';
    
    // Hide add form and show edit form
    document.getElementById('add-cube-form').style.display = 'none';
    editForm.style.display = 'block';
}

function hideEditCubeForm() {
    document.getElementById('edit-cube-form').style.display = 'none';
}

async function updateCube(event) {
    event.preventDefault();
    
    const cubeId = document.getElementById('edit-cube-id').value;
    let cubeType = document.getElementById('edit-cube-type').value;
    
    // If "Other" is selected, use custom type
    if (cubeType === 'other') {
        cubeType = document.getElementById('edit-cube-custom-type').value;
    }
    
    const brand = document.getElementById('edit-cube-brand').value;
    const model = document.getElementById('edit-cube-model').value;
    const purchaseDate = document.getElementById('edit-cube-date').value;
    const notes = document.getElementById('edit-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cube_type: cubeType,
                brand: brand,
                model: model,
                purchase_date: purchaseDate,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube updated successfully');
            hideEditCubeForm();
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function deleteCube(cubeId) {
    if (!confirm('Deactivate this cube? Past sessions will still reference it.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube deactivated successfully');
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function reactivateCube(cubeId) {
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: 1 })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Cube reactivated successfully');
            loadCubesTab();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function loadCubesForDropdown() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        const cubes = await response.json();
        
        const select = document.getElementById('new-cube-id');
        select.innerHTML = '<option value="">None</option>';
        
        cubes.forEach(cube => {
            if (cube.is_active) {
                const option = document.createElement('option');
                option.value = cube.id;
                // e.g. "GAN 14 MagLev (3x3x3)"
                const name = [cube.brand, cube.model].filter(Boolean).join(' ') || 'Unnamed cube';
                option.textContent = cube.cube_type ? `${name} (${getEventName(cube.cube_type)})` : name;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Failed to load cubes for dropdown:', error);
    }
}