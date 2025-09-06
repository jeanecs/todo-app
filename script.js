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
    contentType: "application/x-www-form-urlencoded", // ✅ this is allowed
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
  
  let items = ALL_TASKS;

  // ✅ Filter correctly using "active" / "inactive"
  if (CURRENT_FILTER === 'active') items = items.filter(t => t[FIELD.isActive] === 'active');
  if (CURRENT_FILTER === 'inactive') items = items.filter(t => t[FIELD.isActive] === 'inactive');

  console.log('Items after filter:', items);

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
  if (items.length === 0) { 
    console.log('No items to display, showing empty message');
    $('#empty').removeClass('hidden'); 
    return; 
  }
  $('#empty').addClass('hidden');

  console.log('Rendering', items.length, 'items');

  items.forEach(t => {
    const id = t[FIELD.id];
    const isActive = t[FIELD.isActive] === 'active'; // ✅ fix here

    console.log('Rendering task:', { id, title: t[FIELD.title], status: t[FIELD.isActive] });

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

    // ✅ Status toggle
    $item.find('.status-toggle').on('change', async function(){
      try {
        await changeStatus(id, this.checked ? 'active' : 'inactive'); // ✅ API expects active/inactive
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

    $list.append($item);
  });
}


async function loadTasks(){
  $('#btnRefresh').prop('disabled', true);
  try {
    const userId = localStorage.getItem('user_id');
    const res = await apiCall('list', { query: { status: 'active', user_id: userId } }); 
    console.log("Tasks API response:", res);

    if (res.data) {
      ALL_TASKS = Object.values(res.data); // convert object → array
    } else if (Array.isArray(res)) {
      ALL_TASKS = res; // if response is directly an array
    } else {
      ALL_TASKS = [];
    }

    console.log("ALL_TASKS after loading:", ALL_TASKS);
    render();
  } catch (err) {
    console.error("Load tasks failed", err);
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
  
  const userId = localStorage.getItem('user_id');
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
