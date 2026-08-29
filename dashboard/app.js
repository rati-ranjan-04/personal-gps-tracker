const $ = (id) => document.getElementById(id);
const storedUrl = localStorage.getItem('gpsApiUrl') || '';
const storedToken = localStorage.getItem('gpsApiToken') || '';
let API = storedUrl.replace(/\/$/, '');
let TOKEN = storedToken;
const map = L.map('map').setView([20.2961, 85.8245], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
let marker = null;
let circle = null;
const line = L.polyline([], { color: '#2563eb', weight: 4 }).addTo(map);

const show = (id, value) => { $(id).textContent = value ?? '--'; };
function setState(text, active = false) {
  $('tracking').textContent = text;
  $('tracking').className = `badge ${active ? 'active' : ''}`;
}
function setSetupMessage(text, error = false) {
  $('setup-message').textContent = text;
  $('setup-message').className = `message ${error ? 'error' : ''}`;
}
function refreshSetup() {
  $('api-url').value = API;
  $('api-token').value = TOKEN;
  $('setup').classList.toggle('hidden', Boolean(API && TOKEN));
}
async function get(path, options = {}) {
  if (!API || !TOKEN) throw new Error('CONFIGURATION_REQUIRED');
  const response = await fetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}
async function refresh() {
  if (!API || !TOKEN) { setState('NOT CONFIGURED'); return; }
  try {
    const [status, history] = await Promise.all([get('/api/tracking/status'), get('/api/location/history?limit=100')]);
    setState(status.tracking_enabled ? 'TRACKING ACTIVE' : 'TRACKING OFF', status.tracking_enabled);
    show('accuracy', status.gps_accuracy == null ? '--' : `${status.gps_accuracy} m`);
    show('updated', status.last_update ? new Date(status.last_update).toLocaleString() : '--');
    show('battery', status.battery == null ? '--' : `${status.battery}%`);
    show('network', status.network_status);
    if (history.length) {
      const point = history[0];
      show('lat', Number(point.latitude).toFixed(6));
      show('lon', Number(point.longitude).toFixed(6));
      const position = [point.latitude, point.longitude];
      if (!marker) { marker = L.marker(position).addTo(map); map.setView(position, 15); } else marker.setLatLng(position);
      if (circle) circle.remove();
      circle = L.circle(position, { radius: point.accuracy || 0, color: '#2563eb', fillOpacity: 0.12 }).addTo(map);
      line.setLatLngs(history.slice().reverse().map((x) => [x.latitude, x.longitude]));
    }
    $('history').innerHTML = history.slice(0, 100).map((x) => `<tr><td>${new Date(x.timestamp).toLocaleString()}</td><td>${Number(x.latitude).toFixed(6)}</td><td>${Number(x.longitude).toFixed(6)}</td><td>${x.accuracy ?? '--'} m</td><td>${x.battery ?? '--'}%</td></tr>`).join('');
  } catch (error) {
    console.error(error);
    setState('API UNAVAILABLE');
    setSetupMessage('Backend URL or token is incorrect, or the backend is not running. Check /api/health and CORS settings.', true);
  }
}
async function toggle(path) {
  try { await get(path, { method: 'POST' }); await refresh(); }
  catch (error) { alert('Could not change tracking state. Check the backend URL, token, and CORS settings.'); }
}
$('setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  API = $('api-url').value.trim().replace(/\/$/, '');
  TOKEN = $('api-token').value.trim();
  localStorage.setItem('gpsApiUrl', API);
  localStorage.setItem('gpsApiToken', TOKEN);
  setSetupMessage('Connecting…');
  await refresh();
  if ($('tracking').textContent !== 'API UNAVAILABLE') { refreshSetup(); setSetupMessage('Connected successfully.'); }
});
$('start').onclick = () => toggle('/api/tracking/start');
$('stop').onclick = () => toggle('/api/tracking/stop');
$('refresh').onclick = refresh;
$('clear').onclick = async () => { if (confirm('Delete all stored location history? This cannot be undone.')) { try { await get('/api/location/history', { method: 'DELETE' }); await refresh(); } catch { alert('Could not clear history.'); } } };
refreshSetup();
refresh();
setInterval(refresh, 8000);
