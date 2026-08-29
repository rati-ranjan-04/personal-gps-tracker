import logging
import os
from functools import wraps

import httpx
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("gps-bot")
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
API_URL = os.environ["BACKEND_URL"].rstrip("/")
API_TOKEN = os.environ["API_TOKEN"]
AUTHORIZED_ID = int(os.environ["AUTHORIZED_TELEGRAM_USER_ID"])


def authorized(fn):
    @wraps(fn)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id if update.effective_user else None
        if user_id != AUTHORIZED_ID:
            log.warning("unauthorized Telegram attempt user_id=%s command=%s", user_id, update.effective_message.text.split()[0] if update.effective_message and update.effective_message.text else "unknown")
            await update.effective_message.reply_text("Unauthorized user.")
            return
        return await fn(update, context)
    return wrapper


async def api(method: str, path: str):
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.request(method, f"{API_URL}{path}", headers={"Authorization": f"Bearer {API_TOKEN}"})
        response.raise_for_status()
        return response.json()


@authorized
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Personal GPS Tracker\n\n/location\n/status\n/track_on\n/track_off\n/history\n/help")


@authorized
async def location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        data = await api("GET", "/api/location/latest")
        lat, lon = data["latitude"], data["longitude"]
        await update.message.reply_location(latitude=lat, longitude=lon)
        await update.message.reply_text(f"Current Location\nLatitude: {lat:.6f}\nLongitude: {lon:.6f}\nAccuracy: {data.get('accuracy', '--')} m\nUpdated: {data['timestamp']}\nhttps://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=16/{lat}/{lon}")
    except Exception:
        await update.message.reply_text("No current location is available.")


@authorized
async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        d = await api("GET", "/api/tracking/status")
        await update.message.reply_text(f"Tracking: {'ON' if d['tracking_enabled'] else 'OFF'}\nLast GPS update: {d.get('last_update') or '--'}\nAccuracy: {d.get('gps_accuracy') or '--'} m\nBattery: {d.get('battery') if d.get('battery') is not None else '--'}%\nDevice: authorized device\nNetwork: {d['network_status']}")
    except Exception:
        await update.message.reply_text("Tracker status is temporarily unavailable.")


@authorized
async def toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    enabled = update.message.text == "/track_on"
    try:
        await api("POST", "/api/tracking/" + ("start" if enabled else "stop"))
        await update.message.reply_text(f"Tracking {'enabled' if enabled else 'disabled'}.")
    except Exception:
        await update.message.reply_text("Could not change tracking state.")


@authorized
async def history(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        rows = await api("GET", "/api/location/history?limit=5")
        text = "Last locations:\n" + "\n".join(f"{i}. {r['timestamp']} — {r['latitude']:.6f}, {r['longitude']:.6f}" for i, r in enumerate(rows, 1))
        await update.message.reply_text(text or "No location history is available.")
    except Exception:
        await update.message.reply_text("Location history is temporarily unavailable.")


def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", start))
    app.add_handler(CommandHandler("location", location))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler(["track_on", "track_off"], toggle))
    app.add_handler(CommandHandler("history", history))
    app.run_polling()


if __name__ == "__main__":
    main()
