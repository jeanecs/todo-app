// Modal HTML for delete confirmation (inserted once)

function ensureDeleteModal() {
  if ($('#deleteModal').length) return;
  const modal = $(`
    <div id="deleteModal" class="modal hidden">
      <div class="modal-content">
        <h3 class="title">Delete Task</h3>
        <div class="muted" style="margin-bottom:18px">Are you sure you want to delete this task?</div>
        <div class="row" style="margin-top:16px; gap:10px; justify-content:flex-end">
          <button id="deleteCancel" class="btn btn-ghost">Cancel</button>
          <button id="deleteConfirm" class="btn btn-danger">Delete</button>
        </div>
      </div>
    </div>
  `);
  $('body').append(modal);
  // Modal close logic
  $('#deleteCancel').on('click', hideDeleteModal);
  $('#deleteModal').on('click', function(e) {
    if (e.target === this) hideDeleteModal();
  });
}

function showDeleteModal(onConfirm) {
  ensureDeleteModal();
  $('#deleteModal').removeClass('hidden');
  // Remove previous handler
  $('#deleteConfirm').off('click');
  $('#deleteConfirm').on('click', function() {
    hideDeleteModal();
    onConfirm();
  });
}

function hideDeleteModal() {
  $('#deleteModal').addClass('hidden');
}
/******************** API CONFIG ************************/
const API_BASE = "https://todo-list.dcism.org";

const ENDPOINTS = {
  signup: `${API_BASE}/signup_action.php`,
  signin: `${API_BASE}/signin_action.php`,
  list: `${API_BASE}/getItems_action.php`,
  create: `${API_BASE}/addItem_action.php`,
  update: `${API_BASE}/editItem_action.php`,
  status: `${API_BASE}/statusItem_action.php`,
  remove: `${API_BASE}/deleteItem_action.php`
};

// ✅ HELPER to define the correct HTTP method for each endpoint
const ENDPOINT_METHODS = {
  signup: 'POST',
  signin: 'GET',
  list: 'GET',
  create: 'POST',
  update: 'POST', // <-- change from 'PUT' to 'POST'
  status: 'POST', // <-- change from 'PUT' to 'POST'
  remove: 'GET'
};

const FIELD = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  password: 'password',
  confirmPassword: 'confirm_password',
  id: 'item_id',
  title: 'item_name',
  description: 'item_description',
  isActive: 'status',
  createdAt: 'timemodified', // ✅ Corrected from 'createdAt' to match API response
};

/******************** UTILITIES ************************/
function showToast(msg) {
  const $t = $('#toast');
  $t.text(msg).fadeIn(150);
  setTimeout(() => $t.fadeOut(200), 1800);
}

function setLoading($btn, loading) {
  if (!$btn) return;
  if (loading) {
    $btn.data('orig', $btn.text()).prop('disabled', true).text('Please wait…');
  } else {
    $btn.prop('disabled', false).text($btn.data('orig'));
  }
}

function fmtDate(s) {
  try {
    return new Date(s).toLocaleString();
  } catch (e) {
    return s
  }
}

// ✅ REWRITTEN to handle different methods and data formats correctly
// ✅ REWRITTEN to handle different methods and the server's CORS rules
// ✅ FINAL VERSION to work around server misconfiguration
function apiCall(key, { query, body } = {}) {
    let url = ENDPOINTS[key];
    if (!url) throw new Error("Unknown endpoint: " + key);

    const method = ENDPOINT_METHODS[key] || 'GET';

    const ajaxOptions = {
        url,
        method,
        dataType: 'json',
    };

    // For GET or DELETE, data goes in the URL
    if ((method === 'GET' || method === 'DELETE') && query) {
        ajaxOptions.data = query;
    }
    
    // For POST or PUT, we send a RAW JSON string but lie about the content type
    // to bypass the server's broken CORS rules.
    if ((method === 'POST' || method === 'PUT') && body) {
        ajaxOptions.data = JSON.stringify(body); // Convert the object to a string
        ajaxOptions.contentType = 'text/plain';  // ✅ THE FIX: Label it as plain text
    }

    return $.ajax(ajaxOptions)
        .fail(function(xhr, textStatus, errorThrown) {
            // This detailed error logging is very helpful
            console.error("API Call Failed:", key);
            console.error("Status:", xhr.status, `(${textStatus})`);
            console.error("Error Thrown:", errorThrown);
            console.error("Response Text:", xhr.responseText);
        });
}

/******************** AUTH ************************/
// ✅ UPDATED to handle API response correctly
function onSignedIn(user) {
  // The API returns the user object directly, which has an 'id' property
  if (user && user.id) {
    localStorage.setItem('user_id', user.id);
    localStorage.setItem('who', user.email);
    $('#whoami').text(user.email);
    $('#authPanel').addClass('hidden');
    $('#appPanel').removeClass('hidden');
    $('#btnSignOut').removeClass('hidden');
    loadTasks();
  }
}

