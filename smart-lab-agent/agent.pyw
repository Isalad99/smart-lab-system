import sys
import os
import ctypes
import psutil
import json
import socket
import uuid
import time
import requests
import pygetwindow as gw
from datetime import datetime
from agent_outbox import AgentOutbox
from agent_policy import (
    DEFAULT_FALLBACK_RULES,
    find_process_match,
    find_window_match,
    normalize_rules,
)
from agent_violation import (
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_WARNING_SECONDS,
    ViolationState,
)
from agent_cleanup import SessionCleanupManager


# Force Windows to load the Qt DLLs bundled with this executable. This avoids
# importing an incompatible Qt6Widgets.dll from another application on PATH.
_QT_DLL_DIRECTORY_HANDLE = None
_QT_DLL_HANDLES = []


def _prepare_qt_dll_search_path():
    global _QT_DLL_DIRECTORY_HANDLE

    if sys.platform != "win32":
        return

    if getattr(sys, "frozen", False):
        qt_bin = os.path.join(sys._MEIPASS, "PyQt6", "Qt6", "bin")
    else:
        import PyQt6
        qt_bin = os.path.join(os.path.dirname(PyQt6.__file__), "Qt6", "bin")

    if os.path.isdir(qt_bin):
        _QT_DLL_DIRECTORY_HANDLE = os.add_dll_directory(qt_bin)
        os.environ["PATH"] = qt_bin + os.pathsep + os.environ.get("PATH", "")

        # Explicitly preload the bundled Qt stack by absolute path. A Qt DLL
        # with the same name in the executable directory can otherwise win
        # over the directory added above on some Windows configurations.
        for dll_name in (
            "concrt140.dll",
            "msvcp140.dll",
            "msvcp140_1.dll",
            "msvcp140_2.dll",
            "msvcp140_atomic_wait.dll",
            "vcruntime140.dll",
            "vcruntime140_1.dll",
            "Qt6Core.dll",
            "Qt6Gui.dll",
            "Qt6Widgets.dll",
        ):
            dll_path = os.path.join(qt_bin, dll_name)
            if os.path.isfile(dll_path):
                _QT_DLL_HANDLES.append(ctypes.WinDLL(dll_path))


_prepare_qt_dll_search_path()

from PyQt6.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QPushButton, QFrame,
                             QGraphicsDropShadowEffect, QMessageBox, QDialog)
from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtGui import QFont, QColor

# Hugging Face Space อาจ sleep อยู่ — retry ให้อัตโนมัติ
def post_with_retry(url, data=None, json_data=None, retries=3, timeout=15):
    for attempt in range(retries):
        try:
            if json_data:
                return requests.post(url, json=json_data, timeout=timeout)
            return requests.post(url, data=data, timeout=timeout)
        except requests.exceptions.ConnectionError:
            if attempt < retries - 1:
                time.sleep(3)
        except requests.exceptions.Timeout:
            if attempt < retries - 1:
                time.sleep(2)
    return None


def response_detail(response):
    """Return a safe API detail without exposing a raw response body."""
    if response is None:
        return ""
    try:
        payload = response.json()
    except (ValueError, AttributeError):
        return ""
    if isinstance(payload, dict):
        return str(payload.get("detail", ""))
    return ""


# ── CONFIG ────────────────────────────────────────────────────────────────────
API_URL    = os.getenv("SMART_LAB_API_URL", "https://h0sh1na-smart-lab-backend.hf.space").rstrip("/")
LAB_CODE   = os.getenv("SMART_LAB_CODE", "LAB01")
DEBUG_MODE = os.getenv("SMART_LAB_AGENT_DEBUG", "1").strip().lower() in {"1", "true", "yes", "on"}
_cleanup_default = "1" if getattr(sys, "frozen", False) else "0"
SESSION_CLEANUP_ENABLED = os.getenv(
    "SMART_LAB_SESSION_CLEANUP",
    _cleanup_default,
).strip().lower() in {"1", "true", "yes", "on"}
DEVICE_NAME = socket.gethostname()
DEVICE_MAC  = ':'.join(f'{byte:02x}' for byte in uuid.getnode().to_bytes(6, 'big'))

try:
    POLICY_REFRESH_SECONDS = max(
        30,
        int(os.getenv("SMART_LAB_POLICY_REFRESH_SECONDS", "60")),
    )
except ValueError:
    POLICY_REFRESH_SECONDS = 60

IGNORE_SYSTEM_APPS = [
    "Taskbar", "Program Manager", "Settings",
    "Windows Default Lock Screen", "Search",
]


