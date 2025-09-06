
/******************** API CONFIG — EDIT THESE TO MATCH YOUR PDF ************************/
const API_BASE = "https://todo-list.dcism.org"; // TODO: replace with your real base URL

// Map the expected routes from your instructor's API. Adjust paths & methods as needed.
const ENDPOINTS = {
  signup: `${API_BASE}/signup_action.php`,         // POST
  signin: `${API_BASE}/signin_action.php`,         // GET (query params)
  getItems: `${API_BASE}/getItems_action.php`,     // GET (query params: status, user_id)
  addItem: `${API_BASE}/addItem_action.php`,       // POST
  editItem: `${API_BASE}/editItem_action.php`,     // PUT
  statusItem: `${API_BASE}/statusItem_action.php`, // PUT
  deleteItem: `${API_BASE}/deleteItem_action.php`  // DELETE (query param: item_id)
};


// If the API expects different field names, map them here:
const FIELD = {
  // auth
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  password: 'password',
  confirmPassword: 'confirm_password',
  // todo
  id: 'id',
  title: 'title',
  description: 'description',
  isActive: 'isActive', // boolean status; rename if API uses e.g. `status` or `completed`
  createdAt: 'createdAt',
};

// Token header formatter — change if API uses a different scheme (e.g., X-Auth-Token)
function authHeader(){
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {}; 
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

function apiCall(key, {id, query, body}={}){
  let url = ENDPOINTS[key];
  if (!url) throw new Error("Unknown endpoint: " + key);

  // attach query params if needed
  if (query) {
    const qs = new URLSearchParams(query).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  // Don't send auth headers for signup/signin since user doesn't have token yet
  const headers = (key === 'signup' || key === 'signin') ? {} : authHeader();
  
  // For signup and signin, use form data format as the API expects this
  let requestData = null;
  let contentType = "application/json";
  
  if (body) {
    if (key === 'signup' || key === 'signin') {
      // Send form data directly (jQuery will handle encoding)
      requestData = body;
      contentType = "application/x-www-form-urlencoded";
    } else {
      requestData = JSON.stringify(body);
    }
  }
  
  return $.ajax({
    url,
    method: (key === 'signup' || key === 'signin') ? "POST" : "POST", // Try POST for both
    data: requestData,
    contentType: contentType,
    headers: headers,
  });
}

/******************** AUTH ************************/
function onSignedIn(user, token){
  if(token) localStorage.setItem('token', token);
  if(user?.[FIELD.email]) localStorage.setItem('who', user[FIELD.email]);
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
  let items = ALL_TASKS;
  if(CURRENT_FILTER==='active') items = items.filter(t => !!t[FIELD.isActive]);
  if(CURRENT_FILTER==='inactive') items = items.filter(t => !t[FIELD.isActive]);
  const q = $('#search').val()?.toLowerCase()?.trim();
  if(q){ items = items.filter(t => (t[FIELD.title]||'').toLowerCase().includes(q) || (t[FIELD.description]||'').toLowerCase().includes(q)); }

  const $list = $('#list').empty();
  if(items.length===0){ $('#empty').removeClass('hidden'); return; }
  $('#empty').addClass('hidden');

  items.forEach(t => {
    const id = t[FIELD.id];
    const isActive = !!t[FIELD.isActive];
    const $item = $(
      `<div class="task" data-id="${id}">
        <input type="checkbox" class="status-toggle" ${isActive? 'checked':''} title="Toggle Active/Inactive" />
        <div class="grow">
          <div class="title">${escapeHtml(t[FIELD.title]||'Untitled')}</div>
          <div class="meta">${escapeHtml(t[FIELD.description]||'')}
            ${t[FIELD.createdAt] ? ` • ${fmtDate(t[FIELD.createdAt])}`:''}
          </div>
          <div class="inline-edit">
            <input class="input edit-title" placeholder="Title" value="${escapeAttr(t[FIELD.title]||'')}">
            <input class="input edit-desc" placeholder="Description" value="${escapeAttr(t[FIELD.description]||'')}">
            <button class="btn btn-primary btn-save">Save</button>
            <button class="btn btn-ghost btn-cancel">Cancel</button>
          </div>
        </div>
        <div class="row" style="gap:8px">
          <button class="pill ${isActive?'active':''}" disabled>${isActive?'Active':'Inactive'}</button>
          <button class="btn btn-ghost btn-edit">Edit</button>
          <button class="btn btn-danger btn-del">Delete</button>
        </div>
      </div>`);

    // Toggle status
    $item.find('.status-toggle').on('change', async function(){
      try{
        await changeStatus(id, this.checked);
        showToast('Status updated');
        await loadTasks();
      }catch(err){
        this.checked = !this.checked; // revert
        showToast('Failed to update status');
        console.error(err);
      }
    });

    // Edit flow
    $item.find('.btn-edit').on('click', function(){ $item.addClass('editing'); });
    $item.find('.btn-cancel').on('click', function(){ $item.removeClass('editing'); });
    $item.find('.btn-save').on('click', async function(){
      const $btn = $(this); setLoading($btn, true);
      try{
        const newTitle = $item.find('.edit-title').val().trim();
        const newDesc = $item.find('.edit-desc').val().trim();
        await updateTask(id, { [FIELD.title]: newTitle, [FIELD.description]: newDesc });
        $item.removeClass('editing');
        showToast('Task updated');
        await loadTasks();
      }catch(err){ console.error(err); showToast('Failed to update'); }
      finally{ setLoading($btn,false); }
    });

    // Delete
    $item.find('.btn-del').on('click', async function(){
      if(!confirm('Delete this task?')) return;
      const $btn = $(this); setLoading($btn,true);
      try{ await deleteTask(id); showToast('Task deleted'); await loadTasks(); }
      catch(err){ console.error(err); showToast('Failed to delete'); }
      finally{ setLoading($btn,false); }
    });

    $list.append($item);
  });
}

async function loadTasks(){
  $('#btnRefresh').prop('disabled', true);
  try{
    // Some APIs support query like ?status=active|inactive — you can switch to that if needed
    const res = await apiCall('list');
    // Support both array response or {data:[...]}
    ALL_TASKS = Array.isArray(res) ? res : (res.data || []);
    render();
  }catch(err){ console.error(err); showToast('Failed to load tasks'); }
  finally{ $('#btnRefresh').prop('disabled', false); }
}

function addTask(){
  const title = $('#newTitle').val().trim();
  const description = $('#newDesc').val().trim();
  if(!title){ showToast('Please enter a title'); return; }
  const $btn = $('#btnAdd'); setLoading($btn,true);
  apiCall('create', { body: { [FIELD.title]: title, [FIELD.description]: description } })
    .then(() => {
      $('#newTitle').val(''); $('#newDesc').val('');
      showToast('Task added');
      loadTasks();
    })
    .catch(err => { console.error(err); showToast('Failed to add task'); })
    .always(() => setLoading($btn,false));
    $.ajax({
        url: ENDPOINTS.addItem,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            item_name,
            item_description,
            user_id: localStorage.getItem("user_id")
        }),
        success: (res) => loadTasks("active")
        });
}

