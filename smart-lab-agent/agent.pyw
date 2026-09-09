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


# ── CONFIG ────────────────────────────────────────────────────────────────────
API_URL    = os.getenv("SMART_LAB_API_URL", "https://h0sh1na-smart-lab-backend.hf.space").rstrip("/")
LAB_CODE   = os.getenv("SMART_LAB_CODE", "LAB01")
DEBUG_MODE = os.getenv("SMART_LAB_AGENT_DEBUG", "1").strip().lower() in {"1", "true", "yes", "on"}
DEVICE_NAME = socket.gethostname()
DEVICE_MAC  = ':'.join(f'{byte:02x}' for byte in uuid.getnode().to_bytes(6, 'big'))

IGNORE_SYSTEM_APPS = [
    "Taskbar", "Program Manager", "Settings",
    "Windows Default Lock Screen", "Search",
]


# ── Violation Dialog ──────────────────────────────────────────────────────────
class ViolationDialog(QDialog):
    def __init__(self, reason, parent=None):
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Dialog
        )
        self.setStyleSheet("""
            QDialog { background-color: #fef2f2; border: 3px solid #ef4444; border-radius: 15px; }
            QLabel  { border: none; }
        """)
        self.setFixedSize(550, 250)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 30, 30, 30)

        title = QLabel("⚠️ ตรวจพบการละเมิดข้อตกลง")
        title.setFont(QFont("Segoe UI", 22, QFont.Weight.Bold))
        title.setStyleSheet("color: #dc2626;")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        reason_lbl = QLabel(f"สาเหตุ: {reason}")
        reason_lbl.setFont(QFont("Segoe UI", 14))
        reason_lbl.setStyleSheet("color: #7f1d1d; margin-top: 10px;")
        reason_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        reason_lbl.setWordWrap(True)

        self.countdown_lbl = QLabel("ระบบจะบังคับปิดเซสชันใน 5 วินาที...")
        self.countdown_lbl.setFont(QFont("Segoe UI", 12, QFont.Weight.Bold))
        self.countdown_lbl.setStyleSheet("color: #ef4444; margin-top: 20px;")
        self.countdown_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)

        layout.addWidget(title)
        layout.addWidget(reason_lbl)
        layout.addWidget(self.countdown_lbl)

        self.left  = 5
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._tick)
        self.timer.start(1000)

        # center on screen
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.center() - self.rect().center())

    def _tick(self):
        self.left -= 1
        self.countdown_lbl.setText(f"ระบบจะบังคับปิดเซสชันใน {self.left} วินาที...")
        if self.left <= 0:
            self.timer.stop()
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

    def trigger_logout(self, reason: str = None):
        if reason:
            dlg = ViolationDialog(reason)
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
                session_res  = post_with_retry(
                    f"{API_URL}/agent/start-session",
                    data={
                        "email": email,
                        "lab_code": LAB_CODE,
                        "device": DEVICE_NAME,
                        "device_mac": DEVICE_MAC,
                    }
                )
                if session_res and session_res.status_code == 200:
                    session_id = session_res.json()["session_id"]
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
        self.usage_segments = []
        self.current_activity_name = None
        self.current_activity_started_at = None
        self.current_session_id = None
        self.info_bar       = None
        self.overlay        = None
        self.forbidden_words = []   # โหลดจาก /admin/blacklist ตอน start_monitoring
        self.violation_reported = False
        self.monitor_timer  = QTimer()
        self.monitor_timer.timeout.connect(self.track_usage)
        self.heartbeat_timer = QTimer()
        self.heartbeat_timer.timeout.connect(self.send_heartbeat)

    def set_ui_references(self, overlay):
        self.overlay = overlay

    def fetch_blacklist(self):
        """โหลด blacklist จาก backend — ถ้าไม่ได้ใช้ fallback list"""
        try:
            # FIX 1: endpoint ที่ถูกต้องคือ /admin/blacklist ไม่ใช่ /blacklist
            res = requests.get(f"{API_URL}/admin/blacklist", timeout=10)
            if res.status_code == 200:
                # FIX 2: backend ส่งกลับเป็น {"data": [...]} ต้อง .get("data") ก่อน
                data = res.json().get("data", [])
                self.forbidden_words = [item.get("app_name", "").lower().strip() for item in data]
                print(f"ดึง Blacklist สำเร็จ: {self.forbidden_words}")
            else:
                print(f"ดึง Blacklist ล้มเหลว (Status: {res.status_code}) ใช้ fallback แทน")
                self._use_fallback_blacklist()
        except Exception as e:
            print(f"ดึง Blacklist ไม่ได้: {e}")
            self._use_fallback_blacklist()

    def _use_fallback_blacklist(self):
        # FIX 3: fallback ต้องมีครบ รวม "star rail" และ "starrail" (ชื่อ process)
        self.forbidden_words = [
            "bittorrent", "cheatengine",
            "genshin", "genshinimpact",
            "star rail", "starrail",       # window title และ process name
        ]

    def start_monitoring(self, session_id, info_bar):
        self.current_session_id = session_id
        self.info_bar = info_bar
        self.usage_segments = []
        self.current_activity_name = None
        self.current_activity_started_at = None
        self.violation_reported = False
        self.fetch_blacklist()
        self.monitor_timer.start(5000)
        self.heartbeat_timer.start(30000)

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
            self.usage_segments.append({
                "name": self.current_activity_name,
                "started_at": self.current_activity_started_at.isoformat(timespec="seconds"),
                "ended_at": ended_at.isoformat(timespec="seconds"),
                "duration": duration,
            })
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

    def report_violation(self, program_name, reason):
        if self.violation_reported or not self.current_session_id:
            return

        self.violation_reported = True
        try:
            response = post_with_retry(
                f"{API_URL}/agent/log-violation",
                data={
                    "session_id": self.current_session_id,
                    "program_name": program_name,
                    "reason": reason,
                    "action_taken": "logout",
                },
            )
            print(f"Violation response: {response.status_code if response else 'Timeout'}")
        except Exception as e:
            print(f"บันทึก violation ไม่ได้: {e}")

    def track_usage(self):
        try:
            # ── ด่านที่ 1: ตรวจจากชื่อ process (.exe) ──────────────────────
            # จับเกมที่มี anti-cheat ซึ่งซ่อน window title ได้
            for proc in psutil.process_iter(['name']):
                try:
                    p_name = (proc.info['name'] or "").lower()
                    for word in self.forbidden_words:
                        if not word:
                            continue
                        # FIX 4: compare ตรงๆ ไม่ตัด space — ป้องกัน "starail" != "starrail"
                        if word.replace(" ", "") in p_name:
                            reason = f"ไม่อนุญาตให้เปิดแอป: {word.title()}"
                            self.report_violation(p_name, reason)
                            if self.info_bar:
                                self.info_bar.trigger_logout(reason=reason)
                            return
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass

            # ── ด่านที่ 2: ตรวจจาก Active Window title ──────────────────────
            active_win = gw.getActiveWindow()
            if not active_win or not active_win.title:
                self._close_current_activity(datetime.now())
                return

            raw_title  = active_win.title.strip()
            title_lower = raw_title.lower()

            for word in self.forbidden_words:
                if not word:
                    continue
                # FIX 4: compare ตรงๆ เช่น "star rail" in "star rail - loading" → True
                if word in title_lower:
                    reason = f"ไม่อนุญาตให้เปิดใช้งาน: {word.title()}"
                    self.report_violation(raw_title, reason)
                    if self.info_bar:
                        self.info_bar.trigger_logout(reason=reason)
                    return

            # ── บันทึกสถิติการใช้งานปกติ ────────────────────────────────────
            # ตัดส่วนขยายออก เช่น "Google - Brave" → "Brave"
            app_name = raw_title.split('-')[-1].strip() if '-' in raw_title else raw_title

            self._track_active_activity(app_name, datetime.now())

        except Exception:
            pass

    def stop_and_send_logs(self, session_id, end_reason="logout"):
        self.monitor_timer.stop()
        self.heartbeat_timer.stop()
        self._close_current_activity(datetime.now())
        summary = self.usage_segments

        print(f"\n--- ส่งข้อมูลไป Backend ---")
        print(f"Data: {summary}")

        if summary:
            try:
                r = post_with_retry(
                    f"{API_URL}/agent/log-usage",
                    data={
                        "session_id": session_id,
                        "usage_data": json.dumps(summary),
                        "device_name": DEVICE_NAME,
                        "device_mac": DEVICE_MAC,
                    }
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