# ── Violation Dialog ──────────────────────────────────────────────────────────
class ViolationDialog(QDialog):
    def __init__(
        self,
        reason,
        *,
        attempt=DEFAULT_MAX_ATTEMPTS,
        max_attempts=DEFAULT_MAX_ATTEMPTS,
        allow_grace=False,
        warning_seconds=DEFAULT_WARNING_SECONDS,
        parent=None,
    ):
        super().__init__(parent)
        self.allow_grace = bool(allow_grace)
        self.left = max(1, int(warning_seconds))
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Dialog
        )
        self.setStyleSheet("""
            QDialog { background-color: #fef2f2; border: 3px solid #ef4444; border-radius: 15px; }
            QLabel  { border: none; }
        """)
        self.setFixedSize(600, 330 if self.allow_grace else 260)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(10)

        title = QLabel(
            "⚠️ ตรวจพบโปรแกรมที่ไม่อนุญาต"
            if self.allow_grace
            else "🚫 หมดสิทธิ์ขอโอกาส"
        )
        title.setFont(QFont("Segoe UI", 22, QFont.Weight.Bold))
        title.setStyleSheet("color: #dc2626;")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        reason_lbl = QLabel(f"สาเหตุ: {reason}")
        reason_lbl.setFont(QFont("Segoe UI", 14))
        reason_lbl.setStyleSheet("color: #7f1d1d; margin-top: 10px;")
        reason_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        reason_lbl.setWordWrap(True)

        attempt_lbl = QLabel(
            f"การเตือนครั้งที่ {attempt} จาก {max_attempts}"
            if self.allow_grace
            else f"ตรวจพบซ้ำครบครั้งที่ {attempt} จาก {max_attempts}"
        )
        attempt_lbl.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        attempt_lbl.setStyleSheet("color: #7f1d1d;")
        attempt_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.countdown_lbl = QLabel()
        self.countdown_lbl.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        self.countdown_lbl.setStyleSheet("color: #ef4444; margin-top: 20px;")
        self.countdown_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)

        layout.addWidget(title)
        layout.addWidget(reason_lbl)
        layout.addWidget(attempt_lbl)
        layout.addWidget(self.countdown_lbl)

        if self.allow_grace:
            self.countdown_lbl.setText(
                f"กรุณาปิดโปรแกรม หรือกดขอโอกาสภายใน {self.left} วินาที"
            )
            chance_btn = QPushButton("ขอโอกาส")
            chance_btn.setCursor(Qt.CursorShape.PointingHandCursor)
            chance_btn.setStyleSheet("""
                QPushButton {
                    background-color: #f59e0b; color: white; border-radius: 8px;
                    font-family: 'Segoe UI'; font-size: 14px; font-weight: bold;
                    padding: 11px; border: none;
                }
                QPushButton:hover { background-color: #fbbf24; }
                QPushButton:pressed { background-color: #d97706; }
            """)
            chance_btn.clicked.connect(self.accept)
            layout.addWidget(chance_btn)
        else:
            self.countdown_lbl.setText(
                f"ระบบจะปิด Session ใน {self.left} วินาที..."
            )

        self.timer = QTimer(self)
        self.timer.timeout.connect(self._tick)
        self.timer.start(1000)

        # center on screen
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.center() - self.rect().center())

    def _tick(self):
        self.left -= 1
        if self.allow_grace:
            self.countdown_lbl.setText(
                f"กรุณาปิดโปรแกรม หรือกดขอโอกาสภายใน {self.left} วินาที"
            )
        else:
            self.countdown_lbl.setText(f"ระบบจะปิด Session ใน {self.left} วินาที...")
        if self.left <= 0:
            self.timer.stop()
            if self.allow_grace:
                self.reject()
            else:
                self.accept()


