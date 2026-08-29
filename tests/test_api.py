import os
os.environ.update(API_TOKEN="test-token", SECRET_KEY="test-secret", DATABASE_URL="sqlite:///./test_tracker.db")
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


def test_health():
    assert client.get('/api/health').json() == {'status': 'ok'}


def test_auth_required():
    assert client.get('/api/location/latest').status_code == 401


def test_invalid_latitude():
    body = {'device_id':'phone-1','latitude':91,'longitude':0,'timestamp':datetime.now(timezone.utc).isoformat()}
    assert client.post('/api/location', json=body, headers=AUTH).status_code == 422


def test_register_upload_and_history():
    assert client.post('/api/device/register', json={'device_id':'phone-1'}, headers=AUTH).status_code == 200
    assert client.post('/api/tracking/start', headers=AUTH).status_code == 200
    body = {'device_id':'phone-1','latitude':20.2961,'longitude':85.8245,'accuracy':8.5,'battery':78,'timestamp':datetime.now(timezone.utc).isoformat()}
    assert client.post('/api/location', json=body, headers=AUTH).status_code == 201
    assert len(client.get('/api/location/history?limit=5', headers=AUTH).json()) >= 1
    assert client.get('/api/location/latest', headers=AUTH).status_code == 200
    assert client.post('/api/tracking/stop', headers=AUTH).json()['tracking_enabled'] is False
