/******************** API CONFIG ************************/
const API_BASE = "https://todo-list.dcism.org";

const ENDPOINTS = {
  signup: `${API_BASE}/signup_action.php`,   // POST (form)
  signin: `${API_BASE}/signin_action.php`,   // POST (form)
  list: `${API_BASE}/getItems_action.php`,   // GET
  create: `${API_BASE}/addItem_action.php`,  // POST
  update: `${API_BASE}/editItem_action.php`, // POST/PUT
  status: `${API_BASE}/statusItem_action.php`, // POST/PUT
  remove: `${API_BASE}/deleteItem_action.php` // POST/DELETE
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
  createdAt: 'createdAt',
};

function authHeader(){
  return {}; // no Authorization header at all
}

/******************** UTILITIES ************************/
function showToast(msg){
  const $t = $('#toast');
  $t.text(msg).fadeIn(150);
  setTimeout(() => $t.fadeOut(200), 1800);
}
function setLoading($btn, loading){
  if(!$btn) return;
  if(loading){ $btn.data('orig',$btn.text()).prop('disabled',true).text('Please wait…'); }
  else { $btn.prop('disabled',false).text($btn.data('orig')); }
}
function fmtDate(s){ try { return new Date(s).toLocaleString(); } catch(e){ return s } }

function apiCall(key, {id, query, body}={}) {
  let url = ENDPOINTS[key];
  if (!url) throw new Error("Unknown endpoint: " + key);

  if (query) {
    const qs = new URLSearchParams(query).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  let method = "POST";
  let requestData = null;
  let headers = {}; // no custom headers

  if (body) {
    // Always send as form-urlencoded
    requestData = new URLSearchParams(body).toString();
  }

  return $.ajax({
    url,
    method,
    data: requestData,
    headers, // empty
    contentType: "application/x-www-form-urlencoded",
    dataType: 'json', // Force JSON parsing
  }).fail(function(xhr, status, error) {
    // If JSON parsing fails, try to parse manually
    if (xhr.responseText) {
      try {
        const parsed = JSON.parse(xhr.responseText);
        return $.Deferred().resolve(parsed);
      } catch (e) {
        console.error('Failed to parse API response:', xhr.responseText);
      }
    }
  });
}


/******************** AUTH ************************/
function onSignedIn(user, token){
  if(token) localStorage.setItem('token', token);
  if(user?.[FIELD.email]) localStorage.setItem('who', user[FIELD.email]);
  if(user?.id || user?.[FIELD.id] || user?.user_id){
    localStorage.setItem('user_id', user.id || user[FIELD.id] || user.user_id);
  }
  $('#whoami').text(localStorage.getItem('who') || '');
  $('#authPanel').addClass('hidden');
  $('#appPanel').removeClass('hidden');
  $('#btnSignOut').removeClass('hidden');
  loadTasks();
}

function signOut(){
  localStorage.removeItem('token');
  localStorage.removeItem('who');
  $('#appPanel').addClass('hidden');
  $('#btnSignOut').addClass('hidden');
  $('#authPanel').removeClass('hidden');
  $('#whoami').text('');
}

/******************** TASKS ************************/
let CURRENT_FILTER = 'all';
let ALL_TASKS = [];

function render(){
  console.log('Rendering tasks, ALL_TASKS:', ALL_TASKS);
  console.log('Current filter:', CURRENT_FILTER);
  
  let items = [...ALL_TASKS]; // Make a copy

  // ✅ TEMPORARILY BYPASS FILTERS FOR DEBUGGING
  console.log('Items before filtering:', items);
  
  // ✅ Filter correctly using "active" / "inactive"
  if (CURRENT_FILTER === 'active') {
    items = items.filter(t => t[FIELD.isActive] === 'active');
    console.log('Items after active filter:', items);
  }
  if (CURRENT_FILTER === 'inactive') {
    items = items.filter(t => t[FIELD.isActive] === 'inactive');
    console.log('Items after inactive filter:', items);
  }

  // ✅ Search filter
  const q = $('#search').val()?.toLowerCase()?.trim();
  if (q) {
    items = items.filter(t =>
      (t[FIELD.title] || '').toLowerCase().includes(q) ||
      (t[FIELD.description] || '').toLowerCase().includes(q)
    );
  }

  console.log('Items after search:', items);

  const $list = $('#list').empty();
  
  // SHOW ALL TASKS FOR DEBUG - temporarily bypass the empty check
  if (ALL_TASKS.length === 0) {
    console.log('No tasks in ALL_TASKS, showing empty message');
    $('#empty').removeClass('hidden'); 
    return; 
  }
  
  if (items.length === 0) { 
    console.log('No items after filtering, but ALL_TASKS has', ALL_TASKS.length, 'tasks');
    console.log('Filter issue detected! Showing debug message...');
    $('#empty').removeClass('hidden');
    $('#empty').text(`Debug: ${ALL_TASKS.length} tasks loaded, but 0 match filter "${CURRENT_FILTER}"`);
    return; 
  }
  
  $('#empty').addClass('hidden');

  console.log('Rendering', items.length, 'items');

  items.forEach((t, index) => {
    const id = t[FIELD.id];
    const isActive = t[FIELD.isActive] === 'active';

    console.log(`Rendering task ${index}:`, { 
      id, 
      title: t[FIELD.title], 
      status: t[FIELD.isActive],
      fullTask: t 
    });

    const $item = $(`
      <div class="task" data-id="${id}" style="border: 1px solid #ccc; padding: 10px; margin: 5px;">
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

    // ✅ Status toggle
    $item.find('.status-toggle').on('change', async function(){
      try {
        await changeStatus(id, this.checked ? 'active' : 'inactive');
        showToast('Status updated');
        loadTasks();
      } catch {
        this.checked = !this.checked;
        showToast('Failed to update');
      }
    });

    // ✅ Edit button
    $item.find('.btn-edit').on('click', async function(){
      const newTitle = prompt("New title:", t[FIELD.title]);
      if (newTitle !== null) {
        await updateTask(id, { [FIELD.title]: newTitle, [FIELD.description]: t[FIELD.description] });
        showToast("Task updated");
        loadTasks();
      }
    });

    // ✅ Delete button
    $item.find('.btn-del').on('click', async function(){
      if (confirm('Delete this task?')) {
        await deleteTask(id);
        showToast('Task deleted');
        loadTasks();
      }
    });

    console.log('Appending item to list:', $item[0]);
    $list.append($item);
  });
  
  console.log('Final #list contents:', $('#list')[0]);
}


async function loadTasks(){
  $('#btnRefresh').prop('disabled', true);
  try {
    const userId = localStorage.getItem('user_id');
    console.log('Loading tasks for user_id:', userId);
    
    // Based on the API testing, load with status and user_id parameters
    const res = await apiCall('list', { query: { status: 'active', user_id: userId || 0 } }); 
    console.log("Tasks API response:", res);
    console.log("Response type:", typeof res);

    // Handle the response - it should now be parsed JSON
    if (res && res.data) {
      if (Array.isArray(res.data)) {
        ALL_TASKS = res.data;
      } else if (typeof res.data === 'object') {
        ALL_TASKS = Object.values(res.data);
      } else {
        ALL_TASKS = [];
      }
    } else if (Array.isArray(res)) {
      ALL_TASKS = res;
    } else {
      ALL_TASKS = [];
    }

    console.log("ALL_TASKS after processing:", ALL_TASKS);
    console.log("Number of tasks loaded:", ALL_TASKS.length);
    
    // Log first task structure if available
    if (ALL_TASKS.length > 0) {
      console.log("First task structure:", ALL_TASKS[0]);
      console.log("Task field mapping check:", {
        id: ALL_TASKS[0][FIELD.id],
        title: ALL_TASKS[0][FIELD.title], 
        description: ALL_TASKS[0][FIELD.description],
        status: ALL_TASKS[0][FIELD.isActive]
      });
    }
    
    render();
  } catch (err) {
    console.error("Load tasks failed", err);
    console.error("Error details:", err.responseText || err.message);
    showToast('Failed to load tasks');
  } finally {
    $('#btnRefresh').prop('disabled', false);
  }
}


function addTask(){
  const title = $('#newTitle').val().trim();
  const description = $('#newDesc').val().trim();
  if(!title) return showToast('Enter a title');
  const $btn = $('#btnAdd'); setLoading($btn,true);
  
  const userId = localStorage.getItem('user_id') || 0; // Use 0 as fallback
  console.log('Adding task with user_id:', userId);
  
  apiCall('create', { 
    body: { 
      [FIELD.title]: title, 
      [FIELD.description]: description,
      user_id: userId
    } 
  })
    .then((res) => { 
      console.log('Add task response:', res);
      $('#newTitle').val(''); 
      $('#newDesc').val(''); 
      loadTasks(); 
      showToast('Task added'); 
    })
    .catch((err) => {
      console.error('Add task error:', err);
      showToast('Failed to add');
    })
    .always(() => setLoading($btn,false));
}


function updateTask(id, partial){ 
  const userId = localStorage.getItem('user_id');
  return apiCall('update', { 
    body: { 
      [FIELD.id]: id,
      user_id: userId,
      ...partial 
    } 
  }); 
}

function changeStatus(id, status){ 
  const userId = localStorage.getItem('user_id');
  return apiCall('status', { 
    body: { 
      [FIELD.id]: id,
      [FIELD.isActive]: status, // "active" or "inactive"
      user_id: userId
    } 
  }); 
}

function deleteTask(id){ 
  const userId = localStorage.getItem('user_id');
  return apiCall('remove', { 
    body: { 
      [FIELD.id]: id,
      user_id: userId
    } 
  }); 
}

/******************** DOM + EVENTS ************************/
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

$('.tab').on('click', function(){
  $('.tab').removeClass('active'); $(this).addClass('active');
  const key = $(this).data('tab');
  $('.tabpane').addClass('hidden'); $('#'+key).removeClass('hidden');
});

$('#btnSignIn').on('click', async function(){
  const email = $('#siEmail').val().trim();
  const password = $('#siPass').val().trim();
  if(!email || !password) return showToast('Enter email & password');
  const $btn = $(this); setLoading($btn,true);
  try{
    const res = await apiCall('signin', { body: { [FIELD.email]: email, [FIELD.password]: password } });
    console.log('Signin response:', res);
    
    const token = res.token || res.data?.token || 'mock_' + Date.now();
    const user = res.user || res.data?.user || res.data || { [FIELD.email]: email };
    
    // Make sure we extract user_id from the response
    if (res.data?.user_id) {
      user.user_id = res.data.user_id;
    } else if (res.user_id) {
      user.user_id = res.user_id;
    } else if (res.id) {
      user.user_id = res.id;
    } else {
      // FALLBACK: Since API doesn't return user_id, use a simple approach
      // This is a temporary fix - in a real app, the API should return the user_id
      user.user_id = 0; // Based on the API response, it seems tasks are stored with user_id: 0
    }
    
    console.log('User object for signin:', user);
    onSignedIn(user, token);
    showToast('Signed in ✓');
  }catch(err){ 
    console.error('Signin error:', err); 
    showToast('Sign in failed'); 
  }
  finally{ setLoading($btn,false); }
});

$('#btnSignUp').on('click', async function(){
  const firstName = $('#suFirstName').val().trim();
  const lastName = $('#suLastName').val().trim();
  const email = $('#suEmail').val().trim();
  const password = $('#suPass').val().trim();
  const confirmPassword = $('#suConfirmPass').val().trim();
  if(!firstName || !lastName || !email || !password || !confirmPassword) return showToast('Fill all fields');
  if(password !== confirmPassword) return showToast('Passwords do not match');
  const $btn = $(this); setLoading($btn,true);
  try{
    const res = await apiCall('signup', { body: { 
      [FIELD.firstName]: firstName, [FIELD.lastName]: lastName,
      [FIELD.email]: email, [FIELD.password]: password, [FIELD.confirmPassword]: confirmPassword
    }});
    showToast('Account created — please sign in');
    $('#siEmail').val(email); $('.tab[data-tab="signin"]').click();
  }catch{ showToast('Sign up failed'); }
  finally{ setLoading($btn,false); }
});

$('#btnSignOut').on('click', signOut);
$('#btnAdd').on('click', addTask);
$('#btnRefresh').on('click', loadTasks);
$('.pill').on('click', function(){ $('.pill').removeClass('active'); $(this).addClass('active'); CURRENT_FILTER = $(this).data('filter'); render(); });
$('#search').on('input', render);

// Auto-login
(function init(){
  const token = localStorage.getItem('token');
  const who = localStorage.getItem('who');
  if(token){ $('#whoami').text(who||''); $('#authPanel').addClass('hidden'); $('#appPanel').removeClass('hidden'); $('#btnSignOut').removeClass('hidden'); loadTasks(); }
})();

// DEBUG FUNCTIONS - Add these temporarily
window.debugTasks = function() {
  console.log('=== TASK DEBUG INFO ===');
  console.log('ALL_TASKS:', ALL_TASKS);
  console.log('ALL_TASKS length:', ALL_TASKS.length);
  console.log('CURRENT_FILTER:', CURRENT_FILTER);
  console.log('user_id in localStorage:', localStorage.getItem('user_id'));
  console.log('token in localStorage:', localStorage.getItem('token'));
  console.log('#list element:', $('#list')[0]);
  console.log('#empty element visible:', !$('#empty').hasClass('hidden'));
  
  // Force render without filters
  console.log('Attempting to force render all tasks...');
  const $list = $('#list').empty();
  ALL_TASKS.forEach((task, index) => {
    console.log(`Task ${index}:`, task);
    const $testItem = $(`<div class="task">Task ${index}: ${task[FIELD.title] || 'No Title'}</div>`);
    $list.append($testItem);
  });
};

window.testAddTask = function() {
  console.log('=== TESTING ADD TASK ===');
  const userId = localStorage.getItem('user_id');
  console.log('Using user_id:', userId);
  
  const testData = {
    [FIELD.title]: 'Test Task ' + Date.now(),
    [FIELD.description]: 'Test Description',
    user_id: userId
  };
  
  console.log('Sending data:', testData);
  
  return apiCall('create', { body: testData })
    .then(res => {
      console.log('✅ Add task success:', res);
      return loadTasks();
    })
    .catch(err => {
      console.error('❌ Add task failed:', err);
    });
};

window.testLoadTasks = function() {
  console.log('=== TESTING LOAD TASKS ===');
  const userId = localStorage.getItem('user_id');
  console.log('Current user_id:', userId);
  
  // Test loading tasks with different queries
  console.log('Testing load with just user_id...');
  return apiCall('list', { query: { user_id: userId } })
    .then(res => {
      console.log('✅ Load tasks (user_id only):', res);
      return apiCall('list', { query: { status: 'active', user_id: userId } });
    })
    .then(res => {
      console.log('✅ Load tasks (active + user_id):', res);
      return apiCall('list', { query: {} }); // Try with no filters
    })
    .then(res => {
      console.log('✅ Load tasks (no filters):', res);
    })
    .catch(err => {
      console.error('❌ Load tasks failed:', err);
    });
};