# ── SessionInfoBar ────────────────────────────────────────────────────────────
class SessionInfoBar(QWidget):
    def __init__(self, email, overlay, session_id):
        super().__init__()
        self.email      = email
        self.overlay    = overlay
        self.session_id = session_id
        self._init_ui()

    def _init_ui(self):
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(340, 140)

        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - 360, 40)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(10, 10, 10, 10)

        self.container = QFrame()
        self.container.setStyleSheet("""
            QFrame {
                background-color: rgba(15, 23, 42, 230);
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 30);
            }
        """)

        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(20)
        shadow.setYOffset(5)
        shadow.setColor(QColor(0, 0, 0, 150))
        self.container.setGraphicsEffect(shadow)

        inner = QVBoxLayout(self.container)
        inner.setContentsMargins(20, 15, 20, 15)
        inner.setSpacing(8)

        self.user_label = QLabel(f"👤  {self.email}")
        self.user_label.setStyleSheet(
            "color: #cbd5e1; font-family: 'Segoe UI'; font-size: 13px; border: none; background: transparent;"
        )

        self.status_label = QLabel("●  กำลังตรวจสอบการใช้งาน")
        self.status_label.setStyleSheet(
            "color: #22c55e; font-family: 'Segoe UI'; font-size: 15px; font-weight: bold; border: none; background: transparent;"
        )

        self.logout_btn = QPushButton("จบการทำงาน")
        self.logout_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.logout_btn.setStyleSheet("""
            QPushButton {
                background-color: #ef4444; color: white; border-radius: 8px;
                font-family: 'Segoe UI'; font-size: 13px; font-weight: bold;
                padding: 8px; border: none; margin-top: 4px;
            }
            QPushButton:hover   { background-color: #f87171; }
            QPushButton:pressed { background-color: #b91c1c; }
        """)
        self.logout_btn.clicked.connect(self._confirm_logout)

        inner.addWidget(self.user_label)
        inner.addWidget(self.status_label)
        inner.addWidget(self.logout_btn)
        outer.addWidget(self.container)

    def _confirm_logout(self):
        # ใช้ QDialog() ไม่มี parent — Tool window เป็น parent ไม่ได้ dialog จะไม่รับ event
        dlg = QDialog()
        dlg.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.FramelessWindowHint  |
            Qt.WindowType.Dialog
        )
        dlg.setFixedSize(360, 180)
        dlg.setStyleSheet("background-color: #1e293b; border-radius: 16px;")

        layout = QVBoxLayout(dlg)
        layout.setContentsMargins(28, 24, 28, 20)
        layout.setSpacing(10)

        title = QLabel("จบการใช้งาน?")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet(
            "color: #f1f5f9; font-family: 'Segoe UI'; font-size: 16px; font-weight: bold; border: none; background: transparent;"
        )

        sub = QLabel("ระบบจะบันทึกสถิติและล็อกเอาท์")
        sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sub.setStyleSheet(
            "color: #64748b; font-family: 'Segoe UI'; font-size: 12px; border: none; background: transparent;"
        )

        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        cancel_btn = QPushButton("ยังอยู่ต่อ")
        cancel_btn.setStyleSheet("""
            QPushButton {
                background-color: #334155; color: #cbd5e1; border-radius: 8px;
                font-family: 'Segoe UI'; font-size: 13px; font-weight: bold;
                padding: 10px; border: none;
            }
            QPushButton:hover { background-color: #475569; }
        """)
        cancel_btn.clicked.connect(dlg.reject)

        confirm_btn = QPushButton("ใช่ จบเลย")
        confirm_btn.setStyleSheet("""
            QPushButton {
                background-color: #ef4444; color: white; border-radius: 8px;
                font-family: 'Segoe UI'; font-size: 13px; font-weight: bold;
                padding: 10px; border: none;
            }
            QPushButton:hover { background-color: #f87171; }
        """)
        confirm_btn.clicked.connect(dlg.accept)

        btn_row.addWidget(cancel_btn)
        btn_row.addWidget(confirm_btn)

        layout.addWidget(title)
        layout.addWidget(sub)
        layout.addStretch()
        layout.addLayout(btn_row)

        screen = QApplication.primaryScreen().geometry()
        dlg.move(screen.center() - dlg.rect().center())

        if dlg.exec() == QDialog.DialogCode.Accepted:
            self.trigger_logout()

    def trigger_logout(self, reason: str = None, show_dialog: bool = True):
        if reason and show_dialog:
            violation_state = getattr(self.overlay.agent, "violation_state", None)
            attempt = getattr(violation_state, "attempts", DEFAULT_MAX_ATTEMPTS)
            max_attempts = getattr(
                violation_state,
                "max_attempts",
                DEFAULT_MAX_ATTEMPTS,
            )
            dlg = ViolationDialog(
                reason,
                attempt=max(attempt, DEFAULT_MAX_ATTEMPTS),
                max_attempts=max_attempts,
                allow_grace=False,
            )
            dlg.exec()
        self.overlay.agent.stop_and_send_logs(
            self.session_id,
            end_reason="violation" if reason else "logout",
        )
        self.hide()
        self.overlay.reset_and_show()


