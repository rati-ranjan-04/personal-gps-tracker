let authenticated = false;
const map = L.map('map').setView([20.2961, 85.8245], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
let marker = null;
let circle = null;
const line = L.polyline([], { color: '#2563eb', weight: 4 }).addTo(map);

const $ = (id) => document.getElementById(id);
const show = (id, value) => { $(id).textContent = value ?? '--'; };
function setState(text, active = false) { $('tracking').textContent = text; $('tracking').className = `badge ${active ? 'active' : ''}`; }
function setSetupMessage(text, error = false) { $('setup-message').textContent = text; $('setup-message').className = `message ${error ? 'error' : ''}`; }
function setControls(enabled) { ['start', 'stop', 'refresh', 'clear', 'logout'].forEach((id) => { $(id).disabled = !enabled; }); }
function showLogin(message = '') { authenticated = false; setState('LOCKED'); $('setup').classList.remove('hidden'); setControls(false); if (message) setSetupMessage(message, true); }
function showDashboard() { authenticated = true; setState('CONNECTED'); $('setup').classList.add('hidden'); setControls(true); }

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!response.ok) { const error = new Error(`HTTP_${response.status}`); error.status = response.status; throw error; }
  return response.status === 204 ? null : response.json();
}
async function refresh() {
  if (!authenticated) return;
  try {
    const [status, history] = await Promise.all([request('/api/tracking/status'), request('/api/location/history?limit=100')]);
    setState(status.tracking_enabled ? 'TRACKING ACTIVE' : 'TRACKING OFF', status.tracking_enabled);
    show('accuracy', status.gps_accuracy == null ? '--' : `${status.gps_accuracy} m`);
    show('updated', status.last_update ? new Date(status.last_update).toLocaleString() : '--');
    show('battery', status.battery == null ? '--' : `${status.battery}%`);
    show('network', status.network_status);
    if (history.length) {
      const point = history[0];
      show('lat', Number(point.latitude).toFixed(6)); show('lon', Number(point.longitude).toFixed(6));
      const position = [point.latitude, point.longitude];
      if (!marker) { marker = L.marker(position).addTo(map); map.setView(position, 15); } else marker.setLatLng(position);
      if (circle) circle.remove();
      circle = L.circle(position, { radius: point.accuracy || 0, color: '#2563eb', fillOpacity: 0.12 }).addTo(map);
      line.setLatLngs(history.slice().reverse().map((x) => [x.latitude, x.longitude]));
    }
    $('history').innerHTML = history.slice(0, 100).map((x) => `<tr><td>${new Date(x.timestamp).toLocaleString()}</td><td>${Number(x.latitude).toFixed(6)}</td><td>${Number(x.longitude).toFixed(6)}</td><td>${x.accuracy ?? '--'} m</td><td>${x.battery ?? '--'}%</td></tr>`).join('');
  } catch (error) {
    console.error(error);
    if (error.status === 401) showLogin('Your dashboard session expired. Enter the token again.');
    else { setState('API UNAVAILABLE'); setSetupMessage('The backend is unavailable. Render may be sleeping or its deployment needs attention.', true); }
  }
}
async function toggle(path) {
  try { await request(path, { method: 'POST' }); await refresh(); }
  catch (error) { alert(error.status === 401 ? 'Your dashboard session expired. Connect again.' : 'Could not change tracking state. Check the backend deployment logs.'); }
}
$('setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = $('api-token').value.trim();
  if (!token) return;
  setSetupMessage('Connecting…');
  try {
    await request('/api/session', { method: 'POST', body: JSON.stringify({ token }) });
    $('api-token').value = '';
    showDashboard();
    setSetupMessage('Connected securely.');
    await refresh();
  } catch (error) { showLogin(error.status === 401 ? 'Invalid token. Use the API_TOKEN configured in Vercel and Render.' : 'Dashboard authentication is not configured.'); }
});
$('logout').onclick = async () => { try { await request('/api/session', { method: 'DELETE' }); } finally { showLogin('Dashboard locked.'); } };
$('start').onclick = () => toggle('/api/tracking/start');
$('stop').onclick = () => toggle('/api/tracking/stop');
$('refresh').onclick = refresh;
$('clear').onclick = async () => { if (confirm('Delete all stored location history? This cannot be undone.')) { try { await request('/api/location/history', { method: 'DELETE' }); await refresh(); } catch { alert('Could not clear history.'); } } };
setControls(false);
request('/api/session').then(() => { showDashboard(); return refresh(); }).catch(() => showLogin());
setInterval(refresh, 8000);