function signOut() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('who');
  $('#appPanel').addClass('hidden');
  $('#btnSignOut').addClass('hidden');
  $('#authPanel').removeClass('hidden');
  $('#whoami').text('');
  $('#list').empty(); // Clear the list on sign out
  ALL_TASKS = [];
}

/******************** TASKS ************************/
let CURRENT_FILTER = 'all';
let ALL_TASKS = [];

// Modal HTML (inserted once)
function ensureEditModal() {
  if ($('#editModal').length) return;
  const modal = $(`
    <div id="editModal" class="modal hidden">
      <div class="modal-content">
        <h3 class="title">Edit Task</h3>
        <div class="field"><label>Title</label><input id="editTitle" class="input" type="text"></div>
        <div class="field"><label>Description</label><input id="editDesc" class="input" type="text"></div>
        <div class="row" style="margin-top:16px; gap:10px; justify-content:flex-end">
          <button id="editCancel" class="btn btn-ghost">Cancel</button>
          <button id="editSave" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  `);
  $('body').append(modal);
  // Modal close logic
  $('#editCancel').on('click', hideEditModal);
  $('#editModal').on('click', function(e) {
    if (e.target === this) hideEditModal();
  });
}

function showEditModal(task, onSave) {
  console.log('showEditModal called', task);
  ensureEditModal();
  $('#editTitle').val(task[FIELD.title]);
  $('#editDesc').val(task[FIELD.description]);
  $('#editModal').removeClass('hidden');
  // Remove previous handler
  $('#editSave').off('click');
  $('#editSave').on('click', function() {
    const newTitle = $('#editTitle').val().trim();
    const newDesc = $('#editDesc').val().trim();
    if (!newTitle) return showToast('Title required');
    hideEditModal();
    onSave(newTitle, newDesc);
  });
}

function hideEditModal() {
  $('#editModal').addClass('hidden');
}

function render() {
  let items = [...ALL_TASKS];

  // Filter by status
  if (CURRENT_FILTER === 'active') {
    items = items.filter(t => t[FIELD.isActive] === 'active');
  }
  if (CURRENT_FILTER === 'inactive') {
    items = items.filter(t => t[FIELD.isActive] === 'inactive');
  }

  // Filter by search query
  const q = $('#search').val()?.toLowerCase()?.trim();
  if (q) {
    items = items.filter(t =>
      (t[FIELD.title] || '').toLowerCase().includes(q) ||
      (t[FIELD.description] || '').toLowerCase().includes(q)
    );
  }

  const $list = $('#list').empty();

  if (items.length === 0) {
    $('#empty').removeClass('hidden');
    $('#empty').text('No tasks found. Create one above ✨');
    return;
  }

  $('#empty').addClass('hidden');

  items.forEach(t => {
    const id = t[FIELD.id];
    const isActive = t[FIELD.isActive] === 'active';

    const $item = $(`
      <div class="task" data-id="${id}">
        <input type="checkbox" class="status-toggle" ${isActive ? 'checked' : ''} />
        <div class="grow">
          <div class="title">${escapeHtml(t[FIELD.title] || 'Untitled')}</div>
          <div class="meta">${escapeHtml(t[FIELD.description] || '')}
            ${t[FIELD.createdAt] ? ` • ${fmtDate(t[FIELD.createdAt])}` : ''}
          </div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-edit">Edit</button>
          <button class="btn btn-danger btn-del">Delete</button>
        </div>
      </div>`);

    // Status toggle: checked means active, unchecked means inactive
    $item.find('.status-toggle').on('change', async function() {
      try {
        await changeStatus(id, this.checked ? 'active' : 'inactive');
        showToast('Status updated');
        loadTasks();
      } catch {
        this.checked = !this.checked;
        showToast('Failed to update status');
      }
    });

    // Edit button (show modal)
    $item.find('.btn-edit').on('click', function() {
      showEditModal(t, async (newTitle, newDesc) => {
        await updateTask(id, { [FIELD.title]: newTitle, [FIELD.description]: newDesc });
        showToast("Task updated");
        loadTasks();
      });
    });

    // Delete button
    $item.find('.btn-del').on('click', function() {
      showDeleteModal(async () => {
        await deleteTask(id);
        showToast('Task deleted');
        loadTasks();
      });
    });

    $list.append($item);
  });
}


// ✅ REWRITTEN to load ALL tasks for better filtering
async function loadTasks() {
  $('#btnRefresh').prop('disabled', true);
  try {
    const userId = localStorage.getItem('user_id');
    if (!userId) return; // Don't load if not logged in

    // Fetch both active and inactive tasks to build the full list
    const activePromise = apiCall('list', { query: { status: 'active', user_id: userId } });
    const inactivePromise = apiCall('list', { query: { status: 'inactive', user_id: userId } });

    const [activeRes, inactiveRes] = await Promise.all([activePromise, inactivePromise]);

    const activeTasks = (activeRes && activeRes.data) ? Object.values(activeRes.data) : [];
    const inactiveTasks = (inactiveRes && inactiveRes.data) ? Object.values(inactiveRes.data) : [];

    ALL_TASKS = [...activeTasks, ...inactiveTasks];
    render();

  } catch (err) {
    console.error("Load tasks failed", err);
    showToast('Failed to load tasks');
  } finally {
    $('#btnRefresh').prop('disabled', false);
  }
}