# ── LoginOverlay ──────────────────────────────────────────────────────────────
class LoginOverlay(QWidget):
    def __init__(self, agent):
        super().__init__()
        self.agent = agent
        self.agent.set_ui_references(self)
        self.is_authenticated = False
        self._init_ui()

        self.focus_timer = QTimer()
        self.focus_timer.timeout.connect(self._lock_focus)
        self.focus_timer.start(1000)

    def _init_ui(self):
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint
        )
        self.setGeometry(QApplication.primaryScreen().geometry())
        self.setStyleSheet("background-color: #0f172a;")

        main = QVBoxLayout(self)
        main.addStretch()
        row = QHBoxLayout()
        row.addStretch()

        card = QFrame()
        card.setFixedSize(450, 580)
        card.setStyleSheet("background-color: #ffffff; border-radius: 25px;")

        cl = QVBoxLayout(card)
        cl.setContentsMargins(45, 45, 45, 45)

        title = QLabel("Smart Lab Access")
        title.setFont(QFont("Segoe UI", 24, QFont.Weight.Bold))
        title.setStyleSheet("color: #1e293b; border: none;")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        cl.addWidget(title)

        self.error_label = QLabel("")
        self.error_label.setFont(QFont("Segoe UI", 11))
        self.error_label.setStyleSheet(
            "color: #dc2626; background-color: #fee2e2; padding: 10px; border-radius: 8px; margin-top: 15px;"
        )
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.error_label.hide()
        cl.addWidget(self.error_label)

        cl.addWidget(QLabel("Email", styleSheet="color: #475569; font-weight: bold; margin-top: 20px; border: none; font-family: 'Segoe UI';"))
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("name@bumail.net")
        self.email_input.setStyleSheet(self._input_style())
        self.email_input.returnPressed.connect(lambda: self.pass_input.setFocus())
        cl.addWidget(self.email_input)

        cl.addWidget(QLabel("Password", styleSheet="color: #475569; font-weight: bold; margin-top: 15px; border: none; font-family: 'Segoe UI';"))
        self.pass_input = QLineEdit()
        self.pass_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.pass_input.setStyleSheet(self._input_style())
        self.pass_input.returnPressed.connect(self.handle_login)  # Enter → login
        cl.addWidget(self.pass_input)

        self.login_btn = QPushButton("ปลดล็อกเข้าใช้งาน")
        self.login_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.login_btn.setStyleSheet("""
            QPushButton {
                background-color: #2563eb; color: white; padding: 15px; border-radius: 10px;
                font-weight: bold; font-family: 'Segoe UI'; font-size: 15px; margin-top: 25px; border: none;
            }
            QPushButton:hover    { background-color: #1d4ed8; }
            QPushButton:disabled { background-color: #94a3b8; color: #f1f5f9; }
        """)
        self.login_btn.clicked.connect(self.handle_login)
        cl.addWidget(self.login_btn)

        row.addWidget(card)
        row.addStretch()
        main.addLayout(row)
        main.addStretch()

    def _input_style(self) -> str:
        return """
            QLineEdit {
                padding: 12px; border: 2px solid #e2e8f0; border-radius: 10px;
                font-size: 16px; color: #1e293b; background-color: #f8fafc; font-family: 'Segoe UI';
            }
            QLineEdit:focus { border: 2px solid #3b82f6; background-color: #ffffff; }
        """

    def _lock_focus(self):
        if not self.is_authenticated:
            if not self.isFullScreen():
                self.showFullScreen()
            self.raise_()
            self.activateWindow()

    def reset_and_show(self):
        self.is_authenticated = False
        self.email_input.clear()
        self.pass_input.clear()
        self.error_label.hide()
        self.login_btn.setText("ปลดล็อกเข้าใช้งาน")
        self.login_btn.setEnabled(True)
        self.showFullScreen()
        self.raise_()
        self.activateWindow()

    def _show_error(self, msg: str):
        self.error_label.setText(f"⚠️ {msg}")
        self.error_label.show()

    def handle_login(self):
        email    = self.email_input.text().strip()
        password = self.pass_input.text()

        if not email or not password:
            self._show_error("กรุณากรอกข้อมูลให้ครบถ้วน")
            return

        self.error_label.hide()
        self.login_btn.setText("⏳ กำลังตรวจสอบ...")
        self.login_btn.setEnabled(False)
        QApplication.processEvents()

        try:
            res = post_with_retry(f"{API_URL}/login", data={"username": email, "password": password})
            if not res:
                self._show_error("ไม่สามารถเชื่อมต่อ Server ได้ กรุณาตรวจสอบอินเทอร์เน็ต")
                return

            if res.status_code == 200:
                # Flush a previous session's durable requests before trying to
                # claim this machine for another user.
                self.agent.flush_outbox(limit=5)
                client_session_id = self.agent.get_or_create_session_attempt(email)
                session_data = {
                    "email": email,
                    "lab_code": LAB_CODE,
                    "device": DEVICE_NAME,
                    "device_mac": DEVICE_MAC,
                    "client_session_id": client_session_id,
                }
                session_res = post_with_retry(
                    f"{API_URL}/agent/start-session",
                    data=session_data,
                )

                # A very old local attempt can refer to a session that the
                # Backend already closed during stale cleanup. Start a fresh
                # idempotency key once in that specific case.
                if session_res and session_res.status_code == 409:
                    detail = response_detail(session_res).lower()
                    if "session request is already closed" in detail:
                        self.agent.discard_session_attempt(client_session_id)
                        client_session_id = self.agent.get_or_create_session_attempt(email)
                        session_data["client_session_id"] = client_session_id
                        session_res = post_with_retry(
                            f"{API_URL}/agent/start-session",
                            data=session_data,
                        )

                if session_res and session_res.status_code == 200:
                    session_id = session_res.json()["session_id"]
                    self.agent.confirm_session_attempt(client_session_id)
                    self.is_authenticated = True
                    self.hide()
                    self.info_bar = SessionInfoBar(email, self, session_id)
                    self.info_bar.show()
                    self.agent.start_monitoring(session_id, self.info_bar)
                else:
                    status = session_res.status_code if session_res else "Timeout"
                    print(f"Session Error [{status}]: {session_res.text if session_res else '-'}")
                    if status == 409:
                        self._show_error("ผู้ใช้หรือเครื่องนี้มี Session ที่ยังไม่จบอยู่")
                    else:
                        self._show_error("ไม่สามารถสร้าง Session ใหม่ได้")
            elif res.status_code == 403:
                self._show_error("บัญชีนี้รอการอนุมัติจาก Admin")
            else:
                self._show_error("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
        except Exception as e:
            self._show_error(f"เกิดข้อผิดพลาดในการเชื่อมต่อ: {e}")
        finally:
            self.login_btn.setText("ปลดล็อกเข้าใช้งาน")
            self.login_btn.setEnabled(True)


# ── SmartLabAgent ─────────────────────────────────────────────────────────────
class SmartLabAgent:
    def __init__(self):
        try:
            self.outbox = AgentOutbox()
            print(f"Agent outbox: {self.outbox.path}")
        except Exception as e:
            # Keep the UI available, but make the degraded delivery mode
            # visible in the log instead of silently losing telemetry.
            self.outbox = None
            print(f"Agent outbox unavailable: {e}")

        self.usage_segments = []
        self.current_activity_name = None
        self.current_activity_started_at = None
        self.current_session_id = None
        self.info_bar       = None
        self.overlay        = None
        self.policy_rules = []
        self.policy_version = None
        self.policy_source = None
        self.seen_process_ids = set()
        self.violation_reported = False
        self.violation_state = ViolationState()
        self.violation_dialog_active = False
        self.session_cleanup = None
        self.monitor_timer  = QTimer()
        self.monitor_timer.timeout.connect(self.track_usage)
        self.heartbeat_timer = QTimer()
        self.heartbeat_timer.timeout.connect(self.send_heartbeat)
        self.policy_timer = QTimer()
        self.policy_timer.timeout.connect(self.refresh_policy)

    def get_or_create_session_attempt(self, email):
        if self.outbox is None:
            return uuid.uuid4().hex
        return self.outbox.get_or_create_session_attempt(
            email=email,
            lab_code=LAB_CODE,
            device=DEVICE_NAME,
            device_mac=DEVICE_MAC,
        )

    def confirm_session_attempt(self, client_session_id):
        if self.outbox is not None:
            self.outbox.clear_session_attempt(client_session_id)

    def discard_session_attempt(self, client_session_id):
        if self.outbox is not None:
            self.outbox.clear_session_attempt(client_session_id)

    def _queue_outbox(self, kind, payload, session_id=None, event_id=None):
        if self.outbox is None:
            return False
        try:
            self.outbox.enqueue(
                kind=kind,
                payload=payload,
                session_id=session_id,
                event_id=event_id,
            )
            return True
        except Exception as e:
            print(f"บันทึกข้อมูลลง local outbox ไม่ได้: {e}")
            return False

    def flush_outbox(self, limit=3):
        """Deliver queued telemetry and keep failed items for a later retry."""
        if self.outbox is None:
            return 0

        endpoints = {
            "usage": "/agent/log-usage",
            "violation": "/agent/log-violation",
            "end_session": "/agent/end-session",
        }
        sent = 0
        for item in self.outbox.pending(limit=limit):
            endpoint = endpoints.get(item["kind"])
            if not endpoint:
                self.outbox.mark_failed(item["event_id"], "Unknown outbox request type.", 300)
                continue

            try:
                payload = json.loads(item["payload"])
                response = post_with_retry(
                    f"{API_URL}{endpoint}",
                    data=payload,
                    retries=1,
                    timeout=10,
                )
                if response is not None and 200 <= response.status_code < 300:
                    self.outbox.mark_sent(item["event_id"])
                    sent += 1
                    continue

                status = response.status_code if response is not None else "offline"
                detail = response_detail(response)
                self.outbox.mark_failed(
                    item["event_id"],
                    f"{status}: {detail}".strip(),
                    60 if response is not None else None,
                )
            except Exception as e:
                self.outbox.mark_failed(item["event_id"], str(e))

        if sent:
            print(f"ส่งข้อมูลจาก local outbox สำเร็จ {sent} รายการ")
        return sent

    def set_ui_references(self, overlay):
        self.overlay = overlay

    def _set_policy(self, raw_rules, version, source):
        rules = normalize_rules(raw_rules)
        if not rules:
            return False

        changed = rules != self.policy_rules or version != self.policy_version
        self.policy_rules = rules
        self.policy_version = version or "unknown"
        self.policy_source = source
        if changed:
            # Re-check already-running processes when an administrator changes
            # the policy during an active session.
            self.seen_process_ids.clear()
        return True

    def _load_cached_policy(self):
        if self.outbox is None:
            return False

        try:
            cached = self.outbox.load_policy_cache("blacklist")
        except Exception as e:
            print(f"อ่าน Blacklist cache ไม่ได้: {e}")
            return False

        if not cached:
            return False

        if self._set_policy(cached.get("data"), cached.get("version"), "cache"):
            print(f"ใช้ Blacklist จาก cache เวอร์ชัน {self.policy_version}")
            return True
        return False

    def _use_fallback_policy(self):
        self._set_policy(DEFAULT_FALLBACK_RULES, "fallback", "fallback")
        print("ใช้ Blacklist fallback ในตัว Agent")

    def fetch_policy(self):
        """Load a non-empty policy and retain the last known-good copy on error."""

        try:
            response = requests.get(f"{API_URL}/agent/policy", timeout=10)
            if response.status_code != 200:
                raise RuntimeError(f"HTTP {response.status_code}")

            payload = response.json()
            rules = payload.get("data") if isinstance(payload, dict) else None
            version = payload.get("version") if isinstance(payload, dict) else None
            if not self._set_policy(rules, version, "backend"):
                raise ValueError("Backend returned an empty or invalid policy")

            if self.outbox is not None:
                self.outbox.save_policy_cache(
                    "blacklist",
                    {"version": self.policy_version, "data": self.policy_rules},
                    version=self.policy_version,
                )
            print(
                f"ดึง Blacklist สำเร็จ {len(self.policy_rules)} รายการ "
                f"(เวอร์ชัน {self.policy_version})"
            )
            return True
        except Exception as e:
            print(f"ดึง Blacklist ไม่ได้: {e}")
            if self.policy_rules:
                print(f"ใช้ Blacklist เดิมจาก {self.policy_source}")
            else:
                self._use_fallback_policy()
            return False

    def refresh_policy(self):
        self.fetch_policy()

    def start_monitoring(self, session_id, info_bar):
        self.current_session_id = session_id
        self.info_bar = info_bar
        self.usage_segments = []
        self.current_activity_name = None
        self.current_activity_started_at = None
        self.policy_rules = []
        self.policy_version = None
        self.policy_source = None
        self.seen_process_ids.clear()
        self.violation_reported = False
        self.violation_state.reset()
        self.violation_dialog_active = False
        self.session_cleanup = None
        if SESSION_CLEANUP_ENABLED:
            try:
                self.session_cleanup = SessionCleanupManager(
                    protected_pid=os.getpid(),
                )
                print("เปิดใช้งาน Session Cleanup สำหรับ Session นี้")
            except Exception as e:
                # Cleanup must never prevent a user from starting a Session.
                self.session_cleanup = None
                print(f"เตรียม Session Cleanup ไม่สำเร็จ: {e}")
        self._load_cached_policy()
        self.fetch_policy()
        self.monitor_timer.start(5000)
        self.heartbeat_timer.start(30000)
        self.policy_timer.start(POLICY_REFRESH_SECONDS * 1000)

    def send_heartbeat(self):
        if not self.current_session_id:
            return

        try:
            response = post_with_retry(
                f"{API_URL}/agent/heartbeat",
                data={
                    "session_id": self.current_session_id,
                    "device_mac": DEVICE_MAC,
                },
                retries=1,
                timeout=10,
            )
            if response and response.status_code == 409:
                print("Session ไม่ active แล้ว กำลังกลับไปหน้า Login")
                self.heartbeat_timer.stop()
                if self.info_bar:
                    self.info_bar.trigger_logout()
            elif response and 200 <= response.status_code < 300:
                # Heartbeat is also the reconnect signal for the local
                # outbox. Do not spend time flushing while the server is down.
                self.flush_outbox(limit=3)
        except Exception as e:
            print(f"ส่ง heartbeat ไม่ได้: {e}")

    def _close_current_activity(self, ended_at=None):
        if not self.current_activity_name or not self.current_activity_started_at:
            return

        ended_at = ended_at or datetime.now()
        duration = max(
            0,
            int((ended_at - self.current_activity_started_at).total_seconds()),
        )
        if duration > 0:
            segment = {
                "event_id": uuid.uuid4().hex,
                "name": self.current_activity_name,
                "started_at": self.current_activity_started_at.isoformat(timespec="seconds"),
                "ended_at": ended_at.isoformat(timespec="seconds"),
                "duration": duration,
            }
            self.usage_segments.append(segment)
            self._queue_outbox(
                kind="usage",
                payload={
                    "session_id": self.current_session_id,
                    "usage_data": json.dumps([segment], ensure_ascii=False),
                    "device_name": DEVICE_NAME,
                    "device_mac": DEVICE_MAC,
                },
                session_id=self.current_session_id,
                event_id=segment["event_id"],
            )
            print(f"บันทึก: [{self.current_activity_name}] {duration} วินาที")

        self.current_activity_name = None
        self.current_activity_started_at = None

    def _track_active_activity(self, app_name, observed_at):
        if not app_name or app_name in IGNORE_SYSTEM_APPS:
            self._close_current_activity(observed_at)
            return

        if app_name == self.current_activity_name:
            return

        self._close_current_activity(observed_at)
        self.current_activity_name = app_name
        self.current_activity_started_at = observed_at

    def _finalize_violation(self, context, show_dialog=True):
        """Record the final violation and close the current lab session."""
        self.report_violation(
            context["program_name"],
            context["reason"],
            process_name=context.get("process_name"),
            exe_path=context.get("exe_path"),
            window_title=context.get("window_title"),
            detection_source=context.get("detection_source"),
        )
        if self.info_bar:
            self.info_bar.trigger_logout(
                reason=context["reason"],
                show_dialog=show_dialog,
            )

    def _handle_violation_detection(self, context):
        """Give two five-minute chances before enforcing the third detection."""
        if (
            not self.current_session_id
            or self.violation_reported
            or self.violation_dialog_active
        ):
            return

        now = datetime.now()
        if self.violation_state.clear_expired_grace(now):
            # The original process may already be in seen_process_ids. Clear it
            # so the five-minute recheck inspects the process again.
            self.seen_process_ids.clear()

        if self.violation_state.is_grace_active(now):
            return

        attempt = self.violation_state.register_detection(now)
        if attempt is None:
            return

        if attempt.must_terminate:
            final_context = dict(context)
            final_context["reason"] = (
                f"{context['reason']} (ตรวจพบซ้ำครั้งที่ {attempt.number})"
            )
            self.monitor_timer.stop()
            self.violation_dialog_active = True
            try:
                self._finalize_violation(final_context, show_dialog=True)
            finally:
                self.violation_dialog_active = False
            return

        self.violation_dialog_active = True
        self.monitor_timer.stop()
        chance_requested = False
        try:
            dialog = ViolationDialog(
                context["reason"],
                attempt=attempt.number,
                max_attempts=self.violation_state.max_attempts,
                allow_grace=True,
                warning_seconds=DEFAULT_WARNING_SECONDS,
            )
            chance_requested = dialog.exec() == QDialog.DialogCode.Accepted
        except Exception as exc:
            # If the warning cannot be shown, fail closed instead of leaving
            # the session running with its monitor stopped.
            print(f"แสดงหน้าต่างแจ้งเตือนไม่ได้: {exc}")
        finally:
            self.violation_dialog_active = False

        if chance_requested:
            grace_until = self.violation_state.grant_grace(datetime.now())
            self.seen_process_ids.clear()
            print(
                f"ให้โอกาสครั้งที่ {attempt.number} ถึง "
                f"{grace_until.isoformat(timespec='seconds')}"
            )
            if self.current_session_id and not self.violation_reported:
                self.monitor_timer.start(5000)
            return

        # The five-second warning expired without a request for more time.
        # Treat that as a refusal and enforce the policy immediately.
        timeout_context = dict(context)
        timeout_context["reason"] = (
            f"{context['reason']} (ไม่ขอโอกาสภายในเวลาที่กำหนด)"
        )
        self._finalize_violation(timeout_context, show_dialog=False)

    def report_violation(
        self,
        program_name,
        reason,
        *,
        process_name=None,
        exe_path=None,
        window_title=None,
        detection_source=None,
    ):
        if self.violation_reported or not self.current_session_id:
            return

        event_id = uuid.uuid4().hex
        payload = {
            "session_id": self.current_session_id,
            "program_name": program_name,
            "reason": reason,
            "action_taken": "logout",
            "event_id": event_id,
            "process_name": process_name,
            "exe_path": exe_path,
            "window_title": window_title,
            "detection_source": detection_source,
        }

        if self._queue_outbox(
            kind="violation",
            payload=payload,
            session_id=self.current_session_id,
            event_id=event_id,
        ):
            # The item is durable even when this immediate delivery fails.
            self.violation_reported = True
            self.flush_outbox(limit=1)
            return

        # Degraded fallback for an Agent that cannot initialize its local
        # storage. Keep the old direct request path, but only mark the
        # violation as reported after the server acknowledges it.
        try:
            response = post_with_retry(
                f"{API_URL}/agent/log-violation",
                data=payload,
            )
            print(f"Violation response: {response.status_code if response else 'Timeout'}")
            if response is not None and 200 <= response.status_code < 300:
                self.violation_reported = True
        except Exception as e:
            print(f"บันทึก violation ไม่ได้: {e}")

    def _find_new_process_match(self):
        """Inspect each process fully only when its PID first appears."""

        current_process_ids = set()
        has_path_rules = any(
            rule["match_type"] == "exe_path" for rule in self.policy_rules
        )

        for proc in psutil.process_iter(["pid", "name"]):
            try:
                process_id = proc.info.get("pid")
                if process_id is None:
                    continue
                current_process_ids.add(process_id)
                if process_id in self.seen_process_ids:
                    continue

                process_name = (proc.info.get("name") or "").strip()
                matched_rule = find_process_match(self.policy_rules, process_name)
                exe_path = None
                if matched_rule is None and has_path_rules:
                    try:
                        exe_path = proc.exe()
                    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                        exe_path = None
                    matched_rule = find_process_match(
                        self.policy_rules,
                        process_name,
                        exe_path,
                    )

                if matched_rule is not None:
                    detection_source = (
                        "exe_path"
                        if matched_rule["match_type"] == "exe_path"
                        else "process_name"
                    )
                    return process_name, exe_path, matched_rule, detection_source
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        self.seen_process_ids = current_process_ids
        return None

    def track_usage(self):
        try:
            if not self.current_session_id or self.violation_dialog_active:
                return

            now = datetime.now()
            if self.violation_state.clear_expired_grace(now):
                # A running forbidden process was intentionally skipped during
                # the grace period, so it must be checked again now.
                self.seen_process_ids.clear()

            if self.violation_state.is_grace_active(now):
                return

            # ── ด่านที่ 1: ตรวจ Process ใหม่จากชื่อและ Path ────────────────
            process_match = self._find_new_process_match()
            if process_match is not None:
                process_name, exe_path, matched_rule, detection_source = process_match
                rule_name = matched_rule.get("app_name") or matched_rule.get("match_value")
                reason = f"ไม่อนุญาตให้เปิดแอป: {rule_name}"
                self._handle_violation_detection(
                    {
                        "program_name": process_name,
                        "reason": reason,
                        "process_name": process_name,
                        "exe_path": exe_path,
                        "window_title": None,
                        "detection_source": detection_source,
                    }
                )
                return

            # ── ด่านที่ 2: ตรวจจาก Active Window title ──────────────────────
            active_win = gw.getActiveWindow()
            if not active_win or not active_win.title:
                self._close_current_activity(datetime.now())
                return

            raw_title  = active_win.title.strip()
            window_match = find_window_match(self.policy_rules, raw_title)
            if window_match is not None:
                rule_name = window_match.get("app_name") or window_match.get("match_value")
                reason = f"ไม่อนุญาตให้เปิดใช้งาน: {rule_name}"
                self._handle_violation_detection(
                    {
                        "program_name": raw_title,
                        "reason": reason,
                        "process_name": None,
                        "exe_path": None,
                        "window_title": raw_title,
                        "detection_source": "window_title",
                    }
                )
                return

            # ── บันทึกสถิติการใช้งานปกติ ────────────────────────────────────
            # ตัดส่วนขยายออก เช่น "Google - Brave" → "Brave"
            app_name = raw_title.split('-')[-1].strip() if '-' in raw_title else raw_title

            self._track_active_activity(app_name, datetime.now())

        except Exception:
            pass

    def _cleanup_session(self):
        cleanup = self.session_cleanup
        self.session_cleanup = None
        if cleanup is None:
            return

        try:
            report = cleanup.cleanup()
            print(
                "Session Cleanup: "
                f"ปิดโปรแกรม {report.closed_processes} รายการ, "
                f"บังคับปิด {report.force_closed_processes} รายการ, "
                f"ล้างข้อมูล Browser {report.removed_browser_items} รายการ, "
                f"ลบไฟล์ใหม่ใน Downloads {report.removed_downloads} รายการ"
            )
            if report.errors:
                print(f"Session Cleanup มีบางส่วนทำไม่สำเร็จ: {', '.join(report.errors)}")
        except Exception as e:
            # Session delivery has already been queued before cleanup starts;
            # an unexpected cleanup error must not interrupt logout.
            print(f"Session Cleanup ล้มเหลว: {e}")

    def stop_and_send_logs(self, session_id, end_reason="logout"):
        self.monitor_timer.stop()
        self.heartbeat_timer.stop()
        self.policy_timer.stop()
        self._close_current_activity(datetime.now())
        summary = list(self.usage_segments)

        print("\n--- บันทึกข้อมูลลง local outbox ---")
        print(f"Data: {summary}")

        if self.outbox is not None:
            # Segments are normally queued as soon as an activity ends. This
            # second enqueue is idempotent and protects segments collected by
            # an older code path before logout.
            for segment in summary:
                self._queue_outbox(
                    kind="usage",
                    payload={
                        "session_id": session_id,
                        "usage_data": json.dumps([segment], ensure_ascii=False),
                        "device_name": DEVICE_NAME,
                        "device_mac": DEVICE_MAC,
                    },
                    session_id=session_id,
                    event_id=segment.get("event_id"),
                )

            self._queue_outbox(
                kind="end_session",
                payload={
                    "session_id": session_id,
                    "end_reason": end_reason,
                },
                session_id=session_id,
                event_id=f"end-session-{session_id}",
            )
            self.flush_outbox(limit=10)
            pending = self.outbox.has_pending_for_session(session_id)
            if pending:
                print("ยังมีข้อมูลรอส่ง จะ retry อัตโนมัติเมื่อ Internet กลับมา")
        else:
            # Degraded fallback for a machine where local storage could not be
            # initialized. This path is intentionally retained for diagnosis.
            if summary:
                try:
                    r = post_with_retry(
                        f"{API_URL}/agent/log-usage",
                        data={
                            "session_id": session_id,
                            "usage_data": json.dumps(summary, ensure_ascii=False),
                            "device_name": DEVICE_NAME,
                            "device_mac": DEVICE_MAC,
                        },
                    )
                    print(f"Server Response: {r.status_code if r else 'Timeout'}")
                except Exception as e:
                    print(f"ส่งข้อมูลไม่ได้: {e}")
            else:
                print("ไม่มีสถิติการใช้งานที่บันทึกได้")

            try:
                end_response = post_with_retry(
                    f"{API_URL}/agent/end-session",
                    data={
                        "session_id": session_id,
                        "end_reason": end_reason,
                    },
                )
                print(f"End session response: {end_response.status_code if end_response else 'Timeout'}")
            except Exception as e:
                print(f"ปิด Session ไม่ได้: {e}")

        self._cleanup_session()
        self.usage_segments = []
        self.current_activity_name = None
        self.current_activity_started_at = None
        self.policy_rules = []
        self.policy_version = None
        self.policy_source = None
        self.seen_process_ids.clear()
        self.violation_state.reset()
        self.violation_dialog_active = False
        self.current_session_id = None

        if not DEBUG_MODE:
            os.system("shutdown /l /f")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    agent_logic  = SmartLabAgent()
    login_screen = LoginOverlay(agent_logic)
    login_screen.show()
    sys.exit(app.exec())