function updateTask(id, partial){
  // Some APIs use PATCH, others PUT. Change ENDPOINTS.update.method if needed.
  $.ajaxSetup({
    url: ENDPOINTS.editItem,
    method: "PUT",
    contentType: "application/json",
    data: JSON.stringify({
        item_id,
        item_name,
        item_description
    }),
    success: (res) => loadTasks("active")
  });
  return apiCall('update', { id, body: partial });
}

function changeStatus(id, isActive){
  // If your API expects {status:"active"|"inactive"} or {completed:true|false}, adjust here
  $.ajax({
    url: ENDPOINTS.statusItem,
    method: "PUT",
    contentType: "application/json",
    data: JSON.stringify({
        item_id,
        status // "active" or "inactive"
    }),
    success: (res) => loadTasks(status)
    });

  const bodyA = {}; bodyA[FIELD.isActive] = !!isActive;
  return apiCall('status', { id, body: bodyA }).catch(() => apiCall('update', { id, body: bodyA }));
}

function deleteTask(id){ 
    $.ajax({
    url: ENDPOINTS.deleteItem,
    method: "DELETE",
    data: { item_id },
    success: (res) => loadTasks("active")
    });
    return apiCall('remove', { id }); 
}

/******************** DOM + EVENTS ************************/
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

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
    console.log('Signin response:', res); // Debug logging
    
    // Check multiple possible token field names
    const token = res.token || res.data?.token || res.access_token || res.auth_token || res.jwt || res.user_token;
    const user = res.user || res.data?.user || { [FIELD.email]: email };
    
    if(token) {
      onSignedIn(user, token);
      showToast('Signed in ✓');
    } else {
      // Some APIs don't use tokens, just check if signin was successful
      if(res.status === 200 || res.success === true || res.message === "Login successful") {
        // Mock a simple token for session management
        const mockToken = 'mock_' + Date.now();
        onSignedIn(user, mockToken);
        showToast('Signed in ✓');
      } else {
        throw new Error('Signin failed: ' + (res.message || 'Unknown error'));
      }
    }
  }catch(err){ 
    console.error('Signin error:', err); 
    showToast('Sign in failed: ' + (err.message || 'Please check your credentials')); 
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
    const res = await apiCall('signup', { 
      body: { 
        [FIELD.firstName]: firstName, 
        [FIELD.lastName]: lastName,
        [FIELD.email]: email, 
        [FIELD.password]: password,
        [FIELD.confirmPassword]: confirmPassword
      } 
    });
    // After signup, some APIs auto-login and return token; if not, call signin
    const token = res.token || res.data?.token;
    if(token){ onSignedIn({ [FIELD.email]: email }, token); showToast('Account created ✓'); }
    else { $('#siEmail').val(email); $('.tab[data-tab="signin"]').click(); showToast('Account created — please sign in'); }
  }catch(err){ console.error(err); showToast('Sign up failed'); }
  finally{ setLoading($btn,false); }
});