function addTask() {
  const title = $('#newTitle').val().trim();
  const description = $('#newDesc').val().trim();
  if (!title) return showToast('Enter a title');
  const $btn = $('#btnAdd');
  setLoading($btn, true);

  const userId = localStorage.getItem('user_id');

  apiCall('create', {
    body: {
      [FIELD.title]: title,
      [FIELD.description]: description,
      user_id: parseInt(userId) // API expects an integer
    }
  })
    .then(() => {
      $('#newTitle').val('');
      $('#newDesc').val('');
      loadTasks();
      showToast('Task added');
    })
    .catch(() => showToast('Failed to add task'))
    .always(() => setLoading($btn, false));
}

function updateTask(id, data) {
  // API needs item_name, item_description, and item_id
  return apiCall('update', {
    body: {
      [FIELD.id]: id,
      [FIELD.title]: data[FIELD.title],
      [FIELD.description]: data[FIELD.description]
    }
  });
}

function changeStatus(id, status) {
  return apiCall('status', {
    body: {
      [FIELD.id]: id,
      [FIELD.isActive]: status // 'active' or 'inactive'
    }
  });
}

// ✅ UPDATED to send data as a query parameter
function deleteTask(id) {
  return apiCall('remove', {
    query: {
      [FIELD.id]: id
    }
  });
}

/******************** DOM + EVENTS ************************/
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[m]));
}

$('.tab').on('click', function() {
  $('.tab').removeClass('active');
  $(this).addClass('active');
  const key = $(this).data('tab');
  $('.tabpane').addClass('hidden');
  $('#' + key).removeClass('hidden');
});

// ✅ REWRITTEN to use GET with query params
$('#btnSignIn').on('click', async function() {
  const email = $('#siEmail').val().trim();
  const password = $('#siPass').val().trim();
  if (!email || !password) return showToast('Enter email & password');

  const $btn = $(this);
  setLoading($btn, true);

  try {
    // ✅ SIMPLIFIED: Just send the data. apiCall knows it's a GET.
    const res = await apiCall('signin', {
      query: { [FIELD.email]: email, [FIELD.password]: password }
    });

    if (res.status === 200 && res.data) {
      onSignedIn(res.data);
      showToast('Signed in ✓');
    } else {
      showToast(res.message || 'Sign in failed');
    }
  } catch (err) {
    // The .fail() handler in apiCall will already log details.
    showToast('Sign in failed (server error)');
  } finally {
    setLoading($btn, false);
  }
});

$('#btnSignUp').on('click', async function() {
  const firstName = $('#suFirstName').val().trim();
  const lastName = $('#suLastName').val().trim();
  const email = $('#suEmail').val().trim();
  const password = $('#suPass').val().trim();
  const confirmPassword = $('#suConfirmPass').val().trim();

  if (!firstName || !lastName || !email || !password || !confirmPassword)
    return showToast('Fill all fields');
  if (password !== confirmPassword)
    return showToast('Passwords do not match');

  const $btn = $(this);
  setLoading($btn, true);

  try {
    // ✅ SIMPLIFIED: Just send the data. apiCall knows it's a POST.
    const res = await apiCall('signup', {
      body: {
        [FIELD.firstName]: firstName,
        [FIELD.lastName]: lastName,
        [FIELD.email]: email,
        [FIELD.password]: password,
        [FIELD.confirmPassword]: confirmPassword
      }
    });

    if (res.status === 200) {
      showToast('Account created — please sign in');
      $('#siEmail').val(email);
      $('.tab[data-tab="signin"]').click();
    } else {
      showToast(res.message || 'Sign up failed');
    }
  } catch (err) {
    // The .fail() handler in apiCall will already log details.
    showToast('Sign up failed (server error)');
  } finally {
    setLoading($btn, false);
  }
});

$('#btnSignOut').on('click', signOut);
$('#btnAdd').on('click', addTask);
$('#btnRefresh').on('click', loadTasks);
$('.pill').on('click', function() {
  $('.pill').removeClass('active');
  $(this).addClass('active');
  CURRENT_FILTER = $(this).data('filter');
  render();
});
$('#search').on('input', render);

// Auto-login
(function init() {
  const userId = localStorage.getItem('user_id');
  const who = localStorage.getItem('who');
  if (userId && who) {
    $('#whoami').text(who);
    $('#authPanel').addClass('hidden');
    $('#appPanel').removeClass('hidden');
    $('#btnSignOut').removeClass('hidden');
    loadTasks();
  }
})();