$('#btnSignOut').on('click', signOut);
$('#btnAdd').on('click', addTask);
$('#btnRefresh').on('click', loadTasks);
$('.pill').on('click', function(){
  $('.pill').removeClass('active'); $(this).addClass('active');
  CURRENT_FILTER = $(this).data('filter');
  render();
});
$('#search').on('input', render);

// TEST FUNCTION - Add this temporarily to test API methods
function testSignupMethods() {
  // Test with the exact field names from your data sample
  const testData = {
    first_name: 'ChizB',
    last_name: 'Beloy',
    email: 'chizray@gmail.com',
    password: '123456',
    confirm_password: '123456'
  };

  console.log('Testing POST with correct field names...');
  $.ajax({
    url: 'https://todo-list.dcism.org/signup_action.php',
    method: 'POST',
    data: testData,  // Don't stringify for form data
    contentType: 'application/x-www-form-urlencoded',
  }).done(res => {
    console.log('Signup worked:', res);
  }).fail(err => {
    console.log('Signup failed:', err.responseText);
  });
}

// TEST SIGNIN FUNCTION
function testSigninMethods() {
  // Test both possible email formats
  const testEmails = [
    'jeane@eritch@gmail.com',  // Original format with typo (2 @ symbols)
    'jeane.eritch@gmail.com',  // Fixed format (1 @ symbol)
    'jeane@gmail.com'          // Simple format
  ];

  console.log('Testing all possible email formats...');
  
  testEmails.forEach((email, index) => {
    const testData = {
      email: email,
      password: '123'
    };

    console.log(`\nTest ${index + 1}: Testing with email: ${email}`);
    $.ajax({
      url: 'https://todo-list.dcism.org/signin_action.php',
      method: 'POST',
      data: testData,
      contentType: 'application/x-www-form-urlencoded',
    }).done(res => {
      console.log(`✅ SUCCESS with ${email}:`, res);
    }).fail(err => {
      console.log(`❌ FAILED with ${email}:`, err.responseText);
    });
  });
}

// Also test if the signin API returns tokens differently
function testSigninResponse() {
  const testData = {
    email: 'jeane@eritch@gmail.com', // Try the original format first
    password: '123'
  };

  console.log('Testing signin response format...');
  $.ajax({
    url: 'https://todo-list.dcism.org/signin_action.php',
    method: 'POST',
    data: testData,
    contentType: 'application/x-www-form-urlencoded',
  }).done(res => {
    console.log('Full response object:', res);
    console.log('Response type:', typeof res);
    console.log('Response keys:', Object.keys(res));
    
    // Check all possible token locations
    console.log('Checking token locations:');
    console.log('res.token:', res.token);
    console.log('res.data?.token:', res.data?.token);
    console.log('res.access_token:', res.access_token);
    console.log('res.auth_token:', res.auth_token);
    console.log('res.jwt:', res.jwt);
    console.log('res.user_token:', res.user_token);
  }).fail(err => {
    console.log('Signin failed:', err.responseText);
  });
}

// Call this in browser console: testSigninMethods()

// Auto-login if token exists
(function init(){
  const token = localStorage.getItem('token');
  const who = localStorage.getItem('who');
  if(token){ $('#whoami').text(who||''); $('#authPanel').addClass('hidden'); $('#appPanel').removeClass('hidden'); $('#btnSignOut').removeClass('hidden'); loadTasks(); }
})();

